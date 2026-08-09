import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const session = readFileSync("lib/door-staff-session.ts", "utf8");
const access = readFileSync("lib/door-access.ts", "utf8");
const loginRoute = readFileSync("app/api/door-staff-session/route.ts", "utf8");
const doorPage = readFileSync("app/admin/[slug]/door/page.tsx", "utf8");
const welcomePage = readFileSync("app/admin/[slug]/door/welcome-display/page.tsx", "utf8");
const seatRoute = readFileSync("app/api/admin/shows/[showId]/door-seat-assignments/route.ts", "utf8");
const scanRoute = readFileSync("app/api/admin/shows/[showId]/door-scan-lookup/route.ts", "utf8");
const adminSession = readFileSync("lib/admin-session.ts", "utf8");

test("Door Staff sessions are separate, signed, role- and show-scoped", () => {
  assert.match(session, /stageflow_door_staff_session/);
  assert.match(session, /role: "door_staff"/);
  assert.match(session, /showId/);
  assert.match(session, /slug/);
  assert.match(session, /expiresAt/);
  assert.match(session, /timingSafeEqual/);
  assert.match(session, /expectedShowId && session\.showId !== expectedShowId/);
  assert.doesNotMatch(session, /STAGEFLOW_ADMIN_COOKIE_PREFIX/);
});

test("login requires an active account and verifies the password hash", () => {
  assert.match(loginRoute, /\.eq\("show_id", show\.id\)/);
  assert.match(loginRoute, /\.eq\("username", username\)/);
  assert.match(loginRoute, /!account\?\.is_active/);
  assert.match(loginRoute, /verifyDoorStaffPassword\(password, account\.password_hash\)/);
  assert.match(session, /scryptCallback\(password/);
});

test("Door Mode and Welcome Display accept only Admin or matching Door Staff access", () => {
  assert.match(access, /verifyAdminSessionCookieValue/);
  assert.match(access, /verifyDoorStaffSessionCookieValue\(input\.slug, input\.doorStaffCookieValue, input\.showId\)/);
  assert.match(doorPage, /resolveDoorAccess/);
  assert.match(welcomePage, /resolveDoorAccess/);
  assert.match(seatRoute, /resolveDoorAccess\(\{[\s\S]*showId/);
  assert.match(scanRoute, /resolveDoorAccess\(\{[\s\S]*showId: show\.id/);
});

test("general Admin pages remain on the existing AdminGate and do not know Door Staff cookies", () => {
  const generalAdminPage = readFileSync("app/admin/[slug]/page.tsx", "utf8");
  assert.match(generalAdminPage, /<AdminGate slug=\{slug\}>/);
  assert.doesNotMatch(generalAdminPage, /door-staff|DoorStaff|door_staff/);
  assert.match(adminSession, /stageflow_admin_session/);
  assert.doesNotMatch(adminSession, /door_staff/);
});

test("logout expires only the Door Staff cookie", () => {
  assert.match(loginRoute, /export async function DELETE/);
  assert.match(loginRoute, /getDoorStaffSessionCookieName\(slug\)/);
  assert.match(loginRoute, /maxAge: 0/);
  assert.doesNotMatch(loginRoute, /getAdminSessionCookieName/);
});
