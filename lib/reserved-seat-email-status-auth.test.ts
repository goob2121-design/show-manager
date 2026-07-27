import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminSessionPath = new URL("./admin-session.ts", import.meta.url);
const authHelperPath = new URL("./reserved-seat-email-status-auth.ts", import.meta.url);
const routePath = new URL("../app/api/admin/shows/[showId]/reserved-seat-email-status/route.ts", import.meta.url);

test("admin session helper remains show-slug specific", async () => {
  const adminSessionSource = await readFile(adminSessionPath, "utf8");
  assert.match(adminSessionSource, /getAdminSessionCookieName\(slug: string\)/);
  assert.match(adminSessionSource, /verifyAdminSessionCookieValue\(slug: string, cookieValue:/);
  assert.match(adminSessionSource, /if \(cookieSlug !== slug\) return false;/);
});

test("authentication helper enforces 401 for missing cookie and 404 for wrong show identity", async () => {
  const helperSource = await readFile(authHelperPath, "utf8");
  assert.match(helperSource, /status:\s*401/);
  assert.match(helperSource, /"Admin access is required\."/);
  assert.match(helperSource, /status:\s*404/);
  assert.match(helperSource, /"Show was not found\."/);
  assert.match(helperSource, /verifyAdminSessionCookieValue\(canonicalSlug, input\.cookieValue\)/);
});

test("route uses the canonical show slug, stays GET-only, and remains SELECT-only", async () => {
  const routeSource = await readFile(routePath, "utf8");
  assert.match(routeSource, /from\("shows"\)/);
  assert.match(routeSource, /select\("id,slug"\)/);
  assert.match(routeSource, /validateReservedSeatEmailStatusAccess/);
  assert.match(routeSource, /getAdminSessionCookieName\(show\.slug\)/);
  assert.match(routeSource, /from\("show_reserved_seating_links"\)/);
  assert.match(routeSource, /eq\("show_id", accessResult\.showId\)/);
  assert.match(routeSource, /from\("reserved_seat_email_events"\)/);
  assert.match(routeSource, /export async function GET/);
  assert.doesNotMatch(routeSource, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(routeSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(routeSource, /selection_token|seat_selection_token|RESEND_API_KEY|RESEND_WEBHOOK_SECRET|SQUARE/i);
});
