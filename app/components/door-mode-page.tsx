"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShowCompTicket, ShowRecord } from "@/lib/types";

const PAID_ONLINE_TICKET_PRICE = 8;
const DOOR_TICKET_PRICE = 10;
const COMP_TICKET_VALUE = 10;
const RECENT_ACTIVITY_LIMIT = 8;

type DoorModePageProps = {
  showSlug: string;
};

type DoorModeActivity = {
  id: string;
  label: string;
  createdAt: number;
  undo: () => Promise<void>;
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
  }).format(parsedDate);
}

function formatTicketTypeLabel(value: string | null | undefined) {
  switch (normalizeGuestListTicketType(value)) {
    case "paid_online":
      return "Prepaid / Online";
    case "door_paid":
      return "Paid Door";
    case "manual":
      return "Manual / Other";
    default:
      return "Complimentary";
  }
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

function sortCompTickets(items: ShowCompTicket[]) {
  return [...items].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function clampCheckedInCount(value: number, ticketCount: number) {
  return Math.max(0, Math.min(ticketCount, value));
}

function createDoorSaleOrderId() {
  return `DOOR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function DoorModePage({ showSlug }: DoorModePageProps) {
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [compTickets, setCompTickets] = useState<ShowCompTicket[]>([]);
  const [recentActivities, setRecentActivities] = useState<DoorModeActivity[]>([]);
  const [isTotalsPanelOpen, setIsTotalsPanelOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Door Mode.");
    } finally {
      setIsLoading(false);
    }
  }, [showSlug]);

  useEffect(() => {
    void loadDoorModeData();
  }, [loadDoorModeData]);

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
  const totalAttendance = totalPaidAttendance + compCheckedInTickets + manualCheckedInTickets;
  const totalRevenue = doorPaidRevenue + prepaidOnlineRevenue;

  const prepaidTickets = useMemo(
    () =>
      compTickets
        .filter((item) => normalizeGuestListTicketType(item.ticket_type) === "paid_online")
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
  const compAndOtherTickets = useMemo(
    () =>
      compTickets.filter((item) => {
        const type = normalizeGuestListTicketType(item.ticket_type);
        return type === "complimentary" || type === "manual";
      }),
    [compTickets],
  );

  function pushRecentActivity(activity: DoorModeActivity) {
    setRecentActivities((current) => [activity, ...current].slice(0, RECENT_ACTIVITY_LIMIT));
  }

  function removeRecentActivity(activityId: string) {
    setRecentActivities((current) => current.filter((item) => item.id !== activityId));
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
      <main className="min-h-screen bg-stone-950 px-4 py-8 text-stone-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-stone-800 bg-stone-900/80 p-8">
          <p className="text-lg font-medium text-stone-200">Loading Door Mode...</p>
        </div>
      </main>
    );
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-stone-950 px-4 py-8 text-stone-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-rose-900 bg-stone-900/80 p-8">
          <p className="text-lg font-semibold text-rose-300">Show not found.</p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-medium text-emerald-300 underline">
            Back to Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
        <section className="rounded-[22px] border border-stone-800 bg-stone-900/90 p-3.5 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-emerald-700/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Door Mode / Check-In Mode
                </span>
                <span className="rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-300">
                  {formatShowDate(show.show_date)}
                </span>
              </div>
              <h1 className="text-[1.65rem] font-semibold tracking-tight text-white">
                {show.name}
              </h1>
              <p className="hidden max-w-3xl text-sm leading-5 text-stone-300 xl:block">
                Fast live check-in for prepaid and comp guests, plus touch-friendly paid door ticket counting.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-[10rem] max-w-[12rem] flex-col gap-1 rounded-xl border border-emerald-900/70 bg-emerald-500/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                    Online
                  </span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-stone-800">
                  <div className="door-mode-scanner absolute inset-y-0 left-0 w-10 rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-transparent opacity-80" />
                </div>
              </div>
              <Link
                href={`/admin/${show.slug}`}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-700 bg-stone-800 px-4 py-3 text-sm font-semibold text-stone-100 transition hover:bg-stone-700"
              >
                Back to Admin
              </Link>
            </div>
          </div>
        </section>

        <style jsx>{`
          .door-mode-scanner {
            animation: door-mode-scan 2.6s ease-in-out infinite alternate;
          }

          @keyframes door-mode-scan {
            0% {
              transform: translateX(-110%);
            }

            100% {
              transform: translateX(360%);
            }
          }
        `}</style>

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-800 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <section className="sticky top-3 z-20 rounded-[20px] border border-stone-800 bg-stone-900/95 p-2.5 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid flex-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Paid Door", value: doorPaidTickets, tone: "text-emerald-300" },
                { label: "Prepaid In", value: prepaidOnlineTickets, tone: "text-sky-300" },
                { label: "Comp In", value: compCheckedInTickets, tone: "text-amber-300" },
                { label: "Attendance", value: totalAttendance, tone: "text-white" },
                { label: "Revenue", value: formatCurrency(totalRevenue), tone: "text-emerald-300" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-stone-800 bg-stone-950/60 px-2.5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {item.label}
                  </p>
                  <p className={`mt-0.5 text-base font-semibold ${item.tone}`}>{item.value}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsTotalsPanelOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-stone-700 bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-100 transition hover:bg-stone-700"
            >
              View Totals
            </button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.72fr)]">
          <div className="rounded-[28px] border border-stone-800 bg-stone-900/90 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-white">Prepaid / Online Check-In</h2>
              <p className="text-sm text-stone-300">
                Check in online orders as guests arrive. Totals update immediately.
              </p>
            </div>

            <div className="mt-4 grid gap-2.5 2xl:grid-cols-2">
              {prepaidTickets.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-stone-700 bg-stone-950/50 px-4 py-5 text-sm text-stone-400">
                  No prepaid / online tickets for this show yet.
                </p>
              ) : (
                prepaidTickets.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-[20px] border p-3 transition ${
                      item.checked_in_count >= item.ticket_count
                        ? "border-emerald-900/70 bg-emerald-500/10 opacity-80"
                        : "border-stone-800 bg-stone-950/60"
                    }`}
                  >
                    <div className="flex flex-col gap-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-base font-semibold text-white">{item.guest_name}</h3>
                          <span className="rounded-full border border-stone-700 bg-stone-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-300">
                            Qty {item.ticket_count}
                          </span>
                          <span className="rounded-full border border-sky-700 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                            {item.checked_in_count} Checked In
                          </span>
                          {item.checked_in_count >= item.ticket_count ? (
                            <span className="rounded-full border border-emerald-700/70 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                              ✅ Fully Checked In
                            </span>
                          ) : null}
                        </div>
                        {item.notes?.trim() ? (
                          <p className="whitespace-pre-wrap text-xs leading-5 text-stone-300">
                            {renderTextWithLinks(item.notes)}
                          </p>
                        ) : null}
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
                          className="rounded-xl border border-emerald-700 bg-emerald-500/10 px-3 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Check In All
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustTicketCheckIn(item, 1)}
                          disabled={Boolean(activeActionId) || item.checked_in_count >= item.ticket_count}
                          className="rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:opacity-40"
                        >
                          +1 Check In
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustTicketCheckIn(item, -1)}
                          disabled={Boolean(activeActionId) || item.checked_in_count <= 0}
                          className="rounded-xl border border-stone-700 bg-stone-800 px-3 py-3 text-sm font-semibold text-stone-100 transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
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

          <div className="flex flex-col gap-6">
            <div className="rounded-[28px] border border-stone-800 bg-stone-900/90 p-4 sm:p-5 xl:sticky xl:top-28">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-white">Paid Door Tickets</h2>
                  <span className="rounded-full border border-emerald-700/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    {formatCurrency(DOOR_TICKET_PRICE)} each
                  </span>
                </div>
                <p className="text-sm text-stone-300">
                  Quick tap controls for live paid door entry.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {[1, 2, 5].map((quantity) => (
                  <button
                    key={`door-plus-${quantity}`}
                    type="button"
                    onClick={() => void handleAddDoorSale(quantity)}
                    disabled={Boolean(activeActionId)}
                    className="rounded-[20px] bg-emerald-600 px-4 py-4 text-center text-xl font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
                  >
                    +{quantity}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void handleSubtractDoorSale()}
                  disabled={Boolean(activeActionId) || doorPaidTickets <= 0}
                  className="rounded-[20px] border border-stone-700 bg-stone-800 px-4 py-4 text-center text-xl font-semibold text-stone-100 transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => void handleUndoLastAction()}
                  disabled={Boolean(activeActionId) || recentActivities.length === 0}
                  className="col-span-2 rounded-[20px] border border-sky-700 bg-sky-500/10 px-4 py-3.5 text-center text-base font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Undo Last
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-stone-800 bg-stone-900/90 p-5 sm:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold text-white">Comp / Other Check-In</h2>
                <p className="text-sm text-stone-300">
                  Complimentary and manual entries stay available here for night-of-show check-in.
                </p>
              </div>

              <div className="mt-5 grid gap-4">
                {compAndOtherTickets.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-stone-700 bg-stone-950/50 px-4 py-5 text-sm text-stone-400">
                    No comp or manual entries for this show yet.
                  </p>
                ) : (
                  compAndOtherTickets.map((item) => (
                    <article key={item.id} className="rounded-[24px] border border-stone-800 bg-stone-950/60 p-4">
                      <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">{item.guest_name}</h3>
                            <span className="rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-300">
                              {formatTicketTypeLabel(item.ticket_type)}
                            </span>
                            <span className="rounded-full border border-amber-700 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                              {item.checked_in_count} / {item.ticket_count} Checked In
                            </span>
                          </div>
                          {item.email ? <p className="text-sm text-stone-300">{item.email}</p> : null}
                          {item.notes?.trim() ? (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-stone-300">
                              {renderTextWithLinks(item.notes)}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => void handleAdjustTicketCheckIn(item, 1)}
                            disabled={Boolean(activeActionId) || item.checked_in_count >= item.ticket_count}
                            className="rounded-2xl bg-emerald-600 px-5 py-5 text-xl font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
                          >
                            +1 Check In
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdjustTicketCheckIn(item, -1)}
                            disabled={Boolean(activeActionId) || item.checked_in_count <= 0}
                            className="rounded-2xl border border-stone-700 bg-stone-800 px-5 py-5 text-xl font-semibold text-stone-100 transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/60 p-3 sm:p-6">
            <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-stone-800 bg-stone-900 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Live Totals</h2>
                  <p className="text-sm text-stone-400">Attendance, revenue, and recent Door Mode activity.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTotalsPanelOpen(false)}
                  className="rounded-2xl border border-stone-700 bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-100 transition hover:bg-stone-700"
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
                    { label: "Total Paid Attendance", value: totalPaidAttendance, secondary: "Door + Prepaid", tone: "text-white" },
                    { label: "Total Attendance", value: totalAttendance, secondary: "Including comps", tone: "text-white" },
                    { label: "Total Revenue", value: formatCurrency(totalRevenue), secondary: "Paid tickets only", tone: "text-emerald-300" },
                  ].map((card) => (
                    <article key={card.label} className="rounded-[24px] border border-stone-800 bg-stone-950/60 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                        {card.label}
                      </p>
                      <p className={`mt-3 text-3xl font-semibold ${card.tone}`}>
                        {card.value}
                      </p>
                      <p className="mt-2 text-sm text-stone-400">{card.secondary}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-stone-800 bg-stone-950/60 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Last {RECENT_ACTIVITY_LIMIT}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {recentActivities.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-stone-700 bg-stone-950/50 px-4 py-5 text-sm text-stone-400">
                        No recent door or check-in actions yet.
                      </p>
                    ) : (
                      recentActivities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-2xl border border-stone-800 bg-stone-950/50 px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-stone-100">{activity.label}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-500">
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
      </div>
    </main>
  );
}
