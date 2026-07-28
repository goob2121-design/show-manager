"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VENUE_ADDRESS,
  DEFAULT_VENUE_NAME,
  applySavedSponsorPacketDraft,
  buildSponsorPacketDraft,
  buildSponsorTicketParagraph,
  cloneBandMembers,
  findSponsorSeatLabels,
  formatSponsorPacketDate,
  formatSponsorPacketTime,
  serializeSponsorPacketDraft,
  type SponsorPacketBandProfile,
  type SponsorPacketDraft,
  type SponsorPacketSavedDraft,
  type SponsorPacketGuestSource,
  type SponsorPacketReservedLinkSource,
  type SponsorPacketSeatAssignmentSource,
  type SponsorPacketSectionKey,
  type SponsorPacketShowSource,
  type SponsorPacketShowSponsorSource,
  type SponsorPacketSponsorSource,
} from "@/lib/sponsor-packet";
import { createClient } from "@/lib/supabase/client";

type SponsorPacketBuilderProps = { showSlug: string };

type PacketSources = {
  shows: SponsorPacketShowSource[];
  sponsors: SponsorPacketSponsorSource[];
  showSponsors: SponsorPacketShowSponsorSource[];
  guests: SponsorPacketGuestSource[];
  reservedLinks: SponsorPacketReservedLinkSource[];
  seatAssignments: SponsorPacketSeatAssignmentSource[];
};

const EMPTY_SOURCES: PacketSources = { shows: [], sponsors: [], showSponsors: [], guests: [], reservedLinks: [], seatAssignments: [] };
type SponsorPacketPresentationSections = {
  coverPage: boolean;
  coverWatermark: boolean;
  personalizedLetter: boolean;
  tableOfContents: boolean;
  assemblyChecklist: boolean;
  eventFlyerPlaceholder: boolean;
  businessCardPlaceholder: boolean;
};

const DEFAULT_PRESENTATION_SECTIONS: SponsorPacketPresentationSections = {
  coverPage: false,
  coverWatermark: false,
  personalizedLetter: true,
  tableOfContents: false,
  assemblyChecklist: false,
  eventFlyerPlaceholder: false,
  businessCardPlaceholder: false,
};

const sectionOptions: Array<{ key: SponsorPacketSectionKey; label: string }> = [
  { key: "showInformation", label: "Show Information" },
  { key: "specialGuest", label: "Special Guest Information" },
  { key: "complimentaryTickets", label: "Complimentary Ticket Information" },
  { key: "reservedSeating", label: "Reserved Seating Information" },
  { key: "venueDirections", label: "Venue and Directions" },
  { key: "bandInformation", label: "CMMS Band Information" },
  { key: "sponsorRecognition", label: "Sponsor Recognition" },
  { key: "contactInformation", label: "Contact Information" },
];

function Field({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) {
  return <label className="grid gap-1 text-sm font-medium text-stone-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-600" /></label>;
}

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <label className="grid gap-1 text-sm font-medium text-stone-700">{label}<textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-600" /></label>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="rounded-2xl border border-stone-200 bg-white p-4"><legend className="px-1 text-base font-semibold text-stone-900">{title}</legend><div className="mt-2 grid gap-3">{children}</div></fieldset>;
}

function PacketFooter({ page, total }: { page: number; total: number }) {
  return <footer className="packet-footer mt-auto border-t border-stone-300 pt-3 text-center text-[9pt] leading-5 text-stone-600"><p className="font-semibold text-stone-800">Cumberland Mountain Music Show</p><p>Big-Time Show • Small-Town Hospitality</p><p>www.cumberlandmountainmusic.com</p><p className="mt-1 font-semibold text-stone-700">Page {page} of {total}</p></footer>;
}

function PacketParagraphs({ value }: { value: string }) {
  return <>{value.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={`${paragraph.slice(0, 24)}-${index}`} className="packet-paragraph whitespace-pre-line">{paragraph}</p>)}</>;
}
export function SponsorPacketBuilder({ showSlug }: SponsorPacketBuilderProps) {
  const [sources, setSources] = useState<PacketSources>(EMPTY_SOURCES);
  const [draft, setDraft] = useState<SponsorPacketDraft | null>(null);
  const [bandProfile, setBandProfile] = useState<SponsorPacketBandProfile | null>(null);
  const [savedDraft, setSavedDraft] = useState<SponsorPacketSavedDraft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "unsaved" | "saving" | "saved" | "failed">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [presentationSections, setPresentationSections] = useState<SponsorPacketPresentationSections>({ ...DEFAULT_PRESENTATION_SECTIONS });
  const [venuePhotoUrl, setVenuePhotoUrl] = useState("");
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [printed, setPrinted] = useState(false);
  const [mailed, setMailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const buildDraft = useCallback((nextSources: PacketSources, sponsorId: string, showId: string, profile: SponsorPacketBandProfile | null) => {
    const sponsor = nextSources.sponsors.find((item) => item.id === sponsorId);
    const show = nextSources.shows.find((item) => item.id === showId);
    if (!sponsor || !show) return null;
    const showSponsor = nextSources.showSponsors.find((item) => item.show_id === show.id && item.sponsor_id === sponsor.id) ?? null;
    const guest = nextSources.guests.find((item) => item.show_id === show.id) ?? null;
    const seatLabels = findSponsorSeatLabels({ sponsorName: sponsor.name, showId: show.id, links: nextSources.reservedLinks, assignments: nextSources.seatAssignments });
    return buildSponsorPacketDraft({ sponsor, show, showSponsor, guest, seatLabels, bandProfile: profile });
  }, []);

  const loadContextDraft = useCallback(async (nextSources: PacketSources, sponsorId: string, showId: string, currentProfile: SponsorPacketBandProfile | null) => {
    const initialDraft = buildDraft(nextSources, sponsorId, showId, currentProfile);
    if (!initialDraft) return;
    setDraft(initialDraft);
    setSaveState("loading");
    setSaveMessage("Checking for a saved draft…");
    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/sponsor-packet?slug=${encodeURIComponent(showSlug)}&sponsorId=${encodeURIComponent(sponsorId)}`, { cache: "no-store" });
      const payload = await response.json() as { draft?: SponsorPacketSavedDraft | null; bandProfile?: SponsorPacketBandProfile | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load the saved draft.");
      const nextProfile = payload.bandProfile ?? currentProfile;
      const baseDraft = buildDraft(nextSources, sponsorId, showId, nextProfile);
      if (!baseDraft) return;
      setBandProfile(nextProfile);
      setSavedDraft(payload.draft ?? null);
      setDraft(payload.draft ? applySavedSponsorPacketDraft(baseDraft, payload.draft) : baseDraft);
      setHasUnsavedChanges(false);
      setSaveState(payload.draft ? "saved" : "idle");
      setSaveMessage(payload.draft ? "Saved draft loaded" : "No saved draft yet");
    } catch (loadError) {
      setSavedDraft(null);
      setHasUnsavedChanges(false);
      setSaveState("failed");
      setSaveMessage(loadError instanceof Error ? loadError.message : "Unable to load saved draft data.");
    }
  }, [buildDraft, showSlug]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const [
        showsCoreResult,
        sponsorsCoreResult,
        showDetailsResult,
        sponsorLogosResult,
        sponsorRecognitionResult,
        showSponsorsResult,
        guestsCoreResult,
        guestPhotosResult,
        linksResult,
        assignmentsResult,
      ] = await Promise.all([
        supabase.from("shows").select("id, slug, name, show_date").order("show_date", { ascending: false }),
        supabase.from("sponsor_library").select("id, name").order("name"),
        supabase.from("shows").select("id, venue, venue_address, show_start_time"),
        supabase.from("sponsor_library").select("id, logo_url"),
        supabase.from("sponsor_library").select("id, recognition_notes"),
        supabase.from("show_sponsors").select("show_id, sponsor_id, comp_ticket_allowance, recognition_notes"),
        supabase.from("guest_profiles").select("show_id, name, short_bio, full_bio").order("created_at", { ascending: true }),
        supabase.from("guest_profiles").select("show_id, photo_url"),
        supabase.from("show_reserved_seating_links").select("id, show_id, customer_name"),
        supabase.from("show_reserved_seat_assignments").select("show_id, seating_link_id, seat_id"),
      ]);
      if (!active) return;
      const coreError = showsCoreResult.error || sponsorsCoreResult.error;
      if (coreError) {
        setError(coreError.message || "Unable to load sponsor packet information.");
        setLoading(false);
        return;
      }

      const showDetailsById = new Map(
        ((showDetailsResult.error ? [] : showDetailsResult.data ?? []) as Array<{ id: string; venue: string | null; venue_address: string | null; show_start_time: string | null }>).map((item) => [item.id, item]),
      );
      const sponsorLogosById = new Map(
        ((sponsorLogosResult.error ? [] : sponsorLogosResult.data ?? []) as Array<{ id: string; logo_url: string | null }>).map((item) => [item.id, item.logo_url]),
      );
      const sponsorRecognitionById = new Map(
        ((sponsorRecognitionResult.error ? [] : sponsorRecognitionResult.data ?? []) as Array<{ id: string; recognition_notes: string | null }>).map((item) => [item.id, item.recognition_notes]),
      );
      const guestPhotosByShowId = new Map(
        ((guestPhotosResult.error ? [] : guestPhotosResult.data ?? []) as Array<{ show_id: string; photo_url: string | null }>).map((item) => [item.show_id, item.photo_url]),
      );

      const nextSources: PacketSources = {
        shows: ((showsCoreResult.data ?? []) as Array<Pick<SponsorPacketShowSource, "id" | "slug" | "name" | "show_date">>).map((item) => ({
          ...item,
          venue: showDetailsById.get(item.id)?.venue ?? null,
          venue_address: showDetailsById.get(item.id)?.venue_address ?? null,
          show_start_time: showDetailsById.get(item.id)?.show_start_time ?? null,
        })),
        sponsors: ((sponsorsCoreResult.data ?? []) as Array<Pick<SponsorPacketSponsorSource, "id" | "name">>).map((item) => ({
          ...item,
          logo_url: sponsorLogosById.get(item.id) ?? null,
          recognition_notes: sponsorRecognitionById.get(item.id) ?? null,
        })),
        showSponsors: (showSponsorsResult.error ? [] : showSponsorsResult.data ?? []) as SponsorPacketShowSponsorSource[],
        guests: ((guestsCoreResult.error ? [] : guestsCoreResult.data ?? []) as Array<Omit<SponsorPacketGuestSource, "photo_url">>).map((item) => ({
          ...item,
          photo_url: guestPhotosByShowId.get(item.show_id) ?? null,
        })),
        reservedLinks: (linksResult.error ? [] : linksResult.data ?? []) as SponsorPacketReservedLinkSource[],
        seatAssignments: (assignmentsResult.error ? [] : assignmentsResult.data ?? []) as SponsorPacketSeatAssignmentSource[],
      };
      const selectedShow = nextSources.shows.find((item) => item.slug === showSlug) ?? nextSources.shows[0];
      const assignedSponsorId = nextSources.showSponsors.find((item) => item.show_id === selectedShow?.id && item.sponsor_id)?.sponsor_id;
      const selectedSponsor = nextSources.sponsors.find((item) => item.id === assignedSponsorId) ?? nextSources.sponsors[0];
      setSources(nextSources);
      if (selectedShow && selectedSponsor) {
        await loadContextDraft(nextSources, selectedSponsor.id, selectedShow.id, null);
      } else {
        setDraft(null);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [loadContextDraft, showSlug, supabase]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  function update<K extends keyof SponsorPacketDraft>(key: K, value: SponsorPacketDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setHasUnsavedChanges(true);
    setSaveState("unsaved");
    setSaveMessage("Unsaved changes");
  }

  function confirmContextSwitch() {
    return !hasUnsavedChanges || window.confirm("You have unsaved sponsor packet changes. Switch without saving them?");
  }

  async function chooseSponsor(sponsorId: string) {
    if (!draft || !confirmContextSwitch()) return;
    await loadContextDraft(sources, sponsorId, draft.showId, bandProfile);
  }

  async function chooseShow(showId: string) {
    if (!draft || !confirmContextSwitch()) return;
    await loadContextDraft(sources, draft.sponsorId, showId, bandProfile);
    setVenuePhotoUrl("");
  }

  function resetDraft() {
    if (!draft) return;
    const next = buildDraft(sources, draft.sponsorId, draft.showId, bandProfile);
    if (next) {
      setDraft(next);
      setHasUnsavedChanges(true);
      setSaveState("unsaved");
      setSaveMessage("Defaults restored — save to keep these changes");
      setPresentationSections({ ...DEFAULT_PRESENTATION_SECTIONS });
      setVenuePhotoUrl("");
    }
  }

  function resetBandSection() {
    if (!draft) return;
    update("bandHeading", bandProfile?.displayName ?? "");
    setDraft((current) => current ? { ...current, bandDescription: bandProfile?.description ?? "", bandMembers: cloneBandMembers(bandProfile?.members ?? []) } : current);
  }

  async function saveDraft() {
    if (!draft) return;
    setSaveState("saving");
    setSaveMessage("Saving…");
    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(draft.showId)}/sponsor-packet?slug=${encodeURIComponent(showSlug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsorId: draft.sponsorId, draft: serializeSponsorPacketDraft(draft) }),
      });
      const payload = await response.json() as { draft?: SponsorPacketSavedDraft; error?: string };
      if (!response.ok || !payload.draft) throw new Error(payload.error || "Unable to save the draft.");
      setSavedDraft(payload.draft);
      setHasUnsavedChanges(false);
      setSaveState("saved");
      setSaveMessage("Saved");
    } catch (saveError) {
      setSaveState("failed");
      setSaveMessage(saveError instanceof Error ? saveError.message : "Save failed");
    }
  }

  async function deleteSavedDraft() {
    if (!draft || !savedDraft || !window.confirm("Delete this saved sponsor packet draft? The current form will return to defaults.")) return;
    setSaveState("saving");
    const response = await fetch(`/api/admin/shows/${encodeURIComponent(draft.showId)}/sponsor-packet?slug=${encodeURIComponent(showSlug)}&sponsorId=${encodeURIComponent(draft.sponsorId)}`, { method: "DELETE" });
    if (!response.ok) {
      setSaveState("failed");
      setSaveMessage("Delete failed");
      return;
    }
    setSavedDraft(null);
    const next = buildDraft(sources, draft.sponsorId, draft.showId, bandProfile);
    if (next) setDraft(next);
    setHasUnsavedChanges(false);
    setSaveState("idle");
    setSaveMessage("Saved draft deleted");
  }
  if (loading) return <main className="min-h-screen bg-stone-100 p-6"><p className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-6 text-stone-600">Loading Sponsor Packet Builder…</p></main>;
  if (error || !draft) return <main className="min-h-screen bg-stone-100 p-6"><div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6"><h1 className="text-xl font-semibold text-stone-900">Sponsor Packet Builder</h1><p className="mt-2 text-rose-700">{error || "A show and sponsor are required before building a packet."}</p><Link href={`/admin/${showSlug}?tab=sponsors`} className="mt-4 inline-block font-semibold text-emerald-700">Back to Sponsors</Link></div></main>;

  const ticketParagraph = buildSponsorTicketParagraph(draft);
  const mailingLines = [draft.address1, draft.address2, [draft.city, draft.state, draft.zip].filter(Boolean).join(" ")].filter(Boolean);
  const selectedShowName = sources.shows.find((show) => show.id === draft.showId)?.name || "Cumberland Mountain Music Show";
  const hasShowPage = draft.sections.showInformation || draft.sections.specialGuest || draft.sections.venueDirections || draft.sections.bandInformation || draft.sections.sponsorRecognition || draft.sections.contactInformation;
  const hasTicketPage = Boolean(draft.includeTickets && ticketParagraph && (draft.sections.complimentaryTickets || (draft.sections.reservedSeating && draft.admissionType === "reserved")));
  const basePages = [
    presentationSections.coverPage ? "cover" : null,
    presentationSections.personalizedLetter ? "letter" : null,
    hasShowPage ? "show" : null,
    hasTicketPage ? "tickets" : null,
    presentationSections.eventFlyerPlaceholder ? "flyer" : null,
    presentationSections.businessCardPlaceholder ? "business-card" : null,
    presentationSections.assemblyChecklist ? "checklist" : null,
  ].filter((page): page is string => Boolean(page));
  const showTableOfContents = presentationSections.tableOfContents && basePages.length > 2;
  const packetPages = [...basePages];
  if (showTableOfContents) packetPages.splice(presentationSections.coverPage ? 1 : 0, 0, "contents");
  const pageNumberFor = (page: string) => packetPages.indexOf(page) + 1;
  const totalPages = packetPages.length;
  const tableOfContentsItems = [
    presentationSections.personalizedLetter ? { label: "Letter", page: "letter" } : null,
    draft.sections.showInformation ? { label: "Show Information", page: "show" } : null,
    draft.sections.specialGuest && (draft.guestName || draft.guestBio) ? { label: "Featured Guest", page: "show" } : null,
    draft.sections.bandInformation && (draft.bandHeading || draft.bandDescription || draft.bandMembers.some((member) => member.included)) ? { label: "CMMS Band", page: "show" } : null,
    hasTicketPage && draft.sections.reservedSeating && draft.admissionType === "reserved" ? { label: "Reserved Seating", page: "tickets" } : null,
    hasTicketPage && draft.sections.complimentaryTickets ? { label: "Complimentary Tickets", page: "tickets" } : null,
    draft.sections.venueDirections ? { label: "Venue Information", page: "show" } : null,
    draft.sections.sponsorRecognition && draft.sponsorRecognition ? { label: "Your Sponsorship Recognition", page: "show" } : null,
    draft.sections.contactInformation && (draft.contactEmail || draft.contactPhone) ? { label: "Contact Information", page: "show" } : null,
    presentationSections.eventFlyerPlaceholder ? { label: "Event Flyer", page: "flyer" } : null,
    presentationSections.businessCardPlaceholder ? { label: "Business Card", page: "business-card" } : null,
    presentationSections.assemblyChecklist ? { label: "Packet Assembly Checklist", page: "checklist" } : null,
  ].filter((item): item is { label: string; page: string } => Boolean(item));

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900 sm:px-6">
      <style jsx global>{`
        @page { size: letter; margin: 0.65in; }
        @media print {
          body { background: white !important; }
          .packet-screen-only { display: none !important; }
          .packet-layout { display: block !important; max-width: none !important; }
          .packet-preview-shell { padding: 0 !important; border: 0 !important; box-shadow: none !important; background: white !important; }
          .packet-page { width: auto !important; min-height: auto !important; padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
          .packet-preview-shell > .packet-page:last-child { break-after: auto !important; page-break-after: auto !important; }
          .packet-keep { break-inside: avoid; }
          .packet-heading { break-after: avoid; }
          .packet-paragraph { orphans: 3; widows: 3; }
        .packet-section-heading { color: #0e7490; }
          .packet-footer { min-height: 0 !important; break-inside: avoid; margin-top: 0.16in !important; padding-top: 0.08in !important; border-right: 0 !important; border-bottom: 0 !important; border-left: 0 !important; }
          .packet-prepared-card { border: 0 !important; background: white !important; box-shadow: none !important; }
          .packet-page, .packet-page * { color: #050505 !important; }
          .packet-page { background: #fff !important; }
          .packet-page img { max-width: 100% !important; break-inside: avoid; }
          .packet-letter-page { font-size: 10.25pt !important; line-height: 1.48 !important; }
          .packet-letter-page .letter-content { gap: 0.55rem !important; }
          .packet-letter-page .packet-signature { break-inside: avoid; margin-top: 0.25rem; }
          .packet-show-page { font-size: 10pt !important; line-height: 1.34 !important; }
          .packet-show-page .show-sections { gap: 0.62rem !important; margin-top: 0.9rem !important; }
          .packet-show-page .packet-section-heading { color: #052e2b !important; font-size: 16pt !important; line-height: 1.15 !important; margin-bottom: 0.1rem; padding-bottom: 0.12rem; }
        }
        .packet-page { display: flex; flex-direction: column; line-height: 1.65; position: relative; border: 1px solid #d6d3d1; box-shadow: 0 18px 45px rgba(41, 37, 36, 0.18); }
        .packet-footer { min-height: 5.5rem; }
        .packet-heading { font-family: Georgia, serif; letter-spacing: -0.01em; }
        .packet-paragraph { orphans: 3; widows: 3; }
        .packet-section-heading { color: #0e7490; }
      `}</style>
      <div className="packet-screen-only mx-auto mb-5 flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">StageFlow</p><h1 className="text-2xl font-semibold">Sponsor Packet Builder</h1><p className="text-sm text-stone-600">Create a print-ready packet without changing saved sponsor or show records.</p></div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="mr-2 text-right text-xs text-stone-600" aria-live="polite">
            <p className="font-semibold">{saveMessage ?? (hasUnsavedChanges ? "Unsaved changes" : "Not saved yet")}</p>
            {savedDraft ? <p>Last saved {new Date(savedDraft.updated_at).toLocaleString()} · Created {new Date(savedDraft.created_at).toLocaleDateString()}</p> : null}
          </div>
          <Link href={`/admin/${showSlug}?tab=sponsors`} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">Back to Sponsors</Link>
          <button type="button" onClick={resetDraft} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">Reset Draft</button>
          {savedDraft ? <button type="button" onClick={() => void deleteSavedDraft()} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700">Delete Saved Draft</button> : null}
          <button type="button" onClick={() => void saveDraft()} disabled={saveState === "saving" || saveState === "loading"} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saveState === "saving" ? "Saving…" : savedDraft ? "Save Changes" : "Save Draft"}</button>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Print Packet</button>
        </div>
      </div>

      <div className="packet-layout mx-auto grid max-w-[1500px] gap-6 xl:grid-cols-[minmax(24rem,0.8fr)_minmax(0,1.2fr)]">
        <form className="packet-screen-only grid content-start gap-4" onSubmit={(event) => event.preventDefault()}>
          <FormSection title="Packet organization">
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["coverPage", "Cover Page"],
                ["coverWatermark", "Subtle Cover Watermark"],
                ["personalizedLetter", "Personalized Letter"],
                ["tableOfContents", "Table of Contents"],
                ["assemblyChecklist", "Packet Assembly Checklist"],
                ["eventFlyerPlaceholder", "Event Flyer Placeholder"],
                ["businessCardPlaceholder", "Business Card Placeholder"],
              ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={presentationSections[key]} onChange={(event) => setPresentationSections((current) => ({ ...current, [key]: event.target.checked }))} /> {label}</label>)}
            </div>
            <p className="text-xs text-stone-500">These print-layout choices are temporary for this browser session and do not change the saved packet draft. The table of contents appears only when the packet has more than two other printed pages.</p>
          </FormSection>
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4" aria-label="Packet Status">
            <h2 className="font-semibold text-stone-900">Packet Status</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p><span aria-hidden="true">{savedDraft && !hasUnsavedChanges ? "✓" : "□"}</span> Draft Saved</p>
              <p><span aria-hidden="true">{draft.sponsorName && draft.showDate ? "✓" : "□"}</span> Ready to Print</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={printed} onChange={(event) => setPrinted(event.target.checked)} /> Printed</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={mailed} onChange={(event) => setMailed(event.target.checked)} /> Mailed</label>
            </div>
            <p className="mt-2 text-xs text-stone-500">Printed and mailed indicators are informational for this browser session only.</p>
          </section>
          <FormSection title="Sponsor information">
            <label className="grid gap-1 text-sm font-medium">Sponsor selection<select value={draft.sponsorId} onChange={(event) => chooseSponsor(event.target.value)} className="rounded-xl border border-stone-300 px-3 py-2">{sources.sponsors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Sponsor name" value={draft.sponsorName} onChange={(value) => update("sponsorName", value)} /><Field label="Contact person" value={draft.contactPerson} onChange={(value) => update("contactPerson", value)} /></div>
            <Field label="Mailing address line 1" value={draft.address1} onChange={(value) => update("address1", value)} /><Field label="Mailing address line 2" value={draft.address2} onChange={(value) => update("address2", value)} />
            <div className="grid gap-3 sm:grid-cols-[1fr_5rem_7rem]"><Field label="City" value={draft.city} onChange={(value) => update("city", value)} /><Field label="State" value={draft.state} onChange={(value) => update("state", value)} /><Field label="ZIP" value={draft.zip} onChange={(value) => update("zip", value)} /></div>
            <Field label="Greeting name" value={draft.greetingName} onChange={(value) => update("greetingName", value)} />
          </FormSection>

          <FormSection title="Show information">
            <label className="grid gap-1 text-sm font-medium">Current show<select value={draft.showId} onChange={(event) => chooseShow(event.target.value)} className="rounded-xl border border-stone-300 px-3 py-2">{sources.shows.map((item) => <option key={item.id} value={item.id}>{item.name}{item.show_date ? ` — ${item.show_date}` : ""}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Show date" type="date" value={draft.showDate} onChange={(value) => update("showDate", value)} /><Field label="Doors time" type="time" value={draft.doorsTime} onChange={(value) => update("doorsTime", value)} /><Field label="Show time" type="time" value={draft.showTime} onChange={(value) => update("showTime", value)} /></div>
            <Field label="Venue name" value={draft.venueName} onChange={(value) => update("venueName", value)} /><TextArea label="Venue address" value={draft.venueAddress} onChange={(value) => update("venueAddress", value)} rows={2} /><Field label="Venue photo URL (optional, not saved)" value={venuePhotoUrl} onChange={setVenuePhotoUrl} />
          </FormSection>

          <FormSection title="Personal letter">
            <Field label="Letter subject or heading" value={draft.subject} onChange={(value) => update("subject", value)} /><TextArea label="Personal thank-you message" value={draft.thankYouMessage} onChange={(value) => update("thankYouMessage", value)} rows={5} /><TextArea label="Additional note or special instructions" value={draft.additionalNote} onChange={(value) => update("additionalNote", value)} />
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Closing name" value={draft.closingName} onChange={(value) => update("closingName", value)} /><Field label="Closing title" value={draft.closingTitle} onChange={(value) => update("closingTitle", value)} /><Field label="Contact email" type="email" value={draft.contactEmail} onChange={(value) => update("contactEmail", value)} /><Field label="Contact phone" type="tel" value={draft.contactPhone} onChange={(value) => update("contactPhone", value)} /></div>
            <Field label="Signature image URL (optional, not saved)" value={signatureImageUrl} onChange={setSignatureImageUrl} />
          </FormSection>

          <FormSection title="Ticket information">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.includeTickets} onChange={(event) => update("includeTickets", event.target.checked)} /> Include complimentary tickets</label>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Number of tickets enclosed" type="number" value={draft.ticketCount} onChange={(value) => update("ticketCount", Math.max(0, Number(value) || 0))} /><label className="grid gap-1 text-sm font-medium">Admission type<select value={draft.admissionType} onChange={(event) => update("admissionType", event.target.value as SponsorPacketDraft["admissionType"])} className="rounded-xl border border-stone-300 px-3 py-2"><option value="reserved">Reserved Seating</option><option value="general">General Admission</option></select></label></div>
            <Field label="Assigned seat labels (only when known)" value={draft.seatLabels} onChange={(value) => update("seatLabels", value)} /><TextArea label="Seat instructions" value={draft.seatInstructions} onChange={(value) => update("seatInstructions", value)} /><TextArea label="Ticket enclosure note" value={draft.ticketEnclosureNote} onChange={(value) => update("ticketEnclosureNote", value)} />
          </FormSection>

          <FormSection title="Packet content">
            <TextArea label="Featured guest name" value={draft.guestName} onChange={(value) => update("guestName", value)} rows={1} /><TextArea label="Featured guest biography" value={draft.guestBio} onChange={(value) => update("guestBio", value)} /><Field label="Print-safe guest photo URL" value={draft.guestPhotoUrl} onChange={(value) => update("guestPhotoUrl", value)} />
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-stone-900">CMMS Band Information</p><button type="button" onClick={resetBandSection} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">Reset Band Section to Defaults</button></div>
              <div className="mt-3 grid gap-3"><Field label="Band heading" value={draft.bandHeading} onChange={(value) => update("bandHeading", value)} /><TextArea label="Band description" value={draft.bandDescription} onChange={(value) => update("bandDescription", value)} />
                <div className="grid gap-2"><p className="text-sm font-medium text-stone-700">Member list</p>{draft.bandMembers.length === 0 ? <p className="text-sm text-stone-500">No active central band members are available.</p> : draft.bandMembers.map((member, index) => <div key={member.sourceId ?? `${member.name}-${index}`} className="grid gap-2 rounded-lg border border-stone-200 bg-white p-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={member.included} onChange={(event) => update("bandMembers", draft.bandMembers.map((item, itemIndex) => itemIndex === index ? { ...item, included: event.target.checked } : item))} /> Include</label><input aria-label={`Band member ${index + 1} name`} value={member.name} onChange={(event) => update("bandMembers", draft.bandMembers.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" /><input aria-label={`Band member ${index + 1} role`} value={member.role} onChange={(event) => update("bandMembers", draft.bandMembers.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" /></div>)}</div>
              </div>
            </div>
            <TextArea label="Sponsor recognition" value={draft.sponsorRecognition} onChange={(value) => update("sponsorRecognition", value)} />
            <div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked readOnly /> Personalized Thank-You Letter</label>{sectionOptions.map((section) => <label key={section.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.sections[section.key]} onChange={(event) => update("sections", { ...draft.sections, [section.key]: event.target.checked })} /> {section.label}</label>)}</div>
          </FormSection>
        </form>

        <section className="packet-preview-shell grid gap-5 rounded-2xl border border-stone-300 bg-stone-200 p-3 shadow-inner" aria-label="Sponsor packet live preview">
          {presentationSections.coverPage ? <article className="packet-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-stone-900 shadow-lg">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="relative flex w-full justify-center">{presentationSections.coverWatermark ? <Image src="/cmms-logo.png" alt="" aria-hidden="true" width={760} height={456} className="pointer-events-none absolute left-1/2 top-1/2 w-[95%] -translate-x-1/2 -translate-y-1/2 opacity-[0.035] grayscale" /> : null}<Image src="/cmms-logo.png" alt="Cumberland Mountain Music Show" width={720} height={432} className="relative z-10 h-64 max-w-full w-auto object-contain" /></div>
              <div className="mt-12 h-px w-24 bg-emerald-800" />
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">Cumberland Mountain Music Show</p>
              <h2 className="packet-heading mt-3 text-4xl font-semibold text-stone-900">Sponsor Appreciation Packet</h2>
              <p className="mt-8 text-xl font-semibold">{selectedShowName}</p>
              <p className="mt-2 text-base text-stone-600">{formatSponsorPacketDate(draft.showDate)}</p>
              <p className="mt-1 text-base text-stone-600">{draft.venueName}</p>
              <div className="packet-prepared-card mt-12 w-full max-w-xl rounded-2xl border border-stone-300 bg-stone-50/70 px-10 py-7 text-left shadow-sm">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Prepared Especially For</p>
                <p className="mt-3 text-center text-2xl font-semibold">{draft.sponsorName}</p>
                {draft.sponsorLogoUrl ? <Image src={draft.sponsorLogoUrl} alt={`${draft.sponsorName} logo`} width={200} height={100} unoptimized className="mx-auto mt-4 max-h-24 w-auto rounded-xl border border-stone-200 bg-white object-contain p-2" /> : null}
                {draft.contactPerson ? <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 border-t border-stone-200 pt-4 text-sm">
                  <dt className="font-semibold text-stone-600">Contact Person</dt><dd>{draft.contactPerson}</dd>
                </dl> : null}
              </div>
            </div>
            <PacketFooter page={pageNumberFor("cover")} total={totalPages} />
          </article> : null}

          {showTableOfContents ? <article className="packet-page packet-contents-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-stone-900 shadow-lg">
            <header className="border-b-2 border-emerald-800 pb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Sponsor Packet</p><h2 className="packet-heading text-3xl font-semibold">Table of Contents</h2></header>
            <ol className="mt-10 grid gap-4">{tableOfContentsItems.map((item) => <li key={`${item.label}-${item.page}`} className="packet-keep flex items-end gap-3"><span className="font-semibold">{item.label}</span><span className="mb-1 flex-1 border-b border-dotted border-stone-400" aria-hidden="true" /><span>Page {pageNumberFor(item.page)}</span></li>)}</ol>
            <PacketFooter page={pageNumberFor("contents")} total={totalPages} />
          </article> : null}

          {presentationSections.personalizedLetter ? <article className="packet-page packet-letter-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-[11pt] leading-7 text-stone-900 shadow-lg">
            <header className="flex items-start justify-between gap-6 border-b-2 border-emerald-800 pb-4"><Image src="/cmms-logo.png" alt="Cumberland Mountain Music Show" width={260} height={156} className="h-20 w-auto object-contain" /><div className="text-right text-sm"><p className="font-semibold">Cumberland Mountain Music Show</p><p>www.cumberlandmountainmusic.com</p></div></header>
            <div className="mt-8">{mailingLines.length > 0 ? <address className="mt-5 not-italic"><p className="font-semibold">{draft.contactPerson || draft.sponsorName}</p>{draft.contactPerson && draft.sponsorName !== draft.contactPerson ? <p>{draft.sponsorName}</p> : null}{mailingLines.map((line) => <p key={line}>{line}</p>)}</address> : null}</div>
            {draft.subject ? <h2 className="packet-heading mt-7 text-xl font-semibold">{draft.subject}</h2> : null}
            <div className="letter-content mt-5 space-y-3"><p>Dear {draft.greetingName || draft.sponsorName},</p><PacketParagraphs value={draft.thankYouMessage} />{ticketParagraph ? <p className="packet-paragraph">{ticketParagraph}</p> : null}{draft.ticketEnclosureNote && draft.includeTickets ? <p className="packet-paragraph">{draft.ticketEnclosureNote}</p> : null}{draft.additionalNote ? <PacketParagraphs value={draft.additionalNote} /> : null}<div className="packet-keep packet-signature pt-4"><p>Sincerely,</p>{signatureImageUrl ? <Image src={signatureImageUrl} alt="Signature" width={220} height={90} unoptimized className="mt-3 max-h-20 w-auto object-contain" /> : null}<p className={signatureImageUrl ? "mt-2 font-semibold" : "mt-6 font-semibold"}>{draft.closingName || "Bryan Turner"}</p><p>{draft.closingTitle || "Owner & Producer"}</p><p>Cumberland Mountain Music Show</p><p>www.cumberlandmountainmusic.com</p><p>{draft.contactEmail || "info@cumberlandmountainmusic.com"}</p></div></div>
            <PacketFooter page={pageNumberFor("letter")} total={totalPages} />
          </article> : null}

          {hasShowPage ? <article className="packet-page packet-show-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-[11pt] leading-7 text-stone-900 shadow-lg">
            <header className="border-b-2 border-emerald-800 pb-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Sponsor Packet</p><h2 className="packet-heading text-3xl font-semibold">{selectedShowName}</h2></header>
            <div className="show-sections mt-6 grid gap-5">
              {draft.sections.showInformation ? <section className="packet-keep"><h3 className="packet-heading packet-section-heading border-b border-teal-500/50 pb-1.5 text-2xl font-semibold">Show Information</h3><p className="mt-3"><strong>Date:</strong> {formatSponsorPacketDate(draft.showDate)}</p>{draft.doorsTime ? <p><strong>Doors:</strong> {formatSponsorPacketTime(draft.doorsTime)}</p> : null}{draft.showTime ? <p><strong>Show:</strong> {formatSponsorPacketTime(draft.showTime)}</p> : null}<p><strong>Venue:</strong> {draft.venueName}</p></section> : null}
              {draft.sections.specialGuest && (draft.guestName || draft.guestBio) ? <section className="packet-keep"><h3 className="packet-heading packet-section-heading border-b border-teal-500/50 pb-1.5 text-2xl font-semibold">Featured Guest</h3><div className="mt-3 flex gap-5">{draft.guestPhotoUrl ? <Image src={draft.guestPhotoUrl} alt="" width={144} height={144} unoptimized className="h-36 w-36 rounded-xl border border-stone-200 object-cover p-1" /> : null}<div>{draft.guestName ? <p className="text-lg font-semibold">{draft.guestName}</p> : null}{draft.guestBio ? <PacketParagraphs value={draft.guestBio} /> : null}</div></div></section> : null}
              {draft.sections.venueDirections ? <section className="packet-keep"><h3 className="packet-heading packet-section-heading border-b border-teal-500/50 pb-1.5 text-2xl font-semibold">Venue Information</h3><div className="mt-3 flex gap-5">{venuePhotoUrl ? <Image src={venuePhotoUrl} alt="Venue" width={180} height={120} unoptimized className="h-32 w-48 rounded-xl border border-stone-200 object-cover p-1" /> : null}<div><p className="font-semibold">{draft.venueName || DEFAULT_VENUE_NAME}</p><p className="whitespace-pre-line">{draft.venueAddress || DEFAULT_VENUE_ADDRESS}</p><p className="mt-2"><span className="font-semibold">Venue information and directions:</span><br />www.cumberlandmountainmusic.com/venue</p></div></div></section> : null}
              {draft.sections.bandInformation && (draft.bandHeading || draft.bandDescription || draft.bandMembers.some((member) => member.included)) ? <section className="packet-keep"><h3 className="packet-heading packet-section-heading border-b border-teal-500/50 pb-1.5 text-2xl font-semibold">{draft.bandHeading || "The CMMS Band"}</h3>{draft.bandDescription ? <div className="mt-3"><PacketParagraphs value={draft.bandDescription} /></div> : null}<div className="mt-3 grid gap-2">{draft.bandMembers.filter((member) => member.included).map((member, index) => <p key={member.sourceId ?? `${member.name}-${index}`}><strong>{member.name}</strong>{member.role ? ` — ${member.role}` : ""}</p>)}</div></section> : null}
              {draft.sections.sponsorRecognition && draft.sponsorRecognition ? <section className="packet-keep"><h3 className="packet-heading packet-section-heading border-b border-teal-500/50 pb-1.5 text-2xl font-semibold">Your Sponsorship Recognition</h3><div className="mt-3"><PacketParagraphs value={draft.sponsorRecognition} /></div></section> : null}
              {draft.sections.contactInformation && (draft.contactEmail || draft.contactPhone) ? <section className="packet-keep"><h3 className="packet-heading packet-section-heading border-b border-teal-500/50 pb-1.5 text-2xl font-semibold">Contact Information</h3>{draft.contactEmail ? <p className="mt-3">{draft.contactEmail}</p> : null}{draft.contactPhone ? <p>{draft.contactPhone}</p> : null}</section> : null}
              <p className="packet-keep border-t border-stone-200 pt-3 text-center italic">We look forward to seeing you at the Cumberland Mountain Music Show.</p>
            </div>
            <PacketFooter page={pageNumberFor("show")} total={totalPages} />
          </article> : null}

          {hasTicketPage ? <article className="packet-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-[11pt] leading-7 text-stone-900 shadow-lg"><header className="border-b-2 border-emerald-800 pb-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Complimentary Admission</p><h2 className="packet-heading text-3xl font-semibold">Ticket Information</h2></header><section className="packet-keep mt-8 rounded-xl border border-stone-300 p-6"><p>{ticketParagraph}</p>{draft.sections.reservedSeating && draft.admissionType === "reserved" && draft.seatLabels ? <p className="mt-3"><strong>Assigned seats:</strong> {draft.seatLabels}</p> : null}{draft.seatInstructions ? <div className="mt-3"><PacketParagraphs value={draft.seatInstructions} /></div> : null}{draft.ticketEnclosureNote ? <div className="mt-3"><PacketParagraphs value={draft.ticketEnclosureNote} /></div> : null}</section><PacketFooter page={pageNumberFor("tickets")} total={totalPages} /></article> : null}

          {presentationSections.eventFlyerPlaceholder ? <article className="packet-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-stone-900 shadow-lg"><div className="flex flex-1 items-center justify-center"><div className="w-full rounded-2xl border-2 border-dashed border-stone-300 p-16 text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Insert Location</p><h2 className="packet-heading mt-3 text-3xl font-semibold">Event Flyer</h2><p className="mt-3 text-stone-600">Place the current Cumberland Mountain Music Show event flyer here.</p></div></div><PacketFooter page={pageNumberFor("flyer")} total={totalPages} /></article> : null}
          {presentationSections.businessCardPlaceholder ? <article className="packet-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-stone-900 shadow-lg"><div className="flex flex-1 items-center justify-center"><div className="w-full rounded-2xl border-2 border-dashed border-stone-300 p-16 text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Insert Location</p><h2 className="packet-heading mt-3 text-3xl font-semibold">Business Card</h2><p className="mt-3 text-stone-600">Attach or insert a Cumberland Mountain Music Show contact card here.</p></div></div><PacketFooter page={pageNumberFor("business-card")} total={totalPages} /></article> : null}
          {presentationSections.assemblyChecklist ? <article className="packet-page mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white p-[0.7in] text-[12pt] text-stone-900 shadow-lg"><header className="border-b-2 border-emerald-800 pb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">For Packet Assembly</p><h2 className="packet-heading text-3xl font-semibold">Packet Assembly Checklist</h2><p className="mt-2 text-stone-600">Prepared for {draft.sponsorName}</p></header><div className="mt-10 grid gap-5">{["Sponsor Letter", "Complimentary Tickets Included", "Reserved Seat Cards Included", "Event Flyer Included", "Sponsor Recognition Sheet Included", "Business Card Included", "Envelope Addressed", "Packet Mailed"].map((item) => <p key={item} className="packet-keep flex items-center gap-4 border-b border-stone-200 pb-3"><span aria-hidden="true" className="text-2xl">☐</span><span>{item}</span></p>)}</div><PacketFooter page={pageNumberFor("checklist")} total={totalPages} /></article> : null}
        </section>
      </div>
    </main>
  );
}
