import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminGate } from "@/app/components/admin-gate";
import { PrintButton } from "@/app/components/print-button";
import { ReservationTicketCode } from "@/app/components/reservation-ticket-code";
import { PrintStudioExportButton } from "./print-studio-export-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildReservedSeatPrintCards } from "@/lib/reserved-seat-print-cards";
import type { GuestProfile, ShowCompTicket, ShowRecord, ShowReservedSeatAssignment, ShowReservedSeatingLink, ShowSponsor, SponsorLibraryEntry } from "@/lib/types";

type PrintKind =
  | "itinerary"
  | "sponsors"
  | "guests"
  | "door-guest-list"
  | "reserved-seat-cards"
  | "comp-reserved-seat-cards"
  | "blank-seat-cards"
  | "selected-seat-cards";

type SponsorRow = ShowSponsor & {
  sponsor?: SponsorLibraryEntry | SponsorLibraryEntry[] | null;
};

type AnchorRow = {
  id: string;
  custom_title: string | null;
  library_song?: { title: string | null } | Array<{ title: string | null }> | null;
  guest_song?: { title: string | null } | Array<{ title: string | null }> | null;
};

type GuestSongRow = {
  id: string;
  title: string | null;
  submitted_by_name: string | null;
};

type DoorGuestListRow = ShowCompTicket;
type SelectedReservedSeatRow = ShowReservedSeatAssignment;
type ReservedSeatingLinkRow = ShowReservedSeatingLink;

type PrintStudioExportRecord = Partial<Record<"event_name" | "show_date" | "show_time" | "venue" | "purchaser_name" | "guest_name" | "sponsor_name" | "ticket_type" | "seat" | "section" | "ticket_number", string>>;

type PrintStudioExportFile = {
  schemaVersion: 1;
  exportedAt: string;
  source: string;
  showSlug?: string;
  records: PrintStudioExportRecord[];
};

type ReservedSeatCategoryValue = "paid_reserved" | "comp" | "guest";

function normalizeReservedSeatCategory(value: string | null | undefined, isComplimentary?: boolean): ReservedSeatCategoryValue {
  if (value === "comp" || value === "guest" || value === "paid_reserved") return value;
  return isComplimentary ? "comp" : "paid_reserved";
}

function getReservedSeatCategoryLabel(category: ReservedSeatCategoryValue) {
  if (category === "comp") return "Sponsor / General Comp";
  if (category === "guest") return "Guest Comp";
  return "Paid Reserved";
}

function isCompReservedSeatCategory(value: string | null | undefined, isComplimentary?: boolean) {
  const category = normalizeReservedSeatCategory(value, isComplimentary);
  return category === "comp" || category === "guest";
}
type PrintPageProps = {
  params: Promise<{ slug: string; kind: string }>;
};

function normalizePrintKind(kind: string): PrintKind | null {
  if (
    kind === "itinerary" ||
    kind === "sponsors" ||
    kind === "guests" ||
    kind === "door-guest-list" ||
    kind === "reserved-seat-cards" ||
    kind === "comp-reserved-seat-cards" ||
    kind === "blank-seat-cards" ||
    kind === "selected-seat-cards"
  ) {
    return kind;
  }

  return null;
}

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

function formatSponsorPlacementType(value: string | null | undefined) {
  switch (value) {
    case "before_performer":
      return "Before performer";
    case "after_performer":
      return "After performer";
    case "before_intermission":
      return "Before intermission";
    case "after_intermission":
      return "After intermission";
    case "closing":
      return "Closing section";
    default:
      return "Placement flexible";
  }
}

function getPrintTitle(kind: PrintKind) {
  switch (kind) {
    case "sponsors":
      return "Sponsor Rundown";
    case "guests":
      return "Guest Info Sheets";
    case "door-guest-list":
      return "Door Guest List";
    case "reserved-seat-cards":
      return "Reserved Seat Cards";
    case "comp-reserved-seat-cards":
      return "Comp Reserved Seat Cards";
    case "blank-seat-cards":
      return "Blank Seat Cards";
    case "selected-seat-cards":
      return "Selected Seat Cards";
    default:
      return "Itinerary";
  }
}

function normalizeGuestListTicketType(value: string | null | undefined) {
  return value === "paid_online" || value === "door_paid" || value === "manual" || value === "complimentary"
    ? value
    : "complimentary";
}

function formatDoorGuestListType(value: string | null | undefined) {
  switch (normalizeGuestListTicketType(value)) {
    case "paid_online":
      return "Online preorder";
    case "manual":
      return "Guest list";
    default:
      return "Comp";
  }
}

function getDoorGuestLastName(value: string | null | undefined) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : (parts[0] ?? "").toLowerCase();
}

function sortDoorGuestList(items: DoorGuestListRow[]) {
  return [...items].sort((left, right) => {
    const leftLastName = getDoorGuestLastName(left.guest_name);
    const rightLastName = getDoorGuestLastName(right.guest_name);

    if (leftLastName !== rightLastName) {
      return leftLastName.localeCompare(rightLastName);
    }

    return (left.guest_name ?? "").localeCompare(right.guest_name ?? "");
  });
}

function sortReservedSeatCards(items: DoorGuestListRow[]) {
  return [...items].sort((left, right) => (left.guest_name ?? "").localeCompare(right.guest_name ?? "", "en-US"));
}

function isReservedSeatEntry(ticket: DoorGuestListRow) {
  const ticketType = normalizeGuestListTicketType(ticket.ticket_type);

  if (ticketType === "paid_online") {
    return true;
  }

  const markerText = [ticket.notes, ticket.order_id, ticket.import_key]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(Boolean)
    .join(" ");

  return /\b(reserved|reserve|advance|preorder|pre-order)\b/i.test(markerText);
}

function buildReservedSeatingMatchKey(name: string, email: string | null | undefined) {
  return [name.trim().toLowerCase(), (email ?? "").trim().toLowerCase()].join("::");
}

function hasSelectedReservedSeatsForTicket(
  ticket: DoorGuestListRow,
  reservedLinks: ReservedSeatingLinkRow[],
  assignments: SelectedReservedSeatRow[],
) {
  const selectedLinkIds = new Set(
    assignments
      .filter((assignment) => assignment.assignment_type === "customer")
      .map((assignment) => assignment.seating_link_id)
      .filter(Boolean),
  );

  const sourceOrderId = ticket.order_id?.trim() ?? "";
  const sourceImportKey = ticket.import_key?.trim() ?? "";
  const customerKey = buildReservedSeatingMatchKey(ticket.guest_name ?? "", ticket.email);

  const matchedLink = findReservedSeatingLinkForTicket(ticket, reservedLinks);

  if (!matchedLink) {
    return false;
  }

  return selectedLinkIds.has(matchedLink.id) || Boolean(matchedLink.submitted_at);
}

function findReservedSeatingLinkForTicket(
  ticket: DoorGuestListRow,
  reservedLinks: ReservedSeatingLinkRow[],
) {
  const sourceOrderId = ticket.order_id?.trim() ?? "";
  const sourceImportKey = ticket.import_key?.trim() ?? "";
  const customerKey = buildReservedSeatingMatchKey(ticket.guest_name ?? "", ticket.email);

  return reservedLinks.find((link) => {
    if (link.source_ticket_id === ticket.id) {
      return true;
    }

    if (sourceOrderId && (link.source_order_id?.trim() ?? "") === sourceOrderId) {
      return true;
    }

    if (sourceImportKey && (link.source_import_key?.trim() ?? "") === sourceImportKey) {
      return true;
    }

    if (link.selection_mode === "imported") {
      return buildReservedSeatingMatchKey(link.customer_name, link.email) === customerKey;
    }

    return false;
  });
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function getSingleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function getAnchorTitle(anchor: AnchorRow | null | undefined) {
  if (!anchor) {
    return null;
  }

  return (
    anchor.custom_title?.trim() ||
    getSingleRelation(anchor.library_song)?.title?.trim() ||
    getSingleRelation(anchor.guest_song)?.title?.trim() ||
    null
  );
}

function getSponsorName(sponsor: SponsorRow) {
  return getSingleRelation(sponsor.sponsor)?.name ?? "Assigned sponsor";
}

function getSponsorReadText(sponsor: SponsorRow) {
  const librarySponsor = getSingleRelation(sponsor.sponsor);
  return (
    librarySponsor?.full_message?.trim() ||
    librarySponsor?.short_message?.trim() ||
    sponsor.custom_note?.trim() ||
    ""
  );
}

function normalizeGuestProfileName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function logPrintLoadError(sectionName: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`Failed to load print ${sectionName}.`, error);
  }
}

async function safeLoad<T>(sectionName: string, loader: () => Promise<T>, fallback: T) {
  try {
    return await loader();
  } catch (error) {
    logPrintLoadError(sectionName, error);
    return fallback;
  }
}

function PrintField({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string | null;
}) {
  const displayValue = value?.trim();

  if (!displayValue) {
    return null;
  }

  return (
    <div className="break-inside-avoid rounded-xl border border-stone-200 px-4 py-3 print:rounded-none print:border-stone-300">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          className="mt-1 block break-words text-sm font-medium text-emerald-700 underline print:text-black"
        >
          {displayValue}
        </a>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800 print:text-[12px] print:leading-5">
          {displayValue}
        </p>
      )}
    </div>
  );
}

function PrintShell({
  show,
  kind,
  children,
  printStudioExport,
  printStudioExportFileName,
}: {
  show: ShowRecord;
  kind: PrintKind;
  children: ReactNode;
  printStudioExport?: PrintStudioExportFile | null;
  printStudioExportFileName?: string;
}) {
  const title = getPrintTitle(kind);
  const isDoorGuestList = kind === "door-guest-list";
  const isReservedSeatCards = kind === "reserved-seat-cards";
  const isCompReservedSeatCards = kind === "comp-reserved-seat-cards";
  const isBlankSeatCards = kind === "blank-seat-cards";
  const isSelectedSeatCards = kind === "selected-seat-cards";
  const isSeatCardPrint = isReservedSeatCards || isCompReservedSeatCards || isBlankSeatCards || isSelectedSeatCards;

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-6 print:bg-white print:px-0 print:py-0">
      <style>{`img[src=/cmms-logo.png] { filter: none !important; -webkit-filter: none !important; }`}</style>
      {isSeatCardPrint ? (
        <style>{`
          @page { size: letter portrait; margin: 0.35in; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; }
            .seat-card-pages { display: block !important; margin: 0 !important; padding: 0 !important; }
            .seat-card-sheet {
              box-sizing: border-box !important;
              width: 7.8in !important;
              height: 10.3in !important;
              margin: 0 !important;
              padding: 0 !important;
              display: grid !important;
              grid-template-columns: repeat(2, 3.84in) !important;
              grid-template-rows: repeat(4, 2.485in) !important;
              column-gap: 0.12in !important;
              row-gap: 0.12in !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .seat-card-sheet-with-header {
              height: 7.695in !important;
              grid-template-rows: repeat(3, 2.485in) !important;
            }
            .seat-card {
              box-sizing: border-box !important;
              width: 3.84in !important;
              height: 2.485in !important;
              min-width: 0 !important;
              min-height: 0 !important;
              margin: 0 !important;
              overflow: hidden !important;
              border: 1pt dashed #a8a29e !important;
              padding: 0.12in !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
          }
        `}</style>
      ) : null}
      <section className="mx-auto max-w-4xl rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <Link
            href={`/admin/${show.slug}`}
            className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Back to Admin
          </Link>
          <div className="flex flex-wrap gap-2">
            {printStudioExport && printStudioExportFileName ? <PrintStudioExportButton fileName={printStudioExportFileName} exportFile={printStudioExport} /> : null}
            <PrintButton />
          </div>

        </div>

        <header className={`mb-6 border-b border-stone-300 pb-5 ${isReservedSeatCards || isCompReservedSeatCards || isBlankSeatCards ? "print:hidden" : ""}`}>
          {isDoorGuestList || isReservedSeatCards || isCompReservedSeatCards || isBlankSeatCards ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <img
                  src="/cmms-logo.png"
                  alt="Cumberland Mountain Music Show logo"
                  className="h-auto max-h-[72px] w-auto max-w-[180px] object-contain print:max-h-[60px] print:max-w-[150px]"
                />
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-stone-950 print:text-2xl">
                    Cumberland Mountain Music Show
                  </h1>
                  <p className="mt-1 text-sm text-stone-600 print:text-xs">
                    {formatShowDate(show.show_date)}
                  </p>
                </div>
              </div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-700 print:text-[11px]">
                  {isReservedSeatCards
                    ? "Reserved Seat Cards"
                    : isCompReservedSeatCards
                      ? "Comp Reserved Seat Cards"
                      : isBlankSeatCards
                        ? "Blank Seat Cards"
                        : "Door Guest List"}
                </p>
            </div>
          ) : (
            <>
          <p className="text-[10px] font-medium text-stone-500 print:text-[9px]">
            StageFlow - by Pinnacle Recording Studio
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 print:text-[10px]">
            {title}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 print:text-2xl">
            {show.name}
          </h1>
          <p className="mt-1 text-sm text-stone-600 print:text-xs">
            {formatShowDate(show.show_date)}
            {show.venue ? ` - ${show.venue}` : ""}
          </p>
            </>
          )}
        </header>

        {children}
      </section>
    </main>
  );
}

function ItineraryPrintView({ show }: { show: ShowRecord }) {
  const fields = [
    { label: "Venue", value: show.venue },
    { label: "Address", value: show.venue_address },
    { label: "Directions", value: show.directions_url, href: show.directions_url },
    { label: "Call Time", value: show.call_time },
    { label: "Soundcheck Time", value: show.soundcheck_time },
    { label: "Guest Arrival Time", value: show.guest_arrival_time },
    { label: "Band Arrival Time", value: show.band_arrival_time },
    { label: "Show Start Time", value: show.show_start_time },
    { label: "Contact Name", value: show.contact_name },
    { label: "Contact Phone", value: show.contact_phone },
    { label: "Parking Notes", value: show.parking_notes },
    { label: "Load-In Notes", value: show.load_in_notes },
    { label: "Announcements", value: show.announcements },
  ];
  const hasDetails = fields.some((field) => field.value?.trim());

  if (!hasDetails) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No itinerary details have been added for this show yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
      {fields.map((field) => (
        <PrintField key={field.label} {...field} />
      ))}
    </div>
  );
}

function SponsorRundownPrintView({
  sponsors,
  anchorTitles,
}: {
  sponsors: SponsorRow[];
  anchorTitles: Record<string, string>;
}) {
  if (sponsors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No sponsors are assigned to this show yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {sponsors.map((sponsor) => {
        const anchorTitle = sponsor.mc_anchor_song_id
          ? anchorTitles[sponsor.mc_anchor_song_id] ?? null
          : null;

        return (
          <article
            key={sponsor.id}
            className="break-inside-avoid rounded-xl border border-stone-200 px-4 py-4 print:rounded-none print:border-stone-300"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Slot {sponsor.placement_order} - {formatSponsorPlacementType(sponsor.placement_type)}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-stone-950 print:text-base">
                  {getSponsorName(sponsor)}
                </h2>
              </div>
              {sponsor.linked_performer ? (
                <p className="text-sm font-medium text-stone-600 print:text-xs">
                  Performer: {sponsor.linked_performer}
                </p>
              ) : null}
            </div>

            {anchorTitle ? (
              <p className="mt-3 text-sm text-stone-600 print:text-xs">Anchor: {anchorTitle}</p>
            ) : null}

            {sponsor.custom_note?.trim() ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-stone-600 print:text-xs">
                Note: {sponsor.custom_note}
              </p>
            ) : null}

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-800 print:text-[12px] print:leading-5">
              {getSponsorReadText(sponsor) || "No sponsor read has been added yet."}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function GuestInfoPrintView({
  guests,
  guestSongsByProfileId,
}: {
  guests: GuestProfile[];
  guestSongsByProfileId: Record<string, string[]>;
}) {
  if (guests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No guest profiles have been submitted for this show yet.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {guests.map((guest) => {
        const links = [
          { label: "Website", value: guest.website },
          { label: "Facebook", value: guest.facebook },
          { label: "Instagram", value: guest.instagram },
        ].filter((link) => link.value?.trim());
        const appearanceFields = [
          { label: "Agreed Fee", value: guest.agreed_fee },
          {
            label: "Planned Song Count",
            value:
              guest.planned_song_count === null || guest.planned_song_count === undefined
                ? null
                : String(guest.planned_song_count),
          },
          {
            label: "Backup Song Count",
            value:
              guest.backup_song_count === null || guest.backup_song_count === undefined
                ? null
                : String(guest.backup_song_count),
          },
        ];
        const submittedSongs = guestSongsByProfileId[guest.id] ?? [];

        return (
          <article
            key={guest.id}
            className="break-inside-avoid rounded-xl border border-stone-200 px-4 py-5 print:rounded-none print:border-stone-300"
          >
            <h2 className="text-xl font-semibold text-stone-950 print:text-lg">
              {guest.name?.trim() || "Guest"}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
              <PrintField label="Hometown" value={guest.hometown} />
              <PrintField label="Instruments" value={guest.instruments} />
            </div>

            <div className="mt-4 grid gap-3">
              <PrintField label="Short Bio" value={guest.short_bio} />
              <PrintField label="Full Bio" value={guest.full_bio} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
              {appearanceFields.map((field) => (
                <PrintField key={field.label} label={field.label} value={field.value} />
              ))}
              <PrintField label="Appearance Notes" value={guest.appearance_notes} />
            </div>

            {links.length > 0 ? (
              <div className="mt-4 grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Links
                </p>
                {links.map((link) => (
                  <p key={link.label} className="break-words text-sm text-stone-800 print:text-[12px]">
                    <span className="font-semibold">{link.label}:</span> {link.value}
                  </p>
                ))}
              </div>
            ) : null}

            {submittedSongs.length > 0 ? (
              <div className="mt-4 rounded-xl border border-stone-200 px-4 py-3 print:rounded-none print:border-stone-300">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Submitted Songs
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-800 print:text-[12px] print:leading-5">
                  {submittedSongs.map((songTitle) => (
                    <li key={`${guest.id}-${songTitle}`}>{songTitle}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function DoorGuestListPrintView({ tickets }: { tickets: DoorGuestListRow[] }) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No door guest list entries are available for this show yet.
      </div>
    );
  }

  const onlinePreorders = sortDoorGuestList(
    tickets.filter((ticket) => normalizeGuestListTicketType(ticket.ticket_type) === "paid_online"),
  );
  const guestAndCompEntries = sortDoorGuestList(
    tickets.filter((ticket) => normalizeGuestListTicketType(ticket.ticket_type) !== "paid_online"),
  );
  const renderGroup = (title: string, rows: DoorGuestListRow[]) => {
    if (rows.length === 0) {
      return null;
    }

    return (
      <section className="break-inside-avoid">
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-stone-300 pb-2">
          <h2 className="text-lg font-semibold text-stone-950 print:text-base">{title}</h2>
          <p className="text-sm font-medium text-stone-600 print:text-xs">
            {rows.reduce((sum, row) => sum + row.ticket_count, 0)} total
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200 print:rounded-none print:border-stone-300">
          <table className="w-full border-collapse text-left">
            <thead className="print:table-header-group">
              <tr className="border-b border-stone-200 bg-stone-50 print:bg-white">
                <th className="w-14 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  In
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Name
                </th>
                <th className="w-20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Qty
                </th>
                <th className="w-36 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Type
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 print:text-[10px]">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ticket) => {
                return (
                  <tr key={ticket.id} className="break-inside-avoid border-b border-stone-200 last:border-b-0">
                    <td className="px-3 py-3 align-top text-xl leading-none text-stone-500 print:py-2.5">[ ]</td>
                    <td className="px-3 py-3 align-top text-base font-semibold text-stone-950 print:py-2.5 print:text-[13px]">
                      {ticket.guest_name?.trim() || "Guest"}
                    </td>
                    <td className="px-3 py-3 align-top text-sm text-stone-800 print:py-2.5 print:text-[12px]">
                      {ticket.ticket_count}
                    </td>
                    <td className="px-3 py-3 align-top text-sm text-stone-800 print:py-2.5 print:text-[12px]">
                      {formatDoorGuestListType(ticket.ticket_type)}
                    </td>
                    <td className="px-3 py-3 align-top text-sm text-stone-700 print:py-2.5 print:text-[12px]">
                      {ticket.notes?.trim() || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="grid gap-5">
      {renderGroup("Online Preorders", onlinePreorders)}
      {renderGroup("Guest List / Comps", guestAndCompEntries)}
    </div>
  );
}

function ReservedSeatCardsPrintView({
  show,
  tickets,
  reservedLinks,
  assignments,
}: {
  show: ShowRecord;
  tickets: DoorGuestListRow[];
  reservedLinks: ReservedSeatingLinkRow[];
  assignments: SelectedReservedSeatRow[];
}) {
  const reservedEntries = sortReservedSeatCards(
    tickets.filter(
      (ticket) => isReservedSeatEntry(ticket) && !hasSelectedReservedSeatsForTicket(ticket, reservedLinks, assignments),
    ),
  );
  const seatCards = reservedEntries.flatMap((ticket) => {
    const seatCount = Math.max(1, ticket.ticket_count);

      return Array.from({ length: seatCount }, (_, index) => ({
        id: `${ticket.id}-seat-${index + 1}`,
        purchaserName: ticket.guest_name?.trim() || "Reserved Guest",
        seatNumber: index + 1,
        totalSeats: seatCount,
        scanToken: findReservedSeatingLinkForTicket(ticket, reservedLinks)?.scan_token ?? null,
      }));
    });

  if (seatCards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No generic paid online fallback seat cards are needed right now. Assigned online seats should print from Reserved Seating.
      </div>
    );
  }

  const pages = chunkItems(seatCards, 8);

  return (
    <div className="grid gap-6 seat-card-pages">
      {pages.map((pageEntries, pageIndex) => (
        <section
          key={`reserved-seat-page-${pageIndex}`}
          className="seat-card-sheet grid grid-cols-2 gap-4"
          style={{
            breakAfter: pageIndex < pages.length - 1 ? "page" : "auto",
            pageBreakAfter: pageIndex < pages.length - 1 ? "always" : "auto",
          }}
        >
          {pageEntries.map((card) => (
            <article
              key={card.id}
              className="seat-card flex min-h-[2.2in] flex-col items-center justify-between rounded-xl border-2 border-dashed border-stone-400 bg-white px-4 py-4 text-center print:rounded-none"
              style={{
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              <img
                src="/cmms-logo.png"
                alt="Cumberland Mountain Music Show logo"
                className="h-auto max-h-[48px] w-auto max-w-[140px] object-contain print:max-h-[42px] print:max-w-[124px]"
              />
                <div className="flex flex-1 flex-col items-center justify-center py-2">
                  <h2 className="text-xl font-black uppercase tracking-[0.06em] text-stone-950 print:text-[18px]">
                    {card.purchaserName}
                </h2>
                {card.totalSeats > 1 ? (
                  <p className="mt-3 text-xs font-medium tracking-[0.16em] text-stone-500 print:text-[10px]">
                    Seat {card.seatNumber} of {card.totalSeats}
                    </p>
                  ) : null}
                </div>
                <div className="w-full">
                  <ReservationTicketCode
                    scanToken={card.scanToken}
                    format={show.ticket_code_format}
                    purchaserName={card.purchaserName}
                    ticketCount={card.totalSeats}
                    compact
                    printable
                  />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-600 print:text-[10px]">
                  Reserved Seating
                </p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function CompReservedSeatCardsPrintView({
  assignments,
  reservedLinks,
  show,
}: {
  assignments: SelectedReservedSeatRow[];
  reservedLinks: ReservedSeatingLinkRow[];
  show: ShowRecord;
}) {
  const reservedLinkById = new Map(reservedLinks.map((link) => [link.id, link]));
  const seatCards = [...assignments]
    .filter((assignment) => {
      const reservedLink = assignment.seating_link_id ? reservedLinkById.get(assignment.seating_link_id) ?? null : null;
      return assignment.assignment_type === "customer" && isCompReservedSeatCategory(assignment.seat_category, reservedLink?.is_complimentary);
    })
    .sort((left, right) => {
      const nameCompare = (left.customer_name ?? "").localeCompare(right.customer_name ?? "", "en-US");
      if (nameCompare !== 0) return nameCompare;
      return left.seat_id.localeCompare(right.seat_id, "en-US");
    });

  if (seatCards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No complimentary reserved seat card entries are available for this show yet.
      </div>
    );
  }

  const pages = chunkItems(seatCards, 8);

  return (
    <div className="grid gap-6 seat-card-pages">
      {pages.map((pageEntries, pageIndex) => (
        <section
          key={`comp-reserved-seat-page-${pageIndex}`}
          className="seat-card-sheet grid grid-cols-2 gap-4"
          style={{
            breakAfter: pageIndex < pages.length - 1 ? "page" : "auto",
            pageBreakAfter: pageIndex < pages.length - 1 ? "always" : "auto",
          }}
        >
          {pageEntries.map((card) => {
            const reservedLink = card.seating_link_id ? reservedLinkById.get(card.seating_link_id) ?? null : null;
            const category = normalizeReservedSeatCategory(card.seat_category, reservedLink?.is_complimentary);
            return (
              <article
                key={card.id}
                className="seat-card flex min-h-[2.2in] flex-col justify-between rounded-xl border-2 border-dashed border-stone-400 bg-white px-4 py-4 text-center print:rounded-none"
                style={{
                  breakInside: "avoid",
                  pageBreakInside: "avoid",
                }}
              >
                <img
                  src="/cmms-logo.png"
                  alt="Cumberland Mountain Music Show logo"
                  className="mx-auto h-auto max-h-[48px] w-auto max-w-[140px] object-contain print:max-h-[42px] print:max-w-[124px]"
                />
                  <div className="flex flex-1 flex-col items-center justify-center py-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-600 print:text-[10px]">
                    {getReservedSeatCategoryLabel(category)}
                  </p>
                  <h2 className="mt-1 text-[1.8rem] font-black tracking-[0.01em] text-stone-950 print:text-[28px] leading-none max-w-full">
                    {card.customer_name?.trim() || "Reserved Comp Guest"}
                  </h2>
                  <p className="mt-1.5 text-lg font-black tracking-[0.03em] text-stone-900 print:text-[18px]">{card.seat_id}</p>
                  <p className="mt-1 text-sm font-semibold tracking-[0.12em] text-stone-600 print:text-[12px]">
                    Section {card.section} - Row {card.row_label} - Seat {card.seat_number}
                  </p>
                    <p className="mt-1.5 text-sm font-medium tracking-[0.12em] text-stone-500 print:text-[12px]">
                      {show.name} - {formatShowDate(show.show_date)}
                    </p>
                  </div>
                  <div className="w-full">
                    <ReservationTicketCode
                      scanToken={reservedLink?.scan_token}
                      format={show.ticket_code_format}
                      purchaserName={card.customer_name?.trim() || "Reserved Comp Guest"}
                      ticketCount={1}
                      seatLabels={[card.seat_id]}
                      compact
                      printable
                    />
                  </div>
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}

function BlankSeatCardsPrintView() {
  const seatCards = Array.from({ length: 8 }, (_, index) => ({
    id: `blank-seat-card-${index + 1}`,
  }));

  return (
    <div className="grid gap-6 seat-card-pages">
      <section className="seat-card-sheet grid grid-cols-2 gap-4">
        {seatCards.map((card) => (
          <article
            key={card.id}
            className="seat-card flex min-h-[2.2in] flex-col items-center justify-between rounded-xl border-2 border-dashed border-stone-400 bg-white px-4 py-4 text-center print:rounded-none"
            style={{
              breakInside: "avoid",
              pageBreakInside: "avoid",
            }}
          >
            <img
              src="/cmms-logo.png"
              alt="Cumberland Mountain Music Show logo"
              className="h-auto max-h-[48px] w-auto max-w-[140px] object-contain print:max-h-[42px] print:max-w-[124px]"
            />
            <div className="flex w-full flex-1 flex-col items-center justify-center py-2">
              <div className="w-full max-w-[14rem] text-left text-sm font-medium text-stone-800 print:text-[12px]">
                Name: __________________
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600 print:text-[10px]">
                Reserved Seating
              </p>
              <p className="mt-3 text-xs font-medium tracking-[0.16em] text-stone-500 print:text-[10px]">
                Seat: _____ of _____
              </p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function getSelectedSeatCardPrintName(name: string) {
  const trimmedName = name.trim();
  if (Array.from(trimmedName).length <= 26) return trimmedName;

  const words = trimmedName.split(/\s+/);
  const ampersandIndex = words.indexOf("&");
  if (ampersandIndex > 0 && ampersandIndex < words.length - 1) {
    return words.slice(0, ampersandIndex + 2).join(" ");
  }

  return words.slice(0, 2).join(" ");
}

function getSelectedSeatCardNamePrintClass(name: string) {
  const characterCount = Array.from(name.trim()).length;

  if (characterCount <= 20) return "print:text-[36px]";
  if (characterCount <= 26) return "print:text-[28px]";
  if (characterCount <= 32) return "print:text-[20px]";
  return "print:text-[16px]";
}

function SelectedReservedSeatCardsPrintView({
  assignments,
  reservedLinks,
}: {
  assignments: SelectedReservedSeatRow[];
  reservedLinks: ReservedSeatingLinkRow[];
}) {
  const seatCards = buildReservedSeatPrintCards(assignments, reservedLinks);

  if (seatCards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No selected reserved seats are available for this show yet.
      </div>
    );
  }

  const firstPageCards = seatCards.slice(0, 6);
  const pages = [firstPageCards, ...chunkItems(seatCards.slice(6), 8)];

  return (
    <div className="grid gap-6 seat-card-pages">
      {pages.map((pageEntries, pageIndex) => (
        <section
          key={`selected-seat-page-${pageIndex}`}
          className={`seat-card-sheet grid grid-cols-2 gap-4 ${pageIndex === 0 ? "seat-card-sheet-with-header" : ""}`}
          style={{
            breakAfter: pageIndex < pages.length - 1 ? "page" : "auto",
            pageBreakAfter: pageIndex < pages.length - 1 ? "always" : "auto",
          }}
        >
          {pageEntries.map((card) => {
            const customerName = card.customerName;
            const printName = getSelectedSeatCardPrintName(customerName);
            return (
              <article
                key={card.id}
                className="seat-card flex min-h-[2.2in] flex-col justify-between rounded-xl border-2 border-dashed border-stone-400 bg-white px-4 py-4 text-center print:rounded-none"
                style={{
                  breakInside: "avoid",
                  pageBreakInside: "avoid",
                }}
              >
                <img
                  src="/cmms-logo.png"
                  alt="Cumberland Mountain Music Show logo"
                  className="mx-auto h-auto max-h-[48px] w-auto max-w-[140px] object-contain print:max-h-[42px] print:max-w-[124px]"
                />
                <div className="flex flex-1 flex-col items-center justify-center py-1.5">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-600 print:text-[13px]">
                    Reserved Seating
                  </p>
                  <h2 className={`mt-2 max-w-full text-4xl font-black leading-none tracking-[0.01em] text-stone-950 print:block print:h-[0.45in] print:w-full print:overflow-hidden print:whitespace-nowrap print:text-ellipsis print:leading-[0.45in] ${getSelectedSeatCardNamePrintClass(printName)}`}>
                    <span className="print:hidden">{customerName}</span>
                    <span className="hidden print:block">{printName}</span>
                  </h2>

                  <p className="mt-3 text-2xl font-black tracking-[0.03em] text-stone-900 print:text-[26px]">{card.seatId}</p>
                  <p className="mt-1 text-base font-semibold tracking-[0.08em] text-stone-700 print:text-[17px]">
                    {card.seatExplanation}
                  </p>

                  </div>
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}

function cleanPrintStudioRecord(record: PrintStudioExportRecord) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => typeof value === "string" && value.trim())) as PrintStudioExportRecord;
}

function getShowExportBase(show: ShowRecord) {
  return {
    event_name: show.name,
    show_date: formatShowDate(show.show_date),
    show_time: show.show_start_time || undefined,
    venue: show.venue || undefined,
  } satisfies PrintStudioExportRecord;
}

function buildPrintStudioExportFileName(showSlug: string, kind: PrintKind) {
  return `print-studio-${showSlug}-${kind}-${new Date().toISOString().slice(0, 10)}.json`;
}

function buildPrintStudioExport(show: ShowRecord, kind: PrintKind, records: PrintStudioExportRecord[]): PrintStudioExportFile | null {
  if (records.length === 0) return null;
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: `stageflow-admin-print-${kind}`,
    showSlug: show.slug,
    records: records.map(cleanPrintStudioRecord),
  };
}

function buildDoorGuestListPrintStudioRecords(show: ShowRecord, tickets: DoorGuestListRow[]) {
  const base = getShowExportBase(show);
  return sortDoorGuestList(tickets).flatMap((ticket) => {
    const count = Math.max(1, ticket.ticket_count || 1);
    return Array.from({ length: count }, () => cleanPrintStudioRecord({
      ...base,
      purchaser_name: ticket.guest_name?.trim() || undefined,
      guest_name: ticket.guest_name?.trim() || undefined,
      ticket_type: formatDoorGuestListType(ticket.ticket_type),
    }));
  });
}

function buildReservedSeatFallbackPrintStudioRecords(show: ShowRecord, tickets: DoorGuestListRow[], reservedLinks: ReservedSeatingLinkRow[], assignments: SelectedReservedSeatRow[]) {
  const base = getShowExportBase(show);
  const reservedEntries = sortReservedSeatCards(tickets.filter((ticket) => isReservedSeatEntry(ticket) && !hasSelectedReservedSeatsForTicket(ticket, reservedLinks, assignments)));
  return reservedEntries.flatMap((ticket) => {
    const seatCount = Math.max(1, ticket.ticket_count);
    return Array.from({ length: seatCount }, (_, index) => cleanPrintStudioRecord({
      ...base,
      purchaser_name: ticket.guest_name?.trim() || undefined,
      guest_name: ticket.guest_name?.trim() || undefined,
      ticket_type: "Reserved Seating",
      seat: seatCount > 1 ? `Seat ${index + 1} of ${seatCount}` : undefined,
    }));
  });
}

function buildAssignmentPrintStudioRecords(show: ShowRecord, assignments: SelectedReservedSeatRow[], reservedLinks: ReservedSeatingLinkRow[], mode: "selected" | "comp") {
  const base = getShowExportBase(show);
  const reservedLinkById = new Map(reservedLinks.map((link) => [link.id, link]));
  return [...assignments]
    .filter((assignment) => {
      if (assignment.assignment_type !== "customer") return false;
      if (mode === "selected") return true;
      const reservedLink = assignment.seating_link_id ? reservedLinkById.get(assignment.seating_link_id) ?? null : null;
      return isCompReservedSeatCategory(assignment.seat_category, reservedLink?.is_complimentary);
    })
    .sort((left, right) => {
      const nameCompare = (left.customer_name ?? "").localeCompare(right.customer_name ?? "", "en-US");
      if (nameCompare !== 0) return nameCompare;
      return left.seat_id.localeCompare(right.seat_id, "en-US");
    })
    .map((assignment) => {
      const reservedLink = assignment.seating_link_id ? reservedLinkById.get(assignment.seating_link_id) ?? null : null;
      const category = normalizeReservedSeatCategory(assignment.seat_category, reservedLink?.is_complimentary);
      return cleanPrintStudioRecord({
        ...base,
        purchaser_name: assignment.customer_name?.trim() || undefined,
        guest_name: assignment.customer_name?.trim() || undefined,
        ticket_type: mode === "comp" ? getReservedSeatCategoryLabel(category) : reservedLink?.is_complimentary ? "Complimentary Reserved Seat" : "Reserved Seat",
        seat: assignment.seat_id,
        section: assignment.section,
      });
    });
}
async function loadShow(slug: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shows").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw error;
  }

  return data as ShowRecord | null;
}

async function loadSponsors(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_sponsors")
    .select("*, sponsor:sponsor_id (*)")
    .eq("show_id", showId)
    .order("placement_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as SponsorRow[];
}

async function loadAnchorTitles(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("setlist_entries")
    .select(
      `
        id,
        custom_title,
        library_song:song_id (title),
        guest_song:guest_song_id (title)
      `,
    )
    .eq("show_id", showId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as AnchorRow[]).reduce<Record<string, string>>((lookup, anchor) => {
    const title = getAnchorTitle(anchor);

    if (title) {
      lookup[anchor.id] = title;
    }

    return lookup;
  }, {});
}

async function loadGuests(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("guest_profiles")
    .select("*")
    .eq("show_id", showId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as GuestProfile[];
}

async function loadGuestSongs(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_guest_songs")
    .select("id, title, submitted_by_name")
    .eq("show_id", showId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as GuestSongRow[];
}

async function loadDoorGuestList(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_comp_tickets")
    .select("*")
    .eq("show_id", showId)
    .neq("ticket_type", "door_paid")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as DoorGuestListRow[]).filter(
    (ticket) => normalizeGuestListTicketType(ticket.ticket_type) !== "door_paid",
  );
}

async function loadReservedSeatingLinks(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_reserved_seating_links")
    .select("*")
    .eq("show_id", showId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ReservedSeatingLinkRow[];
}

async function loadReservedSeatAssignments(showId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("show_reserved_seat_assignments")
    .select("*")
    .eq("show_id", showId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as SelectedReservedSeatRow[];
}

export default async function AdminPrintPage({ params }: PrintPageProps) {
  const { slug, kind } = await params;
  const printKind = normalizePrintKind(kind);

  if (!printKind) {
    notFound();
  }

  const show = await loadShow(slug);

  if (!show) {
    notFound();
  }

  const sponsors =
    printKind === "sponsors" ? await safeLoad("sponsors", () => loadSponsors(show.id), []) : [];
  const anchorTitles =
    printKind === "sponsors"
      ? await safeLoad("setlist anchors", () => loadAnchorTitles(show.id), {})
      : {};
  const guests = printKind === "guests" ? await safeLoad("guests", () => loadGuests(show.id), []) : [];
  const guestSongs =
    printKind === "guests" ? await safeLoad("guest songs", () => loadGuestSongs(show.id), []) : [];
  const guestSongsByProfileId =
    printKind === "guests"
      ? guests.reduce<Record<string, string[]>>((lookup, guest) => {
          const normalizedGuestName = normalizeGuestProfileName(guest.name);

          if (!normalizedGuestName) {
            lookup[guest.id] = [];
            return lookup;
          }

          lookup[guest.id] = guestSongs
            .filter(
              (song) =>
                normalizeGuestProfileName(song.submitted_by_name) === normalizedGuestName &&
                song.title?.trim(),
            )
            .map((song) => song.title!.trim());

          return lookup;
        }, {})
      : {};
  const doorGuestList =
    printKind === "door-guest-list" ||
    printKind === "reserved-seat-cards" ||
    printKind === "comp-reserved-seat-cards"
      ? await safeLoad("door guest list", () => loadDoorGuestList(show.id), [])
      : [];
  const selectedReservedSeatAssignments =
    printKind === "selected-seat-cards" || printKind === "reserved-seat-cards" || printKind === "comp-reserved-seat-cards"
      ? await safeLoad("selected reserved seat assignments", () => loadReservedSeatAssignments(show.id), [])
      : [];
  const reservedSeatingLinks =
    printKind === "reserved-seat-cards" || printKind === "selected-seat-cards" || printKind === "comp-reserved-seat-cards"
      ? await safeLoad("reserved seating links", () => loadReservedSeatingLinks(show.id), [])
      : [];

  const printStudioExportRecords =
    printKind === "door-guest-list"
      ? buildDoorGuestListPrintStudioRecords(show, doorGuestList)
      : printKind === "reserved-seat-cards"
        ? buildReservedSeatFallbackPrintStudioRecords(show, doorGuestList, reservedSeatingLinks, selectedReservedSeatAssignments)
        : printKind === "comp-reserved-seat-cards"
          ? buildAssignmentPrintStudioRecords(show, selectedReservedSeatAssignments, reservedSeatingLinks, "comp")
          : printKind === "selected-seat-cards"
            ? buildAssignmentPrintStudioRecords(show, selectedReservedSeatAssignments, reservedSeatingLinks, "selected")
            : [];
  const printStudioExport = buildPrintStudioExport(show, printKind, printStudioExportRecords);
  const printStudioExportFileName = printStudioExport ? buildPrintStudioExportFileName(show.slug, printKind) : undefined;
  return (
    <AdminGate slug={slug} resourceLabel={`print pages for ${show.name}`} continueLabel="Continue to Print View">
      <PrintShell show={show} kind={printKind} printStudioExport={printStudioExport} printStudioExportFileName={printStudioExportFileName}>
        {printKind === "itinerary" ? <ItineraryPrintView show={show} /> : null}
        {printKind === "sponsors" ? (
          <SponsorRundownPrintView sponsors={sponsors} anchorTitles={anchorTitles} />
        ) : null}
        {printKind === "guests" ? (
          <GuestInfoPrintView guests={guests} guestSongsByProfileId={guestSongsByProfileId} />
        ) : null}
        {printKind === "door-guest-list" ? <DoorGuestListPrintView tickets={doorGuestList} /> : null}
        {printKind === "reserved-seat-cards" ? (
          <ReservedSeatCardsPrintView
            show={show}
            tickets={doorGuestList}
            reservedLinks={reservedSeatingLinks}
            assignments={selectedReservedSeatAssignments}
          />
        ) : null}
        {printKind === "comp-reserved-seat-cards" ? (
          <CompReservedSeatCardsPrintView
            assignments={selectedReservedSeatAssignments}
            reservedLinks={reservedSeatingLinks}
            show={show}
          />
        ) : null}
        {printKind === "blank-seat-cards" ? <BlankSeatCardsPrintView /> : null}
        {printKind === "selected-seat-cards" ? (
          <SelectedReservedSeatCardsPrintView
            assignments={selectedReservedSeatAssignments}
            reservedLinks={reservedSeatingLinks}
          />
        ) : null}
      </PrintShell>
    </AdminGate>
  );
}

