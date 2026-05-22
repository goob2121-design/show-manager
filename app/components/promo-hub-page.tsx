import Image from "next/image";
import { PromoLinksView } from "@/app/components/promo-links-view";
import {
  getPromoMaterialGroup,
  PromoMaterialsView,
} from "@/app/components/promo-materials-view";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PromoLink, PromoMaterial, ShowRecord } from "@/lib/types";

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

const promoMaterialSections = [
  {
    key: "graphics",
    title: "Graphics & Flyers",
    helperText: "Download and share official show graphics, flyers, and images.",
  },
  {
    key: "videos",
    title: "Videos",
    helperText: "Video promos and motion assets for sharing online.",
  },
  {
    key: "documents",
    title: "Documents",
    helperText: "Printable or downloadable promo documents and handouts.",
  },
  {
    key: "other",
    title: "Other Promo Materials",
    helperText: "Additional promo files that do not fit the standard categories above.",
  },
] as const;

type PromoHubPageProps = {
  showSlug: string;
};

export async function PromoHubPage({ showSlug }: PromoHubPageProps) {
  let show: ShowRecord | null = null;
  let materials: PromoMaterial[] = [];
  let promoLinks: PromoLink[] = [];
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

      const { data: promoLinkRows, error: promoLinkError } = await supabase
        .from("promo_links")
        .select("*")
        .eq("show_id", showRecord.id)
        .order("created_at", { ascending: false });

      if (promoLinkError) {
        throw promoLinkError;
      }

      show = showRecord as ShowRecord;
      materials = (promoRows ?? []) as PromoMaterial[];
      promoLinks = (promoLinkRows ?? []) as PromoLink[];
    }
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  const groupedPromoMaterials = promoMaterialSections
    .map((section) => ({
      ...section,
      materials: materials.filter((material) => getPromoMaterialGroup(material) === section.key),
    }))
    .filter((section) => section.materials.length > 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100 sm:px-6 sm:py-10 lg:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-stone-900 px-6 py-8 text-white sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="w-full max-w-[220px] overflow-hidden sm:max-w-[240px]">
                <Image
                  src="/stageflow-logo-v2.png"
                  alt="StageFlow logo"
                  width={240}
                  height={120}
                  className="h-auto w-full object-contain -translate-y-1.5 scale-[1.11] transform-gpu"
                  priority
                />
              </div>

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

        <section className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-stone-900">Help Spread the Word</h2>
              <div className="space-y-3 text-sm leading-7 text-stone-600 sm:text-base">
                <p>
                  Thank you for helping promote the show. Sharing flyers, graphics, links, and posts on social media
                  genuinely helps more people hear about the event and helps live local music keep growing through
                  community support and word of mouth. Guests, sponsors, friends, and fans are welcome to share
                  anything here that feels helpful.
                </p>
                <p>
                  We do ask that promotional graphics, logos, and wording not be altered or modified so information
                  stays accurate and consistent. If you need a different size graphic, custom wording, sponsor
                  additions, or help with anything promotional, feel free to reach out and we&apos;ll do our best to
                  help however we can.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-700">
                Quick Share Tips
              </h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                <li>Share event graphics to Facebook.</li>
                <li>Invite friends to the event.</li>
                <li>Share ticket links when available.</li>
                <li>Tag sponsors and performers.</li>
                <li>Re-share posts from the official page.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-stone-900">Shareable Links</h2>
            <p className="text-sm text-stone-600">
              Easy links for tickets, event pages, videos, and other show promotion.
            </p>
          </div>
          <PromoLinksView
            links={promoLinks}
            emptyMessage="No promo links have been added for this show yet."
          />
        </section>

        {groupedPromoMaterials.length === 0 ? (
          <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
            <PromoMaterialsView
              materials={materials}
              emptyMessage="No visible promo materials have been added for this show yet."
            />
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {groupedPromoMaterials.map((section) => (
              <section
                key={section.key}
                className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
              >
                <div className="mb-5 flex flex-col gap-1">
                  <h2 className="text-xl font-semibold text-stone-900">{section.title}</h2>
                  <p className="text-sm text-stone-600">{section.helperText}</p>
                </div>
                <PromoMaterialsView materials={section.materials} />
              </section>
            ))}
          </div>
        )}

        <p className="px-2 text-center text-xs leading-5 text-slate-400 sm:px-6">
          Promo materials are provided for promotional use for the Cumberland Mountain Music Show. Please do not alter,
          resell, or use these materials in a misleading way without permission.
        </p>
      </section>
    </main>
  );
}
