"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import {
  RESERVED_SEATING_ROW_LABELS,
  RESERVED_SEATING_SECTION_CONFIGS,
  RESERVED_SEATING_SEAT_NUMBERS,
  RESERVED_SEATING_VENUE,
} from "@/lib/reserved-seating";
import { getInitialSeatMapScrollLeft } from "@/lib/reserved-seat-map-scroll";

export type ReservedSeatMapSeatState = {
  seatId: string;
  label: string;
  status: "available" | "assigned" | "unavailable" | "selected" | "paid_reserved" | "comp" | "guest";
  customerName?: string | null;
  disabled?: boolean;
};

type ReservedSeatMapProps = {
  seatStates: Record<string, ReservedSeatMapSeatState>;
  onSeatClick?: (seatId: string) => void;
  title?: string;
  helperText?: string;
  includeSelectedLegend?: boolean;
  showCustomerSeatDetails?: boolean;
  legendVariant?: "customer" | "public" | "admin" | "door-readonly" | "sponsor-packet";
  chromeVariant?: "stageflow" | "cmms-public" | "sponsor-packet";
  sizeVariant?: "default" | "compact";
  initialMobileView?: "center-aisle";
};

const customerLegendItems = [
  { label: "Available", classes: "border-emerald-400/70 bg-emerald-500 text-white shadow-[0_0_18px_rgba(34,197,94,0.24)]" },
  { label: "Taken", classes: "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.22)]" },
  { label: "Unavailable", classes: "border-slate-500/80 bg-slate-500 text-white" },
  { label: "Your Selected Seats", classes: "border-amber-300/80 bg-amber-400 text-stone-950 shadow-[0_0_20px_rgba(251,191,36,0.26)]" },
] as const;

const publicLegendItems = [
  { label: "Available", classes: "border-emerald-400/70 bg-emerald-500 text-white shadow-[0_0_18px_rgba(34,197,94,0.24)]" },
  { label: "Taken", classes: "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.22)]" },
  { label: "Unavailable", classes: "border-slate-500/80 bg-slate-500 text-white" },
] as const;

const doorReadOnlyLegendItems = [
  { label: "Guest's Seats", classes: "border-amber-300/80 bg-amber-400 text-stone-950" },
  { label: "Other Seats", classes: "border-slate-500/80 bg-slate-500 text-white" },
] as const;

const sponsorPacketLegendItems = [
  { label: "Your Reserved Seats", classes: "border-[#5f430f] bg-[#d6af45] text-[#1f1505]" },
] as const;

const adminLegendItems = [
  { label: "Available", classes: "border-emerald-400/70 bg-emerald-500 text-white shadow-[0_0_18px_rgba(34,197,94,0.24)]" },
  { label: "Paid Reserved", classes: "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.22)]" },
  { label: "Comp", classes: "border-violet-400/70 bg-violet-500 text-white shadow-[0_0_18px_rgba(139,92,246,0.24)]" },
  { label: "Guest", classes: "border-orange-400/70 bg-orange-500 text-white shadow-[0_0_18px_rgba(249,115,22,0.24)]" },
  { label: "Unavailable", classes: "border-slate-500/80 bg-slate-500 text-white" },
] as const;

function getSeatButtonClasses(
  status: ReservedSeatMapSeatState["status"],
  disabled: boolean,
  chromeVariant: ReservedSeatMapProps["chromeVariant"] = "stageflow",
): string {
  const isSponsorPacket = chromeVariant === "sponsor-packet";

  if (isSponsorPacket) {
    if (status === "selected") {
      return disabled
        ? "cursor-not-allowed border-[#5f430f] bg-[#d6af45] text-[#1f1505] opacity-100 shadow-none"
        : "border-[#5f430f] bg-[#d6af45] text-[#1f1505] shadow-none hover:bg-[#cfaa41]";
    }

    if (disabled) {
      return "cursor-not-allowed border-stone-400 bg-stone-100 text-stone-600 opacity-100";
    }

    return "border-stone-400 bg-stone-100 text-stone-600 shadow-none hover:bg-stone-100";
  }

  if (status === "selected") {
    return disabled
      ? "cursor-not-allowed border-amber-300/80 bg-amber-400 text-stone-950 opacity-100 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
      : "border-amber-300/80 bg-amber-400 text-stone-950 shadow-[0_0_18px_rgba(251,191,36,0.25)] hover:bg-amber-300";
  }

  if (disabled) {
    return `cursor-not-allowed opacity-85 ${getSeatButtonClasses(status, false)}`;
  }

  switch (status) {
    case "assigned":
    case "paid_reserved":
      return "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.18)] hover:bg-rose-400";
    case "comp":
      return "border-violet-400/70 bg-violet-500 text-white shadow-[0_0_16px_rgba(139,92,246,0.2)] hover:bg-violet-400";
    case "guest":
      return "border-orange-400/70 bg-orange-500 text-white shadow-[0_0_16px_rgba(249,115,22,0.2)] hover:bg-orange-400";
    case "unavailable":
      return "border-slate-500/80 bg-slate-500 text-white hover:bg-slate-400";
    default:
      return "border-emerald-400/70 bg-emerald-600 text-white shadow-[0_0_16px_rgba(34,197,94,0.18)] hover:bg-emerald-500";
  }
}

const [leftSectionConfig, rightSectionConfig] = RESERVED_SEATING_SECTION_CONFIGS;

function getPublicSeatStatus(status: ReservedSeatMapSeatState["status"] | undefined) {
  if (!status || status === "available") return "available";
  if (status === "selected") return "selected";
  if (status === "unavailable") return "unavailable";
  return "taken";
}

function getSeatLabels(
  seatId: string,
  seatState: ReservedSeatMapSeatState | undefined,
  showCustomerSeatDetails: boolean,
) {
  const seatLabel = seatState?.label ?? seatId;
  const publicStatus = getPublicSeatStatus(seatState?.status);

  if (showCustomerSeatDetails && seatState?.customerName) {
    return {
      title: `${seatLabel} - ${seatState.customerName}`,
      ariaLabel: `Seat ${seatLabel}, assigned to ${seatState.customerName}`,
    };
  }

  const titleStatus = publicStatus === "available"
    ? "Available"
    : publicStatus === "selected"
      ? "Selected"
      : publicStatus === "unavailable"
        ? "Unavailable"
        : "Taken";

  return {
    title: `${seatLabel} — ${titleStatus}`,
    ariaLabel: `Seat ${seatLabel}, ${publicStatus}`,
  };
}

export function ReservedSeatMap({
  seatStates,
  onSeatClick,
  title,
  helperText,
  includeSelectedLegend = true,
  showCustomerSeatDetails = false,
  legendVariant = "customer",
  chromeVariant = "stageflow",
  sizeVariant = "default",
  initialMobileView,
}: ReservedSeatMapProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hasAppliedInitialMobileView = useRef(false);
  const visibleLegendItems = legendVariant === "door-readonly"
    ? doorReadOnlyLegendItems
    : legendVariant === "sponsor-packet"
      ? sponsorPacketLegendItems
    : legendVariant === "admin"
      ? adminLegendItems
      : legendVariant === "public"
      ? publicLegendItems
      : includeSelectedLegend
        ? customerLegendItems
        : publicLegendItems;

  const isCmmsPublic = chromeVariant === "cmms-public";
  const isSponsorPacket = chromeVariant === "sponsor-packet";
  const isCompact = sizeVariant === "compact";

  useLayoutEffect(() => {
    if (initialMobileView !== "center-aisle" || hasAppliedInitialMobileView.current) return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    const scroller = scrollerRef.current;
    const aisle = scroller?.querySelector<HTMLElement>("[data-seat-map-center-aisle='true']");
    if (!scroller || !aisle || scroller.clientWidth === 0 || scroller.scrollWidth === 0) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const aisleRect = aisle.getBoundingClientRect();
    const toContentCenter = (rect: DOMRect) => rect.left - scrollerRect.left + scroller.scrollLeft + rect.width / 2;
    const selectedSeatCenters = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-seat-map-selected='true']"),
      (seat) => toContentCenter(seat.getBoundingClientRect()),
    );

    hasAppliedInitialMobileView.current = true;
    scroller.scrollLeft = getInitialSeatMapScrollLeft({
      viewportWidth: scroller.clientWidth,
      contentWidth: scroller.scrollWidth,
      aisleCenter: toContentCenter(aisleRect),
      selectedSeatCenters,
    });
  }, [initialMobileView]);

  return (
    <>
      <style jsx global>{`
        @media print {
          .packet-sponsor-seat--selected,
          .packet-sponsor-seat-legend {
            background-color: #d4a72c !important;
            color: #111111 !important;
            border-color: #5a4300 !important;
            font-weight: 700 !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            -webkit-text-fill-color: #111111 !important;
            box-shadow: inset 0 0 0 999px #d4a72c !important;
          }

          .packet-sponsor-seat--neutral {
            background-color: #f5f5f4 !important;
            color: #57534e !important;
            border-color: #a8a29e !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            -webkit-text-fill-color: #57534e !important;
            box-shadow: inset 0 0 0 999px #f5f5f4 !important;
          }

          .packet-sponsor-seat-map,
          .packet-sponsor-seat-map * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      <div
        className={isSponsorPacket
        ? "w-full max-w-full overflow-hidden text-[#050505] shadow-none"
        : isCmmsPublic
        ? "w-full max-w-full overflow-hidden rounded-[1.6rem] border border-[rgba(200,155,60,0.16)] bg-[linear-gradient(180deg,rgba(10,14,21,0.98),rgba(6,9,15,0.98))] text-[#f5f1e8] shadow-[0_20px_44px_rgba(0,0,0,0.28)]"
        : "w-full max-w-full overflow-hidden rounded-[1.75rem] border border-slate-700 bg-[#09111f] text-slate-100 shadow-[0_18px_48px_rgba(2,6,23,0.45)]"}
      >
      {title || helperText ? (
        <div
          className={isSponsorPacket
            ? "px-0 pb-2"
            : isCmmsPublic
            ? "border-b border-[rgba(200,155,60,0.14)] bg-[linear-gradient(180deg,rgba(28,20,12,0.58),rgba(12,15,20,0.9))] px-4 py-3.5 sm:px-5"
            : "border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),linear-gradient(135deg,_#0b1628,_#08101d_58%,_#040910)] px-4 py-4 sm:px-5"}
        >
          {title ? <h3 className={isSponsorPacket ? "text-base font-semibold text-[#050505]" : isCmmsPublic ? "text-base font-semibold text-[#f5f1e8] sm:text-lg" : "text-base font-semibold text-white sm:text-lg"}>{title}</h3> : null}
          {helperText ? <p className={isSponsorPacket ? "mt-1 text-sm text-[#333333]" : isCmmsPublic ? "mt-1 text-sm text-[#d9d0c2]" : "mt-1 text-sm text-slate-300"}>{helperText}</p> : null}
        </div>
      ) : null}

      <div className={`w-full max-w-full overflow-hidden ${isSponsorPacket ? (isCompact ? "p-0" : "p-0") : isCompact ? "p-2.5 sm:p-3" : "p-3 sm:p-4 lg:p-5"}`}>
        {initialMobileView === "center-aisle" ? (
          <p
            className={isCmmsPublic
              ? "pointer-events-none mx-auto mb-3 w-full max-w-full overflow-hidden rounded-lg border border-[rgba(200,155,60,0.42)] bg-[rgba(200,155,60,0.1)] px-3 py-2 text-center text-[#f5f1e8] lg:hidden"
              : "pointer-events-none mx-auto mb-3 w-full max-w-full overflow-hidden rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-center text-slate-100 lg:hidden"}
          >
            Swipe left or right to view all seats.
          </p>
        ) : !isSponsorPacket ? (
          <div
            aria-label="This auditorium has two seating sections: left and right, separated by a center aisle. Swipe the seating chart below left or right to view both sides."
            className={isCmmsPublic
              ? "pointer-events-none mx-auto mb-3 w-full max-w-full overflow-hidden rounded-lg border border-[rgba(200,155,60,0.42)] bg-[rgba(200,155,60,0.1)] px-3 py-2 text-center text-[#f5f1e8] lg:hidden"
              : "pointer-events-none mx-auto mb-3 w-full max-w-full overflow-hidden rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-center text-slate-100 lg:hidden"}
          >
            <p aria-hidden="true" className="text-xs leading-snug text-[#d9d0c2]">
              This auditorium has <strong className="font-extrabold text-[#d6af45]">TWO</strong> seating sections: <strong className="font-extrabold text-[#d6af45]">LEFT</strong> and <strong className="font-extrabold text-[#d6af45]">RIGHT</strong>, separated by a center aisle.
            </p>
            <p aria-hidden="true" className="mt-1.5 text-sm font-semibold leading-snug">
              ⬇️ Swipe the seating chart <strong className="font-extrabold text-[#d6af45]">BELOW</strong> left or right to view <strong className="font-extrabold text-[#d6af45]">BOTH</strong> sides. ⬇️
            </p>
          </div>
        ) : null}
        <p
          aria-label="Swipe left or right to view both sides of the auditorium."
          className={isSponsorPacket
            ? "mx-auto mb-3 max-w-full rounded-lg border border-[#8a6524]/50 bg-[#1c140b]/5 px-3 py-2 text-center text-base font-bold leading-snug text-stone-700 break-words sm:text-sm sm:font-semibold lg:mb-2 lg:border-transparent lg:bg-transparent lg:py-1 lg:text-xs lg:font-medium"
            : isCmmsPublic
            ? "mx-auto mb-2 hidden max-w-full rounded-lg border border-[rgba(200,155,60,0.16)] bg-transparent px-3 py-1 text-center text-xs font-medium leading-snug text-[#f5f1e8] break-words lg:block"
            : "mx-auto mb-2 hidden max-w-full rounded-lg border border-white/10 bg-transparent px-3 py-1 text-center text-xs font-medium leading-snug text-slate-100 break-words lg:block"}
        >
          <span aria-hidden="true">⬅️ Swipe left or right to view </span>
          <strong aria-hidden="true" className={isSponsorPacket ? "text-[#8a6524]" : isCmmsPublic ? "text-[#d6af45]" : "text-amber-300"}>BOTH sides</strong>
          <span aria-hidden="true"> of the auditorium ➡️</span>
        </p>

        <div ref={scrollerRef} className="w-full max-w-full overflow-x-auto overscroll-x-contain touch-pan-x pb-2 [-webkit-overflow-scrolling:touch]">
          <div
            className={isSponsorPacket
              ? "min-w-[620px] bg-white p-1.5 sm:min-w-[700px] sm:p-2 lg:mx-auto lg:min-w-0 lg:w-full lg:max-w-[45rem] lg:p-2"
              : isCmmsPublic
              ? "min-w-[900px] rounded-[1.1rem] border border-[rgba(200,155,60,0.14)] bg-[radial-gradient(circle_at_top_center,_rgba(200,155,60,0.09),_transparent_36%),linear-gradient(180deg,_#0d1016,_#080b10)] p-2.5 sm:min-w-[920px] sm:p-4 lg:mx-auto lg:min-w-0 lg:w-full lg:max-w-[70rem] lg:p-4 xl:p-5"
              : "min-w-[900px] rounded-[1.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_center,_rgba(30,41,59,0.46),_transparent_40%),linear-gradient(180deg,_#0b1220,_#060c16)] p-2.5 sm:min-w-[920px] sm:p-4 lg:mx-auto lg:min-w-0 lg:w-full lg:max-w-[70rem] lg:p-4 xl:p-5"}
          >
            <div className={isSponsorPacket ? "mx-auto max-w-[44rem]" : "mx-auto max-w-[62rem]"}>
              <div
                className={isSponsorPacket
                  ? "mx-auto mb-2.5 flex max-w-[32rem] flex-col items-center gap-0.5 rounded-[0.75rem] border border-[#8a6524] bg-[linear-gradient(180deg,_#6b4a23,_#2e1f0f_62%,_#15100b)] px-2.5 py-2 text-center shadow-none sm:mb-3 sm:px-3 sm:py-2.5"
                  : isCmmsPublic
                  ? "mx-auto mb-3 flex max-w-[48rem] flex-col items-center gap-1 rounded-[1.05rem] border border-[rgba(200,155,60,0.18)] bg-[radial-gradient(circle_at_top,_rgba(200,155,60,0.18),_transparent_42%),linear-gradient(180deg,_#4a331c,_#1d140d_62%,_#0d0907)] px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_28px_rgba(0,0,0,0.26)] sm:mb-4 sm:gap-1.5 sm:px-4 sm:py-3"
                  : "mx-auto mb-3 flex max-w-[48rem] flex-col items-center gap-1 rounded-[1.2rem] border border-amber-200/20 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.26),_transparent_38%),linear-gradient(180deg,_#5b3b22,_#2a190f_58%,_#110b08)] px-3 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_rgba(0,0,0,0.35)] sm:mb-4 sm:gap-1.5 sm:px-4 sm:py-3.5"}
              >
                <div className="h-1.5 w-full rounded-full bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent)]" />
                <p className={`${isCompact ? "text-[1rem] sm:text-[1.2rem] lg:text-[1.35rem]" : "text-[1.65rem] sm:text-[2rem] lg:text-[2.15rem]"} font-black uppercase tracking-[0.3em] text-white`}>
                  {RESERVED_SEATING_VENUE.stageLabel}
                </p>
                <p className={isSponsorPacket ? "text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f3dd9b] sm:text-[11px]" : isCmmsPublic ? "text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f0d486]/80 sm:text-[11px]" : "text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/80 sm:text-[11px]"}>
                  {RESERVED_SEATING_VENUE.frontLabel}
                </p>
              </div>

              <div className={`${isCompact ? "grid-cols-[1.45rem_minmax(0,1fr)_2.3rem_minmax(0,1fr)_1.45rem] gap-x-1 gap-y-1 sm:grid-cols-[1.8rem_minmax(0,1fr)_3rem_minmax(0,1fr)_1.8rem] sm:gap-x-1.5 sm:gap-y-1.5 lg:grid-cols-[1.95rem_minmax(0,1fr)_3.55rem_minmax(0,1fr)_1.95rem]" : "grid-cols-[1.55rem_minmax(0,1fr)_2.8rem_minmax(0,1fr)_1.55rem] gap-x-1 gap-y-1 sm:grid-cols-[1.95rem_minmax(0,1fr)_3.65rem_minmax(0,1fr)_1.95rem] sm:gap-x-2 sm:gap-y-1.5 lg:grid-cols-[2.1rem_minmax(0,1fr)_4.25rem_minmax(0,1fr)_2.1rem] xl:grid-cols-[2.3rem_minmax(0,1fr)_4.6rem_minmax(0,1fr)_2.3rem]"} grid`}>
                {RESERVED_SEATING_ROW_LABELS.map((rowLabel, rowIndex) => (
                  <Fragment key={rowLabel}>
                    <div className={isSponsorPacket ? "flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-[#1f1f1f] sm:text-sm lg:text-base" : isCmmsPublic ? "flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-[#efe5d6] sm:text-base xl:text-lg" : "flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-slate-200 sm:text-base xl:text-lg"}>
                      {rowLabel}
                    </div>

                    <div className={`grid grid-cols-10 ${isCompact ? "gap-0.5 sm:gap-1" : "gap-1 sm:gap-1.5"}`}>
                      {RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
                        const seatId = `${leftSectionConfig.prefix}-${rowLabel}${seatNumber}`;
                        const seatState = seatStates[seatId];

                        const seatLabels = getSeatLabels(seatId, seatState, showCustomerSeatDetails);
                        return (
                          <button
                            key={seatId}
                            type="button"
                            data-seat-map-selected={seatState?.status === "selected" ? "true" : undefined}
                            onClick={() => onSeatClick?.(seatId)}
                            disabled={Boolean(seatState?.disabled)}
                            title={seatLabels.title}
                            aria-label={seatLabels.ariaLabel}
                            tabIndex={onSeatClick ? undefined : -1}
                            className={`${isCompact ? "min-h-[1.35rem] rounded-[0.4rem] text-[0.58rem] sm:min-h-[1.5rem] sm:text-[0.64rem] lg:min-h-[1.55rem]" : "min-h-[2.25rem] rounded-[0.58rem] text-[0.78rem] sm:min-h-[2rem] sm:text-xs lg:min-h-[2.05rem] xl:min-h-[2.2rem] xl:text-[0.8rem]"} aspect-square border px-0 font-bold leading-none transition ${onSeatClick ? "" : "cursor-default"} ${isSponsorPacket ? "packet-sponsor-seat-map" : ""} ${isSponsorPacket ? seatState?.status === "selected" ? "packet-sponsor-seat--selected" : "packet-sponsor-seat--neutral" : ""} ${getSeatButtonClasses(
                              seatState?.status ?? "available",
                              Boolean(seatState?.disabled),
                              chromeVariant,
                            )}`}
                          >
                            {seatNumber}
                          </button>
                        );
                      })}
                    </div>

                    <div data-seat-map-center-aisle={rowIndex === 0 ? "true" : undefined} className={isSponsorPacket ? "relative flex items-center justify-center overflow-hidden rounded-[0.7rem] border border-dashed border-stone-400 bg-stone-50 px-1 text-center" : isCmmsPublic ? "relative flex items-center justify-center overflow-hidden rounded-[0.8rem] border border-dashed border-[rgba(200,155,60,0.12)] bg-[#080b10] px-1 text-center" : "relative flex items-center justify-center overflow-hidden rounded-[0.8rem] border border-dashed border-slate-700/80 bg-slate-950/40 px-1 text-center"}>
                      <div className="absolute inset-y-1/2 left-1 right-1 h-px -translate-y-1/2 bg-white/12" />
                      <span className={isSponsorPacket ? "relative bg-stone-50 px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-[#444444] sm:text-[9px]" : isCmmsPublic ? "relative bg-[#0b0f14] px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-[#bda883] sm:text-[9px] xl:text-[10px]" : "relative bg-[#0b1220] px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:text-[9px] xl:text-[10px]"}>
                        {RESERVED_SEATING_VENUE.aisleLabelRows.includes(rowIndex as 0 | 4 | 7)
                          ? RESERVED_SEATING_VENUE.aisleLabel
                          : ""}
                      </span>
                    </div>

                    <div className={`grid grid-cols-10 ${isCompact ? "gap-0.5 sm:gap-1" : "gap-1 sm:gap-1.5"}`}>
                      {RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
                        const seatId = `${rightSectionConfig.prefix}-${rowLabel}${seatNumber}`;
                        const seatState = seatStates[seatId];

                        const seatLabels = getSeatLabels(seatId, seatState, showCustomerSeatDetails);
                        return (
                          <button
                            key={seatId}
                            type="button"
                            data-seat-map-selected={seatState?.status === "selected" ? "true" : undefined}
                            onClick={() => onSeatClick?.(seatId)}
                            disabled={Boolean(seatState?.disabled)}
                            title={seatLabels.title}
                            aria-label={seatLabels.ariaLabel}
                            tabIndex={onSeatClick ? undefined : -1}
                            className={`${isCompact ? "min-h-[1.35rem] rounded-[0.4rem] text-[0.58rem] sm:min-h-[1.5rem] sm:text-[0.64rem] lg:min-h-[1.55rem]" : "min-h-[2.25rem] rounded-[0.58rem] text-[0.78rem] sm:min-h-[2rem] sm:text-xs lg:min-h-[2.05rem] xl:min-h-[2.2rem] xl:text-[0.8rem]"} aspect-square border px-0 font-bold leading-none transition ${onSeatClick ? "" : "cursor-default"} ${isSponsorPacket ? "packet-sponsor-seat-map" : ""} ${isSponsorPacket ? seatState?.status === "selected" ? "packet-sponsor-seat--selected" : "packet-sponsor-seat--neutral" : ""} ${getSeatButtonClasses(
                              seatState?.status ?? "available",
                              Boolean(seatState?.disabled),
                              chromeVariant,
                            )}`}
                          >
                            {seatNumber}
                          </button>
                        );
                      })}
                    </div>

                    <div className={isSponsorPacket ? "flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-[#1f1f1f] sm:text-sm lg:text-base" : isCmmsPublic ? "flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-[#efe5d6] sm:text-base xl:text-lg" : "flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-slate-200 sm:text-base xl:text-lg"}>
                      {rowLabel}
                    </div>
                  </Fragment>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-center sm:mt-4">
                <div className={isSponsorPacket ? "rounded-full border border-stone-400 bg-stone-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#444444] sm:px-4 sm:text-xs" : isCmmsPublic ? "rounded-full border border-[rgba(200,155,60,0.12)] bg-[#0b0f14] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#bda883] sm:px-4 sm:text-xs" : "rounded-full border border-white/10 bg-slate-950/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400 sm:px-4 sm:text-xs"}>
                  {RESERVED_SEATING_VENUE.backLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-3 ${isSponsorPacket ? "flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] sm:text-xs" : "grid gap-2 rounded-2xl p-3 text-xs sm:grid-cols-2"} ${
          isSponsorPacket
            ? "text-stone-700"
            : isCmmsPublic
            ? "border border-[rgba(200,155,60,0.12)] bg-[rgba(255,255,255,0.03)] text-[#e8decf]"
            : "border border-white/10 bg-slate-950/40 text-slate-200"
        } ${visibleLegendItems.length > 3 ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>
          {visibleLegendItems.map((item) => (
            <div key={item.label} className={isSponsorPacket ? "flex items-center gap-2" : isCmmsPublic ? "flex items-center gap-2.5 rounded-xl border border-[rgba(200,155,60,0.08)] bg-[rgba(255,255,255,0.02)] px-3 py-2" : "flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2"}>
              <span className={`h-4 w-4 rounded-md border ${isSponsorPacket ? "packet-sponsor-seat-legend" : ""} ${item.classes}`} />
              <span className="font-semibold">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
