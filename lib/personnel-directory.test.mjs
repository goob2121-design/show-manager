import assert from "node:assert/strict";
import test from "node:test";
import { activePersonnelProfiles, parsePersonnelDirectoryInput } from "./personnel-directory.ts";

test("directory accepts trimmed defaults and rejects malformed or negative pay", () => {
  assert.deepEqual(parsePersonnelDirectoryInput({ displayName: " Stuart Wyrick ", defaultRole: " Banjo and Vocals ", defaultPayAmount: "150.00", isActive: true, displayOrder: "2" }), { displayName: "Stuart Wyrick", defaultRole: "Banjo and Vocals", defaultPayAmount: 150, isActive: true, displayOrder: 2 });
  assert.equal(parsePersonnelDirectoryInput({ displayName: "Stuart", defaultPayAmount: "-1", displayOrder: 1 }), null);
  assert.equal(parsePersonnelDirectoryInput({ displayName: "Stuart", defaultPayAmount: "15.999", displayOrder: 1 }), null);
});

test("inactive personnel remain data but are excluded from future picker ordering", () => {
  const profiles = [{ id: "1", display_name: "Stuart", is_active: false, display_order: 1 }, { id: "2", display_name: "Bryan", is_active: true, display_order: 2 }, { id: "3", display_name: "Clint", is_active: true, display_order: 1 }];
  assert.deepEqual(activePersonnelProfiles(profiles).map((profile) => profile.display_name), ["Clint", "Bryan"]);
  assert.equal(profiles.find((profile) => profile.id === "1")?.display_name, "Stuart");
});
