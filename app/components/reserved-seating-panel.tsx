"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReservedSeatMap } from "@/app/components/reserved-seat-map";
import { formatReservedSeatLabel, getReservedSeatDefinition, RESERVED_SEAT_DEFINITIONS, sortReservedSeatIds } from "@/lib/reserved-seating";
import { createClient } from "@/lib/supabase/client";
import type { ShowReservedSeatAssignment, ShowReservedSeatingLink } from "@/lib/types";

type ReservedSeatingPanelProps = {
  showId: string;
  showSlug: string;
  showName: string;
  showDate: string | null;
};

type LinkFormState = {
  customerName: string;
  email: string;
  ticketCount: string;
};

type LinkWithSeats = ShowReservedSeatingLink & {
  seatIds: string[];
};

const initialLinkFormState: LinkFormState = {
  customerName: "",
  email: "",
  ticketCount: "1",
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
  if (link.selection_mode === "manual" && link.seatIds.length > 0) {
    return { label: "Manual", classes: "bg-violet-500/15 text-violet-200 border-violet-400/25" };
  }

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

export function ReservedSeatingPanel({ showId, showSlug, showName, showDate }: ReservedSeatingPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<ShowReservedSeatingLink[]>([]);
  const [assignments, setAssignments] = useState<ShowReservedSeatAssignment[]>([]);
  const [formState, setFormState] = useState<LinkFormState>(initialLinkFormState);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [manualAssignLinkId, setManualAssignLinkId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  async function loadReservedSeating() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [{ data: linkRows, error: linksError }, { data: assignmentRows, error: assignmentsError }] = await Promise.all([
        supabase
          .from("show_reserved_seating_links")
          .select("*")
          .eq("show_id", showId)
          .order("created_at", { ascending: false }),
        supabase
          .from("show_reserved_seat_assignments")
          .select("*")
          .eq("show_id", showId)
          .order("created_at", { ascending: true }),
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

  const seatStates = useMemo(() => {
    const assignmentBySeatId = new Map(assignments.map((assignment) => [assignment.seat_id, assignment]));

    return Object.fromEntries(
      RESERVED_SEAT_DEFINITIONS.map((seat) => {
        const assignment = assignmentBySeatId.get(seat.seatId);
        const isBlocked = assignment?.assignment_type === "blocked";

        return [
          seat.seatId,
          {
            seatId: seat.seatId,
            label: seat.seatId,
            status: isBlocked ? "unavailable" : assignment ? "assigned" : "available",
            customerName: assignment?.customer_name ?? null,
          },
        ];
      }),
    );
  }, [assignments]);

  const unavailableSeats = useMemo(
    () =>
      sortReservedSeatIds(
        assignments
          .filter((assignment) => assignment.assignment_type === "blocked")
          .map((assignment) => assignment.seat_id),
      ),
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
        selection_mode: "customer",
      });

      if (error) {
        throw error;
      }

      setFormState(initialLinkFormState);
      setStatusMessage("Seat selection link created.");
      await loadReservedSeating();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to create seat selection link."));
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
        });

        if (insertError) {
          throw insertError;
        }

        const { error: updateError } = await supabase
          .from("show_reserved_seating_links")
          .update({ selection_mode: "manual", submitted_at: now, sent_at: manualAssignLink.sent_at ?? now })
          .eq("id", manualAssignLink.id);

        if (updateError) {
          throw updateError;
        }

        setStatusMessage(`${formatReservedSeatLabel(seatId)} assigned to ${manualAssignLink.customer_name}.`);
        await loadReservedSeating();
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
        const shouldClear = window.confirm(
          `Clear ${formatReservedSeatLabel(seatId)} from ${assignment.customer_name || "this customer"}?`,
        );

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

      const { error: updateError } = await supabase
        .from("show_reserved_seating_links")
        .update({ submitted_at: null, selection_mode: "customer" })
        .eq("id", linkId);
      if (updateError) {
        throw updateError;
      }

      if (manualAssignLinkId === linkId) {
        setManualAssignLinkId(null);
      }

      setStatusMessage("Seat assignment cleared.");
      await loadReservedSeating();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to clear this assignment."));
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
            Build seat-selection links, block seats, manually assign seats, and print reserved seat cards for {showName} on {formatShowDate(showDate)}.
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

      {manualAssignLink ? (
        <div className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-500/12 px-4 py-3 text-sm text-violet-100">
          Manual assign mode is active for <span className="font-semibold">{manualAssignLink.customer_name}</span>. Click available seats on the map to assign up to {manualAssignLink.ticket_count} seats.
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ReservedSeatMap
          seatStates={seatStates}
          onSeatClick={(seatId) => void handleSeatMapClick(seatId)}
          title="Venue Seat Map"
          helperText={
            manualAssignLink
              ? "Manual assign mode: click green seats to assign them to the selected customer. Click gray seats to clear a block. Click red seats to clear an assignment."
              : "Click green seats to block them. Click gray seats to clear a block. Click red seats to clear an assigned seat."
          }
        />

        <div className="grid gap-4">
          <form onSubmit={(event) => void handleCreateLink(event)} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
            <h4 className="text-base font-semibold text-white">Create Seat Selection Link</h4>
            <p className="mt-1 text-sm text-slate-300">Create a private customer link for reserved seating.</p>
            <div className="mt-4 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Customer Name
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
                Ticket Count
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
              <button
                type="submit"
                disabled={activeActionId === "create-link"}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
              >
                {activeActionId === "create-link" ? "Creating Link..." : "Create Seat Selection Link"}
              </button>
            </div>
          </form>

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
            <h4 className="text-base font-semibold text-white">Seat Selection Links</h4>
            <p className="text-sm text-slate-300">Track imported paid online orders, manual links, sent links, and customers who already selected seats.</p>
          </div>
          {isLoading ? <span className="text-sm text-slate-400">Loading...</span> : null}
        </div>

        {linksWithSeats.length === 0 && !isLoading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-slate-950/35 px-4 py-6 text-sm text-slate-400">
            No reserved seating links have been created for this show yet.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {linksWithSeats.map((link) => {
              const status = getLinkStatus(link);
              const isManualAssigning = manualAssignLinkId === link.id;
              return (
                <article key={link.id} className={`rounded-2xl border p-4 transition ${isManualAssigning ? "border-violet-400/30 bg-violet-500/10" : "border-white/10 bg-slate-950/30"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-base font-semibold text-white">{link.customer_name}</h5>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${status.classes}`}>
                          {status.label}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                          {link.ticket_count} seat{link.ticket_count === 1 ? "" : "s"}
                        </span>
                      </div>
                      {link.email?.trim() ? <p className="mt-2 text-sm text-slate-300">{link.email}</p> : null}
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
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(link)}
                        className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
                      >
                        Copy Link
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
