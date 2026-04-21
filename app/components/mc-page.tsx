"use client";

import Image from "next/image";
import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import type {
  GuestProfile,
  McBlockNote,
  SetSection,
  SetlistSong,
  ShowRecord,
  ShowSponsor,
} from "@/lib/types";

type ScriptFormState = {
  openingScript: string;
  intermissionScript: string;
  closingScript: string;
};

type BlockNoteFormState = {
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

type McPerformanceBlock = {
  anchorSongId: string;
  section: SetSection;
  performer: string;
  songs: SetlistSong[];
  guestProfile: GuestProfile | null;
  note: McBlockNote | null;
};

type McRunSection = {
  key: SetSection;
  title: string;
  blocks: McPerformanceBlock[];
};

type McRunSheetItem =
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

type McRunSheetData = {
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

function normalizeOptionalField(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to Supabase.";
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

function formatSponsorPlacementType(value: string | null | undefined) {
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

function getSponsorReadText(sponsor: ShowSponsor) {
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

function getGuestIntroText(profile: GuestProfile | null) {
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

function buildScriptFormState(show: ShowRecord | null): ScriptFormState {
  return {
    openingScript: show?.opening_script ?? "",
    intermissionScript: show?.intermission_script ?? "",
    closingScript: show?.closing_script ?? "",
  };
}

function buildMcRunSections(
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

function buildBlockNoteDrafts(runSections: McRunSection[], blockNotes: McBlockNote[]) {
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

function buildMcRunSheetData(
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
      const targetIndex = findMatchingBlockIndex(allBlocks, sponsor.linked_performer, 0);

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(beforeByAnchorSongId, allBlocks[targetIndex].anchorSongId, sponsor);
      return;
    }

    if (placementType === "after_performer") {
      const targetIndex = findMatchingBlockIndex(
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

function ScriptCard({
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

function SponsorReadCard({ sponsor }: { sponsor: ShowSponsor }) {
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

function PerformerBlockCard({
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
  const [show, setShow] = useState<ShowRecord | null>(initialShow);
  const [setlist] = useState<SetlistSong[]>(() =>
    sortSetlistSongs(initialSetlist.map((song) => normalizeSetlistSong(song))),
  );
  const [guestProfiles] = useState<GuestProfile[]>(initialGuestProfiles);
  const [blockNotes, setBlockNotes] = useState<McBlockNote[]>(initialBlockNotes);
  const [scriptFormState, setScriptFormState] = useState<ScriptFormState>(() =>
    buildScriptFormState(initialShow),
  );
  const [blockNoteDrafts, setBlockNoteDrafts] = useState<Record<string, BlockNoteFormState>>(() =>
    buildBlockNoteDrafts(
      buildMcRunSections(
        sortSetlistSongs(initialSetlist.map((song) => normalizeSetlistSong(song))),
        initialGuestProfiles,
        initialBlockNotes,
      ),
      initialBlockNotes,
    ),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [isSavingScripts, setIsSavingScripts] = useState(false);
  const [activeBlockActionId, setActiveBlockActionId] = useState<string | null>(null);

  const sponsors = useMemo(() => sortSponsors(initialSponsors), [initialSponsors]);
  const runSections = useMemo(
    () => buildMcRunSections(setlist, guestProfiles, blockNotes),
    [blockNotes, guestProfiles, setlist],
  );
  const runSheetData = useMemo(
    () => buildMcRunSheetData(runSections, sponsors),
    [runSections, sponsors],
  );

  function handlePrintPacket() {
    window.print();
  }

  function handleScriptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { name, value } = event.target;

    setScriptFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  async function handleSaveScripts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setErrorMessage("The show could not be loaded.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSavingScripts(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({
          opening_script: normalizeOptionalField(scriptFormState.openingScript),
          intermission_script: normalizeOptionalField(scriptFormState.intermissionScript),
          closing_script: normalizeOptionalField(scriptFormState.closingScript),
        })
        .eq("id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShow(data);
      setStatusMessage("MC scripts saved.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSavingScripts(false);
    }
  }

  function handleBlockDraftChange(
    anchorSongId: string,
    field: keyof BlockNoteFormState,
    value: string,
  ) {
    setBlockNoteDrafts((currentDrafts) => ({
      ...currentDrafts,
      [anchorSongId]: {
        ...currentDrafts[anchorSongId],
        [field]: value,
      },
    }));
  }

  async function handleSaveBlockNote(anchorSongId: string) {
    if (!show) {
      setErrorMessage("The show could not be loaded.");
      return;
    }

    const draft = blockNoteDrafts[anchorSongId];

    if (!draft) {
      return;
    }

    const introNote = normalizeOptionalField(draft.introNote);
    const sponsorMention = normalizeOptionalField(draft.sponsorMention);
    const transitionNote = normalizeOptionalField(draft.transitionNote);
    const existingNote = blockNotes.find((note) => note.anchor_song_id === anchorSongId);

    setErrorMessage(null);
    setStatusMessage(null);
    setActiveBlockActionId(anchorSongId);

    try {
      const supabase = createClient();

      if (!introNote && !sponsorMention && !transitionNote) {
        if (existingNote) {
          const { error } = await supabase
            .from("mc_block_notes")
            .delete()
            .eq("id", existingNote.id)
            .eq("show_id", show.id);

          if (error) {
            throw error;
          }

          setBlockNotes((currentNotes) =>
            currentNotes.filter((note) => note.id !== existingNote.id),
          );
          setStatusMessage("Block notes cleared.");
        } else {
          setStatusMessage("No block notes to save.");
        }

        return;
      }

      const { data, error } = await supabase
        .from("mc_block_notes")
        .upsert(
          {
            show_id: show.id,
            anchor_song_id: anchorSongId,
            intro_note: introNote,
            sponsor_mention: sponsorMention,
            transition_note: transitionNote,
          },
          { onConflict: "show_id,anchor_song_id" },
        )
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setBlockNotes((currentNotes) => {
        const existingIndex = currentNotes.findIndex((note) => note.id === data.id);

        if (existingIndex >= 0) {
          return currentNotes.map((note) => (note.id === data.id ? data : note));
        }

        return [...currentNotes, data];
      });
      setStatusMessage("Block notes saved.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveBlockActionId(null);
    }
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
        <AdminQuickNav slug={showSlug} currentView="mc" />

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

        <header className="print-only print-copy-header">
          <p className="print-copy-mode">MC Packet</p>
          <h1>{show.name}</h1>
          <p>{formatShowDate(show.show_date)}</p>
          {show.venue ? <p>{show.venue}</p> : null}
        </header>

        {statusMessage ? (
          <div className="print-hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="print-hidden rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

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
            <h2 className="text-xl font-semibold">MC Script Editor</h2>
            <p className="text-sm text-stone-600">
              Opening, intermission, and closing scripts feed directly into the run sheet below.
            </p>
          </div>

          <form className="grid gap-4" onSubmit={handleSaveScripts}>
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Opening Script
                <textarea
                  name="openingScript"
                  value={scriptFormState.openingScript}
                  onChange={handleScriptChange}
                  className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Welcome language, opener, and first housekeeping notes"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Intermission Script
                <textarea
                  name="intermissionScript"
                  value={scriptFormState.intermissionScript}
                  onChange={handleScriptChange}
                  className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Intermission reminders, sponsor thanks, and return timing"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Closing Script
                <textarea
                  name="closingScript"
                  value={scriptFormState.closingScript}
                  onChange={handleScriptChange}
                  className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Closing thanks, future date mentions, and sign-off"
                />
              </label>
            </div>

            <div className="flex justify-start">
              <button
                type="submit"
                disabled={isSavingScripts}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {isSavingScripts ? "Saving Scripts..." : "Save MC Scripts"}
              </button>
            </div>
          </form>
        </section>

        <section className="mc-section flex flex-col gap-5 border-t border-stone-200 pt-6">
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

                          <div className="print-hidden grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 lg:grid-cols-3">
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Intro Note
                              <textarea
                                value={blockDraft.introNote}
                                onChange={(event) =>
                                  handleBlockDraftChange(
                                    item.block.anchorSongId,
                                    "introNote",
                                    event.target.value,
                                  )
                                }
                                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Intro line before bringing this performer up"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Sponsor Mention
                              <textarea
                                value={blockDraft.sponsorMention}
                                onChange={(event) =>
                                  handleBlockDraftChange(
                                    item.block.anchorSongId,
                                    "sponsorMention",
                                    event.target.value,
                                  )
                                }
                                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Optional sponsor line tied to this performer"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Transition Note
                              <textarea
                                value={blockDraft.transitionNote}
                                onChange={(event) =>
                                  handleBlockDraftChange(
                                    item.block.anchorSongId,
                                    "transitionNote",
                                    event.target.value,
                                  )
                                }
                                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Changeover or wrap-up note after this block"
                              />
                            </label>
                          </div>

                          <div className="print-hidden flex justify-start">
                            <button
                              type="button"
                              onClick={() => handleSaveBlockNote(item.block.anchorSongId)}
                              disabled={activeBlockActionId === item.block.anchorSongId}
                              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                            >
                              {activeBlockActionId === item.block.anchorSongId
                                ? "Saving Block Notes..."
                                : "Save Block Notes"}
                            </button>
                          </div>
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
      </section>
    </main>
  );
}
