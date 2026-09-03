import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveReservedSeatRecipientEmail, selectReservedSeatRecipientEmail } from "./resolve-reserved-seat-recipient.ts";

test("reminder and original/retry sends pass the durable link id to the shared resolver", async () => {
  const [reminder, initialOrRetry] = await Promise.all([
    readFile(new URL("./reserved-seat-reminder-delivery.ts", import.meta.url), "utf8"),
    readFile(new URL("./send-reserved-seat-link-email.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [reminder, initialOrRetry]) {
    assert.match(source, /resolveReservedSeatRecipientEmail/);
    assert.match(source, /reservedSeatLinkId: link\.id/);
  }
  assert.match(reminder, /show_reserved_seating_links/);
  assert.match(reminder, /last_email_error: null/);
  assert.match(initialOrRetry, /allowResend/);
  assert.match(initialOrRetry, /reserved_seat_email_deliveries/);
});

test("a guest email added after link creation resolves through its projection without name guessing", async () => {
  const queried = [];
  const supabase = {
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(column, value) { filters[column] = value; return query; },
        async maybeSingle() {
          queried.push({ table, ...filters });
          if (table === "show_admission_projection_sources") return { data: { projected_ticket_id: "braxton-ticket" }, error: null };
          if (table === "show_comp_tickets") return { data: { email: " braxtonrolen00@gmail.com " }, error: null };
          throw new Error(`Unexpected table ${table}`);
        },
      };
      return query;
    },
  };
  const result = await resolveReservedSeatRecipientEmail(supabase, {
    showId: "show-1", customerName: "Braxton Rolen", email: null,
    reservedSeatLinkId: "braxton-link", sourceTicketId: null, sourceShowSponsorId: null,
    isComplimentary: true, seatCategory: "guest",
  });
  assert.equal(result, "braxtonrolen00@gmail.com");
  assert.deepEqual(queried, [
    { table: "show_admission_projection_sources", show_id: "show-1", source_type: "reserved_link", source_id: "braxton-link" },
    { table: "show_comp_tickets", id: "braxton-ticket", show_id: "show-1" },
  ]);
});

test("explicit link email keeps precedence and a truly missing linked email remains blocked", async () => {
  assert.equal(selectReservedSeatRecipientEmail({ reservedSeatEmail: " corrected@example.com ", compTicketEmail: "source@example.com" }), "corrected@example.com");
  const supabase = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() { return table === "show_admission_projection_sources" ? { data: null, error: null } : { data: null, error: null }; },
      };
      return query;
    },
  };
  const result = await resolveReservedSeatRecipientEmail(supabase, {
    showId: "show-1", customerName: "Similar Name Must Not Match", email: null,
    reservedSeatLinkId: "missing-link", sourceTicketId: null, sourceShowSponsorId: null,
    isComplimentary: true, seatCategory: "guest",
  });
  assert.equal(result, null);
});
