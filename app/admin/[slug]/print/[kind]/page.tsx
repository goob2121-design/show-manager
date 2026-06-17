import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminGate } from "@/app/components/admin-gate";
import { PrintButton } from "@/app/components/print-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GuestProfile, ShowCompTicket, ShowRecord, ShowSponsor, SponsorLibraryEntry } from "@/lib/types";

type PrintKind = "itinerary" | "sponsors" | "guests" | "door-guest-list" | "reserved-seat-cards";

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

type PrintPageProps = {
  params: Promise<{ slug: string; kind: string }>;
};

function normalizePrintKind(kind: string): PrintKind | null {
  if (
    kind === "itinerary" ||
    kind === "sponsors" ||
    kind === "guests" ||
    kind === "door-guest-list" ||
    kind === "reserved-seat-cards"
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
}: {
  show: ShowRecord;
  kind: PrintKind;
  children: ReactNode;
}) {
  const title = getPrintTitle(kind);
  const isDoorGuestList = kind === "door-guest-list";
  const isReservedSeatCards = kind === "reserved-seat-cards";

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-6 print:bg-white print:px-0 print:py-0">
      <section className="mx-auto max-w-4xl rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <Link
            href={`/admin/${show.slug}`}
            className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Back to Admin
          </Link>
          <PrintButton />
        </div>

        <header className={`mb-6 border-b border-stone-300 pb-5 ${isReservedSeatCards ? "print:hidden" : ""}`}>
          {isDoorGuestList || isReservedSeatCards ? (
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
                {isReservedSeatCards ? "Reserved Seat Cards" : "Door Guest List"}
              </p>
            </div>
          ) : (
            <>
          <p className="text-[10px] font-medium text-stone-500 print:text-[9px]">
            StageFlow — by Pinnacle Recording Studio
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
                    <td className="px-3 py-3 align-top text-xl leading-none text-stone-500 print:py-2.5">□</td>
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

function ReservedSeatCardsPrintView({ tickets }: { tickets: DoorGuestListRow[] }) {
  const reservedEntries = sortReservedSeatCards(tickets.filter((ticket) => isReservedSeatEntry(ticket)));
  const seatCards = reservedEntries.flatMap((ticket) => {
    const seatCount = Math.max(1, ticket.ticket_count);

    return Array.from({ length: seatCount }, (_, index) => ({
      id: `${ticket.id}-seat-${index + 1}`,
      purchaserName: ticket.guest_name?.trim() || "Reserved Guest",
      seatNumber: index + 1,
      totalSeats: seatCount,
    }));
  });

  if (seatCards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-sm text-stone-500">
        No reserved seat card entries are available for this show yet.
      </div>
    );
  }

  const pages = chunkItems(seatCards, 8);

  return (
    <div className="grid gap-6">
      {pages.map((pageEntries, pageIndex) => (
        <section
          key={`reserved-seat-page-${pageIndex}`}
          className="grid grid-cols-2 gap-4 print:h-[9.15in] print:[grid-template-rows:repeat(4,minmax(0,1fr))] print:gap-3"
          style={{
            breakAfter: pageIndex < pages.length - 1 ? "page" : "auto",
            pageBreakAfter: pageIndex < pages.length - 1 ? "always" : "auto",
          }}
        >
          {pageEntries.map((card) => (
            <article
              key={card.id}
              className="flex min-h-[2.2in] flex-col items-center justify-between rounded-xl border-2 border-dashed border-stone-400 bg-white px-4 py-4 text-center print:h-full print:min-h-0 print:rounded-none print:px-3 print:py-3"
              style={{
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              <img
                src="/cmms-logo.png"
                alt="Cumberland Mountain Music Show logo"
                className="h-auto max-h-[48px] w-auto max-w-[140px] object-contain grayscale print:max-h-[42px] print:max-w-[124px]"
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
    printKind === "door-guest-list" || printKind === "reserved-seat-cards"
      ? await safeLoad("door guest list", () => loadDoorGuestList(show.id), [])
      : [];

  return (
    <AdminGate slug={slug} resourceLabel={`print pages for ${show.name}`} continueLabel="Continue to Print View">
      <PrintShell show={show} kind={printKind}>
        {printKind === "itinerary" ? <ItineraryPrintView show={show} /> : null}
        {printKind === "sponsors" ? (
          <SponsorRundownPrintView sponsors={sponsors} anchorTitles={anchorTitles} />
        ) : null}
        {printKind === "guests" ? (
          <GuestInfoPrintView guests={guests} guestSongsByProfileId={guestSongsByProfileId} />
        ) : null}
        {printKind === "door-guest-list" ? <DoorGuestListPrintView tickets={doorGuestList} /> : null}
        {printKind === "reserved-seat-cards" ? <ReservedSeatCardsPrintView tickets={doorGuestList} /> : null}
      </PrintShell>
    </AdminGate>
  );
}
