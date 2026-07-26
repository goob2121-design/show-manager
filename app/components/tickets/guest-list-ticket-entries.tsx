"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { guestListExpandedStorageKey, parseSavedGuestListExpanded } from "@/lib/guest-list-collapse";

type GuestListTicketEntriesProps = {
  showId: string;
  entryCount: number;
  forceExpandToken: number;
  children: ReactNode;
};

export function GuestListTicketEntries({
  showId,
  entryCount,
  forceExpandToken,
  children,
}: GuestListTicketEntriesProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the client-only per-show UI preference after hydration.
    setIsExpanded(parseSavedGuestListExpanded(window.localStorage.getItem(guestListExpandedStorageKey(showId))));
  }, [showId]);

  useEffect(() => {
    if (forceExpandToken <= 0) return;
    // This reveal does not overwrite a user's saved preference for their next visit.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an explicit successful Prepare action requests this UI reveal.
    setIsExpanded(true);
  }, [forceExpandToken]);

  function handleToggle() {
    setIsExpanded((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(guestListExpandedStorageKey(showId), String(next));
      }
      return next;
    });
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-base font-semibold text-stone-900">Guest List / Ticket Entries ({entryCount})</h3>
          <p className="text-sm text-stone-600">Manage paid online orders, complimentary tickets, manual entries, and check-ins.</p>
        </div>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} Guest List / Ticket Entries`}
          onClick={handleToggle}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-lg font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          <span aria-hidden="true">{isExpanded ? "▼" : "▶"}</span>
        </button>
      </div>
      <div id={contentId} hidden={!isExpanded}>
        {isExpanded ? children : null}
      </div>
    </section>
  );
}
