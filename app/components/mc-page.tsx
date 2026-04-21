"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ThemeToggle } from "@/app/components/theme-toggle";
import type {
  GuestProfile,
  McBlockNote,
  SetSection,
  SetlistSong,
  ShowRecord,
  ShowSponsor,
} from "@/lib/types";

export type ScriptFormState = {
  openingScript: string;
  intermissionScript: string;
  closingScript: string;
};

export type BlockNoteFormState = {
  introNote: string;
  sponsorMention: string;
  transitionNote: string;
};

type McPageProps = {
  showSlug: string;
  initialShow: ShowRecord | null;
  initialSetlist: Array<SetlistSong & { set_section?: string | null }>;
  initialGuestProfiles: GuestProfile[];
  initialSponsors: ShowSponsor[];
  initialBlockNotes: McBlockNote[];
};

export type McPerformanceBlock = {
  anchorSongId: string;
  section: SetSection;
  performer: string;
  songs: SetlistSong[];
  guestProfile: GuestProfile | null;
  note: McBlockNote | null;
};

export type McRunSection = {
  key: SetSection;
  title: string;
  blocks: McPerformanceBlock[];
};

export type McRunSheetItem =
  | {
      kind: "block";
      id: string;
      block: McPerformanceBlock;
      upNext: McPerformanceBlock | null;
    }
  | {
      kind: "sponsor";
      id: string;
      sponsor: ShowSponsor;
    };

export type McRunSheetData = {
  sectionItems: Array<{
    key: SetSection;
    title: string;
    items: McRunSheetItem[];
  }>;
  beforeIntermission: ShowSponsor[];
  afterIntermission: ShowSponsor[];
  closing: ShowSponsor[];
  flexible: ShowSponsor[];
};

const setSectionOrder: SetSection[] = ["set1", "set2", "encore"];
const setSectionTitles: Record<SetSection, string> = {
  set1: "Set 1",
  set2: "Set 2",
  encore: "Encore",
};

function normalizeSetSection(value: string | null | undefined): SetSection {
  if (value === "set2" || value === "encore") {
    return value;
  }

  return "set1";
}

function normalizeSetlistSong(song: SetlistSong & { set_section?: string | null }): SetlistSong {
  return {
    ...song,
    set_section: normalizeSetSection(song.set_section),
    source_role: song.source_role ?? null,
  };
}

function sortSetlistSongs(songs: SetlistSong[]) {
  return [...songs].sort((songA, songB) => {
    const sectionDifference =
      setSectionOrder.indexOf(songA.set_section) - setSectionOrder.indexOf(songB.set_section);

    if (sectionDifference !== 0) {
      return sectionDifference;
    }

    if (songA.position !== songB.position) {
      return songA.position - songB.position;
    }

    return songA.created_at.localeCompare(songB.created_at);
  });
}

function sortSponsors(sponsors: ShowSponsor[]) {
  return [...sponsors].sort((sponsorA, sponsorB) => {
    if (sponsorA.placement_order !== sponsorB.placement_order) {
      return sponsorA.placement_order - sponsorB.placement_order;
    }

    return sponsorA.created_at.localeCompare(sponsorB.created_at);
  });
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

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSponsorPlacementType(value: string | null | undefined) {
  switch (value) {
    case "before_performer":
      return "before_performer";
    case "after_performer":
      return "after_performer";
    case "before_intermission":
      return "before_intermission";
    case "after_intermission":
      return "after_intermission";
    case "closing":
      return "closing";
    case "opening":
      return "before_performer";
    case "changeover":
      return "after_performer";
    case "intermission":
      return "before_intermission";
    default:
      return "flexible";
  }
}

export function formatSponsorPlacementType(value: string | null | undefined) {
  switch (normalizeSponsorPlacementType(value)) {
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

export function getSponsorReadText(sponsor: ShowSponsor) {
  const fullMessage = sponsor.sponsor?.full_message?.trim();

  if (fullMessage) {
    return fullMessage;
  }

  const shortMessage = sponsor.sponsor?.short_message?.trim();

  if (shortMessage) {
    return shortMessage;
  }

  return "No sponsor read has been added yet.";
}

export function getGuestIntroText(profile: GuestProfile | null) {
  if (!profile) {
    return null;
  }

  if (profile.short_bio?.trim()) {
    return profile.short_bio.trim();
  }

  if (profile.full_bio?.trim()) {
    return profile.full_bio.trim();
  }

  return null;
}

function getTrimmedValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function getPerformerSummary(block: McPerformanceBlock) {
  return block.songs
    .map((song) => (song.song_key ? `${song.title} (${song.song_key})` : song.title))
    .join(", ");
}

function getSectionPacketTitle(section: SetSection) {
  switch (section) {
    case "set1":
      return "First Half";
    case "set2":
      return "Second Half";
    case "encore":
      return "Encore";
    default:
      return "Run Sheet";
  }
}

function getSectionPacketSubtitle(section: SetSection) {
  switch (section) {
    case "set1":
      return "SET 1";
    case "set2":
      return "SET 2";
    case "encore":
      return "ENCORE";
    default:
      return "RUN SHEET";
  }
}

export function buildScriptFormState(show: ShowRecord | null): ScriptFormState {
  return {
    openingScript: show?.opening_script ?? "",
    intermissionScript: show?.intermission_script ?? "",
    closingScript: show?.closing_script ?? "",
  };
}

export function buildMcRunSections(
  setlist: SetlistSong[],
  guestProfiles: GuestProfile[],
  blockNotes: McBlockNote[],
): McRunSection[] {
  const guestProfileLookup = guestProfiles.reduce<Record<string, GuestProfile>>((lookup, profile) => {
    const normalizedName = normalizeName(profile.name);

    if (normalizedName) {
      lookup[normalizedName] = profile;
    }

    return lookup;
  }, {});

  const blockNoteLookup = blockNotes.reduce<Record<string, McBlockNote>>((lookup, note) => {
    lookup[note.anchor_song_id] = note;
    return lookup;
  }, {});

  return setSectionOrder
    .map((section) => {
      const songs = setlist.filter((song) => song.set_section === section);
      const blocks: McPerformanceBlock[] = [];

      songs.forEach((song) => {
        const performer = song.artist?.trim() || "Unknown performer";
        const previousBlock = blocks[blocks.length - 1];

        if (previousBlock && previousBlock.performer === performer) {
          previousBlock.songs.push(song);
          return;
        }

        blocks.push({
          anchorSongId: song.id,
          section,
          performer,
          songs: [song],
          guestProfile: guestProfileLookup[normalizeName(performer)] ?? null,
          note: blockNoteLookup[song.id] ?? null,
        });
      });

      return {
        key: section,
        title: setSectionTitles[section],
        blocks,
      };
    })
    .filter((section) => section.blocks.length > 0);
}

export function buildBlockNoteDrafts(runSections: McRunSection[], blockNotes: McBlockNote[]) {
  const noteLookup = blockNotes.reduce<Record<string, McBlockNote>>((lookup, note) => {
    lookup[note.anchor_song_id] = note;
    return lookup;
  }, {});

  return runSections.reduce<Record<string, BlockNoteFormState>>((drafts, section) => {
    section.blocks.forEach((block) => {
      const note = noteLookup[block.anchorSongId];

      drafts[block.anchorSongId] = {
        introNote: note?.intro_note ?? "",
        sponsorMention: note?.sponsor_mention ?? "",
        transitionNote: note?.transition_note ?? "",
      };
    });

    return drafts;
  }, {});
}

function findMatchingBlockIndex(blocks: McPerformanceBlock[], linkedPerformer: string | null, fallbackIndex: number) {
  if (blocks.length === 0) {
    return null;
  }

  const normalizedPerformer = normalizeName(linkedPerformer);

  if (!normalizedPerformer) {
    return fallbackIndex;
  }

  const exactMatchIndex = blocks.findIndex(
    (block) => normalizeName(block.performer) === normalizedPerformer,
  );

  if (exactMatchIndex >= 0) {
    return exactMatchIndex;
  }

  const partialMatchIndex = blocks.findIndex((block) => {
    const normalizedBlockPerformer = normalizeName(block.performer);
    return (
      normalizedBlockPerformer.includes(normalizedPerformer) ||
      normalizedPerformer.includes(normalizedBlockPerformer)
    );
  });

  if (partialMatchIndex >= 0) {
    return partialMatchIndex;
  }

  return fallbackIndex;
}

function findBlockIndexByAnchorSongId(
  blocks: McPerformanceBlock[],
  anchorSongId: string | null | undefined,
) {
  if (!anchorSongId) {
    return null;
  }

  const blockIndex = blocks.findIndex((block) => block.anchorSongId === anchorSongId);
  return blockIndex >= 0 ? blockIndex : null;
}

export function buildMcRunSheetData(
  runSections: McRunSection[],
  sponsors: ShowSponsor[],
): McRunSheetData {
  const orderedSponsors = sortSponsors(sponsors);
  const allBlocks = runSections.flatMap((section) => section.blocks);
  const beforeByAnchorSongId: Record<string, ShowSponsor[]> = {};
  const afterByAnchorSongId: Record<string, ShowSponsor[]> = {};
  const beforeIntermission: ShowSponsor[] = [];
  const afterIntermission: ShowSponsor[] = [];
  const closing: ShowSponsor[] = [];
  const flexible: ShowSponsor[] = [];

  function appendSponsor(
    lookup: Record<string, ShowSponsor[]>,
    anchorSongId: string,
    sponsor: ShowSponsor,
  ) {
    if (!lookup[anchorSongId]) {
      lookup[anchorSongId] = [];
    }

    lookup[anchorSongId].push(sponsor);
  }

  orderedSponsors.forEach((sponsor) => {
    const placementType = normalizeSponsorPlacementType(sponsor.placement_type);

    if (placementType === "before_intermission") {
      beforeIntermission.push(sponsor);
      return;
    }

    if (placementType === "after_intermission") {
      afterIntermission.push(sponsor);
      return;
    }

    if (placementType === "closing") {
      closing.push(sponsor);
      return;
    }

    if (placementType === "before_performer") {
      const targetIndex =
        findBlockIndexByAnchorSongId(allBlocks, sponsor.mc_anchor_song_id) ??
        findMatchingBlockIndex(allBlocks, sponsor.linked_performer, 0);

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(beforeByAnchorSongId, allBlocks[targetIndex].anchorSongId, sponsor);
      return;
    }

    if (placementType === "after_performer") {
      const targetIndex =
        findBlockIndexByAnchorSongId(allBlocks, sponsor.mc_anchor_song_id) ??
        findMatchingBlockIndex(
          allBlocks,
          sponsor.linked_performer,
          Math.max(allBlocks.length - 1, 0),
        );

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(afterByAnchorSongId, allBlocks[targetIndex].anchorSongId, sponsor);
      return;
    }

    flexible.push(sponsor);
  });

  return {
    sectionItems: runSections.map((section) => {
      const items: McRunSheetItem[] = [];

      section.blocks.forEach((block) => {
        const beforeSponsors = beforeByAnchorSongId[block.anchorSongId] ?? [];
        const afterSponsors = afterByAnchorSongId[block.anchorSongId] ?? [];
        const blockIndex = allBlocks.findIndex(
          (candidateBlock) => candidateBlock.anchorSongId === block.anchorSongId,
        );

        beforeSponsors.forEach((sponsor) => {
          items.push({
            kind: "sponsor",
            id: `before-${block.anchorSongId}-${sponsor.id}`,
            sponsor,
          });
        });

        items.push({
          kind: "block",
          id: block.anchorSongId,
          block,
          upNext: blockIndex >= 0 ? allBlocks[blockIndex + 1] ?? null : null,
        });

        afterSponsors.forEach((sponsor) => {
          items.push({
            kind: "sponsor",
            id: `after-${block.anchorSongId}-${sponsor.id}`,
            sponsor,
          });
        });
      });

      return {
        key: section.key,
        title: section.title,
        items,
      };
    }),
    beforeIntermission,
    afterIntermission,
    closing,
    flexible,
  };
}

export function ScriptCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{title}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
        {text.trim() || "No script added yet."}
      </p>
    </article>
  );
}

export function SponsorReadCard({ sponsor }: { sponsor: ShowSponsor }) {
  return (
    <article className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
            Sponsor Read
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
            {formatSponsorPlacementType(sponsor.placement_type)}
          </span>
        </div>

        <div>
          <h4 className="text-lg font-semibold text-stone-900">
            {sponsor.sponsor?.name ?? "Assigned sponsor"}
          </h4>
          {sponsor.linked_performer ? (
            <p className="mt-1 text-sm text-stone-600">
              Performer link: {sponsor.linked_performer}
            </p>
          ) : null}
        </div>

        <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">
          {getSponsorReadText(sponsor)}
        </p>

        {sponsor.custom_note?.trim() ? (
          <p className="text-sm text-stone-600">MC note: {sponsor.custom_note.trim()}</p>
        ) : null}
      </div>
    </article>
  );
}

export function PerformerBlockCard({
  block,
  blockDraft,
  upNext,
}: {
  block: McPerformanceBlock;
  blockDraft: BlockNoteFormState;
  upNext: McPerformanceBlock | null;
}) {
  const guestIntroText = getGuestIntroText(block.guestProfile);

  return (
    <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-lg font-semibold text-stone-900">{block.performer}</h4>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
            {block.songs.length} {block.songs.length === 1 ? "song" : "songs"}
          </span>
          {block.guestProfile ? (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
              Guest intro available
            </span>
          ) : null}
        </div>

        <p className="text-sm text-stone-600">
          {block.songs
            .map((song) => (song.song_key ? `${song.title} (${song.song_key})` : song.title))
            .join(", ")}
        </p>

        {upNext ? (
          <p className="print-hidden text-sm text-stone-500">
            Up next: {upNext.performer} - {upNext.songs.length}{" "}
            {upNext.songs.length === 1 ? "song" : "songs"}
          </p>
        ) : null}

        <div className="grid gap-3">
          {blockDraft.introNote.trim() ? (
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                MC Intro
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                {blockDraft.introNote.trim()}
              </p>
            </div>
          ) : null}

          {guestIntroText ? (
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                Guest Intro
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{guestIntroText}</p>
            </div>
          ) : null}

          {blockDraft.sponsorMention.trim() ? (
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                Sponsor Mention
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                {blockDraft.sponsorMention.trim()}
              </p>
            </div>
          ) : null}

          {blockDraft.transitionNote.trim() ? (
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                Transition
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                {blockDraft.transitionNote.trim()}
              </p>
            </div>
          ) : null}

          {!blockDraft.introNote.trim() &&
          !guestIntroText &&
          !blockDraft.sponsorMention.trim() &&
          !blockDraft.transitionNote.trim() ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-3 text-sm text-stone-500">
              No MC notes added for this block yet.
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function McPage({
  showSlug,
  initialShow,
  initialSetlist,
  initialGuestProfiles,
  initialSponsors,
  initialBlockNotes,
}: McPageProps) {
  const [show] = useState<ShowRecord | null>(initialShow);
  const [setlist] = useState<SetlistSong[]>(() =>
    sortSetlistSongs(initialSetlist.map((song) => normalizeSetlistSong(song))),
  );
  const [guestProfiles] = useState<GuestProfile[]>(initialGuestProfiles);
  const [blockNotes] = useState<McBlockNote[]>(initialBlockNotes);
  const [showLogo, setShowLogo] = useState(true);

  const sponsors = useMemo(() => sortSponsors(initialSponsors), [initialSponsors]);
  const runSections = useMemo(
    () => buildMcRunSections(setlist, guestProfiles, blockNotes),
    [blockNotes, guestProfiles, setlist],
  );
  const scriptFormState = useMemo(() => buildScriptFormState(show), [show]);
  const blockNoteDrafts = useMemo(
    () => buildBlockNoteDrafts(runSections, blockNotes),
    [blockNotes, runSections],
  );
  const runSheetData = useMemo(
    () => buildMcRunSheetData(runSections, sponsors),
    [runSections, sponsors],
  );

  function handlePrintPacket() {
    window.print();
  }

  const showOverviewItems = [
    { label: "Show Date", value: formatShowDate(show?.show_date ?? null) },
    { label: "Venue", value: show?.venue ?? "" },
    { label: "Show Start", value: show?.show_start_time ?? "" },
    { label: "Call Time", value: show?.call_time ?? "" },
    { label: "Band Arrival", value: show?.band_arrival_time ?? "" },
    { label: "Guest Arrival", value: show?.guest_arrival_time ?? "" },
    { label: "Contact", value: show?.contact_name ?? "" },
    { label: "Phone", value: show?.contact_phone ?? "" },
    { label: "Announcements", value: show?.announcements ?? "" },
  ].filter((item) => item.value.trim());

  const hasIntermissionSection =
    Boolean(scriptFormState.intermissionScript.trim()) ||
    runSheetData.beforeIntermission.length > 0 ||
    runSheetData.afterIntermission.length > 0 ||
    runSections.some((section) => section.key === "set2" || section.key === "encore");

  const hasClosingSection =
    Boolean(scriptFormState.closingScript.trim()) ||
    runSheetData.closing.length > 0 ||
    runSheetData.flexible.length > 0;

  const performerPacketEntries = useMemo(() => {
    const entries = runSections.flatMap((section) =>
      section.blocks.map((block) => ({
        performer: block.performer,
        section: section.title,
        songs: getPerformerSummary(block),
        guestIntro: getGuestIntroText(block.guestProfile),
        hometown: getTrimmedValue(block.guestProfile?.hometown),
        instruments: getTrimmedValue(block.guestProfile?.instruments),
        note: block.note,
      })),
    );

    return entries.filter(
      (entry, index, allEntries) =>
        allEntries.findIndex((candidate) => candidate.performer === entry.performer) === index,
    );
  }, [runSections]);

  const sponsorSummaryNames = sponsors
    .map((sponsor) => sponsor.sponsor?.name?.trim() ?? "")
    .filter(Boolean);
  const sponsorPageEntries = sponsors.filter(
    (sponsor, index, allSponsors) =>
      allSponsors.findIndex((candidate) => candidate.id === sponsor.id) === index,
  );
  const overviewScheduleItems = [
    { label: "First Half", value: runSections.find((section) => section.key === "set1") ? "Set 1 run sheet ready" : "" },
    {
      label: "Intermission",
      value: hasIntermissionSection ? "Intermission break and sponsor/script section included" : "",
    },
    { label: "Second Half", value: runSections.find((section) => section.key === "set2") ? "Set 2 run sheet ready" : "" },
    { label: "Encore", value: runSections.find((section) => section.key === "encore") ? "Encore section included" : "" },
  ].filter((item) => item.value);
  const overviewInfoItems = [
    { label: "Venue", value: getTrimmedValue(show?.venue) },
    { label: "Address", value: getTrimmedValue(show?.venue_address) },
    { label: "Show Start", value: getTrimmedValue(show?.show_start_time) },
    { label: "Call Time", value: getTrimmedValue(show?.call_time) },
    { label: "Band Arrival", value: getTrimmedValue(show?.band_arrival_time) },
    { label: "Guest Arrival", value: getTrimmedValue(show?.guest_arrival_time) },
    { label: "Soundcheck", value: getTrimmedValue(show?.soundcheck_time) },
    { label: "Contact", value: getTrimmedValue(show?.contact_name) },
    { label: "Phone", value: getTrimmedValue(show?.contact_phone) },
    { label: "Directions", value: getTrimmedValue(show?.directions_url) },
  ].filter((item) => item.value);
  const overviewReminderItems = [
    { label: "Announcements", value: getTrimmedValue(show?.announcements) },
    { label: "Parking", value: getTrimmedValue(show?.parking_notes) },
    { label: "Load-In", value: getTrimmedValue(show?.load_in_notes) },
  ].filter((item) => item.value);

  if (!show) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-rose-700">The MC portal could not be loaded.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 print-shell">
        <header className="print-hidden flex flex-col gap-4 border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-3">
              {showLogo ? (
                <div className="w-fit">
                  <Image
                    src="/cmms-logo.png"
                    alt="CMMS logo"
                    width={180}
                    height={64}
                    priority
                    className="h-auto w-full max-w-[150px] object-contain"
                    onError={() => setShowLogo(false)}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  CMMS Show Flow
                </p>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
                  MC Portal
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{show.name}</h1>
                <p className="text-base text-stone-600">
                  One clean run sheet generated from the official setlist, with sponsor reads
                  placed directly in the flow.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <ThemeToggle />
              <button
                type="button"
                onClick={handlePrintPacket}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                Print MC Packet
              </button>
            </div>
          </div>
        </header>

        <section className="print-hidden mc-section flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Show Overview</h2>
            <p className="text-sm text-stone-600">
              Quick reference details for the show operator and MC team.
            </p>
          </div>

          {showOverviewItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No show overview details have been added yet.
            </div>
          ) : (
            <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 sm:p-5">
              {showOverviewItems.map((item) => (
                <div key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {item.label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">MC Scripts</h2>
            <p className="text-sm text-stone-600">
              Opening, intermission, and closing scripts used in the final announcer packet.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ScriptCard title="Opening Script" text={scriptFormState.openingScript} />
            <ScriptCard title="Intermission Script" text={scriptFormState.intermissionScript} />
            <ScriptCard title="Closing Script" text={scriptFormState.closingScript} />
          </div>
        </section>

        <section className="print-hidden mc-section flex flex-col gap-5 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Live Run Sheet</h2>
            <p className="text-sm text-stone-600">
              Read straight down this page during the show. Sponsor reads appear where they should
              happen in the flow.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            <section className="mc-run-section flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">Opening</h3>
                <p className="text-sm text-stone-600">Kickoff script before the first performer.</p>
              </div>

              <ScriptCard title="Opening Script" text={scriptFormState.openingScript} />
            </section>

            {runSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                No official setlist is available yet, so the MC run sheet is still empty.
              </div>
            ) : (
              runSheetData.sectionItems.map((section) => (
                <section key={section.key} className="mc-run-section flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-stone-900">{section.title}</h3>
                    <p className="text-sm text-stone-600">
                      {section.items.filter((item) => item.kind === "block").length} performance{" "}
                      {section.items.filter((item) => item.kind === "block").length === 1
                        ? "block"
                        : "blocks"}
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {section.items.map((item) => {
                      if (item.kind === "sponsor") {
                        return <SponsorReadCard key={item.id} sponsor={item.sponsor} />;
                      }

                      const blockDraft = blockNoteDrafts[item.block.anchorSongId] ?? {
                        introNote: "",
                        sponsorMention: "",
                        transitionNote: "",
                      };

                      return (
                        <div key={item.id} className="grid gap-4">
                          <PerformerBlockCard
                            block={item.block}
                            blockDraft={blockDraft}
                            upNext={item.upNext}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}

            {hasIntermissionSection ? (
              <section className="mc-run-section flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Intermission</h3>
                  <p className="text-sm text-stone-600">
                    Mid-show sponsor reads and return script.
                  </p>
                </div>

                <div className="grid gap-4">
                  {runSheetData.beforeIntermission.map((sponsor) => (
                    <SponsorReadCard key={`before-intermission-${sponsor.id}`} sponsor={sponsor} />
                  ))}

                  <ScriptCard title="Intermission Script" text={scriptFormState.intermissionScript} />

                  {runSheetData.afterIntermission.map((sponsor) => (
                    <SponsorReadCard key={`after-intermission-${sponsor.id}`} sponsor={sponsor} />
                  ))}
                </div>
              </section>
            ) : null}

            {hasClosingSection ? (
              <section className="mc-run-section flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Closing</h3>
                  <p className="text-sm text-stone-600">
                    End-of-show thank-yous and sign-off.
                  </p>
                </div>

                <div className="grid gap-4">
                  {runSheetData.closing.map((sponsor) => (
                    <SponsorReadCard key={`closing-${sponsor.id}`} sponsor={sponsor} />
                  ))}

                  <ScriptCard title="Closing Script" text={scriptFormState.closingScript} />

                  {runSheetData.flexible.map((sponsor) => (
                    <SponsorReadCard key={`flexible-${sponsor.id}`} sponsor={sponsor} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <div className="print-only mc-print-packet">
          <section className="mc-print-page">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">MC Packet</p>
              <h1>{show.name}</h1>
              <p>{formatShowDate(show.show_date)}</p>
            </header>

            <div className="mc-print-stack">
              <section className="mc-print-panel">
                <div className="mc-print-panel-heading">
                  <p className="mc-print-eyebrow">Page 1</p>
                  <h2>Show Overview</h2>
                </div>

                {overviewScheduleItems.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Show Schedule</h3>
                    <div className="mc-print-grid">
                      {overviewScheduleItems.map((item) => (
                        <div key={item.label} className="mc-print-detail">
                          <p className="mc-print-detail-label">{item.label}</p>
                          <p>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {overviewInfoItems.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Show Info</h3>
                    <div className="mc-print-grid">
                      {overviewInfoItems.map((item) => (
                        <div key={item.label} className="mc-print-detail">
                          <p className="mc-print-detail-label">{item.label}</p>
                          <p className="whitespace-pre-wrap">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {performerPacketEntries.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Performers</h3>
                    <ul className="mc-print-list">
                      {performerPacketEntries.map((entry) => (
                        <li key={entry.performer}>
                          <span className="font-semibold">{entry.performer}</span>
                          {entry.section ? ` - ${entry.section}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {sponsorSummaryNames.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Sponsors</h3>
                    <ul className="mc-print-list">
                      {sponsorSummaryNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {overviewReminderItems.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>MC Reminders</h3>
                    <div className="mc-print-note-stack">
                      {overviewReminderItems.map((item) => (
                        <div key={item.label} className="mc-print-note-card">
                          <p className="mc-print-detail-label">{item.label}</p>
                          <p className="whitespace-pre-wrap">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!overviewScheduleItems.length &&
                !overviewInfoItems.length &&
                !performerPacketEntries.length &&
                !sponsorSummaryNames.length &&
                !overviewReminderItems.length ? (
                  <p className="mc-print-empty">No show overview details have been added yet.</p>
                ) : null}
              </section>
            </div>
          </section>

          {runSheetData.sectionItems.map((section) => (
            <section key={`print-${section.key}`} className="mc-print-page">
              <header className="mc-print-page-header">
                <p className="mc-print-kicker">{getSectionPacketSubtitle(section.key)}</p>
                <h1>{getSectionPacketTitle(section.key)}</h1>
                <p>{show.name}</p>
              </header>

              <div className="mc-print-stack">
                {section.key === "set1" && scriptFormState.openingScript.trim() ? (
                  <section className="mc-print-panel">
                    <div className="mc-print-panel-heading">
                      <h2>Opening Script</h2>
                    </div>
                    <p className="mc-print-script">{scriptFormState.openingScript.trim()}</p>
                  </section>
                ) : null}

                {section.key === "set2" && scriptFormState.intermissionScript.trim() ? (
                  <section className="mc-print-panel">
                    <div className="mc-print-panel-heading">
                      <h2>Welcome Back / Intermission Return</h2>
                    </div>
                    <p className="mc-print-script">{scriptFormState.intermissionScript.trim()}</p>
                  </section>
                ) : null}

                <section className="mc-print-panel">
                  <div className="mc-print-panel-heading">
                    <h2>{section.title} Run Sheet</h2>
                  </div>

                  <div className="mc-print-flow">
                    {section.items.map((item) => {
                      if (item.kind === "sponsor") {
                        return (
                          <article key={item.id} className="mc-print-flow-card mc-print-flow-card-sponsor">
                            <p className="mc-print-flow-type">Sponsor Read</p>
                            <h3>{item.sponsor.sponsor?.name ?? "Assigned sponsor"}</h3>
                            <p className="mc-print-flow-body whitespace-pre-wrap">
                              {getSponsorReadText(item.sponsor)}
                            </p>
                            {item.sponsor.custom_note?.trim() ? (
                              <p className="mc-print-flow-note">
                                MC note: {item.sponsor.custom_note.trim()}
                              </p>
                            ) : null}
                          </article>
                        );
                      }

                      const blockDraft = blockNoteDrafts[item.block.anchorSongId] ?? {
                        introNote: "",
                        sponsorMention: "",
                        transitionNote: "",
                      };
                      const guestIntroText = getGuestIntroText(item.block.guestProfile);

                      return (
                        <article key={item.id} className="mc-print-flow-card">
                          <div className="mc-print-song-list">
                            {item.block.songs.map((song) => (
                              <div key={song.id} className="mc-print-song-entry">
                                <h3 className="mc-print-song-line">
                                  {item.block.performer} - {song.title}
                                  {song.song_key ? ` (${song.song_key})` : ""}
                                </h3>
                                {song.notes?.trim() ? (
                                  <p className="mc-print-song-note whitespace-pre-wrap">
                                    {song.notes.trim()}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>

                          {item.upNext ? (
                            <p className="mc-print-flow-upnext">
                              Up next: {item.upNext.performer}
                            </p>
                          ) : null}

                          {blockDraft.introNote.trim() ? (
                            <p className="mc-print-flow-note whitespace-pre-wrap">
                              Intro: {blockDraft.introNote.trim()}
                            </p>
                          ) : null}

                          {guestIntroText ? (
                            <p className="mc-print-flow-note whitespace-pre-wrap">
                              Guest intro: {guestIntroText}
                            </p>
                          ) : null}

                          {blockDraft.sponsorMention.trim() ? (
                            <p className="mc-print-flow-note whitespace-pre-wrap">
                              Sponsor mention: {blockDraft.sponsorMention.trim()}
                            </p>
                          ) : null}

                          {blockDraft.transitionNote.trim() ? (
                            <p className="mc-print-flow-note whitespace-pre-wrap">
                              Transition: {blockDraft.transitionNote.trim()}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>

                {section.key === "set1" &&
                (runSheetData.beforeIntermission.length > 0 ||
                  scriptFormState.intermissionScript.trim()) ? (
                  <section className="mc-print-panel">
                    <div className="mc-print-panel-heading">
                      <h2>Intermission Setup</h2>
                    </div>

                    <div className="mc-print-note-stack">
                      {runSheetData.beforeIntermission.map((sponsor) => (
                        <div key={`before-int-${sponsor.id}`} className="mc-print-note-card mc-print-flow-card-sponsor">
                          <p className="mc-print-flow-type">Sponsor Read</p>
                          <h3>{sponsor.sponsor?.name ?? "Assigned sponsor"}</h3>
                          <p className="mc-print-flow-body whitespace-pre-wrap">
                            {getSponsorReadText(sponsor)}
                          </p>
                        </div>
                      ))}

                      {scriptFormState.intermissionScript.trim() ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Intermission Script</p>
                          <p className="whitespace-pre-wrap">
                            {scriptFormState.intermissionScript.trim()}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {section.key === "set2" &&
                (runSheetData.afterIntermission.length > 0 ||
                  runSheetData.closing.length > 0 ||
                  scriptFormState.closingScript.trim()) ? (
                  <section className="mc-print-panel">
                    <div className="mc-print-panel-heading">
                      <h2>Ending Notes</h2>
                    </div>

                    <div className="mc-print-note-stack">
                      {runSheetData.afterIntermission.map((sponsor) => (
                        <div key={`after-int-${sponsor.id}`} className="mc-print-note-card mc-print-flow-card-sponsor">
                          <p className="mc-print-flow-type">Sponsor Read</p>
                          <h3>{sponsor.sponsor?.name ?? "Assigned sponsor"}</h3>
                          <p className="mc-print-flow-body whitespace-pre-wrap">
                            {getSponsorReadText(sponsor)}
                          </p>
                        </div>
                      ))}

                      {runSheetData.closing.map((sponsor) => (
                        <div key={`closing-${sponsor.id}`} className="mc-print-note-card mc-print-flow-card-sponsor">
                          <p className="mc-print-flow-type">Closing Sponsor</p>
                          <h3>{sponsor.sponsor?.name ?? "Assigned sponsor"}</h3>
                          <p className="mc-print-flow-body whitespace-pre-wrap">
                            {getSponsorReadText(sponsor)}
                          </p>
                        </div>
                      ))}

                      {scriptFormState.closingScript.trim() ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Closing Script</p>
                          <p className="whitespace-pre-wrap">{scriptFormState.closingScript.trim()}</p>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
          ))}

          <section className="mc-print-page">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">Page 4</p>
              <h1>Sponsors</h1>
              <p>{show.name}</p>
            </header>

            <div className="mc-print-stack">
              {sponsorSummaryNames.length > 0 ? (
                <section className="mc-print-panel">
                  <div className="mc-print-panel-heading">
                    <h2>Sponsor Summary</h2>
                  </div>
                  <p className="mc-print-script">{sponsorSummaryNames.join(", ")}</p>
                </section>
              ) : null}

              <section className="mc-print-panel">
                <div className="mc-print-panel-heading">
                  <h2>Sponsor Reads</h2>
                </div>

                {sponsorPageEntries.length === 0 ? (
                  <p className="mc-print-empty">No sponsor reads have been assigned yet.</p>
                ) : (
                  <div className="mc-print-note-stack">
                    {sponsorPageEntries.map((sponsor) => (
                      <article key={sponsor.id} className="mc-print-note-card">
                        <h3>{sponsor.sponsor?.name ?? "Assigned sponsor"}</h3>
                        <p className="mc-print-script whitespace-pre-wrap">
                          {getSponsorReadText(sponsor)}
                        </p>
                        {sponsor.custom_note?.trim() ? (
                          <p className="mc-print-flow-note whitespace-pre-wrap">
                            MC note: {sponsor.custom_note.trim()}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>

          {performerPacketEntries.map((entry) => (
            <section key={`intro-${entry.performer}`} className="mc-print-page">
              <header className="mc-print-page-header">
                <p className="mc-print-kicker">Performer Intro</p>
                <h1>{entry.performer}</h1>
                <p>{show.name}</p>
              </header>

              <div className="mc-print-stack">
                <section className="mc-print-panel">
                  <div className="mc-print-panel-heading">
                    <h2>Intro Notes</h2>
                  </div>

                  <div className="mc-print-note-stack">
                    {entry.guestIntro ? (
                      <div className="mc-print-note-card">
                        <p className="mc-print-detail-label">Bio / Intro</p>
                        <p className="whitespace-pre-wrap">{entry.guestIntro}</p>
                      </div>
                    ) : null}

                    {entry.hometown ? (
                      <div className="mc-print-note-card">
                        <p className="mc-print-detail-label">Hometown</p>
                        <p>{entry.hometown}</p>
                      </div>
                    ) : null}

                    {entry.instruments ? (
                      <div className="mc-print-note-card">
                        <p className="mc-print-detail-label">Instruments</p>
                        <p>{entry.instruments}</p>
                      </div>
                    ) : null}

                    {entry.note?.intro_note?.trim() ? (
                      <div className="mc-print-note-card">
                        <p className="mc-print-detail-label">MC Intro Note</p>
                        <p className="whitespace-pre-wrap">{entry.note.intro_note.trim()}</p>
                      </div>
                    ) : null}

                    {entry.note?.transition_note?.trim() ? (
                      <div className="mc-print-note-card">
                        <p className="mc-print-detail-label">Transition Note</p>
                        <p className="whitespace-pre-wrap">{entry.note.transition_note.trim()}</p>
                      </div>
                    ) : null}

                    {!entry.guestIntro &&
                    !entry.hometown &&
                    !entry.instruments &&
                    !entry.note?.intro_note?.trim() &&
                    !entry.note?.transition_note?.trim() ? (
                      <p className="mc-print-empty">No intro notes have been added for this performer yet.</p>
                    ) : null}
                  </div>
                </section>

                <section className="mc-print-panel">
                  <div className="mc-print-panel-heading">
                    <h2>Scheduled Songs</h2>
                  </div>
                  <p className="mc-print-script">{entry.songs || "No songs listed yet."}</p>
                </section>
              </div>
            </section>
          ))}

          <section className="mc-print-page">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">Final Page</p>
              <h1>MC Scripts</h1>
              <p>{show.name}</p>
            </header>

            <div className="mc-print-stack">
              <section className="mc-print-panel">
                <div className="mc-print-panel-heading">
                  <h2>Opening Welcome</h2>
                </div>
                <p className="mc-print-script">
                  {scriptFormState.openingScript.trim() || "No opening script added yet."}
                </p>
              </section>

              <section className="mc-print-panel">
                <div className="mc-print-panel-heading">
                  <h2>After Intermission / Welcome Back</h2>
                </div>
                <p className="mc-print-script">
                  {scriptFormState.intermissionScript.trim() || "No intermission script added yet."}
                </p>
              </section>

              <section className="mc-print-panel">
                <div className="mc-print-panel-heading">
                  <h2>Closing Script</h2>
                </div>
                <p className="mc-print-script">
                  {scriptFormState.closingScript.trim() || "No closing script added yet."}
                </p>
              </section>
            </div>
          </section>
        </div>

        <style jsx>{`
          @media print {
            .mc-print-packet {
              display: block;
            }

            .mc-print-page {
              break-before: page;
              page-break-before: always;
              padding: 0;
            }

            .mc-print-page:first-child {
              break-before: auto;
              page-break-before: auto;
            }

            .mc-print-page-header {
              border-bottom: 2px solid #111827;
              margin-bottom: 20px;
              padding-bottom: 14px;
            }

            .mc-print-kicker {
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.22em;
              margin: 0 0 8px;
              text-transform: uppercase;
            }

            .mc-print-page-header h1 {
              font-size: 28px;
              font-weight: 700;
              line-height: 1.2;
              margin: 0;
            }

            .mc-print-page-header p {
              font-size: 13px;
              margin: 6px 0 0;
            }

            .mc-print-stack {
              display: flex;
              flex-direction: column;
              gap: 14px;
            }

            .mc-print-panel,
            .mc-print-note-card,
            .mc-print-flow-card {
              background: #fff;
              border: 1px solid #d6d3d1;
              border-radius: 0;
              color: #111827;
            }

            .mc-print-panel {
              padding: 14px 16px;
            }

            .mc-print-panel-heading {
              margin-bottom: 10px;
            }

            .mc-print-panel-heading h2 {
              font-size: 20px;
              font-weight: 700;
              margin: 0;
            }

            .mc-print-eyebrow,
            .mc-print-detail-label,
            .mc-print-flow-type {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.16em;
              text-transform: uppercase;
            }

            .mc-print-subsection + .mc-print-subsection {
              margin-top: 18px;
              padding-top: 16px;
              border-top: 1px solid #d6d3d1;
            }

            .mc-print-subsection h3,
            .mc-print-note-card h3,
            .mc-print-flow-card h3 {
              font-size: 15px;
              font-weight: 700;
              margin: 0 0 8px;
            }

            .mc-print-grid {
              display: grid;
              gap: 12px;
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .mc-print-detail p:last-child,
            .mc-print-note-card p:last-child {
              margin: 4px 0 0;
            }

            .mc-print-list {
              margin: 0;
              padding-left: 18px;
            }

            .mc-print-list li + li {
              margin-top: 6px;
            }

            .mc-print-note-stack,
            .mc-print-flow {
              display: flex;
              flex-direction: column;
              gap: 9px;
            }

            .mc-print-note-card,
            .mc-print-flow-card {
              padding: 10px 12px;
            }

            .mc-print-flow-card-sponsor {
              border-left: 5px solid #92400e;
            }

            .mc-print-song-list {
              display: flex;
              flex-direction: column;
              gap: 5px;
            }

            .mc-print-song-entry {
              display: flex;
              flex-direction: column;
              gap: 1px;
            }

            .mc-print-song-line {
              font-size: 15px;
              font-weight: 700;
              line-height: 1.35;
              margin: 0;
            }

            .mc-print-song-note {
              font-size: 11px;
              line-height: 1.35;
              margin: 0;
              padding-left: 10px;
            }

            .mc-print-flow-body,
            .mc-print-script {
              font-size: 13px;
              line-height: 1.5;
              margin: 0;
              white-space: pre-wrap;
            }

            .mc-print-flow-note,
            .mc-print-flow-upnext {
              font-size: 12px;
              line-height: 1.45;
              margin: 4px 0 0;
            }

            .mc-print-flow-upnext {
              font-weight: 700;
            }

            .mc-print-empty {
              font-size: 13px;
              margin: 0;
            }
          }
        `}</style>
      </section>
    </main>
  );
}
