import type { Metadata } from "next";
import { PromoHubPage } from "@/app/components/promo-hub-page";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: showRecord, error } = await supabase
      .from("shows")
      .select("name")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return {
      title: showRecord?.name
        ? `Promo Materials | ${showRecord.name}`
        : "Promo Materials | StageFlow",
    };
  } catch {
    return {
      title: "Promo Materials | StageFlow",
    };
  }
}

export default async function PromoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PromoHubPage showSlug={slug} />;
}
