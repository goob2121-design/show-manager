import type { BatchSettings, PrintRecord, PrintTemplate } from "./types";

type PaperDimensions = {
  width: number;
  height: number;
};

const STANDARD_PAPER_DIMENSIONS: Record<Exclude<BatchSettings["paperSize"], "custom">, PaperDimensions> = {
  letter: { width: 8.5, height: 11 },
  legal: { width: 8.5, height: 14 },
  a4: { width: 8.2677, height: 11.6929 },
};

export type BatchPageLayout = {
  pageWidth: number;
  pageHeight: number;
  availableWidth: number;
  availableHeight: number;
  columns: number;
  rows: number;
  capacity: number;
  contentWidth: number;
  contentHeight: number;
  offsetLeft: number;
  offsetTop: number;
};

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getBatchPaperDimensions(settings: BatchSettings): PaperDimensions {
  const base = settings.paperSize === "custom"
    ? {
        width: positive(settings.customPageWidthInches, 8.5),
        height: positive(settings.customPageHeightInches, 11),
      }
    : STANDARD_PAPER_DIMENSIONS[settings.paperSize] ?? STANDARD_PAPER_DIMENSIONS.letter;

  if (settings.pageOrientation === "landscape") {
    return {
      width: Math.max(base.width, base.height),
      height: Math.min(base.width, base.height),
    };
  }

  return {
    width: Math.min(base.width, base.height),
    height: Math.max(base.width, base.height),
  };
}

export function calculateBatchPageLayout(template: PrintTemplate, settings: BatchSettings): BatchPageLayout {
  const paper = getBatchPaperDimensions(settings);
  const ticketWidth = positive(template.widthInches, 5.5);
  const ticketHeight = positive(template.heightInches, 2);
  const horizontalGap = Math.max(0, settings.horizontalGapInches);
  const verticalGap = Math.max(0, settings.verticalGapInches);
  const availableWidth = Math.max(0, paper.width - settings.marginLeftInches - settings.marginRightInches);
  const availableHeight = Math.max(0, paper.height - settings.marginTopInches - settings.marginBottomInches);
  const columns = Math.max(1, Math.floor((availableWidth + horizontalGap) / (ticketWidth + horizontalGap)));
  const rows = Math.max(1, Math.floor((availableHeight + verticalGap) / (ticketHeight + verticalGap)));
  const capacity = Math.max(1, columns * rows);
  const contentWidth = columns * ticketWidth + Math.max(0, columns - 1) * horizontalGap;
  const contentHeight = rows * ticketHeight + Math.max(0, rows - 1) * verticalGap;

  return {
    pageWidth: paper.width,
    pageHeight: paper.height,
    availableWidth,
    availableHeight,
    columns,
    rows,
    capacity,
    contentWidth,
    contentHeight,
    offsetLeft: settings.marginLeftInches + Math.max(0, (availableWidth - contentWidth) / 2),
    offsetTop: settings.marginTopInches,
  };
}

export function chunkBatchRecords(records: PrintRecord[], capacity: number) {
  const chunkSize = Math.max(1, capacity);
  return Array.from({ length: Math.ceil(records.length / chunkSize) }, (_, index) => records.slice(index * chunkSize, index * chunkSize + chunkSize));
}
