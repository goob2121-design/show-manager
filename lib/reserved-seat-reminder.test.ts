import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const eligibilityPromise = import(new URL("./reserved-seat-reminder-eligibility.ts", import.meta.url).href);

const eligibleInput = {
  ticketCount: 2,
  assignedCustomerSeatCount: 0,
  email: "guest@example.com",
  selectionToken: "existing-token",
  submittedAt: null,
  isReservedSeating: true,
};

test("reminder eligibility uses authoritative required and assigned counts", async () => {
  const { getReservedSeatReminderEligibility } = await eligibilityPromise;
  assert.equal(getReservedSeatReminderEligibility(eligibleInput).reason, "eligible");
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, assignedCustomerSeatCount: 2 }).reason, "complete");
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, assignedCustomerSeatCount: 1 }).reason, "partial_assignment");
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, assignedCustomerSeatCount: 3 }).remainingSeats, 0);
});

test("GA, missing email, completed selection, and missing token are ineligible", async () => {
  const { getReservedSeatReminderEligibility } = await eligibilityPromise;
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, isReservedSeating: false }).reason, "general_admission");
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, email: null }).reason, "missing_email");
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, submittedAt: "2026-08-18T12:00:00Z" }).reason, "completed_selection");
  assert.equal(getReservedSeatReminderEligibility({ ...eligibleInput, selectionToken: "" }).reason, "invalid_token");
});

test("reminder template is separate and reuses the supplied existing link", async () => {
  const template = await readFile(new URL("./email/reserved-seat-reminder-email.ts", import.meta.url), "utf8");
  assert.match(template, /RESERVED_SEAT_REMINDER_SUBJECT = "Reminder:/);
  assert.match(template, /friendly reminder/i);
  assert.match(template, /tickets are already purchased/i);
  assert.match(template, /input\.seatSelectionUrl/);
  assert.doesNotMatch(template, /randomUUID|selection_token\s*=/);
});

test("reminder architecture cannot mutate reservation or assignment state", async () => {
  const service = await readFile(new URL("./email/reserved-seat-reminder-delivery.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/shows/[showId]/reserved-seat-reminders/route.ts", import.meta.url), "utf8");
  assert.match(service, /buildReservedSeatSelectionUrl\(link\.selection_token\)/);
  assert.match(service, /providerIdempotencyKey/);
  assert.doesNotMatch(service, /show_reserved_seat_assignments"\)\.update/);
  assert.doesNotMatch(service, /\.update\(\{[\s\S]*?submitted_at/);
  assert.doesNotMatch(service, /\.update\(\{[\s\S]*?ticket_count/);
  assert.doesNotMatch(service, /ticket_emailed_at/);
  assert.doesNotMatch(service, /sendOfficial/);
  assert.match(route, /\.select\("id"\)\.eq\("show_id", showId\)/);
  assert.doesNotMatch(route, /body\.ticketCount|body\.remaining|body\.reservations/);
  assert.match(route, /bulk-/);
});
test("bulk reminder operation IDs must be UUIDs", async () => {
  const { isReservedSeatBulkOperationId } = await eligibilityPromise;
  assert.equal(isReservedSeatBulkOperationId("7c5cb9f0-c7c8-4ab1-b6db-f9a7fe7a57c2"), true);
  assert.equal(isReservedSeatBulkOperationId("not-a-real-uuid"), false);
  assert.equal(isReservedSeatBulkOperationId("bulk_operation_123"), false);
});

test("admin resends remain original-template sends with separate immutable history", async () => {
  const sender = await readFile(new URL("./email/send-reserved-seat-link-email.ts", import.meta.url), "utf8");
  assert.match(sender, /sendReservedSeatEmail\(\{/);
  assert.doesNotMatch(sender, /sendReservedSeatReminderEmail/);
  assert.match(sender, /isAdminResend: options\.allowResend === true/);
  assert.match(sender, /email_type: "reserved_seat_initial",[\s\S]*?sequence_number: 0/);
  assert.match(sender, /\.eq\("email_type", "reserved_seat_resend"\)/);
  assert.match(sender, /email_type: "reserved_seat_resend",[\s\S]*?sequence_number: sequenceNumber/);
  assert.match(sender, /provider_idempotency_key: `resend-\$\{input\.resendEmailId\}`/);
  assert.match(sender, /resend_email_id: trackedResendId/);
});

test("original, resent original, and reminder numbering stay independent", async () => {
  const sender = await readFile(new URL("./email/send-reserved-seat-link-email.ts", import.meta.url), "utf8");
  const reminder = await readFile(new URL("./email/reserved-seat-reminder-delivery.ts", import.meta.url), "utf8");
  const status = await readFile(new URL("../app/api/admin/shows/[showId]/reserved-seat-email-status/route.ts", import.meta.url), "utf8");
  assert.match(sender, /email_type", "reserved_seat_resend"/);
  assert.match(reminder, /email_type", "reserved_seat_reminder"/);
  assert.match(status, /Resent Original #\$\{delivery\.sequence_number\}/);
  assert.match(status, /Reminder #\$\{delivery\.sequence_number\}/);
});

test("structured delivery history suppresses the combined legacy Latest Activity", async () => {
  const panel = await readFile(new URL("../app/components/reserved-seating-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /!emailStatus\?\.deliveries\?\.length \? \([\s\S]*?Latest Activity/);
  assert.match(panel, /emailStatus\?\.deliveries\?\.length \? \([\s\S]*?Reserved-seat email delivery history/);
  assert.match(panel, /emailStatus: latestDelivery \?\? emailStatus/);
});

test("exact delivery webhook matching and historical fallback remain present", async () => {
  const webhook = await readFile(new URL("../app/api/integrations/resend/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /from\("reserved_seat_email_deliveries"\)[\s\S]*?eq\("resend_email_id", resendEmailId\)/);
  assert.match(webhook, /email_delivery_id: delivery\?\.id \?\? null/);
  assert.match(webhook, /from\("show_reserved_seating_links"\)\.select\("id"\)\.eq\("resend_email_id", resendEmailId\)/);
});

test("forward migration permits resent originals without changing the applied migration", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260819_allow_reserved_seat_resend_delivery_type.sql", import.meta.url), "utf8");
  assert.match(migration, /reserved_seat_resend/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

