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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(29,78,216,0.10),transparent_36%),linear-gradient(180deg,#020817,#071126_50%,#0b1629)] px-4 py-8 text-[#f5f5f5] sm:px-6 sm:py-10 lg:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header
          className="relative overflow-hidden rounded-[2rem] border border-white/10 shadow-sm"
        >
          <Image
            src="/portal_bkg.png"
            alt=""
            fill
            priority
            aria-hidden="true"
            className="object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(rgba(4,10,24,0.4),rgba(4,10,24,0.4))]"
          />
          <div className="relative px-6 py-8 text-[#f5f5f5] sm:px-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-5 right-5 hidden w-32 rounded-r-[24px] opacity-45 lg:block"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(200,155,60,0.28) 0px, rgba(200,155,60,0.28) 1px, transparent 1px, transparent 18px)",
              }}
            />
            <div className="grid items-center gap-8 md:grid-cols-[320px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12">
              <div className="w-full max-w-[280px] sm:max-w-[300px] md:max-w-[320px] lg:max-w-[360px]">
                <Image
                  src="/stageflow-logo-v2.png"
                  alt="StageFlow logo"
                  width={360}
                  height={180}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>

              <div className="stage-gold-divider max-w-3xl space-y-2 md:space-y-3">
                <p className="inline-flex w-fit rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.14)]">
                  Promo Hub
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Promo Materials
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[#d7d7d7] sm:text-base">
                  Download flyers, graphics, and promotional items for this show.
                </p>
              </div>
            </div>
          </div>

          {show ? (
            <div className="grid gap-3 border-t border-[rgba(255,255,255,0.10)] bg-[#141414] px-6 py-5 sm:grid-cols-3 sm:px-8">
              <div className="stage-premium-card rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#181818] px-4 py-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c89b3c]">
                  Show
                </p>
                <p className="mt-2 text-xl font-semibold text-[#f5f5f5]">{show.name}</p>
                <p className="mt-1 text-sm text-[#b8b8b8]">{show.venue || "Venue not set"}</p>
              </div>
              <div className="stage-premium-card rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#181818] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c89b3c]">
                  Date
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f5f5f5]">
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

        <section className="stage-premium-panel rounded-[2rem] border border-[rgba(255,255,255,0.10)] bg-[#111111] p-5 shadow-sm sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
            <div className="space-y-3">
              <h2 className="stage-gold-divider text-xl font-semibold text-[#f5f5f5]">Help Spread the Word</h2>
              <div className="space-y-3 text-sm leading-7 text-[#b8b8b8] sm:text-base">
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

            <div className="stage-premium-card rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#181818] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#c89b3c]">
                Quick Share Tips
              </h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#b8b8b8]">
                <li>Share event graphics to Facebook.</li>
                <li>Invite friends to the event.</li>
                <li>Share ticket links when available.</li>
                <li>Tag sponsors and performers.</li>
                <li>Re-share posts from the official page.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="stage-premium-panel rounded-[2rem] border border-[rgba(255,255,255,0.10)] bg-[#111111] p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="stage-gold-divider text-xl font-semibold text-[#f5f5f5]">Shareable Links</h2>
            <p className="text-sm text-[#b8b8b8]">
              Easy links for tickets, event pages, videos, and other show promotion.
            </p>
          </div>
          <PromoLinksView
            links={promoLinks}
            emptyMessage="No promo links have been added for this show yet."
          />
        </section>

        {groupedPromoMaterials.length === 0 ? (
          <section className="stage-premium-panel rounded-[2rem] border border-[rgba(255,255,255,0.10)] bg-[#111111] p-4 shadow-sm sm:p-6">
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
                className="stage-premium-panel rounded-[2rem] border border-[rgba(255,255,255,0.10)] bg-[#111111] p-4 shadow-sm sm:p-6"
              >
                <div className="mb-5 flex flex-col gap-1">
                  <h2 className="stage-gold-divider text-xl font-semibold text-[#f5f5f5]">{section.title}</h2>
                  <p className="text-sm text-[#b8b8b8]">{section.helperText}</p>
                </div>
                <PromoMaterialsView materials={section.materials} />
              </section>
            ))}
          </div>
        )}

        <p className="px-2 text-center text-xs leading-5 text-[#8f8f8f] sm:px-6">
          Promo materials are provided for promotional use for the Cumberland Mountain Music Show. Please do not alter,
          resell, or use these materials in a misleading way without permission.
        </p>
      </section>
    </main>
  );
}
