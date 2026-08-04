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

test("rejects Safari's incomplete first-pass measurements and accepts a later valid layout", async () => {
  const { isValidInitialSeatMapMeasurement } = await scrollModulePromise;
  const delayedLayout = {
    viewportWidth: 0,
    contentWidth: 0,
    aisleWidth: 0,
    aisleLeft: 0,
    aisleRight: 0,
    mapLeft: 0,
    mapRight: 0,
    target: Number.NaN,
  };
  const completedLayout = {
    viewportWidth: 320,
    contentWidth: 900,
    aisleWidth: 48,
    aisleLeft: 426,
    aisleRight: 474,
    mapLeft: 0,
    mapRight: 900,
    target: 290,
  };

  assert.equal(isValidInitialSeatMapMeasurement(delayedLayout), false);
  assert.equal(isValidInitialSeatMapMeasurement(completedLayout), true);
  assert.equal(isValidInitialSeatMapMeasurement({ ...completedLayout, contentWidth: 320 }), false);
  assert.equal(isValidInitialSeatMapMeasurement({ ...completedLayout, aisleRight: 920 }), false);
});
