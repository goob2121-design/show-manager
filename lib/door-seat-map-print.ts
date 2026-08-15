import {
  RESERVED_SEATING_ROW_LABELS,
  RESERVED_SEATING_SEAT_NUMBERS,
  RESERVED_SEATING_SECTION_CONFIGS,
} from "@/lib/reserved-seating";

export type DoorSeatMapPrintDetails = {
  guestName: string;
  admissionLabel?: string;
  seatIds: string[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildDoorSeatMapPrintDocument({ guestName, admissionLabel, seatIds }: DoorSeatMapPrintDetails) {
  const assignedSeatIds = new Set(seatIds);
  const [leftSection, rightSection] = RESERVED_SEATING_SECTION_CONFIGS;
  const seatsLabel = seatIds.length > 0 ? seatIds.join(", ") : "Not selected yet";
  const seatRows = RESERVED_SEATING_ROW_LABELS.map((rowLabel) => {
    const renderSectionSeats = (sectionPrefix: string) =>
      RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
        const seatId = `${sectionPrefix}-${rowLabel}${seatNumber}`;
        const assignedClass = assignedSeatIds.has(seatId) ? " seat--assigned" : "";
        return `<div class="seat${assignedClass}" aria-label="${escapeHtml(seatId)}">${seatNumber}</div>`;
      }).join("");

    return `
      <div class="row-label">${rowLabel}</div>
      <div class="seat-row">${renderSectionSeats(leftSection.prefix)}</div>
      <div class="aisle"><span>CENTER AISLE</span></div>
      <div class="seat-row">${renderSectionSeats(rightSection.prefix)}</div>
      <div class="row-label">${rowLabel}</div>`;
  }).join("");

  const safeGuestName = escapeHtml(guestName);
  const safeAdmissionLabel = admissionLabel?.trim() ? escapeHtml(admissionLabel.trim()) : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Seat Map - ${safeGuestName}</title>
    <style>
      @page { size: landscape; margin: 0.2in; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
      body { padding: 0; }
      .sheet { width: 100%; max-width: 7.2in; margin: 0 auto; }
      .guest { margin: 0; text-align: center; font-size: 20pt; line-height: 1.05; font-weight: 800; }
      .admission { margin: 4px 0 0; text-align: center; font-size: 10pt; font-weight: 600; }
      .reserved { margin: 6px 0 7px; text-align: center; font-size: 15pt; line-height: 1.1; font-weight: 800; }
      .stage { width: 64%; margin: 0 auto 3px; border: 2px solid #000; padding: 3px; text-align: center; font-size: 13pt; font-weight: 900; letter-spacing: 0.14em; }
      .front, .back { text-align: center; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.16em; }
      .front { margin-bottom: 5px; }
      .back { margin-top: 5px; }
      .section-labels { display: grid; grid-template-columns: 16px minmax(0, 1fr) 53px minmax(0, 1fr) 16px; gap: 3px; margin-bottom: 2px; }
      .section-label { text-align: center; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.08em; }
      .map { display: grid; grid-template-columns: 16px minmax(0, 1fr) 53px minmax(0, 1fr) 16px; gap: 2px 3px; align-items: stretch; }
      .row-label { display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 900; }
      .seat-row { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 2px; }
      .seat { min-height: 21px; border: 1px solid #777; border-radius: 3px; display: flex; align-items: center; justify-content: center; background: #fff; color: #000; font-size: 8pt; font-weight: 700; }
      .seat--assigned { border: 2px solid #000; background: #000; color: #fff; font-size: 9pt; font-weight: 900; }
      .aisle { position: relative; display: flex; align-items: center; justify-content: center; border-left: 1px dashed #888; border-right: 1px dashed #888; }
      .aisle span { background: #fff; padding: 1px 2px; font-size: 6pt; font-weight: 900; letter-spacing: 0.04em; }
      .legend { display: flex; justify-content: center; gap: 16px; margin-top: 5px; font-size: 7.5pt; font-weight: 700; }
      .legend-item { display: flex; align-items: center; gap: 4px; }
      .legend-seat { width: 16px; height: 12px; border: 1px solid #777; border-radius: 2px; background: #fff; }
      .legend-seat--assigned { border: 2px solid #000; background: #000; }
      @media print {
        .sheet { break-inside: avoid; }
        .seat, .seat--assigned, .legend-seat, .legend-seat--assigned { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <h1 class="guest">${safeGuestName}</h1>
      ${safeAdmissionLabel ? `<p class="admission">${safeAdmissionLabel}</p>` : ""}
      <p class="reserved">Reserved Seats: ${escapeHtml(seatsLabel)}</p>
      <div class="stage">STAGE</div>
      <div class="front">FRONT OF ROOM</div>
      <div class="section-labels" aria-hidden="true">
        <span></span><span class="section-label">${escapeHtml(leftSection.label)}</span><span></span><span class="section-label">${escapeHtml(rightSection.label)}</span><span></span>
      </div>
      <div class="map">${seatRows}</div>
      <div class="back">BACK OF ROOM</div>
      <div class="legend">
        <span class="legend-item"><span class="legend-seat legend-seat--assigned"></span> Guest's reserved seat</span>
        <span class="legend-item"><span class="legend-seat"></span> Other seat</span>
      </div>
    </main>
  </body>
</html>`;
}

export function printDoorSeatMap(details: DoorSeatMapPrintDetails) {
  const printWindow = window.open("", "_blank", "popup,width=1200,height=850");
  if (!printWindow) return false;

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildDoorSeatMapPrintDocument(details));
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 150);
  return true;
}
