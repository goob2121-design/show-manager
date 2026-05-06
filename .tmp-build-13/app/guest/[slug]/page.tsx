import { ShowPage } from "@/app/components/show-page";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing server-side Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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
        const serviceRoleSupabase = createServiceRoleSupabaseClient();
        const { error: portalOpenedUpdateError } = await serviceRoleSupabase
          .from("guest_profiles")
          .update({ portal_opened_at: new Date().toISOString() })
          .eq("id", fallbackGuestProfile.id)
          .is("portal_opened_at", null);

        if (portalOpenedUpdateError) {
          console.error("Failed to update guest portal opened timestamp.", portalOpenedUpdateError);
        }
      } catch (error) {
        console.error("Failed to update guest portal opened timestamp.", error);
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
