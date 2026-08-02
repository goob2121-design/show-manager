import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node type-stripping tests require the TypeScript extension.
import { sponsorLocation, sponsorRecognitionName } from "./sponsor-library.ts";

test("recognition name falls back without replacing the canonical sponsor name", () => {
  assert.equal(sponsorRecognitionName({ name: "Library Name", recognition_name: "Public Name", legal_name: "Legal LLC" }), "Public Name");
  assert.equal(sponsorRecognitionName({ name: "Library Name", recognition_name: null, legal_name: "Legal LLC" }), "Library Name");
  assert.equal(sponsorRecognitionName({ name: "", recognition_name: null, legal_name: "Legal LLC" }), "Legal LLC");
});

test("location omits empty address labels", () => {
  assert.equal(sponsorLocation({ city: "Cumberland Gap", state: "TN" }), "Cumberland Gap, TN");
  assert.equal(sponsorLocation({ city: null, state: "TN" }), "TN");
  assert.equal(sponsorLocation({ city: null, state: null }), "");
});
