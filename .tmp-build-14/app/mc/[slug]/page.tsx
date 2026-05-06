import { McPage } from "@/app/components/mc-page";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  GuestProfile,
  McBlockNote,
  SetlistEntry,
  ShowGuestSong,
  SongRecord,
  ShowRecord,
  ShowSponsor,
  SponsorLibraryEntry,
} from "@/lib/types";

type SetlistEntryRow = SetlistEntry & {
  library_song?: SongRecord | SongRecord[] | null;
  guest_song?: ShowGuestSong | ShowGuestSong[] | null;
};

function mergeShowSponsorsWithLibrary(
  showSponsors: ShowSponsor[],
  sponsorLibrary: SponsorLibraryEntry[],
) {
  const sponsorLookup = sponsorLibrary.reduce<Record<string, SponsorLibraryEntry>>((lookup, sponsor) => {
    lookup[sponsor.id] = sponsor;
    return lookup;
  }, {});

  return showSponsors.map((sponsor) => ({
    ...sponsor,
    sponsor: sponsor.sponsor_id ? sponsorLookup[sponsor.sponsor_id] ?? null : null,
  }));
}

async function loadMcPageData(slug: string) {
  const supabase = await createServerSupabaseClient();
  const { data: showRecord, error: showError } = await supabase
    .from("shows")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (showError) {
    throw showError;
  }

  if (!showRecord) {
    return {
      show: null,
      setlist: [],
      guestProfiles: [],
      sponsors: [],
      blockNotes: [],
    };
  }

  const [
    { data: setlistRows, error: setlistError },
    { data: guestProfileRows, error: guestProfileError },
    { data: sponsorRows, error: sponsorError },
    { data: sponsorLibraryRows, error: sponsorLibraryError },
    { data: blockNoteRows, error: blockNoteError },
  ] = await Promise.all([
    supabase
      .from("setlist_entries")
      .select(`
        *,
        library_song:song_id (
          id,
          title,
          key,
          tempo,
          song_type,
          notes,
          lyrics,
          created_by_role,
          created_by_name,
          created_at
        ),
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
      .eq("show_id", showRecord.id)
      .order("section", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("guest_profiles")
      .select("*")
      .eq("show_id", showRecord.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("show_sponsors")
      .select("*")
      .eq("show_id", showRecord.id)
      .order("placement_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("sponsor_library")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("mc_block_notes")
      .select("*")
      .eq("show_id", showRecord.id)
      .order("created_at", { ascending: true }),
  ]);

  if (setlistError) {
    throw setlistError;
  }

  if (guestProfileError) {
    throw guestProfileError;
  }

  if (sponsorError) {
    throw sponsorError;
  }

  if (sponsorLibraryError) {
    throw sponsorLibraryError;
  }

  if (blockNoteError) {
    throw blockNoteError;
  }

  return {
    show: showRecord as ShowRecord,
    setlist: (setlistRows ?? []) as SetlistEntryRow[],
    guestProfiles: (guestProfileRows ?? []) as GuestProfile[],
    sponsors: mergeShowSponsorsWithLibrary(
      (sponsorRows ?? []) as ShowSponsor[],
      (sponsorLibraryRows ?? []) as SponsorLibraryEntry[],
    ),
    blockNotes: (blockNoteRows ?? []) as McBlockNote[],
  };
}

export default async function McShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadMcPageData(slug);

  return (
    <McPage
      showSlug={slug}
      initialShow={data.show}
      initialSetlist={data.setlist}
      initialGuestProfiles={data.guestProfiles}
      initialSponsors={data.sponsors}
      initialBlockNotes={data.blockNotes}
    />
  );
}
