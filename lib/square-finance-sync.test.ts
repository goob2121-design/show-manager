import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSquareGrossSaleFinanceRow,
  syncSquareGrossSaleFinance,
  type SquareGrossSaleFinanceInput,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./square-finance-sync.ts";

const completedSale: SquareGrossSaleFinanceInput = {
  showId: "show-1",
  paymentStatus: "COMPLETED",
  paymentId: "payment-1",
  orderId: "order-1",
  lineItemUid: "line-1",
  amountCents: 3275,
  currency: "usd",
  occurredAt: "2026-10-03T18:00:00.000Z",
};

function financeClient(input?: {
  enabled?: boolean;
  cutoff?: string | null;
  failFirstUpsert?: boolean;
  manualRows?: Array<Record<string, unknown>>;
}) {
  const financeRows = [...(input?.manualRows ?? [])];
  let upsertAttempts = 0;
  const client = {
    from(table: string) {
      if (table === "shows") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        id: "show-1",
                        square_finance_sync_enabled: input?.enabled ?? true,
                        square_finance_sync_started_at: input?.cutoff ?? "2026-10-03T17:00:00.000Z",
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table !== "show_finance_items") throw new Error(`Unexpected table: ${table}`);
      return {
        upsert(row: Record<string, unknown>, options: { onConflict: string }) {
          upsertAttempts += 1;
          assert.match(options.onConflict, /external_line_item_uid/);
          return {
            select() {
              return {
                async maybeSingle() {
                  if (input?.failFirstUpsert && upsertAttempts === 1) {
                    return { data: null, error: new Error("temporary finance failure") };
                  }
                  const key = [
                    row.source,
                    row.source_kind,
                    row.show_id,
                    row.external_payment_id,
                    row.external_order_id,
                    row.external_line_item_uid,
                  ].join("|");
                  const existingIndex = financeRows.findIndex((item) => item.integration_key === key);
                  const stored = { ...row, id: existingIndex >= 0 ? financeRows[existingIndex].id : `finance-${financeRows.length + 1}`, integration_key: key };
                  if (existingIndex >= 0) financeRows[existingIndex] = stored;
                  else financeRows.push(stored);
                  return { data: { id: stored.id }, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, financeRows, getUpsertAttempts: () => upsertAttempts };
}

test("completed mapped payment creates one gross Presale Tickets income row using actual line-item total", async () => {
  const { client, financeRows } = financeClient();
  const result = await syncSquareGrossSaleFinance(client, completedSale);

  assert.equal(result.status, "synced");
  assert.equal(financeRows.length, 1);
  assert.equal(financeRows[0].type, "income");
  assert.equal(financeRows[0].category, "Presale Tickets");
  assert.equal(financeRows[0].amount, 32.75);
  assert.equal(financeRows[0].original_amount_cents, 3275);
  assert.equal(financeRows[0].currency, "USD");
  assert.equal(financeRows[0].is_system_managed, true);
});

test("duplicate webhook upserts the same database-keyed Finance row", async () => {
  const { client, financeRows } = financeClient();
  await syncSquareGrossSaleFinance(client, completedSale);
  await syncSquareGrossSaleFinance(client, completedSale);
  assert.equal(financeRows.length, 1);
});

test("a retry repairs Finance after the ticket path already succeeded", async () => {
  const { client, financeRows, getUpsertAttempts } = financeClient({ failFirstUpsert: true });
  await assert.rejects(syncSquareGrossSaleFinance(client, completedSale), /temporary finance failure/);
  assert.equal(financeRows.length, 0);

  const result = await syncSquareGrossSaleFinance(client, completedSale);
  assert.equal(result.status, "synced");
  assert.equal(getUpsertAttempts(), 2);
  assert.equal(financeRows.length, 1);
});

test("unmapped, incomplete, disabled, and pre-cutoff sales create no Finance row", async () => {
  for (const [sale, clientOptions, expectedReason] of [
    [{ ...completedSale, showId: null }, {}, "unmapped_show"],
    [{ ...completedSale, paymentStatus: "PENDING" }, {}, "payment_not_completed"],
    [{ ...completedSale, paymentStatus: "CANCELED" }, {}, "payment_not_completed"],
    [{ ...completedSale, paymentStatus: "FAILED" }, {}, "payment_not_completed"],
    [completedSale, { enabled: false }, "sync_disabled"],
    [completedSale, { cutoff: "2026-10-03T19:00:00.000Z" }, "before_cutoff"],
  ] as const) {
    const { client, financeRows } = financeClient(clientOptions);
    const result = await syncSquareGrossSaleFinance(client, sale);
    assert.deepEqual(result, { status: "skipped", reason: expectedReason });
    assert.equal(financeRows.length, 0);
  }
});

test("existing manual Finance rows remain untouched", async () => {
  const manualRow = { id: "manual-1", type: "income", label: "Manual presales", amount: 100 };
  const { client, financeRows } = financeClient({ manualRows: [manualRow] });
  await syncSquareGrossSaleFinance(client, completedSale);

  assert.deepEqual(financeRows[0], manualRow);
  assert.equal(financeRows.length, 2);
});

test("row builder preserves audit references without involving ticket or reserved-seat data", () => {
  const row = buildSquareGrossSaleFinanceRow(completedSale, "2026-10-03T18:01:00.000Z");
  assert.equal(row?.external_payment_id, "payment-1");
  assert.equal(row?.external_order_id, "order-1");
  assert.equal(row?.external_line_item_uid, "line-1");
  assert.equal("ticket_count" in (row ?? {}), false);
  assert.equal("seating_link_id" in (row ?? {}), false);
  assert.equal("checked_in" in (row ?? {}), false);
  assert.equal("email" in (row ?? {}), false);
});
