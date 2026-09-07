import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(path, "utf8");
const collection = read("app/api/admin/personnel-profiles/route.ts");
const item = read("app/api/admin/personnel-profiles/[profileId]/route.ts");
const page = read("app/components/personnel-directory-page.tsx");
const phaseOne = read("app/api/admin/shows/[showId]/personnel/route.ts");
test("directory is admin-only, validates IDs and preserves show snapshot separation", () => {
  assert.match(collection, /verifyAdminSessionCookieValue/);
  assert.match(item, /verifyAdminSessionCookieValue/);
  assert.match(item, /uuid\.test\(profileId\)/);
  assert.match(collection, /parsePersonnelDirectoryInput/);
  assert.match(item, /parsePersonnelDirectoryInput/);
  assert.doesNotMatch(`${collection}\n${item}`, /show_payout_items/);
  assert.match(phaseOne, /payee_name: profile\.display_name/);
  assert.match(phaseOne, /role_snapshot: text\(body\.role\) \|\| profile\.default_role/);
  assert.match(phaseOne, /amount,/);
});
test("directory UI supports creation, defaults editing, ordering, and reactivation", () => {
  for (const label of ["Personnel Directory", "Add Person", "Default role", "Default pay", "Display order", "Edit / Reactivate"]) assert.match(page, new RegExp(label));
});
