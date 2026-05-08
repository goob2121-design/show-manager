"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import type {
  GuestProfile,
  McBlockNote,
  SetSection,
  SetlistEntry,
  ShowGuestSong,
  ShowRecord,
  ShowSponsor,
  SongRecord,
} from "@/lib/types";

type SetlistSong = SetlistEntry & {
  set_section: SetSection;
  source_role: string | null;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
};

type SetlistEntryRow = SetlistEntry & {
  library_song?: SongRecord | SongRecord[] | null;
  guest_song?: ShowGuestSong | ShowGuestSong[] | null;
};

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
  initialSetlist: SetlistEntryRow[];
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

type McFlowSongBase = {
  id: string;
  section: SetSection;
  position: number;
  title: string;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
};

export type McFlowRenderableItem<TSong extends McFlowSongBase = McFlowSongBase> =
  | {
      kind: "song";
      id: string;
      song: TSong;
    }
  | {
      kind: "sponsor";
      id: string;
      sponsor: ShowSponsor;
    }
  | {
      kind: "marker";
      id: string;
      marker: "before-intermission" | "after-intermission" | "closing" | "flexible";
    };

const setSectionOrder: SetSection[] = ["set1", "set2", "encore"];
const setSectionTitles: Record<SetSection, string> = {
  set1: "Set 1",
  set2: "Set 2",
  encore: "Encore",
};
const defaultSingerName = "CMMS Band";
const MP3_PATH_MARKER_PATTERN = /\[\[MP3_PATH:([^\]]+)\]\]/g;

function normalizeSetSection(value: string | null | undefined): SetSection {
  if (value === "set2" || value === "encore") {
    return value;
  }

  return "set1";
}

function stripMp3MarkerFromNotes(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  const cleanedNotes = notes.replace(MP3_PATH_MARKER_PATTERN, "").trim();
  return cleanedNotes || null;
}

function normalizeSetlistSong(song: SetlistEntryRow | SetlistSong): SetlistSong {
  const librarySong = "library_song" in song
    ? Array.isArray(song.library_song)
      ? song.library_song[0]
      : song.library_song
    : null;
  const guestSong = "guest_song" in song
    ? Array.isArray(song.guest_song)
      ? song.guest_song[0]
      : song.guest_song
    : null;
  const resolvedKey = librarySong?.key ?? guestSong?.key ?? song.key ?? null;
  const resolvedNotes = stripMp3MarkerFromNotes(librarySong?.notes ?? song.notes ?? null);
  const resolvedPerformer =
    guestSong?.submitted_by_name?.trim() ||
    ("performer_name" in song ? song.performer_name : null) ||
    defaultSingerName;

  return {
    ...song,
    section: normalizeSetSection(song.section),
    set_section: normalizeSetSection(song.section),
    title: song.custom_title?.trim() || librarySong?.title || guestSong?.title || song.title,
    key: resolvedKey,
    performer_name: resolvedPerformer,
    source_role: song.source_type === "guest" ? "guest" : "band",
    artist: resolvedPerformer,
    song_key: resolvedKey,
    notes: resolvedNotes,
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

function normalizeMcPlacementName(value: string | null | undefined) {
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

function getSponsorInitials(name: string | null | undefined) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "NL";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function SponsorLogoThumbnail({
  logoUrl,
  sponsorName,
}: {
  logoUrl: string | null | undefined;
  sponsorName: string;
}) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-200 bg-white/80 p-2 text-amber-900 dark:border-amber-700 dark:bg-slate-900/80 dark:text-amber-100">
      {logoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={`${sponsorName} logo`}
            className="h-full w-full object-contain"
          />
        </>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">
          {getSponsorInitials(sponsorName)}
        </span>
      )}
    </div>
  );
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

function findSetlistSongIndexByAnchorSongId<TSong extends McFlowSongBase>(
  songs: TSong[],
  anchorSongId: string | null,
) {
  if (!anchorSongId) {
    return null;
  }

  const matchIndex = songs.findIndex((song) => song.id === anchorSongId);
  return matchIndex >= 0 ? matchIndex : null;
}

function findMatchingSetlistSongIndex<TSong extends McFlowSongBase>(
  songs: TSong[],
  linkedPerformer: string | null,
  fallbackIndex: number,
) {
  if (songs.length === 0) {
    return null;
  }

  const normalizedPerformer = normalizeMcPlacementName(linkedPerformer);

  if (!normalizedPerformer) {
    return fallbackIndex;
  }

  const exactMatchIndex = songs.findIndex(
    (song) => normalizeMcPlacementName(song.artist) === normalizedPerformer,
  );

  if (exactMatchIndex >= 0) {
    return exactMatchIndex;
  }

  const partialMatchIndex = songs.findIndex((song) => {
    const normalizedSongPerformer = normalizeMcPlacementName(song.artist);

    return (
      normalizedSongPerformer.includes(normalizedPerformer) ||
      normalizedPerformer.includes(normalizedSongPerformer)
    );
  });

  if (partialMatchIndex >= 0) {
    return partialMatchIndex;
  }

  return fallbackIndex;
}

export function buildMcFlowItems<TSong extends McFlowSongBase>(
  setlist: TSong[],
  sponsors: ShowSponsor[],
): McFlowRenderableItem<TSong>[] {
  const orderedSongs = [...setlist].sort((songA, songB) => {
    const sectionDifference =
      setSectionOrder.indexOf(songA.section) - setSectionOrder.indexOf(songB.section);

    if (sectionDifference !== 0) {
      return sectionDifference;
    }

    if (songA.position !== songB.position) {
      return songA.position - songB.position;
    }

    return songA.id.localeCompare(songB.id);
  });
  const orderedSponsors = sortSponsors(sponsors);
  const beforeBySongId: Record<string, ShowSponsor[]> = {};
  const afterBySongId: Record<string, ShowSponsor[]> = {};
  const beforeIntermission: ShowSponsor[] = [];
  const afterIntermission: ShowSponsor[] = [];
  const closing: ShowSponsor[] = [];
  const flexible: ShowSponsor[] = [];

  function appendSponsor(
    lookup: Record<string, ShowSponsor[]>,
    songId: string,
    sponsor: ShowSponsor,
  ) {
    if (!lookup[songId]) {
      lookup[songId] = [];
    }

    lookup[songId].push(sponsor);
  }

  orderedSponsors.forEach((sponsor) => {
    const placementType = sponsor.placement_type;

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
        findSetlistSongIndexByAnchorSongId(orderedSongs, sponsor.mc_anchor_song_id) ??
        findMatchingSetlistSongIndex(orderedSongs, sponsor.linked_performer, 0);

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(beforeBySongId, orderedSongs[targetIndex].id, sponsor);
      return;
    }

    if (placementType === "after_performer") {
      const targetIndex =
        findSetlistSongIndexByAnchorSongId(orderedSongs, sponsor.mc_anchor_song_id) ??
        findMatchingSetlistSongIndex(
          orderedSongs,
          sponsor.linked_performer,
          Math.max(orderedSongs.length - 1, 0),
        );

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(afterBySongId, orderedSongs[targetIndex].id, sponsor);
      return;
    }

    flexible.push(sponsor);
  });

  const items: McFlowRenderableItem<TSong>[] = [];
  const set1Songs = orderedSongs.filter((song) => song.section === "set1");
  const set2Songs = orderedSongs.filter((song) => song.section === "set2");
  const encoreSongs = orderedSongs.filter((song) => song.section === "encore");

  function appendSongsWithSponsors(songs: TSong[]) {
    songs.forEach((song) => {
      (beforeBySongId[song.id] ?? []).forEach((sponsor) => {
        items.push({
          kind: "sponsor",
          id: `before-song-${song.id}-${sponsor.id}`,
          sponsor,
        });
      });

      items.push({
        kind: "song",
        id: song.id,
        song,
      });

      (afterBySongId[song.id] ?? []).forEach((sponsor) => {
        items.push({
          kind: "sponsor",
          id: `after-song-${song.id}-${sponsor.id}`,
          sponsor,
        });
      });
    });
  }

  appendSongsWithSponsors(set1Songs);

  if (beforeIntermission.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-before-intermission",
      marker: "before-intermission",
    });
    beforeIntermission.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `before-intermission-${sponsor.id}`,
        sponsor,
      });
    });
  }

  if (afterIntermission.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-after-intermission",
      marker: "after-intermission",
    });
    afterIntermission.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `after-intermission-${sponsor.id}`,
        sponsor,
      });
    });
  }

  appendSongsWithSponsors(set2Songs);
  appendSongsWithSponsors(encoreSongs);

  if (closing.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-closing",
      marker: "closing",
    });
    closing.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `closing-${sponsor.id}`,
        sponsor,
      });
    });
  }

  if (flexible.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-flexible",
      marker: "flexible",
    });
    flexible.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `flexible-${sponsor.id}`,
        sponsor,
      });
    });
  }

  return items;
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
        const performer = song.artist?.trim() || defaultSingerName;
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
            Sponsor Read
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
            {formatSponsorPlacementType(sponsor.placement_type)}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <SponsorLogoThumbnail
            logoUrl={sponsor.sponsor?.logo_url}
            sponsorName={sponsor.sponsor?.name ?? "Assigned sponsor"}
          />

          <div className="min-w-0 flex-1">
            <h4 className="text-lg font-semibold text-stone-900">
              {sponsor.sponsor?.name ?? "Assigned sponsor"}
            </h4>
            {sponsor.linked_performer ? (
              <p className="mt-1 text-sm text-stone-600">
                Performer link: {sponsor.linked_performer}
              </p>
            ) : null}
          </div>
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

        <div className="grid gap-2">
          {block.songs.map((song, index) => (
            <div key={song.id} className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <p className="text-sm font-semibold text-stone-900">
                {index + 1}. {song.title}
                {song.song_key ? ` (${song.song_key})` : ""}
              </p>
              {song.notes?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
                  {song.notes.trim()}
                </p>
              ) : null}
            </div>
          ))}
        </div>

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
  const mcFlowItems = useMemo(() => buildMcFlowItems(setlist, sponsors), [setlist, sponsors]);
  const mcBlockLookup = useMemo(
    () =>
      runSections.reduce<Record<string, McPerformanceBlock>>((lookup, section) => {
        section.blocks.forEach((block) => {
          lookup[block.anchorSongId] = block;
        });

        return lookup;
      }, {}),
    [runSections],
  );

  function handlePrintPacket() {
    window.print();
  }

  const showAnnouncements = getTrimmedValue(show?.announcements);

  const showOverviewItems = [
    { label: "Show Date", value: formatShowDate(show?.show_date ?? null) },
    { label: "Venue", value: show?.venue ?? "" },
    { label: "Show Start", value: show?.show_start_time ?? "" },
    { label: "Call Time", value: show?.call_time ?? "" },
    { label: "Band Arrival", value: show?.band_arrival_time ?? "" },
    { label: "Guest Arrival", value: show?.guest_arrival_time ?? "" },
    { label: "Contact", value: show?.contact_name ?? "" },
    { label: "Phone", value: show?.contact_phone ?? "" },
  ].filter((item) => item.value.trim());

  const hasIntermissionSection =
    Boolean(scriptFormState.intermissionScript.trim()) ||
    runSheetData.beforeIntermission.length > 0 ||
    runSheetData.afterIntermission.length > 0 ||
    runSections.some((section) => section.key === "set2" || section.key === "encore");


  const sponsorSummaryNames = sponsors
    .map((sponsor) => sponsor.sponsor?.name?.trim() ?? "")
    .filter(Boolean);
  const sponsorPageEntries = sponsors.filter(
    (sponsor, index, allSponsors) =>
      allSponsors.findIndex((candidate) => candidate.id === sponsor.id) === index,
  );
  const performerListEntries = useMemo(() => {
    const entries = runSections.flatMap((section) =>
      section.blocks.map((block) => ({
        performer: block.performer,
        section: section.title,
      })),
    );

    return entries.filter(
      (entry, index, allEntries) =>
        allEntries.findIndex((candidate) => candidate.performer === entry.performer) === index,
    );
  }, [runSections]);
  const guestInfoEntries = useMemo(
    () =>
      guestProfiles
        .filter((profile) => Boolean(profile.name?.trim()))
        .map((profile) => {
          const performerName = profile.name?.trim() ?? "Guest";
          const submittedSongs = setlist
            .filter((song) => normalizeName(song.artist) === normalizeName(performerName))
            .map((song) => song.title)
            .filter(Boolean);

          return {
            id: profile.id,
            performer: performerName,
            guestIntro: getGuestIntroText(profile),
            hometown: getTrimmedValue(profile.hometown),
            instruments: getTrimmedValue(profile.instruments),
            photoUrl: getTrimmedValue(profile.photo_url),
            facebook: getTrimmedValue(profile.facebook),
            instagram: getTrimmedValue(profile.instagram),
            website: getTrimmedValue(profile.website),
            agreedFee: getTrimmedValue(profile.agreed_fee),
            plannedSongCount: profile.planned_song_count ?? null,
            backupSongCount: profile.backup_song_count ?? null,
            appearanceNotes: getTrimmedValue(profile.appearance_notes),
            note: null,
            songs: submittedSongs.join(", "),
          };
        }),
    [guestProfiles, setlist],
  );
  const mcFlowGroups = useMemo(() => {
    const groups: Record<
      "set1" | "intermission" | "set2" | "encore" | "closing",
      McFlowRenderableItem<SetlistSong>[]
    > = {
      set1: [],
      intermission: [],
      set2: [],
      encore: [],
      closing: [],
    };

    let activeGroup: keyof typeof groups = "set1";

    mcFlowItems.forEach((item) => {
      if (item.kind === "marker") {
        if (item.marker === "before-intermission" || item.marker === "after-intermission") {
          activeGroup = "intermission";
          groups.intermission.push(item);
          return;
        }

        activeGroup = "closing";
        groups.closing.push(item);
        return;
      }

      if (item.kind === "song") {
        activeGroup =
          item.song.section === "set2"
            ? "set2"
            : item.song.section === "encore"
              ? "encore"
              : "set1";
        groups[activeGroup].push(item);
        return;
      }

      groups[activeGroup].push(item);
    });

    return groups;
  }, [mcFlowItems]);

  function renderSongFlowCard(song: SetlistSong, printMode = false) {
    const mcBlock = mcBlockLookup[song.id] ?? null;
    const blockDraft = mcBlock
      ? blockNoteDrafts[mcBlock.anchorSongId] ?? {
          introNote: "",
          sponsorMention: "",
          transitionNote: "",
        }
      : null;
    const guestIntroText = mcBlock ? getGuestIntroText(mcBlock.guestProfile) : null;

    return (
      <article
        key={song.id}
        className={
          printMode
            ? "mc-print-flow-card mc-print-flow-card-compact"
            : "rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
        }
      >
        <div className={printMode ? "grid gap-2" : "grid gap-3"}>
          <h3 className={printMode ? "mc-print-song-line" : "text-lg font-semibold text-stone-900"}>
            {song.title} - {song.artist || defaultSingerName}
            {song.song_key ? ` (${song.song_key})` : ""}
          </h3>

          {blockDraft?.introNote.trim() ? (
            <p className={printMode ? "mc-print-flow-note whitespace-pre-wrap" : "whitespace-pre-wrap text-sm text-stone-700"}>
              Intro: {blockDraft.introNote.trim()}
            </p>
          ) : null}

          {guestIntroText ? (
            <p className={printMode ? "mc-print-flow-note whitespace-pre-wrap" : "whitespace-pre-wrap text-sm text-stone-700"}>
              Guest intro: {guestIntroText}
            </p>
          ) : null}

          {blockDraft?.sponsorMention.trim() ? (
            <p className={printMode ? "mc-print-flow-note whitespace-pre-wrap" : "whitespace-pre-wrap text-sm text-stone-700"}>
              Sponsor mention: {blockDraft.sponsorMention.trim()}
            </p>
          ) : null}

          {blockDraft?.transitionNote.trim() ? (
            <p className={printMode ? "mc-print-flow-note whitespace-pre-wrap" : "whitespace-pre-wrap text-sm text-stone-700"}>
              Transition: {blockDraft.transitionNote.trim()}
            </p>
          ) : null}
        </div>
      </article>
    );
  }

  function renderFlowItems(
    items: McFlowRenderableItem<SetlistSong>[],
    options?: { printMode?: boolean; numberSongs?: boolean },
  ) {
    const printMode = options?.printMode ?? false;
    const numberSongs = options?.numberSongs ?? false;
    let songNumber = 0;

    return items
      .filter((item) => item.kind !== "marker")
      .map((item) => {
        if (item.kind === "sponsor") {
          return printMode ? (
            <div
              key={item.id}
              className="border-t border-stone-400 pt-3 first:border-t-0 first:pt-0"
            >
              <article className="mc-print-flow-card mc-print-flow-card-sponsor mc-print-flow-card-compact">
                <p className="mc-print-flow-type">Sponsor Read</p>
                <h3>{item.sponsor.sponsor?.name ?? "Assigned sponsor"}</h3>
                <p className="mc-print-flow-note">See Sponsor Reads</p>
              </article>
            </div>
          ) : (
            <div
              key={item.id}
              className="border-t border-stone-200 pt-4 first:border-t-0 first:pt-0"
            >
              <article className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                    Sponsor Read
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">
                    {item.sponsor.sponsor?.name ?? "Assigned sponsor"}
                  </h3>
                  <p className="text-sm text-stone-700">See Sponsor Reads</p>
                </div>
              </article>
            </div>
          );
        }

        songNumber += 1;
        return (
          <div
            key={item.id}
            className={
              printMode
                ? "border-t border-stone-400 pt-3 first:border-t-0 first:pt-0"
                : "border-t border-stone-200 pt-4 first:border-t-0 first:pt-0"
            }
          >
            {renderSongFlowCard(
              {
                ...item.song,
                title: `${numberSongs ? `${songNumber}. ` : ""}${item.song.title}`,
              },
              printMode,
            )}
          </div>
        );
      });
  }

  if (process.env.NODE_ENV !== "production") {
    const debugFlow = mcFlowItems.map((item) =>
      item.kind === "song"
        ? {
            kind: "song",
            id: item.song.id,
            section: item.song.section,
            title: item.song.title,
            performer: item.song.artist,
          }
        : item.kind === "sponsor"
          ? {
              kind: "sponsor",
              sponsorId: item.sponsor.id,
              sponsor: item.sponsor.sponsor?.name ?? "Assigned sponsor",
              placementType: item.sponsor.placement_type,
              anchorSongId: item.sponsor.mc_anchor_song_id ?? null,
            }
          : {
              kind: "marker",
              marker: item.marker,
            },
    );

    console.log("MC Builder ordered flow", debugFlow);
    console.log("MC Readonly ordered flow", debugFlow);
    console.log("Print MC Packet ordered flow", debugFlow);
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-7xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-rose-700">The MC portal could not be loaded.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 print-shell">
        <AdminQuickNav slug={showSlug} currentView="mc" />

        <header className="print-hidden flex flex-col gap-4 border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-3">
              {showLogo ? (
                <div className="w-fit">
                  <Image
                    src="/stageflow-logo-v2.png"
                    alt="StageFlow logo"
                    width={420}
                    height={210}
                    priority
                    className="h-auto w-full max-w-[88vw] object-contain sm:max-w-[300px] lg:max-w-[340px]"
                    onError={() => setShowLogo(false)}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  StageFlow
                </p>
                <p className="text-xs font-medium text-stone-500">
                  by Pinnacle Recording Studio
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

        {showAnnouncements ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Announcements</h2>
              <p className="text-sm text-stone-600">
                Show detail announcements for the MC and production team.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <p className="whitespace-pre-wrap text-sm text-stone-700">{showAnnouncements}</p>
            </div>
          </section>
        ) : null}

        {sponsorSummaryNames.length > 0 ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Sponsor Summary</h2>
              <p className="text-sm text-stone-600">
                Quick sponsor roster for the packet front page and at-a-glance reference.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <ul className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
                {sponsorSummaryNames.map((name) => (
                  <li key={name} className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {performerListEntries.length > 0 ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Performers</h2>
              <p className="text-sm text-stone-600">
                Ordered performer list pulled directly from the current MC run sections.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <ul className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
                {performerListEntries.map((entry) => (
                  <li
                    key={entry.performer}
                    className="rounded-xl border border-stone-200 bg-white px-3 py-3"
                  >
                    <span className="font-semibold">{entry.performer}</span>
                    <span className="text-stone-500"> - {entry.section}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          ) : null}

        <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Opening Script</h2>
            <p className="text-sm text-stone-600">
              Opening welcome used before the first run sheet section begins.
            </p>
          </div>

          <ScriptCard title="Opening Script" text={scriptFormState.openingScript} />
        </section>

        {mcFlowGroups.set1.length > 0 ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Live Run Sheet</h2>
              <p className="text-sm text-stone-600">
                Set 1 / First Half flow with songs numbered and sponsor reads in placed order.
              </p>
            </div>

            <section className="mc-run-section flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">Set 1 / First Half</h3>
              </div>
              <div className="grid gap-4">{renderFlowItems(mcFlowGroups.set1, { numberSongs: true })}</div>
            </section>
          </section>
        ) : null}

        <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Intermission Script</h2>
            <p className="text-sm text-stone-600">
              Welcome-back script used during the intermission return.
            </p>
          </div>

          <ScriptCard title="Intermission Script" text={scriptFormState.intermissionScript} />
        </section>

        {mcFlowGroups.set2.length > 0 ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Live Run Sheet</h2>
              <p className="text-sm text-stone-600">
                Set 2 / Second Half flow with songs numbered and sponsor reads in placed order.
              </p>
            </div>

            <section className="mc-run-section flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">Set 2 / Second Half</h3>
              </div>
              <div className="grid gap-4">{renderFlowItems(mcFlowGroups.set2, { numberSongs: true })}</div>
            </section>

            {mcFlowGroups.encore.length > 0 ? (
              <section className="mc-run-section flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Encore</h3>
                </div>
                <div className="grid gap-4">{renderFlowItems(mcFlowGroups.encore, { numberSongs: true })}</div>
              </section>
            ) : null}
          </section>
        ) : null}

        <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Closing Script</h2>
            <p className="text-sm text-stone-600">
              Final sign-off script for the end of the show.
            </p>
          </div>

          <ScriptCard title="Closing Script" text={scriptFormState.closingScript} />
        </section>

        {sponsorPageEntries.length > 0 ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Sponsor Reads</h2>
              <p className="text-sm text-stone-600">
                Full sponsor reads and notes for backup reference during the show.
              </p>
            </div>

            {sponsorPageEntries.length > 0 ? (
              <div className="grid gap-4">
                {sponsorPageEntries.map((sponsor) => (
                  <SponsorReadCard key={`screen-sponsor-${sponsor.id}`} sponsor={sponsor} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {guestInfoEntries.length > 0 ? (
          <section className="print-hidden mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Guest / Performer Info</h2>
              <p className="text-sm text-stone-600">
                Bio and performer notes available to support intros and transitions.
              </p>
            </div>

            <div className="grid gap-4">
              {guestInfoEntries.map((entry) => (
                <article
                  key={`screen-bio-${entry.performer}`}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                >
                  <h3 className="text-lg font-semibold text-stone-900">{entry.performer}</h3>
                  <div className="mt-3 grid gap-3">
                    {entry.photoUrl ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={entry.photoUrl}
                          alt={`${entry.performer} profile`}
                          className="h-auto max-h-40 w-auto rounded-lg object-contain"
                        />
                      </div>
                    ) : null}

                    {entry.guestIntro ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Bio / Intro
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                          {entry.guestIntro}
                        </p>
                      </div>
                    ) : null}

                    {entry.hometown ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Hometown
                        </p>
                        <p className="mt-2 text-sm text-stone-700">{entry.hometown}</p>
                      </div>
                    ) : null}

                    {entry.instruments ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Instruments
                        </p>
                        <p className="mt-2 text-sm text-stone-700">{entry.instruments}</p>
                      </div>
                    ) : null}

                    {entry.website ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Website
                        </p>
                        <p className="mt-2 text-sm text-stone-700 break-all">{entry.website}</p>
                      </div>
                    ) : null}

                    {entry.facebook ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Facebook
                        </p>
                        <p className="mt-2 text-sm text-stone-700 break-all">{entry.facebook}</p>
                      </div>
                    ) : null}

                    {entry.instagram ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Instagram
                        </p>
                        <p className="mt-2 text-sm text-stone-700 break-all">{entry.instagram}</p>
                      </div>
                    ) : null}

                    {entry.plannedSongCount ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Planned Songs
                        </p>
                        <p className="mt-2 text-sm text-stone-700">{entry.plannedSongCount}</p>
                      </div>
                    ) : null}

                    {entry.backupSongCount ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Backup Songs
                        </p>
                        <p className="mt-2 text-sm text-stone-700">{entry.backupSongCount}</p>
                      </div>
                    ) : null}

                    {entry.appearanceNotes ? (
                      <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Appearance Details
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                          {entry.appearanceNotes}
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Submitted / Scheduled Songs
                      </p>
                      <p className="mt-2 text-sm text-stone-700">{entry.songs || "No songs listed yet."}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="print-only mc-print-packet">
          <section className="mc-print-page mc-print-page-forced">
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

                {showOverviewItems.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Show Overview</h3>
                    <div className="mc-print-grid">
                      {showOverviewItems.map((item) => (
                        <div key={item.label} className="mc-print-detail">
                          <p className="mc-print-detail-label">{item.label}</p>
                          <p>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showAnnouncements ? (
                  <div className="mc-print-subsection">
                    <h3>Announcements</h3>
                    <p className="mc-print-script">{showAnnouncements}</p>
                  </div>
                ) : null}

                {sponsorSummaryNames.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Sponsor Summary</h3>
                    <p className="mc-print-script">{sponsorSummaryNames.join(", ")}</p>
                  </div>
                ) : null}

                {performerListEntries.length > 0 ? (
                  <div className="mc-print-subsection">
                    <h3>Performers</h3>
                    <ul className="mc-print-list">
                      {performerListEntries.map((entry) => (
                        <li key={entry.performer}>
                          <span className="font-semibold">{entry.performer}</span>
                          {entry.section ? ` - ${entry.section}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!showOverviewItems.length &&
                !performerListEntries.length &&
                !sponsorSummaryNames.length &&
                !showAnnouncements ? (
                  <p className="mc-print-empty">No show overview details have been added yet.</p>
                ) : null}
              </section>
            </div>
          </section>

          <section className="mc-print-page mc-print-page-forced">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">Scripts</p>
              <h1>Opening Script</h1>
              <p>{show.name}</p>
            </header>

            <div className="mc-print-stack">
              <section className="mc-print-panel">
                <p className="mc-print-script">
                  {scriptFormState.openingScript.trim() || "No opening script added yet."}
                </p>
              </section>
            </div>
          </section>

          {mcFlowGroups.set1.length > 0 ? (
            <section className="mc-print-page mc-print-page-set">
              <header className="mc-print-page-header">
                <p className="mc-print-kicker">Live Run Sheet</p>
                <h1>Set 1 / First Half</h1>
                <p>{show.name}</p>
              </header>
              <div className="mc-print-stack">
                <section className="mc-print-panel mc-print-set-panel">
                  <div className="mc-print-flow mc-print-set-flow">
                    {renderFlowItems(mcFlowGroups.set1, { printMode: true, numberSongs: true })}
                  </div>
                </section>
              </div>
            </section>
          ) : null}

          <section className="mc-print-page mc-print-page-forced">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">Scripts</p>
              <h1>Intermission Script</h1>
              <p>{show.name}</p>
            </header>
            <div className="mc-print-stack">
              <section className="mc-print-panel">
                <p className="mc-print-script">
                  {scriptFormState.intermissionScript.trim() || "No intermission script added yet."}
                </p>
              </section>
            </div>
          </section>

          {mcFlowGroups.set2.length > 0 ? (
            <section className="mc-print-page mc-print-page-set">
              <header className="mc-print-page-header">
                <p className="mc-print-kicker">Live Run Sheet</p>
                <h1>Set 2 / Second Half</h1>
                <p>{show.name}</p>
              </header>
              <div className="mc-print-stack">
                <section className="mc-print-panel mc-print-set-panel">
                  <div className="mc-print-flow mc-print-set-flow">
                    {renderFlowItems(mcFlowGroups.set2, { printMode: true, numberSongs: true })}
                  </div>
                </section>
              </div>
            </section>
          ) : null}

          <section className="mc-print-page mc-print-page-forced">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">Scripts</p>
              <h1>Closing Script</h1>
              <p>{show.name}</p>
            </header>

            <div className="mc-print-stack">
              <section className="mc-print-panel">
                <p className="mc-print-script">
                  {scriptFormState.closingScript.trim() || "No closing script added yet."}
                </p>
              </section>
            </div>
          </section>

          <section className="mc-print-page mc-print-page-forced">
            <header className="mc-print-page-header">
              <p className="mc-print-kicker">Sponsors</p>
              <h1>Sponsor Reads / Sponsor Full Info</h1>
              <p>{show.name}</p>
            </header>

            <div className="mc-print-stack">
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

          {guestInfoEntries.length > 0 ? (
            <section className="mc-print-page mc-print-page-forced">
              <header className="mc-print-page-header">
                <p className="mc-print-kicker">Performers</p>
                <h1>Guest / Performer Profiles</h1>
                <p>{show.name}</p>
              </header>

              <div className="mc-print-stack mc-print-intro-stack">
                {guestInfoEntries.map((entry) => (
                  <section key={`intro-${entry.performer}`} className="mc-print-panel mc-print-intro-panel">
                    <div className="mc-print-panel-heading">
                      <h2>{entry.performer}</h2>
                    </div>

                    <div className="mc-print-note-stack mc-print-intro-notes">
                      {entry.photoUrl ? (
                        <div className="mc-print-note-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={entry.photoUrl}
                            alt={`${entry.performer} profile`}
                            className="h-auto max-h-40 w-auto object-contain"
                          />
                        </div>
                      ) : null}

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

                      {entry.website ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Website</p>
                          <p>{entry.website}</p>
                        </div>
                      ) : null}

                      {entry.facebook ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Facebook</p>
                          <p>{entry.facebook}</p>
                        </div>
                      ) : null}

                      {entry.instagram ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Instagram</p>
                          <p>{entry.instagram}</p>
                        </div>
                      ) : null}

                      {entry.plannedSongCount ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Planned Songs</p>
                          <p>{entry.plannedSongCount}</p>
                        </div>
                      ) : null}

                      {entry.backupSongCount ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Backup Songs</p>
                          <p>{entry.backupSongCount}</p>
                        </div>
                      ) : null}

                      {entry.appearanceNotes ? (
                        <div className="mc-print-note-card">
                          <p className="mc-print-detail-label">Appearance Details</p>
                          <p className="whitespace-pre-wrap">{entry.appearanceNotes}</p>
                        </div>
                      ) : null}

                      <div className="mc-print-note-card">
                        <p className="mc-print-detail-label">Submitted / Scheduled Songs</p>
                        <p>{entry.songs || "No songs listed yet."}</p>
                      </div>

                      {!entry.guestIntro &&
                      !entry.hometown &&
                      !entry.instruments &&
                      !entry.website &&
                      !entry.facebook &&
                      !entry.instagram &&
                      !entry.appearanceNotes &&
                      !entry.songs ? (
                        <p className="mc-print-empty">No intro notes have been added for this performer yet.</p>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ) : null}

        </div>

        <style jsx>{`
          @media print {
            .mc-print-packet {
              display: block;
            }

            .mc-print-page {
              padding: 0;
            }

            .mc-print-page-forced,
            .mc-print-page-set {
              break-before: page;
              page-break-before: always;
            }

            .mc-print-page:first-child {
              break-before: auto;
              page-break-before: auto;
            }

            .mc-print-page-header {
              border-bottom: 2px solid #111827;
              break-after: avoid-page;
              break-inside: avoid;
              margin-bottom: 20px;
              page-break-after: avoid;
              page-break-inside: avoid;
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

            .mc-print-intro-stack {
              gap: 10px;
            }

            .mc-print-page-set .mc-print-stack {
              gap: 10px;
            }

            .mc-print-panel,
            .mc-print-note-card,
            .mc-print-flow-card {
              background: #fff;
              border: 1px solid #d6d3d1;
              border-radius: 0;
              color: #111827;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .mc-print-panel {
              padding: 14px 16px;
            }

            .mc-print-intro-panel {
              padding: 10px 12px;
            }

            .mc-print-set-panel {
              padding: 10px 12px;
            }

            .mc-print-panel-heading {
              margin-bottom: 10px;
            }

            .mc-print-page-set .mc-print-panel-heading {
              margin-bottom: 7px;
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

            .mc-print-subsection,
            .mc-print-note-stack,
            .mc-print-intro-panel,
            .mc-print-page-header {
              break-inside: avoid;
              page-break-inside: avoid;
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

            .mc-print-intro-notes {
              gap: 6px;
            }

            .mc-print-set-flow {
              gap: 6px;
            }

            .mc-print-note-card,
            .mc-print-flow-card {
              padding: 10px 12px;
            }

            .mc-print-flow-card-compact,
            .mc-print-song-entry {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .mc-print-flow-card-compact {
              padding: 8px 10px;
            }

            .mc-print-flow-card-sponsor {
              border-left: 5px solid #92400e;
            }

            .mc-print-song-list {
              display: flex;
              flex-direction: column;
              gap: 4px;
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
              margin: 3px 0 0;
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
