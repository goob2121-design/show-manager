import type { ReactNode } from "react";

export type TicketReservedSeatingPanelProps = {
  isReservedSeatingOpen: boolean;
  copiedPublicSeatAvailabilityLink: boolean;
  publicSeatAvailabilityUrl: string;
  genericPublicSeatAvailabilityUrl: string;
  onToggleReservedSeating: () => void;
  onOpenPublicSeatAvailabilityPage: () => void;
  onCopyPublicSeatAvailabilityLink: () => void;
};

function ToolButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className: string }) {
  return <button type="button" onClick={onClick} className={className}>{children}</button>;
}

export function TicketReservedSeatingPanel({
  isReservedSeatingOpen,
  copiedPublicSeatAvailabilityLink,
  publicSeatAvailabilityUrl,
  genericPublicSeatAvailabilityUrl,
  onToggleReservedSeating,
  onOpenPublicSeatAvailabilityPage,
  onCopyPublicSeatAvailabilityLink,
}: TicketReservedSeatingPanelProps) {
  const standardButtonClass = "inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <h3 className="text-base font-semibold text-stone-900">Reserved Seating</h3>
          <p className="text-sm text-stone-600">Manage reserved seating and public availability from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <ToolButton
            onClick={onToggleReservedSeating}
            className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              isReservedSeatingOpen
                ? "border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
            }`}
          >
            {isReservedSeatingOpen ? "Hide Reserved Seating" : "Open Reserved Seating"}
          </ToolButton>
          <ToolButton onClick={onOpenPublicSeatAvailabilityPage} className={standardButtonClass}>
            Open Public Availability
          </ToolButton>
          <ToolButton
            onClick={onCopyPublicSeatAvailabilityLink}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            {copiedPublicSeatAvailabilityLink ? "Availability Link Copied" : "Copy Availability Link"}
          </ToolButton>
        </div>
        <p className="sr-only sm:col-span-2">
          Public availability URL: {publicSeatAvailabilityUrl}. Generic fallback: {genericPublicSeatAvailabilityUrl}.
        </p>
      </div>
    </div>
  );
}
