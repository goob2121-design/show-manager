import assert from "node:assert/strict";
import test from "node:test";
import type { MailingListPresaleDeliveryEvent } from "./mailing-list-presale-tracking";

const modulePromise = import(new URL("./mailing-list-presale-tracking.ts", import.meta.url).href);

function event(event_type: MailingListPresaleDeliveryEvent["event_type"], time: string): MailingListPresaleDeliveryEvent {
  return { id: `${event_type}-${time}`, resend_message_id: "re_presale", event_type,
    provider_occurred_at: time, received_at: time, recipient: "late@example.com", clicked_url: null, detail: null };
}

test("accepted remains distinct from verified delivery", async () => {
  const { deriveMailingListPresaleTracking } = await modulePromise;
  const result = deriveMailingListPresaleTracking({ sendStatus: "accepted", sentAt: "2026-09-05T18:15:00Z", failedAt: null, events: [] });
  assert.equal(result.currentLabel, "Sent");
  assert.deepEqual(result.history, [{ label: "Accepted by Resend", timestamp: "2026-09-05T18:15:00Z" }]);
});

test("all supported lifecycle outcomes derive without overwriting history", async () => {
  const { deriveMailingListPresaleTracking } = await modulePromise;
  const types = ["email.sent", "email.delivered", "email.opened", "email.clicked", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed"] as const;
  for (const [index, type] of types.entries()) {
    const events = types.slice(0, index + 1).map((item, itemIndex) => event(item, `2026-09-05T18:${String(itemIndex).padStart(2, "0")}:00Z`));
    const result = deriveMailingListPresaleTracking({ sendStatus: "accepted", sentAt: "2026-09-05T17:59:00Z", failedAt: null, events });
    assert.ok(result.history.some((line: { label: string }) => line.label.length > 0), type);
  }
  const failure = deriveMailingListPresaleTracking({ sendStatus: "accepted", sentAt: "2026-09-05T17:59:00Z", failedAt: null, events: [
    event("email.delivered", "2026-09-05T18:00:00Z"), event("email.opened", "2026-09-05T18:01:00Z"), event("email.bounced", "2026-09-05T18:02:00Z"),
  ] });
  assert.equal(failure.currentLabel, "Bounced");
  assert.deepEqual(failure.history.map((line: { label: string }) => line.label), ["Accepted by Resend", "Delivered", "Opened (estimated)", "Bounced"]);
});

test("historical pending and failed deliveries remain meaningful without events", async () => {
  const { deriveMailingListPresaleTracking } = await modulePromise;
  assert.equal(deriveMailingListPresaleTracking({ sendStatus: "pending", sentAt: null, failedAt: null, events: [] }).currentLabel, "Sending");
  assert.equal(deriveMailingListPresaleTracking({ sendStatus: "failed", sentAt: null, failedAt: "2026-09-05T18:00:00Z", events: [] }).currentLabel, "Failed");
});
