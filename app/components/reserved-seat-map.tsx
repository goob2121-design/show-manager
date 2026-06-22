"use client";

import { Fragment } from "react";
import { RESERVED_SEATING_ROW_LABELS, RESERVED_SEATING_SECTION_LABELS, RESERVED_SEATING_SEAT_NUMBERS } from "@/lib/reserved-seating";

export type ReservedSeatMapSeatState = {
  seatId: string;
  label: string;
  status: "available" | "assigned" | "unavailable" | "selected";
  customerName?: string | null;
  disabled?: boolean;
};

type ReservedSeatMapProps = {
  seatStates: Record<string, ReservedSeatMapSeatState>;
  onSeatClick?: (seatId: string) => void;
  title?: string;
  helperText?: string;
};

const legendItems = [
  { label: "Available", classes: "border-emerald-400/70 bg-emerald-500 text-white shadow-[0_0_18px_rgba(34,197,94,0.24)]" },
  { label: "Taken / Assigned", classes: "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.22)]" },
  { label: "Unavailable / Blocked", classes: "border-slate-500/80 bg-slate-500 text-white" },
  { label: "Your Selected Seats", classes: "border-amber-300/80 bg-amber-400 text-stone-950 shadow-[0_0_20px_rgba(251,191,36,0.26)]" },
] as const;

function getSeatButtonClasses(status: ReservedSeatMapSeatState["status"], disabled: boolean) {
  if (disabled) {
    return "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500 opacity-70";
  }

  switch (status) {
    case "selected":
      return "border-amber-300/80 bg-amber-400 text-stone-950 shadow-[0_0_18px_rgba(251,191,36,0.25)] hover:bg-amber-300";
    case "assigned":
      return "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.18)] hover:bg-rose-400";
    case "unavailable":
      return "border-slate-500/80 bg-slate-500 text-white hover:bg-slate-400";
    default:
      return "border-emerald-400/70 bg-emerald-600 text-white shadow-[0_0_16px_rgba(34,197,94,0.18)] hover:bg-emerald-500";
  }
}

export function ReservedSeatMap({ seatStates, onSeatClick, title, helperText }: ReservedSeatMapProps) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-700 bg-[#09111f] text-slate-100 shadow-[0_18px_48px_rgba(2,6,23,0.45)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),linear-gradient(135deg,_#0b1628,_#08101d_58%,_#040910)] px-4 py-4 sm:px-5">
        {title ? <h3 className="text-base font-semibold text-white sm:text-lg">{title}</h3> : null}
        {helperText ? <p className="mt-1 text-sm text-slate-300">{helperText}</p> : null}
      </div>

      <div className="p-4 sm:p-5">
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[52rem] rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_center,_rgba(30,41,59,0.46),_transparent_40%),linear-gradient(180deg,_#0b1220,_#060c16)] p-4 sm:p-5">
            <div className="mx-auto max-w-[62rem]">
              <div className="mx-auto mb-5 flex max-w-[54rem] flex-col items-center gap-2 rounded-[1.6rem] border border-amber-200/20 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.26),_transparent_38%),linear-gradient(180deg,_#5b3b22,_#2a190f_58%,_#110b08)] px-5 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_rgba(0,0,0,0.35)]">
                <div className="h-2 w-full rounded-full bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent)]" />
                <p className="text-3xl font-black uppercase tracking-[0.38em] text-white sm:text-4xl">Stage</p>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-100/80">Front Of Room</p>
              </div>

              <div className="grid grid-cols-[2.2rem_minmax(0,1fr)_5.25rem_minmax(0,1fr)_2.2rem] gap-x-3 gap-y-2.5 sm:grid-cols-[2.8rem_minmax(0,1fr)_6.2rem_minmax(0,1fr)_2.8rem] sm:gap-x-4 sm:gap-y-3">
                {RESERVED_SEATING_ROW_LABELS.map((rowLabel, rowIndex) => (
                  <Fragment key={rowLabel}>
                    <div key={`left-label-${rowLabel}`} className="flex items-center justify-center text-lg font-black uppercase tracking-[0.2em] text-slate-200 sm:text-xl">
                      {rowLabel}
                    </div>

                    <div key={`left-row-${rowLabel}`} className="grid grid-cols-10 gap-1.5 sm:gap-2">
                      {RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
                        const seatId = `${RESERVED_SEATING_SECTION_LABELS[0]}-${rowLabel}${seatNumber}`;
                        const seatState = seatStates[seatId];
                        return (
                          <button
                            key={seatId}
                            type="button"
                            onClick={() => onSeatClick?.(seatId)}
                            disabled={!onSeatClick || Boolean(seatState?.disabled)}
                            title={seatState?.customerName ? `${seatState.label} ï¿½ ${seatState.customerName}` : seatState?.label}
                            className={`min-h-[2.55rem] rounded-[0.8rem] border text-sm font-bold transition sm:min-h-[2.85rem] sm:text-base ${getSeatButtonClasses(
                              seatState?.status ?? "available",
                              Boolean(seatState?.disabled),
                            )}`}
                          >
                            {seatNumber}
                          </button>
                        );
                      })}
                    </div>

                    <div key={`aisle-${rowLabel}`} className="relative flex items-center justify-center overflow-hidden rounded-[1rem] border border-dashed border-slate-700/80 bg-slate-950/40 px-2 text-center">
                      <div className="absolute inset-y-1/2 left-2 right-2 h-px -translate-y-1/2 bg-white/12" />
                      <span className="relative bg-[#0b1220] px-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400 sm:text-xs">
                        {rowIndex === 0 || rowIndex === 4 || rowIndex === 7 ? "Aisle" : ""}
                      </span>
                    </div>

                    <div key={`right-row-${rowLabel}`} className="grid grid-cols-10 gap-1.5 sm:gap-2">
                      {RESERVED_SEATING_SEAT_NUMBERS.map((seatNumber) => {
                        const seatId = `${RESERVED_SEATING_SECTION_LABELS[1]}-${rowLabel}${seatNumber}`;
                        const seatState = seatStates[seatId];
                        return (
                          <button
                            key={seatId}
                            type="button"
                            onClick={() => onSeatClick?.(seatId)}
                            disabled={!onSeatClick || Boolean(seatState?.disabled)}
                            title={seatState?.customerName ? `${seatState.label} ï¿½ ${seatState.customerName}` : seatState?.label}
                            className={`min-h-[2.55rem] rounded-[0.8rem] border text-sm font-bold transition sm:min-h-[2.85rem] sm:text-base ${getSeatButtonClasses(
                              seatState?.status ?? "available",
                              Boolean(seatState?.disabled),
                            )}`}
                          >
                            {seatNumber}
                          </button>
                        );
                      })}
                    </div>

                    <div key={`right-label-${rowLabel}`} className="flex items-center justify-center text-lg font-black uppercase tracking-[0.2em] text-slate-200 sm:text-xl">
                      {rowLabel}
                    </div>
                  </Fragment>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-center">
                <div className="rounded-full border border-white/10 bg-slate-950/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Back Of Room
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-200 sm:grid-cols-2 xl:grid-cols-4">
          {legendItems.map((item) => (
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
