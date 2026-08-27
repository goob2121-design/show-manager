import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sponsor Comp Seats preserves stable ownership without duplicate links", async () => {
  const source = await readFile(new URL("../../app/components/show-page.tsx", import.meta.url), "utf8");
  assert.match(source, /sourceShowSponsorId = row\.id\.startsWith\("sponsor-"\)/);
  assert.match(source, /link\.source_show_sponsor_id === sourceShowSponsorId/);
  assert.match(source, /source_show_sponsor_id: sourceShowSponsorId/);
  assert.match(source, /source_ticket_id: sourceTicketId/);
  assert.ok(source.indexOf("sourceOwnedLink") < source.indexOf("const matchingLink"));
});

test("initial sends, reminders, and admin status share the authoritative resolver", async () => {
  const [initial, reminder, status, panel] = await Promise.all([
    readFile(new URL("send-reserved-seat-link-email.ts", import.meta.url), "utf8"),
    readFile(new URL("reserved-seat-reminder-delivery.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/admin/shows/[showId]/reserved-seat-email-status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/components/reserved-seating-panel.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [initial, reminder, status]) assert.match(source, /resolveReservedSeatRecipientEmail/);
  assert.match(panel, /resolvedRecipientEmail/);
  assert.match(panel, /link\.email\?\.trim\(\) \|\| resolvedEmailByLink\.get\(link\.id\)/);
});

test("migration adds a nullable source link and skips ambiguous historical matches", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20260826_link_sponsor_comps_to_reserved_seating.sql", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists source_show_sponsor_id uuid/);
  assert.doesNotMatch(migration, /source_show_sponsor_id uuid\s+not null/i);
  assert.match(migration, /having count\(\*\) = 1/g);
  assert.match(migration, /where source_show_sponsor_id is not null/);
});
