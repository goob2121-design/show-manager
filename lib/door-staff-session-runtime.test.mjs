import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import {
  createDoorStaffSessionCookieValue,
  verifyDoorStaffPassword,
  verifyDoorStaffSessionCookieValue,
} from "./door-staff-session.ts";

test("a Door Staff session is valid only for its assigned show", () => {
  process.env.ADMIN_SESSION_SECRET = "door-staff-test-secret";
  const cookie = createDoorStaffSessionCookieValue("show-a-id", "show-a");
  assert.equal(verifyDoorStaffSessionCookieValue("show-a", cookie, "show-a-id")?.role, "door_staff");
  assert.equal(verifyDoorStaffSessionCookieValue("show-b", cookie, "show-b-id"), null);
  assert.equal(verifyDoorStaffSessionCookieValue("show-a", cookie, "show-b-id"), null);
  assert.equal(verifyDoorStaffSessionCookieValue("show-a", `${cookie}tampered`, "show-a-id"), null);
});

test("Door Staff password verification accepts the right password and rejects the wrong one", async () => {
  const salt = randomBytes(16);
  const derived = await promisify(scryptCallback)("correct-password", salt, 64, { N: 16384, r: 8, p: 1 });
  const hash = `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  assert.equal(await verifyDoorStaffPassword("correct-password", hash), true);
  assert.equal(await verifyDoorStaffPassword("wrong-password", hash), false);
});
