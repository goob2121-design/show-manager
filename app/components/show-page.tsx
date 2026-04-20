"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  GuestProfile,
  GuestProfileFormState,
  PendingSubmission,
  SetlistSong,
  ShowDetailsFormState,
  ShowRecord,
  SongFormState,
  ViewMode,
} from "@/lib/types";

type PrintMode = "stage" | "band" | "standard";

const initialFormState: SongFormState = {
  title: "",
  artist: "",
  key: "",
  notes: "",
  lyrics: "",
};

const initialGuestProfileFormState: GuestProfileFormState = {
  name: "",
  shortBio: "",
  fullBio: "",
  hometown: "",
  instruments: "",
  facebook: "",
  instagram: "",
  website: "",
  permissionGranted: false,
};

const initialShowDetailsFormState: ShowDetailsFormState = {
  venue: "",
  venueAddress: "",
  directionsUrl: "",
  callTime: "",
  soundcheckTime: "",
  guestArrivalTime: "",
  bandArrivalTime: "",
  showStartTime: "",
  contactName: "",
  contactPhone: "",
  parkingNotes: "",
  loadInNotes: "",
  announcements: "",
  guestMessage: "",
};

type ShowInfoItem = {
  label: string;
  value: string;
  href?: string;
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to Supabase.";
}

function sortSetlistSongs(songs: SetlistSong[]) {
  return [...songs].sort((songA, songB) => songA.position - songB.position);
}

function normalizeGuestProfileName(name: string) {
  return name.trim().toLowerCase();
}

function normalizeOptionalField(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function mapShowToDetailsFormState(show: ShowRecord): ShowDetailsFormState {
  return {
    venue: show.venue ?? "",
    venueAddress: show.venue_address ?? "",
    directionsUrl: show.directions_url ?? "",
    callTime: show.call_time ?? "",
    soundcheckTime: show.soundcheck_time ?? "",
    guestArrivalTime: show.guest_arrival_time ?? "",
    bandArrivalTime: show.band_arrival_time ?? "",
    showStartTime: show.show_start_time ?? "",
    contactName: show.contact_name ?? "",
    contactPhone: show.contact_phone ?? "",
    parkingNotes: show.parking_notes ?? "",
    loadInNotes: show.load_in_notes ?? "",
    announcements: show.announcements ?? "",
    guestMessage: show.guest_message ?? "",
  };
}

function ShowInfoCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ShowInfoItem[];
}) {
  const visibleItems = items.filter((item) => item.value.trim());

  return (
    <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-stone-600">{subtitle}</p>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
          No itinerary details have been added yet.
        </div>
      ) : (
        <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 sm:p-5">
          {visibleItems.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className={
                item.label === "Parking Notes" ||
                item.label === "Load-In Notes" ||
                item.label === "Announcements"
                  ? "sm:col-span-2"
                  : undefined
              }
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                {item.label}
              </p>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block break-words text-sm font-medium text-emerald-700 underline"
                >
                  {item.value}
                </a>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{item.value}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type ShowPageProps = {
  showSlug?: string;
  initialRole?: ViewMode;
  showRoleToggle?: boolean;
};

function getPortalLabel(role: ViewMode) {
  if (role === "admin") {
    return "Admin Portal";
  }

  if (role === "band") {
    return "Band Portal";
  }

  return "Guest Portal";
}

export function ShowPage({
  showSlug = "cmms-april-27",
  initialRole = "guest",
  showRoleToggle = true,
}: ShowPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialRole);
  const [printMode, setPrintMode] = useState<PrintMode>("standard");
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [setlist, setSetlist] = useState<SetlistSong[]>([]);
  const [formState, setFormState] = useState<SongFormState>(initialFormState);
  const [showDetailsFormState, setShowDetailsFormState] = useState<ShowDetailsFormState>(
    initialShowDetailsFormState,
  );
  const [guestProfileFormState, setGuestProfileFormState] = useState<GuestProfileFormState>(
    initialGuestProfileFormState,
  );
  const [guestPhotoFile, setGuestPhotoFile] = useState<File | null>(null);
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [pendingSongs, setPendingSongs] = useState<PendingSubmission[]>([]);
  const [openLyricsIndex, setOpenLyricsIndex] = useState<number | null>(null);
  const [editingLyricsIndex, setEditingLyricsIndex] = useState<number | null>(null);
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingShowDetails, setIsSavingShowDetails] = useState(false);
  const [isSavingGuestProfile, setIsSavingGuestProfile] = useState(false);
  const [showDetailsMessage, setShowDetailsMessage] = useState<string | null>(null);
  const [showDetailsError, setShowDetailsError] = useState<string | null>(null);
  const [activePendingActionId, setActivePendingActionId] = useState<string | null>(null);
  const [activeSetlistActionId, setActiveSetlistActionId] = useState<string | null>(null);

  const formHeading =
    viewMode === "guest" ? "Submit Your Song Choice" : "Suggest a Song for the Show";
  const portalLabel = getPortalLabel(viewMode);

  function handlePrint(nextPrintMode: PrintMode) {
    setPrintMode(nextPrintMode);

    window.setTimeout(() => {
      window.print();
    }, 50);
  }

  const loadShowData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) {
        setIsLoading(true);
      }

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
          setShow(null);
          setSetlist([]);
          setPendingSongs([]);
          setGuestProfiles([]);
          setErrorMessage("Show not found");
          return;
        }

        setShow(showRecord);

        const [
          { data: setlistRows, error: setlistError },
          { data: pendingRows, error: pendingError },
          { data: guestProfileRows, error: guestProfilesError },
        ] =
          await Promise.all([
            supabase
              .from("setlist_songs")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("position", { ascending: true }),
            supabase
              .from("pending_submissions")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: true }),
            supabase
              .from("guest_profiles")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: true }),
          ]);

        if (setlistError) {
          throw setlistError;
        }

        if (pendingError) {
          throw pendingError;
        }

        if (guestProfilesError) {
          throw guestProfilesError;
        }

        setSetlist(setlistRows ?? []);
        setPendingSongs(pendingRows ?? []);
        setGuestProfiles(guestProfileRows ?? []);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (showSpinner) {
          setIsLoading(false);
        }
      }
    },
    [showSlug],
  );

  useEffect(() => {
    void loadShowData();
  }, [loadShowData]);

  useEffect(() => {
    if (!show) {
      return;
    }

    setShowDetailsFormState(mapShowToDetailsFormState(show));
  }, [show]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;

    setFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleShowDetailsChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;

    setShowDetailsFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleGuestProfileChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, type, value } = event.target;
    const checked = "checked" in event.target ? event.target.checked : false;

    setGuestProfileFormState((currentState) => ({
      ...currentState,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleGuestPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setGuestPhotoFile(nextFile);
  }

  async function handleShowDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setShowDetailsError("The show is not loaded yet.");
      return;
    }

    setShowDetailsMessage(null);
    setShowDetailsError(null);
    setIsSavingShowDetails(true);

    try {
      const supabase = createClient();
      const payload = {
        venue: normalizeOptionalField(showDetailsFormState.venue),
        venue_address: normalizeOptionalField(showDetailsFormState.venueAddress),
        directions_url: normalizeOptionalField(showDetailsFormState.directionsUrl),
        call_time: normalizeOptionalField(showDetailsFormState.callTime),
        soundcheck_time: normalizeOptionalField(showDetailsFormState.soundcheckTime),
        guest_arrival_time: normalizeOptionalField(showDetailsFormState.guestArrivalTime),
        band_arrival_time: normalizeOptionalField(showDetailsFormState.bandArrivalTime),
        show_start_time: normalizeOptionalField(showDetailsFormState.showStartTime),
        contact_name: normalizeOptionalField(showDetailsFormState.contactName),
        contact_phone: normalizeOptionalField(showDetailsFormState.contactPhone),
        parking_notes: normalizeOptionalField(showDetailsFormState.parkingNotes),
        load_in_notes: normalizeOptionalField(showDetailsFormState.loadInNotes),
        announcements: normalizeOptionalField(showDetailsFormState.announcements),
        guest_message: normalizeOptionalField(showDetailsFormState.guestMessage),
      };

      const { data, error } = await supabase
        .from("shows")
        .update(payload)
        .eq("id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShow(data);
      setShowDetailsMessage("Show details saved.");
    } catch (error) {
      setShowDetailsError(getErrorMessage(error));
    } finally {
      setIsSavingShowDetails(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const title = formState.title.trim();
    const artist = formState.artist.trim();

    if (!title || !artist) {
      return;
    }

    setActionError(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pending_submissions")
        .insert({
          show_id: show.id,
          title,
          artist,
          song_key: formState.key.trim() || null,
          notes: formState.notes.trim() || null,
          lyrics: formState.lyrics.trim() || null,
          submitted_by_role: viewMode === "guest" ? "Guest" : "Band",
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setPendingSongs((currentSongs) => [...currentSongs, data]);
      setFormState(initialFormState);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGuestProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const normalizedName = guestProfileFormState.name.trim();
    const shortBio = guestProfileFormState.shortBio.trim();

    if (!normalizedName || !shortBio) {
      setActionError("Guest profile name and short bio are required.");
      return;
    }

    setActionError(null);
    setIsSavingGuestProfile(true);

    try {
      const supabase = createClient();
      const existingProfile = guestProfiles.find(
        (profile) =>
          normalizeGuestProfileName(profile.name ?? "") ===
          normalizeGuestProfileName(normalizedName),
      );

      let photoUrl = existingProfile?.photo_url ?? null;

      if (guestPhotoFile) {
        const fileExt = guestPhotoFile.name.includes(".")
          ? guestPhotoFile.name.split(".").pop()
          : undefined;
        const fileName = `${Date.now()}-${normalizedName
          .replace(/[^a-z0-9]+/gi, "-")
          .toLowerCase()}`;
        const filePath = fileExt
          ? `${show.id}/${fileName}.${fileExt}`
          : `${show.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("guest-photos")
          .upload(filePath, guestPhotoFile, {
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("guest-photos")
          .getPublicUrl(filePath);

        photoUrl = publicUrlData.publicUrl;
      }

      const profilePayload = {
        show_id: show.id,
        name: normalizedName,
        short_bio: shortBio,
        full_bio: guestProfileFormState.fullBio.trim() || null,
        hometown: guestProfileFormState.hometown.trim() || null,
        instruments: guestProfileFormState.instruments.trim() || null,
        facebook: guestProfileFormState.facebook.trim() || null,
        instagram: guestProfileFormState.instagram.trim() || null,
        website: guestProfileFormState.website.trim() || null,
        photo_url: photoUrl,
        permission_granted: guestProfileFormState.permissionGranted,
      };

      if (existingProfile) {
        const { data: updatedProfile, error: updateError } = await supabase
          .from("guest_profiles")
          .update(profilePayload)
          .eq("id", existingProfile.id)
          .select("*")
          .single();

        if (updateError) {
          throw updateError;
        }

        setGuestProfiles((currentProfiles) =>
          currentProfiles.map((profile) =>
            profile.id === updatedProfile.id ? updatedProfile : profile,
          ),
        );
      } else {
        const { data: insertedProfile, error: insertError } = await supabase
          .from("guest_profiles")
          .insert(profilePayload)
          .select("*")
          .single();

        if (insertError) {
          throw insertError;
        }

        setGuestProfiles((currentProfiles) => [...currentProfiles, insertedProfile]);
      }

      setGuestPhotoFile(null);
      setGuestProfileFormState((currentState) => ({
        ...currentState,
        shortBio,
        name: normalizedName,
      }));
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSavingGuestProfile(false);
    }
  }

  async function handleAddToSetlist(songToApprove: PendingSubmission) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    setActionError(null);
    setActivePendingActionId(songToApprove.id);

    try {
      const supabase = createClient();
      const nextPosition =
        setlist.length > 0 ? Math.max(...setlist.map((song) => song.position)) + 1 : 1;

      const { data: insertedSong, error: insertError } = await supabase
        .from("setlist_songs")
        .insert({
          show_id: show.id,
          position: nextPosition,
          title: songToApprove.title,
          artist: songToApprove.artist,
          song_key: songToApprove.song_key,
          notes: songToApprove.notes,
          lyrics: songToApprove.lyrics,
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      const { error: deleteError } = await supabase
        .from("pending_submissions")
        .delete()
        .eq("id", songToApprove.id);

      if (deleteError) {
        throw deleteError;
      }

      setSetlist((currentSongs) => sortSetlistSongs([...currentSongs, insertedSong]));
      setPendingSongs((currentSongs) =>
        currentSongs.filter((song) => song.id !== songToApprove.id),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActivePendingActionId(null);
    }
  }

  async function handleRemovePendingSong(songId: string) {
    setActionError(null);
    setActivePendingActionId(songId);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("pending_submissions").delete().eq("id", songId);

      if (error) {
        throw error;
      }

      setPendingSongs((currentSongs) => currentSongs.filter((song) => song.id !== songId));
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActivePendingActionId(null);
    }
  }

  async function handleMoveSongUp(songIndex: number) {
    if (songIndex === 0) {
      return;
    }

    const songToMove = setlist[songIndex];
    const songAbove = setlist[songIndex - 1];

    if (!songToMove || !songAbove) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToMove.id);

    try {
      const supabase = createClient();
      const { error: firstUpdateError } = await supabase
        .from("setlist_songs")
        .update({ position: songAbove.position })
        .eq("id", songToMove.id);

      if (firstUpdateError) {
        throw firstUpdateError;
      }

      const { error: secondUpdateError } = await supabase
        .from("setlist_songs")
        .update({ position: songToMove.position })
        .eq("id", songAbove.id);

      if (secondUpdateError) {
        throw secondUpdateError;
      }

      setSetlist((currentSetlist) => {
        const nextSetlist = [...currentSetlist];
        const currentSong = nextSetlist[songIndex];
        const previousSong = nextSetlist[songIndex - 1];

        if (!currentSong || !previousSong) {
          return currentSetlist;
        }

        nextSetlist[songIndex] = { ...previousSong, position: currentSong.position };
        nextSetlist[songIndex - 1] = { ...currentSong, position: previousSong.position };

        return sortSetlistSongs(nextSetlist);
      });

      setOpenLyricsIndex((currentIndex) =>
        currentIndex === songIndex
          ? songIndex - 1
          : currentIndex === songIndex - 1
            ? songIndex
            : currentIndex,
      );

      setEditingLyricsIndex((currentIndex) =>
        currentIndex === songIndex
          ? songIndex - 1
          : currentIndex === songIndex - 1
            ? songIndex
            : currentIndex,
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleMoveSongDown(songIndex: number) {
    if (songIndex === setlist.length - 1) {
      return;
    }

    const songToMove = setlist[songIndex];
    const songBelow = setlist[songIndex + 1];

    if (!songToMove || !songBelow) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToMove.id);

    try {
      const supabase = createClient();
      const { error: firstUpdateError } = await supabase
        .from("setlist_songs")
        .update({ position: songBelow.position })
        .eq("id", songToMove.id);

      if (firstUpdateError) {
        throw firstUpdateError;
      }

      const { error: secondUpdateError } = await supabase
        .from("setlist_songs")
        .update({ position: songToMove.position })
        .eq("id", songBelow.id);

      if (secondUpdateError) {
        throw secondUpdateError;
      }

      setSetlist((currentSetlist) => {
        const nextSetlist = [...currentSetlist];
        const currentSong = nextSetlist[songIndex];
        const nextSong = nextSetlist[songIndex + 1];

        if (!currentSong || !nextSong) {
          return currentSetlist;
        }

        nextSetlist[songIndex] = { ...nextSong, position: currentSong.position };
        nextSetlist[songIndex + 1] = { ...currentSong, position: nextSong.position };

        return sortSetlistSongs(nextSetlist);
      });

      setOpenLyricsIndex((currentIndex) =>
        currentIndex === songIndex
          ? songIndex + 1
          : currentIndex === songIndex + 1
            ? songIndex
            : currentIndex,
      );

      setEditingLyricsIndex((currentIndex) =>
        currentIndex === songIndex
          ? songIndex + 1
          : currentIndex === songIndex + 1
            ? songIndex
            : currentIndex,
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleRemoveFromSetlist(songIndex: number) {
    const songToRemove = setlist[songIndex];

    if (!songToRemove) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToRemove.id);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("setlist_songs").delete().eq("id", songToRemove.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        currentSetlist.filter((song) => song.id !== songToRemove.id),
      );

      setOpenLyricsIndex((currentIndex) =>
        currentIndex === null
          ? currentIndex
          : currentIndex === songIndex
            ? null
            : currentIndex > songIndex
              ? currentIndex - 1
              : currentIndex,
      );

      setEditingLyricsIndex((currentIndex) =>
        currentIndex === null
          ? currentIndex
          : currentIndex === songIndex
            ? null
            : currentIndex > songIndex
              ? currentIndex - 1
              : currentIndex,
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  function handleToggleLyrics(songIndex: number) {
    setOpenLyricsIndex((currentIndex) =>
      currentIndex === songIndex ? null : songIndex,
    );
  }

  function handleStartEditingLyrics(songIndex: number) {
    setEditingLyricsIndex(songIndex);
    setLyricsDraft(setlist[songIndex]?.lyrics ?? "");
    setOpenLyricsIndex(songIndex);
  }

  async function handleSaveLyrics(songIndex: number) {
    const songToUpdate = setlist[songIndex];

    if (!songToUpdate) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToUpdate.id);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("setlist_songs")
        .update({ lyrics: lyricsDraft })
        .eq("id", songToUpdate.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        currentSetlist.map((song, index) =>
          index === songIndex ? { ...song, lyrics: lyricsDraft } : song,
        ),
      );

      setEditingLyricsIndex(null);
      setOpenLyricsIndex(songIndex);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  function handleCancelLyricsEdit() {
    setEditingLyricsIndex(null);
    setLyricsDraft("");
  }

  const guestShowInfoItems: ShowInfoItem[] = show
    ? [
        { label: "Show Name", value: show.name },
        { label: "Show Date", value: formatShowDate(show.show_date) },
        { label: "Venue", value: show.venue ?? "" },
        { label: "Venue Address", value: show.venue_address ?? "" },
        {
          label: "Directions",
          value: show.directions_url ?? "",
          href: show.directions_url ?? undefined,
        },
        { label: "Guest Arrival Time", value: show.guest_arrival_time ?? "" },
        { label: "Call Time", value: show.call_time ?? "" },
        { label: "Soundcheck Time", value: show.soundcheck_time ?? "" },
        { label: "Show Start Time", value: show.show_start_time ?? "" },
        { label: "Contact Name", value: show.contact_name ?? "" },
        { label: "Contact Phone", value: show.contact_phone ?? "" },
        { label: "Parking Notes", value: show.parking_notes ?? "" },
        { label: "Load-In Notes", value: show.load_in_notes ?? "" },
        { label: "Announcements", value: show.announcements ?? "" },
      ]
    : [];

  const guestMessage = show?.guest_message?.trim() ?? "";

  const bandShowInfoItems: ShowInfoItem[] = show
    ? [
        { label: "Show Name", value: show.name },
        { label: "Show Date", value: formatShowDate(show.show_date) },
        { label: "Venue", value: show.venue ?? "" },
        { label: "Venue Address", value: show.venue_address ?? "" },
        {
          label: "Directions",
          value: show.directions_url ?? "",
          href: show.directions_url ?? undefined,
        },
        { label: "Band Arrival Time", value: show.band_arrival_time ?? "" },
        { label: "Soundcheck Time", value: show.soundcheck_time ?? "" },
        { label: "Call Time", value: show.call_time ?? "" },
        { label: "Show Start Time", value: show.show_start_time ?? "" },
        { label: "Contact Name", value: show.contact_name ?? "" },
        { label: "Contact Phone", value: show.contact_phone ?? "" },
        { label: "Parking Notes", value: show.parking_notes ?? "" },
        { label: "Load-In Notes", value: show.load_in_notes ?? "" },
        { label: "Announcements", value: show.announcements ?? "" },
      ]
    : [];

  if (isLoading) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-stone-600">Loading show data...</p>
        </section>
      </main>
    );
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-rose-700">
            {errorMessage || "The show could not be loaded."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      data-print-mode={printMode}
      className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6"
    >
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 print-shell">
        <header className="print-hidden flex flex-col gap-2 border-b border-stone-200 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Live Music Show Manager
          </p>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
            {portalLabel}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{show.name}</h1>
          <p className="text-base text-stone-600">{formatShowDate(show.show_date)}</p>
        </header>

        {errorMessage ? (
          <div className="print-hidden rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="print-hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {actionError}
          </div>
        ) : null}

        {showRoleToggle ? (
          <section className="print-hidden flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">View Mode Toggle</h2>
                <p className="text-sm text-stone-600">
                  Switch between guest, band, and admin views locally.
                </p>
              </div>
              <p className="text-sm font-medium text-stone-500">
                Active mode:{" "}
                <span className="capitalize text-emerald-700">{viewMode}</span>
              </p>
            </div>

            <div
              className="grid grid-cols-1 gap-3 rounded-2xl bg-stone-100 p-2 sm:grid-cols-3"
              role="group"
              aria-label="View mode toggle"
            >
              <button
                type="button"
                onClick={() => setViewMode("guest")}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  viewMode === "guest"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                Guest View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("band")}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  viewMode === "band"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                Band View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("admin")}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  viewMode === "admin"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                Admin View
              </button>
            </div>
          </section>
        ) : null}

        {viewMode === "guest" && guestMessage ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Welcome</h2>
              <p className="text-sm text-stone-600">
                A message from the show team for this event.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-5">
              <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">
                {guestMessage}
              </p>
            </div>
          </section>
        ) : null}

        {viewMode === "guest" ? (
          <ShowInfoCard
            title="Guest Itinerary"
            subtitle="Show details, timing, and contact information for guest performers."
            items={guestShowInfoItems}
          />
        ) : null}

        {viewMode === "band" ? (
          <ShowInfoCard
            title="Band Itinerary"
            subtitle="Show details, timing, and logistics for the band."
            items={bandShowInfoItems}
          />
        ) : null}

        {viewMode === "admin" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Show Details</h2>
              <p className="text-sm text-stone-600">
                Update itinerary details that guests and band members will see in their portals.
              </p>
            </div>

            {showDetailsMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {showDetailsMessage}
              </div>
            ) : null}

            {showDetailsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {showDetailsError}
              </div>
            ) : null}

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleShowDetailsSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Venue
                  <input
                    type="text"
                    name="venue"
                    value={showDetailsFormState.venue}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Venue name"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Venue Address
                  <input
                    type="text"
                    name="venueAddress"
                    value={showDetailsFormState.venueAddress}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="123 Main St, Town, State"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Directions URL
                <input
                  type="url"
                  name="directionsUrl"
                  value={showDetailsFormState.directionsUrl}
                  onChange={handleShowDetailsChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="https://maps.google.com/..."
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Call Time
                  <input
                    type="text"
                    name="callTime"
                    value={showDetailsFormState.callTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="5:30 PM"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Soundcheck Time
                  <input
                    type="text"
                    name="soundcheckTime"
                    value={showDetailsFormState.soundcheckTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="6:00 PM"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Show Start Time
                  <input
                    type="text"
                    name="showStartTime"
                    value={showDetailsFormState.showStartTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="7:00 PM"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Guest Arrival Time
                  <input
                    type="text"
                    name="guestArrivalTime"
                    value={showDetailsFormState.guestArrivalTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="6:15 PM"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Band Arrival Time
                  <input
                    type="text"
                    name="bandArrivalTime"
                    value={showDetailsFormState.bandArrivalTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="5:00 PM"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Contact Name
                  <input
                    type="text"
                    name="contactName"
                    value={showDetailsFormState.contactName}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Promoter or venue contact"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Contact Phone
                  <input
                    type="text"
                    name="contactPhone"
                    value={showDetailsFormState.contactPhone}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="(555) 555-5555"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Parking Notes
                <textarea
                  name="parkingNotes"
                  value={showDetailsFormState.parkingNotes}
                  onChange={handleShowDetailsChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Where to park, overflow info, gate notes, and similar details"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Load-In Notes
                <textarea
                  name="loadInNotes"
                  value={showDetailsFormState.loadInNotes}
                  onChange={handleShowDetailsChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Stage door, equipment access, stairs, or load-in instructions"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Announcements
                <textarea
                  name="announcements"
                  value={showDetailsFormState.announcements}
                  onChange={handleShowDetailsChange}
                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Anything everyone should know for this show"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Guest Welcome Message
                <textarea
                  name="guestMessage"
                  value={showDetailsFormState.guestMessage}
                  onChange={handleShowDetailsChange}
                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Add a warm welcome, arrival notes, or anything guests should see first."
                />
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSavingShowDetails}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSavingShowDetails ? "Saving Show Details..." : "Save Show Details"}
                </button>
              </div>
            </form>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Guest Preview
                </p>
                <div className="mt-4 grid gap-3">
                  {guestShowInfoItems
                    .filter((item) => item.value.trim())
                    .map((item) => (
                      <div key={`guest-preview-${item.label}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block break-words text-sm font-medium text-emerald-700 underline"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                            {item.value}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Band Preview
                </p>
                <div className="mt-4 grid gap-3">
                  {bandShowInfoItems
                    .filter((item) => item.value.trim())
                    .map((item) => (
                      <div key={`band-preview-${item.label}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block break-words text-sm font-medium text-emerald-700 underline"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                            {item.value}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <div className="print-hidden flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Setlist</h2>
            <p className="text-sm text-stone-600">Live setlist loaded from Supabase.</p>
          </div>

          <div className="print-hidden flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handlePrint("stage")}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Stage Copy
            </button>
            <button
              type="button"
              onClick={() => handlePrint("band")}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Band Copy
            </button>
            <button
              type="button"
              onClick={() => handlePrint("standard")}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Standard Copy
            </button>
          </div>

          {setlist.length === 0 ? (
            <div className="print-hidden rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No setlist songs yet. Approve a pending submission to get started.
            </div>
          ) : (
            <ol className="print-hidden flex list-decimal flex-col gap-4 pl-6">
              {setlist.map((song, index) => (
                <li key={song.id} className="pl-1">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                    <p className="text-base font-medium text-stone-900 sm:text-lg">
                      {song.title} - {song.artist || "Unknown artist"}
                      {song.song_key ? ` (${song.song_key})` : ""}
                    </p>
                    {song.notes ? (
                      <p className="mt-2 text-sm text-stone-600">{song.notes}</p>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => handleToggleLyrics(index)}
                        className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        {openLyricsIndex === index ? "Hide Lyrics" : "Show Lyrics"}
                      </button>

                      {viewMode === "admin" ? (
                        <button
                          type="button"
                          onClick={() => handleStartEditingLyrics(index)}
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                        >
                          Edit Lyrics
                        </button>
                      ) : null}
                    </div>

                    {editingLyricsIndex === index ? (
                      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Lyrics
                          <textarea
                            value={lyricsDraft}
                            onChange={(event) => setLyricsDraft(event.target.value)}
                            className="min-h-32 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            placeholder="Add lyrics for this song"
                          />
                        </label>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => handleSaveLyrics(index)}
                            disabled={activeSetlistActionId === song.id}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                          >
                            Save Lyrics
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelLyricsEdit}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {openLyricsIndex === index ? (
                      <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-4">
                        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Lyrics
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                          {song.lyrics || "No lyrics added yet"}
                        </p>
                      </div>
                    ) : null}

                    {viewMode === "admin" ? (
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleMoveSongUp(index)}
                          disabled={activeSetlistActionId === song.id}
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSongDown(index)}
                          disabled={activeSetlistActionId === song.id}
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Move Down
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromSetlist(index)}
                          disabled={activeSetlistActionId === song.id}
                          className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {setlist.length > 0 ? (
            <div className="print-only print-setlist-root">
              <header className="print-copy-header">
                <h1>{show.name}</h1>
                <p>{formatShowDate(show.show_date)}</p>
              </header>

              <ol className={`print-setlist-list print-mode-${printMode}`}>
                {setlist.map((song, index) => (
                  <li key={`print-${song.id}`} className="print-song-item">
                    <div className="print-song-main">
                      <span className="print-song-number">{index + 1}.</span>
                      <div className="print-song-body">
                        <div className="print-song-headline">
                          <span className="print-song-title">{song.title}</span>
                          {song.song_key ? (
                            <span className="print-song-key">{song.song_key}</span>
                          ) : null}
                        </div>

                        {printMode !== "stage" || song.artist ? (
                          <div className="print-song-support">
                            {song.artist ? (
                              <p className="print-song-artist">{song.artist}</p>
                            ) : null}
                            {printMode !== "stage" && song.notes ? (
                              <p className="print-song-notes">{song.notes}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>

        {viewMode === "guest" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Artist Info</h2>
              <p className="text-sm text-stone-600">
                Share your promo bio and photo for this show.
              </p>
            </div>

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleGuestProfileSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Name
                  <input
                    type="text"
                    name="name"
                    value={guestProfileFormState.name}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Your name"
                    required
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Hometown
                  <input
                    type="text"
                    name="hometown"
                    value={guestProfileFormState.hometown}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="City, State"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Short Bio
                <textarea
                  name="shortBio"
                  value={guestProfileFormState.shortBio}
                  onChange={handleGuestProfileChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Short promo bio"
                  required
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Full Bio
                <textarea
                  name="fullBio"
                  value={guestProfileFormState.fullBio}
                  onChange={handleGuestProfileChange}
                  className="min-h-32 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional longer bio"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Instruments
                  <input
                    type="text"
                    name="instruments"
                    value={guestProfileFormState.instruments}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Banjo, guitar, vocals"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Website
                  <input
                    type="text"
                    name="website"
                    value={guestProfileFormState.website}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="https://your-site.com"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Facebook
                  <input
                    type="text"
                    name="facebook"
                    value={guestProfileFormState.facebook}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Facebook profile or page"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Instagram
                  <input
                    type="text"
                    name="instagram"
                    value={guestProfileFormState.instagram}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Instagram handle or URL"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Photo Upload
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleGuestPhotoChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
                />
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="permissionGranted"
                  checked={guestProfileFormState.permissionGranted}
                  onChange={handleGuestProfileChange}
                  className="mt-1"
                />
                <span>I give permission to use this for promotion</span>
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSavingGuestProfile}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSavingGuestProfile ? "Saving Artist Info..." : "Save Artist Info"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {viewMode === "admin" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Guest Profiles</h2>
              <p className="text-sm text-stone-600">
                Promo bios and photos submitted for this show.
              </p>
            </div>

            {guestProfiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                No guest profiles submitted yet.
              </div>
            ) : (
              <div className="grid gap-4">
                {guestProfiles.map((profile) => {
                  const missingBio = !profile.short_bio;
                  const missingPhoto = !profile.photo_url;

                  return (
                    <article
                      key={profile.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        missingBio || missingPhoto
                          ? "border-amber-300 bg-amber-50"
                          : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-2">
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
                              {profile.permission_granted
                                ? "Permission granted"
                                : "No permission"}
                            </span>
                            {missingBio || missingPhoto ? (
                              <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                                Missing submission
                              </span>
                            ) : null}
                          </div>

                          <p className="text-sm text-stone-700">
                            {profile.short_bio || "Short bio missing"}
                          </p>

                          <div className="grid gap-1 text-sm text-stone-600">
                            {profile.hometown ? <p>Hometown: {profile.hometown}</p> : null}
                            {profile.instruments ? (
                              <p>Instruments: {profile.instruments}</p>
                            ) : null}
                            {profile.full_bio ? <p>Full bio: {profile.full_bio}</p> : null}
                          </div>

                          <div className="flex flex-wrap gap-3 text-sm">
                            {profile.facebook ? (
                              <a
                                href={profile.facebook}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline"
                              >
                                Facebook
                              </a>
                            ) : null}
                            {profile.instagram ? (
                              <a
                                href={profile.instagram}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline"
                              >
                                Instagram
                              </a>
                            ) : null}
                            {profile.website ? (
                              <a
                                href={profile.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline"
                              >
                                Website
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="w-full max-w-[180px]">
                          {profile.photo_url ? (
                            <img
                              src={profile.photo_url}
                              alt={`${profile.name || "Guest"} promo`}
                              className="h-40 w-full rounded-xl border border-stone-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-sm text-stone-500">
                              No photo
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {viewMode === "admin" ? (
          <section className="print-hidden flex flex-col gap-3 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Admin Review</h2>
              <p className="text-sm text-stone-600">
                Review pending songs below and curate the official setlist.
              </p>
            </div>
          </section>
        ) : (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{formHeading}</h2>
              <p className="text-sm text-stone-600">
                Add a song request or suggestion to the shared pending list.
              </p>
            </div>

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Song Title
                  <input
                    type="text"
                    name="title"
                    value={formState.title}
                    onChange={handleChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Enter song title"
                    required
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Artist / Singer
                  <input
                    type="text"
                    name="artist"
                    value={formState.artist}
                    onChange={handleChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Enter artist or singer"
                    required
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Key
                <input
                  type="text"
                  name="key"
                  value={formState.key}
                  onChange={handleChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional key"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Notes
                <textarea
                  name="notes"
                  value={formState.notes}
                  onChange={handleChange}
                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional notes"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Lyrics / lyric cue / chorus (optional)
                <textarea
                  name="lyrics"
                  value={formState.lyrics}
                  onChange={handleChange}
                  className="min-h-32 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional lyrics, chorus, or cue"
                />
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSubmitting ? "Submitting..." : "Add Pending Song"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Pending Songs</h2>
            <p className="text-sm text-stone-600">
              Shared submissions from guests and band members.
            </p>
          </div>

          {pendingSongs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No pending songs yet. Submit one above to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingSongs.map((song) => (
                <article
                  key={song.id}
                  className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-semibold text-stone-900">
                        {song.title}
                      </h3>
                      <p className="text-sm text-stone-700">
                        {song.artist || "Unknown artist"}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                      Submitted By: {song.submitted_by_role}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 text-sm text-stone-600">
                    {song.song_key ? <p>Key: {song.song_key}</p> : null}
                    {song.notes ? <p>Notes: {song.notes}</p> : null}
                  </div>

                  {song.lyrics ? (
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Lyrics included
                    </p>
                  ) : null}

                  {viewMode === "admin" ? (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => handleAddToSetlist(song)}
                        disabled={activePendingActionId === song.id}
                        className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                      >
                        Add to Setlist
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePendingSong(song.id)}
                        disabled={activePendingActionId === song.id}
                        className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
