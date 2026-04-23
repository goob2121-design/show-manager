"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "@/app/components/admin-gate";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import type { GuestProfile, SetlistEntry, ShowGuestSong, ShowRecord } from "@/lib/types";

type SetlistEntryRow = SetlistEntry & {
  guest_song?: ShowGuestSong | ShowGuestSong[] | null;
};

type ShowFormState = {
  name: string;
  showDate: string;
  venue: string;
  slug: string;
};

type DashboardTab = "active" | "create" | "archived";

type PrefillSource = "" | string;
type CopyLinkRole = "guest" | "band" | "admin" | "mc";
type CopyMenuDirection = "up" | "down";

type CurrentShowDashboardMetrics = {
  songLibraryCount: number | null;
  guestSongs: ShowGuestSong[];
  guestProfiles: GuestProfile[];
  setlistEntries: Array<Pick<SetlistEntry, "id" | "guest_song_id" | "section">>;
};

const initialFormState: ShowFormState = {
  name: "",
  showDate: "",
  venue: "",
  slug: "",
};

const dashboardTabs: Array<{
  id: DashboardTab;
  label: string;
  description: string;
}> = [
  {
    id: "active",
    label: "Active Shows",
    description: "Open portals, update details, and manage the current lineup.",
  },
  {
    id: "create",
    label: "Create Show",
    description: "Spin up a new show record and jump directly into setup.",
  },
  {
    id: "archived",
    label: "Archived Shows",
    description: "Restore older shows safely without losing related show data.",
  },
];

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to Supabase.";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildShowFormState(show: Pick<ShowRecord, "name" | "show_date" | "venue" | "slug">) {
  return {
    name: show.name,
    showDate: show.show_date ?? "",
    venue: show.venue ?? "",
    slug: show.slug,
  };
}

function buildDuplicateFormState() {
  return {
    name: "",
    showDate: "",
    venue: "",
    slug: "",
  };
}

function normalizeGuestName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getCurrentShow(shows: ShowRecord[], today: string) {
  const activeShows = shows.filter((show) => !show.is_archived);
  const upcomingShows = activeShows.filter((show) => show.show_date && show.show_date >= today);

  return upcomingShows[0] ?? activeShows[0] ?? null;
}

function getSetlistSectionLabel(section: SetlistEntry["section"]) {
  if (section === "set2") {
    return "Set 2";
  }

  if (section === "encore") {
    return "Encore";
  }

  return "Set 1";
}

function getShowCardTone(isArchived: boolean) {
  if (isArchived) {
    return {
      card: "border-amber-300 bg-amber-50",
      badge: "bg-amber-200 text-amber-900",
      divider: "border-amber-300",
      metaCard: "border-amber-300 bg-white/80",
      status: "Archived",
    };
  }

  return {
    card: "border-stone-200 bg-white",
    badge: "bg-emerald-100 text-emerald-800",
    divider: "border-stone-200",
    metaCard: "border-stone-200 bg-stone-50",
    status: "Active",
  };
}

export default function ShowsDashboardPage() {
  const router = useRouter();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [formState, setFormState] = useState<ShowFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>("active");
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [editFormState, setEditFormState] = useState<ShowFormState>(initialFormState);
  const [duplicatingShowId, setDuplicatingShowId] = useState<string | null>(null);
  const [duplicateFormState, setDuplicateFormState] = useState<ShowFormState>(
    buildDuplicateFormState(),
  );
  const [activeShowActionId, setActiveShowActionId] = useState<string | null>(null);
  const [prefillSourceShowId, setPrefillSourceShowId] = useState<PrefillSource>("");
  const [openCopyMenuShowId, setOpenCopyMenuShowId] = useState<string | null>(null);
  const [copyMenuDirection, setCopyMenuDirection] = useState<CopyMenuDirection>("down");
  const [currentShowMetrics, setCurrentShowMetrics] = useState<CurrentShowDashboardMetrics>({
    songLibraryCount: null,
    guestSongs: [],
    guestProfiles: [],
    setlistEntries: [],
  });

  const activeShows = shows.filter((show) => !show.is_archived);
  const archivedShows = shows.filter((show) => show.is_archived);
  const today = new Date().toISOString().slice(0, 10);
  const currentShow = getCurrentShow(shows, today);
  const upcomingShowsCount = activeShows.filter(
    (show) => show.show_date && show.show_date >= today,
  ).length;
  const guestSongIdsInSetlist = useMemo(
    () =>
      new Set(
        currentShowMetrics.setlistEntries
          .map((entry) => entry.guest_song_id)
          .filter((songId): songId is string => Boolean(songId)),
      ),
    [currentShowMetrics.setlistEntries],
  );
  const guestsMissingPhotos = currentShowMetrics.guestProfiles.filter(
    (guest) => !guest.photo_url?.trim(),
  );
  const pendingGuestSongs = currentShowMetrics.guestSongs.filter(
    (song) => !guestSongIdsInSetlist.has(song.id),
  );
  const guestsWithoutSongs = currentShowMetrics.guestProfiles.filter((guest) => {
    const guestName = normalizeGuestName(guest.name);

    if (!guestName) {
      return true;
    }

    return !currentShowMetrics.guestSongs.some(
      (song) => normalizeGuestName(song.submitted_by_name) === guestName,
    );
  });
  const guestsReadyCount = currentShowMetrics.guestProfiles.filter(
    (guest) => guest.permission_granted && Boolean(guest.photo_url?.trim()),
  ).length;
  const setlistSectionCounts = (["set1", "set2", "encore"] as const).map((section) => ({
    section,
    count: currentShowMetrics.setlistEntries.filter((entry) => entry.section === section).length,
  }));
  const guestNames = currentShowMetrics.guestProfiles
    .map((guest) => guest.name?.trim())
    .filter((name): name is string => Boolean(name));
  const needsAttentionItems = [
    ...guestsMissingPhotos.slice(0, 4).map((guest) => ({
      title: `${guest.name || "Unnamed guest"} needs a promo photo`,
      detail: "Add a photo in the guest profile before promo materials go out.",
    })),
    ...guestsWithoutSongs.slice(0, 4).map((guest) => ({
      title: `${guest.name || "Unnamed guest"} has no submitted songs`,
      detail: "Guest songs can be submitted through the guest portal or reviewed in admin.",
    })),
    ...(pendingGuestSongs.length > 0
      ? [
          {
            title: `${pendingGuestSongs.length} guest song${
              pendingGuestSongs.length === 1 ? "" : "s"
            } pending review`,
            detail: "Review guest-submitted songs and add the final choices to the setlist.",
          },
        ]
      : []),
  ].slice(0, 6);

  const loadShows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .order("show_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const nextShows = data ?? [];
      const nextCurrentShow = getCurrentShow(nextShows, new Date().toISOString().slice(0, 10));
      const { count: songLibraryCount, error: songLibraryCountError } = await supabase
        .from("songs")
        .select("id", { count: "exact", head: true });

      if (songLibraryCountError) {
        throw songLibraryCountError;
      }

      if (!nextCurrentShow) {
        setShows(nextShows);
        setCurrentShowMetrics({
          songLibraryCount: songLibraryCount ?? 0,
          guestSongs: [],
          guestProfiles: [],
          setlistEntries: [],
        });
        return;
      }

      const [
        { data: guestSongs, error: guestSongsError },
        { data: guestProfiles, error: guestProfilesError },
        { data: setlistEntries, error: setlistEntriesError },
      ] = await Promise.all([
        supabase
          .from("show_guest_songs")
          .select("*")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("guest_profiles")
          .select("*")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("setlist_entries")
          .select("id, guest_song_id, section")
          .eq("show_id", nextCurrentShow.id),
      ]);

      if (guestSongsError) {
        throw guestSongsError;
      }

      if (guestProfilesError) {
        throw guestProfilesError;
      }

      if (setlistEntriesError) {
        throw setlistEntriesError;
      }

      setShows(nextShows);
      setCurrentShowMetrics({
        songLibraryCount: songLibraryCount ?? 0,
        guestSongs: (guestSongs ?? []) as ShowGuestSong[],
        guestProfiles: (guestProfiles ?? []) as GuestProfile[],
        setlistEntries: (setlistEntries ?? []) as Array<Pick<SetlistEntry, "id" | "guest_song_id" | "section">>,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShows();
  }, [loadShows]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement>,
    options?: {
      mode?: "create" | "edit" | "duplicate";
      preserveManualSlug?: boolean;
    },
  ) {
    const { name, value } = event.target;
    const mode = options?.mode ?? "create";
    const preserveManualSlug = options?.preserveManualSlug ?? false;
    const setState =
      mode === "edit"
        ? setEditFormState
        : mode === "duplicate"
          ? setDuplicateFormState
          : setFormState;

    setState((currentState) => {
      if (name === "name") {
        return {
          ...currentState,
          name: value,
          slug:
            preserveManualSlug && currentState.slug
              ? currentState.slug
              : currentState.slug
                ? currentState.slug
                : slugify(value),
        };
      }

      if (name === "slug") {
        return {
          ...currentState,
          slug: slugify(value),
        };
      }

      return {
        ...currentState,
        [name]: value,
      };
    });
  }

  function startEditingShow(show: ShowRecord) {
    setDuplicatingShowId(null);
    setDuplicateFormState(buildDuplicateFormState());
    setEditingShowId(show.id);
    setEditFormState(buildShowFormState(show));
    setErrorMessage(null);
  }

  function cancelEditingShow() {
    setEditingShowId(null);
    setEditFormState(initialFormState);
  }

  function startDuplicatingShow(show: ShowRecord) {
    setEditingShowId(null);
    setEditFormState(initialFormState);
    setDuplicatingShowId(show.id);
    setDuplicateFormState({
      name: "",
      showDate: "",
      venue: show.venue ?? "",
      slug: "",
    });
    setErrorMessage(null);
  }

  function cancelDuplicatingShow() {
    setDuplicatingShowId(null);
    setDuplicateFormState(buildDuplicateFormState());
  }

  function validateShowValues({
    name,
    slug,
    existingShowId,
  }: {
    name: string;
    slug: string;
    existingShowId?: string;
  }) {
    if (!name) {
      return "Show name is required.";
    }

    if (!slug) {
      return "Slug is required.";
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return "Slug must be URL-friendly and use lowercase letters, numbers, and hyphens only.";
    }

    if (shows.some((show) => show.slug === slug && show.id !== existingShowId)) {
      return "A show with that slug already exists.";
    }

    return null;
  }

  function validateDuplicateValues({
    showDate,
    slug,
  }: {
    showDate: string;
    slug: string;
  }) {
    if (!showDate) {
      return "Show date is required when duplicating a show.";
    }

    return validateShowValues({
      name: "temporary-name",
      slug,
    });
  }

  async function handleCopyLink(slug: string, role: CopyLinkRole) {
    const routePath = `/${role}/${slug}`;
    const absoluteUrl =
      typeof window === "undefined" ? routePath : `${window.location.origin}${routePath}`;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      const nextKey = `${role}-${slug}`;
      setCopiedLinkKey(nextKey);
      setOpenCopyMenuShowId(null);

      window.setTimeout(() => {
        setCopiedLinkKey((currentKey) =>
          currentKey === nextKey ? null : currentKey,
        );
      }, 1800);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function handlePrefillFromExistingShow(event: ChangeEvent<HTMLSelectElement>) {
    const nextShowId = event.target.value;
    setPrefillSourceShowId(nextShowId);

    if (!nextShowId) {
      setFormState(initialFormState);
      return;
    }

    const sourceShow = shows.find((show) => show.id === nextShowId);

    if (!sourceShow) {
      return;
    }

    setFormState({
      name: "",
      showDate: "",
      venue: sourceShow.venue ?? "",
      slug: "",
    });
  }

  function handleToggleCopyMenu(event: MouseEvent<HTMLButtonElement>, showId: string) {
    if (openCopyMenuShowId === showId) {
      setOpenCopyMenuShowId(null);
      return;
    }

    const buttonRect = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = 196;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    setCopyMenuDirection(
      spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? "up" : "down",
    );
    setOpenCopyMenuShowId(showId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = formState.name.trim();
    const slug = slugify(formState.slug);
    const validationError = validateShowValues({ name, slug });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .insert({
          name,
          slug,
          show_date: formState.showDate || null,
          venue: formState.venue.trim() || null,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      router.push(`/admin/${data.slug}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveShow(event: FormEvent<HTMLFormElement>, showId: string) {
    event.preventDefault();

    const name = editFormState.name.trim();
    const slug = slugify(editFormState.slug);
    const validationError = validateShowValues({ name, slug, existingShowId: showId });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setActiveShowActionId(showId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({
          name,
          slug,
          show_date: editFormState.showDate || null,
          venue: editFormState.venue.trim() || null,
        })
        .eq("id", showId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShows((currentShows) =>
        currentShows.map((show) => (show.id === showId ? data : show)),
      );
      cancelEditingShow();
      void loadShows();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  async function handleSetArchived(showId: string, nextArchivedValue: boolean) {
    setErrorMessage(null);
    setActiveShowActionId(showId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({ is_archived: nextArchivedValue })
        .eq("id", showId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShows((currentShows) =>
        currentShows.map((show) => (show.id === showId ? data : show)),
      );

      if (editingShowId === showId) {
        cancelEditingShow();
      }

      if (duplicatingShowId === showId) {
        cancelDuplicatingShow();
      }

      void loadShows();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  async function handleDuplicateShow(event: FormEvent<HTMLFormElement>, sourceShow: ShowRecord) {
    event.preventDefault();

    const name = duplicateFormState.name.trim() || sourceShow.name;
    const showDate = duplicateFormState.showDate;
    const slug = slugify(duplicateFormState.slug);
    const validationError = validateDuplicateValues({ showDate, slug });

    if (!name) {
      setErrorMessage("Show name is required.");
      return;
    }

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setActiveShowActionId(sourceShow.id);

    try {
      const supabase = createClient();
      const { data: createdShow, error: createShowError } = await supabase
        .from("shows")
        .insert({
          name,
          slug,
          show_date: showDate,
          venue: sourceShow.venue,
          venue_address: sourceShow.venue_address,
          directions_url: sourceShow.directions_url,
          call_time: sourceShow.call_time,
          soundcheck_time: sourceShow.soundcheck_time,
          guest_arrival_time: sourceShow.guest_arrival_time,
          band_arrival_time: sourceShow.band_arrival_time,
          show_start_time: sourceShow.show_start_time,
          contact_name: sourceShow.contact_name,
          contact_phone: sourceShow.contact_phone,
          parking_notes: sourceShow.parking_notes,
          load_in_notes: sourceShow.load_in_notes,
          announcements: sourceShow.announcements,
          guest_message: sourceShow.guest_message,
          opening_script: sourceShow.opening_script,
          intermission_script: sourceShow.intermission_script,
          closing_script: sourceShow.closing_script,
          is_archived: false,
        })
        .select("*")
        .single();

      if (createShowError) {
        throw createShowError;
      }

      const { data: sourceSetlist, error: sourceSetlistError } = await supabase
        .from("setlist_entries")
        .select(`
          *,
          guest_song:guest_song_id (
            id,
            show_id,
            title,
            key,
            tempo,
            song_type,
            submitted_by_name,
            created_at
          )
        `)
        .eq("show_id", sourceShow.id)
        .order("position", { ascending: true });

      if (sourceSetlistError) {
        await supabase.from("shows").delete().eq("id", createdShow.id);
        throw sourceSetlistError;
      }

      const typedSetlist = (sourceSetlist ?? []) as SetlistEntryRow[];

      if (typedSetlist.length > 0) {
        const guestSongsToClone = typedSetlist
          .filter((song) => song.source_type === "guest")
          .map((song) => (Array.isArray(song.guest_song) ? song.guest_song[0] : song.guest_song))
          .filter((song): song is ShowGuestSong => Boolean(song));
        const guestSongIdMap = new Map<string, string>();

        if (guestSongsToClone.length > 0) {
          const { data: insertedGuestSongs, error: insertGuestSongsError } = await supabase
            .from("show_guest_songs")
            .insert(
              guestSongsToClone.map((song) => ({
                show_id: createdShow.id,
                title: song.title,
                key: song.key,
                tempo: song.tempo,
                song_type: song.song_type,
                submitted_by_name: song.submitted_by_name,
              })),
            )
            .select("*");

          if (insertGuestSongsError) {
            await supabase.from("shows").delete().eq("id", createdShow.id);
            throw insertGuestSongsError;
          }

          guestSongsToClone.forEach((song, index) => {
            const insertedSong = insertedGuestSongs?.[index];
            if (insertedSong) {
              guestSongIdMap.set(song.id, insertedSong.id);
            }
          });
        }

        const { error: insertSetlistError } = await supabase.from("setlist_entries").insert(
          typedSetlist.map((song) => ({
            show_id: createdShow.id,
            section: song.section,
            position: song.position,
            source_type: song.source_type,
            song_id: song.source_type === "library" ? song.song_id : null,
            guest_song_id:
              song.source_type === "guest" && song.guest_song_id
                ? guestSongIdMap.get(song.guest_song_id) ?? null
                : null,
            custom_title: song.custom_title,
          })),
        );

        if (insertSetlistError) {
          await supabase.from("shows").delete().eq("id", createdShow.id);
          throw insertSetlistError;
        }
      }

      router.push(`/admin/${createdShow.slug}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  function renderPortalLinks(show: ShowRecord) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/guest/${show.slug}`}
          className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          Guest
        </Link>
        <Link
          href={`/band/${show.slug}`}
          className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          Band
        </Link>
        <Link
          href={`/mc/${show.slug}`}
          className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          MC
        </Link>
        <Link
          href={`/admin/${show.slug}`}
          className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          Admin
        </Link>
      </div>
    );
  }

  function renderEditForm(show: ShowRecord, title: string, description: string) {
    return (
      <form className="grid gap-4" onSubmit={(event) => handleSaveShow(event, show.id)}>
        <div className="flex flex-col gap-1">
          <h4 className="text-lg font-semibold text-stone-900">{title}</h4>
          <p className="text-sm text-stone-600">{description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Show Name
            <input
              type="text"
              name="name"
              value={editFormState.name}
              onChange={(event) =>
                handleChange(event, {
                  mode: "edit",
                  preserveManualSlug: true,
                })
              }
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Show Date
            <input
              type="date"
              name="showDate"
              value={editFormState.showDate}
              onChange={(event) => handleChange(event, { mode: "edit" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Venue
            <input
              type="text"
              name="venue"
              value={editFormState.venue}
              onChange={(event) => handleChange(event, { mode: "edit" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Slug
            <input
              type="text"
              name="slug"
              value={editFormState.slug}
              onChange={(event) => handleChange(event, { mode: "edit" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              required
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={activeShowActionId === show.id}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={cancelEditingShow}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  function renderDuplicateForm(show: ShowRecord, description: string) {
    return (
      <form className="grid gap-4" onSubmit={(event) => handleDuplicateShow(event, show)}>
        <div className="flex flex-col gap-1">
          <h4 className="text-lg font-semibold text-stone-900">Duplicate {show.name}</h4>
          <p className="text-sm text-stone-600">{description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            New Show Name
            <input
              type="text"
              name="name"
              value={duplicateFormState.name}
              onChange={(event) =>
                handleChange(event, {
                  mode: "duplicate",
                  preserveManualSlug: true,
                })
              }
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              placeholder={show.name}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            New Show Date
            <input
              type="date"
              name="showDate"
              value={duplicateFormState.showDate}
              onChange={(event) => handleChange(event, { mode: "duplicate" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          New Slug
          <input
            type="text"
            name="slug"
            value={duplicateFormState.slug}
            onChange={(event) => handleChange(event, { mode: "duplicate" })}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder={`${show.slug}-copy`}
            required
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={activeShowActionId === show.id}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            Create Duplicate
          </button>
          <button
            type="button"
            onClick={cancelDuplicatingShow}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  function renderShowCard(show: ShowRecord, isArchived: boolean) {
    const isEditing = editingShowId === show.id;
    const isDuplicating = duplicatingShowId === show.id;
    const tone = getShowCardTone(isArchived);
    const isCopyMenuOpen = openCopyMenuShowId === show.id;

    return (
      <article
        key={show.id}
        className={`rounded-3xl border p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6 ${tone.card}`}
      >
        {isEditing
          ? renderEditForm(
              show,
              isArchived ? "Edit Archived Show" : "Edit Show",
              isArchived
                ? "Update the archived record now, then restore it whenever you're ready."
                : "Update the core show details without affecting setlists, guests, or portal data.",
            )
          : isDuplicating
            ? renderDuplicateForm(
                show,
                isArchived
                  ? "Build a fresh active show from this archived template."
                  : "Create a new active show with the same itinerary, settings, and official setlist.",
              )
            : (
              <>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${tone.badge}`}
                        >
                          {tone.status}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                          {show.slug}
                        </span>
                      </div>
                      <h4 className="max-w-[18ch] text-2xl font-semibold leading-tight tracking-tight text-stone-900 sm:max-w-none">
                        {show.name}
                      </h4>
                    </div>

                    <div
                      className={`flex min-h-[5.5rem] min-w-[9.5rem] items-center justify-center rounded-2xl border px-4 py-3 text-center text-sm font-medium leading-5 text-stone-600 ${tone.metaCard}`}
                    >
                      {formatShowDate(show.show_date)}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={`flex min-h-[5.25rem] flex-col justify-center rounded-2xl border px-4 py-3 ${tone.metaCard}`}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Venue
                      </p>
                      <p className="mt-1 text-sm text-stone-700">{show.venue || "Venue not set"}</p>
                    </div>

                    <div className={`flex min-h-[5.25rem] flex-col justify-center rounded-2xl border px-4 py-3 ${tone.metaCard}`}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Slug
                      </p>
                      <p className="mt-1 text-sm text-stone-700">{show.slug}</p>
                    </div>
                  </div>
                </div>

                <div className={`mt-5 grid gap-3 border-t pt-5 ${tone.divider}`}>
                  {renderPortalLinks(show)}

                  <div className="grid gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => startEditingShow(show)}
                      className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => startDuplicatingShow(show)}
                      className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      Duplicate Show
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(event) => handleToggleCopyMenu(event, show.id)}
                        className="flex min-h-11 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        Copy Links
                      </button>

                      {isCopyMenuOpen ? (
                        <div
                          className={`absolute left-0 z-20 w-full min-w-[12rem] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
                            copyMenuDirection === "up" ? "bottom-full mb-2" : "top-full mt-2"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleCopyLink(show.slug, "guest")}
                            className="flex w-full items-center justify-center px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            {copiedLinkKey === `guest-${show.slug}` ? "Copied Guest Link" : "Copy Guest Link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(show.slug, "band")}
                            className="flex w-full items-center justify-center border-t border-stone-200 px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            {copiedLinkKey === `band-${show.slug}` ? "Copied Band Link" : "Copy Band Link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(show.slug, "mc")}
                            className="flex w-full items-center justify-center border-t border-stone-200 px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            {copiedLinkKey === `mc-${show.slug}` ? "Copied MC Link" : "Copy MC Link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(show.slug, "admin")}
                            className="flex w-full items-center justify-center border-t border-stone-200 px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            {copiedLinkKey === `admin-${show.slug}` ? "Copied Admin Link" : "Copy Admin Link"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSetArchived(show.id, !isArchived)}
                      disabled={activeShowActionId === show.id}
                      className={`flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white transition disabled:cursor-not-allowed ${
                        isArchived
                          ? "bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400"
                          : "bg-stone-800 hover:bg-black disabled:bg-stone-500"
                      }`}
                    >
                      {isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>

                </div>
              </>
            )}
      </article>
    );
  }

  return (
    <AdminGate
      slug="shows-dashboard"
      resourceLabel="the show management dashboard"
      continueLabel="Continue to Dashboard"
    >
      <main className="min-h-screen bg-gradient-to-b from-stone-100 via-stone-50 to-stone-100 px-4 py-8 text-stone-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100 sm:px-6 sm:py-10">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          {currentShow ? (
            <div className="sticky top-3 z-30">
              <AdminQuickNav
                slug={currentShow.slug}
                accessSlug="shows-dashboard"
                currentView="dashboard"
              />
            </div>
          ) : null}

          <header className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-stone-900 px-6 py-8 text-white sm:px-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  {showLogo ? (
                    <Image
                      src="/cmms-logo.png"
                      alt="CMMS logo"
                      width={88}
                      height={88}
                      className="h-16 w-auto rounded-2xl bg-white/95 p-2 object-contain shadow-sm"
                      onError={() => setShowLogo(false)}
                      priority
                    />
                  ) : null}

                  <div className="max-w-2xl space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-100">
                      CMMS Control Center
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                      Show Manager
                    </h1>
                    <p className="text-sm leading-6 text-emerald-50/90 sm:text-base">
                      Manage your shows, guests, and setlists.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-3 sm:items-end">
                  <div className="flex items-center justify-end gap-3">
                    <ThemeToggle />
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-emerald-50 backdrop-blur">
                    Dashboard access stays protected by the admin password gate.
                  </div>
                </div>
              </div>
            </div>
          </header>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                  Current Show Command Center
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">
                  Current Show Snapshot
                </h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">
                  The next active show gets priority here, with setup signals pulled from the
                  guest, song, and setlist data already in the app.
                </p>
              </div>

              {currentShow ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                  {formatShowDate(currentShow.show_date)}
                </div>
              ) : null}
            </div>

            {isLoading ? (
              <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                Loading current show snapshot...
              </div>
            ) : currentShow ? (
              <div className="mt-5 grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      label: "Current Show",
                      value: currentShow.name,
                      detail: currentShow.venue || "Venue not set",
                    },
                    {
                      label: "Songs in Library",
                      value: currentShowMetrics.songLibraryCount?.toString() ?? "0",
                      detail: "Reusable songs available to build from",
                    },
                    {
                      label: "Guest Songs Submitted",
                      value: currentShowMetrics.guestSongs.length.toString(),
                      detail: "Guest song choices attached to this show",
                    },
                    {
                      label: "Guests Ready",
                      value: `${guestsReadyCount}/${currentShowMetrics.guestProfiles.length}`,
                      detail: "Profiles with permission and a promo photo",
                    },
                    {
                      label: "Missing Promo Photos",
                      value: guestsMissingPhotos.length.toString(),
                      detail: "Guest profiles still missing photo assets",
                    },
                    {
                      label: "Pending Review",
                      value: pendingGuestSongs.length.toString(),
                      detail: "Guest songs not yet placed in the setlist",
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
                        {card.label}
                      </p>
                      <p className="mt-2 break-words text-2xl font-semibold text-stone-900 dark:text-slate-100">
                        {card.value}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-stone-600 dark:text-slate-300">
                        {card.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-5">
                  <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 sm:p-5">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-semibold text-stone-900 dark:text-slate-100">
                        Needs Attention
                      </h3>
                      <p className="text-sm text-stone-600 dark:text-slate-300">
                        A short punch list for the current show.
                      </p>
                    </div>

                    {needsAttentionItems.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                        Everything for this show is looking good.
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3">
                        {needsAttentionItems.map((item) => (
                          <article
                            key={`${item.title}-${item.detail}`}
                            className="rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900"
                          >
                            <h4 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                              {item.title}
                            </h4>
                            <p className="mt-1 text-sm leading-5 text-stone-600 dark:text-slate-300">
                              {item.detail}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 sm:p-5">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-semibold text-stone-900 dark:text-slate-100">
                        Show Details
                      </h3>
                      <p className="text-sm text-stone-600 dark:text-slate-300">
                        A quick read on who is booked and how the setlist is shaping up.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4">
                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
                          Show
                        </p>
                        <Link
                          href={`/admin/${currentShow.slug}?tab=show-details`}
                          className="mt-2 block text-base font-semibold text-stone-900 underline-offset-4 transition hover:text-emerald-700 hover:underline dark:text-slate-100 dark:hover:text-emerald-300"
                        >
                          {currentShow.name}
                        </Link>
                        <div className="mt-2 grid gap-1 text-sm text-stone-600 dark:text-slate-300">
                          <p>{formatShowDate(currentShow.show_date)}</p>
                          <p>{currentShow.venue || "Venue not set"}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
                          Guests
                        </p>
                        {guestNames.length === 0 ? (
                          <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">
                            No guest names added yet.
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {guestNames.map((guestName, guestIndex) => (
                              <Link
                                key={`${guestName}-${guestIndex}`}
                                href={`/admin/${currentShow.slug}?tab=guests`}
                                className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm font-medium text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-100"
                              >
                                {guestName}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
                          Setlist Songs
                        </p>
                        <div className="mt-3 grid gap-2">
                          {setlistSectionCounts.map((item) => (
                            <Link
                              key={item.section}
                              href={`/admin/${currentShow.slug}?tab=setlist`}
                              className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm transition hover:bg-emerald-50 dark:bg-slate-950 dark:hover:bg-emerald-950/40"
                            >
                              <span className="font-medium text-stone-700 dark:text-slate-200">
                                {getSetlistSectionLabel(item.section)}
                              </span>
                              <span className="font-semibold text-stone-900 dark:text-slate-100">
                                {item.count} {item.count === 1 ? "song" : "songs"}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                No active show is available yet. Create a show to light up the command center.
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 dark:border-slate-800">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">Dashboard</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">
                  Switch between active shows, new show setup, and archived cleanup without
                  digging through one long page.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 rounded-2xl bg-stone-100 p-2 dark:bg-slate-950/70">
                {dashboardTabs.map((tab) => {
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex min-w-[10rem] flex-1 flex-col rounded-xl px-4 py-3 text-left transition sm:min-w-[11rem] ${
                        isActive
                          ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
                          : "text-stone-600 hover:bg-white/80 hover:text-stone-900"
                      }`}
                    >
                      <span className="text-sm font-semibold">{tab.label}</span>
                      <span className="mt-1 text-xs leading-5 text-stone-500">
                        {tab.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {activeTab === "active" ? (
              <section className="pt-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-semibold text-stone-900">Active Shows</h3>
                  <p className="text-sm text-stone-600">
                    Jump into any portal, copy links for the team, or make quick show-management
                    changes from one place.
                  </p>
                </div>

                {isLoading ? (
                  <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                    Loading shows...
                  </div>
                ) : activeShows.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500">
                    No active shows yet. Open the Create Show tab to get the next event started.
                  </div>
                ) : (
                  <div className="mt-5 grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                    {activeShows.map((show) => renderShowCard(show, false))}
                  </div>
                )}
              </section>
            ) : null}

            {activeTab === "create" ? (
              <section className="pt-6">
                <div className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-stone-50 p-5 sm:p-6">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-xl font-semibold text-stone-900">Create New Show</h3>
                    <p className="text-sm text-stone-600">
                      Start a new show record here, then jump straight into the admin portal to
                      finish setup.
                    </p>
                  </div>

                  <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Duplicate Existing Show
                      <select
                        value={prefillSourceShowId}
                        onChange={handlePrefillFromExistingShow}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Start from a blank show</option>
                        {shows.map((show) => (
                          <option key={show.id} value={show.id}>
                            {show.name} ({show.slug})
                          </option>
                        ))}
                      </select>
                      <span className="text-xs font-normal text-stone-500">
                        Optional: prefill the venue from an existing show to speed up setup.
                      </span>
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Show Name
                      <input
                        type="text"
                        name="name"
                        value={formState.name}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Cumberland Mountain Music Show"
                        required
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Show Date
                        <input
                          type="date"
                          name="showDate"
                          value={formState.showDate}
                          onChange={handleChange}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Venue
                        <input
                          type="text"
                          name="venue"
                          value={formState.venue}
                          onChange={handleChange}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          placeholder="Optional venue"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Slug
                      <input
                        type="text"
                        name="slug"
                        value={formState.slug}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="cmms-april-27"
                        required
                      />
                    </label>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                      >
                        {isSubmitting ? "Creating Show..." : "Create Show"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPrefillSourceShowId("");
                          setFormState(initialFormState);
                        }}
                        className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        Clear Form
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            ) : null}

            {activeTab === "archived" ? (
              <section className="pt-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-semibold text-stone-900">Archived Shows</h3>
                  <p className="text-sm text-stone-600">
                    Hide old or mistaken shows from the main control center while keeping them
                    fully restorable.
                  </p>
                </div>

                {isLoading ? (
                  <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                    Loading archived shows...
                  </div>
                ) : archivedShows.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500">
                    No archived shows yet.
                  </div>
                ) : (
                  <div className="mt-5 grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                    {archivedShows.map((show) => renderShowCard(show, true))}
                  </div>
                )}
              </section>
            ) : null}
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">
                Archive & Totals
              </h2>
              <p className="text-sm text-stone-600 dark:text-slate-300">
                The original show counts are still here, just out of the main command-center lane.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
                  Active Shows
                </p>
                <p className="mt-2 text-3xl font-semibold text-stone-900 dark:text-slate-100">{activeShows.length}</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">Shows currently visible and in rotation</p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
                  Archived Shows
                </p>
                <p className="mt-2 text-3xl font-semibold text-stone-900 dark:text-slate-100">{archivedShows.length}</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">Stored safely for later reference or restore</p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
                  Upcoming Shows
                </p>
                <p className="mt-2 text-3xl font-semibold text-stone-900 dark:text-slate-100">{upcomingShowsCount}</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">Active shows with a date still ahead</p>
              </div>
            </div>
          </section>
        </section>
      </main>
    </AdminGate>
  );
}
