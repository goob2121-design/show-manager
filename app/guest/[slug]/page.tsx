import type { Metadata } from "next";
import { ShowPage } from "@/app/components/show-page";
import { buildPublicPageMetadata, getGuestPortalMetadataBySlug } from "@/lib/route-metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MarkOpenedPayload = {
  success?: boolean;
  error?: string;
  details?: unknown;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const metadata = await getGuestPortalMetadataBySlug(slug);

    if (metadata.guestName) {
      const showName = metadata.showName ?? "StageFlow";

      return buildPublicPageMetadata({
        title: `${metadata.guestName} Guest Portal | ${showName}`,
        description: `Guest portal for ${metadata.guestName} for the ${showName}. Submit songs, notes, and appearance details here.`,
        path: `/guest/${slug}`,
      });
    }

    const showName = metadata.showName ?? null;

    return buildPublicPageMetadata({
      title: showName ? `Guest Portal | ${showName}` : "Guest Portal | StageFlow",
      description: showName
        ? `Guest portal for the ${showName}. Submit songs, notes, and appearance details here.`
        : "Guest portal for StageFlow. Submit songs, notes, and appearance details here.",
      path: `/guest/${slug}`,
    });
  } catch {
    return buildPublicPageMetadata({
      title: "Guest Portal | StageFlow",
      description: "Guest portal for StageFlow. Submit songs, notes, and appearance details here.",
      path: `/guest/${slug}`,
    });
  }
}

export default async function GuestShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (uuidPattern.test(slug)) {
    const supabase = await createServerSupabaseClient();
    const { data: guestProfile, error: guestProfileError } = await supabase
      .from("guest_profiles")
      .select("id, show_id")
      .eq("guest_token", slug)
      .maybeSingle();

    const fallbackGuestProfile =
      guestProfile ?? (
        await supabase
          .from("guest_profiles")
          .select("id, show_id")
          .eq("id", slug)
          .maybeSingle()
      ).data;

    if (fallbackGuestProfile) {
      try {
        const headerStore = await headers();
        const protocol = headerStore.get("x-forwarded-proto") ?? "http";
        const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

        if (!host) {
          throw new Error("Missing request host header for guest portal opened route.");
        }

        const response = await fetch(`${protocol}://${host}/api/guest-profiles/mark-opened`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guestProfileId: fallbackGuestProfile.id,
          }),
          cache: "no-store",
        });

        const responseBodyText = await response.text();
        let payload: MarkOpenedPayload | null = null;

        try {
          payload = responseBodyText ? (JSON.parse(responseBodyText) as MarkOpenedPayload) : null;
        } catch {
          payload = null;
        }

        if (!response.ok || !payload?.success) {
          const typedError = payload?.details as {
            message?: unknown;
            code?: unknown;
            details?: unknown;
            hint?: unknown;
          } | null | undefined;

          console.error("Failed to update guest portal opened timestamp.");
          console.error("Opened timestamp API status:", response.status);
          console.error("Opened timestamp API body:", responseBodyText);
          console.error("Error message:", typedError?.message ?? payload?.error ?? "no message");
          console.error("Error code:", typedError?.code ?? "no code");
          console.error("Error details:", typedError?.details ?? "no details");
          console.error("Error hint:", typedError?.hint ?? "no hint");
          console.error(
            "Full error JSON:",
            JSON.stringify(payload?.details ?? payload?.error ?? payload, null, 2),
          );
        }
      } catch (error) {
        const typedError = error as {
          message?: unknown;
          code?: unknown;
          details?: unknown;
          hint?: unknown;
        } | null;

        console.error("Failed to update guest portal opened timestamp.");
        console.error("Error message:", typedError?.message ?? "no message");
        console.error("Error code:", typedError?.code ?? "no code");
        console.error("Error details:", typedError?.details ?? "no details");
        console.error("Error hint:", typedError?.hint ?? "no hint");
        console.error("Full error JSON:", JSON.stringify(error, null, 2));
      }

      const { data: showRecord, error: showError } = await supabase
        .from("shows")
        .select("slug")
        .eq("id", fallbackGuestProfile.show_id)
        .maybeSingle();

      if (showError || !showRecord?.slug) {
        return (
          <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
            <section className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <h1 className="text-2xl font-semibold text-stone-900">Guest Link Unavailable</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                This guest link is invalid or expired.
              </p>
            </section>
          </main>
        );
      }

      return (
        <ShowPage
          showSlug={showRecord.slug}
          initialRole="guest"
          showRoleToggle={false}
          lockedGuestProfileId={fallbackGuestProfile.id}
          isPrivateGuestPortal
        />
      );
    }

    const { data: sharedShow } = await supabase
      .from("shows")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();

    if (!sharedShow?.slug) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
          <section className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold text-stone-900">Guest Link Unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              This guest link is invalid or expired.
            </p>
          </section>
        </main>
      );
    }
  }

  return <ShowPage showSlug={slug} initialRole="guest" showRoleToggle={false} />;
}
