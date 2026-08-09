import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/admin-session/route.ts", "utf8");
const quickNav = readFileSync("app/components/admin-quick-nav.tsx", "utf8");
const adminSession = readFileSync("lib/admin-session.ts", "utf8");
const doorStaffRoute = readFileSync("app/api/door-staff-session/route.ts", "utf8");

test("Admin logout expires the show-scoped Admin HttpOnly cookie", () => {
  assert.match(route, /export async function DELETE/);
  assert.match(route, /getAdminSessionCookieName\(slug\)/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /maxAge: 0/);
  assert.doesNotMatch(route, /getDoorStaffSessionCookieName/);
});

test("existing Logout clears browser markers, awaits server logout, then redirects", () => {
  const clearIndex = quickNav.indexOf("clearAllAdminAccess();");
  const requestIndex = quickNav.indexOf('fetch(`/api/admin-session?slug=${encodeURIComponent(slug)}`');
  const redirectIndex = quickNav.indexOf("window.location.href", requestIndex);
  assert.ok(clearIndex >= 0 && requestIndex > clearIndex && redirectIndex > requestIndex);
  assert.match(quickNav, /method: "DELETE"/);
});

test("Admin login and session validation remain unchanged", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /createAdminSessionCookieValue\(slug\)/);
  assert.match(adminSession, /verifyAdminSessionCookieValue/);
  assert.match(adminSession, /timingSafeEqual/);
});

test("Admin logout and Door Staff logout clear only their own cookies", () => {
  assert.doesNotMatch(route, /stageflow_door_staff_session|door_staff/);
  assert.match(doorStaffRoute, /getDoorStaffSessionCookieName\(slug\)/);
  assert.doesNotMatch(doorStaffRoute, /getAdminSessionCookieName/);
});
