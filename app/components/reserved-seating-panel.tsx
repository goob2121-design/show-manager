"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import type { ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import {
  formatReservedSeatLabel,
  getReservedSeatDefinition,
  RESERVED_SEAT_DEFINITIONS,
  RESERVED_SEATING_VENUE,
  sortReservedSeatIds,
} from "@/lib/reserved-seating";
import { createClient } from "@/lib/supabase/client";
import type { ReservedSeatCategory, ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

type ReservedSeatingSponsorOption = {
  id: string;
  name: string;
  compTicketAllowance: number;
};

type ReservedSeatingPanelProps = {
  showId: string;
  showSlug: string;
  showName: string;
  showDate: string | null;
  sponsorOptions?: ReservedSeatingSponsorOption[];
  selectedSponsorId?: string;
  selectedManualAssignLinkId?: string | null;
  compAssignmentContext?: {
    name: string;
    categoryLabel: string;
    quantity: number;
  } | null;
  onAssignmentsChange?: () => void;
  onCompAssignmentComplete?: (seatLabels: string[]) => void;
};

type LinkFormState = {
  customerName: string;
  email: string;
  ticketCount: string;
  sourceNote: string;
  isComplimentary: boolean;
  seatCategory: ReservedSeatCategory;
};

type LinkWithSeats = ShowReservedSeatingLink & {
  seatIds: string[];
};

type CopyFeedbackTarget = "subject" | "body" | "link" | null;
type ReservedSeatListFilter = "all" | ReservedSeatCategory;

const initialLinkFormState: LinkFormState = {
  customerName: "",
  email: "",
  ticketCount: "1",
  sourceNote: "",
  isComplimentary: false,
  seatCategory: "paid_reserved",
};

function formatShowDate(showDate: string | null) {
  if (!showDate) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${showDate}T00:00:00`));
}

function getCustomerLinkUrl(token: string) {
  if (typeof window === "undefined") {
    return `/reserved-seating/${token}`;
  }

  return `${window.location.origin}/reserved-seating/${token}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

function getLinkStatus(link: LinkWithSeats) {
  if (link.submitted_at) {
    return { label: "Selected", classes: "bg-emerald-500/15 text-emerald-200 border-emerald-400/25" };
  }

  if (link.selection_mode === "imported" && !link.sent_at) {
    return { label: "Imported / Not Sent", classes: "bg-amber-500/15 text-amber-200 border-amber-400/25" };
  }

  if (link.sent_at) {
    return { label: "Sent", classes: "bg-sky-500/15 text-sky-200 border-sky-400/25" };
  }

  return { label: "Not Sent", classes: "bg-amber-500/15 text-amber-200 border-amber-400/25" };
}

function getResetSelectionMode(link: ShowReservedSeatingLink) {
  if (link.is_complimentary) {
    return "comp";
  }

  if (link.source_ticket_id) {
    return "imported";
  }

  return "customer";
}

const reservedSeatCategoryOptions: Array<{ value: ReservedSeatCategory; label: string }> = [
  { value: "paid_reserved", label: "Paid Reserved" },
  { value: "comp", label: "Sponsor / General Comp" },
  { value: "guest", label: "Guest" },
];

function normalizeReservedSeatCategory(value: string | null | undefined, isComplimentary?: boolean): ReservedSeatCategory {
  if (value === "comp" || value === "guest" || value === "paid_reserved") {
    return value;
  }

  return isComplimentary ? "comp" : "paid_reserved";
}

function getReservedSeatCategoryLabel(category: ReservedSeatCategory) {
  switch (category) {
    case "comp":
      return "Sponsor / General Comp";
    case "guest":
      return "Guest";
    default:
      return "Paid Reserved";
  }
}

function getReservedSeatCategoryBadgeClasses(category: ReservedSeatCategory) {
  switch (category) {
    case "comp":
      return "border-violet-400/25 bg-violet-500/15 text-violet-100";
    case "guest":
      return "border-orange-400/25 bg-orange-500/15 text-orange-100";
    default:
      return "border-rose-400/25 bg-rose-500/15 text-rose-100";
  }
}

function buildReservedSeatingMessageSubject() {
  return "Your Reserved Seating Link for Cumberland Mountain Music Show";
}

function buildReservedSeatingMessageBody(link: LinkWithSeats, absoluteUrl: string, formattedDate: string) {
  return [
    `Hi ${link.customer_name},`,
    "",
    "Thank you for purchasing tickets to the Cumberland Mountain Music Show!",
    "",
    "Reserved seating is available for this show. You can select your seats using your private seat-selection link below:",
    "",
    absoluteUrl,
    "",
    "Show Information:",
    "Cumberland Mountain Music Show",
    formattedDate !== "Date TBD" ? formattedDate : "Date TBD",
    RESERVED_SEATING_VENUE.venueName,
    RESERVED_SEATING_VENUE.venueAddress,
    "",
    `Please choose up to ${link.ticket_count} seat${link.ticket_count === 1 ? "" : "s"}. Once your seats are confirmed, they will be reserved for you.`,
    "",
    "If you prefer not to select your seats, that's perfectly fine too. We'll be happy to reserve seats for you and have them ready when you arrive.",
    "",
    "If you have any trouble with the link, just reply to this message and we'll be happy to help.",
    "",
    "Thank you,",
    "Cumberland Mountain Music Show",
  ].join("\n");
}

export function ReservedSeatingPanel({
  showId,
  showSlug,
  showName,
  showDate,
  sponsorOptions = [],
  selectedSponsorId = "",
  selectedManualAssignLinkId = null,
  compAssignmentContext = null,
  onAssignmentsChange,
  onCompAssignmentComplete,
}: ReservedSeatingPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<ShowReservedSeatingLink[]>([]);
  const [assignments, setAssignments] = useState<ShowReservedSeatAssignment[]>([]);
  const [formState, setFormState] = useState<LinkFormState>(initialLinkFormState);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [manualAssignLinkId, setManualAssignLinkId] = useState<string | null>(null);
  const [messageLinkId, setMessageLinkId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedbackTarget>(null);
  const [selectedSponsorCompId, setSelectedSponsorCompId] = useState(selectedSponsorId);
  const [seatListFilter, setSeatListFilter] = useState<ReservedSeatListFilter>("all");
  const supabase = useMemo(() => createClient(), []);

  async function loadReservedSeating() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [{ data: linkRows, error: linksError }, { data: assignmentRows, error: assignmentsError }] = await Promise.all([
        supabase.from("show_reserved_seating_links").select("*").eq("show_id", showId).order("created_at", { ascending: false }),
        supabase.from("show_reserved_seat_assignments").select("*").eq("show_id", showId).order("created_at", { ascending: true }),
      ]);

      if (linksError) {
        throw linksError;
      }

      if (assignmentsError) {
        throw assignmentsError;
      }

      setLinks((linkRows ?? []) as ShowReservedSeatingLink[]);
      setAssignments((assignmentRows ?? []) as ShowReservedSeatAssignment[]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load reserved seating."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReservedSeating();
  }, [showId]);

  useEffect(() => {
    if (!selectedSponsorId) return;
    const sponsor = sponsorOptions.find((item) => item.id === selectedSponsorId);
    setSelectedSponsorCompId(selectedSponsorId);
    if (sponsor) {
      setFormState((current) => ({
        ...current,
        customerName: sponsor.name,
        ticketCount: String(Math.max(1, sponsor.compTicketAllowance || 1)),
        sourceNote: "Sponsor Comp",
        isComplimentary: true,
        seatCategory: "comp",
      }));
    }
  }, [selectedSponsorId, sponsorOptions]);

  useEffect(() => {
    if (selectedManualAssignLinkId) {
      setManualAssignLinkId(selectedManualAssignLinkId);
    }
  }, [selectedManualAssignLinkId]);

  const linksWithSeats = useMemo<LinkWithSeats[]>(
    () =>
      links.map((link) => ({
        ...link,
        seatIds: sortReservedSeatIds(
          assignments
            .filter((assignment) => assignment.seating_link_id === link.id && assignment.assignment_type === "customer")
            .map((assignment) => assignment.seat_id),
        ),
      })),
    [assignments, links],
  );

  const manualAssignLink = useMemo(
    () => linksWithSeats.find((link) => link.id === manualAssignLinkId) ?? null,
    [linksWithSeats, manualAssignLinkId],
  );

  const messageLink = useMemo(
    () => linksWithSeats.find((link) => link.id === messageLinkId) ?? null,
    [linksWithSeats, messageLinkId],
  );

  const filteredLinksWithSeats = useMemo(
    () => linksWithSeats.filter((link) => seatListFilter === "all" || normalizeReservedSeatCategory(link.seat_category, link.is_complimentary) === seatListFilter),
    [linksWithSeats, seatListFilter],
  );

  const seatStates = useMemo<Record<string, ReservedSeatMapSeatState>>(() => {
    const assignmentBySeatId = new Map(assignments.map((assignment) => [assignment.seat_id, assignment]));

    return Object.fromEntries(
      RESERVED_SEAT_DEFINITIONS.map((seat) => {
        const assignment = assignmentBySeatId.get(seat.seatId);
        const isBlocked = assignment?.assignment_type === "blocked";
        const category = normalizeReservedSeatCategory(assignment?.seat_category ?? null);
        const status: ReservedSeatMapSeatState["status"] = isBlocked
          ? "unavailable"
          : assignment
            ? category
            : "available";

        return [
          seat.seatId,
          {
            seatId: seat.seatId,
            label: seat.seatId,
            status,
            customerName: assignment?.customer_name ?? null,
          },
        ];
      }),
    ) as Record<string, ReservedSeatMapSeatState>;
  }, [assignments]);

  const unavailableSeats = useMemo(
    () => sortReservedSeatIds(assignments.filter((assignment) => assignment.assignment_type === "blocked").map((assignment) => assignment.seat_id)),
    [assignments],
  );

  async function handleCreateLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveActionId("create-link");
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const ticketCount = Math.max(1, Number.parseInt(formState.ticketCount.trim(), 10) || 1);
      const { error } = await supabase.from("show_reserved_seating_links").insert({
        show_id: showId,
        customer_name: formState.customerName.trim(),
        email: formState.email.trim() || null,
        ticket_count: ticketCount,
        selection_mode: formState.isComplimentary ? "comp" : "customer",
        is_complimentary: formState.isComplimentary,
        source_note: formState.sourceNote.trim() || null,
        seat_category: formState.seatCategory,
      });

      if (error) {
        throw error;
      }

      const createdLabel = formState.isComplimentary ? "Comp guest" : "Seat selection link";
      setFormState(initialLinkFormState);
      setStatusMessage(`${createdLabel} created.`);
      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, formState.isComplimentary ? "Unable to create comp guest." : "Unable to create seat selection link."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function markLinkSent(linkId: string) {
    const link = links.find((item) => item.id === linkId);
    if (!link || link.sent_at) {
      return;
    }

    const sentAt = new Date().toISOString();
    const { error } = await supabase.from("show_reserved_seating_links").update({ sent_at: sentAt }).eq("id", linkId);
    if (error) {
      throw error;
    }
  }

  async function copyReservedSeatingMessageText(value: string, target: Exclude<CopyFeedbackTarget, null>) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard copy is unavailable in this browser.");
      }

      await navigator.clipboard.writeText(value);
      setCopyFeedback(target);
      setStatusMessage(null);
      setErrorMessage(null);

      window.setTimeout(() => {
        setCopyFeedback((current) => (current === target ? null : current));
      }, 1800);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to copy the requested text."));
    }
  }

  async function handleCopyLink(link: ShowReservedSeatingLink) {
    try {
      const absoluteUrl = getCustomerLinkUrl(link.selection_token);
      if (!navigator.clipboard?.writeText) {
        throw new Error(`Clipboard copy is unavailable. Copy this link manually: ${absoluteUrl}`);
      }

      await navigator.clipboard.writeText(absoluteUrl);
      await markLinkSent(link.id);
      await loadReservedSeating();
      setStatusMessage("Seat selection link copied.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to copy the seat selection link."));
    }
  }

  async function handleSeatMapClick(seatId: string) {
    setActiveActionId(`seat-${seatId}`);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const assignment = assignments.find((item) => item.seat_id === seatId) ?? null;

      if (manualAssignLink && !assignment) {
        if (manualAssignLink.seatIds.length >= manualAssignLink.ticket_count) {
          throw new Error(`${manualAssignLink.customer_name} already has all ${manualAssignLink.ticket_count} seat${manualAssignLink.ticket_count === 1 ? "" : "s"} assigned.`);
        }

        const definition = getReservedSeatDefinition(seatId);
        const now = new Date().toISOString();
        const { error: insertError } = await supabase.from("show_reserved_seat_assignments").insert({
          show_id: showId,
          seating_link_id: manualAssignLink.id,
          customer_name: manualAssignLink.customer_name,
          email: manualAssignLink.email,
          seat_id: seatId,
          section: definition?.section ?? seatId.slice(0, 1),
          row_label: definition?.rowLabel ?? seatId.slice(2, 3),
          seat_number: definition?.seatNumber ?? 0,
          assignment_type: "customer",
          seat_category: normalizeReservedSeatCategory(manualAssignLink.seat_category, manualAssignLink.is_complimentary),
        });

        if (insertError) {
          throw insertError;
        }

        const nextMode = manualAssignLink.is_complimentary ? "comp" : "manual";
        const { error: updateError } = await supabase
          .from("show_reserved_seating_links")
          .update({ selection_mode: nextMode, submitted_at: now, sent_at: manualAssignLink.sent_at ?? now })
          .eq("id", manualAssignLink.id);

        if (updateError) {
          throw updateError;
        }

        const assignedLabel = getReservedSeatCategoryLabel(normalizeReservedSeatCategory(manualAssignLink.seat_category, manualAssignLink.is_complimentary));
        setStatusMessage(`${assignedLabel} ${formatReservedSeatLabel(seatId)} assigned to ${manualAssignLink.customer_name}.`);
        await loadReservedSeating();
        onAssignmentsChange?.();
        return;
      }

      if (!assignment) {
        const definition = getReservedSeatDefinition(seatId);
        const { error } = await supabase.from("show_reserved_seat_assignments").insert({
          show_id: showId,
          seat_id: seatId,
          section: definition?.section ?? seatId.slice(0, 1),
          row_label: definition?.rowLabel ?? seatId.slice(2, 3),
          seat_number: definition?.seatNumber ?? 0,
          assignment_type: "blocked",
        });

        if (error) {
          throw error;
        }

        setStatusMessage(`${formatReservedSeatLabel(seatId)} marked unavailable.`);
      } else if (assignment.assignment_type === "blocked") {
        const { error } = await supabase.from("show_reserved_seat_assignments").delete().eq("id", assignment.id);

        if (error) {
          throw error;
        }

        setStatusMessage(`${formatReservedSeatLabel(seatId)} is available again.`);
      } else {
        const shouldClear = window.confirm(`Clear ${formatReservedSeatLabel(seatId)} from ${assignment.customer_name || "this customer"}?`);
        if (!shouldClear) {
          return;
        }

        const { error } = await supabase.from("show_reserved_seat_assignments").delete().eq("id", assignment.id);
        if (error) {
          throw error;
        }

        setStatusMessage(`${formatReservedSeatLabel(seatId)} cleared.`);
      }

      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to update the selected seat."));
      await loadReservedSeating();
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleOpenLink(link: ShowReservedSeatingLink) {
    setActiveActionId(`open-${link.id}`);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await markLinkSent(link.id);
      await loadReservedSeating();
      window.open(getCustomerLinkUrl(link.selection_token), "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to open this seat-selection link."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleResetLink(linkId: string) {
    setActiveActionId(`reset-${linkId}`);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const { error: deleteError } = await supabase.from("show_reserved_seat_assignments").delete().eq("seating_link_id", linkId);
      if (deleteError) {
        throw deleteError;
      }

      const link = links.find((item) => item.id === linkId);
      const { error: updateError } = await supabase
        .from("show_reserved_seating_links")
        .update({ submitted_at: null, selection_mode: getResetSelectionMode(link as ShowReservedSeatingLink) })
        .eq("id", linkId);
      if (updateError) {
        throw updateError;
      }

      if (manualAssignLinkId === linkId) {
        setManualAssignLinkId(null);
      }

      setStatusMessage("Seat assignment cleared.");
      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to clear this assignment."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleUpdateLinkCategory(link: ShowReservedSeatingLink, nextCategory: ReservedSeatCategory) {
    setActiveActionId(`category-${link.id}`);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const { error: updateLinkError } = await supabase
        .from("show_reserved_seating_links")
        .update({ seat_category: nextCategory })
        .eq("id", link.id);

      if (updateLinkError) {
        throw updateLinkError;
      }

      const { error: updateAssignmentsError } = await supabase
        .from("show_reserved_seat_assignments")
        .update({ seat_category: nextCategory })
        .eq("show_id", showId)
        .eq("seating_link_id", link.id)
        .eq("assignment_type", "customer");

      if (updateAssignmentsError) {
        throw updateAssignmentsError;
      }

      setStatusMessage(`${link.customer_name} category updated to ${getReservedSeatCategoryLabel(nextCategory)}.`);
      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to update the seat category."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleDeleteLink(linkId: string) {
    const shouldDelete = window.confirm("Delete this seat selection link?");
    if (!shouldDelete) {
      return;
    }

    setActiveActionId(`delete-${linkId}`);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await supabase.from("show_reserved_seat_assignments").delete().eq("seating_link_id", linkId);
      const { error } = await supabase.from("show_reserved_seating_links").delete().eq("id", linkId);
      if (error) {
        throw error;
      }

      if (manualAssignLinkId === linkId) {
        setManualAssignLinkId(null);
      }

      setStatusMessage("Seat selection link deleted.");
      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to delete this seat selection link."));
    } finally {
      setActiveActionId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_24%),linear-gradient(180deg,_#0a1627,_#070f1c_58%,_#050913)] p-4 text-slate-100 shadow-[0_24px_54px_rgba(2,6,23,0.42)] sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Reserved Seating</h3>
          <p className="text-sm text-slate-300">
            Manage paid online guests and complimentary seat assignments in one place for {showName} on {formatShowDate(showDate)}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/admin/${showSlug}/print/selected-seat-cards`}
            className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
          >
            Print Selected Seat Cards
          </Link>
        </div>
      </div>

      {manualAssignLink ? (() => {
        const seatLabels = manualAssignLink.seatIds.map(formatReservedSeatLabel);
        const neededSeats = compAssignmentContext?.quantity ?? manualAssignLink.ticket_count;
        const selectedCount = manualAssignLink.seatIds.length;
        const isExactCount = selectedCount === neededSeats;
        return (
          <div className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-500/12 px-4 py-3 text-sm text-violet-100">
            {compAssignmentContext ? (
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Assigning seats for:</p>
                  <p className="mt-1 text-lg font-bold text-white">{compAssignmentContext.name}</p>
                  <p className="text-sm text-violet-100">Comp Type: {compAssignmentContext.categoryLabel}</p>
                  <p className="text-sm text-violet-100">Tickets: {neededSeats}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/25 px-3 py-2">
                  <p className="font-semibold text-white">Seats needed: {neededSeats}</p>
                  <p className={isExactCount ? "font-semibold text-emerald-200" : "font-semibold text-amber-100"}>Selected seats: {selectedCount} of {neededSeats}</p>
                  <p className="mt-1 text-xs text-violet-100">{seatLabels.length > 0 ? seatLabels.join(", ") : "Click available seats on the map."}</p>
                </div>
                <button
                  type="button"
                  disabled={!isExactCount}
                  onClick={() => onCompAssignmentComplete?.(seatLabels)}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save Seats for This Comp
                </button>
              </div>
            ) : (
              <>Manual assign mode is active for <span className="font-semibold">{manualAssignLink.customer_name}</span>. Click available seats on the map to assign up to {manualAssignLink.ticket_count} seats.</>
            )}
          </div>
        );
      })() : null}

      {statusMessage ? <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{statusMessage}</div> : null}
      {errorMessage ? <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div> : null}

      {messageLink ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,_#0c1728,_#060d18)] p-5 text-slate-100 shadow-[0_24px_60px_rgba(2,6,23,0.55)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                  Message Generator
                </span>
                <h4 className="mt-3 text-2xl font-black tracking-tight text-white">Reserved Seating Message</h4>
                <p className="mt-2 text-sm text-slate-300">Copy the subject, message body, or private seat link and paste it into Gmail, Square, Messenger, or anywhere else you need.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMessageLinkId(null);
                  setCopyFeedback(null);
                }}
                className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Subject</p>
                <p className="mt-2 text-sm font-semibold text-white">{buildReservedSeatingMessageSubject()}</p>
                <button
                  type="button"
                  onClick={() => void copyReservedSeatingMessageText(buildReservedSeatingMessageSubject(), "subject")}
                  className="mt-3 inline-flex rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                >
                  {copyFeedback === "subject" ? "Subject Copied!" : "Copy Subject"}
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Seat Selection Link</p>
                <p className="mt-2 break-all text-sm text-slate-200">{getCustomerLinkUrl(messageLink.selection_token)}</p>
                <button
                  type="button"
                  onClick={() => void copyReservedSeatingMessageText(getCustomerLinkUrl(messageLink.selection_token), "link")}
                  className="mt-3 inline-flex rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                >
                  {copyFeedback === "link" ? "Link Copied!" : "Copy Seat Link"}
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Message Body</p>
                <textarea
                  readOnly
                  value={buildReservedSeatingMessageBody(messageLink, getCustomerLinkUrl(messageLink.selection_token), formatShowDate(showDate))}
                  className="mt-2 min-h-[18rem] w-full rounded-xl border border-white/12 bg-slate-950/70 px-3 py-3 text-sm leading-6 text-slate-100 outline-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyReservedSeatingMessageText(
                      buildReservedSeatingMessageBody(messageLink, getCustomerLinkUrl(messageLink.selection_token), formatShowDate(showDate)),
                      "body",
                    )}
                    className="inline-flex rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    {copyFeedback === "body" ? "Message Copied!" : "Copy Message"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <ReservedSeatMap
          seatStates={seatStates}
          onSeatClick={(seatId) => void handleSeatMapClick(seatId)}
          title="Venue Seat Map"
          legendVariant="admin"
          helperText={
            manualAssignLink
              ? "Manual assign mode: click green seats to assign them to the selected guest. Purple, orange, and red seats are already assigned. Gray seats are unavailable."
              : "Click green seats to block them. Gray seats can be reopened. Red, purple, and orange seats are existing assignments you can clear if needed."
          }
        />

        <div className="grid gap-4">
          {!compAssignmentContext ? (<form onSubmit={(event) => void handleCreateLink(event)} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSponsorCompId("");
                  setFormState((current) => ({ ...current, isComplimentary: false, seatCategory: "paid_reserved" }));
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  formState.isComplimentary
                    ? "border border-white/12 bg-white/[0.04] text-slate-300"
                    : "border border-emerald-400/25 bg-emerald-500/15 text-emerald-100"
                }`}
              >
                Standard Guest
              </button>
              <button
                type="button"
                onClick={() => setFormState((current) => ({ ...current, isComplimentary: true, seatCategory: "comp" }))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  formState.isComplimentary
                    ? "border border-violet-400/25 bg-violet-500/15 text-violet-100"
                    : "border border-white/12 bg-white/[0.04] text-slate-300"
                }`}
              >
                Add Comp Guest
              </button>
            </div>
            <h4 className="mt-3 text-base font-semibold text-white">{formState.isComplimentary ? "Add Comp Seats" : "Create Seat Selection Link"}</h4>
            <p className="mt-1 text-sm text-slate-300">
              {formState.isComplimentary
                ? "Create a complimentary guest entry, then either manually assign seats or send a private seat-selection link."
                : "Create a private customer link for reserved seating."}
            </p>
            <div className="mt-4 grid gap-4">
              {formState.isComplimentary && sponsorOptions.length > 0 ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Sponsor Comp Sponsor
                  <select
                    value={selectedSponsorCompId}
                    onChange={(event) => {
                      const sponsorId = event.target.value;
                      const sponsor = sponsorOptions.find((item) => item.id === sponsorId) ?? null;
                      setSelectedSponsorCompId(sponsorId);
                      setFormState((current) => ({
                        ...current,
                        customerName: sponsor?.name ?? current.customerName,
                        ticketCount: sponsor ? String(Math.max(1, sponsor.compTicketAllowance || 1)) : current.ticketCount,
                        sourceNote: sponsor ? "Sponsor Comp" : current.sourceNote,
                        isComplimentary: true,
                        seatCategory: "comp",
                      }));
                    }}
                    className="rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500"
                  >
                    <option value="">General comp / no sponsor</option>
                    {sponsorOptions.map((sponsor) => (
                      <option key={sponsor.id} value={sponsor.id}>
                        {sponsor.name} ({sponsor.compTicketAllowance})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">Choose a sponsor here, then use Manual Assign Seats so Sponsor Ticket Printing can find those seats automatically.</span>
                </label>
              ) : null}
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                {formState.isComplimentary ? "Guest / Sponsor Name" : "Guest Name"}
                <input
                  type="text"
                  value={formState.customerName}
                  onChange={(event) => setFormState((current) => ({ ...current, customerName: event.target.value }))}
                  className="rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Email
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                  className="rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500"
                  placeholder="Optional"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Number Of Seats
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={formState.ticketCount}
                  onChange={(event) => setFormState((current) => ({ ...current, ticketCount: event.target.value }))}
                  className="rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Seat Category
                <select
                  value={formState.seatCategory}
                  onChange={(event) => setFormState((current) => ({
                    ...current,
                    seatCategory: event.target.value as ReservedSeatCategory,
                    isComplimentary: event.target.value === "comp",
                  }))}
                  className="rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500"
                >
                  {reservedSeatCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Optional Note / Source
                <input
                  type="text"
                  value={formState.sourceNote}
                  onChange={(event) => setFormState((current) => ({ ...current, sourceNote: event.target.value }))}
                  className="rounded-xl border border-white/12 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500"
                  placeholder={formState.isComplimentary ? "Sponsor Comp, Band Comp, LMU Comp, House Comp..." : "Optional"}
                />
              </label>
              <button
                type="submit"
                disabled={activeActionId === "create-link"}
                className={`rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  formState.isComplimentary ? "bg-violet-600 hover:bg-violet-500" : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {activeActionId === "create-link"
                  ? formState.isComplimentary
                    ? "Creating Comp Guest..."
                    : "Creating Link..."
                  : formState.isComplimentary
                    ? "Add Comp Guest"
                    : "Create Seat Selection Link"}
              </button>
            </div>
          </form>
          ) : (
            <div className="rounded-[1.5rem] border border-violet-400/25 bg-violet-500/10 p-4">
              <h4 className="text-base font-semibold text-white">Assign Existing Comp Seats</h4>
              <p className="mt-2 text-sm text-violet-100">Use the seat map to assign seats to the selected comp entry. The add-new-comp form is hidden so this does not create a new comp record.</p>
              <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm text-violet-100">
                <p><span className="font-semibold text-white">Name:</span> {compAssignmentContext.name}</p>
                <p><span className="font-semibold text-white">Comp Type:</span> {compAssignmentContext.categoryLabel}</p>
                <p><span className="font-semibold text-white">Tickets:</span> {compAssignmentContext.quantity}</p>
              </div>
            </div>
          )}

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
            <h4 className="text-base font-semibold text-white">Unavailable Seats</h4>
            {unavailableSeats.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {unavailableSeats.map((seatId) => (
                  <span key={seatId} className="rounded-full border border-slate-500/50 bg-slate-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                    {seatId}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No seats are manually blocked right now.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-white">Reserved Seating Guests</h4>
            <p className="text-sm text-slate-300">Track paid online guests, comp guests, manual links, sent links, and selected seats in one list.</p>
          </div>
          {isLoading ? <span className="text-sm text-slate-400">Loading...</span> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { value: "all", label: "All Seats" },
            { value: "paid_reserved", label: "Paid Reserved Seats" },
            { value: "comp", label: "Sponsor / General Comps" },
            { value: "guest", label: "Guest Comps" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSeatListFilter(option.value as ReservedSeatListFilter)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                seatListFilter === option.value
                  ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                  : "border border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {linksWithSeats.length === 0 && !isLoading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-slate-950/35 px-4 py-6 text-sm text-slate-400">
            No reserved seating guests have been created for this show yet.
          </div>
        ) : filteredLinksWithSeats.length === 0 && !isLoading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-slate-950/35 px-4 py-6 text-sm text-slate-400">
            No reserved seating guests match this filter.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {filteredLinksWithSeats.map((link) => {
              const status = getLinkStatus(link);
              const isManualAssigning = manualAssignLinkId === link.id;
              const linkSeatCategory = normalizeReservedSeatCategory(link.seat_category, link.is_complimentary);
              return (
                <article key={link.id} className={`rounded-2xl border p-4 transition ${isManualAssigning ? "border-violet-400/30 bg-violet-500/10" : "border-white/10 bg-slate-950/30"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-base font-semibold text-white">{link.customer_name}</h5>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${status.classes}`}>{status.label}</span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getReservedSeatCategoryBadgeClasses(linkSeatCategory)}`}>
                          {getReservedSeatCategoryLabel(linkSeatCategory)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                          {link.ticket_count} seat{link.ticket_count === 1 ? "" : "s"}
                        </span>
                      </div>
                      {link.email?.trim() ? <p className="mt-2 text-sm text-slate-300">{link.email}</p> : null}
                      {link.source_note?.trim() ? <p className="mt-2 text-sm text-slate-300">{link.source_note}</p> : null}
                      <p className="mt-2 break-all text-sm text-slate-400">{getCustomerLinkUrl(link.selection_token)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {link.seatIds.length > 0 ? (
                          link.seatIds.map((seatId) => (
                            <span key={seatId} className="rounded-full border border-amber-300/25 bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                              {seatId}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-400">No seats selected yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Seat Category
                        <select
                          value={linkSeatCategory}
                          onChange={(event) => void handleUpdateLinkCategory(link, event.target.value as ReservedSeatCategory)}
                          disabled={activeActionId === `category-${link.id}`}
                          className="rounded-xl border border-white/12 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reservedSeatCategoryOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setMessageLinkId(link.id)}
                        className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                      >
                        Generate Message
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(link)}
                        className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                      >
                        Copy Seat Link
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenLink(link)}
                        disabled={activeActionId === `open-${link.id}`}
                        className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Open Link
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualAssignLinkId((current) => (current === link.id ? null : link.id))}
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isManualAssigning ? "border border-violet-400/30 bg-violet-500/15 text-violet-100" : "border border-white/12 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]"}`}
                      >
                        {isManualAssigning ? "Stop Manual Assign" : "Manual Assign Seats"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResetLink(link.id)}
                        disabled={activeActionId === `reset-${link.id}`}
                        className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reset Seats
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteLink(link.id)}
                        disabled={activeActionId === `delete-${link.id}`}
                        className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete Link
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}


