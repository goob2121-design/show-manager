type InitialSeatMapScrollInput = {
  viewportWidth: number;
  contentWidth: number;
  aisleCenter: number;
  selectedSeatCenters?: number[];
};

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
