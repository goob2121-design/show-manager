import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import type { SponsorPacketBandMember, SponsorPacketBandProfile, SponsorPacketSavedDraft, SponsorPacketSectionKey } from "@/lib/sponsor-packet";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ showId: string }> };
const sectionKeys: SponsorPacketSectionKey[] = ["showInformation", "specialGuest", "complimentaryTickets", "reservedSeating", "venueDirections", "bandInformation", "sponsorRecognition", "contactInformation"];

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Sponsor Packet storage is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function text(value: unknown, max = 10_000) { return typeof value === "string" ? value.slice(0, max) : ""; }
function nullableDate(value: unknown) { const result = text(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; }

function sanitizeBandMembers(value: unknown): SponsorPacketBandMember[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = text(record.name, 200).trim();
    if (!name) return [];
    return [{ sourceId: typeof record.sourceId === "string" ? record.sourceId.slice(0, 100) : null, name, role: text(record.role, 300), included: record.included !== false }];
  });
}

function sanitizeDraftPayload(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sectionsInput = input.enabled_sections && typeof input.enabled_sections === "object" ? input.enabled_sections as Record<string, unknown> : {};
  const enabledSections = Object.fromEntries(sectionKeys.map((key) => [key, sectionsInput[key] !== false]));
  const ticketQuantity = Number(input.ticket_quantity);
  return {
    packet_date: nullableDate(input.packet_date), sponsor_name_override: text(input.sponsor_name_override, 300), contact_person: text(input.contact_person, 300), greeting_name: text(input.greeting_name, 300), mailing_address_line_1: text(input.mailing_address_line_1, 500), mailing_address_line_2: text(input.mailing_address_line_2, 500), mailing_city: text(input.mailing_city, 200), mailing_state: text(input.mailing_state, 100), mailing_zip: text(input.mailing_zip, 30),
    letter_heading: text(input.letter_heading, 500), personal_message: text(input.personal_message, 20_000), additional_note: text(input.additional_note, 10_000), closing_name: text(input.closing_name, 300), closing_title: text(input.closing_title, 300), contact_email: text(input.contact_email, 500), contact_phone: text(input.contact_phone, 100), show_date_override: nullableDate(input.show_date_override), doors_time_override: text(input.doors_time_override, 100), show_time_override: text(input.show_time_override, 100),
    include_tickets: input.include_tickets === true, ticket_quantity: Number.isFinite(ticketQuantity) ? Math.max(0, Math.floor(ticketQuantity)) : 0, admission_type: input.admission_type === "reserved" ? "reserved" : "general", assigned_seat_labels: Array.isArray(input.assigned_seat_labels) ? input.assigned_seat_labels.map((seat) => text(seat, 100).trim()).filter(Boolean).slice(0, 100) : [], seat_instructions: text(input.seat_instructions, 5000), ticket_enclosure_note: text(input.ticket_enclosure_note, 5000), enabled_sections: enabledSections,
    guest_name_override: text(input.guest_name_override, 500), guest_bio_override: text(input.guest_bio_override, 20_000), guest_photo_url_override: text(input.guest_photo_url_override, 2000), band_heading_override: text(input.band_heading_override, 500), band_description_override: text(input.band_description_override, 20_000), band_members_override: sanitizeBandMembers(input.band_members_override), sponsor_recognition_override: text(input.sponsor_recognition_override, 10_000), venue_name_override: text(input.venue_name_override, 500), venue_address_override: text(input.venue_address_override, 2000),
  };
}

async function authorize(request: Request, showId: string, supabase: ReturnType<typeof createServiceClient>) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!showId.trim() || !slug) return { ok: false as const, response: NextResponse.json({ error: "Show ID and slug are required." }, { status: 400 }) };
  const { data: show, error } = await supabase.from("shows").select("id, slug").eq("id", showId).maybeSingle();
  if (error || !show || show.slug !== slug) return { ok: false as const, response: NextResponse.json({ error: "Show was not found." }, { status: 404 }) };
  const cookieStore = await cookies();
  const authorized = verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value);
  if (!authorized) return { ok: false as const, response: NextResponse.json({ error: "Admin access is required." }, { status: 401 }) };
  return { ok: true as const, slug };
}

async function loadBandProfile(supabase: ReturnType<typeof createServiceClient>): Promise<SponsorPacketBandProfile | null> {
  const { data: profile, error } = await supabase.from("show_band_profiles").select("id, profile_key, display_name, description").eq("profile_key", "cmms_house_band").eq("is_active", true).maybeSingle();
  if (error || !profile) return null;
  const { data: members, error: membersError } = await supabase.from("show_band_profile_members").select("id, member_name, role_text, display_order").eq("band_profile_id", profile.id).eq("is_active", true).order("display_order").order("created_at");
  if (membersError) return { id: profile.id, profileKey: profile.profile_key, displayName: profile.display_name, description: profile.description ?? "", members: [] };
  return { id: profile.id, profileKey: profile.profile_key, displayName: profile.display_name, description: profile.description ?? "", members: (members ?? []).map((member) => ({ sourceId: member.id, name: member.member_name, role: member.role_text ?? "", included: true })) };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const supabase = createServiceClient();
    const access = await authorize(request, showId, supabase);
    if (!access.ok) return access.response;
    const sponsorId = new URL(request.url).searchParams.get("sponsorId")?.trim() ?? "";
    if (!sponsorId) return NextResponse.json({ error: "Sponsor ID is required." }, { status: 400 });
    const [{ data: draft, error: draftError }, bandProfile] = await Promise.all([
      supabase.from("sponsor_packet_drafts").select("*").eq("show_id", showId).eq("sponsor_library_id", sponsorId).maybeSingle(),
      loadBandProfile(supabase),
    ]);
    if (draftError) throw draftError;
    return NextResponse.json({ draft: (draft ?? null) as SponsorPacketSavedDraft | null, bandProfile });
  } catch (error) {
    console.error("Sponsor Packet load failed.", error);
    return NextResponse.json({ error: "Unable to load the saved sponsor packet draft." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const supabase = createServiceClient();
    const access = await authorize(request, showId, supabase);
    if (!access.ok) return access.response;
    const body = await request.json() as { sponsorId?: unknown; draft?: unknown };
    const sponsorId = text(body.sponsorId, 100).trim();
    if (!sponsorId) return NextResponse.json({ error: "Sponsor ID is required." }, { status: 400 });
    const { data: sponsor } = await supabase.from("sponsor_library").select("id").eq("id", sponsorId).maybeSingle();
    if (!sponsor) return NextResponse.json({ error: "Sponsor was not found." }, { status: 404 });
    const row = { show_id: showId, sponsor_library_id: sponsorId, ...sanitizeDraftPayload(body.draft), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("sponsor_packet_drafts").upsert(row, { onConflict: "show_id,sponsor_library_id" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ draft: data as SponsorPacketSavedDraft });
  } catch (error) {
    console.error("Sponsor Packet save failed.", error);
    return NextResponse.json({ error: "Unable to save the sponsor packet draft." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { showId } = await context.params;
    const supabase = createServiceClient();
    const access = await authorize(request, showId, supabase);
    if (!access.ok) return access.response;
    const sponsorId = new URL(request.url).searchParams.get("sponsorId")?.trim() ?? "";
    if (!sponsorId) return NextResponse.json({ error: "Sponsor ID is required." }, { status: 400 });
    const { error } = await supabase.from("sponsor_packet_drafts").delete().eq("show_id", showId).eq("sponsor_library_id", sponsorId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sponsor Packet delete failed.", error);
    return NextResponse.json({ error: "Unable to delete the sponsor packet draft." }, { status: 500 });
  }
}
