import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShowReservedSeatingLink } from "@/lib/types";
import {
  findOwnedOrClaimableReservedSeatingLink,
  syncReservedSeatingLinksForImportedOrders,
} from "@/lib/ticket-ingestion";

function link(overrides: Partial<ShowReservedSeatingLink>): ShowReservedSeatingLink {
  return {
    id: "link_1",
    show_id: "show_1",
    customer_name: "Bryan Turner",
    email: "bryan@example.com",
    ticket_count: 1,
    selection_mode: "imported",
    source_ticket_id: null,
    source_order_id: null,
    source_import_key: null,
    ...overrides,
  } as ShowReservedSeatingLink;
}

function ticket(id: string, orderId: string, importKey: string) {
  return {
    id,
    guest_name: "Bryan Turner",
    email: "bryan@example.com",
    ticket_count: 1,
    order_id: orderId,
    import_key: importKey,
  };
}

function syncClient(existingLinks: ShowReservedSeatingLink[]) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: string; values: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      if (table === "show_reserved_seating_links") {
        return {
          select() {
            return { eq: async () => ({ data: existingLinks, error: null }) };
          },
          insert(rows: Array<Record<string, unknown>>) {
            inserted.push(...rows);
            return { select: async () => ({ data: rows.map((_, index) => ({ id: `new_link_${index + 1}` })), error: null }) };
          },
          update(values: Record<string, unknown>) {
            return {
              eq: async (_column: string, id: string) => {
                updated.push({ id, values });
                return { error: null };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return { not: async () => ({ data: [], error: null }) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inserted, updated };
}

test("same purchaser buying twice receives two distinct owned links", async () => {
  const oldLink = link({ source_ticket_id: "ticket_1", source_order_id: "order_1", source_import_key: "import_1" });
  const { client, inserted, updated } = syncClient([oldLink]);

  const result = await syncReservedSeatingLinksForImportedOrders(client, "show_1", [
    ticket("ticket_2", "order_2", "import_2"),
  ]);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].source_ticket_id, "ticket_2");
  assert.equal(updated.length, 0);
  assert.deepEqual(result.linkIds, ["new_link_1"]);
  assert.deepEqual(result.actions, ["created"]);
});

test("two same-name paid tickets in one sync create two links", async () => {
  const { client, inserted } = syncClient([]);
  const result = await syncReservedSeatingLinksForImportedOrders(client, "show_1", [
    ticket("ticket_1", "order_1", "import_1"),
    ticket("ticket_2", "order_2", "import_2"),
  ]);

  assert.equal(inserted.length, 2);
  assert.notEqual(inserted[0].source_ticket_id, inserted[1].source_ticket_id);
  assert.equal(result.linkIds.length, 2);
});

test("a link owned by an older ticket is never reassigned", () => {
  const oldLink = link({ source_ticket_id: "ticket_1", source_order_id: "order_1", source_import_key: "import_1" });
  assert.equal(findOwnedOrClaimableReservedSeatingLink([oldLink], ticket("ticket_2", "order_2", "import_2")), null);
});

test("matching order identifiers cannot reassign a different ticket owner", () => {
  const conflictingLink = link({ source_ticket_id: "ticket_1", source_order_id: "order_2", source_import_key: "import_2" });
  assert.equal(findOwnedOrClaimableReservedSeatingLink([conflictingLink], ticket("ticket_2", "order_2", "import_2")), null);
});

test("a duplicate delivery keeps the one link owned by its current ticket", async () => {
  const currentLink = link({ source_ticket_id: "ticket_1", source_order_id: "order_1", source_import_key: "import_1" });
  const { client, inserted } = syncClient([currentLink]);

  const result = await syncReservedSeatingLinksForImportedOrders(client, "show_1", [
    ticket("ticket_1", "order_1", "import_1"),
  ]);

  assert.equal(inserted.length, 0);
  assert.deepEqual(result.linkIds, ["link_1"]);
  assert.deepEqual(result.actions, ["existing_current_ticket"]);
});

test("an unclaimed legacy link may be claimed by exact name and email", () => {
  const legacyLink = link({ selection_mode: "manual" });
  const match = findOwnedOrClaimableReservedSeatingLink([legacyLink], ticket("ticket_2", "order_2", "import_2"));
  assert.equal(match?.link.id, legacyLink.id);
  assert.equal(match?.action, "claimed_legacy");
});

test("concurrent sync calls resolve to one canonical reserved link", async () => {
  const links: Array<Record<string, unknown>> = [];
  const insertedTokens: string[] = [];
  let initialReaders = 0;
  let releaseInitialReaders: (() => void) | null = null;
  const initialReadBarrier = new Promise<void>((resolve) => {
    releaseInitialReaders = resolve;
  });

  const client = {
    from(table: string) {
      if (table === "show_reserved_seat_assignments") {
        return {
          select() {
            return { eq() { return { not: async () => ({ data: [], error: null }) }; } };
          },
        };
      }

      if (table !== "show_reserved_seating_links") throw new Error(`Unexpected table: ${table}`);
      return {
        select(columns: string) {
          if (columns === "*") {
            return {
              async eq() {
                const snapshot = [...links];
                initialReaders += 1;
                if (initialReaders === 2) releaseInitialReaders?.();
                await initialReadBarrier;
                return { data: snapshot, error: null };
              },
            };
          }
          return {
            eq(column: string, value: string) {
              assert.equal(column, "show_id");
              assert.equal(value, "show_1");
              return {
                eq(secondColumn: string, ticketId: string) {
                  assert.equal(secondColumn, "source_ticket_id");
                  return {
                    async maybeSingle() {
                      const match = links.find((item) => item.show_id === value && item.source_ticket_id === ticketId) ?? null;
                      return { data: match ? { id: match.id } : null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          return {
            async select() {
              const row = rows[0];
              const existing = links.find((item) => item.show_id === row.show_id && item.source_ticket_id === row.source_ticket_id);
              if (existing) {
                return {
                  data: null,
                  error: {
                    code: "23505",
                    message: 'duplicate key value violates unique constraint "show_reserved_seating_links_show_id_source_ticket_id_unique"',
                    details: null,
                    hint: null,
                  },
                };
              }
              const canonical = { ...row, id: "canonical_link" };
              links.push(canonical);
              insertedTokens.push("one-database-generated-token");
              return { data: [{ id: canonical.id }], error: null };
            },
          };
        },
        update() {
          throw new Error("Unexpected update");
        },
      };
    },
  } as unknown as SupabaseClient;

  const importedTicket = ticket("ticket_1", "order_1", "import_1");
  const [first, second] = await Promise.all([
    syncReservedSeatingLinksForImportedOrders(client, "show_1", [importedTicket]),
    syncReservedSeatingLinksForImportedOrders(client, "show_1", [importedTicket]),
  ]);

  assert.equal(links.length, 1);
  assert.equal(insertedTokens.length, 1);
  assert.deepEqual(first.linkIds, ["canonical_link"]);
  assert.deepEqual(second.linkIds, ["canonical_link"]);
  assert.deepEqual(new Set([...first.actions, ...second.actions]), new Set(["created", "existing_current_ticket"]));
});

test("unexpected reserved-link insert errors are not swallowed", async () => {
  const unexpectedError = { code: "42501", message: "permission denied", details: null, hint: null };
  const client = {
    from(table: string) {
      if (table === "show_reserved_seat_assignments") {
        return { select() { return { eq() { return { not: async () => ({ data: [], error: null }) }; } }; } };
      }
      return {
        select() { return { eq: async () => ({ data: [], error: null }) }; },
        insert() { return { select: async () => ({ data: null, error: unexpectedError }) }; },
      };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    syncReservedSeatingLinksForImportedOrders(client, "show_1", [ticket("ticket_1", "order_1", "import_1")]),
    (error: unknown) => error === unexpectedError,
  );
});

test("a same-code conflict from any other unique constraint is not swallowed", async () => {
  const unrelatedConflict = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "some_other_unique_index"',
    details: null,
    hint: null,
  };
  const client = {
    from(table: string) {
      if (table === "show_reserved_seat_assignments") {
        return { select() { return { eq() { return { not: async () => ({ data: [], error: null }) }; } }; } };
      }
      return {
        select() { return { eq: async () => ({ data: [], error: null }) }; },
        insert() { return { select: async () => ({ data: null, error: unrelatedConflict }) }; },
      };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    syncReservedSeatingLinksForImportedOrders(client, "show_1", [ticket("ticket_1", "order_1", "import_1")]),
    (error: unknown) => error === unrelatedConflict,
  );
});
