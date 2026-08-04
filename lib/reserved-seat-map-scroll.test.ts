import assert from "node:assert/strict";
import test from "node:test";

const scrollModulePromise = import(new URL("./reserved-seat-map-scroll.ts", import.meta.url).href);

test("centers the aisle so both seating sections are partially visible", async () => {
  const { getInitialSeatMapScrollLeft } = await scrollModulePromise;
  const scrollLeft = getInitialSeatMapScrollLeft({
    viewportWidth: 360,
    contentWidth: 900,
    aisleCenter: 450,
  });

  assert.equal(scrollLeft, 270);
  assert.ok(scrollLeft < 450);
  assert.ok(scrollLeft + 360 > 450);
});

test("prioritizes existing selected seats only when aisle centering would hide all of them", async () => {
  const { getInitialSeatMapScrollLeft } = await scrollModulePromise;
  assert.equal(getInitialSeatMapScrollLeft({
    viewportWidth: 360,
    contentWidth: 900,
    aisleCenter: 450,
    selectedSeatCenters: [110, 150],
  }), 0);

  assert.equal(getInitialSeatMapScrollLeft({
    viewportWidth: 360,
    contentWidth: 900,
    aisleCenter: 450,
    selectedSeatCenters: [300],
  }), 270);
});
