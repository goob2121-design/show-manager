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

type SponsorFormState = {
  name: string;
  shortMessage: string;
  fullMessage: string;
  placementNote: string;
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

const setSectionOrder: SetSection[] = ["set1", "set2", "encore"];
const setSectionTitles: Record<SetSection, string> = {
  set1: "Set 1",
  set2: "Set 2",
  encore: "Encore",
};

const initialSponsorFormState: SponsorFormState = {
  name: "",
  shortMessage: "",
  fullMessage: "",
  placementNote: "",
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

function buildSponsorDrafts(sponsors: ShowSponsor[]) {
  return sponsors.reduce<Record<string, SponsorFormState>>((drafts, sponsor) => {
    drafts[sponsor.id] = {
      name: sponsor.sponsor?.name ?? "Sponsor",
      shortMessage: sponsor.sponsor?.short_message ?? "",
      fullMessage: sponsor.sponsor?.full_message ?? "",
      placementNote: sponsor.custom_note ?? sponsor.linked_performer ?? sponsor.placement_type ?? "",
    };

    return drafts;
  }, {});
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

function buildBlockNoteDrafts(
  runSections: McRunSection[],
  blockNotes: McBlockNote[],
) {
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
  const [sponsors, setSponsors] = useState<ShowSponsor[]>(initialSponsors);
  const [blockNotes, setBlockNotes] = useState<McBlockNote[]>(initialBlockNotes);
  const [scriptFormState, setScriptFormState] = useState<ScriptFormState>(() =>
    buildScriptFormState(initialShow),
  );
  const [sponsorDrafts, setSponsorDrafts] = useState<Record<string, SponsorFormState>>(() =>
    buildSponsorDrafts(initialSponsors),
  );
  const runSections = useMemo(
    () => buildMcRunSections(setlist, guestProfiles, blockNotes),
    [blockNotes, guestProfiles, setlist],
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
  const [newSponsorFormState, setNewSponsorFormState] = useState<SponsorFormState>(
    initialSponsorFormState,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [isSavingScripts, setIsSavingScripts] = useState(false);
  const [activeSponsorActionId, setActiveSponsorActionId] = useState<string | null>(null);
  const [activeBlockActionId, setActiveBlockActionId] = useState<string | null>(null);

  function handlePrintPacket() {
    window.print();
  }

  function handleScriptChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
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

  function handleSponsorDraftChange(
    sponsorId: string,
    field: keyof SponsorFormState,
    value: string,
  ) {
    setSponsorDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sponsorId]: {
        ...currentDrafts[sponsorId],
        [field]: value,
      },
    }));
  }

  function handleNewSponsorChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;

    setNewSponsorFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  async function handleAddSponsor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setErrorMessage("The show could not be loaded.");
      return;
    }

    const sponsorName = newSponsorFormState.name.trim();

    if (!sponsorName) {
      setErrorMessage("Sponsor name is required.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setActiveSponsorActionId("new");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_sponsors")
        .insert({
          show_id: show.id,
          name: sponsorName,
          short_message: normalizeOptionalField(newSponsorFormState.shortMessage),
          full_message: normalizeOptionalField(newSponsorFormState.fullMessage),
          placement_note: normalizeOptionalField(newSponsorFormState.placementNote),
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setSponsors((currentSponsors) => [...currentSponsors, data]);
      setSponsorDrafts((currentDrafts) => ({
        ...currentDrafts,
        [data.id]: {
          name: data.name,
          shortMessage: data.short_message ?? "",
          fullMessage: data.full_message ?? "",
          placementNote: data.placement_note ?? "",
        },
      }));
      setNewSponsorFormState(initialSponsorFormState);
      setStatusMessage("Sponsor read added.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleSaveSponsor(sponsorId: string) {
    const draft = sponsorDrafts[sponsorId];

    if (!show || !draft) {
      setErrorMessage("That sponsor could not be loaded.");
      return;
    }

    if (!draft.name.trim()) {
      setErrorMessage("Sponsor name is required.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setActiveSponsorActionId(sponsorId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_sponsors")
        .update({
          name: draft.name.trim(),
          short_message: normalizeOptionalField(draft.shortMessage),
          full_message: normalizeOptionalField(draft.fullMessage),
          placement_note: normalizeOptionalField(draft.placementNote),
        })
        .eq("id", sponsorId)
        .eq("show_id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setSponsors((currentSponsors) =>
        currentSponsors.map((sponsor) => (sponsor.id === sponsorId ? data : sponsor)),
      );
      setStatusMessage("Sponsor read updated.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleDeleteSponsor(sponsorId: string) {
    if (!show) {
      setErrorMessage("The show could not be loaded.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setActiveSponsorActionId(sponsorId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("show_sponsors")
        .delete()
        .eq("id", sponsorId)
        .eq("show_id", show.id);

      if (error) {
        throw error;
      }

      setSponsors((currentSponsors) => currentSponsors.filter((sponsor) => sponsor.id !== sponsorId));
      setSponsorDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[sponsorId];
        return nextDrafts;
      });
      setStatusMessage("Sponsor read removed.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
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
                  Generated from the official setlist, with MC notes layered on top.
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

        <section className="mc-section flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Show Overview</h2>
            <p className="text-sm text-stone-600">
              Quick reference details for the MC packet.
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

        <section className="mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">MC Scripts</h2>
            <p className="text-sm text-stone-600">
              Opening, intermission, and closing language for the announcer.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              {
                key: "opening",
                title: "Opening Script",
                value: scriptFormState.openingScript,
              },
              {
                key: "intermission",
                title: "Intermission Script",
                value: scriptFormState.intermissionScript,
              },
              {
                key: "closing",
                title: "Closing Script",
                value: scriptFormState.closingScript,
              },
            ].map((script) => (
              <article
                key={script.key}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              >
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {script.title}
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                  {script.value.trim() || "No script added yet."}
                </p>
              </article>
            ))}
          </div>

          <form className="print-hidden grid gap-4" onSubmit={handleSaveScripts}>
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Opening Script
                <textarea
                  name="openingScript"
                  value={scriptFormState.openingScript}
                  onChange={handleScriptChange}
                  className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Welcome language, show opener, and first housekeeping notes"
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

        <section className="mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Generated Run Sheet</h2>
            <p className="text-sm text-stone-600">
              Performance blocks are generated directly from the official setlist.
            </p>
          </div>

          {runSections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No official setlist is available yet, so the MC run sheet is still empty.
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {runSections.map((section) => (
                <section key={section.key} className="mc-run-section flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-stone-900">{section.title}</h3>
                    <p className="text-sm text-stone-600">
                      {section.blocks.length} performance{" "}
                      {section.blocks.length === 1 ? "block" : "blocks"}
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {section.blocks.map((block, index) => {
                      const blockDraft = blockNoteDrafts[block.anchorSongId] ?? {
                        introNote: "",
                        sponsorMention: "",
                        transitionNote: "",
                      };
                      const upNextBlock = section.blocks[index + 1];
                      const onDeckBlock = section.blocks[index + 2];

                      return (
                        <article
                          key={block.anchorSongId}
                          className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-lg font-semibold text-stone-900">
                                  {block.performer}
                                </h4>
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                  {block.songs.length}{" "}
                                  {block.songs.length === 1 ? "song" : "songs"}
                                </span>
                                {block.guestProfile ? (
                                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                                    Guest intro available
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex flex-col gap-1 text-sm text-stone-600">
                                <p>
                                  Songs:{" "}
                                  {block.songs
                                    .map((song) =>
                                      song.song_key
                                        ? `${song.title} (${song.song_key})`
                                        : song.title,
                                    )
                                    .join(", ")}
                                </p>
                                {upNextBlock ? (
                                  <p>
                                    Up next: {upNextBlock.performer} - {upNextBlock.songs.length}{" "}
                                    {upNextBlock.songs.length === 1 ? "song" : "songs"}
                                  </p>
                                ) : null}
                                {onDeckBlock ? (
                                  <p>
                                    On deck: {onDeckBlock.performer} - {onDeckBlock.songs.length}{" "}
                                    {onDeckBlock.songs.length === 1 ? "song" : "songs"}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Intro Note
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                                {blockDraft.introNote.trim() || "No intro note added."}
                              </p>
                            </div>
                            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Sponsor Mention
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                                {blockDraft.sponsorMention.trim() || "No sponsor mention added."}
                              </p>
                            </div>
                            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Transition Note
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                                {blockDraft.transitionNote.trim() || "No transition note added."}
                              </p>
                            </div>
                          </div>

                          <div className="print-hidden mt-4 grid gap-4 lg:grid-cols-3">
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Intro Note
                              <textarea
                                value={blockDraft.introNote}
                                onChange={(event) =>
                                  handleBlockDraftChange(
                                    block.anchorSongId,
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
                                    block.anchorSongId,
                                    "sponsorMention",
                                    event.target.value,
                                  )
                                }
                                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Optional sponsor mention before this block"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Transition Note
                              <textarea
                                value={blockDraft.transitionNote}
                                onChange={(event) =>
                                  handleBlockDraftChange(
                                    block.anchorSongId,
                                    "transitionNote",
                                    event.target.value,
                                  )
                                }
                                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Changeover or wrap-up note after this block"
                              />
                            </label>
                          </div>

                          <div className="print-hidden mt-4 flex justify-start">
                            <button
                              type="button"
                              onClick={() => handleSaveBlockNote(block.anchorSongId)}
                              disabled={activeBlockActionId === block.anchorSongId}
                              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                            >
                              {activeBlockActionId === block.anchorSongId
                                ? "Saving Block Notes..."
                                : "Save Block Notes"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Sponsor Reads</h2>
            <p className="text-sm text-stone-600">
              Thank-yous and sponsor language available for the MC packet.
            </p>
          </div>

          {sponsors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No sponsor reads have been added yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {sponsors.map((sponsor) => {
                const draft = sponsorDrafts[sponsor.id] ?? {
                  name: sponsor.sponsor?.name ?? "Sponsor",
                  shortMessage: sponsor.sponsor?.short_message ?? "",
                  fullMessage: sponsor.sponsor?.full_message ?? "",
                  placementNote: sponsor.custom_note ?? sponsor.linked_performer ?? sponsor.placement_type ?? "",
                };

                return (
                  <article
                    key={sponsor.id}
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                      <div className="flex flex-col gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-stone-900">{draft.name}</h3>
                          {draft.placementNote.trim() ? (
                            <p className="mt-1 text-sm text-stone-600">
                              Placement: {draft.placementNote}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                              Short Message
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                              {draft.shortMessage.trim() || "No short read added."}
                            </p>
                          </div>
                          <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                              Full Message
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                              {draft.fullMessage.trim() || "No full read added."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="print-hidden grid gap-3">
                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Sponsor Name
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              handleSponsorDraftChange(sponsor.id, "name", event.target.value)
                            }
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Short Message
                          <textarea
                            value={draft.shortMessage}
                            onChange={(event) =>
                              handleSponsorDraftChange(
                                sponsor.id,
                                "shortMessage",
                                event.target.value,
                              )
                            }
                            className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Full Message
                          <textarea
                            value={draft.fullMessage}
                            onChange={(event) =>
                              handleSponsorDraftChange(
                                sponsor.id,
                                "fullMessage",
                                event.target.value,
                              )
                            }
                            className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Placement Note
                          <input
                            type="text"
                            value={draft.placementNote}
                            onChange={(event) =>
                              handleSponsorDraftChange(
                                sponsor.id,
                                "placementNote",
                                event.target.value,
                              )
                            }
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            placeholder="Before Set 2 opener, during intermission, etc."
                          />
                        </label>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => handleSaveSponsor(sponsor.id)}
                            disabled={activeSponsorActionId === sponsor.id}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                          >
                            {activeSponsorActionId === sponsor.id
                              ? "Saving Sponsor..."
                              : "Save Sponsor"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSponsor(sponsor.id)}
                            disabled={activeSponsorActionId === sponsor.id}
                            className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                          >
                            Delete Sponsor
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <form
            className="print-hidden grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
            onSubmit={handleAddSponsor}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-stone-900">Add Sponsor Read</h3>
              <p className="text-sm text-stone-600">
                Add sponsor language for the MC packet and printout.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Sponsor Name
                <input
                  type="text"
                  name="name"
                  value={newSponsorFormState.name}
                  onChange={handleNewSponsorChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Business or sponsor name"
                  required
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Placement Note
                <input
                  type="text"
                  name="placementNote"
                  value={newSponsorFormState.placementNote}
                  onChange={handleNewSponsorChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Before opener, before Greg block, intermission, etc."
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
              Short Message
              <textarea
                name="shortMessage"
                value={newSponsorFormState.shortMessage}
                onChange={handleNewSponsorChange}
                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                placeholder="Short thank-you or mention"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
              Full Message
              <textarea
                name="fullMessage"
                value={newSponsorFormState.fullMessage}
                onChange={handleNewSponsorChange}
                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                placeholder="Longer sponsor read for the MC"
              />
            </label>

            <div className="flex justify-start">
              <button
                type="submit"
                disabled={activeSponsorActionId === "new"}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {activeSponsorActionId === "new" ? "Adding Sponsor..." : "Add Sponsor Read"}
              </button>
            </div>
          </form>
        </section>

        <section className="mc-section flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Guest Intros</h2>
            <p className="text-sm text-stone-600">
              Intro notes generated from submitted guest profiles.
            </p>
          </div>

          {guestProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No guest profiles are available for intro notes yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {guestProfiles.map((profile) => (
                <article
                  key={profile.id}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-stone-900">
                      {profile.name || "Unnamed guest"}
                    </h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                        profile.permission_granted
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {profile.permission_granted ? "Permission granted" : "No permission"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Short Intro
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                        {profile.short_bio || "Short bio not submitted."}
                      </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Full Intro
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                        {profile.full_bio || "Full bio not submitted."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-stone-600">
                    {profile.hometown ? <p>Hometown: {profile.hometown}</p> : null}
                    {profile.instruments ? <p>Instruments: {profile.instruments}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
