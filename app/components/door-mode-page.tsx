"use client";

import Image from "next/image";
import Link from "next/link";
import { ReservedSeatMap, type ReservedSeatMapSeatState } from "@/app/components/reserved-seat-map";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShowCompTicket, ShowRecord, ShowSponsor, SponsorLibraryEntry } from "@/lib/types";
import { checkInAdmissionLabel, checkInTicketDestination } from "@/lib/check-in-ticket-classification";
import {
  addRecentGuestCheckIn,
  admissionMatchesDoorSearch,
  attendanceProgressPercent,
  expectedDoorAttendance,
  isAdmissionFullyCheckedIn,
  normalizedDoorSearch,
  normalizeDoorReservedSeatIds,
  visibleDoorModeNote,
  type RecentGuestCheckIn,
} from "@/lib/door-mode-presentation";
import { RESERVED_SEAT_DEFINITIONS } from "@/lib/reserved-seating";
import type { DoorModeSeatAssignment } from "@/lib/door-mode-seat-assignments";

const PAID_ONLINE_TICKET_PRICE = 8;
const DOOR_TICKET_PRICE = 10;
const COMP_TICKET_VALUE = 10;
const RECENT_ACTIVITY_LIMIT = 8;
const DOOR_RESERVED_SEAT_IDS = RESERVED_SEAT_DEFINITIONS.map((seat) => seat.seatId);

type DoorModePageProps = {
  showSlug: string;
};

type DoorModeActivity = {
  id: string;
  label: string;
  createdAt: number;
  undo: () => Promise<void>;
};

type DoorSeatView = {
  guestName: string;
  admissionLabel: string;
  seatIds: string[];
  trigger: HTMLButtonElement;
};

type DoorModeShowSponsor = ShowSponsor & {
  sponsor?: SponsorLibraryEntry | SponsorLibraryEntry[] | null;
};

function normalizeGuestListTicketType(value: string | null | undefined) {
  return value === "paid_online" ||
    value === "door_paid" ||
    value === "manual" ||
    value === "complimentary"
    ? value
    : "complimentary";
}

function normalizeShowCompTicket(
  item: Omit<ShowCompTicket, "ticket_count" | "checked_in_count"> & {
    ticket_count: number | string | null;
    checked_in_count?: number | string | null;
  },
): ShowCompTicket {
  const parsedTicketCount =
    typeof item.ticket_count === "number"
      ? item.ticket_count
      : typeof item.ticket_count === "string"
        ? Number.parseInt(item.ticket_count, 10)
        : 1;
  const ticketCount = Number.isFinite(parsedTicketCount) && parsedTicketCount > 0 ? parsedTicketCount : 1;
  const parsedCheckedInCount =
    typeof item.checked_in_count === "number"
      ? item.checked_in_count
      : typeof item.checked_in_count === "string"
        ? Number.parseInt(item.checked_in_count, 10)
        : item.checked_in
          ? ticketCount
          : 0;
  const checkedInCount = Math.max(
    0,
    Math.min(ticketCount, Number.isFinite(parsedCheckedInCount) ? parsedCheckedInCount : 0),
  );

  return {
    ...item,
    email: item.email ?? null,
    order_id: item.order_id ?? null,
    import_key: item.import_key ?? null,
    notes: item.notes ?? null,
    ticket_type: normalizeGuestListTicketType(item.ticket_type),
    ticket_count: ticketCount,
    checked_in: checkedInCount >= ticketCount,
    checked_in_count: checkedInCount,
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatShowDate(value: string | null) {
  if (!value) {
    return "Date TBD";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

function renderTextWithLinks(text: string | null | undefined) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urlOnlyPattern = /^https?:\/\/[^\s]+$/;
  const value = text ?? "";

  return value.split(urlPattern).map((part, index) => {
    if (!part) {
      return null;
    }

    if (urlOnlyPattern.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-700 underline"
        >
          {part}
        </a>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function renderDoorModeNoteDetails(notes: string | null | undefined) {
  const visibleNote = visibleDoorModeNote(notes);
  if (!visibleNote) return null;
  return (
    <details className="text-xs text-gray-500">
      <summary className="cursor-pointer font-medium text-gray-400">Details</summary>
      <p className="mt-1 whitespace-pre-wrap leading-5">{renderTextWithLinks(visibleNote)}</p>
    </details>
  );
}

function sortCompTickets(items: ShowCompTicket[]) {
  return [...items].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function clampCheckedInCount(value: number, ticketCount: number) {
  return Math.max(0, Math.min(ticketCount, value));
}

function createDoorSaleOrderId() {
  return `DOOR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeSponsorLibraryEntry(
  sponsor: SponsorLibraryEntry & { estimated_value?: number | string | null },
): SponsorLibraryEntry {
  const parsedEstimatedValue =
    typeof sponsor.estimated_value === "number"
      ? sponsor.estimated_value
      : typeof sponsor.estimated_value === "string"
        ? Number.parseFloat(sponsor.estimated_value)
        : null;

  return {
    ...sponsor,
    estimated_value: Number.isFinite(parsedEstimatedValue) ? parsedEstimatedValue : null,
  };
}

function normalizeShowSponsor(
  sponsor: DoorModeShowSponsor,
): ShowSponsor {
  const relatedSponsor = Array.isArray(sponsor.sponsor) ? sponsor.sponsor[0] : sponsor.sponsor;
  const parsedEstimatedValue =
    typeof sponsor.estimated_value === "number"
      ? sponsor.estimated_value
      : typeof sponsor.estimated_value === "string"
        ? Number.parseFloat(sponsor.estimated_value)
        : null;
  const parsedCompTicketAllowance =
    typeof sponsor.comp_ticket_allowance === "number"
      ? sponsor.comp_ticket_allowance
      : typeof sponsor.comp_ticket_allowance === "string"
        ? Number.parseInt(sponsor.comp_ticket_allowance, 10)
        : 0;
  const parsedCompTicketsCheckedIn =
    typeof sponsor.comp_tickets_checked_in === "number"
      ? sponsor.comp_tickets_checked_in
      : typeof sponsor.comp_tickets_checked_in === "string"
        ? Number.parseInt(sponsor.comp_tickets_checked_in, 10)
        : 0;

  return {
    ...sponsor,
    sponsor_type: sponsor.sponsor_type ?? null,
    default_contribution: sponsor.default_contribution ?? null,
    estimated_value: Number.isFinite(parsedEstimatedValue) ? parsedEstimatedValue : null,
    recognition_notes: sponsor.recognition_notes ?? null,
    comp_ticket_allowance:
      Number.isFinite(parsedCompTicketAllowance) && parsedCompTicketAllowance > 0
        ? parsedCompTicketAllowance
        : 0,
    comp_tickets_checked_in:
      Number.isFinite(parsedCompTicketsCheckedIn) && parsedCompTicketsCheckedIn > 0
        ? parsedCompTicketsCheckedIn
        : 0,
    sponsor: relatedSponsor ? normalizeSponsorLibraryEntry(relatedSponsor) : null,
  };
}

function getSponsorCardName(sponsor: ShowSponsor) {
  return sponsor.sponsor?.name ?? "Assigned sponsor";
}

function SponsorLogoThumbnail({
  logoUrl,
  sponsorName,
}: {
  logoUrl: string | null | undefined;
  sponsorName: string;
}) {
  const initials = sponsorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SP";

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-700 bg-gray-800/70">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${sponsorName} logo`}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-300">
          {initials}
        </span>
      )}
    </div>
  );
}

export function DoorModePage({ showSlug }: DoorModePageProps) {
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [compTickets, setCompTickets] = useState<ShowCompTicket[]>([]);
  const [showSponsors, setShowSponsors] = useState<ShowSponsor[]>([]);
  const [recentActivities, setRecentActivities] = useState<DoorModeActivity[]>([]);
  const [isTotalsPanelOpen, setIsTotalsPanelOpen] = useState(false);
  const [isSponsorCompPanelOpen, setIsSponsorCompPanelOpen] = useState(false);
  const [sponsorCompCustomAmounts, setSponsorCompCustomAmounts] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guestSearch, setGuestSearch] = useState("");
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isRecentCheckInsOpen, setIsRecentCheckInsOpen] = useState(false);
  const [checkInConfirmation, setCheckInConfirmation] = useState<string | null>(null);
  const [recentGuestCheckIns, setRecentGuestCheckIns] = useState<RecentGuestCheckIn[]>([]);
  const [seatView, setSeatView] = useState<DoorSeatView | null>(null);
  const [seatIdsByTicketId, setSeatIdsByTicketId] = useState<Record<string, string[]>>({});
  const seatDialogCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const printMenuRef = useRef<HTMLDivElement | null>(null);
  const guestSearchRef = useRef<HTMLInputElement | null>(null);

  const loadDoorModeData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data: showData, error: showError } = await supabase
        .from("shows")
        .select("*")
        .eq("slug", showSlug)
        .single();

      if (showError) {
        throw showError;
      }

      const normalizedShow = showData as ShowRecord;
      setShow(normalizedShow);

      const { data: ticketData, error: ticketError } = await supabase
        .from("show_comp_tickets")
        .select("*")
        .eq("show_id", normalizedShow.id)
        .order("created_at", { ascending: true });

      if (ticketError) {
        throw ticketError;
      }

      let seatAssignments: DoorModeSeatAssignment[] = [];
      try {
        const seatResponse = await fetch(
          `/api/admin/shows/${encodeURIComponent(normalizedShow.id)}/door-seat-assignments?slug=${encodeURIComponent(normalizedShow.slug)}`,
          { method: "GET", credentials: "same-origin", cache: "no-store" },
        );
        const seatPayload = await seatResponse.json().catch(() => null) as DoorModeSeatAssignment[] | null;
        if (seatResponse.ok && Array.isArray(seatPayload)) {
          seatAssignments = seatPayload;
        }
      } catch {
        seatAssignments = [];
      }
      setSeatIdsByTicketId(Object.fromEntries(
        seatAssignments.map((assignment) => [assignment.projectedTicketId, assignment.seatIds]),
      ));

      const { data: showSponsorData, error: showSponsorError } = await supabase
        .from("show_sponsors")
        .select("*, sponsor:sponsor_library(*)")
        .eq("show_id", normalizedShow.id)
        .order("placement_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (showSponsorError) {
        throw showSponsorError;
      }

      setCompTickets(
        sortCompTickets(
          ((ticketData ?? []) as Array<
            Omit<ShowCompTicket, "ticket_count" | "checked_in_count"> & {
              ticket_count: number | string | null;
              checked_in_count?: number | string | null;
            }
          >).map((item) => normalizeShowCompTicket(item)),
        ),
      );
      setShowSponsors(
        ((showSponsorData ?? []) as DoorModeShowSponsor[]).map((item) => normalizeShowSponsor(item)),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Door Mode.");
    } finally {
      setIsLoading(false);
    }
  }, [showSlug]);

  useEffect(() => {
    void loadDoorModeData();
  }, [loadDoorModeData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isPrintMenuOpen) return;
    function handlePrintMenuDismiss(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setIsPrintMenuOpen(false);
        return;
      }
      if (event instanceof MouseEvent && printMenuRef.current && !printMenuRef.current.contains(event.target as Node)) {
        setIsPrintMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePrintMenuDismiss);
    document.addEventListener("keydown", handlePrintMenuDismiss);
    return () => {
      document.removeEventListener("mousedown", handlePrintMenuDismiss);
      document.removeEventListener("keydown", handlePrintMenuDismiss);
    };
  }, [isPrintMenuOpen]);

  useEffect(() => {
    if (!checkInConfirmation) return;
    const timeout = window.setTimeout(() => setCheckInConfirmation(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [checkInConfirmation]);

  useEffect(() => {
    if (!seatView) return;
    const trigger = seatView.trigger;
    const focusFrame = window.requestAnimationFrame(() => seatDialogCloseButtonRef.current?.focus());
    function handleSeatDialogKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSeatView(null);
      window.requestAnimationFrame(() => trigger.focus());
    }
    document.addEventListener("keydown", handleSeatDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleSeatDialogKeyDown);
    };
  }, [seatView]);

  const doorPaidTickets = useMemo(
    () =>
      compTickets
        .filter((item) => normalizeGuestListTicketType(item.ticket_type) === "door_paid")
        .reduce((sum, item) => sum + item.checked_in_count, 0),
    [compTickets],
  );
  const prepaidOnlineTickets = useMemo(
    () =>
      compTickets
        .filter((item) => normalizeGuestListTicketType(item.ticket_type) === "paid_online")
        .reduce((sum, item) => sum + item.checked_in_count, 0),
    [compTickets],
  );
  const compCheckedInTickets = useMemo(
    () =>
      compTickets
        .filter((item) => normalizeGuestListTicketType(item.ticket_type) === "complimentary")
        .reduce((sum, item) => sum + item.checked_in_count, 0),
    [compTickets],
  );
  const sponsorCompTicketsAllowed = useMemo(
    () => showSponsors.reduce((sum, sponsor) => sum + sponsor.comp_ticket_allowance, 0),
    [showSponsors],
  );
  const sponsorCompTicketsCheckedIn = useMemo(
    () => showSponsors.reduce((sum, sponsor) => sum + sponsor.comp_tickets_checked_in, 0),
    [showSponsors],
  );
  const sponsorCompTicketsRemaining = useMemo(
    () =>
      showSponsors.reduce(
        (sum, sponsor) => sum + Math.max(0, sponsor.comp_ticket_allowance - sponsor.comp_tickets_checked_in),
        0,
      ),
    [showSponsors],
  );
  const manualCheckedInTickets = useMemo(
    () =>
      compTickets
        .filter((item) => normalizeGuestListTicketType(item.ticket_type) === "manual")
        .reduce((sum, item) => sum + item.checked_in_count, 0),
    [compTickets],
  );
  const doorPaidRevenue = doorPaidTickets * DOOR_TICKET_PRICE;
  const prepaidOnlineRevenue = prepaidOnlineTickets * PAID_ONLINE_TICKET_PRICE;
  const estimatedCompValue = compCheckedInTickets * COMP_TICKET_VALUE;
  const totalPaidAttendance = doorPaidTickets + prepaidOnlineTickets;
  const totalAttendance =
    totalPaidAttendance + compCheckedInTickets + sponsorCompTicketsCheckedIn + manualCheckedInTickets;
  const totalRevenue = doorPaidRevenue + prepaidOnlineRevenue;
  const expectedAttendance = expectedDoorAttendance(compTickets, sponsorCompTicketsAllowed);
  const attendanceProgress = attendanceProgressPercent(totalAttendance, expectedAttendance);
  void attendanceProgress;
  const formattedCurrentTime = currentTime.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const prepaidTickets = useMemo(
    () =>
      compTickets
        .filter((item) => checkInTicketDestination(item.ticket_type, item.notes) === "prepaid_online")
        .sort((left, right) => {
          const leftComplete = left.checked_in_count >= left.ticket_count;
          const rightComplete = right.checked_in_count >= right.ticket_count;

          if (leftComplete !== rightComplete) {
            return leftComplete ? 1 : -1;
          }

          return left.created_at.localeCompare(right.created_at);
        }),
    [compTickets],
  );
  const sponsorsWithCompTickets = useMemo(
    () => showSponsors.filter((sponsor) => (sponsor.comp_ticket_allowance ?? 0) > 0),
    [showSponsors],
  );
  const compAndOtherTickets = useMemo(
    () =>
      compTickets.filter((item) => checkInTicketDestination(item.ticket_type, item.notes) === "special_admissions"),
    [compTickets],
  );

  const filteredPrepaidTickets = useMemo(
    () => prepaidTickets.filter((item) => admissionMatchesDoorSearch(
      item, checkInAdmissionLabel(item.ticket_type, item.notes), guestSearch,
    )),
    [guestSearch, prepaidTickets],
  );
  const filteredSpecialAdmissions = useMemo(
    () => compAndOtherTickets.filter((item) => admissionMatchesDoorSearch(
      item, checkInAdmissionLabel(item.ticket_type, item.notes), guestSearch,
    )),
    [compAndOtherTickets, guestSearch],
  );
  const hasActiveGuestSearch = normalizedDoorSearch(guestSearch).length > 0;
  const prepaidAdmissionCount = prepaidTickets.reduce((sum, item) => sum + item.ticket_count, 0);
  const specialAdmissionCount = compAndOtherTickets.reduce((sum, item) => sum + item.ticket_count, 0);
  const doorSeatStates = useMemo<Record<string, ReservedSeatMapSeatState>>(() => {
    const highlightedSeatIds = new Set(seatView?.seatIds ?? []);
    return Object.fromEntries(
      RESERVED_SEAT_DEFINITIONS.map((seat) => [
        seat.seatId,
        {
          seatId: seat.seatId,
          label: seat.seatId,
          status: highlightedSeatIds.has(seat.seatId) ? "selected" : "unavailable",
          disabled: true,
        },
      ]),
    ) as Record<string, ReservedSeatMapSeatState>;
  }, [seatView]);

  function closeSeatView() {
    const trigger = seatView?.trigger;
    setSeatView(null);
    window.requestAnimationFrame(() => trigger?.focus());
  }

  function renderSeatLocationControl(item: ShowCompTicket) {
    const seatIds = normalizeDoorReservedSeatIds(
      seatIdsByTicketId[item.id] ?? [],
      DOOR_RESERVED_SEAT_IDS,
    );
    if (seatIds.length === 0) return null;

    return (
      <button
        type="button"
        aria-label={`View seats ${seatIds.join(" and ")} for ${item.guest_name}`}
        onClick={(event) => {
          setSeatView({
            guestName: item.guest_name,
            admissionLabel: checkInAdmissionLabel(item.ticket_type, item.notes),
            seatIds,
            trigger: event.currentTarget,
          });
        }}
        className="inline-flex w-fit items-center rounded-lg border border-sky-800/70 bg-sky-500/[0.07] px-3 py-2 text-sm font-semibold text-sky-200 transition hover:border-sky-700 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      >
        Seats: {seatIds.join(", ")} <span className="ml-2 text-xs font-medium text-sky-300">View Seats</span>
      </button>
    );
  }

  function pushRecentActivity(activity: DoorModeActivity) {
    setRecentActivities((current) => [activity, ...current].slice(0, RECENT_ACTIVITY_LIMIT));
  }

  function removeRecentActivity(activityId: string) {
    setRecentActivities((current) => current.filter((item) => item.id !== activityId));
  }

  async function handleAdjustSponsorCompCheckIn(
    sponsor: ShowSponsor,
    delta: number,
    options?: { overrideConfirmed?: boolean },
  ) {
    if (!show || delta === 0) {
      return;
    }

    const nextCheckedInCount = Math.max(0, sponsor.comp_tickets_checked_in + delta);
    const exceedsAllowance = nextCheckedInCount > sponsor.comp_ticket_allowance;

    if (exceedsAllowance && !options?.overrideConfirmed) {
      const confirmed = window.confirm(
        `${getSponsorCardName(sponsor)} only has ${sponsor.comp_ticket_allowance} sponsor comp tickets allowed, but this check-in would bring them to ${nextCheckedInCount}. Continue with an override?`,
      );

      if (!confirmed) {
        return;
      }
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setActiveActionId(`sponsor-comp-${sponsor.id}`);

    try {
      const supabase = createClient();
      const previousCheckedInCount = sponsor.comp_tickets_checked_in;
      const { data, error } = await supabase
        .from("show_sponsors")
        .update({
          comp_tickets_checked_in: nextCheckedInCount,
        })
        .eq("id", sponsor.id)
        .eq("show_id", show.id)
        .select("*, sponsor:sponsor_library(*)")
        .single();

      if (error) {
        throw error;
      }

      const updatedSponsor = normalizeShowSponsor(data as DoorModeShowSponsor);
      setShowSponsors((current) =>
        current.map((currentSponsor) =>
          currentSponsor.id === sponsor.id ? updatedSponsor : currentSponsor,
        ),
      );
      setSponsorCompCustomAmounts((current) => ({
        ...current,
        [sponsor.id]: "",
      }));
      setStatusMessage(
        `${getSponsorCardName(sponsor)} sponsor comp check-ins updated to ${nextCheckedInCount}.`,
      );

      pushRecentActivity({
        id: `sponsor-comp-${sponsor.id}-${Date.now()}`,
        label: `${getSponsorCardName(sponsor)} ${delta > 0 ? `+${delta}` : `${delta}`} sponsor comp${Math.abs(delta) === 1 ? "" : "s"}`,
        createdAt: Date.now(),
        undo: async () => {
          const undoSupabase = createClient();
          const { data: undoData, error: undoError } = await undoSupabase
            .from("show_sponsors")
            .update({
              comp_tickets_checked_in: previousCheckedInCount,
            })
            .eq("id", sponsor.id)
            .eq("show_id", show.id)
            .select("*, sponsor:sponsor_library(*)")
            .single();

          if (undoError) {
            throw undoError;
          }

          const restoredSponsor = normalizeShowSponsor(undoData as DoorModeShowSponsor);
          setShowSponsors((current) =>
            current.map((currentSponsor) =>
              currentSponsor.id === sponsor.id ? restoredSponsor : currentSponsor,
            ),
          );
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update sponsor comp check-ins.");
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleCheckInCustomSponsorCompAmount(sponsor: ShowSponsor) {
    const rawValue = sponsorCompCustomAmounts[sponsor.id] ?? "";
    const customAmount = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(customAmount) || customAmount <= 0) {
      setErrorMessage("Enter a valid sponsor comp check-in amount.");
      return;
    }

    await handleAdjustSponsorCompCheckIn(sponsor, customAmount);
  }

  async function handleAddDoorSale(quantity: number) {
    if (!show || quantity <= 0) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setActiveActionId(`door-add-${quantity}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_comp_tickets")
        .insert({
          show_id: show.id,
          guest_name: "Paid Door Sale",
          email: null,
          ticket_count: quantity,
          ticket_type: "door_paid",
          order_id: createDoorSaleOrderId(),
          notes: "Door Mode sale",
          checked_in: true,
          checked_in_count: quantity,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const insertedTicket = normalizeShowCompTicket(data as ShowCompTicket);
      setCompTickets((current) => sortCompTickets([...current, insertedTicket]));
      setStatusMessage(`Added ${quantity} paid door ticket${quantity === 1 ? "" : "s"}.`);

      pushRecentActivity({
        id: `door-add-${insertedTicket.id}`,
        label: `Paid door +${quantity}`,
        createdAt: Date.now(),
        undo: async () => {
          const undoSupabase = createClient();
          const { error: undoError } = await undoSupabase
            .from("show_comp_tickets")
            .delete()
            .eq("id", insertedTicket.id)
            .eq("show_id", show.id);

          if (undoError) {
            throw undoError;
          }

          setCompTickets((current) => current.filter((item) => item.id !== insertedTicket.id));
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add paid door tickets.");
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleSubtractDoorSale() {
    if (!show) {
      return;
    }

    const latestDoorTicket = [...compTickets]
      .filter(
        (item) =>
          normalizeGuestListTicketType(item.ticket_type) === "door_paid" &&
          item.checked_in_count > 0 &&
          item.ticket_count > 0,
      )
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];

    if (!latestDoorTicket) {
      setErrorMessage("There are no paid door tickets to subtract.");
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setActiveActionId("door-subtract");

    try {
      const supabase = createClient();

      if (latestDoorTicket.ticket_count <= 1) {
        const { error } = await supabase
          .from("show_comp_tickets")
          .delete()
          .eq("id", latestDoorTicket.id)
          .eq("show_id", show.id);

        if (error) {
          throw error;
        }

        setCompTickets((current) => current.filter((item) => item.id !== latestDoorTicket.id));
      } else {
        const nextTicketCount = latestDoorTicket.ticket_count - 1;
        const nextCheckedInCount = clampCheckedInCount(
          latestDoorTicket.checked_in_count - 1,
          nextTicketCount,
        );
        const { data, error } = await supabase
          .from("show_comp_tickets")
          .update({
            ticket_count: nextTicketCount,
            checked_in: nextCheckedInCount >= nextTicketCount,
            checked_in_count: nextCheckedInCount,
          })
          .eq("id", latestDoorTicket.id)
          .eq("show_id", show.id)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const updatedTicket = normalizeShowCompTicket(data as ShowCompTicket);
        setCompTickets((current) =>
          sortCompTickets(
            current.map((item) => (item.id === updatedTicket.id ? updatedTicket : item)),
          ),
        );
      }

      const snapshot = latestDoorTicket;
      setStatusMessage("Removed 1 paid door ticket.");
      pushRecentActivity({
        id: `door-subtract-${snapshot.id}-${Date.now()}`,
        label: "Paid door -1",
        createdAt: Date.now(),
        undo: async () => {
          const undoSupabase = createClient();
          if (snapshot.ticket_count <= 1) {
            const { data, error } = await undoSupabase
              .from("show_comp_tickets")
              .insert({
                id: snapshot.id,
                show_id: snapshot.show_id,
                guest_name: snapshot.guest_name,
                email: snapshot.email,
                ticket_count: snapshot.ticket_count,
                ticket_type: snapshot.ticket_type,
                order_id: snapshot.order_id,
                import_key: snapshot.import_key,
                notes: snapshot.notes,
                checked_in: snapshot.checked_in,
                checked_in_count: snapshot.checked_in_count,
                created_at: snapshot.created_at,
              })
              .select("*")
              .single();

            if (error) {
              throw error;
            }

            const restoredTicket = normalizeShowCompTicket(data as ShowCompTicket);
            setCompTickets((current) => sortCompTickets([...current, restoredTicket]));
            return;
          }

          const { data, error } = await undoSupabase
            .from("show_comp_tickets")
            .update({
              ticket_count: snapshot.ticket_count,
              checked_in: snapshot.checked_in,
              checked_in_count: snapshot.checked_in_count,
            })
            .eq("id", snapshot.id)
            .eq("show_id", snapshot.show_id)
            .select("*")
            .single();

          if (error) {
            throw error;
          }

          const restoredTicket = normalizeShowCompTicket(data as ShowCompTicket);
          setCompTickets((current) =>
            sortCompTickets(
              current.map((item) => (item.id === restoredTicket.id ? restoredTicket : item)),
            ),
          );
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to subtract a door ticket.");
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleAdjustTicketCheckIn(item: ShowCompTicket, delta: number) {
    const nextCheckedInCount = clampCheckedInCount(item.checked_in_count + delta, item.ticket_count);

    if (nextCheckedInCount === item.checked_in_count) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setActiveActionId(`ticket-${item.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_comp_tickets")
        .update({
          checked_in: nextCheckedInCount >= item.ticket_count,
          checked_in_count: nextCheckedInCount,
        })
        .eq("id", item.id)
        .eq("show_id", item.show_id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const updatedTicket = normalizeShowCompTicket(data as ShowCompTicket);
      setCompTickets((current) =>
        sortCompTickets(
          current.map((currentItem) => (currentItem.id === updatedTicket.id ? updatedTicket : currentItem)),
        ),
      );
      setStatusMessage(
        `${delta > 0 ? "Checked in" : "Undid check-in for"} ${item.guest_name}.`,
      );

      const previousCheckedInCount = item.checked_in_count;
      if (delta > 0) {
        const checkedInByAction = updatedTicket.checked_in_count - previousCheckedInCount;
        setCheckInConfirmation(`${item.guest_name} checked in - ${updatedTicket.checked_in_count} / ${item.ticket_count}`);
        setRecentGuestCheckIns((current) => addRecentGuestCheckIn(current, {
          id: `${item.id}-${Date.now()}`,
          guestName: item.guest_name,
          quantity: checkedInByAction,
          resultingTotal: updatedTicket.checked_in_count,
          ticketCount: item.ticket_count,
          createdAt: Date.now(),
        }));
        window.requestAnimationFrame(() => guestSearchRef.current?.focus());
      }
      pushRecentActivity({
        id: `ticket-${item.id}-${Date.now()}`,
        label: `${item.guest_name} ${delta > 0 ? "+1 check-in" : "-1 undo"}`,
        createdAt: Date.now(),
        undo: async () => {
          const undoSupabase = createClient();
          const { data: undoData, error: undoError } = await undoSupabase
            .from("show_comp_tickets")
            .update({
              checked_in: previousCheckedInCount >= item.ticket_count,
              checked_in_count: previousCheckedInCount,
            })
            .eq("id", item.id)
            .eq("show_id", item.show_id)
            .select("*")
            .single();

          if (undoError) {
            throw undoError;
          }

          const restoredTicket = normalizeShowCompTicket(undoData as ShowCompTicket);
          setCompTickets((current) =>
            sortCompTickets(
              current.map((currentItem) => (currentItem.id === restoredTicket.id ? restoredTicket : currentItem)),
            ),
          );
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update check-in count.");
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleUndoLastAction() {
    const lastAction = recentActivities[0];

    if (!lastAction) {
      setErrorMessage("There is no recent action to undo.");
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setActiveActionId("undo-last");

    try {
      await lastAction.undo();
      removeRecentActivity(lastAction.id);
      setStatusMessage(`Undid: ${lastAction.label}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to undo the last action.");
    } finally {
      setActiveActionId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-900 px-4 py-8 text-gray-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-gray-700 bg-gray-800 p-8">
          <p className="text-lg font-medium text-gray-200">Loading Door Mode...</p>
        </div>
      </main>
    );
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-gray-900 px-4 py-8 text-gray-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-rose-900 bg-gray-800 p-8">
          <p className="text-lg font-semibold text-rose-300">Show not found.</p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-medium text-emerald-300 underline">
            Back to Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 px-4 py-6 text-gray-100 sm:px-6 lg:px-8">
      <div inert={Boolean(seatView)} className="mx-auto flex max-w-[1800px] flex-col gap-3">
        <section className="overflow-hidden rounded-[22px] border border-gray-700 bg-slate-900 shadow-lg shadow-slate-950/20">
          <div className="h-1 bg-gradient-to-r from-red-800 via-amber-500/80 to-transparent" />
          <div className="grid gap-2 px-3 py-2 sm:px-4 sm:py-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0">
              <Image
                src="/cmms-logo.png"
                alt="Cumberland Mountain Music Show"
                width={500}
                height={300}
                className="h-9 w-auto max-w-full object-contain sm:h-12"
              />
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                <span>{formatShowDate(show.show_date)}</span>
                {show.venue?.trim() ? <span>{show.venue}</span> : null}
                <Link href={`/admin/${show.slug}`} className="text-xs font-medium text-gray-500 transition hover:text-gray-300">&larr; Back to Admin</Link>
              </div>
            </div>
            <div className="text-left lg:text-center">
              <p className="text-3xl font-semibold tracking-[0.04em] text-gray-100 sm:text-4xl">{formattedCurrentTime}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Local time</p>
            </div>
            <div className="flex items-center gap-3 lg:justify-self-end">
              <p className="text-lg font-semibold text-gray-200 sm:text-xl">Door Check-In</p>
              <div aria-label="Connected" className="flex min-h-9 items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-500/5 px-3">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Connected</span>
              </div>
            </div>
          </div>
        </section>
        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-800 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        ) : null}

        <div aria-live="polite" aria-atomic="true">
          {checkInConfirmation ? (
            <div className="rounded-2xl border border-emerald-700 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-lg">{checkInConfirmation}</div>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <section className="sticky top-3 z-20 border-y border-gray-700 bg-slate-900/95 px-2.5 py-2 shadow-sm shadow-slate-950/20 backdrop-blur" data-testid="door-operational-toolbar">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex w-full gap-2 md:min-w-[280px] md:max-w-[380px] md:flex-1">
              <label htmlFor="door-guest-search" className="sr-only">Search Guests</label>
              <input
                ref={guestSearchRef}
                id="door-guest-search"
                type="search"
                value={guestSearch}
                onChange={(event) => setGuestSearch(event.target.value)}
                placeholder="Search guests..."
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-gray-50 outline-none transition placeholder:text-gray-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
              {hasActiveGuestSearch ? (
                <button type="button" aria-label="Clear guest search" onClick={() => { setGuestSearch(""); guestSearchRef.current?.focus(); }} className="min-h-10 rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm font-semibold text-gray-100 hover:bg-gray-700">Clear</button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
              <button type="button" aria-label="Sponsor Comp Tickets" onClick={() => setIsSponsorCompPanelOpen(true)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-700/70 bg-amber-500/10 px-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20">Sponsor Comps</button>
              <div ref={printMenuRef} className="relative">
                <button type="button" aria-expanded={isPrintMenuOpen} aria-haspopup="menu" onClick={() => setIsPrintMenuOpen((current) => !current)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm font-semibold text-gray-100 transition hover:bg-gray-700">Print <span aria-hidden="true">&#9662;</span></button>
                {isPrintMenuOpen ? (
                  <div role="menu" className="absolute left-0 z-30 mt-2 grid min-w-56 overflow-hidden rounded-xl border border-gray-700 bg-gray-800 p-1.5 shadow-2xl sm:left-auto sm:right-0">
                    <Link role="menuitem" href={`/admin/${show.slug}/print/door-guest-list`} onClick={() => setIsPrintMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-100 hover:bg-gray-800">Door Guest List</Link>
                    <Link role="menuitem" href={`/admin/${show.slug}/print/reserved-seat-cards`} onClick={() => setIsPrintMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-100 hover:bg-gray-800">Reserved Seat Cards</Link>
                    <Link role="menuitem" href={`/admin/${show.slug}/print/blank-seat-cards`} onClick={() => setIsPrintMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-100 hover:bg-gray-800">Blank Seat Cards</Link>
                  </div>
                ) : null}
              </div>
              <button type="button" aria-label="View Totals" onClick={() => setIsTotalsPanelOpen(true)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm font-semibold text-gray-100 transition hover:bg-gray-700">Totals</button>
              <div className="relative">
                <button type="button" aria-label="Recent Check-Ins" aria-expanded={isRecentCheckInsOpen} aria-controls="door-recent-check-ins" onClick={() => setIsRecentCheckInsOpen((current) => !current)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm font-semibold text-gray-100 transition hover:bg-gray-700">Recent ({recentGuestCheckIns.length})</button>
                {isRecentCheckInsOpen ? (
                  <div id="door-recent-check-ins" className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-700 bg-gray-800 p-3 shadow-2xl sm:left-auto sm:right-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Recent Check-Ins &middot; This session</p>
                    <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto">
                      {recentGuestCheckIns.length === 0 ? <p className="text-xs text-gray-500">No named guest check-ins yet.</p> : recentGuestCheckIns.map((action) => (
                        <div key={action.id} className="rounded-lg bg-gray-900/70 px-3 py-2">
                          <p className="text-sm font-semibold text-gray-100">{action.guestName}</p>
                          <p className="text-xs text-gray-400">+{action.quantity} &middot; {action.resultingTotal} / {action.ticketCount} checked in &middot; {new Date(action.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {hasActiveGuestSearch && filteredPrepaidTickets.length === 0 && filteredSpecialAdmissions.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-gray-300">No matching prepaid or special-admission guests.</p>
          ) : null}
        </section>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.72fr)]">
          <div className="rounded-[28px] border border-gray-700 bg-gray-800 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="border-l-4 border-sky-500 pl-3 text-xl font-semibold text-gray-50">Prepaid / Online Check-In &middot; {prepaidAdmissionCount}</h2>
              <p className="text-sm text-gray-300">
                Check in online orders as guests arrive. Totals update immediately.
              </p>
            </div>

            <div className="mt-4 grid gap-2.5 2xl:grid-cols-2">
              {filteredPrepaidTickets.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-5 text-sm text-gray-400">
                  No prepaid / online tickets for this show yet.
                </p>
              ) : (
                filteredPrepaidTickets.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-[20px] border p-3 shadow-sm shadow-slate-950/10 transition ${
                      isAdmissionFullyCheckedIn(item.checked_in_count, item.ticket_count)
                        ? "border-emerald-900/60 bg-emerald-500/[0.07] opacity-80 hover:border-emerald-800/70"
                        : "border-gray-700 bg-gray-800 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex flex-col gap-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-xl font-semibold text-gray-50 sm:text-2xl">{item.guest_name}</h3>
                          <span className="rounded-full border border-sky-700/70 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-200">{checkInAdmissionLabel(item.ticket_type, item.notes)}</span>
                          <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-300">
                            Qty {item.ticket_count}
                          </span>
                          <span className="rounded-full border border-sky-700 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                            {item.checked_in_count} / {item.ticket_count} checked in
                          </span>
                          {isAdmissionFullyCheckedIn(item.checked_in_count, item.ticket_count) ? (
                            <span className="rounded-full border border-emerald-700/70 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                              Checked In
                            </span>
                          ) : null}
                        </div>
                        {renderSeatLocationControl(item)}
                        {renderDoorModeNoteDetails(item.notes)}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() =>
                            void handleAdjustTicketCheckIn(
                              item,
                              item.ticket_count - item.checked_in_count,
                            )
                          }
                          disabled={
                            Boolean(activeActionId) || item.checked_in_count >= item.ticket_count
                          }
                          className="rounded-xl border border-emerald-700 bg-emerald-500/10 px-3 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Check In All
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustTicketCheckIn(item, 1)}
                          disabled={Boolean(activeActionId) || item.checked_in_count >= item.ticket_count}
                          className="rounded-xl bg-emerald-700 px-4 py-4 text-base font-bold text-gray-50 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:opacity-40"
                        >
                          +1 Check In
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustTicketCheckIn(item, -1)}
                          disabled={Boolean(activeActionId) || item.checked_in_count <= 0}
                          className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-3 text-sm font-semibold text-gray-100 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          -1 Undo
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div data-testid="paid-door-compact-strip" className="flex flex-col gap-3 rounded-[20px] border border-emerald-900/60 bg-gray-800 px-3 py-3 shadow-sm shadow-slate-950/10 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="border-l-4 border-emerald-600 pl-3 text-base font-semibold text-gray-50 sm:text-lg">Paid Door Tickets</h2>
                <span className="text-sm font-semibold text-emerald-200">Current: {doorPaidTickets}</span>
                <span className="text-xs font-medium text-gray-400">{formatCurrency(DOOR_TICKET_PRICE)} each</span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center xl:justify-end">
                {[1, 2, 5].map((quantity) => (
                  <button
                    key={`door-plus-${quantity}`}
                    type="button"
                    onClick={() => void handleAddDoorSale(quantity)}
                    disabled={Boolean(activeActionId)}
                    className="min-h-11 rounded-lg bg-emerald-700 px-4 text-base font-semibold text-gray-50 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-800"
                  >
                    +{quantity}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void handleSubtractDoorSale()}
                  disabled={Boolean(activeActionId) || doorPaidTickets <= 0}
                  className="min-h-11 rounded-lg border border-gray-700 bg-gray-700 px-4 text-base font-semibold text-gray-100 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => void handleUndoLastAction()}
                  disabled={Boolean(activeActionId) || recentActivities.length === 0}
                  className="col-span-2 min-h-11 rounded-lg border border-sky-800/80 bg-sky-500/[0.07] px-4 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1"
                >
                  Undo Last
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-gray-700 bg-gray-800 p-5 sm:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="border-l-4 border-violet-500 pl-3 text-xl font-semibold text-gray-50">Special Admissions &middot; {specialAdmissionCount}</h2>
                <p className="text-sm text-gray-300">
                  Named, non-sponsor guest, band, media, volunteer, staff, and other admissions.
                </p>
              </div>

              <div className="mt-5 grid gap-4">
                {filteredSpecialAdmissions.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-5 text-sm text-gray-400">
                    No special admissions for this show yet.
                  </p>
                ) : (
                  filteredSpecialAdmissions.map((item) => (
                    <article key={item.id} className={`rounded-[20px] border p-3 shadow-sm shadow-slate-950/10 transition ${isAdmissionFullyCheckedIn(item.checked_in_count, item.ticket_count) ? "border-emerald-900/60 bg-emerald-500/[0.07] opacity-80 hover:border-emerald-800/70" : "border-gray-700 bg-gray-800 hover:border-gray-600"}`}>
                      <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold text-gray-50 sm:text-2xl">{item.guest_name}</h3>
                            <span className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">
                              {checkInAdmissionLabel(item.ticket_type, item.notes)}
                            </span>
                            <span className="rounded-full border border-amber-700 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                              {item.checked_in_count} / {item.ticket_count} checked in
                            </span>
                            {isAdmissionFullyCheckedIn(item.checked_in_count, item.ticket_count) ? (
                              <span className="rounded-full border border-emerald-700/70 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Checked In</span>
                            ) : null}
                          </div>
                          {item.email ? <p className="text-sm text-gray-300">{item.email}</p> : null}
                          {renderSeatLocationControl(item)}
                          {renderDoorModeNoteDetails(item.notes)}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => void handleAdjustTicketCheckIn(item, 1)}
                            disabled={Boolean(activeActionId) || item.checked_in_count >= item.ticket_count}
                            className="rounded-2xl bg-emerald-700 px-5 py-5 text-xl font-semibold text-gray-50 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-800"
                          >
                            +1 Check In
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdjustTicketCheckIn(item, -1)}
                            disabled={Boolean(activeActionId) || item.checked_in_count <= 0}
                            className="rounded-2xl border border-gray-700 bg-gray-800 px-5 py-5 text-xl font-semibold text-gray-100 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            -1 Undo
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {isTotalsPanelOpen ? (
          <div className="fixed inset-0 z-40 flex items-start justify-end bg-slate-950/70 p-3 sm:p-6">
            <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-gray-700 bg-gray-800 shadow-lg shadow-slate-950/25">
              <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-50">Live Totals</h2>
                  <p className="text-sm text-gray-400">Attendance, revenue, and recent Door Mode activity.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTotalsPanelOpen(false)}
                  className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    { label: "Paid Door Tickets", value: doorPaidTickets, secondary: formatCurrency(doorPaidRevenue), tone: "text-emerald-300" },
                    { label: "Prepaid / Online Checked In", value: prepaidOnlineTickets, secondary: formatCurrency(prepaidOnlineRevenue), tone: "text-sky-300" },
                    { label: "Comp Tickets Checked In", value: compCheckedInTickets, secondary: `Value ${formatCurrency(estimatedCompValue)}`, tone: "text-amber-300" },
                    { label: "Sponsor Comps Allowed", value: sponsorCompTicketsAllowed, secondary: `Remaining ${sponsorCompTicketsRemaining}`, tone: "text-amber-300" },
                    { label: "Sponsor Comps Checked In", value: sponsorCompTicketsCheckedIn, secondary: "Separate from paid tickets", tone: "text-amber-200" },
                    { label: "Total Paid Attendance", value: totalPaidAttendance, secondary: "Door + Prepaid", tone: "text-gray-50" },
                    { label: "Total Attendance", value: totalAttendance, secondary: "Including comps", tone: "text-gray-50" },
                    { label: "Total Revenue", value: formatCurrency(totalRevenue), secondary: "Paid tickets only", tone: "text-emerald-300" },
                  ].map((card) => (
                    <article key={card.label} className="rounded-[24px] border border-gray-700 bg-gray-900/60 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        {card.label}
                      </p>
                      <p className={`mt-3 text-3xl font-semibold ${card.tone}`}>
                        {card.value}
                      </p>
                      <p className="mt-2 text-sm text-gray-400">{card.secondary}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-gray-700 bg-gray-900/60 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-50">Recent Activity</h3>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      Last {RECENT_ACTIVITY_LIMIT}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {recentActivities.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-5 text-sm text-gray-400">
                        No recent door or check-in actions yet.
                      </p>
                    ) : (
                      recentActivities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-2xl border border-gray-700 bg-gray-900/50 px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-gray-100">{activity.label}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">
                            {new Date(activity.createdAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isSponsorCompPanelOpen ? (
          <div className="fixed inset-0 z-40 flex items-start justify-end bg-slate-950/70 p-3 sm:p-6">
            <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-gray-700 bg-gray-800 shadow-lg shadow-slate-950/25">
              <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="border-l-4 border-amber-500 pl-3 text-xl font-semibold text-gray-50">Sponsor Comp Tickets</h2>
                  <p className="text-sm text-gray-400">
                    Check sponsor comps separately from paid door and prepaid online tickets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSponsorCompPanelOpen(false)}
                  className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Allowed", value: sponsorCompTicketsAllowed, tone: "text-amber-300" },
                    { label: "Checked In", value: sponsorCompTicketsCheckedIn, tone: "text-amber-100" },
                    { label: "Remaining", value: sponsorCompTicketsRemaining, tone: "text-sky-300" },
                  ].map((item) => (
                    <article key={item.label} className="rounded-[22px] border border-gray-700 bg-gray-900/60 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{item.label}</p>
                      <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                    </article>
                  ))}
                </div>

                {sponsorsWithCompTickets.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-5 text-sm text-gray-400">
                    No sponsor comp tickets have been assigned for this show.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {sponsorsWithCompTickets.map((sponsor) => {
                      const remainingComps = sponsor.comp_ticket_allowance - sponsor.comp_tickets_checked_in;
                      const customAmountValue = sponsorCompCustomAmounts[sponsor.id] ?? "";

                      return (
                        <article
                          key={`door-sponsor-comp-${sponsor.id}`}
                          className="rounded-[24px] border border-gray-700 bg-gray-900/60 p-4"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-3">
                              <SponsorLogoThumbnail
                                logoUrl={sponsor.sponsor?.logo_url}
                                sponsorName={getSponsorCardName(sponsor)}
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="min-w-0 truncate text-base font-semibold text-gray-50">
                                    {getSponsorCardName(sponsor)}
                                  </h3>
                                  <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-300">
                                    Allowed {sponsor.comp_ticket_allowance}
                                  </span>
                                  <span className="rounded-full border border-amber-700/70 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                                    {sponsor.comp_tickets_checked_in} Checked In
                                  </span>
                                  <span className="rounded-full border border-sky-700/70 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                                    {remainingComps >= 0 ? `${remainingComps} Remaining` : `${Math.abs(remainingComps)} Over`}
                                  </span>
                                </div>
                                {sponsor.recognition_notes?.trim() ? (
                                  <p className="text-xs leading-5 text-gray-300">{sponsor.recognition_notes}</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3">
                              <button
                                type="button"
                                onClick={() => void handleAdjustSponsorCompCheckIn(sponsor, 1)}
                                disabled={Boolean(activeActionId)}
                                className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-semibold text-gray-50 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-900 disabled:opacity-40"
                              >
                                Check In 1
                              </button>
                              <div className="flex gap-2 sm:col-span-2">
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={customAmountValue}
                                  onChange={(event) =>
                                    setSponsorCompCustomAmounts((current) => ({
                                      ...current,
                                      [sponsor.id]: event.target.value,
                                    }))
                                  }
                                  className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-3 py-3 text-sm text-gray-100 outline-none transition focus:border-amber-500"
                                  placeholder="Custom amount"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleCheckInCustomSponsorCompAmount(sponsor)}
                                  disabled={Boolean(activeActionId)}
                                  className="rounded-xl border border-amber-700/70 bg-amber-500/10 px-3 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Check In Custom
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAdjustSponsorCompCheckIn(sponsor, -1)}
                                disabled={Boolean(activeActionId) || sponsor.comp_tickets_checked_in <= 0}
                                className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm font-semibold text-gray-100 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Undo
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {seatView ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSeatView();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="door-seat-dialog-title"
            data-testid="door-seat-dialog"
            className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[20px] border border-gray-700 bg-gray-800 shadow-xl shadow-slate-950/30 sm:max-h-[calc(100vh-2.5rem)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-gray-700 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 id="door-seat-dialog-title" className="truncate text-xl font-semibold text-gray-50">{seatView.guestName}</h2>
                <p className="mt-1 text-sm text-gray-300">{seatView.admissionLabel}</p>
                <p className="mt-1 text-sm font-semibold text-amber-200">Reserved Seats: {seatView.seatIds.join(", ")}</p>
              </div>
              <button
                ref={seatDialogCloseButtonRef}
                type="button"
                onClick={closeSeatView}
                className="min-h-10 rounded-lg border border-gray-700 bg-gray-700 px-4 text-sm font-semibold text-gray-50 transition hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              >
                Close
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <ReservedSeatMap
                seatStates={doorSeatStates}
                title="Venue Seating Layout"
                helperText="Stage and front orientation are shown above the seating sections."
                includeSelectedLegend={false}
                showCustomerSeatDetails={false}
                legendVariant="door-readonly"
              />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
