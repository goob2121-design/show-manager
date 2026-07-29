import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReservedSeatEmailConfigError } from "./send-reserved-seat-link-email";

test("clarifies missing StageFlow public URL for local sends", () => {
  assert.equal(
    normalizeReservedSeatEmailConfigError(new Error("STAGEFLOW_PUBLIC_URL is not configured.")),
    "Email cannot be sent locally until STAGEFLOW_PUBLIC_URL is configured.",
  );
});

test("preserves unrelated reserved-seat email configuration errors", () => {
  assert.equal(
    normalizeReservedSeatEmailConfigError(new Error("STAGEFLOW_PUBLIC_URL must be a valid HTTPS URL.")),
    "STAGEFLOW_PUBLIC_URL must be a valid HTTPS URL.",
  );
});
