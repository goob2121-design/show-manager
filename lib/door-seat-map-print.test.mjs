import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const printHelperUrl = new URL("./door-seat-map-print.ts", import.meta.url);
const doorModeUrl = new URL("../app/components/door-mode-page.tsx", import.meta.url);

test("print seat map reuses shared venue geometry and emphasizes assigned seats in black and white", async () => {
  const source = await readFile(printHelperUrl, "utf8");

  assert.ok(source.includes("RESERVED_SEATING_ROW_LABELS"));
  assert.ok(source.includes("RESERVED_SEATING_SEAT_NUMBERS"));
  assert.ok(source.includes("RESERVED_SEATING_SECTION_CONFIGS"));
  assert.ok(source.includes('assignedSeatIds.has(seatId) ? " seat--assigned"'));
  assert.ok(source.includes("background: #000; color: #fff"));
  assert.ok(source.includes("@page { size: landscape"));
  assert.ok(source.includes("@page { size: landscape; margin: 0.2in; }"));
  assert.ok(source.includes("max-width: 7.2in"));
  assert.ok(source.includes("min-height: 21px"));
  assert.ok(source.includes("grid-template-columns: 16px minmax(0, 1fr) 53px"));
  assert.ok(source.includes("STAGE"));
  assert.ok(source.includes("FRONT OF ROOM"));
  assert.ok(source.includes("CENTER AISLE"));
  assert.ok(source.includes("BACK OF ROOM"));
});

test("View Seats dialog adds only a print control beside the existing Close control", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const dialogStart = source.indexOf('data-testid="door-seat-dialog"');
  const dialogEnd = source.indexOf("</section>", dialogStart);
  const dialogSource = source.slice(dialogStart, dialogEnd);

  assert.ok(dialogStart >= 0);
  assert.ok(dialogSource.includes("Print Seat Map"));
  assert.ok(dialogSource.includes("printDoorSeatMap(seatView)"));
  assert.ok(dialogSource.includes("closeSeatView"));
  assert.ok(dialogSource.includes("<ReservedSeatMap"));
});
