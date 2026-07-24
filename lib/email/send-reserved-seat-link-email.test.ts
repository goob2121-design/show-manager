import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTrackedEmailState,
  trackedEmailStateWasSent,
} from "@/lib/email/send-reserved-seat-link-email";

test("an active sending claim is in progress, not sent", () => {
  const state = classifyTrackedEmailState("sending:claim-id", null);
  assert.equal(state, "in_progress");
  assert.equal(trackedEmailStateWasSent(state), false);
});

test("losing a claim race cannot produce emailSent true", () => {
  const observedStateAfterLostClaim = classifyTrackedEmailState("sending:other-request", null);
  assert.equal(trackedEmailStateWasSent(observedStateAfterLostClaim), false);
});

test("a completed Resend ID on the current link remains idempotent", () => {
  const state = classifyTrackedEmailState("re_accepted_message", "2026-07-24T01:00:00.000Z");
  assert.equal(state, "already_sent_current_link");
  assert.equal(trackedEmailStateWasSent(state), true);
});

test("a legacy synthetic sent marker is not treated as a completed Resend ID", () => {
  const state = classifyTrackedEmailState("sent:legacy-marker", "2026-07-24T01:00:00.000Z");
  assert.equal(state, "failed");
  assert.equal(trackedEmailStateWasSent(state), false);
});
