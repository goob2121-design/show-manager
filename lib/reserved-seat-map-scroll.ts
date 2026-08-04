type InitialSeatMapScrollInput = {
  viewportWidth: number;
  contentWidth: number;
  aisleCenter: number;
  selectedSeatCenters?: number[];
};

type InitialSeatMapMeasurement = {
  viewportWidth: number;
  contentWidth: number;
  aisleWidth: number;
  aisleLeft: number;
  aisleRight: number;
  mapLeft: number;
  mapRight: number;
  target: number;
};

export function isValidInitialSeatMapMeasurement(measurement: InitialSeatMapMeasurement) {
  const values = Object.values(measurement);
  return values.every(Number.isFinite)
    && measurement.viewportWidth > 0
    && measurement.contentWidth > measurement.viewportWidth
    && measurement.aisleWidth > 0
    && measurement.mapRight > measurement.mapLeft
    && measurement.aisleLeft >= measurement.mapLeft
    && measurement.aisleRight <= measurement.mapRight
    && measurement.target >= 0
    && measurement.target <= measurement.contentWidth - measurement.viewportWidth;
}

function centeredScrollLeft(targetCenter: number, viewportWidth: number, contentWidth: number) {
  return Math.min(
    Math.max(targetCenter - viewportWidth / 2, 0),
    Math.max(contentWidth - viewportWidth, 0),
  );
}

export function getInitialSeatMapScrollLeft({
  viewportWidth,
  contentWidth,
  aisleCenter,
  selectedSeatCenters = [],
}: InitialSeatMapScrollInput) {
  const aisleScrollLeft = centeredScrollLeft(aisleCenter, viewportWidth, contentWidth);
  const aisleViewportRight = aisleScrollLeft + viewportWidth;
  const showsSelectedSeat = selectedSeatCenters.some(
    (seatCenter) => seatCenter >= aisleScrollLeft && seatCenter <= aisleViewportRight,
  );

  if (selectedSeatCenters.length === 0 || showsSelectedSeat) return aisleScrollLeft;

  const selectedLeft = Math.min(...selectedSeatCenters);
  const selectedRight = Math.max(...selectedSeatCenters);
  return centeredScrollLeft((selectedLeft + selectedRight) / 2, viewportWidth, contentWidth);
}
