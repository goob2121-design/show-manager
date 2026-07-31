import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("seat preference migration is additive and defaults to customer selection", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260731_add_reserved_seating_seat_preference.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists seat_preference text not null default 'customer_select'/i);
  assert.match(sql, /check \(seat_preference in \('customer_select', 'auto_assign'\)\)/i);
  assert.doesNotMatch(sql, /show_reserved_seat_assignments[\s\S]*(insert|update|delete)/i);
});

test("official ticket email readiness migration is additive and nullable", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260731_add_reserved_seating_ticket_emailed_at.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists ticket_emailed_at timestamptz/i);
  assert.doesNotMatch(sql, /not null|default/i);
  assert.doesNotMatch(sql, /show_reserved_seat_assignments/i);
});

test("preference endpoint never writes seat assignments", async () => {
  const source = await readFile(new URL("../app/api/reserved-seating/preference/route.ts", import.meta.url), "utf8");
  assert.match(source, /from\("show_reserved_seat_assignments"\)[\s\S]*head: true/);
  assert.doesNotMatch(source, /from\("show_reserved_seat_assignments"\)\s*\.(insert|update|upsert|delete)\(/);
  assert.match(source, /update\(\{ seat_preference: preference \}\)/);
});

test("guest and admin surfaces expose preference controls without changing the seat map", async () => {
  const [guestPage, adminPanel, email] = await Promise.all([
    readFile(new URL("../app/components/reserved-seat-selection-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/reserved-seating-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("email/reserved-seat-email.ts", import.meta.url), "utf8"),
  ]);
  assert.match(guestPage, /Assign My Seats For Me/);
  assert.match(guestPage, /Choose My Own Seats Instead/);
  assert.match(guestPage, /seatPreference === "auto_assign" && linkAssignments\.length === 0 && !isAlreadySubmitted/);
  assert.match(adminPanel, /Auto Assign Requested/);
  assert.match(adminPanel, /Customer Selecting Seats/);
  assert.match(email, /\?preference=auto/);
  assert.doesNotMatch(guestPage, /from\("show_reserved_seat_assignments"\)/);
});
