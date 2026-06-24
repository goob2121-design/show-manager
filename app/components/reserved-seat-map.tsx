"use client";

import { Fragment } from "react";
import {
  RESERVED_SEATING_ROW_LABELS,
  RESERVED_SEATING_SECTION_CONFIGS,
  RESERVED_SEATING_SEAT_NUMBERS,
  RESERVED_SEATING_VENUE,
} from "@/lib/reserved-seating";

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
  legendVariant?: "customer" | "public" | "admin";
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
): string {
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

export function ReservedSeatMap({
  seatStates,
  onSeatClick,
  title,
  helperText,
  includeSelectedLegend = true,
  showCustomerSeatDetails = true,
  legendVariant = "customer",
}: ReservedSeatMapProps) {
  const visibleLegendItems = legendVariant === "admin"
    ? adminLegendItems
    : legendVariant === "public"
      ? publicLegendItems
      : includeSelectedLegend
        ? customerLegendItems
        : publicLegendItems;

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-700 bg-[#09111f] text-slate-100 shadow-[0_18px_48px_rgba(2,6,23,0.45)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),linear-gradient(135deg,_#0b1628,_#08101d_58%,_#040910)] px-4 py-4 sm:px-5">
        {title ? <h3 className="text-base font-semibold text-white sm:text-lg">{title}</h3> : null}
        {helperText ? <p className="mt-1 text-sm text-slate-300">{helperText}</p> : null}
      </div>

      <div className="p-3 sm:p-4 lg:p-5">
        <p className="mb-3 text-xs font-medium text-slate-300 sm:hidden">
          Swipe left or right to view all seats.
        </p>

        <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x pb-2 [-webkit-overflow-scrolling:touch]">
          <div className="w-[52rem] max-w-none rounded-[1.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_center,_rgba(30,41,59,0.46),_transparent_40%),linear-gradient(180deg,_#0b1220,_#060c16)] p-2.5 sm:w-[54rem] sm:p-4 lg:mx-auto lg:w-full lg:max-w-[70rem] lg:p-4 xl:p-5">
            <div className="mx-auto max-w-[62rem]">
              <div className="mx-auto mb-3 flex max-w-[48rem] flex-col items-center gap-1 rounded-[1.2rem] border border-amber-200/20 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.26),_transparent_38%),linear-gradient(180deg,_#5b3b22,_#2a190f_58%,_#110b08)] px-3 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_rgba(0,0,0,0.35)] sm:mb-4 sm:gap-1.5 sm:px-4 sm:py-3.5">
                <div className="h-1.5 w-full rounded-full bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent)]" />
                <p className="text-[1.65rem] font-black uppercase tracking-[0.3em] text-white sm:text-[2rem] lg:text-[2.15rem]">
                  {RESERVED_SEATING_VENUE.stageLabel}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/80 sm:text-[11px]">
                  {RESERVED_SEATING_VENUE.frontLabel}
                </p>
              </div>

              <div className="grid grid-cols-[1.55rem_minmax(0,1fr)_2.8rem_minmax(0,1fr)_1.55rem] gap-x-1 gap-y-1 sm:grid-cols-[1.95rem_minmax(0,1fr)_3.65rem_minmax(0,1fr)_1.95rem] sm:gap-x-2 sm:gap-y-1.5 lg:grid-cols-[2.1rem_minmax(0,1fr)_4.25rem_minmax(0,1fr)_2.1rem] xl:grid-cols-[2.3rem_minmax(0,1fr)_4.6rem_minmax(0,1fr)_2.3rem]">
                {RESERVED_SEATING_ROW_LABELS.map((rowLabel, rowIndex) => (
                  <Fragment key={rowLabel}>
                    <div className="flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-slate-200 sm:text-base xl:text-lg">
                      {rowLabel}
                    </div>

                    <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
                      {RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
                        const seatId = `${leftSectionConfig.prefix}-${rowLabel}${seatNumber}`;
                        const seatState = seatStates[seatId];
                        const titleText =
                          showCustomerSeatDetails && seatState?.customerName
                            ? `${seatState.label} - ${seatState.customerName}`
                            : seatState?.label;
                        return (
                          <button
                            key={seatId}
                            type="button"
                            onClick={() => onSeatClick?.(seatId)}
                            disabled={Boolean(seatState?.disabled)}
                            title={titleText}
                            tabIndex={onSeatClick ? undefined : -1}
                            className={`aspect-square min-h-[2.25rem] rounded-[0.58rem] border px-0 text-[0.78rem] font-bold leading-none transition sm:min-h-[2rem] sm:text-xs lg:min-h-[2.05rem] xl:min-h-[2.2rem] xl:text-[0.8rem] ${onSeatClick ? "" : "cursor-default"} ${getSeatButtonClasses(
                              seatState?.status ?? "available",
                              Boolean(seatState?.disabled),
                            )}`}
                          >
                            {seatNumber}
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative flex items-center justify-center overflow-hidden rounded-[0.8rem] border border-dashed border-slate-700/80 bg-slate-950/40 px-1 text-center">
                      <div className="absolute inset-y-1/2 left-1 right-1 h-px -translate-y-1/2 bg-white/12" />
                      <span className="relative bg-[#0b1220] px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:text-[9px] xl:text-[10px]">
                        {RESERVED_SEATING_VENUE.aisleLabelRows.includes(rowIndex as 0 | 4 | 7)
                          ? RESERVED_SEATING_VENUE.aisleLabel
                          : ""}
                      </span>
                    </div>

                    <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
                      {RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
                        const seatId = `${rightSectionConfig.prefix}-${rowLabel}${seatNumber}`;
                        const seatState = seatStates[seatId];
                        const titleText =
                          showCustomerSeatDetails && seatState?.customerName
                            ? `${seatState.label} - ${seatState.customerName}`
                            : seatState?.label;
                        return (
                          <button
                            key={seatId}
                            type="button"
                            onClick={() => onSeatClick?.(seatId)}
                            disabled={Boolean(seatState?.disabled)}
                            title={titleText}
                            tabIndex={onSeatClick ? undefined : -1}
                            className={`aspect-square min-h-[2.25rem] rounded-[0.58rem] border px-0 text-[0.78rem] font-bold leading-none transition sm:min-h-[2rem] sm:text-xs lg:min-h-[2.05rem] xl:min-h-[2.2rem] xl:text-[0.8rem] ${onSeatClick ? "" : "cursor-default"} ${getSeatButtonClasses(
                              seatState?.status ?? "available",
                              Boolean(seatState?.disabled),
                            )}`}
                          >
                            {seatNumber}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-center text-xs font-black uppercase tracking-[0.16em] text-slate-200 sm:text-base xl:text-lg">
                      {rowLabel}
                    </div>
                  </Fragment>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-center sm:mt-4">
                <div className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400 sm:px-4 sm:text-xs">
                  {RESERVED_SEATING_VENUE.backLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-4 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-200 sm:grid-cols-2 ${
          visibleLegendItems.length > 3 ? "xl:grid-cols-5" : "xl:grid-cols-3"
        }`}>
          {visibleLegendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2">
              <span className={`h-4 w-4 rounded-md border ${item.classes}`} />
              <span className="font-semibold">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
