"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { readAdminAccess, subscribeToAdminAccess } from "@/app/components/admin-gate";
import { createClient } from "@/lib/supabase/client";
import type { LiveShowState, RehearsalEntry, RehearsalRecording, SetSection, ShowRecord, SongTempo, SongType } from "@/lib/types";

const FOLLOW_MODE_STORAGE_KEY = "stageflow-band-live-follow-mode";
const LIVE_LYRICS_FONT_SIZE_STORAGE_KEY = "stageflow_live_lyrics_font_size";
const LIVE_SONG_INTRO_FONT_SIZE_STORAGE_KEY = "stageflow_live_song_intro_font_size";
const LIVE_LYRICS_READING_MODE_STORAGE_KEY = "stageflow_live_lyrics_reading_mode";
const LIVE_SONG_INTRO_READING_MODE_STORAGE_KEY = "stageflow_live_song_intro_reading_mode";
const LIVE_MODAL_FONT_SIZE_MIN = 18;
const LIVE_MODAL_FONT_SIZE_MAX = 42;
const LIVE_LYRICS_FONT_SIZE_DEFAULT = 28;
const LIVE_SONG_INTRO_FONT_SIZE_DEFAULT = 24;

type LiveSetlistSongRow = {
  id: string;
  show_id: string;
  section: string | null;
  position: number;
  source_type: string | null;
  song_id: string | null;
  guest_song_id: string | null;
  custom_title: string | null;
  performance_flow?: string | null;
  song_intro_notes?: string | null;
  created_at: string;
  library_song?:
    | {
        id: string;
        title: string | null;
        key: string | null;
        sung_by: string | null;
        tempo: SongTempo | null;
        song_type: SongType | null;
        notes: string | null;
        lyrics: string | null;
        chart_url?: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        key: string | null;
        sung_by: string | null;
        tempo: SongTempo | null;
        song_type: SongType | null;
        notes: string | null;
        lyrics: string | null;
        chart_url?: string | null;
      }>
    | null;
  guest_song?:
    | {
        id: string;
        title: string | null;
        key: string | null;
        sung_by: string | null;
        tempo: SongTempo | null;
        song_type: SongType | null;
        notes: string | null;
        lyrics: string | null;
        submitted_by_name: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        key: string | null;
        sung_by: string | null;
        tempo: SongTempo | null;
        song_type: SongType | null;
        notes: string | null;
        lyrics: string | null;
        submitted_by_name: string | null;
      }>
    | null;
};

type LiveRehearsalEntryRow = RehearsalEntry & {
  library_song?:
    | {
        id: string;
        title: string | null;
        key: string | null;
        sung_by: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        key: string | null;
        sung_by: string | null;
      }>
    | null;
};

type LiveSong = {
  id: string;
  section: SetSection;
  sectionLabel: string;
  sectionNumber: number;
  songNumber: number;
  title: string;
  key: string | null;
  tempo: SongTempo | null;
  leadVocal: string | null;
  performerName: string | null;
  performanceFlow: string | null;
  songIntroNotes: string | null;
  performanceNotes: string | null;
  rehearsalNotes: string | null;
  lyrics: string | null;
  chartUrl: string | null;
};

type ConnectionState = "connecting" | "connected" | "offline";

const LIVE_SHOW_TIMING = {
  showStart: { hour: 19, minute: 0 },
  intermissionWindow: {
    start: { hour: 19, minute: 45 },
    end: { hour: 20, minute: 0 },
    label: "INTERMISSION WINDOW",
  },
  showEndWindow: {
    start: { hour: 20, minute: 45 },
    end: { hour: 21, minute: 0 },
    label: "SHOW END WINDOW",
  },
} as const;

function UtilityIcon({
  children,
}: {
  children: ReactNode;
}) {
  return <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-current">{children}</span>;
}

function WifiIcon() {
  return (
    <UtilityIcon>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M3 7.5a11 11 0 0 1 14 0" strokeLinecap="round" />
        <path d="M5.8 10.4a7 7 0 0 1 8.4 0" strokeLinecap="round" />
        <path d="M8.6 13.3a3 3 0 0 1 2.8 0" strokeLinecap="round" />
        <circle cx="10" cy="16" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    </UtilityIcon>
  );
}

function UsersIcon() {
  return (
    <UtilityIcon>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
        <circle cx="7" cy="7" r="2.2" />
        <circle cx="13.2" cy="7.8" r="1.8" />
        <path d="M3.8 14.8c.6-2 2.3-3.1 4.5-3.1s3.9 1.1 4.5 3.1" strokeLinecap="round" />
        <path d="M12.1 12.2c1.5.1 2.7.9 3.3 2.4" strokeLinecap="round" />
      </svg>
    </UtilityIcon>
  );
}

function EyeIcon() {
  return (
    <UtilityIcon>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
        <path d="M2.3 10s2.7-4.8 7.7-4.8 7.7 4.8 7.7 4.8-2.7 4.8-7.7 4.8S2.3 10 2.3 10Z" />
        <circle cx="10" cy="10" r="2.1" />
      </svg>
    </UtilityIcon>
  );
}

function HomeIcon() {
  return (
    <UtilityIcon>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
        <path d="M3.2 8.7 10 3.5l6.8 5.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.2 7.9v8.1h9.6V7.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </UtilityIcon>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Something went wrong.";
}

function clampModalFontSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(LIVE_MODAL_FONT_SIZE_MAX, Math.max(LIVE_MODAL_FONT_SIZE_MIN, value));
}

function isLyricSectionMarker(line: string) {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return false;
  }

  return /^(verse|chorus|bridge|tag)(\s+[\w().:-]+)?$/i.test(trimmedLine);
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "show";
}

function sanitizeSongTitle(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeSetSection(value: string | null | undefined): SetSection {
  if (value === "set2" || value === "encore") {
    return value;
  }

  return "set1";
}

function formatSectionLabel(section: SetSection) {
  switch (section) {
    case "set2":
      return "Set 2";
    case "encore":
      return "Encore";
    default:
      return "Set 1";
  }
}

function getSectionNumber(section: SetSection) {
  switch (section) {
    case "set2":
      return 2;
    case "encore":
      return 3;
    default:
      return 1;
  }
}

function stripMp3MarkerFromNotes(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  const cleanedNotes = notes.replace(/\[\[MP3_PATH:([^\]]+)\]\]/i, "").trim();
  return cleanedNotes || null;
}

function stripUrlsForStageDisplay(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  const withoutUrls = notes
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\S+\.(?:pdf|jpg|jpeg|png|gif|webp|mp3|wav|docx?|xlsx?)\b/gi, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  return withoutUrls || null;
}

function formatShowDate(showDate: string | null) {
  if (!showDate) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${showDate}T00:00:00`));
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(length - 1, index));
}

async function ensureLiveShowStateRow(showId: string) {
  const supabase = createClient();
  const payload = {
    show_id: showId,
    current_song_index: 0,
    updated_at: new Date().toISOString(),
    updated_by: "band-live-mode-init",
  };

  const { data, error } = await supabase
    .from("live_show_state")
    .upsert(payload, { onConflict: "show_id", ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data as LiveShowState;
  }

  const { data: existingRow, error: existingRowError } = await supabase
    .from("live_show_state")
    .select("*")
    .eq("show_id", showId)
    .maybeSingle();

  if (existingRowError) {
    throw existingRowError;
  }

  return (existingRow as LiveShowState | null) ?? null;
}

function normalizeLiveSong(
  row: LiveSetlistSongRow,
  songNumberLookup: Map<string, number>,
  rehearsalBySongId: Map<string, LiveRehearsalEntryRow>,
  rehearsalByTitle: Map<string, LiveRehearsalEntryRow>,
  _recordingsByEntryId: Map<string, RehearsalRecording[]>,
) {
  const librarySong = Array.isArray(row.library_song) ? row.library_song[0] ?? null : row.library_song ?? null;
  const guestSong = Array.isArray(row.guest_song) ? row.guest_song[0] ?? null : row.guest_song ?? null;
  const section = normalizeSetSection(row.section);
  const title =
    sanitizeSongTitle(row.custom_title) ||
    sanitizeSongTitle(librarySong?.title) ||
    sanitizeSongTitle(guestSong?.title) ||
    "Untitled Song";
  const key = librarySong?.key ?? guestSong?.key ?? null;
  const leadVocal = librarySong?.sung_by ?? guestSong?.sung_by ?? null;
  const performerName = guestSong?.submitted_by_name?.trim() || leadVocal?.trim() || null;
  const performanceFlow = row.performance_flow?.trim() || null;
  const songIntroNotes = row.song_intro_notes?.trim() || null;
  const performanceNotes = stripMp3MarkerFromNotes(librarySong?.notes ?? guestSong?.notes ?? null);
  const rehearsalEntry =
    (row.song_id ? rehearsalBySongId.get(row.song_id) : null) ??
    rehearsalByTitle.get(title.trim().toLowerCase()) ??
    null;
  const rehearsalNotes = stripUrlsForStageDisplay(rehearsalEntry?.notes) || null;
  return {
    id: row.id,
    section,
    sectionLabel: formatSectionLabel(section),
    sectionNumber: getSectionNumber(section),
    songNumber: songNumberLookup.get(row.id) ?? 1,
    title,
    key,
    tempo: librarySong?.tempo ?? guestSong?.tempo ?? null,
    leadVocal,
    performerName,
    performanceFlow,
    songIntroNotes,
    performanceNotes,
    rehearsalNotes,
    lyrics: librarySong?.lyrics ?? guestSong?.lyrics ?? null,
    chartUrl: librarySong?.chart_url?.trim() || null,
  } satisfies LiveSong;
}

function sortSetlistRows(rows: LiveSetlistSongRow[]) {
  const sectionOrder: Record<SetSection, number> = {
    set1: 1,
    set2: 2,
    encore: 3,
  };

  return [...rows].sort((rowA, rowB) => {
    const sectionDifference =
      sectionOrder[normalizeSetSection(rowA.section)] - sectionOrder[normalizeSetSection(rowB.section)];

    if (sectionDifference !== 0) {
      return sectionDifference;
    }

    if (rowA.position !== rowB.position) {
      return rowA.position - rowB.position;
    }

    return rowA.created_at.localeCompare(rowB.created_at);
  });
}

export function BandLivePage({ showSlug }: { showSlug: string }) {
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [songs, setSongs] = useState<LiveSong[]>([]);
  const [sharedState, setSharedState] = useState<LiveShowState | null>(null);
  const [manualIndex, setManualIndex] = useState(0);
  const [followBandLeader, setFollowBandLeader] = useState(true);
  const [isLeaderUnlocked, setIsLeaderUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [songIntroOpen, setSongIntroOpen] = useState(false);
  const [lyricsFontSize, setLyricsFontSize] = useState(LIVE_LYRICS_FONT_SIZE_DEFAULT);
  const [songIntroFontSize, setSongIntroFontSize] = useState(LIVE_SONG_INTRO_FONT_SIZE_DEFAULT);
  const [lyricsReadingMode, setLyricsReadingMode] = useState(false);
  const [songIntroReadingMode, setSongIntroReadingMode] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [showStartConfirmOpen, setShowStartConfirmOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const followBandLeaderRef = useRef(followBandLeader);
  const songsLengthRef = useRef(songs.length);
  const modalScrollLockRef = useRef(0);
  const lyricsOverlayRef = useRef<HTMLDivElement | null>(null);
  const songIntroOverlayRef = useRef<HTMLDivElement | null>(null);
  const lyricsScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const songIntroScrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedFollowMode = window.localStorage.getItem(FOLLOW_MODE_STORAGE_KEY);
    if (savedFollowMode === "false") {
      setFollowBandLeader(false);
    }

  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(FOLLOW_MODE_STORAGE_KEY, followBandLeader ? "true" : "false");
  }, [followBandLeader]);

  useEffect(() => {
    followBandLeaderRef.current = followBandLeader;
  }, [followBandLeader]);

  useEffect(() => {
    songsLengthRef.current = songs.length;
  }, [songs.length]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncLeaderAccess = () => {
      setIsLeaderUnlocked(readAdminAccess(showSlug));
    };

    syncLeaderAccess();
    return subscribeToAdminAccess(syncLeaderAccess);
  }, [showSlug]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedLyricsFontSize = window.localStorage.getItem(LIVE_LYRICS_FONT_SIZE_STORAGE_KEY);
    const savedSongIntroFontSize = window.localStorage.getItem(
      LIVE_SONG_INTRO_FONT_SIZE_STORAGE_KEY,
    );
    const savedLyricsReadingMode = window.localStorage.getItem(
      LIVE_LYRICS_READING_MODE_STORAGE_KEY,
    );
    const savedSongIntroReadingMode = window.localStorage.getItem(
      LIVE_SONG_INTRO_READING_MODE_STORAGE_KEY,
    );

    if (savedLyricsFontSize) {
      setLyricsFontSize(
        clampModalFontSize(
          Number.parseInt(savedLyricsFontSize, 10),
          LIVE_LYRICS_FONT_SIZE_DEFAULT,
        ),
      );
    }

    if (savedSongIntroFontSize) {
      setSongIntroFontSize(
        clampModalFontSize(
          Number.parseInt(savedSongIntroFontSize, 10),
          LIVE_SONG_INTRO_FONT_SIZE_DEFAULT,
        ),
      );
    }

    if (savedLyricsReadingMode) {
      setLyricsReadingMode(savedLyricsReadingMode === "true");
    }

    if (savedSongIntroReadingMode) {
      setSongIntroReadingMode(savedSongIntroReadingMode === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LIVE_LYRICS_FONT_SIZE_STORAGE_KEY, String(lyricsFontSize));
  }, [lyricsFontSize]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      LIVE_SONG_INTRO_FONT_SIZE_STORAGE_KEY,
      String(songIntroFontSize),
    );
  }, [songIntroFontSize]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      LIVE_LYRICS_READING_MODE_STORAGE_KEY,
      String(lyricsReadingMode),
    );
  }, [lyricsReadingMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      LIVE_SONG_INTRO_READING_MODE_STORAGE_KEY,
      String(songIntroReadingMode),
    );
  }, [songIntroReadingMode]);

  useEffect(() => {
    let isCancelled = false;

    async function loadLiveModeData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const supabase = createClient();
        const { data: showRecord, error: showError } = await supabase
          .from("shows")
          .select("*")
          .eq("slug", showSlug)
          .maybeSingle();

        if (showError) {
          throw showError;
        }

        if (!showRecord) {
          throw new Error("Show not found.");
        }

        const [
          { data: setlistRows, error: setlistError },
          { data: rehearsalEntries, error: rehearsalEntriesError },
          { data: rehearsalRecordings, error: rehearsalRecordingsError },
          liveStateRow,
        ] = await Promise.all([
          supabase
            .from("setlist_entries")
            .select(`
              id,
              show_id,
              section,
              position,
              source_type,
              song_id,
              guest_song_id,
              custom_title,
              performance_flow,
              song_intro_notes,
              created_at,
              library_song:song_id (
                id,
                title,
                key,
                sung_by,
                tempo,
                song_type,
                notes,
                lyrics,
                chart_url
              ),
              guest_song:guest_song_id (
                id,
                title,
                key,
                sung_by,
                tempo,
                song_type,
                notes,
                lyrics,
                submitted_by_name
              )
            `)
            .eq("show_id", showRecord.id),
          supabase
            .from("rehearsal_entries")
            .select(`
              *,
              library_song:song_id (
                id,
                title,
                key,
                sung_by
              )
            `)
            .eq("show_id", showRecord.id)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("rehearsal_recordings")
            .select("*")
            .eq("show_id", showRecord.id)
            .order("created_at", { ascending: false }),
          ensureLiveShowStateRow(showRecord.id),
        ]);

        if (setlistError) {
          throw setlistError;
        }

        if (rehearsalEntriesError) {
          throw rehearsalEntriesError;
        }

        if (rehearsalRecordingsError) {
          throw rehearsalRecordingsError;
        }

        const normalizedSetlistRows = sortSetlistRows((setlistRows ?? []) as LiveSetlistSongRow[]);
        const songNumberLookup = new Map<string, number>();
        const sectionCounters: Record<SetSection, number> = { set1: 0, set2: 0, encore: 0 };

        for (const row of normalizedSetlistRows) {
          const section = normalizeSetSection(row.section);
          sectionCounters[section] += 1;
          songNumberLookup.set(row.id, sectionCounters[section]);
        }

        const normalizedRehearsalEntries = (rehearsalEntries ?? []) as LiveRehearsalEntryRow[];
        const rehearsalBySongId = new Map<string, LiveRehearsalEntryRow>();
        const rehearsalByTitle = new Map<string, LiveRehearsalEntryRow>();

        for (const entry of normalizedRehearsalEntries) {
          if (entry.song_id) {
            rehearsalBySongId.set(entry.song_id, entry);
          }

          const entryTitle =
            sanitizeSongTitle(entry.custom_title) ||
            sanitizeSongTitle(
              Array.isArray(entry.library_song) ? entry.library_song[0]?.title : entry.library_song?.title,
            );

          if (entryTitle) {
            rehearsalByTitle.set(entryTitle.toLowerCase(), entry);
          }
        }

        const recordingsByEntryId = new Map<string, RehearsalRecording[]>();
        for (const recording of (rehearsalRecordings ?? []) as RehearsalRecording[]) {
          if (!recording.rehearsal_entry_id) {
            continue;
          }

          const existingRecordings = recordingsByEntryId.get(recording.rehearsal_entry_id) ?? [];
          existingRecordings.push(recording);
          recordingsByEntryId.set(recording.rehearsal_entry_id, existingRecordings);
        }

        const normalizedSongs = normalizedSetlistRows.map((row) =>
          normalizeLiveSong(
            row,
            songNumberLookup,
            rehearsalBySongId,
            rehearsalByTitle,
            recordingsByEntryId,
          ),
        );

        if (isCancelled) {
          return;
        }

        const nextSharedState = (liveStateRow as LiveShowState | null) ?? null;
        setShow(showRecord as ShowRecord);
        setSongs(normalizedSongs);
        setSharedState(nextSharedState);
        setManualIndex(
          clampIndex(nextSharedState?.current_song_index ?? 0, normalizedSongs.length),
        );
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLiveModeData();

    return () => {
      isCancelled = true;
    };
  }, [showSlug]);

  useEffect(() => {
    if (!show?.id) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`live-show-state:${show.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_show_state",
          filter: `show_id=eq.${show.id}`,
        },
        (payload: {
          eventType: string;
          new: LiveShowState | null;
          old: LiveShowState | null;
        }) => {
          console.log("Live state realtime payload:", payload);
          const nextState =
            payload.eventType === "DELETE"
              ? null
              : ((payload.new as LiveShowState | null) ?? (payload.old as LiveShowState | null) ?? null);

          setSharedState(nextState);
          console.log("Live state current_song_index:", nextState?.current_song_index ?? null);
          console.log("Follow Leader when payload arrived:", followBandLeaderRef.current);

          if (nextState && followBandLeaderRef.current) {
            setManualIndex(clampIndex(nextState.current_song_index, songsLengthRef.current));
          }
        },
      )
      .subscribe((status: string) => {
        console.log("Live state realtime status:", status);
        if (status === "SUBSCRIBED") {
          setConnectionState("connected");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || !navigator.onLine) {
          setConnectionState("offline");
          return;
        }

        setConnectionState("connecting");
      });

    const handleOnlineState = () => {
      setConnectionState(navigator.onLine ? "connecting" : "offline");
    };

    window.addEventListener("online", handleOnlineState);
    window.addEventListener("offline", handleOnlineState);

    return () => {
      window.removeEventListener("online", handleOnlineState);
      window.removeEventListener("offline", handleOnlineState);
      void supabase.removeChannel(channel);
    };
  }, [show?.id]);

  const sharedIndex = clampIndex(sharedState?.current_song_index ?? 0, songs.length);
  const currentIndex = clampIndex(followBandLeader ? sharedIndex : manualIndex, songs.length);
  const currentSong = songs[currentIndex] ?? null;
  const nextSong = songs[currentIndex + 1] ?? null;

  async function updateSharedSongIndex(nextIndex: number) {
    if (!show?.id || !isLeaderUnlocked || songs.length === 0) {
      return;
    }

    const safeIndex = clampIndex(nextIndex, songs.length);
    const nextSongForState = songs[safeIndex] ?? null;
    const supabase = createClient();
    const payload = {
      show_id: show.id,
      current_song_index: safeIndex,
      current_set_number: nextSongForState?.sectionNumber ?? 1,
      updated_at: new Date().toISOString(),
      updated_by: "band-live-mode",
    };

    const { data, error } = await supabase
      .from("live_show_state")
      .upsert(payload, { onConflict: "show_id" })
      .select()
      .single();

    if (error) {
      console.error("Failed to update live show state:", error);
      setStatusMessage(`Could not update Live Mode for everyone: ${getErrorMessage(error)}`);
      return;
    }

    setSharedState((data as LiveShowState | null) ?? null);
    setManualIndex(safeIndex);
    setStatusMessage(
      nextSongForState ? `Everyone moved to ${nextSongForState.sectionLabel}, song ${nextSongForState.songNumber}.` : null,
    );
    window.setTimeout(() => setStatusMessage(null), 2200);
  }

  async function toggleWakeLock() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      setStatusMessage("Wake Lock is not available on this device/browser.");
      window.setTimeout(() => setStatusMessage(null), 2200);
      return;
    }

    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeLockEnabled(false);
        return;
      }

      const wakeLock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = wakeLock;
      setWakeLockEnabled(true);
      wakeLock.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeLockEnabled(false);
      });
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
      window.setTimeout(() => setStatusMessage(null), 2200);
    }
  }

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
      }
    };
  }, []);

  useEffect(() => {
    const activeScrollContainer = lyricsOpen
      ? lyricsOverlayRef.current
      : songIntroOpen
        ? songIntroOverlayRef.current
        : null;

    if (!activeScrollContainer) {
      return;
    }

    window.setTimeout(() => {
      activeScrollContainer.focus();
    }, 0);
  }, [lyricsOpen, songIntroOpen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const shouldLockScroll = lyricsOpen || songIntroOpen;
    if (!shouldLockScroll) {
      return;
    }

    const scrollY = window.scrollY;
    modalScrollLockRef.current = scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const previousHtmlPosition = document.documentElement.style.position;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    document.documentElement.style.position = "fixed";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "contain";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      document.documentElement.style.position = previousHtmlPosition;
      window.scrollTo(0, modalScrollLockRef.current);
    };
  }, [lyricsOpen, songIntroOpen]);

  const connectionLabel = useMemo(() => {
    switch (connectionState) {
      case "connected":
        return {
          label: "ONLINE",
          className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
        };
      case "offline":
        return {
          label: "OFFLINE",
          className: "border-rose-400/40 bg-rose-500/15 text-rose-200",
        };
      default:
        return {
          label: "SYNCING",
          className: "border-amber-400/40 bg-amber-500/15 text-amber-200",
        };
    }
  }, [connectionState]);

  const clockState = useMemo(() => getClockWindowState(currentTime), [currentTime]);
  const formattedCurrentTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }).format(currentTime),
    [currentTime],
  );

  const followStatusLabel = followBandLeader ? "FOLLOWING" : "MANUAL";
  const showLeaderControls = isLeaderUnlocked && !followBandLeader;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#0f172a_38%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-3 px-3 py-2 sm:px-4 sm:py-3 lg:gap-4 lg:px-6">
        <header className="sticky top-0 z-20 -mx-1 overflow-x-auto rounded-[1.35rem] border border-white/10 bg-slate-950/90 px-3 py-2 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.95)] backdrop-blur lg:hidden">
          <div className="inline-flex min-w-full items-center gap-2 whitespace-nowrap">
            <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10">
              <UsersIcon />
              <input
                type="checkbox"
                checked={followBandLeader}
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  setFollowBandLeader(nextValue);
                  if (nextValue) {
                    setManualIndex(sharedIndex);
                  }
                }}
                className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
              />
              Follow Leader
            </label>
            <Link
              href={`/band/${encodeURIComponent(showSlug)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <HomeIcon />
              Back
            </Link>
            <button
              type="button"
              onClick={toggleWakeLock}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <EyeIcon />
              {wakeLockEnabled ? "Keep Awake On" : "Keep Awake"}
            </button>
            <span
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold tracking-[0.22em] ${connectionLabel.className}`}
            >
              <WifiIcon />
              {connectionLabel.label}
            </span>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-semibold tracking-[0.18em] text-slate-100">
              <UsersIcon />
              {followStatusLabel}
            </span>
            {!followBandLeader && !showLeaderControls ? (
              <button
                type="button"
                onClick={() => setManualIndex(sharedIndex)}
                className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Jump to Leader Song
              </button>
            ) : null}
          </div>
        </header>

        <header className="hidden rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_24px_72px_-48px_rgba(15,23,42,0.95)] backdrop-blur lg:block">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-center lg:text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">StageFlow Live Performance Mode</p>
              <h1 className="mx-auto max-w-[22ch] text-lg font-black leading-tight tracking-tight text-white sm:text-xl lg:mx-0 lg:max-w-none lg:text-2xl text-balance">
                {show?.name?.trim() || "Band Live Mode"}
              </h1>
              <p className="text-xs text-slate-300 sm:text-sm">
                {show ? formatShowDate(show.show_date) : "Loading show..."}
              </p>
            </div>

            <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
              <span
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold tracking-[0.22em] ${connectionLabel.className}`}
              >
                <WifiIcon />
                {connectionLabel.label}
              </span>
              <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-semibold tracking-[0.18em] text-slate-100">
                <UsersIcon />
                {followStatusLabel}
              </span>
              <label className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10">
                <UsersIcon />
                <input
                  type="checkbox"
                  checked={followBandLeader}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    setFollowBandLeader(nextValue);
                    if (nextValue) {
                      setManualIndex(sharedIndex);
                    }
                  }}
                  className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                />
                Follow Leader
              </label>
              <Link
                href={`/band/${encodeURIComponent(showSlug)}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10 sm:text-sm"
              >
                <HomeIcon />
                Back
              </Link>
              <button
                type="button"
                onClick={toggleWakeLock}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10 sm:text-sm"
              >
                <EyeIcon />
                {wakeLockEnabled ? "Keep Awake On" : "Keep Awake"}
              </button>
              {!followBandLeader && !showLeaderControls ? (
                <button
                  type="button"
                  onClick={() => setManualIndex(sharedIndex)}
                  className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10 sm:text-sm"
                >
                  Jump to Leader Song
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
            {statusMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950/60 px-6 py-16 text-lg font-semibold text-slate-200">
            Loading live setlist...
          </div>
        ) : songs.length === 0 || !currentSong ? (
          <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-slate-950/50 px-6 py-16 text-center text-slate-300">
            No setlist songs are loaded for this show yet.
          </div>
        ) : (
          <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
            <article className="flex min-h-[60vh] flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-4 shadow-[0_35px_90px_-52px_rgba(15,23,42,0.95)] backdrop-blur sm:p-5">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                      {currentSong.sectionLabel}
                    </span>
                    <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
                      Song {currentSong.songNumber}
                    </span>
                  </div>
                  <h2
                    className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-black leading-[1.02] tracking-tight text-white"
                    style={{ fontSize: "clamp(2.4rem, 8.5vw, 3.3rem)" }}
                  >
                    {currentSong.title}
                  </h2>
                </div>

                <div className="shrink-0 self-start rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-right min-w-[6.5rem] sm:min-w-[9.75rem]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Key</p>
                  <p className="mt-1 text-3xl font-black text-emerald-200 sm:text-4xl lg:text-5xl">
                    {currentSong.key?.trim() || "—"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-center lg:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Lead Vocal</p>
                  <p className="mt-1.5 text-base font-semibold text-white sm:text-lg">
                    {currentSong.leadVocal?.trim() || currentSong.performerName?.trim() || "CMMS Band"}
                  </p>
                </div>
                <div className={`rounded-2xl border px-3 py-2.5 text-center lg:hidden ${clockState.className}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">{clockState.label}</p>
                  <p className={`mt-1 text-[1.56rem] font-black leading-none sm:text-2xl ${clockState.accentClassName}`}>
                    {formattedCurrentTime}
                  </p>
                </div>
                {currentSong.lyrics?.trim() ? (
                  <button
                    type="button"
                    onClick={() => setLyricsOpen(true)}
                    className="flex min-h-[6.25rem] w-full flex-col items-start justify-center rounded-[1.35rem] border border-sky-400/25 bg-sky-500/12 px-4 py-4 text-left transition hover:bg-sky-500/18 sm:min-h-[6.75rem] sm:px-5 sm:py-4.5 lg:min-h-[7rem] lg:px-5 lg:py-5"
                  >
                    <span className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-200">Lyrics</span>
                    <span className="mt-2 text-[1.2rem] font-bold text-white sm:text-[1.35rem] lg:text-[1.45rem]">OPEN LYRICS</span>
                  </button>
                ) : null}
                {currentSong.chartUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(currentSong.chartUrl ?? "", "_blank", "noopener,noreferrer")}
                    className="flex min-h-[6.25rem] w-full flex-col items-start justify-center rounded-[1.35rem] border border-emerald-400/25 bg-emerald-500/12 px-4 py-4 text-left transition hover:bg-emerald-500/18 sm:min-h-[6.75rem] sm:px-5 sm:py-4.5 lg:min-h-[7rem] lg:px-5 lg:py-5"
                  >
                    <span className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">Chart</span>
                    <span className="mt-2 text-[1.2rem] font-bold text-white sm:text-[1.35rem] lg:text-[1.45rem]">OPEN CHART</span>
                  </button>
                ) : null}
                {isLeaderUnlocked && currentSong.songIntroNotes ? (
                  <button
                    type="button"
                    onClick={() => setSongIntroOpen(true)}
                    className="flex min-h-[6.25rem] w-full flex-col items-start justify-center rounded-[1.35rem] border border-amber-400/25 bg-amber-500/12 px-4 py-4 text-left transition hover:bg-amber-500/18 sm:min-h-[6.75rem] sm:px-5 sm:py-4.5 lg:min-h-[7rem] lg:px-5 lg:py-5"
                  >
                    <span className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">Song Intro</span>
                    <span className="mt-2 text-[1.2rem] font-bold text-white sm:text-[1.35rem] lg:text-[1.45rem]">OPEN INTRO</span>
                  </button>
                ) : null}
              </div>

              {currentSong.performanceFlow?.trim() ? (
                <div className="mt-4 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">
                    Performance Flow / Break Order
                  </h3>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-2xl leading-10 text-white sm:text-3xl sm:leading-[3rem] lg:text-4xl lg:leading-[3.75rem]">
                    {currentSong.performanceFlow}
                  </pre>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3">
                {currentSong.performanceFlow?.trim() ? null : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Performance Notes</h3>
                    <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-100 sm:text-lg">
                      {currentSong.performanceNotes?.trim() || "No performance notes for this song."}
                    </p>
                  </div>
                )}
              </div>

              {!followBandLeader && !showLeaderControls ? (
                <div className="mt-auto grid gap-3 pt-5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setManualIndex((current) => clampIndex(current - 1, songs.length))}
                    disabled={currentIndex <= 0}
                    className="min-h-14 rounded-[1.5rem] border border-white/10 bg-white/5 px-5 text-base font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
                  >
                    Previous Song
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualIndex((current) => clampIndex(current + 1, songs.length))}
                    disabled={currentIndex >= songs.length - 1}
                    className="min-h-14 rounded-[1.5rem] border border-white/10 bg-emerald-500/15 px-5 text-base font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
                  >
                    Next Song
                  </button>
                </div>
              ) : null}
            </article>

            <aside className="flex flex-col gap-3">
              <section className={`hidden rounded-[1.75rem] border p-3.5 lg:block ${clockState.className}`}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{clockState.label}</h3>
                <p className={`mt-2 text-3xl font-black tracking-tight xl:text-4xl ${clockState.accentClassName}`}>
                  {formattedCurrentTime}
                </p>
              </section>

              {showLeaderControls ? (
              <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-3.5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Leader Controls</h3>
                <div className="mt-3 flex flex-col gap-3.5 lg:min-h-[30rem] lg:justify-start">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200">
                    Shared position: {songs[sharedIndex] ? `${songs[sharedIndex].sectionLabel} • Song ${songs[sharedIndex].songNumber}` : "Not set yet"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStartConfirmOpen(true)}
                    disabled={songs.length === 0}
                    className="min-h-[6.5rem] rounded-[1.5rem] border border-sky-400/20 bg-sky-500/15 px-5 text-lg font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-[7rem] lg:text-[1.35rem] xl:min-h-[7.5rem]"
                  >
                    Start Show
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateSharedSongIndex(sharedIndex - 1)}
                    disabled={songs.length === 0 || sharedIndex <= 0}
                    className="min-h-[6.5rem] rounded-[1.5rem] border border-white/10 bg-white/5 px-5 text-lg font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-[7rem] lg:text-[1.35rem] xl:min-h-[7.5rem]"
                  >
                    Back Everyone
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateSharedSongIndex(sharedIndex + 1)}
                    disabled={songs.length === 0 || sharedIndex >= songs.length - 1}
                    className="min-h-[7.75rem] rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/15 px-5 text-[1.2rem] font-bold text-emerald-100 shadow-[0_24px_48px_-28px_rgba(16,185,129,0.75)] transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-[8.75rem] lg:text-[1.5rem] xl:min-h-[9.25rem]"
                  >
                    <span className="block">Advance Everyone</span>
                    <span className="mt-2 block text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200/90 lg:text-base">
                      Next Song
                    </span>
                  </button>
                </div>
              </section>
              ) : null}

              <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-3.5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">On Deck</h3>
                <div className="mt-3 flex flex-col gap-2.5">
                  {nextSong ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">On Deck</p>
                      <p className="mt-2 text-lg font-semibold text-white">{nextSong.title}</p>
                      <p className="mt-2 text-sm font-medium text-emerald-200">
                        Key: {nextSong.key?.trim() || "—"}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">
                      You&apos;re at the end of the loaded setlist.
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </section>
        )}
      </div>

      {lyricsOpen && currentSong?.lyrics?.trim() ? (
        <div
          ref={lyricsOverlayRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 px-4 py-6 backdrop-blur outline-none"
          style={{ height: "100dvh", WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex min-h-full items-start justify-center">
          <div
            className={`flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[2rem] p-5 shadow-[0_40px_100px_-55px_rgba(15,23,42,0.95)] ${
              lyricsReadingMode
                ? "border border-stone-300 bg-white"
                : "border border-white/10 bg-slate-950"
            }`}
          >
            <div
              className={`flex items-center justify-between gap-4 pb-4 ${
                lyricsReadingMode ? "border-b border-stone-200" : "border-b border-white/10"
              }`}
            >
              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.24em] ${
                    lyricsReadingMode ? "text-stone-500" : "text-emerald-300/80"
                  }`}
                >
                  Lyrics
                </p>
                <h3
                  className={`mt-2 text-2xl font-bold ${
                    lyricsReadingMode ? "text-stone-950" : "text-white"
                  }`}
                >
                  {currentSong.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLyricsReadingMode((currentValue) => !currentValue)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                    lyricsReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  {lyricsReadingMode ? "Switch to Dark Mode" : "Switch to Reading Mode"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLyricsFontSize((currentSize) =>
                      clampModalFontSize(currentSize - 2, LIVE_LYRICS_FONT_SIZE_DEFAULT),
                    )
                  }
                  disabled={lyricsFontSize <= LIVE_MODAL_FONT_SIZE_MIN}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    lyricsReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLyricsFontSize((currentSize) =>
                      clampModalFontSize(currentSize + 2, LIVE_LYRICS_FONT_SIZE_DEFAULT),
                    )
                  }
                  disabled={lyricsFontSize >= LIVE_MODAL_FONT_SIZE_MAX}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    lyricsReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  A+
                </button>
                <button
                  type="button"
                  onClick={() => setLyricsOpen(false)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    lyricsReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              ref={lyricsScrollContainerRef}
              className={`mt-4 rounded-[1.5rem] border px-4 py-4 pr-3 ${
                lyricsReadingMode
                  ? "border-stone-300 bg-white [color-scheme:light]"
                  : "border-white/10 bg-slate-900"
              }`}
            >
              <div
                className={`font-sans ${
                  lyricsReadingMode ? "text-stone-950" : "text-slate-100"
                }`}
                style={{
                  fontSize: `${lyricsFontSize}px`,
                  lineHeight: Math.max(lyricsFontSize * 1.55, lyricsFontSize + 10) / lyricsFontSize,
                }}
              >
                {currentSong.lyrics.split(/\r?\n/).map((line, index) => {
                  const isSectionMarker = isLyricSectionMarker(line);

                  return (
                    <div
                      key={`lyrics-line-${index}`}
                      className={`whitespace-pre-wrap ${
                        isSectionMarker
                          ? lyricsReadingMode
                            ? "pt-2 text-[1.08em] font-extrabold tracking-[0.03em] text-emerald-800"
                            : "pt-2 text-[1.08em] font-extrabold tracking-[0.03em] text-emerald-300"
                          : ""
                      }`}
                    >
                      {line || "\u00A0"}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        </div>
      ) : null}

      {songIntroOpen && isLeaderUnlocked && currentSong?.songIntroNotes ? (
        <div
          ref={songIntroOverlayRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 px-4 py-6 backdrop-blur outline-none"
          style={{ height: "100dvh", WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex min-h-full items-start justify-center">
          <div
            className={`flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[2rem] p-5 shadow-[0_40px_100px_-55px_rgba(15,23,42,0.95)] ${
              songIntroReadingMode
                ? "border border-stone-300 bg-white"
                : "border border-white/10 bg-slate-950"
            }`}
          >
            <div
              className={`flex items-center justify-between gap-4 pb-4 ${
                songIntroReadingMode ? "border-b border-stone-200" : "border-b border-white/10"
              }`}
            >
              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.24em] ${
                    songIntroReadingMode ? "text-stone-500" : "text-amber-300/80"
                  }`}
                >
                  Song Intro
                </p>
                <h3 className={`mt-2 text-2xl font-bold ${songIntroReadingMode ? "text-stone-950" : "text-white"}`}>
                  {currentSong.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSongIntroReadingMode((currentValue) => !currentValue)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                    songIntroReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  {songIntroReadingMode ? "Switch to Dark Mode" : "Switch to Reading Mode"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSongIntroFontSize((currentSize) =>
                      clampModalFontSize(currentSize - 2, LIVE_SONG_INTRO_FONT_SIZE_DEFAULT),
                    )
                  }
                  disabled={songIntroFontSize <= LIVE_MODAL_FONT_SIZE_MIN}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    songIntroReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSongIntroFontSize((currentSize) =>
                      clampModalFontSize(currentSize + 2, LIVE_SONG_INTRO_FONT_SIZE_DEFAULT),
                    )
                  }
                  disabled={songIntroFontSize >= LIVE_MODAL_FONT_SIZE_MAX}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    songIntroReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  A+
                </button>
                {currentSong.lyrics?.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSongIntroOpen(false);
                      setLyricsOpen(true);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      songIntroReadingMode
                        ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                        : "border border-sky-400/20 bg-sky-500/15 text-sky-100 hover:bg-sky-500/20"
                    }`}
                  >
                    Open Lyrics
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSongIntroOpen(false)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    songIntroReadingMode
                      ? "border border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200"
                      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              ref={songIntroScrollContainerRef}
              className={`mt-4 rounded-[1.5rem] border px-4 py-4 pr-3 ${
                songIntroReadingMode
                  ? "border-stone-300 bg-white [color-scheme:light]"
                  : "border-white/10 bg-slate-900"
              }`}
            >
              <pre
                className={`whitespace-pre-wrap font-sans ${
                  songIntroReadingMode ? "text-stone-950" : "text-slate-100"
                }`}
                style={{
                  fontSize: `${songIntroFontSize}px`,
                  lineHeight: Math.max(songIntroFontSize * 1.55, songIntroFontSize + 10) / songIntroFontSize,
                }}
              >
                {currentSong.songIntroNotes}
              </pre>
            </div>
          </div>
          </div>
        </div>
      ) : null}

      {showStartConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-slate-950 p-5 shadow-[0_32px_80px_-48px_rgba(15,23,42,0.98)]">
            <h3 className="text-lg font-bold text-white">Start Show</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Return everyone to the first song in the show?
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowStartConfirmOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStartConfirmOpen(false);
                  void updateSharedSongIndex(0);
                }}
                className="rounded-xl border border-sky-400/20 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
              >
                Start Show
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function getMinutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function getClockWindowState(date: Date) {
  const currentMinutes = getMinutesSinceMidnight(date);
  const toMinutes = (value: { hour: number; minute: number }) => value.hour * 60 + value.minute;
  const intermissionStart = toMinutes(LIVE_SHOW_TIMING.intermissionWindow.start);
  const intermissionEnd = toMinutes(LIVE_SHOW_TIMING.intermissionWindow.end);
  const showEndStart = toMinutes(LIVE_SHOW_TIMING.showEndWindow.start);
  const showEndEnd = toMinutes(LIVE_SHOW_TIMING.showEndWindow.end);

  if (currentMinutes >= intermissionStart && currentMinutes <= intermissionEnd) {
    return {
      label: LIVE_SHOW_TIMING.intermissionWindow.label,
      className: "border-rose-400/30 bg-rose-500/12 text-rose-100",
      accentClassName: "text-rose-200",
    };
  }

  if (currentMinutes >= showEndStart && currentMinutes <= showEndEnd) {
    return {
      label: LIVE_SHOW_TIMING.showEndWindow.label,
      className: "border-rose-400/30 bg-rose-500/12 text-rose-100",
      accentClassName: "text-rose-200",
    };
  }

  return {
    label: "Current Time",
    className: "border-white/10 bg-white/5 text-slate-100",
    accentClassName: "text-emerald-200",
  };
}

