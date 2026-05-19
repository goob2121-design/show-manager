import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getShowNameBySlug(slug: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shows")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.name?.trim() || null;
}

export async function getSongTitleById(songId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("songs")
    .select("title")
    .eq("id", songId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.title?.trim() || null;
}

export async function getGuestPortalMetadataBySlug(slug: string) {
  const supabase = await createServerSupabaseClient();

  if (uuidPattern.test(slug)) {
    const { data: guestProfile, error: guestProfileError } = await supabase
      .from("guest_profiles")
      .select("id, name, show_id")
      .eq("guest_token", slug)
      .maybeSingle();

    if (guestProfileError) {
      throw guestProfileError;
    }

    const fallbackGuestProfile =
      guestProfile ??
      (
        await supabase
          .from("guest_profiles")
          .select("id, name, show_id")
          .eq("id", slug)
          .maybeSingle()
      ).data;

    if (fallbackGuestProfile) {
      return {
        guestName: fallbackGuestProfile.name?.trim() || null,
        showName: null,
      };
    }
  }

  const { data: showRecord, error: showError } = await supabase
    .from("shows")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  if (showError) {
    throw showError;
  }

  return {
    guestName: null,
    showName: showRecord?.name?.trim() || null,
  };
}
