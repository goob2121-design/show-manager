"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import type { ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import {
  formatReservedSeatLabel,
  getReservedSeatDefinition,
  RESERVED_SEAT_DEFINITIONS,
  sortReservedSeatIds,
} from "@/lib/reserved-seating";
import type { ReservedSeatEmailTrackingSummary } from "@/lib/reserved-seat-email-tracking";
import {
  formatReservedSeatEmailFullTimestamp,
  formatReservedSeatEmailTimestamp,
  getReservedSeatEmailStatusDisplayModel,
  getReservedSeatEmailStatusVisual,
  type ReservedSeatEmailStatusTone,
  type ReservedSeatEmailTrackingRequestState,
} from "@/lib/reserved-seat-email-status-display";
import {
  buildReservedSeatingMessageBody,
  buildReservedSeatingMessageSubject,
} from "@/lib/reserved-seat-generated-message";
import { tryGenerateReservationScanToken } from "@/lib/reservation-scan-tokens";
import { getOfficialTicketReadiness } from "@/lib/official-ticket-readiness";
import { getReservedSeatReminderEligibility } from "@/lib/reserved-seat-reminder-eligibility";
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
  copiedPublicSeatAvailabilityLink: boolean;
  publicSeatAvailabilityUrl: string;
  genericPublicSeatAvailabilityUrl: string;
  onToggleReservedSeating: () => void;
  onOpenPublicSeatAvailabilityPage: () => void;
  onCopyPublicSeatAvailabilityLink: () => void;
  selectedManualAssignLinkId?: string | null;
  compAssignmentContext?: {
    name: string;
    categoryLabel: string;
    quantity: number;
  } | null;
  onAssignmentsChange?: () => void;
  onCompAssignmentComplete?: (seatLabels: string[]) => void;
  onCompAssignmentCancel?: () => void;
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
type ReservedSeatListFilter = "all" | "auto_assign" | ReservedSeatCategory;
type ReservedSeatEmailDeliveryStatus = ReservedSeatEmailTrackingSummary & {
  id: string;
  emailType: "reserved_seat_initial" | "reserved_seat_resend" | "reserved_seat_reminder";
  sequenceNumber: number;
  label: string;
  subject: string;
  sendStatus: string;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
};
type ReservedSeatEmailStatus = ReservedSeatEmailTrackingSummary & {
  reservedSeatingLinkId: string;
  attempts: number;
  lastEmailError: string | null;
  deliveries: ReservedSeatEmailDeliveryStatus[];
};

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

  if (link.resend_email_id) {
    return { label: "Seat Link Sent", classes: "bg-sky-500/15 text-sky-200 border-sky-400/25" };
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

function getEmailStatusToneClasses(tone: ReservedSeatEmailStatusTone) {
  switch (tone) {
    case "blue":
      return "border-sky-400/30 bg-sky-500/[0.07] text-sky-200";
    case "green":
      return "border-emerald-400/30 bg-emerald-500/[0.07] text-emerald-200";
    case "cyan":
      return "border-cyan-400/30 bg-cyan-500/[0.07] text-cyan-200";
    case "gold":
      return "border-amber-300/35 bg-amber-400/[0.08] text-amber-100";
    case "orange":
      return "border-orange-400/30 bg-orange-500/[0.07] text-orange-200";
    case "purple":
      return "border-violet-400/30 bg-violet-500/[0.07] text-violet-200";
    case "amber":
      return "border-amber-400/30 bg-amber-500/[0.07] text-amber-200";
    case "red":
      return "border-rose-400/30 bg-rose-500/[0.07] text-rose-200";
    default:
      return "border-white/12 bg-white/[0.05] text-slate-200";
  }
}

export function ReservedSeatingPanel({
  showId,
  showSlug,
  showName,
  showDate,
  sponsorOptions = [],
  selectedSponsorId = "",
  copiedPublicSeatAvailabilityLink,
  publicSeatAvailabilityUrl,
  genericPublicSeatAvailabilityUrl,
  onToggleReservedSeating,
  onOpenPublicSeatAvailabilityPage,
  onCopyPublicSeatAvailabilityLink,
  selectedManualAssignLinkId = null,
  compAssignmentContext = null,
  onAssignmentsChange,
  onCompAssignmentComplete,
  onCompAssignmentCancel,
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
  const [emailStatuses, setEmailStatuses] = useState<Record<string, ReservedSeatEmailStatus>>({});
  const [emailTrackingRequestState, setEmailTrackingRequestState] = useState<ReservedSeatEmailTrackingRequestState>("loading");
  const [ticketCodeActionId, setTicketCodeActionId] = useState<string | null>(null);
  const [postAssignmentPromptLinkId, setPostAssignmentPromptLinkId] = useState<string | null>(null);
  const [showBulkReminderConfirmation, setShowBulkReminderConfirmation] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  async function loadReservedSeatEmailStatuses(nextLinks: ShowReservedSeatingLink[]) {
    if (nextLinks.length === 0) {
      setEmailStatuses({});
      setEmailTrackingRequestState("loaded");
      return;
    }

    try {
      setEmailTrackingRequestState("loading");
      const response = await fetch(`/api/admin/shows/${showId}/reserved-seat-email-status?slug=${encodeURIComponent(showSlug)}`, {
        method: "GET",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        statuses?: ReservedSeatEmailStatus[];
      };

      if (!response.ok || !payload.success || !Array.isArray(payload.statuses)) {
        throw new Error("Reserved-seat email tracking is unavailable.");
      }

      setEmailStatuses(Object.fromEntries(payload.statuses.map((status) => [status.reservedSeatingLinkId, status])));
      setEmailTrackingRequestState("loaded");
    } catch (error) {
      console.error("Reserved-seat email status load failed.", error);
      setEmailTrackingRequestState("error");
    }
  }

  async function handleRetryEmailTracking() {
    await loadReservedSeatEmailStatuses(links);
  }

  async function handleGenerateTicketCode(link: LinkWithSeats) {
    if (link.scan_token) {
      return;
    }

    const confirmed = window.confirm(
      `Generate a ticket code for ${link.customer_name}? This will not replace an existing code.`,
    );
    if (!confirmed) {
      return;
    }

    setTicketCodeActionId(link.id);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/reserved-seat-ticket-codes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: showSlug,
          action: "generate-one",
          reservationId: link.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        generated?: number;
      } | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to generate a ticket code for this reservation.");
      }

      setStatusMessage(
        payload.generated
          ? "Ticket code generated. You can now send or print the reservation confirmation."
          : "Ticket code already exists for this reservation.",
      );
      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to generate a ticket code for this reservation."));
    } finally {
      setTicketCodeActionId(null);
    }
  }

  async function handleGenerateMissingTicketCodes() {
    const missingCount = links.filter((link) => !link.scan_token).length;
    if (missingCount <= 0) {
      return;
    }

    const confirmed = window.confirm(
      `Generate ticket codes for ${missingCount} existing reservation${missingCount === 1 ? "" : "s"} in this show that do not already have one? This will not replace existing codes.`,
    );
    if (!confirmed) {
      return;
    }

    setTicketCodeActionId("bulk");
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/reserved-seat-ticket-codes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: showSlug,
          action: "generate-missing",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        generated?: number;
        alreadyHadCode?: number;
        failed?: number;
      } | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to generate missing ticket codes.");
      }

      setStatusMessage(
        `Generated ${payload.generated ?? 0} ticket code${payload?.generated === 1 ? "" : "s"}. ${payload.alreadyHadCode ?? 0} already had codes. ${payload.failed ?? 0} failed.`,
      );
      await loadReservedSeating();
      onAssignmentsChange?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to generate missing ticket codes."));
    } finally {
      setTicketCodeActionId(null);
    }
  }

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

      const nextLinks = (linkRows ?? []) as ShowReservedSeatingLink[];
      setLinks(nextLinks);
      setAssignments((assignmentRows ?? []) as ShowReservedSeatAssignment[]);
      await loadReservedSeatEmailStatuses(nextLinks);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load reserved seating."));
      setEmailTrackingRequestState("error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReservedSeating();
  }, [showId, showSlug]);

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
      links
        .map((link) => ({
          ...link,
          seatIds: sortReservedSeatIds(
            assignments
              .filter((assignment) => assignment.seating_link_id === link.id && assignment.assignment_type === "customer")
              .map((assignment) => assignment.seat_id),
          ),
        }))
        .sort((left, right) => Number(right.seat_preference === "auto_assign") - Number(left.seat_preference === "auto_assign")),
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
    () => linksWithSeats.filter((link) => {
      if (seatListFilter === "all") return true;
      if (seatListFilter === "auto_assign") return link.seat_preference === "auto_assign";
      return normalizeReservedSeatCategory(link.seat_category, link.is_complimentary) === seatListFilter;
    }),
    [linksWithSeats, seatListFilter],
  );
  const seatPreferenceCounts = useMemo(() => ({
    autoAssignRequested: linksWithSeats.filter((link) => link.seat_preference === "auto_assign" && link.seatIds.length === 0).length,
    customerSelecting: linksWithSeats.filter((link) => link.seat_preference !== "auto_assign" && link.seatIds.length === 0).length,
    seatsAssigned: linksWithSeats.reduce((count, link) => count + link.seatIds.length, 0),
  }), [linksWithSeats]);
  const readinessSummary = useMemo(() => {
    const autoAssignWaiting = linksWithSeats.filter((link) => link.seat_preference === "auto_assign" && link.seatIds.length === 0);
    const assignedNotEmailed = linksWithSeats.filter((link) => link.seatIds.length > 0 && !link.ticket_emailed_at);
    const ready = linksWithSeats.filter((link) => link.seatIds.length > 0 && Boolean(link.ticket_emailed_at));
    return {
      autoAssignWaiting: { reservations: autoAssignWaiting.length, seats: autoAssignWaiting.reduce((count, link) => count + link.ticket_count, 0) },
      assignedNotEmailed: { reservations: assignedNotEmailed.length, seats: assignedNotEmailed.reduce((count, link) => count + link.seatIds.length, 0) },
      ready: { reservations: ready.length, seats: ready.reduce((count, link) => count + link.seatIds.length, 0) },
    };
  }, [linksWithSeats]);
  const seatingAttentionCount = readinessSummary.autoAssignWaiting.reservations
    + readinessSummary.assignedNotEmailed.reservations;

  const postAssignmentPromptLink = useMemo(
    () => linksWithSeats.find((link) => link.id === postAssignmentPromptLinkId) ?? null,
    [linksWithSeats, postAssignmentPromptLinkId],
  );
  const missingTicketCodeCount = useMemo(
    () => linksWithSeats.filter((link) => !link.scan_token).length,
    [linksWithSeats],
  );
  const reminderEligibilityByLink = useMemo(() => Object.fromEntries(linksWithSeats.map((link) => [
    link.id,
    getReservedSeatReminderEligibility({
      ticketCount: link.ticket_count,
      assignedCustomerSeatCount: link.seatIds.length,
      email: link.email,
      selectionToken: link.selection_token,
      submittedAt: link.submitted_at,
      isReservedSeating: true,
    }),
  ])), [linksWithSeats]);
  const bulkReminderEligibleCount = useMemo(
    () => Object.values(reminderEligibilityByLink).filter((eligibility) => eligibility.eligible).length,
    [reminderEligibilityByLink],
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
        scan_token: tryGenerateReservationScanToken(),
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

  async function handleSendSeatEmail(link: LinkWithSeats) {
    const isResend = Boolean(link.resend_email_id);
    if (isResend && !window.confirm("This seat email was already sent. Send it again?")) return;

    setActiveActionId(`email-${link.id}`);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/reserved-seating/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: showSlug, linkId: link.id, resend: isResend }),
      });
      const result = (await response.json()) as { success?: boolean; error?: string | null };
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to send reserved-seat email.");
      setStatusMessage(isResend ? "Reserved-seat email resent." : "Reserved-seat email sent.");
      await loadReservedSeating();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to send reserved-seat email."));
      await loadReservedSeating();
    } finally {
      setActiveActionId(null);
    }
  }
  async function handleResendOfficialTicketEmail(link: LinkWithSeats) {
    setActiveActionId(`ticket-email-${link.id}`);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/reserved-seat-ticket-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: showSlug, reservationId: link.id }),
      });
      const result = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to resend the official ticket email.");
      setStatusMessage(result.message || "Official ticket email resent.");
      setPostAssignmentPromptLinkId(null);
      await loadReservedSeating();
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to resend the official ticket email."));
      return false;
    } finally {
      setActiveActionId(null);
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
        const completedReservation = manualAssignLink.seatIds.length + 1 >= manualAssignLink.ticket_count;
        setStatusMessage(`${assignedLabel} ${formatReservedSeatLabel(seatId)} assigned to ${manualAssignLink.customer_name}.`);
        await loadReservedSeating();
        if (completedReservation && !manualAssignLink.ticket_emailed_at) {
          setPostAssignmentPromptLinkId(manualAssignLink.id);
        }
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

  async function handleRemoveAutoAssign(link: LinkWithSeats) {
    if (link.seat_preference !== "auto_assign" || link.seatIds.length > 0) {
      return;
    }

    setActiveActionId(`remove-auto-assign-${link.id}`);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/reserved-seating/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: link.selection_token, preference: "customer_select" }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to remove the Auto Assign request.");
      }

      setLinks((currentLinks) => currentLinks.map((currentLink) => (
        currentLink.id === link.id
          ? { ...currentLink, seat_preference: "customer_select" }
          : currentLink
      )));
      setStatusMessage(`${link.customer_name} is now selecting their own seats.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to remove the Auto Assign request."));
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

  async function handleSendReminder(link: LinkWithSeats) {
    setActiveActionId(`reminder-${link.id}`);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/shows/${showId}/reserved-seat-reminders`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "single", slug: showSlug, reservationId: link.id, requestId: crypto.randomUUID() }),
      });
      const payload = await response.json() as { success?: boolean; error?: string; result?: { sequenceNumber?: number } };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send the reminder.");
      setStatusMessage(`Reminder #${payload.result?.sequenceNumber ?? ""} sent to ${link.customer_name}.`);
      await loadReservedSeatEmailStatuses(links);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to send the reminder."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleSendBulkReminders() {
    setShowBulkReminderConfirmation(false);
    setActiveActionId("bulk-reminders");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/shows/${showId}/reserved-seat-reminders`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", slug: showSlug, bulkOperationId: crypto.randomUUID() }),
      });
      const payload = await response.json() as { success?: boolean; error?: string; summary?: Record<string, number> };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send reminders.");
      const sent = payload.summary?.sent ?? 0;
      const already = payload.summary?.already_processed ?? 0;
      const failed = payload.summary?.failed ?? 0;
      const skipped = Object.entries(payload.summary ?? {}).reduce(
        (count, [key, value]) => count + (["sent", "already_processed", "failed"].includes(key) ? 0 : value),
        0,
      );
      setStatusMessage(`Reminders complete: ${sent} sent, ${already} already processed, ${skipped} skipped, ${failed} failed.`);
      await loadReservedSeatEmailStatuses(links);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to send reminders."));
    } finally {
      setActiveActionId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_24%),linear-gradient(180deg,_#0a1627,_#070f1c_58%,_#050913)] p-4 text-slate-100 shadow-[0_24px_54px_rgba(2,6,23,0.42)] sm:p-5">
      <div className="grid gap-2.5">
        <div>
          <h3 className="text-xl font-semibold text-white">Reserved Seating</h3>
          <p className="text-sm text-slate-300">
            Manage reserved seating, assignments, public availability, and seat cards from one place.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Reserved Seating actions">
          <button
            type="button"
            onClick={onToggleReservedSeating}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-center text-sm font-semibold leading-5 text-emerald-100 transition hover:bg-emerald-500/30"
          >
            Hide Reserved Seating
          </button>
          <button
            type="button"
            onClick={onOpenPublicSeatAvailabilityPage}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold leading-5 text-slate-100 transition hover:bg-white/[0.1]"
          >
            Open Public Availability
          </button>
          <button
            type="button"
            onClick={onCopyPublicSeatAvailabilityLink}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-center text-sm font-semibold leading-5 text-emerald-100 transition hover:bg-emerald-500/25"
          >
            {copiedPublicSeatAvailabilityLink ? "Availability Link Copied" : "Copy Availability Link"}
          </button>
          <button
            type="button"
            onClick={() => setShowBulkReminderConfirmation(true)}
            disabled={bulkReminderEligibleCount === 0 || activeActionId === "bulk-reminders"}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-center text-sm font-semibold leading-5 text-sky-100 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activeActionId === "bulk-reminders" ? "Sending Reminders..." : `Send Reminders (${bulkReminderEligibleCount})`}
          </button>
          <Link
            href={`/admin/${showSlug}/print/seat-map-roster`}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold leading-5 text-slate-100 transition hover:bg-white/[0.1]"
          >
            Print Seat Map &amp; Roster
          </Link>
          <Link
            href={`/admin/${showSlug}/print/selected-seat-cards`}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-center text-sm font-semibold leading-5 text-slate-100 transition hover:bg-white/[0.1]"
          >
            Print Selected Seat Cards
          </Link>
        </div>
        <p className="sr-only">
          Public availability URL: {publicSeatAvailabilityUrl}. Generic fallback: {genericPublicSeatAvailabilityUrl}.
        </p>
      </div>

      <details className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.04]">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 marker:hidden">
          <span className="font-semibold text-white">Reserved Seating Status</span>
          <span className="text-xs font-semibold text-slate-300">
            {seatPreferenceCounts.autoAssignRequested} Auto Assign · {seatPreferenceCounts.customerSelecting} Selecting · {seatPreferenceCounts.seatsAssigned} Assigned · {readinessSummary.ready.reservations} Ready
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${seatingAttentionCount > 0 ? "border-amber-300/40 bg-amber-400/15 text-amber-100" : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"}`}>
            {seatingAttentionCount > 0 ? `${seatingAttentionCount} item${seatingAttentionCount === 1 ? "" : "s"} need attention` : "No items need attention"}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300 group-open:hidden">Expand</span>
          <span className="hidden text-xs font-bold uppercase tracking-[0.12em] text-slate-300 group-open:inline">Collapse</span>
        </summary>
        <div className="border-t border-white/10 p-3">
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Reserved seating preference summary">
        <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/15 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-100">Auto Assign Requested</p>
          <p className="mt-1 text-3xl font-black text-white">{seatPreferenceCounts.autoAssignRequested}</p>
        </div>
        <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">Customer Selecting Seats</p>
          <p className="mt-1 text-3xl font-black text-white">{seatPreferenceCounts.customerSelecting}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Seats Already Assigned</p>
          <p className="mt-1 text-3xl font-black text-white">{seatPreferenceCounts.seatsAssigned}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="Reserved seating readiness summary">
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">🔴 Auto Assign Requests Waiting</p>
          <p className="mt-2 text-lg font-black text-white">{readinessSummary.autoAssignWaiting.reservations} Reservations</p>
          <p className="text-sm font-semibold text-rose-100">{readinessSummary.autoAssignWaiting.seats} Seats</p>
        </div>
        <div className="rounded-2xl border border-amber-300/35 bg-amber-400/15 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-100">🟡 Assigned but Tickets Not Emailed</p>
          <p className="mt-2 text-lg font-black text-white">{readinessSummary.assignedNotEmailed.reservations} Reservations</p>
          <p className="text-sm font-semibold text-amber-100">{readinessSummary.assignedNotEmailed.seats} Seats</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-100">🟢 Ready</p>
          <p className="mt-2 text-lg font-black text-white">{readinessSummary.ready.reservations} Reservations</p>
          <p className="text-sm font-semibold text-emerald-100">{readinessSummary.ready.seats} Seats</p>
        </div>
        </div>
      </div>
      </details>

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
                  value={buildReservedSeatingMessageBody({
                    customerName: messageLink.customer_name,
                    ticketCount: messageLink.ticket_count,
                    absoluteUrl: getCustomerLinkUrl(messageLink.selection_token),
                    formattedDate: formatShowDate(showDate),
                  })}
                  className="mt-2 min-h-[18rem] w-full rounded-xl border border-white/12 bg-slate-950/70 px-3 py-3 text-sm leading-6 text-slate-100 outline-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyReservedSeatingMessageText(
                      buildReservedSeatingMessageBody({
                        customerName: messageLink.customer_name,
                        ticketCount: messageLink.ticket_count,
                        absoluteUrl: getCustomerLinkUrl(messageLink.selection_token),
                        formattedDate: formatShowDate(showDate),
                      }),
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
          showCustomerSeatDetails
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
            { value: "auto_assign", label: "Show Auto Assign Requests Only" },
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
          {missingTicketCodeCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleGenerateMissingTicketCodes()}
              disabled={ticketCodeActionId === "bulk"}
              className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ticketCodeActionId === "bulk"
                ? "Generating Ticket Codes..."
                : `Generate Missing Ticket Codes (${missingTicketCodeCount})`}
            </button>
          ) : null}
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
          <div className="mt-4 grid gap-5">
            {filteredLinksWithSeats.map((link, index) => {
              const status = getLinkStatus(link);
              const isManualAssigning = manualAssignLinkId === link.id;
              const linkSeatCategory = normalizeReservedSeatCategory(link.seat_category, link.is_complimentary);
              const emailStatus = emailStatuses[link.id];
              const latestDelivery = emailStatus?.deliveries?.length
                ? emailStatus.deliveries[emailStatus.deliveries.length - 1]
                : null;
              const emailStatusDisplay = getReservedSeatEmailStatusDisplayModel({
                emailStatus: latestDelivery ?? emailStatus,
                requestState: emailTrackingRequestState,
              });
              const reminderEligibility = reminderEligibilityByLink[link.id];
              const emailStatusToneClasses = getEmailStatusToneClasses(emailStatusDisplay.statusTone);
              const officialTicketReadiness = getOfficialTicketReadiness(link.ticket_emailed_at);
              return (
                <article key={link.id} className={`rounded-2xl border border-l-2 p-4 transition ${isManualAssigning ? "border-violet-400/30 bg-violet-500/10" : index % 2 === 0 ? "border-white/20 border-l-slate-500/60 bg-[#07111f] shadow-[0_10px_24px_rgba(2,6,23,0.22)]" : "border-white/25 border-l-slate-400/70 bg-[#142238] shadow-[0_10px_24px_rgba(2,6,23,0.28)]"}`}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 [&::-webkit-details-marker]:hidden sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-base font-semibold text-white">{link.customer_name}</h5>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${status.classes}`}>{status.label}</span>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getReservedSeatCategoryBadgeClasses(linkSeatCategory)}`}>
                            {getReservedSeatCategoryLabel(linkSeatCategory)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                            {link.ticket_count} seat{link.ticket_count === 1 ? "" : "s"}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] shadow-sm ${link.seat_preference === "auto_assign" ? "border-fuchsia-300/60 bg-fuchsia-500/25 text-fuchsia-50 shadow-fuchsia-950/30" : "border-white/10 bg-white/[0.05] text-slate-200"}`}>
                            {link.seat_preference === "auto_assign" ? "\u{1F91D} Auto Assign Requested" : "Customer Selecting Seats"}
                          </span>
                          {link.seatIds.length > 0 ? (
                            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] shadow-sm ${officialTicketReadiness.ready ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100 shadow-emerald-950/30" : "border-amber-300/50 bg-amber-400/20 text-amber-100 shadow-amber-950/30"}`}>
                              {officialTicketReadiness.label}
                            </span>
                          ) : null}
                          {emailStatusDisplay.showCompactBadge ? (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${emailStatusToneClasses}`}>
                              <span aria-hidden="true">{emailStatusDisplay.statusIcon}</span>
                              {emailStatusDisplay.compactBadgeLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-slate-200">
                            Seats: {link.seatIds.length > 0 ? link.seatIds.join(", ") : "Not selected yet"}
                          </span>
                          {link.scan_token ? (
                            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">
                              Ticket Code Ready
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-slate-100 transition group-hover:bg-white/[0.1]">
                        <span className="group-open:hidden">Expand Details</span>
                        <span className="hidden group-open:inline">Collapse Details</span>
                        <span aria-hidden="true" className="transition-transform group-open:rotate-180">&#9662;</span>
                      </span>
                    </summary>
                    <div className="mt-4 border-t border-white/10 pt-4">
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
                        <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] shadow-sm ${link.seat_preference === "auto_assign" ? "border-fuchsia-300/60 bg-fuchsia-500/25 text-fuchsia-50 shadow-fuchsia-950/30" : "border-white/10 bg-white/[0.05] text-slate-200"}`}>
                          {link.seat_preference === "auto_assign" ? "🤝 Auto Assign Requested" : "Customer Selecting Seats"}
                        </span>
                        {link.seatIds.length > 0 ? (
                          <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] shadow-sm ${officialTicketReadiness.ready ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100 shadow-emerald-950/30" : "border-amber-300/50 bg-amber-400/20 text-amber-100 shadow-amber-950/30"}`}>
                            {officialTicketReadiness.label}
                          </span>
                        ) : null}
                        {emailStatusDisplay.showCompactBadge ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${emailStatusToneClasses}`}>
                            <span aria-hidden="true">{emailStatusDisplay.statusIcon}</span>
                            {emailStatusDisplay.compactBadgeLabel}
                          </span>
                        ) : null}
                      </div>
                      {link.email?.trim() ? <p className="mt-2 text-sm text-slate-300">{link.email}</p> : null}
                      {link.source_note?.trim() ? <p className="mt-2 text-sm text-slate-300">{link.source_note}</p> : null}
                      <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3" aria-live="polite">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Email Status</p>
                        {emailStatus?.deliveries?.length ? (
                          <div className="mt-2 space-y-2" aria-label="Reserved-seat email delivery history">
                            {emailStatus.deliveries.map((delivery) => {
                              const deliveryDisplay = getReservedSeatEmailStatusDisplayModel({
                                emailStatus: delivery,
                                requestState: "loaded",
                              });
                              const deliveryTone = getEmailStatusToneClasses(deliveryDisplay.statusTone);
                              return (
                                <div key={delivery.id} className={`rounded-lg border-l-2 px-3 py-2 ${deliveryTone}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-white">{delivery.label}</p>
                                    <p className="text-xs font-semibold">{deliveryDisplay.prominentLabel}</p>
                                  </div>
                                  {(delivery.sentAt ?? deliveryDisplay.prominentTimestamp) ? (
                                    <time className="mt-1 block text-[11px] opacity-80" dateTime={delivery.sentAt ?? deliveryDisplay.prominentTimestamp ?? undefined}>
                                      {formatReservedSeatEmailTimestamp(delivery.sentAt ?? deliveryDisplay.prominentTimestamp)}
                                    </time>
                                  ) : null}
                                  {delivery.errorMessage ? <p className="mt-1 text-xs text-rose-200">{delivery.errorMessage}</p> : null}
                                  {deliveryDisplay.showHistory ? (
                                    <p className="mt-1 text-[11px] opacity-80">
                                      {deliveryDisplay.history.map((entry) => entry.label).join(" / ")}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {!emailStatus?.deliveries?.length ? (
                          <>
                        <div className={`mt-2 rounded-lg border-l-2 px-3 py-2 ${emailStatusToneClasses}`}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">Latest Activity</p>
                          <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                            <span aria-hidden="true">{emailStatusDisplay.statusIcon}</span>
                            <span>{emailStatusDisplay.prominentLabel}</span>
                          </p>
                          {emailStatusDisplay.prominentTimestamp ? (
                            <time
                              className="mt-1 block text-xs opacity-80"
                              dateTime={emailStatusDisplay.prominentTimestamp}
                              title={formatReservedSeatEmailFullTimestamp(emailStatusDisplay.prominentTimestamp)}
                            >
                              {formatReservedSeatEmailTimestamp(emailStatusDisplay.prominentTimestamp)}
                            </time>
                          ) : null}
                        </div>
                        {emailStatusDisplay.showHistory ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-300">View tracking history</summary>
                            <div className="mt-2 space-y-2" role="list">
                              {emailStatusDisplay.history.map((entry, index) => {
                                const historyVisual = getReservedSeatEmailStatusVisual(entry.label);
                                return (
                                  <div key={`${entry.label}-${entry.timestamp ?? "none"}-${index}`} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2" role="listitem">
                                    <span className="mt-0.5 text-sm" aria-hidden="true">{historyVisual.icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-slate-200">{entry.label}</p>
                                      {entry.timestamp ? (
                                        <time
                                          className="mt-0.5 block text-[11px] text-slate-400"
                                          dateTime={entry.timestamp}
                                          title={formatReservedSeatEmailFullTimestamp(entry.timestamp)}
                                        >
                                          {formatReservedSeatEmailTimestamp(entry.timestamp)}
                                        </time>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ) : null}
                        {emailStatusDisplay.secondaryMessage ? (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-200">
                            <span aria-hidden="true">⚠</span>
                            {emailStatusDisplay.secondaryMessage}
                          </p>
                        ) : null}
                        {emailStatusDisplay.showRetryButton ? (
                          <button
                            type="button"
                            onClick={() => void handleRetryEmailTracking()}
                            className="mt-2 inline-flex rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                          >
                            Retry
                          </button>
                        ) : null}
                          </>
                        ) : null}
                        <p className="mt-2 text-xs text-slate-400">Attempts: {emailStatus?.attempts ?? link.email_attempt_count ?? 0}</p>
                        {emailStatus?.prominentLabel === "Tracking unavailable" && link.sent_at ? (
                          <p className="mt-1 text-xs text-slate-400">Tracking unavailable for this message.</p>
                        ) : null}
                        {(emailStatus?.lastEmailError ?? link.last_email_error) ? (
                          <p className="mt-1 text-xs text-rose-200">Last email error: {emailStatus?.lastEmailError ?? link.last_email_error}</p>
                        ) : null}
                      </div>
                      <p className="mt-2 break-all text-sm text-slate-400">{getCustomerLinkUrl(link.selection_token)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {link.seatIds.length > 0 ? (
                          link.seatIds.map((seatId) => (
                            <span key={seatId} className="rounded-full border border-amber-300/25 bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                              {seatId}
                            </span>
                          ))
                        ) : (
                          <span className={`text-sm ${link.seat_preference === "auto_assign" ? "font-bold text-fuchsia-200" : "text-slate-400"}`}>
                            {link.seat_preference === "auto_assign" ? "Waiting for Auto Assignment" : "No seats selected yet."}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {link.scan_token ? (
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">
                            Ticket Code Ready
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleGenerateTicketCode(link)}
                            disabled={ticketCodeActionId === link.id}
                            className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ticketCodeActionId === link.id ? "Generating..." : "Generate Ticket Code"}
                          </button>
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
                      {reminderEligibility?.eligible ? (
                        <button
                          type="button"
                          onClick={() => void handleSendReminder(link)}
                          disabled={activeActionId === `reminder-${link.id}`}
                          className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activeActionId === `reminder-${link.id}` ? "Sending Reminder..." : "Send Reminder"}
                        </button>
                      ) : reminderEligibility?.reason === "partial_assignment" ? (
                        <span className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-100">Needs Attention - Partial Assignment</span>
                      ) : reminderEligibility?.reason === "complete" || reminderEligibility?.reason === "completed_selection" ? (
                        <span className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100">Seats Complete</span>
                      ) : reminderEligibility?.reason === "missing_email" ? (
                        <span className="rounded-xl border border-slate-400/25 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300">Cannot remind - Missing email</span>
                      ) : null}
                      {link.email?.trim() ? (
                        <button
                          type="button"
                          onClick={() => void handleSendSeatEmail(link)}
                          disabled={activeActionId === `email-${link.id}`}
                          className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activeActionId === `email-${link.id}` ? "Sending..." : link.resend_email_id ? "Resend Seat Email" : link.last_email_error ? "Retry Email" : "Send Seat Email"}
                        </button>
                      ) : null}
                      {link.submitted_at && link.email?.trim() ? (
                        <button
                          type="button"
                          onClick={() => void handleResendOfficialTicketEmail(link)}
                          disabled={activeActionId === `ticket-email-${link.id}`}
                          className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activeActionId === `ticket-email-${link.id}` ? "Sending Ticket..." : "Resend Ticket Email"}
                        </button>
                      ) : null}
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
                      {link.seat_preference === "auto_assign" && link.seatIds.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => void handleRemoveAutoAssign(link)}
                          disabled={activeActionId === `remove-auto-assign-${link.id}`}
                          className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/15 px-4 py-2.5 text-sm font-bold text-fuchsia-100 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activeActionId === `remove-auto-assign-${link.id}` ? "Removing..." : "Remove Auto Assign"}
                        </button>
                      ) : null}
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
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {showBulkReminderConfirmation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="bulk-reminder-title">
          <div className="w-full max-w-lg rounded-3xl border border-white/12 bg-[#0b1627] p-6 text-slate-100 shadow-2xl">
            <h2 id="bulk-reminder-title" className="text-2xl font-black text-white">Send Seat-Selection Reminders?</h2>
            <p className="mt-4 text-slate-200">
              Send seat-selection reminders to {bulkReminderEligibleCount} customer{bulkReminderEligibleCount === 1 ? "" : "s"} who still need to select their seats?
            </p>
            <p className="mt-2 text-sm text-slate-400">StageFlow will check every reservation again immediately before sending.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void handleSendBulkReminders()} className="rounded-xl bg-sky-600 px-4 py-3 font-bold text-white hover:bg-sky-500">
                Send {bulkReminderEligibleCount} Reminder{bulkReminderEligibleCount === 1 ? "" : "s"}
              </button>
              <button type="button" onClick={() => setShowBulkReminderConfirmation(false)} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 font-semibold text-white hover:bg-white/[0.1]">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      {postAssignmentPromptLink && !postAssignmentPromptLink.ticket_emailed_at ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="seats-assigned-title">
          <div className="w-full max-w-md rounded-3xl border border-white/12 bg-[#0b1627] p-6 text-slate-100 shadow-2xl">
            <h2 id="seats-assigned-title" className="text-2xl font-black text-white">Seats Assigned</h2>
            <p className="mt-4 text-slate-200">Seats were assigned successfully.</p>
            <p className="mt-2 text-slate-300">Would you like to email the tickets now?</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void handleResendOfficialTicketEmail(postAssignmentPromptLink)} disabled={activeActionId === `ticket-email-${postAssignmentPromptLink.id}`} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">{activeActionId === `ticket-email-${postAssignmentPromptLink.id}` ? "Emailing..." : "Email Tickets"}</button>
              <button type="button" onClick={() => setPostAssignmentPromptLinkId(null)} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 font-semibold text-white hover:bg-white/[0.1]">Not Now</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


