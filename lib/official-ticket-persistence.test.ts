import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordOfficialTicketEmailSuccess } from "./email/official-ticket-email";
import { getOfficialTicketReadiness } from "./official-ticket-readiness";

const submitRouteUrl = new URL("../app/api/reserved-seating/submit/route.ts", import.meta.url);
const deliveryUrl = new URL("./email/official-ticket-email.ts", import.meta.url);
const adminPanelUrl = new URL("../app/components/reserved-seating-panel.tsx", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/20260731_add_reserved_seating_ticket_emailed_at.sql", import.meta.url);

test("customer selection provider success records ticket_emailed_at and makes readiness Ready", async () => {
  const writes: Array<{ table: string; values: Record<string, unknown>; column: string; reservationId: string }> = [];
  const supabase = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            async eq(column: string, reservationId: string) {
              writes.push({ table, values, column, reservationId });
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const emailedAt = "2026-07-31T20:15:00.000Z";
  const persistedAt = await recordOfficialTicketEmailSuccess(supabase, "reservation-123", emailedAt);

  assert.equal(persistedAt, emailedAt);
  assert.deepEqual(writes, [{
    table: "show_reserved_seating_links",
    values: { ticket_emailed_at: emailedAt },
    column: "id",
    reservationId: "reservation-123",
  }]);
  assert.deepEqual(getOfficialTicketReadiness(persistedAt), { ready: true, label: "Ready" });
  assert.deepEqual(getOfficialTicketReadiness(null), { ready: false, label: "Tickets Not Yet Emailed" });
});

test("automatic customer submission passes the committed reservation ID and persists only after provider success", async () => {
  const [submitRoute, delivery] = await Promise.all([
    readFile(submitRouteUrl, "utf8"),
    readFile(deliveryUrl, "utf8"),
  ]);
  assert.match(submitRoute, /deliverOfficialTicketEmail\(supabase, typedSeatingLink\.id/);
  const providerSuccessIndex = delivery.indexOf("if (result.success)");
  const timestampIndex = delivery.indexOf("await recordOfficialTicketEmailSuccess(supabase, link.id)", providerSuccessIndex);
  assert.ok(providerSuccessIndex >= 0 && timestampIndex > providerSuccessIndex);
  assert.match(delivery, /Official ticket email delivery timestamp tracking failed\./);
});

test("migration and admin reload expose persisted official-ticket readiness", async () => {
  const [migration, adminPanel] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(adminPanelUrl, "utf8"),
  ]);
  assert.match(migration, /add column if not exists ticket_emailed_at timestamptz/);
  assert.match(adminPanel, /show_reserved_seating_links"\)\.select\("\*"\)/);
  assert.match(adminPanel, /getOfficialTicketReadiness\(link\.ticket_emailed_at\)/);
  assert.match(adminPanel, /await loadReservedSeating\(\)/);
});
