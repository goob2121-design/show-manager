import assert from "node:assert/strict";
import test from "node:test";

const audiencesPromise = import(new URL("./email-center-audiences.ts", import.meta.url).href);
function recipient(overrides = {}) {
  return { id: "reserved:1", name: "Whitney Smith", email: "whitney@example.com", sourceLabel: "Reserved Seats", detail: "2 Tickets - L-A1, L-A2", audienceKeys: ["reserved_seat_customers", "reserved_with_seats", "all_show_contacts"], mergeFields: { first_name: "Whitney", full_name: "Whitney Smith", email: "whitney@example.com", seat_numbers: "L-A1, L-A2" }, ...overrides };
}
test("audience definitions include reserved, NSS, complimentary, and all-show groups", async () => {
  const { EMAIL_CENTER_AUDIENCES } = await audiencesPromise;
  const keys = EMAIL_CENTER_AUDIENCES.map((item: { key: string }) => item.key);
  for (const key of ["advance_ticket_buyers", "reserved_seat_customers", "reserved_with_seats", "reserved_nss", "complimentary_guests", "sponsors", "guest_contacts", "all_show_contacts"]) assert.ok(keys.includes(key));
});
test("audiences deduplicate normalized email while preserving useful metadata", async () => {
  const { recipientsForEmailCenterAudience } = await audiencesPromise;
  const result = recipientsForEmailCenterAudience([recipient(), recipient({ id: "guest:2", email: " WHITNEY@example.com ", sourceLabel: "Show Guest", detail: "Guest contact", audienceKeys: ["guest_contacts", "all_show_contacts"], mergeFields: { first_name: "Whitney", email: "whitney@example.com" } })], "all_show_contacts");
  assert.equal(result.recordsFound, 2); assert.equal(result.duplicatesRemoved, 1); assert.equal(result.uniqueRecipients, 1);
  assert.equal(result.recipients[0].mergeFields.seat_numbers, "L-A1, L-A2");
});
test("NSS and complimentary memberships remain separate", async () => {
  const { recipientsForEmailCenterAudience } = await audiencesPromise;
  const nss = recipient({ id: "reserved:2", email: "nss@example.com", audienceKeys: ["reserved_seat_customers", "reserved_nss", "all_show_contacts"], mergeFields: { first_name: "John", email: "nss@example.com", seat_numbers: "" } });
  const comp = recipient({ id: "comp:3", email: "comp@example.com", sourceLabel: "Complimentary Guest", audienceKeys: ["complimentary_guests", "all_show_contacts"] });
  assert.deepEqual(recipientsForEmailCenterAudience([nss, comp], "reserved_nss").recipients.map((item: { id: string }) => item.id), ["reserved:2"]);
  assert.deepEqual(recipientsForEmailCenterAudience([nss, comp], "complimentary_guests").recipients.map((item: { id: string }) => item.id), ["comp:3"]);
});
test("merge fields render independently and invalidate only the affected recipient", async () => {
  const { renderEmailCenterRecipient } = await audiencesPromise;
  const first = renderEmailCenterRecipient({ recipient: recipient(), subjectTemplate: "Hi {{first_name}}", messageTemplate: "Seats: {{seat_numbers}}", senderValid: true });
  const second = renderEmailCenterRecipient({ recipient: recipient({ id: "reserved:2", email: "john@example.com", mergeFields: { first_name: "John", email: "john@example.com" } }), subjectTemplate: "Hi {{first_name}}", messageTemplate: "Seats: {{seat_numbers}}", senderValid: true });
  assert.equal(first.message, "Seats: L-A1, L-A2"); assert.equal(second.message, "Seats: {{seat_numbers}}");
  assert.equal(first.ready, true); assert.equal(second.ready, false); assert.match(second.problems.join(" "), /seat_numbers/);
});
