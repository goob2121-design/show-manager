import Image from "next/image";
import { PromoMaterialsView } from "@/app/components/promo-materials-view";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PromoMaterial, ShowRecord } from "@/lib/types";

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

  return "Something went wrong while loading promo materials.";
}

type PromoHubPageProps = {
  showSlug: string;
};

export async function PromoHubPage({ showSlug }: PromoHubPageProps) {
  let show: ShowRecord | null = null;
  let materials: PromoMaterial[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: showRecord, error: showError } = await supabase
      .from("shows")
      .select("*")
      .eq("slug", showSlug)
      .maybeSingle();

    if (showError) {
      throw showError;
    }

    if (!showRecord) {
      errorMessage = "Show not found.";
    } else {
      const { data: promoRows, error: promoError } = await supabase
        .from("promo_materials")
        .select("*")
        .eq("show_id", showRecord.id)
        .eq("is_visible", true)
        .order("created_at", { ascending: false });

      if (promoError) {
        throw promoError;
      }

      show = showRecord as ShowRecord;
      materials = (promoRows ?? []) as PromoMaterial[];
    }
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-100 via-stone-50 to-stone-100 px-4 py-8 text-stone-900 sm:px-6 sm:py-10 lg:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-stone-900 px-6 py-8 text-white sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <Image
                src="/cmms-logo.png"
                alt="CMMS logo"
                width={88}
                height={88}
                className="h-16 w-auto rounded-2xl bg-white/95 p-2 object-contain shadow-sm"
                priority
              />

              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-100">
                  Promo Hub
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Promo Materials
                </h1>
                <p className="text-sm leading-6 text-emerald-50/90 sm:text-base">
                  Download flyers, graphics, and promotional items for this show.
                </p>
              </div>
            </div>
          </div>

          {show ? (
            <div className="grid gap-3 border-t border-stone-200 bg-stone-50/70 px-6 py-5 sm:grid-cols-3 sm:px-8">
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Show
                </p>
                <p className="mt-2 text-xl font-semibold text-stone-900">{show.name}</p>
                <p className="mt-1 text-sm text-stone-600">{show.venue || "Venue not set"}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Date
                </p>
                <p className="mt-2 text-sm font-semibold text-stone-900">
                  {formatShowDate(show.show_date)}
                </p>
              </div>
            </div>
          ) : null}
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          <PromoMaterialsView
            materials={materials}
            emptyMessage="No visible promo materials have been added for this show yet."
          />
        </section>
      </section>
    </main>
  );
}
