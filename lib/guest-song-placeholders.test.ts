import assert from "node:assert/strict";
import test from "node:test";

const placeholderModulePromise = import(new URL("./guest-song-placeholders.ts", import.meta.url).href);

test("creates the requested quantity for the correct show and full guest name", async () => {
  const { buildGuestSongPlaceholderRows } = await placeholderModulePromise;
  const rows = buildGuestSongPlaceholderRows({
    showId: "show-1",
    guestProfileId: "guest-1",
    guestDisplayName: "The Lonesome Steel Rails",
    quantity: 3,
    existingSongs: [],
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row: { title: string }) => row.title), [
    "The Lonesome Steel Rails — Guest Song 1",
    "The Lonesome Steel Rails — Guest Song 2",
    "The Lonesome Steel Rails — Guest Song 3",
  ]);
  assert.ok(rows.every((row: { show_id: string; guest_profile_id: string }) => row.show_id === "show-1" && row.guest_profile_id === "guest-1"));
});

test("continues after the highest stable number without renumbering gaps", async () => {
  const { buildGuestSongPlaceholderRows } = await placeholderModulePromise;
  const rows = buildGuestSongPlaceholderRows({
    showId: "show-1",
    guestProfileId: "guest-1",
    guestDisplayName: "Full Guest Name",
    quantity: 2,
    existingSongs: [
      { guest_profile_id: "guest-1", is_placeholder: true, placeholder_number: 1 },
      { guest_profile_id: "guest-1", is_placeholder: true, placeholder_number: 3 },
      { guest_profile_id: "guest-2", is_placeholder: true, placeholder_number: 9 },
    ],
  });

  assert.deepEqual(rows.map((row: { placeholder_number: number }) => row.placeholder_number), [4, 5]);
});
