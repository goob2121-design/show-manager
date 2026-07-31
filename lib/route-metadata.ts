import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultOgImagePath = "/stageflow-logo-v2.png";

type GuestPortalMetadata = {
  guestName: string | null;
  showName: string | null;
  showSlug: string | null;
};

type PublicPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  imageUrl?: string;
};

async function getRequestOrigin() {
  const headerStore = await headers();
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

  return host ? `${protocol}://${host}` : null;
}

export async function buildPublicPageMetadata({
  title,
  description,
  path,
  imageUrl,
}: PublicPageMetadataOptions): Promise<Metadata> {
  const origin = await getRequestOrigin();
  const absoluteUrl = origin ? `${origin}${path}` : undefined;
  const absoluteImageUrl =
    imageUrl ?? (origin ? `${origin}${defaultOgImagePath}` : undefined);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: absoluteUrl,
      images: absoluteImageUrl
        ? [
            {
              url: absoluteImageUrl,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: absoluteImageUrl ? [absoluteImageUrl] : undefined,
    },
  };
}

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
    // guest_profiles.id is the canonical private Guest Portal identifier.
    const { data: guestProfile, error: guestProfileError } = await supabase
      .from("guest_profiles")
      .select("id, name, show_id")
      .eq("id", slug)
      .maybeSingle();

    if (guestProfileError) {
      throw guestProfileError;
    }

    if (guestProfile) {
      const { data: showRecord, error: showError } = await supabase
        .from("shows")
        .select("name, slug")
        .eq("id", guestProfile.show_id)
        .maybeSingle();

      if (showError) {
        throw showError;
      }

      return {
        guestName: guestProfile.name?.trim() || null,
        showName: showRecord?.name?.trim() || null,
        showSlug: showRecord?.slug?.trim() || null,
      } satisfies GuestPortalMetadata;
    }
  }

  const { data: showRecord, error: showError } = await supabase
    .from("shows")
    .select("name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (showError) {
    throw showError;
  }

  return {
    guestName: null,
    showName: showRecord?.name?.trim() || null,
    showSlug: showRecord?.slug?.trim() || null,
  } satisfies GuestPortalMetadata;
}
