// Inert protocol only: no React, Supabase, credentials, clocks, or network calls.
export const LYRIC_FOLLOW_VERSION = 1 as const;
export type LyricAuthority = {
  showId: string;
  publisherId: string;
  publisherSessionId: string;
};
export type SemanticLyricPosition = {
  section: number; // One-based section after the existing blank-line split.
  originalLine: number; // Zero-based source line within that section.
  characterOffset: number; // Unicode code points, not UTF-16 code units or pixels.
};
type Envelope = LyricAuthority & { version: typeof LYRIC_FOLLOW_VERSION };
export type LyricStateMessage = Envelope & {
  type: "lyric_state";
  viewerSessionId: string;
  sequence: number; // Monotonic across all viewers in one publisher session.
} & (
  | { state: "closed"; setlistEntryId: null; lyricsRevision: null; position: null }
  | { state: "open" | "calibrating"; setlistEntryId: string; lyricsRevision: string; position: SemanticLyricPosition | null }
);
export type StateRequestMessage = Envelope & {
  type: "state_request";
  requestId: string;
  followerSessionId: string;
};
export type LyricFollowMessage = LyricStateMessage | StateRequestMessage;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function integer(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
export function isSemanticLyricPosition(value: unknown): value is SemanticLyricPosition {
  return record(value) && keys(value, ["section", "originalLine", "characterOffset"])
    && integer(value.section, 1) && integer(value.originalLine, 0) && integer(value.characterOffset, 0);
}
const envelopeKeys = ["version", "type", "showId", "publisherId", "publisherSessionId"];
export function parseLyricFollowMessage(value: unknown): LyricFollowMessage | null {
  if (!record(value) || value.version !== LYRIC_FOLLOW_VERSION || !identifier(value.showId)
    || !identifier(value.publisherId) || !identifier(value.publisherSessionId)) return null;
  if (value.type === "state_request") {
    if (!keys(value, [...envelopeKeys, "requestId", "followerSessionId"])
      || !identifier(value.requestId) || !identifier(value.followerSessionId)) return null;
    return { version: 1, type: "state_request", showId: value.showId, publisherId: value.publisherId,
      publisherSessionId: value.publisherSessionId, requestId: value.requestId, followerSessionId: value.followerSessionId };
  }
  if (value.type !== "lyric_state" || !keys(value, [...envelopeKeys, "viewerSessionId", "sequence", "state", "setlistEntryId", "lyricsRevision", "position"])
    || !identifier(value.viewerSessionId) || !integer(value.sequence, 0)) return null;
  const base = { version: LYRIC_FOLLOW_VERSION, type: "lyric_state" as const, showId: value.showId, publisherId: value.publisherId,
    publisherSessionId: value.publisherSessionId, viewerSessionId: value.viewerSessionId, sequence: value.sequence };
  if (value.state === "closed") {
    return value.setlistEntryId === null && value.lyricsRevision === null && value.position === null
      ? { ...base, state: "closed", setlistEntryId: null, lyricsRevision: null, position: null } : null;
  }
  if ((value.state !== "open" && value.state !== "calibrating") || !identifier(value.setlistEntryId)
    || typeof value.lyricsRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.lyricsRevision)
    || (value.position !== null && !isSemanticLyricPosition(value.position))) return null;
  return { ...base, state: value.state, setlistEntryId: value.setlistEntryId, lyricsRevision: value.lyricsRevision,
    position: value.position === null ? null : { ...value.position } };
}

export type Rejection = "malformed" | "wrong_type" | "wrong_show" | "wrong_publisher" | "wrong_publisher_session"
  | "duplicate_sequence" | "out_of_order" | "obsolete_viewer_session";
function authorityError(message: LyricFollowMessage, authority: LyricAuthority): Rejection | null {
  if (message.showId !== authority.showId) return "wrong_show";
  if (message.publisherId !== authority.publisherId) return "wrong_publisher";
  if (message.publisherSessionId !== authority.publisherSessionId) return "wrong_publisher_session";
  return null;
}
// Only a verified pairing/handshake may create a cursor for a new publisher
// session. A received message must never select or replace its own authority.
export type LyricStateCursor = {
  authority: Readonly<LyricAuthority>;
  sequence: number;
  viewerSessionId: string | null;
  state: "open" | "closed" | "calibrating" | null;
  retiredViewerSessions: readonly string[];
};
export function createLyricStateCursor(authority: LyricAuthority): LyricStateCursor {
  if (![authority.showId, authority.publisherId, authority.publisherSessionId].every(identifier)) throw new Error("Invalid lyric authority");
  return { authority: { ...authority }, sequence: -1, viewerSessionId: null, state: null, retiredViewerSessions: [] };
}
export type AlignmentStatus = "closed" | "calibrating" | "revision_mismatch" | "awaiting_revision" | "awaiting_position" | "ready";
export type StateAcceptance = { accepted: false; reason: Rejection; cursor: LyricStateCursor }
  | { accepted: true; message: LyricStateMessage; alignment: AlignmentStatus; cursor: LyricStateCursor };
export function acceptLyricState(cursor: LyricStateCursor, payload: unknown, localLyricsRevision?: string): StateAcceptance {
  const reject = (reason: Rejection): StateAcceptance => ({ accepted: false, reason, cursor });
  const message = parseLyricFollowMessage(payload);
  if (!message) return reject("malformed");
  if (message.type !== "lyric_state") return reject("wrong_type");
  const error = authorityError(message, cursor.authority);
  if (error) return reject(error);
  if (message.sequence === cursor.sequence) return reject("duplicate_sequence");
  if (message.sequence < cursor.sequence) return reject("out_of_order");
  if (cursor.retiredViewerSessions.includes(message.viewerSessionId)
    || (message.viewerSessionId === cursor.viewerSessionId && cursor.state === "closed" && message.state !== "closed")) return reject("obsolete_viewer_session");
  const retiredViewerSessions = message.viewerSessionId !== cursor.viewerSessionId && cursor.viewerSessionId !== null
    ? [...cursor.retiredViewerSessions, cursor.viewerSessionId] : [...cursor.retiredViewerSessions];
  const next = { authority: { ...cursor.authority }, sequence: message.sequence, viewerSessionId: message.viewerSessionId,
    state: message.state, retiredViewerSessions };
  // Ordering advances even on revision mismatch: stale state cannot replace it.
  // The consumer must refresh read-only lyrics before applying any position.
  const alignment: AlignmentStatus = message.state === "closed" ? "closed"
    : !localLyricsRevision ? "awaiting_revision"
    : localLyricsRevision !== message.lyricsRevision ? "revision_mismatch"
    : message.state === "calibrating" ? "calibrating"
    : message.position === null ? "awaiting_position" : "ready";
  return { accepted: true, message, alignment, cursor: next };
}
export function validateStateRequest(payload: unknown, authority: LyricAuthority):
  { accepted: true; message: StateRequestMessage } | { accepted: false; reason: Rejection } {
  const message = parseLyricFollowMessage(payload);
  if (!message) return { accepted: false, reason: "malformed" };
  if (message.type !== "state_request") return { accepted: false, reason: "wrong_type" };
  const error = authorityError(message, authority);
  return error ? { accepted: false, reason: error } : { accepted: true, message };
}
