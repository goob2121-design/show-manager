import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./lyric-follow-protocol.ts", import.meta.url), "utf8");
const exports = {};
// Pure helpers must not import a network, Supabase, React, or credential module.
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, require() { throw new Error("Protocol must have no runtime imports"); } });
const { parseLyricFollowMessage: parse, createLyricStateCursor: cursor, acceptLyricState: accept, validateStateRequest: request } = exports;
const authority = { showId: "show-a", publisherId: "leader-a", publisherSessionId: "publisher-session-a" };
const revision = "a".repeat(64);
const state = (overrides = {}) => ({ version: 1, type: "lyric_state", ...authority,
  viewerSessionId: "viewer-a", sequence: 0, state: "open", setlistEntryId: "entry-a",
  lyricsRevision: revision, position: { section: 1, originalLine: 0, characterOffset: 0 }, ...overrides });
const closed = (sequence, overrides = {}) => state({ sequence, state: "closed", setlistEntryId: null, lyricsRevision: null, position: null, ...overrides });
const snapshot = (overrides = {}) => ({ version: 1, type: "state_request", ...authority,
  requestId: "request-a", followerSessionId: "follower-a", ...overrides });

test("valid state and request payloads parse without retaining mutable input anchors", () => {
  const input = state(), message = parse(input);
  assert.equal(message.type, "lyric_state");
  input.position.section = 99;
  assert.equal(message.position.section, 1);
  assert.equal(parse(snapshot()).type, "state_request");
  assert.equal(request(snapshot(), authority).accepted, true);
  assert.equal(accept(cursor(authority), state(), revision).alignment, "ready");
});
test("malformed, unknown-field, oversized, and invalid numeric payloads are rejected", () => {
  for (const value of [null, [], "message", {}, state({ version: 2 }), state({ type: "scroll" }),
    state({ sequence: -1 }), state({ sequence: 0.5 }), state({ sequence: Infinity }), state({ sequence: Number.MAX_SAFE_INTEGER + 1 }),
    state({ publisherId: " " }), state({ showId: "a".repeat(129) }), state({ lyricsRevision: "not-a-hash" }),
    state({ position: { section: 0, originalLine: 0, characterOffset: 0 } }),
    state({ position: { section: 1, originalLine: -1, characterOffset: 0 } }),
    state({ position: { section: 1, originalLine: 0, characterOffset: 1.5 } }),
    state({ position: { section: 1, originalLine: 0, characterOffset: 0, scrollY: 100 } }),
    state({ position: undefined }), state({ position: {} }), state({ setlistEntryId: null }),
    state({ extra: "unexpected" }), snapshot({ requestId: "" }), snapshot({ followerSessionId: null }),
    closed(1, { position: state().position }), closed(1, { lyricsRevision: revision })]) {
    assert.equal(parse(value), null, JSON.stringify(value));
  }
});
test("wrong show, publisher, and publisher session fail closed for both message types", () => {
  for (const [key, reason] of [["showId", "wrong_show"], ["publisherId", "wrong_publisher"], ["publisherSessionId", "wrong_publisher_session"]]) {
    const initial = cursor(authority);
    const result = accept(initial, state({ [key]: "other" }), revision);
    assert.equal(result.reason, reason); assert.equal(result.cursor, initial);
    assert.equal(request(snapshot({ [key]: "other" }), authority).reason, reason);
  }
  assert.equal(accept(cursor(authority), snapshot(), revision).reason, "wrong_type");
  assert.equal(request(state(), authority).reason, "wrong_type");
});
test("duplicates and out-of-order updates do not mutate the cursor", () => {
  const initial = cursor(authority), result = accept(initial, state({ sequence: 10 }), revision);
  assert.equal(initial.sequence, -1);
  for (const [sequence, reason] of [[10, "duplicate_sequence"], [9, "out_of_order"]]) {
    const rejected = accept(result.cursor, state({ sequence }), revision);
    assert.equal(rejected.accepted, false); assert.equal(rejected.reason, reason);
    assert.equal(rejected.cursor, result.cursor);
  }
  assert.equal(accept(result.cursor, state({ sequence: 12 }), revision).accepted, true, "Dropped messages need not block recovery");
});
test("open, calibrating, close, and new viewer transitions are ordered; closed viewers cannot reopen", () => {
  let current = cursor(authority);
  for (const message of [state(), state({ sequence: 1, state: "calibrating", position: null }),
    state({ sequence: 2 }), closed(3), closed(4), state({ sequence: 5, viewerSessionId: "viewer-b" })]) {
    const result = accept(current, message, revision); assert.equal(result.accepted, true); current = result.cursor;
  }
  assert.equal(accept(current, state({ sequence: 6, viewerSessionId: "viewer-a" }), revision).reason, "obsolete_viewer_session");
  assert.equal(accept(current, closed(7, { viewerSessionId: "viewer-a" }), revision).reason, "obsolete_viewer_session");
  const stopped = accept(current, closed(8, { viewerSessionId: "viewer-b" }), revision);
  assert.equal(stopped.alignment, "closed");
  assert.equal(accept(stopped.cursor, state({ sequence: 9, viewerSessionId: "viewer-b" }), revision).reason, "obsolete_viewer_session");
});
test("new publisher sessions require externally authorized cursor replacement", () => {
  const previous = accept(cursor(authority), state({ sequence: 99 }), revision).cursor;
  const nextAuthority = { ...authority, publisherSessionId: "publisher-session-b" };
  const message = state({ publisherSessionId: nextAuthority.publisherSessionId });
  assert.equal(accept(previous, message, revision).reason, "wrong_publisher_session");
  const fresh = cursor(nextAuthority);
  assert.equal(accept(fresh, message, revision).accepted, true);
  assert.equal(accept(fresh, state({ sequence: 100 }), revision).reason, "wrong_publisher_session");
  assert.throws(() => cursor({ ...authority, showId: "" }), /Invalid lyric authority/);
});
test("missing positions and revisions never authorize alignment", () => {
  assert.equal(accept(cursor(authority), state({ position: null }), revision).alignment, "awaiting_position");
  assert.equal(accept(cursor(authority), state()).alignment, "awaiting_revision");
  assert.equal(accept(cursor(authority), state({ state: "calibrating", position: null }), revision).alignment, "calibrating");
});
test("revision mismatches advance ordering but prohibit positional alignment", () => {
  const mismatch = accept(cursor(authority), state({ sequence: 5 }), "b".repeat(64));
  assert.equal(mismatch.accepted, true); assert.equal(mismatch.alignment, "revision_mismatch");
  assert.equal(accept(mismatch.cursor, state({ sequence: 4 }), revision).reason, "out_of_order");
  assert.equal(accept(mismatch.cursor, state({ sequence: 6 }), revision).alignment, "ready");
});
test("late joins can accept closed state and later snapshots; backward anchors remain valid", () => {
  const joined = accept(cursor(authority), closed(40), revision);
  assert.equal(joined.alignment, "closed");
  const opened = accept(joined.cursor, state({ sequence: 41, viewerSessionId: "viewer-b", position: { section: 5, originalLine: 12, characterOffset: 30 } }), revision);
  const backward = accept(opened.cursor, state({ sequence: 42, viewerSessionId: "viewer-b" }), revision);
  assert.equal(backward.alignment, "ready"); assert.equal(backward.message.position.section, 1);
});
