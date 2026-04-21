import { AdminGate } from "@/app/components/admin-gate";
import { McPage } from "@/app/components/mc-page";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  GuestProfile,
  McBlockNote,
  SetlistSong,
  ShowRecord,
  ShowSponsor,
  SponsorLibraryEntry,
} from "@/lib/types";

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
      .from("setlist_songs")
      .select("*")
      .eq("show_id", showRecord.id)
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
    setlist: (setlistRows ?? []) as Array<SetlistSong & { set_section?: string | null }>,
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
    <AdminGate slug={slug}>
      <McPage
        showSlug={slug}
        initialShow={data.show}
        initialSetlist={data.setlist}
        initialGuestProfiles={data.guestProfiles}
        initialSponsors={data.sponsors}
        initialBlockNotes={data.blockNotes}
      />
    </AdminGate>
  );
}
