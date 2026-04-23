"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import {
  buildBlockNoteDrafts,
  buildMcRunSections,
  buildMcRunSheetData,
  buildScriptFormState,
  formatSponsorPlacementType,
  PerformerBlockCard,
  ScriptCard,
  SponsorReadCard,
} from "@/app/components/mc-page";
import {
  formatPromoFileSize,
  formatPromoMaterialCategory,
  formatPromoUploadDate,
  getPromoFileExtension,
  isPromoMaterialImage,
  PromoMaterialsView,
} from "@/app/components/promo-materials-view";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/app/components/theme-toggle";
import type {
  GuestProfile,
  GuestProfileFormState,
  McBlockNote,
  PromoMaterial,
  PromoMaterialCategory,
  PromoMaterialFormState,
  SetSection,
  SetlistEntry,
  ShowGuestSong,
  ShowSponsor,
  SongRecord,
  SponsorLibraryEntry,
  SponsorLibraryFormState,
  ShowSponsorAssignmentFormState,
  ShowDetailsFormState,
  ShowRecord,
  SongFormState,
  SongTempo,
  SongType,
  ViewMode,
} from "@/lib/types";

type PendingSubmission = ShowGuestSong & {
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  submitted_by_role: "guest";
};

type SongLibrarySong = SongRecord & {
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  source_role: SongRecord["created_by_role"];
};

type SetlistSong = SetlistEntry & {
  set_section: SetSection;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  source_role: string | null;
};

type PrintMode = "stage" | "band" | "standard";
type AdminTab = "setlist" | "songs" | "guests" | "promo-materials" | "sponsors" | "mc-builder" | "show-details";
type BandTab = "setlist" | "songs" | "itinerary" | "promo-materials";
type GuestTab = "songs" | "artist-info" | "itinerary" | "promo-materials";
type SponsorAdminTab = "library" | "show";
type SetlistSectionConfig = {
  key: SetSection;
  title: string;
  optional?: boolean;
};

const adminTabItems: Array<{ key: AdminTab; label: string }> = [
  { key: "setlist", label: "Setlist" },
  { key: "songs", label: "Songs" },
  { key: "guests", label: "Guests" },
  { key: "promo-materials", label: "Promo Materials" },
  { key: "sponsors", label: "Sponsors" },
  { key: "mc-builder", label: "MC Builder" },
  { key: "show-details", label: "Show Details" },
];

function normalizeAdminTab(value: string | null): AdminTab | null {
  return adminTabItems.some((tab) => tab.key === value) ? (value as AdminTab) : null;
}

const bandTabItems: Array<{ key: BandTab; label: string }> = [
  { key: "setlist", label: "Setlist" },
  { key: "songs", label: "Songs" },
  { key: "itinerary", label: "Itinerary" },
  { key: "promo-materials", label: "Promo Materials" },
];

const guestTabItems: Array<{ key: GuestTab; label: string }> = [
  { key: "songs", label: "Songs" },
  { key: "artist-info", label: "Artist Info" },
  { key: "itinerary", label: "Itinerary" },
  { key: "promo-materials", label: "Promo Materials" },
];

const sponsorAdminTabItems: Array<{
  key: SponsorAdminTab;
  label: string;
  description: string;
}> = [
  {
    key: "library",
    label: "Sponsor Library",
    description: "Reusable sponsors saved for any show.",
  },
  {
    key: "show",
    label: "This Show's Sponsors",
    description: "Assignments, ordering, and placement for this event.",
  },
];

const setlistSectionOrder: SetSection[] = ["set1", "set2", "encore"];
const setlistSectionConfigs: SetlistSectionConfig[] = [
  { key: "set1", title: "Set 1" },
  { key: "set2", title: "Set 2" },
  { key: "encore", title: "Encore", optional: true },
];

const initialFormState: SongFormState = {
  title: "",
  key: "",
  tempo: "",
  songType: "",
  notes: "",
  lyrics: "",
};

const initialGuestProfileFormState: GuestProfileFormState = {
  name: "",
  shortBio: "",
  fullBio: "",
  hometown: "",
  instruments: "",
  facebook: "",
  instagram: "",
  website: "",
  permissionGranted: false,
};

const initialShowDetailsFormState: ShowDetailsFormState = {
  venue: "",
  venueAddress: "",
  directionsUrl: "",
  callTime: "",
  soundcheckTime: "",
  guestArrivalTime: "",
  bandArrivalTime: "",
  showStartTime: "",
  contactName: "",
  contactPhone: "",
  parkingNotes: "",
  loadInNotes: "",
  announcements: "",
  guestMessage: "",
  promoShort: "",
  promoLong: "",
  ticketLink: "",
};

const initialPromoMaterialFormState: PromoMaterialFormState = {
  title: "",
  description: "",
  category: "other",
  isVisible: true,
};

const promoMaterialCategoryOptions: Array<{
  value: PromoMaterialCategory;
  label: string;
}> = [
  { value: "flyer", label: "Flyer" },
  { value: "social_graphic", label: "Social Graphic" },
  { value: "poster", label: "Poster" },
  { value: "sponsor_graphic", label: "Sponsor Graphic" },
  { value: "logo", label: "Logo" },
  { value: "promo_photo", label: "Promo Photo" },
  { value: "other", label: "Other" },
];

const defaultSingerName = "CMMS Band";
const urlPattern = /(https?:\/\/[^\s]+)/g;
const urlOnlyPattern = /^https?:\/\/[^\s]+$/;

function getDisplaySingerName(value: string | null | undefined) {
  return value?.trim() || defaultSingerName;
}

function renderTextWithLinks(text: string | null | undefined): ReactNode {
  const value = text ?? "";

  return value.split(urlPattern).map((part, index) => {
    if (!part) {
      return null;
    }

    if (urlOnlyPattern.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-emerald-700 underline"
        >
          {part}
        </a>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

type ShowInfoItem = {
  label: string;
  value: string;
  href?: string;
};

type ScriptFormState = {
  openingScript: string;
  intermissionScript: string;
  closingScript: string;
};

type BlockNoteFormState = {
  introNote: string;
  sponsorMention: string;
  transitionNote: string;
};

type SongEditFormState = {
  title: string;
  key: string;
  tempo: "" | SongTempo;
  songType: "" | SongType;
  artist?: string;
  notes?: string;
  lyrics?: string;
};

type SetlistSongEditFormState = {
  customTitle: string;
};

type McFlowRenderableItem =
  | {
      kind: "block";
      id: string;
      anchorSongId: string;
      performer: string;
    }
  | {
      kind: "sponsor";
      id: string;
      sponsor: ShowSponsor;
    }
  | {
      kind: "marker";
      id: string;
      marker: "before-intermission" | "after-intermission" | "closing" | "flexible";
    };

const initialSponsorLibraryFormState: SponsorLibraryFormState = {
  name: "",
  shortMessage: "",
  fullMessage: "",
  website: "",
  logoUrl: "",
};

const initialShowSponsorAssignmentFormState: ShowSponsorAssignmentFormState = {
  sponsorId: "",
  placementType: "",
  linkedPerformer: "",
  customNote: "",
};

const sponsorPlacementOptions = [
  { value: "", label: "Flexible / not set" },
  { value: "before_performer", label: "Before Performer Block" },
  { value: "after_performer", label: "After Performer Block" },
  { value: "before_intermission", label: "Before Intermission" },
  { value: "after_intermission", label: "After Intermission" },
  { value: "closing", label: "Closing Section" },
] as const;

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

  return "Something went wrong while talking to Supabase.";
}

function logDataSectionError(sectionName: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`Failed to load ${sectionName}.`, error);
  }
}

function sortSetlistSongs(songs: SetlistSong[]) {
  return [...songs].sort((songA, songB) => {
    const sectionDifference =
      setlistSectionOrder.indexOf(songA.section) - setlistSectionOrder.indexOf(songB.section);

    if (sectionDifference !== 0) {
      return sectionDifference;
    }

    if (songA.position !== songB.position) {
      return songA.position - songB.position;
    }

    return songA.created_at.localeCompare(songB.created_at);
  });
}

function buildSongEditFormState(song: {
  title: string;
  key: string | null;
  tempo: SongTempo | null;
  song_type: SongType | null;
  notes?: string | null;
  lyrics?: string | null;
}): SongEditFormState {
  return {
    title: song.title,
    key: song.key ?? "",
    tempo: song.tempo ?? "",
    songType: song.song_type ?? "",
    notes: song.notes ?? "",
    lyrics: song.lyrics ?? "",
  };
}

function buildSetlistSongEditFormState(song: SetlistSong): SetlistSongEditFormState {
  return {
    customTitle: song.custom_title ?? "",
  };
}

type SetlistEntryQueryRow = {
  id: string;
  show_id: string;
  section: string | null;
  position: number;
  source_type: string | null;
  song_id: string | null;
  guest_song_id: string | null;
  custom_title: string | null;
  created_at: string;
  title?: string;
  key?: string | null;
  tempo?: SongTempo | null;
  song_type?: SongType | null;
  notes?: string | null;
  lyrics?: string | null;
  performer_name?: string | null;
  library_song?: SongLibrarySong | SongLibrarySong[] | null;
  guest_song?: PendingSubmission | PendingSubmission[] | null;
};

type DataSectionKey =
  | "setlist"
  | "guestSongs"
  | "songLibrary"
  | "sponsorLibrary"
  | "showSponsors"
  | "promoMaterials"
  | "guestProfiles"
  | "mcBlockNotes";

type DataSectionErrors = Partial<Record<DataSectionKey, string>>;

function buildGuestProfileFormStateFromProfile(profile: GuestProfile): GuestProfileFormState {
  return {
    name: profile.name ?? "",
    shortBio: profile.short_bio ?? "",
    fullBio: profile.full_bio ?? "",
    hometown: profile.hometown ?? "",
    instruments: profile.instruments ?? "",
    facebook: profile.facebook ?? "",
    instagram: profile.instagram ?? "",
    website: profile.website ?? "",
    permissionGranted: profile.permission_granted,
  };
}

function buildSponsorLibraryFormState(sponsor: SponsorLibraryEntry): SponsorLibraryFormState {
  return {
    name: sponsor.name,
    shortMessage: sponsor.short_message ?? "",
    fullMessage: sponsor.full_message ?? "",
    website: sponsor.website ?? "",
    logoUrl: sponsor.logo_url ?? "",
  };
}

function buildShowSponsorAssignmentFormState(sponsor: ShowSponsor): ShowSponsorAssignmentFormState {
  return {
    sponsorId: sponsor.sponsor_id ?? "",
    placementType: sponsor.placement_type ?? "",
    linkedPerformer: sponsor.linked_performer ?? "",
    customNote: sponsor.custom_note ?? "",
  };
}

function normalizeSetSection(value: string | null | undefined): SetSection {
  if (value === "set2" || value === "encore") {
    return value;
  }

  return "set1";
}

function normalizeSongTempo(value: string | null | undefined): SongTempo | null {
  if (value === "fast" || value === "medium" || value === "slow") {
    return value;
  }

  return null;
}

function normalizeSongType(value: string | null | undefined): SongType | null {
  if (value === "vocal" || value === "instrumental") {
    return value;
  }

  return null;
}

function normalizeSetlistSong(song: SetlistEntryQueryRow | SetlistSong): SetlistSong {
  const librarySong = "library_song" in song
    ? Array.isArray(song.library_song)
      ? song.library_song[0]
      : song.library_song
    : null;
  const guestSong = "guest_song" in song
    ? Array.isArray(song.guest_song)
      ? song.guest_song[0]
      : song.guest_song
    : null;
  const resolvedTitle = song.custom_title?.trim() || librarySong?.title || guestSong?.title || song.title || "";
  const resolvedKey = librarySong?.key ?? guestSong?.key ?? song.key ?? null;
  const resolvedTempo = librarySong?.tempo ?? guestSong?.tempo ?? song.tempo ?? null;
  const resolvedSongType = librarySong?.song_type ?? guestSong?.song_type ?? song.song_type ?? null;
  const resolvedNotes = librarySong?.notes ?? guestSong?.notes ?? song.notes ?? null;
  const resolvedLyrics = librarySong?.lyrics ?? guestSong?.lyrics ?? song.lyrics ?? null;
  const resolvedPerformer =
    guestSong?.submitted_by_name?.trim() ||
    ("performer_name" in song ? song.performer_name : null) ||
    defaultSingerName;

  return {
    ...song,
    section: normalizeSetSection(song.section),
    source_type: song.source_type === "guest" ? "guest" : "library",
    title: resolvedTitle,
    key: resolvedKey,
    tempo: normalizeSongTempo(resolvedTempo),
    song_type: normalizeSongType(resolvedSongType),
    performer_name: resolvedPerformer,
    set_section: normalizeSetSection(song.section),
    artist: resolvedPerformer,
    song_key: resolvedKey,
    notes: resolvedNotes,
    lyrics: resolvedLyrics,
    source_role: song.source_type === "guest" ? "guest" : "band",
  };
}

function getSongsInSection(songs: SetlistSong[], section: SetSection) {
  return songs.filter((song) => song.section === section);
}

function getNextPositionForSection(songs: SetlistSong[], section: SetSection) {
  const songsInSection = getSongsInSection(songs, section);
  return songsInSection.length > 0
    ? Math.max(...songsInSection.map((song) => song.position)) + 1
    : 1;
}

function getRenderableSetlistSections(songs: SetlistSong[]) {
  return setlistSectionConfigs
    .map((section) => ({
      ...section,
      songs: getSongsInSection(songs, section.key),
    }))
    .filter((section) => !section.optional || section.songs.length > 0);
}

function normalizeGuestProfileName(name: string) {
  return name.trim().toLowerCase();
}

function isGuestSongForProfile(song: PendingSubmission, profileName: string | null | undefined) {
  const normalizedProfileName = normalizeGuestProfileName(profileName ?? "");

  if (!normalizedProfileName) {
    return false;
  }

  return (
    normalizeGuestProfileName(song.submitted_by_name ?? "") === normalizedProfileName
  );
}

function normalizeOptionalField(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function normalizePromoMaterialCategory(value: string | null | undefined): PromoMaterialCategory {
  return promoMaterialCategoryOptions.some((option) => option.value === value)
    ? (value as PromoMaterialCategory)
    : "other";
}

function buildPromoMaterialFormState(material: PromoMaterial): PromoMaterialFormState {
  return {
    title: material.title,
    description: material.description ?? "",
    category: normalizePromoMaterialCategory(material.category),
    isVisible: material.is_visible,
  };
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "promo-material";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSiteBaseUrl() {
  // NEXT_PUBLIC_SITE_URL is optional and used to build full admin links for emails.
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

function buildAdminShowUrl(showSlug: string) {
  const adminPath = `/admin/${encodeURIComponent(showSlug)}`;
  const siteBaseUrl = getSiteBaseUrl();

  return siteBaseUrl ? `${siteBaseUrl}${adminPath}` : adminPath;
}

function buildNotificationHtml({
  heading,
  intro,
  rows,
  adminUrl,
}: {
  heading: string;
  intro: string;
  rows: Array<{ label: string; value: string | null | undefined }>;
  adminUrl: string;
}) {
  const visibleRows = rows.filter((row) => row.value?.trim());

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p style="margin: 0 0 16px; font-size: 22px; font-weight: 700;">${escapeHtml(heading)}</p>
      <p style="margin: 0 0 18px;">${escapeHtml(intro)}</p>
      <div style="margin: 0 0 20px;">
        ${visibleRows
          .map(
            (row) =>
              `<p style="margin: 0 0 10px;"><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value?.trim() ?? "")}</p>`,
          )
          .join("")}
      </div>
      <p style="margin: 24px 0 0;">
        <a href="${escapeHtml(adminUrl)}" style="color: #047857; font-weight: 700; text-decoration: underline;">
          Open Show in Admin
        </a>
      </p>
    </div>
  `;
}

function buildSongPrintHtml(song: SongLibrarySong) {
  const songKey = song.song_key ?? song.key ?? null;
  const notes = song.notes?.trim() || "No notes added.";
  const lyrics = song.lyrics?.trim() || "No lyrics added.";

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(song.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; }
          h1 { margin: 0 0 12px; font-size: 28px; }
          .meta { margin: 0 0 24px; font-size: 14px; color: #4b5563; }
          .section { margin-top: 24px; }
          .label { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
          .body { margin-top: 8px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(song.title)}</h1>
        <p class="meta">${songKey ? `Key: ${escapeHtml(songKey)}` : "Key: Not set"}</p>
        <section class="section">
          <div class="label">Notes</div>
          <div class="body">${escapeHtml(notes)}</div>
        </section>
        <section class="section">
          <div class="label">Lyrics</div>
          <div class="body">${escapeHtml(lyrics)}</div>
        </section>
      </body>
    </html>
  `;
}

async function sendAdminNotification(payload: { subject: string; html: string }) {
  try {
    const response = await fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Admin notification request failed.", {
        status: response.status,
        body: errorText,
      });
    }
  } catch (error) {
    console.error("Admin notification request failed unexpectedly.", error);
  }
}

function normalizeSubmittedByRole(value: string | null | undefined): "guest" | "band" | "admin" {
  if (value === "band" || value === "admin") {
    return value;
  }

  if (value === "Band") {
    return "band";
  }

  if (value === "Admin") {
    return "admin";
  }

  return "guest";
}

function canBandEditSharedSong(role: string | null | undefined) {
  if (!role) {
    return true;
  }

  return normalizeSubmittedByRole(role) !== "guest";
}

function normalizePendingSubmission(
  submission: PendingSubmission,
): PendingSubmission {
  return {
    ...submission,
    key: submission.key ?? null,
    tempo: normalizeSongTempo(submission.tempo),
    song_type: normalizeSongType(submission.song_type),
    submitted_by_name: submission.submitted_by_name ?? null,
    artist: submission.submitted_by_name ?? null,
    song_key: submission.key ?? null,
    notes: submission.notes ?? null,
    lyrics: submission.lyrics ?? null,
    submitted_by_role: "guest",
  };
}

function formatSubmittedByRole(role: SongLibrarySong["created_by_role"]) {
  const normalizedRole = normalizeSubmittedByRole(role);

  if (normalizedRole === "admin") {
    return "Admin";
  }

  if (normalizedRole === "band") {
    return "Band";
  }

  return "Guest";
}

function normalizeSongLibrarySong(
  song: SongLibrarySong,
): SongLibrarySong {
  return {
    ...song,
    key: song.key ?? null,
    tempo: normalizeSongTempo(song.tempo),
    song_type: normalizeSongType(song.song_type),
    created_by_role: normalizeSubmittedByRole(song.created_by_role) as SongLibrarySong["created_by_role"],
    created_by_name: song.created_by_name ?? null,
    artist: null,
    song_key: song.key ?? null,
    notes: song.notes ?? null,
    lyrics: song.lyrics ?? null,
    source_role: normalizeSubmittedByRole(song.created_by_role),
  };
}

function normalizeSponsorLibraryEntry(
  sponsor: SponsorLibraryEntry & { website?: string | null },
): SponsorLibraryEntry {
  return {
    ...sponsor,
    website: sponsor.website ?? null,
    logo_url: sponsor.logo_url ?? null,
  };
}

async function uploadSponsorLogoFile(
  file: File,
  sponsorName: string,
): Promise<string> {
  const supabase = createClient();
  const fileExt = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  const fileName = `${Date.now()}-${sponsorName
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "") || "sponsor-logo"}`;
  const filePath = fileExt
    ? `${fileName}.${fileExt}`
    : fileName;

  const { error: uploadError } = await supabase.storage
    .from("sponsor-logos")
    .upload(filePath, file, {
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from("sponsor-logos")
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}

async function uploadPromoMaterialFile({
  file,
  showId,
  title,
}: {
  file: File;
  showId: string;
  title: string;
}) {
  const supabase = createClient();
  const originalName = sanitizeFileName(file.name);
  const titleSlug = sanitizeFileName(title || "promo-material");
  const filePath = `${showId}/${Date.now()}-${titleSlug}-${originalName}`;

  const { error: uploadError } = await supabase.storage
    .from("promo-materials")
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from("promo-materials")
    .getPublicUrl(filePath);

  return {
    file_name: originalName,
    file_path: filePath,
    file_url: publicUrlData.publicUrl,
    file_mime_type: file.type || null,
    file_size: file.size,
  };
}

function getSponsorInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "NL";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function SponsorLogoThumbnail({
  logoUrl,
  sponsorName,
  className,
}: {
  logoUrl: string | null | undefined;
  sponsorName: string;
  className?: string;
}) {
  const initials = getSponsorInitials(sponsorName);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 p-2 text-stone-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${className ?? "h-14 w-14"}`}
    >
      {logoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={`${sponsorName} logo`}
            className="h-full w-full object-contain"
          />
        </>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">
          {initials}
        </span>
      )}
    </div>
  );
}

function normalizeShowSponsor(
  sponsor: ShowSponsor & {
    sponsor?: SponsorLibraryEntry | SponsorLibraryEntry[] | null;
  },
): ShowSponsor {
  const relatedSponsor = Array.isArray(sponsor.sponsor) ? sponsor.sponsor[0] : sponsor.sponsor;

  return {
    ...sponsor,
    sponsor: relatedSponsor ? normalizeSponsorLibraryEntry(relatedSponsor) : null,
  };
}

function mergeShowSponsorsWithLibrary(
  showSponsors: ShowSponsor[],
  sponsorLibrary: SponsorLibraryEntry[],
) {
  const sponsorLookup = sponsorLibrary.reduce<Record<string, SponsorLibraryEntry>>((lookup, sponsor) => {
    lookup[sponsor.id] = sponsor;
    return lookup;
  }, {});

  return showSponsors.map((sponsor) =>
    normalizeShowSponsor({
      ...sponsor,
      sponsor: sponsor.sponsor_id ? sponsorLookup[sponsor.sponsor_id] ?? null : null,
    }),
  );
}

function attachSponsorToShowAssignment(
  sponsor: ShowSponsor,
  sponsorLibrary: SponsorLibraryEntry[],
) {
  return normalizeShowSponsor({
    ...sponsor,
    sponsor: sponsor.sponsor_id
      ? sponsorLibrary.find((librarySponsor) => librarySponsor.id === sponsor.sponsor_id) ?? null
      : null,
  });
}

function formatLibrarySourceRole(role: SongLibrarySong["created_by_role"]) {
  if (!role) {
    return "Unknown";
  }

  return formatSubmittedByRole(role);
}

function getNextSponsorPlacementOrder(sponsors: ShowSponsor[]) {
  return sponsors.length > 0
    ? Math.max(...sponsors.map((sponsor) => sponsor.placement_order)) + 1
    : 1;
}

function getSponsorReadText(sponsor: ShowSponsor) {
  const fullMessage = sponsor.sponsor?.full_message?.trim();

  if (fullMessage) {
    return fullMessage;
  }

  const shortMessage = sponsor.sponsor?.short_message?.trim();

  if (shortMessage) {
    return shortMessage;
  }

  const sponsorName = sponsor.sponsor?.name?.trim();

  if (sponsorName) {
    return sponsorName;
  }

  return "Sponsor read not available.";
}

function buildAdminMcFlowItems(
  runSections: ReturnType<typeof buildMcRunSections>,
  runSheetData: ReturnType<typeof buildMcRunSheetData>,
) {
  const items: McFlowRenderableItem[] = [];

  runSheetData.sectionItems.forEach((section) => {
    section.items.forEach((item) => {
      if (item.kind === "sponsor") {
        items.push({
          kind: "sponsor",
          id: item.sponsor.id,
          sponsor: item.sponsor,
        });
        return;
      }

      items.push({
        kind: "block",
        id: item.block.anchorSongId,
        anchorSongId: item.block.anchorSongId,
        performer: item.block.performer,
      });
    });
  });

  if (runSheetData.beforeIntermission.length > 0) {
    items.push({
      kind: "marker",
      id: "marker-before-intermission",
      marker: "before-intermission",
    });
    runSheetData.beforeIntermission.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: sponsor.id,
        sponsor,
      });
    });
  }

  if (runSheetData.afterIntermission.length > 0) {
    items.push({
      kind: "marker",
      id: "marker-after-intermission",
      marker: "after-intermission",
    });
    runSheetData.afterIntermission.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: sponsor.id,
        sponsor,
      });
    });
  }

  if (runSheetData.closing.length > 0) {
    items.push({
      kind: "marker",
      id: "marker-closing",
      marker: "closing",
    });
    runSheetData.closing.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: sponsor.id,
        sponsor,
      });
    });
  }

  if (runSheetData.flexible.length > 0) {
    items.push({
      kind: "marker",
      id: "marker-flexible",
      marker: "flexible",
    });
    runSheetData.flexible.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: sponsor.id,
        sponsor,
      });
    });
  }

  if (items.length === 0) {
    runSections.forEach((section) => {
      section.blocks.forEach((block) => {
        items.push({
          kind: "block",
          id: block.anchorSongId,
          anchorSongId: block.anchorSongId,
          performer: block.performer,
        });
      });
    });
  }

  return items;
}

function getMcSponsorPlacementFromNeighbor(
  neighbor: McFlowRenderableItem,
  direction: "up" | "down",
) {
  if (neighbor.kind === "block") {
    return {
      placement_type: direction === "up" ? "before_performer" : "after_performer",
      mc_anchor_song_id: neighbor.anchorSongId,
      linked_performer: neighbor.performer,
    };
  }

  if (neighbor.kind === "marker") {
    if (neighbor.marker === "before-intermission") {
      return {
        placement_type: "before_intermission",
        mc_anchor_song_id: null,
        linked_performer: null,
      };
    }

    if (neighbor.marker === "after-intermission") {
      return {
        placement_type: "after_intermission",
        mc_anchor_song_id: null,
        linked_performer: null,
      };
    }

    if (neighbor.marker === "closing") {
      return {
        placement_type: "closing",
        mc_anchor_song_id: null,
        linked_performer: null,
      };
    }

    return {
      placement_type: null,
      mc_anchor_song_id: null,
      linked_performer: null,
    };
  }

  return {
    placement_type: neighbor.sponsor.placement_type,
    mc_anchor_song_id: neighbor.sponsor.mc_anchor_song_id ?? null,
    linked_performer: neighbor.sponsor.linked_performer ?? null,
  };
}

function mapShowToDetailsFormState(show: ShowRecord): ShowDetailsFormState {
  return {
    venue: show.venue ?? "",
    venueAddress: show.venue_address ?? "",
    directionsUrl: show.directions_url ?? "",
    callTime: show.call_time ?? "",
    soundcheckTime: show.soundcheck_time ?? "",
    guestArrivalTime: show.guest_arrival_time ?? "",
    bandArrivalTime: show.band_arrival_time ?? "",
    showStartTime: show.show_start_time ?? "",
    contactName: show.contact_name ?? "",
    contactPhone: show.contact_phone ?? "",
    parkingNotes: show.parking_notes ?? "",
    loadInNotes: show.load_in_notes ?? "",
    announcements: show.announcements ?? "",
    guestMessage: show.guest_message ?? "",
    promoShort: show.promo_short ?? "",
    promoLong: show.promo_long ?? "",
    ticketLink: show.ticket_link ?? "",
  };
}

function ShowInfoCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ShowInfoItem[];
}) {
  const visibleItems = items.filter((item) => item.value.trim());

  return (
    <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-stone-600">{subtitle}</p>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
          No itinerary details have been added yet.
        </div>
      ) : (
        <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 sm:p-5">
          {visibleItems.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className={
                item.label === "Parking Notes" ||
                item.label === "Load-In Notes" ||
                item.label === "Announcements"
                  ? "sm:col-span-2"
                  : undefined
              }
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                {item.label}
              </p>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block break-words text-sm font-medium text-emerald-700 underline"
                >
                  {item.value}
                </a>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{item.value}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionLoadWarning({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      This section could not load right now. Other show details are still available.
    </div>
  );
}

type ShowPageProps = {
  showSlug?: string;
  initialRole?: ViewMode;
  initialAdminTab?: string | null;
  showRoleToggle?: boolean;
};

function getPortalLabel(role: ViewMode) {
  if (role === "admin") {
    return "Admin Portal";
  }

  if (role === "band") {
    return "Band Portal";
  }

  return "Guest Portal";
}

export function ShowPage({
  showSlug = "cmms-april-27",
  initialRole = "guest",
  initialAdminTab = null,
  showRoleToggle = true,
}: ShowPageProps) {
  const requestedAdminTab = normalizeAdminTab(initialAdminTab);
  const [viewMode, setViewMode] = useState<ViewMode>(initialRole);
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>(
    requestedAdminTab ?? "setlist",
  );
  const [activeBandTab, setActiveBandTab] = useState<BandTab>("setlist");
  const [activeGuestTab, setActiveGuestTab] = useState<GuestTab>("songs");
  const [activeSponsorAdminTab, setActiveSponsorAdminTab] = useState<SponsorAdminTab>("library");
  const [printMode, setPrintMode] = useState<PrintMode>("standard");
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [setlist, setSetlist] = useState<SetlistSong[]>([]);
  const [formState, setFormState] = useState<SongFormState>(initialFormState);
  const [showDetailsFormState, setShowDetailsFormState] = useState<ShowDetailsFormState>(
    initialShowDetailsFormState,
  );
  const [guestProfileFormState, setGuestProfileFormState] = useState<GuestProfileFormState>(
    initialGuestProfileFormState,
  );
  const [guestPhotoFile, setGuestPhotoFile] = useState<File | null>(null);
  const [editingGuestProfileId, setEditingGuestProfileId] = useState<string | null>(null);
  const [selectedGuestProfileId, setSelectedGuestProfileId] = useState<string>("");
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [mcBlockNotes, setMcBlockNotes] = useState<McBlockNote[]>([]);
  const [pendingSongs, setPendingSongs] = useState<PendingSubmission[]>([]);
  const [songLibrary, setSongLibrary] = useState<SongLibrarySong[]>([]);
  const [libraryTempoFilter, setLibraryTempoFilter] = useState<"" | SongTempo>("");
  const [librarySongTypeFilter, setLibrarySongTypeFilter] = useState<"" | SongType>("");
  const [sponsorLibrary, setSponsorLibrary] = useState<SponsorLibraryEntry[]>([]);
  const [showSponsors, setShowSponsors] = useState<ShowSponsor[]>([]);
  const [promoMaterials, setPromoMaterials] = useState<PromoMaterial[]>([]);
  const [promoMaterialFormState, setPromoMaterialFormState] = useState<PromoMaterialFormState>(
    initialPromoMaterialFormState,
  );
  const [promoMaterialFile, setPromoMaterialFile] = useState<File | null>(null);
  const [editingPromoMaterialId, setEditingPromoMaterialId] = useState<string | null>(null);
  const [promoMaterialEditFormState, setPromoMaterialEditFormState] =
    useState<PromoMaterialFormState>(initialPromoMaterialFormState);
  const [editingPromoMaterialFile, setEditingPromoMaterialFile] = useState<File | null>(null);
  const [editingPoolSongId, setEditingPoolSongId] = useState<string | null>(null);
  const [editingSetlistSongId, setEditingSetlistSongId] = useState<string | null>(null);
  const [editingLibrarySongId, setEditingLibrarySongId] = useState<string | null>(null);
  const [openLibraryLyricsSongId, setOpenLibraryLyricsSongId] = useState<string | null>(null);
  const [isBandSongFormOpen, setIsBandSongFormOpen] = useState(false);
  const [isGuestSongFormOpen, setIsGuestSongFormOpen] = useState(false);
  const [editingSponsorLibraryId, setEditingSponsorLibraryId] = useState<string | null>(null);
  const [editingShowSponsorId, setEditingShowSponsorId] = useState<string | null>(null);
  const [poolSongEditFormState, setPoolSongEditFormState] = useState<SongEditFormState>({
    title: "",
    key: "",
    tempo: "",
    songType: "",
    notes: "",
    lyrics: "",
  });
  const [setlistSongEditFormState, setSetlistSongEditFormState] = useState<SetlistSongEditFormState>({
    customTitle: "",
  });
  const [librarySongEditFormState, setLibrarySongEditFormState] = useState<SongEditFormState>({
    title: "",
    key: "",
    tempo: "",
    songType: "",
    notes: "",
    lyrics: "",
  });
  const [sponsorLibraryFormState, setSponsorLibraryFormState] = useState<SponsorLibraryFormState>(
    initialSponsorLibraryFormState,
  );
  const [newSponsorLibraryFormState, setNewSponsorLibraryFormState] =
    useState<SponsorLibraryFormState>(initialSponsorLibraryFormState);
  const [newSponsorLogoFile, setNewSponsorLogoFile] = useState<File | null>(null);
  const [editingSponsorLogoFile, setEditingSponsorLogoFile] = useState<File | null>(null);
  const [showSponsorAssignmentFormState, setShowSponsorAssignmentFormState] =
    useState<ShowSponsorAssignmentFormState>(initialShowSponsorAssignmentFormState);
  const [editingShowSponsorFormState, setEditingShowSponsorFormState] =
    useState<ShowSponsorAssignmentFormState>(initialShowSponsorAssignmentFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataSectionErrors, setDataSectionErrors] = useState<DataSectionErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingShowDetails, setIsSavingShowDetails] = useState(false);
  const [isSavingGuestProfile, setIsSavingGuestProfile] = useState(false);
  const [showDetailsMessage, setShowDetailsMessage] = useState<string | null>(null);
  const [showDetailsError, setShowDetailsError] = useState<string | null>(null);
  const [mcStatusMessage, setMcStatusMessage] = useState<string | null>(null);
  const [mcErrorMessage, setMcErrorMessage] = useState<string | null>(null);
  const [mcScriptFormState, setMcScriptFormState] = useState<ScriptFormState>(
    buildScriptFormState(null),
  );
  const [mcBlockNoteDrafts, setMcBlockNoteDrafts] = useState<Record<string, BlockNoteFormState>>(
    {},
  );
  const [isSavingMcScripts, setIsSavingMcScripts] = useState(false);
  const [activeMcBlockActionId, setActiveMcBlockActionId] = useState<string | null>(null);
  const [activePendingActionId, setActivePendingActionId] = useState<string | null>(null);
  const [activeSetlistActionId, setActiveSetlistActionId] = useState<string | null>(null);
  const [activeSponsorActionId, setActiveSponsorActionId] = useState<string | null>(null);
  const [activePromoMaterialActionId, setActivePromoMaterialActionId] = useState<string | null>(null);
  const [isSavingPromoMaterial, setIsSavingPromoMaterial] = useState(false);
  const [promoMaterialMessage, setPromoMaterialMessage] = useState<string | null>(null);
  const [promoMaterialError, setPromoMaterialError] = useState<string | null>(null);
  const [copiedPromoTextKey, setCopiedPromoTextKey] = useState<string | null>(null);

  const formHeading =
    viewMode === "guest" ? "Submit Your Song Choice" : "Suggest a Song for the Show";
  const portalLabel = getPortalLabel(viewMode);
  const shouldShowPortalLogo = viewMode === "guest" || viewMode === "band";
  const isAdminView = viewMode === "admin";
  const isBandView = viewMode === "band";
  const isGuestView = viewMode === "guest";
  const shouldShowAdminSongSubmission =
    isAdminView && activeAdminTab === "songs";
  const shouldShowBandSongTools = isBandView && activeBandTab === "songs";
  const shouldShowGuestSongsTab = isGuestView && activeGuestTab === "songs";
  const shouldShowGuestArtistInfoTab = isGuestView && activeGuestTab === "artist-info";
  const shouldShowGuestItineraryTab = isGuestView && activeGuestTab === "itinerary";
  const shouldShowGuestPromoMaterialsTab = isGuestView && activeGuestTab === "promo-materials";
  const shouldShowBandPromoMaterialsTab = isBandView && activeBandTab === "promo-materials";
  const shouldShowSongSubmissionForm = shouldShowAdminSongSubmission;
  const visiblePromoMaterials = promoMaterials.filter((material) => material.is_visible);
  const generatedPromoPost = [
    show?.name ?? "",
    [formatShowDate(show?.show_date ?? null), show?.show_start_time ?? ""]
      .filter((part) => part.trim())
      .join(" • "),
    showDetailsFormState.promoShort,
    showDetailsFormState.ticketLink
      ? `Tickets:\n${showDetailsFormState.ticketLink}`
      : "",
  ]
    .filter((part) => part.trim())
    .join("\n\n");
  const shouldShowSetlistSection = viewMode === "guest"
    ? false
    : isAdminView
    ? activeAdminTab === "setlist"
    : !isBandView || activeBandTab === "setlist";
  const setlistSections = getRenderableSetlistSections(setlist);
  const visibleGuestSongs = viewMode === "guest" ? [] : pendingSongs;
  const filteredSongLibrary = songLibrary.filter((song) => {
    const matchesTempo = !libraryTempoFilter || song.tempo === libraryTempoFilter;
    const matchesSongType = !librarySongTypeFilter || song.song_type === librarySongTypeFilter;
    return matchesTempo && matchesSongType;
  });

  function canEditPoolSong() {
    if (viewMode === "admin") {
      return true;
    }

    if (viewMode === "guest") {
      return true;
    }

    return false;
  }

  function canEditSetlistSong() {
    if (viewMode === "admin") {
      return true;
    }

    return false;
  }

  function canEditLibrarySong(song: SongLibrarySong) {
    if (viewMode === "admin") {
      return true;
    }

    return viewMode === "band" && canBandEditSharedSong(song.created_by_role);
  }

  function handlePrint(nextPrintMode: PrintMode) {
    setPrintMode(nextPrintMode);

    window.setTimeout(() => {
      window.print();
    }, 50);
  }

  const loadShowData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) {
        setIsLoading(true);
      }

      setErrorMessage(null);
      setDataSectionErrors({});

      try {
        const supabase = createClient();

        const { data: showRecord, error: showError } = await supabase
          .from("shows")
          .select("*")
          .eq("slug", showSlug)
          .maybeSingle();

        if (showError) {
          throw showError;
        }

        if (!showRecord) {
          setShow(null);
          setSetlist([]);
          setPendingSongs([]);
          setSongLibrary([]);
          setSponsorLibrary([]);
          setShowSponsors([]);
          setPromoMaterials([]);
          setGuestProfiles([]);
          setMcBlockNotes([]);
          setErrorMessage("Show not found");
          return;
        }

        setShow(showRecord);

        const sectionErrors: DataSectionErrors = {};
        const loadSection = async <T,>(
          sectionKey: DataSectionKey,
          sectionName: string,
          query: PromiseLike<{ data: T | null; error: unknown }>,
          fallback: T,
        ) => {
          try {
            const result = await query;

            if (result.error) {
              sectionErrors[sectionKey] = getErrorMessage(result.error);
              logDataSectionError(sectionName, result.error);
              return fallback;
            }

            return result.data ?? fallback;
          } catch (error) {
            sectionErrors[sectionKey] = getErrorMessage(error);
            logDataSectionError(sectionName, error);
            return fallback;
          }
        };

        const [
          setlistRows,
          pendingRows,
          libraryRows,
          sponsorLibraryRows,
          showSponsorRows,
          promoMaterialRows,
          guestProfileRows,
          mcBlockNoteRows,
        ] = await Promise.all([
          loadSection(
            "setlist",
            "setlist entries",
            supabase
              .from("setlist_entries")
              .select(`
                id,
                show_id,
                section,
                position,
                source_type,
                song_id,
                guest_song_id,
                custom_title,
                created_at,
                library_song:song_id (
                  id,
                  title,
                  key,
                  tempo,
                  song_type,
                  notes,
                  lyrics,
                  created_by_role,
                  created_by_name,
                  created_at
                ),
                guest_song:guest_song_id (
                  id,
                  show_id,
                  title,
                  key,
                  tempo,
                  song_type,
                  submitted_by_name,
                  created_at
                )
              `)
              .eq("show_id", showRecord.id)
              .order("section", { ascending: true })
              .order("position", { ascending: true }),
            [],
          ),
          loadSection(
            "guestSongs",
            "guest songs",
            supabase
              .from("show_guest_songs")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: true }),
            [],
          ),
          loadSection(
            "songLibrary",
            "song library",
            supabase
              .from("songs")
              .select("*")
              .order("title", { ascending: true }),
            [],
          ),
          loadSection(
            "sponsorLibrary",
            "sponsor library",
            supabase
              .from("sponsor_library")
              .select("*")
              .order("name", { ascending: true }),
            [],
          ),
          loadSection(
            "showSponsors",
            "show sponsors",
            supabase
              .from("show_sponsors")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("placement_order", { ascending: true })
              .order("created_at", { ascending: true }),
            [],
          ),
          loadSection(
            "promoMaterials",
            "promo materials",
            supabase
              .from("promo_materials")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: false }),
            [],
          ),
          loadSection(
            "guestProfiles",
            "guest profiles",
            supabase
              .from("guest_profiles")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: true }),
            [],
          ),
          loadSection(
            "mcBlockNotes",
            "MC block notes",
            supabase
              .from("mc_block_notes")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: true }),
            [],
          ),
        ]);

        setSetlist(
          sortSetlistSongs(
            (setlistRows ?? []).map((song: SetlistEntryQueryRow) =>
              normalizeSetlistSong(song),
            ),
          ),
        );
        setPendingSongs(
          (pendingRows ?? []).map((submission: PendingSubmission) =>
            normalizePendingSubmission(submission),
          ),
        );
        setSongLibrary(
          (libraryRows ?? []).map((song: SongLibrarySong) => normalizeSongLibrarySong(song)),
        );
        const normalizedSponsorLibrary = (sponsorLibraryRows ?? []).map(
          (sponsor: SponsorLibraryEntry) => normalizeSponsorLibraryEntry(sponsor),
        );
        setSponsorLibrary(normalizedSponsorLibrary);
        setShowSponsors(
          mergeShowSponsorsWithLibrary((showSponsorRows ?? []) as ShowSponsor[], normalizedSponsorLibrary),
        );
        setPromoMaterials((promoMaterialRows ?? []) as PromoMaterial[]);
        setGuestProfiles(guestProfileRows ?? []);
        setMcBlockNotes((mcBlockNoteRows ?? []) as McBlockNote[]);
        setDataSectionErrors(sectionErrors);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (showSpinner) {
          setIsLoading(false);
        }
      }
    },
    [showSlug],
  );

  useEffect(() => {
    void loadShowData();
  }, [loadShowData]);

  useEffect(() => {
    if (!show) {
      return;
    }

    setShowDetailsFormState(mapShowToDetailsFormState(show));
    setMcScriptFormState(buildScriptFormState(show));
  }, [show]);

  useEffect(() => {
    if (viewMode === "admin") {
      setActiveAdminTab(requestedAdminTab ?? "setlist");
    }

    if (viewMode === "band") {
      setActiveBandTab("setlist");
    }

    if (viewMode === "guest") {
      setActiveGuestTab("songs");
    }
  }, [requestedAdminTab, viewMode]);

  useEffect(() => {
    if (!shouldShowBandSongTools) {
      setIsBandSongFormOpen(false);
    }
  }, [shouldShowBandSongTools]);

  useEffect(() => {
    if (!shouldShowGuestSongsTab) {
      setIsGuestSongFormOpen(false);
    }
  }, [shouldShowGuestSongsTab]);

  const mcRunSections = useMemo(
    () => buildMcRunSections(setlist, guestProfiles, mcBlockNotes),
    [guestProfiles, mcBlockNotes, setlist],
  );
  const mcRunSheetData = useMemo(
    () => buildMcRunSheetData(mcRunSections, showSponsors),
    [mcRunSections, showSponsors],
  );
  const adminMcFlowItems = useMemo(
    () => buildAdminMcFlowItems(mcRunSections, mcRunSheetData),
    [mcRunSections, mcRunSheetData],
  );

  useEffect(() => {
    setMcBlockNoteDrafts(buildBlockNoteDrafts(mcRunSections, mcBlockNotes));
  }, [mcBlockNotes, mcRunSections]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleShowDetailsChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;

    setShowDetailsFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  async function handleCopyPromoText(text: string, copyKey: string) {
    if (!text.trim()) {
      setShowDetailsError("There is no promo text to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setShowDetailsError(null);
      setCopiedPromoTextKey(copyKey);

      window.setTimeout(() => {
        setCopiedPromoTextKey((currentKey) => (currentKey === copyKey ? null : currentKey));
      }, 1800);
    } catch (error) {
      setShowDetailsError(getErrorMessage(error));
    }
  }

  function handleGuestProfileChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, type, value } = event.target;
    const checked = "checked" in event.target ? event.target.checked : false;

    setGuestProfileFormState((currentState) => ({
      ...currentState,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleGuestPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setGuestPhotoFile(nextFile);
  }

  function handleSelectedGuestProfileChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextProfileId = event.target.value;
    const selectedProfile = guestProfiles.find((profile) => profile.id === nextProfileId);

    setSelectedGuestProfileId(nextProfileId);
    setEditingGuestProfileId(selectedProfile?.id ?? null);

    if (selectedProfile) {
      setGuestProfileFormState(buildGuestProfileFormStateFromProfile(selectedProfile));
      setGuestPhotoFile(null);
    }
  }

  function startEditingGuestProfile(profileId: string) {
    const profileToEdit = guestProfiles.find((profile) => profile.id === profileId);

    if (!profileToEdit) {
      return;
    }

    setEditingGuestProfileId(profileId);
    setSelectedGuestProfileId(profileId);
    setGuestPhotoFile(null);
    setGuestProfileFormState(buildGuestProfileFormStateFromProfile(profileToEdit));
  }

  function resetGuestProfileForm() {
    setEditingGuestProfileId(null);
    setGuestPhotoFile(null);
    setGuestProfileFormState(initialGuestProfileFormState);
  }

  function handleSponsorLibraryChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    mode: "new" | "edit",
  ) {
    const { name, value } = event.target;
    const setState = mode === "edit" ? setSponsorLibraryFormState : setNewSponsorLibraryFormState;

    setState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleSponsorLogoFileChange(
    event: ChangeEvent<HTMLInputElement>,
    mode: "new" | "edit",
  ) {
    const file = event.target.files?.[0] ?? null;

    if (mode === "edit") {
      setEditingSponsorLogoFile(file);
      return;
    }

    setNewSponsorLogoFile(file);
  }

  function handleShowSponsorAssignmentChange(
    event: ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>,
    mode: "new" | "edit",
  ) {
    const { name, value } = event.target;
    const setState =
      mode === "edit" ? setEditingShowSponsorFormState : setShowSponsorAssignmentFormState;

    setState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function startEditingSponsorLibraryEntry(sponsorId: string) {
    const sponsorToEdit = sponsorLibrary.find((sponsor) => sponsor.id === sponsorId);

    if (!sponsorToEdit) {
      return;
    }

    setEditingSponsorLibraryId(sponsorId);
    setSponsorLibraryFormState(buildSponsorLibraryFormState(sponsorToEdit));
    setEditingSponsorLogoFile(null);
  }

  function cancelEditingSponsorLibraryEntry() {
    setEditingSponsorLibraryId(null);
    setSponsorLibraryFormState(initialSponsorLibraryFormState);
    setEditingSponsorLogoFile(null);
  }

  async function handleCreateSponsorLibraryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newSponsorLibraryFormState.name.trim();

    if (!name) {
      setActionError("Sponsor name is required.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId("new-library");

    try {
      const supabase = createClient();
      const logoUrl = newSponsorLogoFile
        ? await uploadSponsorLogoFile(newSponsorLogoFile, name)
        : null;

      const { data, error } = await supabase
        .from("sponsor_library")
        .insert({
          name,
          short_message: normalizeOptionalField(newSponsorLibraryFormState.shortMessage),
          full_message: normalizeOptionalField(newSponsorLibraryFormState.fullMessage),
          website: normalizeOptionalField(newSponsorLibraryFormState.website),
          logo_url: logoUrl,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setSponsorLibrary((currentSponsors) =>
        [...currentSponsors, normalizeSponsorLibraryEntry(data)].sort((sponsorA, sponsorB) =>
          sponsorA.name.localeCompare(sponsorB.name),
        ),
      );
      setNewSponsorLibraryFormState(initialSponsorLibraryFormState);
      setNewSponsorLogoFile(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleSaveSponsorLibraryEntry(sponsorId: string) {
    const name = sponsorLibraryFormState.name.trim();

    if (!name) {
      setActionError("Sponsor name is required.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`library-${sponsorId}`);

    try {
      const supabase = createClient();
      const logoUrl = editingSponsorLogoFile
        ? await uploadSponsorLogoFile(editingSponsorLogoFile, name)
        : normalizeOptionalField(sponsorLibraryFormState.logoUrl);

      const { data, error } = await supabase
        .from("sponsor_library")
        .update({
          name,
          short_message: normalizeOptionalField(sponsorLibraryFormState.shortMessage),
          full_message: normalizeOptionalField(sponsorLibraryFormState.fullMessage),
          website: normalizeOptionalField(sponsorLibraryFormState.website),
          logo_url: logoUrl,
        })
        .eq("id", sponsorId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const normalizedSponsor = normalizeSponsorLibraryEntry(data);

      setSponsorLibrary((currentSponsors) =>
        currentSponsors
          .map((sponsor) => (sponsor.id === sponsorId ? normalizedSponsor : sponsor))
          .sort((sponsorA, sponsorB) => sponsorA.name.localeCompare(sponsorB.name)),
      );
      setShowSponsors((currentSponsors) =>
        currentSponsors.map((sponsor) =>
          sponsor.sponsor_id === sponsorId
            ? { ...sponsor, sponsor: normalizedSponsor }
            : sponsor,
        ),
      );
      cancelEditingSponsorLibraryEntry();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleAssignSponsorToShow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const sponsorId = showSponsorAssignmentFormState.sponsorId;
    const sponsorRecord = sponsorLibrary.find((sponsor) => sponsor.id === sponsorId);

    if (!sponsorRecord) {
      setActionError("Choose a sponsor from the library first.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId("assign-show");

    try {
      const supabase = createClient();
      const placementOrder = Number(getNextSponsorPlacementOrder(showSponsors));

      if (!Number.isInteger(placementOrder) || placementOrder < 1) {
        throw new Error("Could not determine a valid sponsor placement order.");
      }

      const payload = {
        show_id: show.id,
        sponsor_id: sponsorId,
        placement_order: placementOrder,
        placement_type: normalizeOptionalField(showSponsorAssignmentFormState.placementType),
        mc_anchor_song_id: null,
        linked_performer: normalizeOptionalField(showSponsorAssignmentFormState.linkedPerformer),
        custom_note: normalizeOptionalField(showSponsorAssignmentFormState.customNote),
      };

      const { data, error } = await supabase
        .from("show_sponsors")
        .insert(payload)
        .select("id, show_id, sponsor_id, placement_order, placement_type, mc_anchor_song_id, linked_performer, custom_note, created_at")
        .single();

      if (error) {
        throw error;
      }

      setShowSponsors((currentSponsors) => [
        ...currentSponsors,
        attachSponsorToShowAssignment(data as ShowSponsor, sponsorLibrary),
      ]);
      setShowSponsorAssignmentFormState(initialShowSponsorAssignmentFormState);
    } catch (error) {
      console.error("Failed to insert show sponsor", error);
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  function startEditingShowSponsor(sponsorId: string) {
    const sponsorToEdit = showSponsors.find((sponsor) => sponsor.id === sponsorId);

    if (!sponsorToEdit) {
      return;
    }

    setEditingShowSponsorId(sponsorId);
    setEditingShowSponsorFormState(buildShowSponsorAssignmentFormState(sponsorToEdit));
  }

  function cancelEditingShowSponsor() {
    setEditingShowSponsorId(null);
    setEditingShowSponsorFormState(initialShowSponsorAssignmentFormState);
  }

  async function handleSaveShowSponsor(sponsorId: string) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`show-${sponsorId}`);

    try {
      const supabase = createClient();
      const payload = {
        placement_type: normalizeOptionalField(editingShowSponsorFormState.placementType),
        mc_anchor_song_id: null,
        linked_performer: normalizeOptionalField(editingShowSponsorFormState.linkedPerformer),
        custom_note: normalizeOptionalField(editingShowSponsorFormState.customNote),
      };

      const { data, error } = await supabase
        .from("show_sponsors")
        .update(payload)
        .eq("id", sponsorId)
        .eq("show_id", show.id)
        .select("id, show_id, sponsor_id, placement_order, placement_type, mc_anchor_song_id, linked_performer, custom_note, created_at")
        .single();

      if (error) {
        throw error;
      }

      setShowSponsors((currentSponsors) =>
        currentSponsors.map((sponsor) =>
          sponsor.id === sponsorId
            ? attachSponsorToShowAssignment(data as ShowSponsor, sponsorLibrary)
            : sponsor,
        ),
      );
      cancelEditingShowSponsor();
    } catch (error) {
      console.error("Failed to update show sponsor", error);
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleMoveShowSponsor(sponsorId: string, direction: "up" | "down") {
    const sponsorToMove = showSponsors.find((sponsor) => sponsor.id === sponsorId);

    if (!sponsorToMove) {
      return;
    }

    const sponsorIndex = showSponsors.findIndex((sponsor) => sponsor.id === sponsorId);
    const targetIndex = direction === "up" ? sponsorIndex - 1 : sponsorIndex + 1;

    if (targetIndex < 0 || targetIndex >= showSponsors.length) {
      return;
    }

    const targetSponsor = showSponsors[targetIndex];

    if (!targetSponsor) {
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`show-${sponsorId}`);

    try {
      const supabase = createClient();
      const { error: firstError } = await supabase
        .from("show_sponsors")
        .update({ placement_order: targetSponsor.placement_order })
        .eq("id", sponsorId);

      if (firstError) {
        throw firstError;
      }

      const { error: secondError } = await supabase
        .from("show_sponsors")
        .update({ placement_order: sponsorToMove.placement_order })
        .eq("id", targetSponsor.id);

      if (secondError) {
        throw secondError;
      }

      setShowSponsors((currentSponsors) =>
        [...currentSponsors]
          .map((sponsor) => {
            if (sponsor.id === sponsorId) {
              return { ...sponsor, placement_order: targetSponsor.placement_order };
            }

            if (sponsor.id === targetSponsor.id) {
              return { ...sponsor, placement_order: sponsorToMove.placement_order };
            }

            return sponsor;
          })
          .sort((sponsorA, sponsorB) => sponsorA.placement_order - sponsorB.placement_order),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleRemoveShowSponsor(sponsorId: string) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`show-${sponsorId}`);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("show_sponsors")
        .delete()
        .eq("id", sponsorId)
        .eq("show_id", show.id);

      if (error) {
        throw error;
      }

      setShowSponsors((currentSponsors) =>
        currentSponsors.filter((sponsor) => sponsor.id !== sponsorId),
      );

      if (editingShowSponsorId === sponsorId) {
        cancelEditingShowSponsor();
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  function handlePromoMaterialChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    mode: "new" | "edit",
  ) {
    const { name, value } = event.target;
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
    const setState = mode === "edit" ? setPromoMaterialEditFormState : setPromoMaterialFormState;

    setState((currentState) => ({
      ...currentState,
      [name]: name === "isVisible" ? checked : value,
    }));
  }

  function handlePromoMaterialFileChange(
    event: ChangeEvent<HTMLInputElement>,
    mode: "new" | "edit",
  ) {
    const file = event.target.files?.[0] ?? null;

    if (mode === "edit") {
      setEditingPromoMaterialFile(file);
      return;
    }

    setPromoMaterialFile(file);
  }

  async function handleCreatePromoMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setPromoMaterialError("The show is not loaded yet.");
      return;
    }

    const title = promoMaterialFormState.title.trim();

    if (!title) {
      setPromoMaterialError("Promo material title is required.");
      return;
    }

    if (!promoMaterialFile) {
      setPromoMaterialError("Choose a file to upload.");
      return;
    }

    setIsSavingPromoMaterial(true);
    setPromoMaterialError(null);
    setPromoMaterialMessage(null);

    try {
      const supabase = createClient();
      const uploadedFile = await uploadPromoMaterialFile({
        file: promoMaterialFile,
        showId: show.id,
        title,
      });

      const { data, error } = await supabase
        .from("promo_materials")
        .insert({
          show_id: show.id,
          title,
          description: normalizeOptionalField(promoMaterialFormState.description),
          category: promoMaterialFormState.category || "other",
          is_visible: promoMaterialFormState.isVisible,
          ...uploadedFile,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setPromoMaterials((currentMaterials) => [data as PromoMaterial, ...currentMaterials]);
      setPromoMaterialFormState(initialPromoMaterialFormState);
      setPromoMaterialFile(null);
      setPromoMaterialMessage("Promo material uploaded.");
    } catch (error) {
      setPromoMaterialError(getErrorMessage(error));
    } finally {
      setIsSavingPromoMaterial(false);
    }
  }

  function startEditingPromoMaterial(material: PromoMaterial) {
    setEditingPromoMaterialId(material.id);
    setPromoMaterialEditFormState(buildPromoMaterialFormState(material));
    setEditingPromoMaterialFile(null);
    setPromoMaterialError(null);
    setPromoMaterialMessage(null);
  }

  function cancelEditingPromoMaterial() {
    setEditingPromoMaterialId(null);
    setPromoMaterialEditFormState(initialPromoMaterialFormState);
    setEditingPromoMaterialFile(null);
  }

  async function handleSavePromoMaterial(material: PromoMaterial) {
    const title = promoMaterialEditFormState.title.trim();

    if (!title) {
      setPromoMaterialError("Promo material title is required.");
      return;
    }

    setActivePromoMaterialActionId(material.id);
    setPromoMaterialError(null);
    setPromoMaterialMessage(null);

    try {
      const supabase = createClient();
      const uploadedFile = editingPromoMaterialFile
        ? await uploadPromoMaterialFile({
            file: editingPromoMaterialFile,
            showId: material.show_id,
            title,
          })
        : null;

      const { data, error } = await supabase
        .from("promo_materials")
        .update({
          title,
          description: normalizeOptionalField(promoMaterialEditFormState.description),
          category: promoMaterialEditFormState.category || "other",
          is_visible: promoMaterialEditFormState.isVisible,
          updated_at: new Date().toISOString(),
          ...(uploadedFile ?? {}),
        })
        .eq("id", material.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      if (uploadedFile) {
        await supabase.storage.from("promo-materials").remove([material.file_path]);
      }

      setPromoMaterials((currentMaterials) =>
        currentMaterials.map((currentMaterial) =>
          currentMaterial.id === material.id ? (data as PromoMaterial) : currentMaterial,
        ),
      );
      cancelEditingPromoMaterial();
      setPromoMaterialMessage("Promo material saved.");
    } catch (error) {
      setPromoMaterialError(getErrorMessage(error));
    } finally {
      setActivePromoMaterialActionId(null);
    }
  }

  async function handleDeletePromoMaterial(material: PromoMaterial) {
    const shouldDelete = window.confirm(`Delete promo material "${material.title}"?`);

    if (!shouldDelete) {
      return;
    }

    setActivePromoMaterialActionId(material.id);
    setPromoMaterialError(null);
    setPromoMaterialMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("promo_materials")
        .delete()
        .eq("id", material.id);

      if (error) {
        throw error;
      }

      await supabase.storage.from("promo-materials").remove([material.file_path]);
      setPromoMaterials((currentMaterials) =>
        currentMaterials.filter((currentMaterial) => currentMaterial.id !== material.id),
      );

      if (editingPromoMaterialId === material.id) {
        cancelEditingPromoMaterial();
      }

      setPromoMaterialMessage("Promo material deleted.");
    } catch (error) {
      setPromoMaterialError(getErrorMessage(error));
    } finally {
      setActivePromoMaterialActionId(null);
    }
  }

  async function handleShowDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setShowDetailsError("The show is not loaded yet.");
      return;
    }

    setShowDetailsMessage(null);
    setShowDetailsError(null);
    setIsSavingShowDetails(true);

    try {
      const supabase = createClient();
      const payload = {
        venue: normalizeOptionalField(showDetailsFormState.venue),
        venue_address: normalizeOptionalField(showDetailsFormState.venueAddress),
        directions_url: normalizeOptionalField(showDetailsFormState.directionsUrl),
        call_time: normalizeOptionalField(showDetailsFormState.callTime),
        soundcheck_time: normalizeOptionalField(showDetailsFormState.soundcheckTime),
        guest_arrival_time: normalizeOptionalField(showDetailsFormState.guestArrivalTime),
        band_arrival_time: normalizeOptionalField(showDetailsFormState.bandArrivalTime),
        show_start_time: normalizeOptionalField(showDetailsFormState.showStartTime),
        contact_name: normalizeOptionalField(showDetailsFormState.contactName),
        contact_phone: normalizeOptionalField(showDetailsFormState.contactPhone),
        parking_notes: normalizeOptionalField(showDetailsFormState.parkingNotes),
        load_in_notes: normalizeOptionalField(showDetailsFormState.loadInNotes),
        announcements: normalizeOptionalField(showDetailsFormState.announcements),
        guest_message: normalizeOptionalField(showDetailsFormState.guestMessage),
        promo_short: normalizeOptionalField(showDetailsFormState.promoShort),
        promo_long: normalizeOptionalField(showDetailsFormState.promoLong),
        ticket_link: normalizeOptionalField(showDetailsFormState.ticketLink),
      };

      const { data, error } = await supabase
        .from("shows")
        .update(payload)
        .eq("id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShow(data);
      setShowDetailsMessage("Show details saved.");
    } catch (error) {
      setShowDetailsError(getErrorMessage(error));
    } finally {
      setIsSavingShowDetails(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const title = formState.title.trim();
    const key = normalizeOptionalField(formState.key);
    const tempo = formState.tempo || null;
    const songType = formState.songType || null;

    if (!title) {
      return;
    }

    if (viewMode === "guest" && guestProfiles.length === 0) {
      setActionError("Please complete guest info first before submitting songs.");
      return;
    }

    if (viewMode === "guest" && requiresGuestSelection) {
      setActionError("Choose the correct guest before submitting a song.");
      return;
    }

    if (viewMode === "guest" && !guestSingerName) {
      setActionError("Choose the correct guest before submitting a song.");
      return;
    }

    setActionError(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const normalizedSubmittedByRole = normalizeSubmittedByRole(viewMode);

      if (normalizedSubmittedByRole === "guest") {
        const { data, error } = await supabase
          .from("show_guest_songs")
          .insert({
            show_id: show.id,
            title,
            key,
            tempo,
            song_type: songType,
            submitted_by_name: guestSingerName || null,
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        setPendingSongs((currentSongs) => [...currentSongs, normalizePendingSubmission(data)]);

        const adminUrl = buildAdminShowUrl(show.slug);
        void sendAdminNotification({
          subject: `Guest Song Submission - ${show.name} - ${guestSingerName || "Guest"}`,
          html: buildNotificationHtml({
            heading: "Guest Song Submission",
            intro: "A guest submitted a new song for this show.",
            rows: [
              { label: "Show Name", value: show.name },
              { label: "Who's Singing", value: guestSingerName || "Guest" },
              { label: "Song Title", value: data.title },
              { label: "Key", value: data.key },
              { label: "Tempo", value: data.tempo },
              { label: "Song Type", value: data.song_type },
              { label: "Notes", value: data.notes },
            ],
            adminUrl,
          }),
        });
      } else {
        const normalizedTitle = title.toLowerCase();
        const normalizedKey = (key ?? "").toLowerCase();
        const existingLibrarySong = songLibrary.find(
          (song) =>
            song.title.trim().toLowerCase() === normalizedTitle &&
            (song.key ?? "").trim().toLowerCase() === normalizedKey,
        );

        if (!existingLibrarySong) {
          const { data, error } = await supabase
            .from("songs")
            .insert({
              title,
              key,
              tempo,
              song_type: songType,
              notes: normalizeOptionalField(formState.notes),
              lyrics: normalizeOptionalField(formState.lyrics),
              created_by_role: normalizedSubmittedByRole,
              created_by_name: null,
            })
            .select("*")
            .single();

          if (error) {
            throw error;
          }

          setSongLibrary((currentSongs) =>
            [...currentSongs, normalizeSongLibrarySong(data)].sort((songA, songB) =>
              songA.title.localeCompare(songB.title),
            ),
          );
        }

        if (normalizedSubmittedByRole === "band") {
          const adminUrl = buildAdminShowUrl(show.slug);
          void sendAdminNotification({
            subject: `Band Song Submission - ${show.name}`,
            html: buildNotificationHtml({
              heading: "Band Song Submission",
              intro: "A band member submitted a new song to the library.",
              rows: [
                { label: "Show Name", value: show.name },
                { label: "Song Title", value: title },
                { label: "Key", value: key },
                { label: "Tempo", value: tempo },
                { label: "Song Type", value: songType },
                { label: "Notes", value: formState.notes },
              ],
              adminUrl,
            }),
          });
        }
      }

      setFormState(initialFormState);
      if (normalizedSubmittedByRole === "band") {
        setIsBandSongFormOpen(false);
      }
      if (normalizedSubmittedByRole === "guest") {
        setIsGuestSongFormOpen(false);
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGuestProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const normalizedName = guestProfileFormState.name.trim();
    const shortBio = guestProfileFormState.shortBio.trim();

    if (!normalizedName || !shortBio) {
      setActionError("Guest profile name and short bio are required.");
      return;
    }

    setActionError(null);
    setIsSavingGuestProfile(true);

    try {
      const supabase = createClient();
      const existingProfile =
        guestProfiles.find((profile) => profile.id === editingGuestProfileId) ??
        guestProfiles.find(
          (profile) =>
            normalizeGuestProfileName(profile.name ?? "") ===
            normalizeGuestProfileName(normalizedName),
        );

      let photoUrl = existingProfile?.photo_url ?? null;

      if (guestPhotoFile) {
        const fileExt = guestPhotoFile.name.includes(".")
          ? guestPhotoFile.name.split(".").pop()
          : undefined;
        const fileName = `${Date.now()}-${normalizedName
          .replace(/[^a-z0-9]+/gi, "-")
          .toLowerCase()}`;
        const filePath = fileExt
          ? `${show.id}/${fileName}.${fileExt}`
          : `${show.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("guest-photos")
          .upload(filePath, guestPhotoFile, {
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("guest-photos")
          .getPublicUrl(filePath);

        photoUrl = publicUrlData.publicUrl;
      }

      const profilePayload = {
        show_id: show.id,
        name: normalizedName,
        short_bio: shortBio,
        full_bio: guestProfileFormState.fullBio.trim() || null,
        hometown: guestProfileFormState.hometown.trim() || null,
        instruments: guestProfileFormState.instruments.trim() || null,
        facebook: guestProfileFormState.facebook.trim() || null,
        instagram: guestProfileFormState.instagram.trim() || null,
        website: guestProfileFormState.website.trim() || null,
        photo_url: photoUrl,
        permission_granted: guestProfileFormState.permissionGranted,
      };

      if (existingProfile) {
        const { data: updatedProfile, error: updateError } = await supabase
          .from("guest_profiles")
          .update(profilePayload)
          .eq("id", existingProfile.id)
          .select("*")
          .single();

        if (updateError) {
          throw updateError;
        }

        setGuestProfiles((currentProfiles) =>
          currentProfiles.map((profile) =>
            profile.id === updatedProfile.id ? updatedProfile : profile,
          ),
        );
        setEditingGuestProfileId(updatedProfile.id);
        setSelectedGuestProfileId(updatedProfile.id);

        const adminUrl = buildAdminShowUrl(show.slug);
        void sendAdminNotification({
          subject: `Guest Info Updated - ${show.name} - ${updatedProfile.name ?? normalizedName}`,
          html: buildNotificationHtml({
            heading: "Guest Info Updated",
            intro: "A guest updated their artist information for this show.",
            rows: [
              { label: "Show Name", value: show.name },
              { label: "Guest Name", value: updatedProfile.name },
              { label: "Hometown", value: updatedProfile.hometown },
              { label: "Instruments", value: updatedProfile.instruments },
            ],
            adminUrl,
          }),
        });
      } else {
        const { data: insertedProfile, error: insertError } = await supabase
          .from("guest_profiles")
          .insert(profilePayload)
          .select("*")
          .single();

        if (insertError) {
          throw insertError;
        }

        setGuestProfiles((currentProfiles) => [...currentProfiles, insertedProfile]);
        setEditingGuestProfileId(insertedProfile.id);
        setSelectedGuestProfileId(insertedProfile.id);

        const adminUrl = buildAdminShowUrl(show.slug);
        void sendAdminNotification({
          subject: `Guest Info Submitted - ${show.name} - ${insertedProfile.name ?? normalizedName}`,
          html: buildNotificationHtml({
            heading: "Guest Info Submitted",
            intro: "A guest submitted artist information for this show.",
            rows: [
              { label: "Show Name", value: show.name },
              { label: "Guest Name", value: insertedProfile.name },
              { label: "Hometown", value: insertedProfile.hometown },
              { label: "Instruments", value: insertedProfile.instruments },
            ],
            adminUrl,
          }),
        });
      }

      setGuestPhotoFile(null);
      setGuestProfileFormState((currentState) => ({
        ...currentState,
        name: normalizedName,
        shortBio,
      }));
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSavingGuestProfile(false);
    }
  }

  function handleMcScriptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { name, value } = event.target;

    setMcScriptFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  async function handleSaveMcScripts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setMcErrorMessage("The show is not loaded yet.");
      return;
    }

    setMcErrorMessage(null);
    setMcStatusMessage(null);
    setIsSavingMcScripts(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({
          opening_script: normalizeOptionalField(mcScriptFormState.openingScript),
          intermission_script: normalizeOptionalField(mcScriptFormState.intermissionScript),
          closing_script: normalizeOptionalField(mcScriptFormState.closingScript),
        })
        .eq("id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShow(data);
      setMcStatusMessage("MC scripts saved.");
    } catch (error) {
      setMcErrorMessage(getErrorMessage(error));
    } finally {
      setIsSavingMcScripts(false);
    }
  }

  function handleMcBlockDraftChange(
    anchorSongId: string,
    field: keyof BlockNoteFormState,
    value: string,
  ) {
    setMcBlockNoteDrafts((currentDrafts) => ({
      ...currentDrafts,
      [anchorSongId]: {
        ...(currentDrafts[anchorSongId] ?? {
          introNote: "",
          sponsorMention: "",
          transitionNote: "",
        }),
        [field]: value,
      },
    }));
  }

  async function handleSaveMcBlockNote(anchorSongId: string) {
    if (!show) {
      setMcErrorMessage("The show is not loaded yet.");
      return;
    }

    const draft = mcBlockNoteDrafts[anchorSongId];

    if (!draft) {
      return;
    }

    const introNote = normalizeOptionalField(draft.introNote);
    const sponsorMention = normalizeOptionalField(draft.sponsorMention);
    const transitionNote = normalizeOptionalField(draft.transitionNote);
    const existingNote = mcBlockNotes.find((note) => note.anchor_song_id === anchorSongId);

    setMcErrorMessage(null);
    setMcStatusMessage(null);
    setActiveMcBlockActionId(anchorSongId);

    try {
      const supabase = createClient();

      if (!introNote && !sponsorMention && !transitionNote) {
        if (existingNote) {
          const { error } = await supabase
            .from("mc_block_notes")
            .delete()
            .eq("id", existingNote.id)
            .eq("show_id", show.id);

          if (error) {
            throw error;
          }

          setMcBlockNotes((currentNotes) =>
            currentNotes.filter((note) => note.id !== existingNote.id),
          );
          setMcStatusMessage("MC block notes cleared.");
        } else {
          setMcStatusMessage("No MC block notes to save.");
        }

        return;
      }

      const { data, error } = await supabase
        .from("mc_block_notes")
        .upsert(
          {
            show_id: show.id,
            anchor_song_id: anchorSongId,
            intro_note: introNote,
            sponsor_mention: sponsorMention,
            transition_note: transitionNote,
          },
          { onConflict: "show_id,anchor_song_id" },
        )
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setMcBlockNotes((currentNotes) => {
        const existingIndex = currentNotes.findIndex((note) => note.id === data.id);

        if (existingIndex >= 0) {
          return currentNotes.map((note) => (note.id === data.id ? data : note));
        }

        return [...currentNotes, data];
      });
      setMcStatusMessage("MC block notes saved.");
    } catch (error) {
      setMcErrorMessage(getErrorMessage(error));
    } finally {
      setActiveMcBlockActionId(null);
    }
  }

  async function handleMoveMcSponsor(sponsorId: string, direction: "up" | "down") {
    if (!show) {
      setMcErrorMessage("The show is not loaded yet.");
      return;
    }

    const currentIndex = adminMcFlowItems.findIndex(
      (item) => item.kind === "sponsor" && item.sponsor.id === sponsorId,
    );

    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= adminMcFlowItems.length) {
      return;
    }

    const currentItem = adminMcFlowItems[currentIndex];
    const neighborItem = adminMcFlowItems[targetIndex];

    if (!currentItem || currentItem.kind !== "sponsor" || !neighborItem) {
      return;
    }

    const reorderedItems = [...adminMcFlowItems];
    [reorderedItems[currentIndex], reorderedItems[targetIndex]] = [
      reorderedItems[targetIndex],
      reorderedItems[currentIndex],
    ];

    const sponsorSequence = reorderedItems.filter(
      (item): item is Extract<McFlowRenderableItem, { kind: "sponsor" }> => item.kind === "sponsor",
    );

    const movedSponsorPlacement = getMcSponsorPlacementFromNeighbor(neighborItem, direction);

    const nextSponsors = showSponsors
      .map((sponsor) => {
        const nextOrder = sponsorSequence.findIndex((item) => item.sponsor.id === sponsor.id);

        if (nextOrder < 0) {
          return sponsor;
        }

        if (sponsor.id === sponsorId) {
          return {
            ...sponsor,
            placement_order: nextOrder + 1,
            placement_type: movedSponsorPlacement.placement_type,
            mc_anchor_song_id: movedSponsorPlacement.mc_anchor_song_id,
            linked_performer: movedSponsorPlacement.linked_performer,
          };
        }

        return {
          ...sponsor,
          placement_order: nextOrder + 1,
        };
      })
      .sort((sponsorA, sponsorB) => sponsorA.placement_order - sponsorB.placement_order);

    setMcErrorMessage(null);
    setMcStatusMessage(null);
    setActiveSponsorActionId(`mc-${sponsorId}`);

    try {
      const supabase = createClient();

      for (const sponsor of nextSponsors) {
        const { error } = await supabase
          .from("show_sponsors")
          .update({
            placement_order: sponsor.placement_order,
            placement_type: sponsor.placement_type,
            mc_anchor_song_id: sponsor.mc_anchor_song_id,
            linked_performer: sponsor.linked_performer,
          })
          .eq("id", sponsor.id)
          .eq("show_id", show.id);

        if (error) {
          throw error;
        }
      }

      setShowSponsors(nextSponsors);
      setMcStatusMessage("Sponsor flow order updated.");
    } catch (error) {
      setMcErrorMessage(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleAddPoolSongToSection(
    songToPlace: PendingSubmission,
    section: SetSection,
  ) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    setActionError(null);
    setActivePendingActionId(songToPlace.id);

    try {
      const supabase = createClient();
      const nextPosition = getNextPositionForSection(setlist, section);

      const { data: insertedSong, error: insertError } = await supabase
        .from("setlist_entries")
        .insert({
          show_id: show.id,
          section,
          position: nextPosition,
          source_type: "guest",
          guest_song_id: songToPlace.id,
        })
        .select(`
          id,
          show_id,
          section,
          position,
          source_type,
          song_id,
          guest_song_id,
          custom_title,
          created_at,
          guest_song:guest_song_id (
            id,
            show_id,
            title,
            key,
            tempo,
            song_type,
            submitted_by_name,
            created_at
          )
        `)
        .single();

      if (insertError) {
        throw insertError;
      }

      setSetlist((currentSongs) =>
        sortSetlistSongs([...currentSongs, normalizeSetlistSong(insertedSong as SetlistEntryQueryRow)]),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActivePendingActionId(null);
    }
  }

  async function handleDeleteFromSongPool(songId: string) {
    setActionError(null);
    setActivePendingActionId(songId);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("show_guest_songs").delete().eq("id", songId);

      if (error) {
        throw error;
      }

      setPendingSongs((currentSongs) => currentSongs.filter((song) => song.id !== songId));
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActivePendingActionId(null);
    }
  }

  async function handleDeleteGuestSong(songId: string) {
    const songToDelete = pendingSongs.find((song) => song.id === songId);

    if (!songToDelete) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete the guest song "${songToDelete.title}" for ${getDisplaySingerName(songToDelete.submitted_by_name)}?`,
    );

    if (!shouldDelete) {
      return;
    }

    await handleDeleteFromSongPool(songId);
  }

  async function handleDeleteGuestProfile(profileId: string) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const profileToDelete = guestProfiles.find((profile) => profile.id === profileId);

    if (!profileToDelete) {
      return;
    }

    const relatedGuestSongs = pendingSongs.filter((song) =>
      isGuestSongForProfile(song, profileToDelete.name),
    );
    const shouldDelete = window.confirm(
      `Delete guest profile "${profileToDelete.name || "Unnamed guest"}"? This will also delete ${relatedGuestSongs.length} submitted song${
        relatedGuestSongs.length === 1 ? "" : "s"
      } for this show.`,
    );

    if (!shouldDelete) {
      return;
    }

    setActionError(null);
    setActivePendingActionId(`guest-${profileId}`);

    try {
      const supabase = createClient();
      const relatedSongIds = relatedGuestSongs.map((song) => song.id);

      if (relatedSongIds.length > 0) {
        const { error: deleteSongsError } = await supabase
          .from("show_guest_songs")
          .delete()
          .in("id", relatedSongIds);

        if (deleteSongsError) {
          throw deleteSongsError;
        }
      }

      const { error: deleteProfileError } = await supabase
        .from("guest_profiles")
        .delete()
        .eq("id", profileId)
        .eq("show_id", show.id);

      if (deleteProfileError) {
        throw deleteProfileError;
      }

      setGuestProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.id !== profileId));
      setPendingSongs((currentSongs) =>
        currentSongs.filter((song) => !relatedSongIds.includes(song.id)),
      );

      if (editingGuestProfileId === profileId) {
        resetGuestProfileForm();
      }

      if (selectedGuestProfileId === profileId) {
        setSelectedGuestProfileId("");
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActivePendingActionId(null);
    }
  }

  function handlePoolSongEditChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setPoolSongEditFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleStartEditingPoolSong(songId: string) {
    const songToEdit = pendingSongs.find((song) => song.id === songId);

    if (!songToEdit || !canEditPoolSong()) {
      return;
    }

    setEditingPoolSongId(songId);
    setPoolSongEditFormState(buildSongEditFormState(songToEdit));
  }

  function handleCancelPoolSongEdit() {
    setEditingPoolSongId(null);
    setPoolSongEditFormState({
      title: "",
      key: "",
      tempo: "",
      songType: "",
    });
  }

  async function handleSavePoolSong(songId: string) {
    const songToUpdate = pendingSongs.find((song) => song.id === songId);

    if (!songToUpdate || !canEditPoolSong()) {
      return;
    }

    const title = poolSongEditFormState.title.trim();
    const guestAssociationName =
      selectedGuestProfile?.name?.trim() ||
      songToUpdate.submitted_by_name?.trim() ||
      "";

    if (!title) {
      setActionError("Song title is required.");
      return;
    }

    if (viewMode === "guest" && !guestAssociationName) {
      setActionError("Choose the correct guest before saving this song.");
      return;
    }

    setActionError(null);
    setActivePendingActionId(songId);

    try {
      const supabase = createClient();
      const updatePayload = {
        title,
        key: normalizeOptionalField(poolSongEditFormState.key),
        tempo: poolSongEditFormState.tempo || null,
        song_type: poolSongEditFormState.songType || null,
        submitted_by_name: guestAssociationName,
      };
      const { data, error } = await supabase
        .from("show_guest_songs")
        .update(updatePayload)
        .eq("id", songId)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        if (editingPoolSongId === songId) {
          handleCancelPoolSongEdit();
        }
        return;
      }

      setPendingSongs((currentSongs) =>
        currentSongs.map((song) =>
          song.id === songId ? normalizePendingSubmission(data as PendingSubmission) : song,
        ),
      );
      handleCancelPoolSongEdit();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActivePendingActionId(null);
    }
  }

  function handleLibrarySongEditChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setLibrarySongEditFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleStartEditingLibrarySong(songId: string) {
    const songToEdit = songLibrary.find((song) => song.id === songId);

    if (!songToEdit || !canEditLibrarySong(songToEdit)) {
      return;
    }

    setEditingLibrarySongId(songId);
    setLibrarySongEditFormState(buildSongEditFormState(songToEdit));
  }

  function handleCancelLibrarySongEdit() {
    setEditingLibrarySongId(null);
    setLibrarySongEditFormState({
      title: "",
      key: "",
      tempo: "",
      songType: "",
      notes: "",
      lyrics: "",
    });
  }

  function handleToggleLibraryLyrics(songId: string) {
    setOpenLibraryLyricsSongId((currentSongId) => (currentSongId === songId ? null : songId));
  }

  function handlePrintLibrarySong(song: SongLibrarySong) {
    console.log("Printing library song", song);

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert("The print window was blocked. Please allow pop-ups and try again.");
      return;
    }

    const printHtml = buildSongPrintHtml(song);
    const triggerPrint = () => {
      if (printWindow.closed) {
        return;
      }

      printWindow.focus();
      printWindow.print();
    };

    printWindow.onload = triggerPrint;
    printWindow.onafterprint = () => {
      printWindow.close();
    };

    const { document } = printWindow;
    document.open();
    document.write(printHtml);
    document.close();

    if (document.readyState === "complete") {
      triggerPrint();
    }
  }

  async function handleSaveLibrarySong(songId: string) {
    const songToUpdate = songLibrary.find((song) => song.id === songId);

    if (!songToUpdate || !canEditLibrarySong(songToUpdate)) {
      return;
    }

    const title = librarySongEditFormState.title.trim();

    if (!title) {
      setActionError("Song title is required.");
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("songs")
        .update({
          title,
          key: normalizeOptionalField(librarySongEditFormState.key),
          tempo: librarySongEditFormState.tempo || null,
          song_type: librarySongEditFormState.songType || null,
          notes: normalizeOptionalField(librarySongEditFormState.notes ?? ""),
          lyrics: normalizeOptionalField(librarySongEditFormState.lyrics ?? ""),
        })
        .eq("id", songId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setSongLibrary((currentSongs) =>
        currentSongs
          .map((song) => (song.id === songId ? normalizeSongLibrarySong(data) : song))
          .sort((songA, songB) => songA.title.localeCompare(songB.title)),
      );
      setSetlist((currentSongs) =>
        currentSongs.map((setlistSong) => {
          if (setlistSong.source_type !== "library" || setlistSong.song_id !== songId) {
            return setlistSong;
          }

          return normalizeSetlistSong({
            ...setlistSong,
            library_song: data as SongLibrarySong,
          });
        }),
      );
      handleCancelLibrarySongEdit();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleAddLibrarySongToSection(songToPlace: SongLibrarySong, section: SetSection) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToPlace.id);

    try {
      const supabase = createClient();
      const nextPosition = getNextPositionForSection(setlist, section);

      const { data: insertedSong, error } = await supabase
        .from("setlist_entries")
        .insert({
          show_id: show.id,
          section,
          position: nextPosition,
          source_type: "library",
          song_id: songToPlace.id,
        })
        .select(`
          id,
          show_id,
          section,
          position,
          source_type,
          song_id,
          guest_song_id,
          custom_title,
          created_at,
          library_song:song_id (
            id,
            title,
            key,
            tempo,
            song_type,
            notes,
            lyrics,
            created_by_role,
            created_by_name,
            created_at
          )
        `)
        .single();

      if (error) {
        throw error;
      }

      setSetlist((currentSongs) =>
        sortSetlistSongs([...currentSongs, normalizeSetlistSong(insertedSong as SetlistEntryQueryRow)]),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleMoveSongUp(songId: string) {
    const songToMove = setlist.find((song) => song.id === songId);

    if (!songToMove) {
      return;
    }

    const sectionSongs = getSongsInSection(setlist, songToMove.section);
    const songIndex = sectionSongs.findIndex((song) => song.id === songId);

    if (songIndex <= 0) {
      return;
    }

    const songAbove = sectionSongs[songIndex - 1];

    if (!songAbove) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToMove.id);

    try {
      const supabase = createClient();
      const { error: firstUpdateError } = await supabase
        .from("setlist_entries")
        .update({ position: songAbove.position })
        .eq("id", songToMove.id);

      if (firstUpdateError) {
        throw firstUpdateError;
      }

      const { error: secondUpdateError } = await supabase
        .from("setlist_entries")
        .update({ position: songToMove.position })
        .eq("id", songAbove.id);

      if (secondUpdateError) {
        throw secondUpdateError;
      }

      setSetlist((currentSetlist) => {
        return sortSetlistSongs(
          currentSetlist.map((song) => {
            if (song.id === songToMove.id) {
              return { ...song, position: songAbove.position };
            }

            if (song.id === songAbove.id) {
              return { ...song, position: songToMove.position };
            }

            return song;
          }),
        );
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleMoveSongDown(songId: string) {
    const songToMove = setlist.find((song) => song.id === songId);

    if (!songToMove) {
      return;
    }

    const sectionSongs = getSongsInSection(setlist, songToMove.section);
    const songIndex = sectionSongs.findIndex((song) => song.id === songId);

    if (songIndex === -1 || songIndex >= sectionSongs.length - 1) {
      return;
    }

    const songBelow = sectionSongs[songIndex + 1];

    if (!songBelow) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToMove.id);

    try {
      const supabase = createClient();
      const { error: firstUpdateError } = await supabase
        .from("setlist_entries")
        .update({ position: songBelow.position })
        .eq("id", songToMove.id);

      if (firstUpdateError) {
        throw firstUpdateError;
      }

      const { error: secondUpdateError } = await supabase
        .from("setlist_entries")
        .update({ position: songToMove.position })
        .eq("id", songBelow.id);

      if (secondUpdateError) {
        throw secondUpdateError;
      }

      setSetlist((currentSetlist) => {
        return sortSetlistSongs(
          currentSetlist.map((song) => {
            if (song.id === songToMove.id) {
              return { ...song, position: songBelow.position };
            }

            if (song.id === songBelow.id) {
              return { ...song, position: songToMove.position };
            }

            return song;
          }),
        );
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleMoveSongToSection(songId: string, nextSection: SetSection) {
    const songToMove = setlist.find((song) => song.id === songId);

    if (!songToMove) {
      return;
    }

    if (songToMove.section === nextSection) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToMove.id);

    try {
      const supabase = createClient();
      const nextPosition = getNextPositionForSection(setlist, nextSection);

      const { error } = await supabase
        .from("setlist_entries")
        .update({ section: nextSection, position: nextPosition })
        .eq("id", songToMove.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        sortSetlistSongs(
          currentSetlist.map((song) =>
            song.id === songToMove.id
              ? { ...song, section: nextSection, position: nextPosition }
              : song,
          ),
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleRemoveFromSetlist(songId: string) {
    const songToRemove = setlist.find((song) => song.id === songId);

    if (!songToRemove) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(songToRemove.id);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("setlist_entries").delete().eq("id", songToRemove.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        currentSetlist.filter((song) => song.id !== songToRemove.id),
      );
      setEditingSetlistSongId((currentSongId) =>
        currentSongId === songToRemove.id ? null : currentSongId,
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  function handleSetlistSongEditChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setSetlistSongEditFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleStartEditingSetlistSong(songId: string) {
    const songToEdit = setlist.find((song) => song.id === songId);

    if (!songToEdit || !canEditSetlistSong()) {
      return;
    }

    setEditingSetlistSongId(songId);
    setSetlistSongEditFormState(buildSetlistSongEditFormState(songToEdit));
  }

  async function handleSaveSetlistSong(songId: string) {
    const songToUpdate = setlist.find((song) => song.id === songId);

    if (!songToUpdate || !canEditSetlistSong()) {
      return;
    }

    const customTitle = normalizeOptionalField(setlistSongEditFormState.customTitle);

    setActionError(null);
    setActiveSetlistActionId(songToUpdate.id);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("setlist_entries")
        .update({
          custom_title: customTitle,
        })
        .eq("id", songToUpdate.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        currentSetlist.map((song) =>
          song.id === songToUpdate.id
            ? {
                ...song,
                custom_title: customTitle,
                title: customTitle ?? (
                  song.source_type === "guest"
                    ? pendingSongs.find((guestSong) => guestSong.id === song.guest_song_id)?.title ??
                      song.title
                    : songLibrary.find((librarySong) => librarySong.id === song.song_id)?.title ??
                      song.title
                ),
              }
            : song,
        ),
      );

      setEditingSetlistSongId(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  function handleCancelSetlistSongEdit() {
    setEditingSetlistSongId(null);
    setSetlistSongEditFormState({
      customTitle: "",
    });
  }

  const guestShowInfoItems: ShowInfoItem[] = show
    ? [
        { label: "Show Name", value: show?.name ?? "" },
        { label: "Show Date", value: formatShowDate(show?.show_date ?? null) },
        { label: "Venue", value: show?.venue ?? "" },
        { label: "Venue Address", value: show?.venue_address ?? "" },
        {
          label: "Directions",
          value: show?.directions_url ?? "",
          href: show?.directions_url ?? undefined,
        },
        { label: "Guest Arrival Time", value: show?.guest_arrival_time ?? "" },
        { label: "Call Time", value: show?.call_time ?? "" },
        { label: "Soundcheck Time", value: show?.soundcheck_time ?? "" },
        { label: "Show Start Time", value: show?.show_start_time ?? "" },
        { label: "Contact Name", value: show?.contact_name ?? "" },
        { label: "Contact Phone", value: show?.contact_phone ?? "" },
        { label: "Parking Notes", value: show?.parking_notes ?? "" },
        { label: "Load-In Notes", value: show?.load_in_notes ?? "" },
        { label: "Announcements", value: show?.announcements ?? "" },
      ]
    : [];

  const guestMessage = show?.guest_message?.trim() ?? "";
  const autoSelectedGuestProfile =
    guestProfiles.length === 1 ? guestProfiles[0] : null;
  const selectedGuestProfile =
    viewMode === "guest"
      ? guestProfiles.find((profile) => profile.id === selectedGuestProfileId) ??
        autoSelectedGuestProfile
      : null;
  const guestSingerName =
    viewMode === "guest"
      ? selectedGuestProfile?.name?.trim() || guestProfileFormState.name.trim() || ""
      : "";
  const requiresGuestSelection = viewMode === "guest" && guestProfiles.length > 1 && !selectedGuestProfile;
  const isGuestSongSubmissionBlocked = viewMode === "guest" && guestProfiles.length === 0;
  const shouldShowGuestProfileSelector = shouldShowGuestSongsTab && guestProfiles.length > 1;
  const canOpenGuestSongForm = guestProfiles.length === 1 || Boolean(selectedGuestProfile);
  const guestSubmittedSongs =
    viewMode === "guest"
      ? pendingSongs.filter((song) => {
          if (normalizeSubmittedByRole(song.submitted_by_role) !== "guest") {
            return false;
          }

          if (!selectedGuestProfile) {
            return guestProfiles.length <= 1;
          }

          const submittedByName = normalizeGuestProfileName(song.submitted_by_name ?? "");
          const currentGuestName = normalizeGuestProfileName(selectedGuestProfile.name ?? "");

          return submittedByName === currentGuestName;
        })
      : [];

  const bandShowInfoItems: ShowInfoItem[] = show
    ? [
        { label: "Show Name", value: show?.name ?? "" },
        { label: "Show Date", value: formatShowDate(show?.show_date ?? null) },
        { label: "Venue", value: show?.venue ?? "" },
        { label: "Venue Address", value: show?.venue_address ?? "" },
        {
          label: "Directions",
          value: show?.directions_url ?? "",
          href: show?.directions_url ?? undefined,
        },
        { label: "Band Arrival Time", value: show?.band_arrival_time ?? "" },
        { label: "Soundcheck Time", value: show?.soundcheck_time ?? "" },
        { label: "Call Time", value: show?.call_time ?? "" },
        { label: "Show Start Time", value: show?.show_start_time ?? "" },
        { label: "Contact Name", value: show?.contact_name ?? "" },
        { label: "Contact Phone", value: show?.contact_phone ?? "" },
        { label: "Parking Notes", value: show?.parking_notes ?? "" },
        { label: "Load-In Notes", value: show?.load_in_notes ?? "" },
        { label: "Announcements", value: show?.announcements ?? "" },
      ]
    : [];

  const activeAdminTabLabel =
    adminTabItems.find((tab) => tab.key === activeAdminTab)?.label ?? "Setlist";
  const activeBandTabLabel =
    bandTabItems.find((tab) => tab.key === activeBandTab)?.label ?? "Setlist";
  const activeGuestTabLabel =
    guestTabItems.find((tab) => tab.key === activeGuestTab)?.label ?? "Songs";

  if (isLoading) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-stone-600">Loading show data...</p>
        </section>
      </main>
    );
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-rose-700">
            {errorMessage || "The show could not be loaded."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      data-print-mode={printMode}
      className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6"
    >
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 print-shell">
        <AdminQuickNav slug={showSlug} currentView={viewMode} />

        <header className="print-hidden flex flex-col gap-4 border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              {shouldShowPortalLogo ? (
                <div className="mb-2">
                  <Image
                    src="/cmms-logo.png"
                    alt="CMMS logo"
                    width={180}
                    height={64}
                    priority
                    className="h-auto w-full max-w-[140px] sm:max-w-[180px]"
                  />
                </div>
              ) : null}
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Live Music Show Manager
              </p>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
                {portalLabel}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{show.name}</h1>
              <p className="text-base text-stone-600">{formatShowDate(show.show_date)}</p>
            </div>

            <ThemeToggle />
          </div>
        </header>

        {errorMessage ? (
          <div className="print-hidden rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="print-hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {actionError}
          </div>
        ) : null}

        {showRoleToggle ? (
          <section className="print-hidden flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">View Mode Toggle</h2>
                <p className="text-sm text-stone-600">
                  Switch between guest, band, and admin views locally.
                </p>
              </div>
              <p className="text-sm font-medium text-stone-500">
                Active mode:{" "}
                <span className="capitalize text-emerald-700">{viewMode}</span>
              </p>
            </div>

            <div
              className="grid grid-cols-1 gap-3 rounded-2xl bg-stone-100 p-2 sm:grid-cols-3"
              role="group"
              aria-label="View mode toggle"
            >
              <button
                type="button"
                onClick={() => setViewMode("guest")}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  viewMode === "guest"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                Guest View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("band")}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  viewMode === "band"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                Band View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("admin")}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  viewMode === "admin"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                Admin View
              </button>
            </div>
          </section>
        ) : null}

        {isAdminView ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Admin Sections</h2>
              <p className="text-sm text-stone-600">
                Jump straight to the part of the admin portal you want to work in.
              </p>
            </div>

            <div
              className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-2 sm:grid-cols-3 xl:grid-cols-7"
              role="tablist"
              aria-label="Admin portal sections"
            >
              {adminTabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeAdminTab === tab.key}
                  onClick={() => setActiveAdminTab(tab.key)}
                  className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    activeAdminTab === tab.key
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Active section: <span className="font-semibold text-emerald-700">{activeAdminTabLabel}</span>
            </div>
          </section>
        ) : null}

        {isBandView ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Band Sections</h2>
              <p className="text-sm text-stone-600">
                Jump between the show-day setlist, song collaboration tools, and itinerary details.
              </p>
            </div>

            <div
              className="grid grid-cols-1 gap-2 rounded-2xl bg-stone-100 p-2 sm:grid-cols-4"
              role="tablist"
              aria-label="Band portal sections"
            >
              {bandTabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeBandTab === tab.key}
                  onClick={() => setActiveBandTab(tab.key)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    activeBandTab === tab.key
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Active section: <span className="font-semibold text-emerald-700">{activeBandTabLabel}</span>
            </div>
          </section>
        ) : null}

        {isGuestView && guestMessage ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Welcome</h2>
              <p className="text-sm text-stone-600">
                A message from the show team for this event.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-5">
              <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">
                {guestMessage}
              </p>
            </div>
          </section>
        ) : null}

        {isGuestView ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Guest Sections</h2>
              <p className="text-sm text-stone-600">
                Switch between songs and artist details without scrolling through everything at once.
              </p>
            </div>

            <div
              className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-2 sm:grid-cols-4"
              role="tablist"
              aria-label="Guest portal sections"
            >
              {guestTabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeGuestTab === tab.key}
                  onClick={() => setActiveGuestTab(tab.key)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    activeGuestTab === tab.key
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Active section: <span className="font-semibold text-emerald-700">{activeGuestTabLabel}</span>
            </div>
          </section>
        ) : null}

        {shouldShowGuestItineraryTab ? (
          <ShowInfoCard
            title="Guest Itinerary"
            subtitle="Show details, timing, and contact information for guest performers."
            items={guestShowInfoItems}
          />
        ) : null}

        {viewMode === "band" && activeBandTab === "itinerary" ? (
          <ShowInfoCard
            title="Band Itinerary"
            subtitle="Show details, timing, and logistics for the band."
            items={bandShowInfoItems}
          />
        ) : null}

        {shouldShowGuestPromoMaterialsTab || shouldShowBandPromoMaterialsTab ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Promo Materials</h2>
              <p className="text-sm text-stone-600">
                Download flyers, graphics, and promotional items for this show.
              </p>
            </div>

            <SectionLoadWarning message={dataSectionErrors.promoMaterials} />

            <PromoMaterialsView
              materials={visiblePromoMaterials}
              emptyMessage="No visible promo materials have been added for this show yet."
            />
          </section>
        ) : null}

        {isAdminView && activeAdminTab === "mc-builder" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">MC Builder</h2>
              <p className="text-sm text-stone-600">
                Build the announcer packet here while keeping the official setlist as the source
                of truth for performer order.
              </p>
            </div>

            {mcStatusMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {mcStatusMessage}
              </div>
            ) : null}

            {mcErrorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {mcErrorMessage}
              </div>
            ) : null}

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-stone-700">
                  The public MC page is now read-only. Use this builder to update scripts and
                  performer notes, then open the MC packet to review the final announcer view.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/mc/${showSlug}`}
                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Open Read-Only MC Packet
                  </Link>
                </div>
              </div>
            </div>

            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">MC Scripts</h3>
                <p className="text-sm text-stone-600">
                  Edit the opening, intermission, and closing scripts used in the announcer packet.
                </p>
              </div>

              <form className="grid gap-4" onSubmit={handleSaveMcScripts}>
                <div className="grid gap-4 xl:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Opening Script
                    <textarea
                      name="openingScript"
                      value={mcScriptFormState.openingScript}
                      onChange={handleMcScriptChange}
                      className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Welcome language, opener, and first housekeeping notes"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Intermission Script
                    <textarea
                      name="intermissionScript"
                      value={mcScriptFormState.intermissionScript}
                      onChange={handleMcScriptChange}
                      className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Intermission reminders, sponsor thanks, and return timing"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Closing Script
                    <textarea
                      name="closingScript"
                      value={mcScriptFormState.closingScript}
                      onChange={handleMcScriptChange}
                      className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Closing thanks, future date mentions, and sign-off"
                    />
                  </label>
                </div>

                <div className="flex justify-start">
                  <button
                    type="submit"
                    disabled={isSavingMcScripts}
                    className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                  >
                    {isSavingMcScripts ? "Saving MC Scripts..." : "Save MC Scripts"}
                  </button>
                </div>
              </form>
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">Sponsor Placement in MC Flow</h3>
                <p className="text-sm text-stone-600">
                  These reads appear inline in the run sheet below. Update exact placement in the
                  Sponsors tab, then verify the result here in context.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("sponsors")}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  Open Sponsors Tab
                </button>
              </div>

              {showSponsors.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No sponsors are assigned to this show yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {showSponsors.map((sponsor) => (
                    <article
                      key={`mc-sponsor-${sponsor.id}`}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-stone-900">
                            {sponsor.sponsor?.name ?? "Assigned sponsor"}
                          </h4>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                            {formatSponsorPlacementType(sponsor.placement_type)}
                          </span>
                          <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                            Slot {sponsor.placement_order}
                          </span>
                        </div>
                        {sponsor.linked_performer ? (
                          <p className="text-sm text-stone-600">
                            Linked performer: {sponsor.linked_performer}
                          </p>
                        ) : null}
                        {sponsor.custom_note ? (
                          <p className="text-sm text-stone-600">MC note: {sponsor.custom_note}</p>
                        ) : null}
                        <p className="text-sm text-stone-700">{getSponsorReadText(sponsor)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">MC Flow Preview</h3>
                <p className="text-sm text-stone-600">
                  Edit performer intro, sponsor mention, and transition notes directly in the flow.
                </p>
              </div>

              <section className="flex flex-col gap-4">
                <ScriptCard title="Opening Script" text={mcScriptFormState.openingScript} />
              </section>

              {mcRunSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No official setlist is available yet, so the MC flow is still empty.
                </div>
              ) : (
                mcRunSheetData.sectionItems.map((section) => (
                  <section key={`admin-mc-${section.key}`} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-lg font-semibold text-stone-900">{section.title}</h4>
                      <p className="text-sm text-stone-600">
                        {section.items.filter((item) => item.kind === "block").length} performance{" "}
                        {section.items.filter((item) => item.kind === "block").length === 1
                          ? "block"
                          : "blocks"}
                      </p>
                    </div>

                    <div className="grid gap-4">
                      {section.items.map((item) => {
                        if (item.kind === "sponsor") {
                          const sponsorIndex = adminMcFlowItems.findIndex(
                            (flowItem) =>
                              flowItem.kind === "sponsor" &&
                              flowItem.sponsor.id === item.sponsor.id,
                          );
                          const canMoveUp = sponsorIndex > 0;
                          const canMoveDown =
                            sponsorIndex >= 0 && sponsorIndex < adminMcFlowItems.length - 1;

                          return (
                            <div key={item.id} className="grid gap-3">
                              <SponsorReadCard sponsor={item.sponsor} />
                              <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => handleMoveMcSponsor(item.sponsor.id, "up")}
                                  disabled={!canMoveUp || activeSponsorActionId === `mc-${item.sponsor.id}`}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Move Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveMcSponsor(item.sponsor.id, "down")}
                                  disabled={!canMoveDown || activeSponsorActionId === `mc-${item.sponsor.id}`}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Move Down
                                </button>
                              </div>
                            </div>
                          );
                        }

                        const blockDraft = mcBlockNoteDrafts[item.block.anchorSongId] ?? {
                          introNote: "",
                          sponsorMention: "",
                          transitionNote: "",
                        };

                        return (
                          <div key={item.id} className="grid gap-4">
                            <PerformerBlockCard
                              block={item.block}
                              blockDraft={blockDraft}
                              upNext={item.upNext}
                            />

                            <div className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 lg:grid-cols-3">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Intro Note
                                <textarea
                                  value={blockDraft.introNote}
                                  onChange={(event) =>
                                    handleMcBlockDraftChange(
                                      item.block.anchorSongId,
                                      "introNote",
                                      event.target.value,
                                    )
                                  }
                                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Intro line before bringing this performer up"
                                />
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Sponsor Mention
                                <textarea
                                  value={blockDraft.sponsorMention}
                                  onChange={(event) =>
                                    handleMcBlockDraftChange(
                                      item.block.anchorSongId,
                                      "sponsorMention",
                                      event.target.value,
                                    )
                                  }
                                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional sponsor line tied to this performer"
                                />
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Transition Note
                                <textarea
                                  value={blockDraft.transitionNote}
                                  onChange={(event) =>
                                    handleMcBlockDraftChange(
                                      item.block.anchorSongId,
                                      "transitionNote",
                                      event.target.value,
                                    )
                                  }
                                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Changeover or wrap-up note after this block"
                                />
                              </label>
                            </div>

                            <div className="flex justify-start">
                              <button
                                type="button"
                                onClick={() => handleSaveMcBlockNote(item.block.anchorSongId)}
                                disabled={activeMcBlockActionId === item.block.anchorSongId}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                {activeMcBlockActionId === item.block.anchorSongId
                                  ? "Saving Block Notes..."
                                  : "Save Block Notes"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}

              {(mcScriptFormState.intermissionScript.trim() ||
                mcRunSheetData.beforeIntermission.length > 0 ||
                mcRunSheetData.afterIntermission.length > 0 ||
                mcRunSections.some((section) => section.key === "set2" || section.key === "encore")) ? (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-lg font-semibold text-stone-900">Intermission Preview</h4>
                    <p className="text-sm text-stone-600">
                      Sponsor reads and script that will appear around the break.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {mcRunSheetData.beforeIntermission.map((sponsor) => (
                      <SponsorReadCard key={`admin-before-intermission-${sponsor.id}`} sponsor={sponsor} />
                    ))}

                    <ScriptCard title="Intermission Script" text={mcScriptFormState.intermissionScript} />

                    {mcRunSheetData.afterIntermission.map((sponsor) => (
                      <SponsorReadCard key={`admin-after-intermission-${sponsor.id}`} sponsor={sponsor} />
                    ))}
                  </div>
                </section>
              ) : null}

              {(mcScriptFormState.closingScript.trim() ||
                mcRunSheetData.closing.length > 0 ||
                mcRunSheetData.flexible.length > 0) ? (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-lg font-semibold text-stone-900">Closing Preview</h4>
                    <p className="text-sm text-stone-600">
                      Final sponsor reads and closing script in the order the MC will see them.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {mcRunSheetData.closing.map((sponsor) => (
                      <SponsorReadCard key={`admin-closing-${sponsor.id}`} sponsor={sponsor} />
                    ))}

                    <ScriptCard title="Closing Script" text={mcScriptFormState.closingScript} />

                    {mcRunSheetData.flexible.map((sponsor) => (
                      <SponsorReadCard key={`admin-flexible-${sponsor.id}`} sponsor={sponsor} />
                    ))}
                  </div>
                </section>
              ) : null}
            </section>
          </section>
        ) : null}

        {isAdminView && activeAdminTab === "show-details" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Show Details</h2>
                <p className="text-sm text-stone-600">
                  Update itinerary details that guests and band members will see in their portals.
                </p>
              </div>
              <Link
                href={`/admin/${show.slug}/print/itinerary`}
                className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Print Itinerary
              </Link>
            </div>

            {showDetailsMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {showDetailsMessage}
              </div>
            ) : null}

            {showDetailsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {showDetailsError}
              </div>
            ) : null}

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleShowDetailsSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Venue
                  <input
                    type="text"
                    name="venue"
                    value={showDetailsFormState.venue}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Venue name"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Venue Address
                  <input
                    type="text"
                    name="venueAddress"
                    value={showDetailsFormState.venueAddress}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="123 Main St, Town, State"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Directions URL
                <input
                  type="url"
                  name="directionsUrl"
                  value={showDetailsFormState.directionsUrl}
                  onChange={handleShowDetailsChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="https://maps.google.com/..."
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Call Time
                  <input
                    type="text"
                    name="callTime"
                    value={showDetailsFormState.callTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="5:30 PM"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Soundcheck Time
                  <input
                    type="text"
                    name="soundcheckTime"
                    value={showDetailsFormState.soundcheckTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="6:00 PM"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Show Start Time
                  <input
                    type="text"
                    name="showStartTime"
                    value={showDetailsFormState.showStartTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="7:00 PM"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Guest Arrival Time
                  <input
                    type="text"
                    name="guestArrivalTime"
                    value={showDetailsFormState.guestArrivalTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="6:15 PM"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Band Arrival Time
                  <input
                    type="text"
                    name="bandArrivalTime"
                    value={showDetailsFormState.bandArrivalTime}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="5:00 PM"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Contact Name
                  <input
                    type="text"
                    name="contactName"
                    value={showDetailsFormState.contactName}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Promoter or venue contact"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Contact Phone
                  <input
                    type="text"
                    name="contactPhone"
                    value={showDetailsFormState.contactPhone}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="(555) 555-5555"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Parking Notes
                <textarea
                  name="parkingNotes"
                  value={showDetailsFormState.parkingNotes}
                  onChange={handleShowDetailsChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Where to park, overflow info, gate notes, and similar details"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Load-In Notes
                <textarea
                  name="loadInNotes"
                  value={showDetailsFormState.loadInNotes}
                  onChange={handleShowDetailsChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Stage door, equipment access, stairs, or load-in instructions"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Announcements
                <textarea
                  name="announcements"
                  value={showDetailsFormState.announcements}
                  onChange={handleShowDetailsChange}
                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Anything everyone should know for this show"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Guest Welcome Message
                <textarea
                  name="guestMessage"
                  value={showDetailsFormState.guestMessage}
                  onChange={handleShowDetailsChange}
                  className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Add a warm welcome, arrival notes, or anything guests should see first."
                />
              </label>

              <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Promo Text</h3>
                  <p className="text-sm text-stone-600">
                    Reusable copy for social posts, emails, and future public promo pages.
                  </p>
                </div>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Short Promo
                  <textarea
                    name="promoShort"
                    value={showDetailsFormState.promoShort}
                    onChange={handleShowDetailsChange}
                    className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="A short blurb for quick social posts or event listings"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopyPromoText(showDetailsFormState.promoShort, "short")}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    {copiedPromoTextKey === "short" ? "Copied!" : "Copy Short Promo"}
                  </button>
                </div>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Full Promo
                  <textarea
                    name="promoLong"
                    value={showDetailsFormState.promoLong}
                    onChange={handleShowDetailsChange}
                    className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="A longer promo blurb with details, highlights, sponsors, or artist notes"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopyPromoText(showDetailsFormState.promoLong, "long")}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    {copiedPromoTextKey === "long" ? "Copied!" : "Copy Full Promo"}
                  </button>
                </div>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Ticket Link
                  <input
                    type="url"
                    name="ticketLink"
                    value={showDetailsFormState.ticketLink}
                    onChange={handleShowDetailsChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="https://tickets.example.com/show"
                  />
                </label>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Generated Post
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        Combines the show name, date, short promo, and ticket link.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyPromoText(generatedPromoPost, "post")}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      {copiedPromoTextKey === "post" ? "Copied!" : "Copy Full Post"}
                    </button>
                  </div>
                  <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-700">
                    {generatedPromoPost || "Add promo text to generate a ready-to-copy post."}
                  </pre>
                </div>
              </section>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSavingShowDetails}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSavingShowDetails ? "Saving Show Details..." : "Save Show Details"}
                </button>
              </div>
            </form>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Guest Preview
                </p>
                <div className="mt-4 grid gap-3">
                  {guestShowInfoItems
                    .filter((item) => item.value.trim())
                    .map((item) => (
                      <div key={`guest-preview-${item.label}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block break-words text-sm font-medium text-emerald-700 underline"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                            {item.value}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Band Preview
                </p>
                <div className="mt-4 grid gap-3">
                  {bandShowInfoItems
                    .filter((item) => item.value.trim())
                    .map((item) => (
                      <div key={`band-preview-${item.label}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block break-words text-sm font-medium text-emerald-700 underline"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                            {item.value}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isAdminView && activeAdminTab === "promo-materials" ? (
          <section className="print-hidden flex flex-col gap-6 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Promo Materials</h2>
              <p className="text-sm text-stone-600">
                Upload flyers, graphics, logos, photos, and other downloadable promo assets for this show.
              </p>
            </div>

            <SectionLoadWarning message={dataSectionErrors.promoMaterials} />

            {show ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Shareable promo hub:{" "}
                <Link
                  href={`/promo/${show.slug}`}
                  className="font-semibold underline"
                  target="_blank"
                >
                  /promo/{show.slug}
                </Link>
              </div>
            ) : null}

            {promoMaterialMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {promoMaterialMessage}
              </div>
            ) : null}

            {promoMaterialError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {promoMaterialError}
              </div>
            ) : null}

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleCreatePromoMaterial}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Title
                  <input
                    type="text"
                    name="title"
                    value={promoMaterialFormState.title}
                    onChange={(event) => handlePromoMaterialChange(event, "new")}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="April show flyer"
                    required
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Category
                  <select
                    name="category"
                    value={promoMaterialFormState.category}
                    onChange={(event) => handlePromoMaterialChange(event, "new")}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  >
                    {promoMaterialCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Description
                <textarea
                  name="description"
                  value={promoMaterialFormState.description}
                  onChange={(event) => handlePromoMaterialChange(event, "new")}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional details about where or how to use this item"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                File
                <input
                  type="file"
                  onChange={(event) => handlePromoMaterialFileChange(event, "new")}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                  required
                />
              </label>

              <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
                <input
                  type="checkbox"
                  name="isVisible"
                  checked={promoMaterialFormState.isVisible}
                  onChange={(event) => handlePromoMaterialChange(event, "new")}
                  className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                />
                Visible in guest, band, and promo hub pages
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSavingPromoMaterial}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSavingPromoMaterial ? "Uploading..." : "Upload Promo Material"}
                </button>
              </div>
            </form>

            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-stone-900">Uploaded Materials</h3>
                <p className="text-sm text-stone-600">
                  Hidden items stay available here for admin, but will not show on public promo pages.
                </p>
              </div>

              {promoMaterials.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No promo materials have been uploaded for this show yet.
                </div>
              ) : (
                <div className="grid gap-4">
                  {promoMaterials.map((material) => {
                    const isEditingPromoMaterial = editingPromoMaterialId === material.id;
                    const fileSize = formatPromoFileSize(material.file_size);
                    const uploadDate = formatPromoUploadDate(material.created_at);
                    const isImage = isPromoMaterialImage(material);
                    const fileExtension = getPromoFileExtension(material.file_name);

                    return (
                      <article
                        key={material.id}
                        className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                      >
                        {isEditingPromoMaterial ? (
                          <div className="grid gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Title
                                <input
                                  type="text"
                                  name="title"
                                  value={promoMaterialEditFormState.title}
                                  onChange={(event) => handlePromoMaterialChange(event, "edit")}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  required
                                />
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Category
                                <select
                                  name="category"
                                  value={promoMaterialEditFormState.category}
                                  onChange={(event) => handlePromoMaterialChange(event, "edit")}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                >
                                  {promoMaterialCategoryOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Description
                              <textarea
                                name="description"
                                value={promoMaterialEditFormState.description}
                                onChange={(event) => handlePromoMaterialChange(event, "edit")}
                                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Replace File
                              <input
                                type="file"
                                onChange={(event) => handlePromoMaterialFileChange(event, "edit")}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                              />
                            </label>

                            <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
                              <input
                                type="checkbox"
                                name="isVisible"
                                checked={promoMaterialEditFormState.isVisible}
                                onChange={(event) => handlePromoMaterialChange(event, "edit")}
                                className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                              />
                              Visible in guest, band, and promo hub pages
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handleSavePromoMaterial(material)}
                                disabled={activePromoMaterialActionId === material.id}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                Save Material
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingPromoMaterial}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex flex-col gap-4 sm:flex-row">
                                {isImage ? (
                                  <a
                                    href={material.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open ${material.title} preview`}
                                    className="block aspect-[4/3] w-full shrink-0 rounded-2xl border border-stone-200 bg-stone-200 bg-cover bg-center transition hover:opacity-90 sm:w-44"
                                    style={{ backgroundImage: `url("${material.file_url}")` }}
                                  />
                                ) : (
                                  <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white sm:w-44">
                                    <div className="flex h-20 w-16 flex-col items-center justify-center rounded-xl border border-stone-300 bg-stone-50 text-center">
                                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-stone-500">
                                        File
                                      </span>
                                      <span className="mt-1 text-base font-semibold uppercase text-stone-800">
                                        {fileExtension ?? "Doc"}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                <div className="min-w-0">
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                    {formatPromoMaterialCategory(material.category)}
                                  </span>
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                                      material.is_visible
                                        ? "bg-stone-200 text-stone-700"
                                        : "bg-amber-200 text-amber-900"
                                    }`}
                                  >
                                    {material.is_visible ? "Visible" : "Hidden"}
                                  </span>
                                </div>
                                <h4 className="mt-3 text-lg font-semibold text-stone-900">
                                  {material.title}
                                </h4>
                                {material.description?.trim() ? (
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                                    {material.description}
                                  </p>
                                ) : null}
                              </div>
                              </div>
                              <a
                                href={material.file_url}
                                target="_blank"
                                rel="noreferrer"
                                download={material.file_name}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Download
                              </a>
                            </div>

                            <div className="flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                              <span>{material.file_name}</span>
                              {fileSize ? <span>{fileSize}</span> : null}
                              {uploadDate ? <span>Uploaded {uploadDate}</span> : null}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => startEditingPromoMaterial(material)}
                                disabled={activePromoMaterialActionId === material.id}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePromoMaterial(material)}
                                disabled={activePromoMaterialActionId === material.id}
                                className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        ) : null}

        {isAdminView && activeAdminTab === "sponsors" ? (
          <section className="print-hidden flex flex-col gap-6 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Sponsor Management</h2>
                <p className="text-sm text-stone-600">
                  Store sponsors once, then assign and order them for this show.
                </p>
              </div>
              <Link
                href={`/admin/${show.slug}/print/sponsors`}
                className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Print Sponsor Rundown
              </Link>
            </div>

            <SectionLoadWarning message={dataSectionErrors.sponsorLibrary || dataSectionErrors.showSponsors} />

            <div className="flex flex-wrap gap-2 rounded-2xl bg-stone-100 p-2">
              {sponsorAdminTabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveSponsorAdminTab(tab.key)}
                  className={`flex min-w-[12rem] flex-1 flex-col rounded-xl px-4 py-3 text-left transition ${
                    activeSponsorAdminTab === tab.key
                      ? "bg-white text-stone-900 shadow-sm"
                      : "bg-transparent text-stone-600 hover:bg-white/80 hover:text-stone-900"
                  }`}
                >
                  <span className="text-sm font-semibold">{tab.label}</span>
                  <span className="mt-1 text-xs leading-5 text-stone-500">
                    {tab.description}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-6">
              {activeSponsorAdminTab === "library" ? (
                <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Sponsor Library</h3>
                  <p className="text-sm text-stone-600">
                    Reusable sponsors available across all shows.
                  </p>
                </div>

                <form className="grid gap-4" onSubmit={handleCreateSponsorLibraryEntry}>
                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Sponsor Name
                    <input
                      type="text"
                      name="name"
                      value={newSponsorLibraryFormState.name}
                      onChange={(event) => handleSponsorLibraryChange(event, "new")}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Business or organization name"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Short Message
                    <textarea
                      name="shortMessage"
                      value={newSponsorLibraryFormState.shortMessage}
                      onChange={(event) => handleSponsorLibraryChange(event, "new")}
                      className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Short sponsor thank-you or mention"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Full Message
                    <textarea
                      name="fullMessage"
                      value={newSponsorLibraryFormState.fullMessage}
                      onChange={(event) => handleSponsorLibraryChange(event, "new")}
                      className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Longer sponsor read for MC or printed packet"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Website
                    <input
                      type="url"
                      name="website"
                      value={newSponsorLibraryFormState.website}
                      onChange={(event) => handleSponsorLibraryChange(event, "new")}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="https://example.com"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Sponsor Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleSponsorLogoFileChange(event, "new")}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                    />
                    <span className="text-xs font-normal text-stone-500">
                      Optional. Upload a reusable sponsor logo once for all shows.
                    </span>
                  </label>

                  <div className="flex justify-start">
                    <button
                      type="submit"
                      disabled={activeSponsorActionId === "new-library"}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {activeSponsorActionId === "new-library"
                        ? "Adding Sponsor..."
                        : "Add to Sponsor Library"}
                    </button>
                  </div>
                </form>

                {sponsorLibrary.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500">
                    No reusable sponsors saved yet.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {sponsorLibrary.map((sponsor) => (
                      <article
                        key={sponsor.id}
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        {editingSponsorLibraryId === sponsor.id ? (
                          <div className="grid gap-4">
                            <div className="flex flex-wrap items-start gap-3">
                              <SponsorLogoThumbnail
                                logoUrl={sponsorLibraryFormState.logoUrl}
                                sponsorName={sponsor.name}
                              />
                              <div className="min-w-[12rem] flex-1">
                                <p className="text-sm font-medium text-stone-700">
                                  {sponsorLibraryFormState.logoUrl
                                    ? "Current sponsor logo"
                                    : "No sponsor logo uploaded yet"}
                                </p>
                                {editingSponsorLogoFile ? (
                                  <p className="mt-1 text-xs text-stone-500">
                                    New file selected: {editingSponsorLogoFile.name}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Sponsor Name
                              <input
                                type="text"
                                name="name"
                                value={sponsorLibraryFormState.name}
                                onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                required
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Short Message
                              <textarea
                                name="shortMessage"
                                value={sponsorLibraryFormState.shortMessage}
                                onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Full Message
                              <textarea
                                name="fullMessage"
                                value={sponsorLibraryFormState.fullMessage}
                                onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                className="min-h-28 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Website
                              <input
                                type="url"
                                name="website"
                                value={sponsorLibraryFormState.website}
                                onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Replace Sponsor Logo
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(event) => handleSponsorLogoFileChange(event, "edit")}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                              />
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handleSaveSponsorLibraryEntry(sponsor.id)}
                                disabled={activeSponsorActionId === `library-${sponsor.id}`}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                Save Sponsor
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingSponsorLibraryEntry}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex gap-3">
                                <SponsorLogoThumbnail
                                  logoUrl={sponsor.logo_url}
                                  sponsorName={sponsor.name}
                                />

                                <div className="flex flex-col gap-1">
                                <h4 className="text-base font-semibold text-stone-900">
                                  {sponsor.name}
                                </h4>
                                {sponsor.website ? (
                                  <a
                                    href={sponsor.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-medium text-emerald-700 underline"
                                  >
                                    {sponsor.website}
                                  </a>
                                ) : null}
                              </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => startEditingSponsorLibraryEntry(sponsor.id)}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Edit Sponsor
                              </button>
                            </div>

                            <div className="mt-3 grid gap-3 text-sm text-stone-600">
                              {sponsor.short_message ? <p>Short: {sponsor.short_message}</p> : null}
                              {sponsor.full_message ? <p>Full: {sponsor.full_message}</p> : null}
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                </section>
              ) : null}

              {activeSponsorAdminTab === "show" ? (
                <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Sponsors for This Show</h3>
                  <p className="text-sm text-stone-600">
                    Assign reusable sponsors, then order and place them for this event.
                  </p>
                </div>

                <form className="grid gap-4" onSubmit={handleAssignSponsorToShow}>
                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Sponsor from Library
                    <select
                      name="sponsorId"
                      value={showSponsorAssignmentFormState.sponsorId}
                      onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      required
                    >
                      <option value="">Choose a sponsor</option>
                      {sponsorLibrary.map((sponsor) => (
                        <option key={sponsor.id} value={sponsor.id}>
                          {sponsor.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Placement Type
                      <select
                        name="placementType"
                        value={showSponsorAssignmentFormState.placementType}
                        onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        {sponsorPlacementOptions.map((option) => (
                          <option key={option.value || "unset"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Linked Performer
                      <input
                        type="text"
                        name="linkedPerformer"
                        value={showSponsorAssignmentFormState.linkedPerformer}
                        onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Optional performer name for before/after performer slots"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Custom Note
                    <textarea
                      name="customNote"
                      value={showSponsorAssignmentFormState.customNote}
                      onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                      className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Notes for this specific show placement"
                    />
                  </label>

                  <div className="flex justify-start">
                    <button
                      type="submit"
                      disabled={activeSponsorActionId === "assign-show"}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {activeSponsorActionId === "assign-show"
                        ? "Assigning Sponsor..."
                        : "Add Sponsor to This Show"}
                    </button>
                  </div>
                </form>

                {showSponsors.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500">
                    No sponsors assigned to this show yet.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {showSponsors.map((sponsor, sponsorIndex) => (
                      <article
                        key={sponsor.id}
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        {editingShowSponsorId === sponsor.id ? (
                          <div className="grid gap-4">
                            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                              {sponsor.sponsor?.name ?? "Assigned sponsor"}
                            </p>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Placement Type
                                <select
                                  name="placementType"
                                  value={editingShowSponsorFormState.placementType}
                                  onChange={(event) =>
                                    handleShowSponsorAssignmentChange(event, "edit")
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                >
                                  {sponsorPlacementOptions.map((option) => (
                                    <option key={option.value || "unset"} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Linked Performer
                                <input
                                  type="text"
                                  name="linkedPerformer"
                                  value={editingShowSponsorFormState.linkedPerformer}
                                  onChange={(event) =>
                                    handleShowSponsorAssignmentChange(event, "edit")
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional performer name for before/after performer slots"
                                />
                              </label>
                            </div>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Custom Note
                              <textarea
                                name="customNote"
                                value={editingShowSponsorFormState.customNote}
                                onChange={(event) =>
                                  handleShowSponsorAssignmentChange(event, "edit")
                                }
                                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handleSaveShowSponsor(sponsor.id)}
                                disabled={activeSponsorActionId === `show-${sponsor.id}`}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                Save Placement
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingShowSponsor}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex gap-3">
                                <SponsorLogoThumbnail
                                  logoUrl={sponsor.sponsor?.logo_url}
                                  sponsorName={sponsor.sponsor?.name ?? "Assigned sponsor"}
                                  className="h-12 w-12"
                                />

                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-base font-semibold text-stone-900">
                                    {sponsor.sponsor?.name ?? "Assigned sponsor"}
                                  </h4>
                                  <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                                    Slot {sponsor.placement_order}
                                  </span>
                                  {formatSponsorPlacementType(sponsor.placement_type) ? (
                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                      {formatSponsorPlacementType(sponsor.placement_type)}
                                    </span>
                                  ) : null}
                                  </div>
                                  {sponsor.linked_performer ? (
                                    <p className="text-sm text-stone-600">
                                      Linked performer: {sponsor.linked_performer}
                                    </p>
                                  ) : null}
                                  {sponsor.custom_note ? (
                                    <p className="text-sm text-stone-600">
                                      Note: {sponsor.custom_note}
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleMoveShowSponsor(sponsor.id, "up")}
                                  disabled={
                                    sponsorIndex === 0 || activeSponsorActionId === `show-${sponsor.id}`
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Move Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveShowSponsor(sponsor.id, "down")}
                                  disabled={
                                    sponsorIndex === showSponsors.length - 1 ||
                                    activeSponsorActionId === `show-${sponsor.id}`
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Move Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditingShowSponsor(sponsor.id)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Edit Placement
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShowSponsor(sponsor.id)}
                                  disabled={activeSponsorActionId === `show-${sponsor.id}`}
                                  className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                                >
                                  Remove from Show
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

        {shouldShowSetlistSection ? (
        <section className="flex flex-col gap-4">
          <div className="print-hidden flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Setlist</h2>
            <p className="text-sm text-stone-600">Live setlist loaded from Supabase.</p>
          </div>

          <div className="print-hidden flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handlePrint("stage")}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Stage Copy
            </button>
            <button
              type="button"
              onClick={() => handlePrint("band")}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Band Copy
            </button>
            <button
              type="button"
              onClick={() => handlePrint("standard")}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Standard Copy
            </button>
          </div>

          <SectionLoadWarning message={dataSectionErrors.setlist} />

          {setlist.length === 0 ? (
            <div className="print-hidden rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
              No setlist songs yet. Add a song from the library or this show&apos;s guest songs to get started.
            </div>
          ) : (
            <div className="print-hidden flex flex-col gap-6">
              {setlistSections.map((section) => (
                <section key={section.key} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-stone-900">{section.title}</h3>
                    <p className="text-sm text-stone-600">
                      {section.songs.length} {section.songs.length === 1 ? "song" : "songs"}
                    </p>
                  </div>

                  {section.songs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-500">
                      No songs assigned to {section.title} yet.
                    </div>
                  ) : (
                    <ol className="flex list-decimal flex-col gap-4 pl-6">
                      {section.songs.map((song) => (
                        <li key={song.id} className="pl-1">
                          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                            <p className="text-base font-medium text-stone-900 sm:text-lg">
                              {song.title} - {getDisplaySingerName(song.artist)}
                              {song.song_key ? ` (${song.song_key})` : ""}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                              <span>{song.source_type === "guest" ? "Guest Song" : "Library Song"}</span>
                              {song.tempo ? <span>Tempo: {song.tempo}</span> : null}
                              {song.song_type ? <span>Type: {song.song_type}</span> : null}
                            </div>

                            {song.notes?.trim() ? (
                              <p className="mt-3 whitespace-pre-wrap text-sm text-stone-600">
                                {renderTextWithLinks(song.notes)}
                              </p>
                            ) : null}

                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                              {canEditSetlistSong() ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditingSetlistSong(song.id)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Edit Song
                                </button>
                              ) : null}
                            </div>

                            {editingSetlistSongId === song.id ? (
                              <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                  Custom Title
                                  <input
                                    type="text"
                                    name="customTitle"
                                    value={setlistSongEditFormState.customTitle}
                                    onChange={handleSetlistSongEditChange}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    placeholder="Leave blank to use the source song title"
                                  />
                                </label>

                                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveSetlistSong(song.id)}
                                    disabled={activeSetlistActionId === song.id}
                                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                  >
                                    Save Song
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelSetlistSongEdit}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {viewMode === "admin" ? (
                              <div className="mt-4 flex flex-col gap-3">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSongUp(song.id)}
                                    disabled={activeSetlistActionId === song.id}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Move Up
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSongDown(song.id)}
                                    disabled={activeSetlistActionId === song.id}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Move Down
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromSetlist(song.id)}
                                    disabled={activeSetlistActionId === song.id}
                                    className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                                  >
                                    Remove
                                  </button>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSongToSection(song.id, "set1")}
                                    disabled={
                                      activeSetlistActionId === song.id || song.set_section === "set1"
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Move to Set 1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSongToSection(song.id, "set2")}
                                    disabled={
                                      activeSetlistActionId === song.id || song.set_section === "set2"
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Move to Set 2
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSongToSection(song.id, "encore")}
                                    disabled={
                                      activeSetlistActionId === song.id ||
                                      song.set_section === "encore"
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Move to Encore
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </div>
          )}

          {setlist.length > 0 ? (
            <div className="print-only print-setlist-root">
              <header className="print-copy-header">
                <h1>{show.name}</h1>
                <p>{formatShowDate(show.show_date)}</p>
              </header>

              <div className={`print-setlist-list print-mode-${printMode}`}>
                {setlistSections.map((section) => (
                  <section key={`print-${section.key}`} className="print-set-section">
                    <h2 className="print-set-section-title">{section.title}</h2>
                    <ol className="print-set-section-list">
                      {section.songs.map((song, index) => (
                        <li key={`print-${song.id}`} className="print-song-item">
                          <div className="print-song-main">
                            <span className="print-song-number">{index + 1}.</span>
                            <div className="print-song-body">
                              <div className="print-song-headline">
                                <span className="print-song-title">{song.title}</span>
                                {song.song_key ? (
                                  <span className="print-song-key">{song.song_key}</span>
                                ) : null}
                              </div>

                              {printMode !== "stage" || getDisplaySingerName(song.artist) ? (
                                <div className="print-song-support">
                                  <p className="print-song-artist">
                                    {getDisplaySingerName(song.artist)}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {shouldShowGuestArtistInfoTab ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Artist Info</h2>
              <p className="text-sm text-stone-600">
                Share your promo bio and photo for this show, then come back anytime to update it.
              </p>
            </div>

            {guestProfiles.length > 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-stone-900">Submitted Guest Artists</h3>
                  <p className="text-sm text-stone-600">
                    Choose an entry to review or update in the form below. The same guest list is
                    used for song submission.
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  {guestProfiles.map((profile) => (
                    <article
                      key={profile.id}
                      className="rounded-xl border border-stone-200 bg-white px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-semibold text-stone-900">
                            {profile.name || "Unnamed guest"}
                          </p>
                          <p className="text-sm text-stone-600">
                            {profile.short_bio || "Short bio not added yet."}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => startEditingGuestProfile(profile.id)}
                          className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                        >
                          Edit Artist Info
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleGuestProfileSubmit}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-stone-600">
                  {editingGuestProfileId
                    ? "Editing an existing artist entry."
                    : "Add a new artist entry for this show."}
                </div>
                {editingGuestProfileId ? (
                  <button
                    type="button"
                    onClick={resetGuestProfileForm}
                    className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    New Artist Info
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Name
                  <input
                    type="text"
                    name="name"
                    value={guestProfileFormState.name}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Your name"
                    required
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Hometown
                  <input
                    type="text"
                    name="hometown"
                    value={guestProfileFormState.hometown}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="City, State"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Short Bio
                <textarea
                  name="shortBio"
                  value={guestProfileFormState.shortBio}
                  onChange={handleGuestProfileChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Short promo bio"
                  required
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Full Bio
                <textarea
                  name="fullBio"
                  value={guestProfileFormState.fullBio}
                  onChange={handleGuestProfileChange}
                  className="min-h-32 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional longer bio"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Instruments
                  <input
                    type="text"
                    name="instruments"
                    value={guestProfileFormState.instruments}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Banjo, guitar, vocals"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Website
                  <input
                    type="text"
                    name="website"
                    value={guestProfileFormState.website}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="https://your-site.com"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Facebook
                  <input
                    type="text"
                    name="facebook"
                    value={guestProfileFormState.facebook}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Facebook profile or page"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Instagram
                  <input
                    type="text"
                    name="instagram"
                    value={guestProfileFormState.instagram}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Instagram handle or URL"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Photo Upload
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleGuestPhotoChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
                />
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="permissionGranted"
                  checked={guestProfileFormState.permissionGranted}
                  onChange={handleGuestProfileChange}
                  className="mt-1"
                />
                <span>I give permission to use this for promotion</span>
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSavingGuestProfile}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSavingGuestProfile
                    ? "Saving Artist Info..."
                    : editingGuestProfileId
                      ? "Save Artist Info Changes"
                      : "Save Artist Info"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {isAdminView && activeAdminTab === "guests" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Guest Profiles</h2>
                <p className="text-sm text-stone-600">
                  Promo bios and photos submitted for this show.
                </p>
              </div>
              <Link
                href={`/admin/${show.slug}/print/guests`}
                className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Print Guest Info
              </Link>
            </div>

            <SectionLoadWarning message={dataSectionErrors.guestProfiles} />

            {guestProfiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                No guest profiles submitted yet.
              </div>
            ) : (
              <div className="grid gap-4">
                {guestProfiles.map((profile) => {
                  const missingBio = !profile.short_bio;
                  const missingPhoto = !profile.photo_url;

                  return (
                    <article
                      key={profile.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        missingBio || missingPhoto
                          ? "border-amber-300 bg-amber-50"
                          : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-stone-900">
                              {profile.name || "Unnamed guest"}
                            </h3>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                                profile.permission_granted
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {profile.permission_granted
                                ? "Permission granted"
                                : "No permission"}
                            </span>
                            {missingBio || missingPhoto ? (
                              <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                                Missing submission
                              </span>
                            ) : null}
                          </div>

                          <p className="text-sm text-stone-700">
                            {profile.short_bio || "Short bio missing"}
                          </p>

                          <div className="grid gap-1 text-sm text-stone-600">
                            {profile.hometown ? <p>Hometown: {profile.hometown}</p> : null}
                            {profile.instruments ? (
                              <p>Instruments: {profile.instruments}</p>
                            ) : null}
                            {profile.full_bio ? <p>Full bio: {profile.full_bio}</p> : null}
                          </div>

                          <div className="flex flex-wrap gap-3 text-sm">
                            {profile.facebook ? (
                              <a
                                href={profile.facebook}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline"
                              >
                                Facebook
                              </a>
                            ) : null}
                            {profile.instagram ? (
                              <a
                                href={profile.instagram}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline"
                              >
                                Instagram
                              </a>
                            ) : null}
                            {profile.website ? (
                              <a
                                href={profile.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 underline"
                              >
                                Website
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex w-full max-w-[180px] flex-col gap-3">
                          {profile.photo_url ? (
                            <img
                              src={profile.photo_url}
                              alt={`${profile.name || "Guest"} promo`}
                              className="h-40 w-full rounded-xl border border-stone-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-sm text-stone-500">
                              No photo
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteGuestProfile(profile.id)}
                            disabled={activePendingActionId === `guest-${profile.id}`}
                            className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                          >
                            Delete Guest
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {isAdminView && activeAdminTab === "songs" ? (
          <section className="print-hidden flex flex-col gap-3 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Setlist Builder</h2>
              <p className="text-sm text-stone-600">
                Build the official setlist from the library and this show&apos;s guest songs.
              </p>
            </div>
            <SectionLoadWarning message={dataSectionErrors.guestSongs || dataSectionErrors.songLibrary} />
          </section>
        ) : null}

        {shouldShowBandSongTools ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Song Suggestions</h2>
                <p className="text-sm text-stone-600">
                  Open the song suggestion form when you want to add a reusable library song.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBandSongFormOpen(true)}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 sm:w-auto"
              >
                + Suggest a Song
              </button>
            </div>
          </section>
        ) : null}

        {shouldShowGuestSongsTab ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Song Submission</h2>
                <p className="text-sm text-stone-600">
                  Choose a guest here, then review and submit songs for that guest.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsGuestSongFormOpen(true)}
                disabled={!canOpenGuestSongForm}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400 sm:w-auto"
              >
                Submit a Song
              </button>
            </div>

            {shouldShowGuestProfileSelector ? (
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Select Guest
                <select
                  value={selectedGuestProfile?.id ?? ""}
                  onChange={handleSelectedGuestProfileChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                >
                  <option value="">Choose a guest</option>
                  {guestProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name || "Unnamed guest"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-stone-900">Submitted Guest Songs</h3>
                <p className="text-sm text-stone-600">
                  {selectedGuestProfile?.name
                    ? `Review and update songs already submitted for ${selectedGuestProfile.name} on this show.`
                    : guestProfiles.length > 1
                      ? "Choose a guest above to review that guest's submitted songs."
                      : "Review and update guest-submitted songs for this show."}
                </p>
              </div>

              {guestSubmittedSongs.length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">
                  {guestProfiles.length > 1 && !selectedGuestProfile
                    ? "Choose a guest above to see that guest's submitted songs."
                    : "No songs submitted yet. The first song will appear here after it is sent."}
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  {guestSubmittedSongs.map((song, songIndex) => (
                    <article
                      key={song.id}
                      className="rounded-xl border border-stone-200 bg-white px-4 py-4"
                    >
                      {editingPoolSongId === song.id ? (
                        <div className="grid gap-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Song Title
                              <input
                                type="text"
                                name="title"
                                value={poolSongEditFormState.title}
                                onChange={handlePoolSongEditChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                required
                              />
                            </label>
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Guest
                              <input
                                type="text"
                                value={song.submitted_by_name ?? guestSingerName}
                                readOnly
                                className="rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-sm text-stone-700 outline-none"
                                placeholder="Singer name"
                              />
                            </label>
                          </div>

                          <p className="text-sm text-stone-600">
                            This song stays linked to the selected guest so it remains in the
                            correct guest song list.
                          </p>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Key
                            <input
                              type="text"
                              name="key"
                              value={poolSongEditFormState.key}
                              onChange={handlePoolSongEditChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Optional key"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Tempo
                            <select
                              name="tempo"
                              value={poolSongEditFormState.tempo}
                              onChange={handlePoolSongEditChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            >
                              <option value="">Not set</option>
                              <option value="fast">Fast</option>
                              <option value="medium">Medium</option>
                              <option value="slow">Slow</option>
                            </select>
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Song Type
                            <select
                              name="songType"
                              value={poolSongEditFormState.songType}
                              onChange={handlePoolSongEditChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            >
                              <option value="">Not set</option>
                              <option value="vocal">Vocal</option>
                              <option value="instrumental">Instrumental</option>
                            </select>
                          </label>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => handleSavePoolSong(song.id)}
                              disabled={activePendingActionId === song.id}
                              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                            >
                              Save Song
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelPoolSongEdit}
                              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-stone-900">
                                {songIndex + 1}. {song.title}
                              </p>
                              <p className="text-sm text-stone-600">
                                {song.artist || guestSingerName}
                                {song.song_key ? ` • Key: ${song.song_key}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartEditingPoolSong(song.id)}
                              disabled={activePendingActionId === song.id}
                              className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Edit Song
                            </button>
                          </div>

                          {song.notes ? (
                            <p className="text-sm text-stone-600">{song.notes}</p>
                          ) : null}

                          {song.lyrics ? (
                            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Lyrics
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                                {song.lyrics}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {shouldShowSongSubmissionForm ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{formHeading}</h2>
              <p className="text-sm text-stone-600">Add a reusable song to the library.</p>
            </div>

            <form
              className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Song Title
                  <input
                    type="text"
                    name="title"
                    value={formState.title}
                    onChange={handleChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Enter song title"
                    required
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Key
                <input
                  type="text"
                  name="key"
                  value={formState.key}
                  onChange={handleChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional key"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Tempo
                  <select
                    name="tempo"
                    value={formState.tempo}
                    onChange={handleChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  >
                    <option value="">Not set</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium</option>
                    <option value="slow">Slow</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Song Type
                  <select
                    name="songType"
                    value={formState.songType}
                    onChange={handleChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  >
                    <option value="">Not set</option>
                    <option value="vocal">Vocal</option>
                    <option value="instrumental">Instrumental</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Notes
                <textarea
                  name="notes"
                  value={formState.notes}
                  onChange={handleChange}
                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional notes for the setlist side"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Lyrics
                <textarea
                  name="lyrics"
                  value={formState.lyrics}
                  onChange={handleChange}
                  className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional lyrics"
                />
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSubmitting ? "Submitting..." : "Add to Library"}
                </button>
              </div>
            </form>

            {false ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-stone-900">Submitted Guest Songs</h3>
                  <p className="text-sm text-stone-600">
                    {selectedGuestProfile?.name
                      ? `Review and update songs already submitted for ${selectedGuestProfile?.name} on this show.`
                      : guestProfiles.length > 1
                        ? "Select a guest above to review that guest's submitted songs."
                        : "Review and update guest-submitted songs for this show."}
                  </p>
                </div>

                {guestSubmittedSongs.length === 0 ? (
                  <p className="mt-4 text-sm text-stone-500">
                    {guestProfiles.length > 1 && !selectedGuestProfile
                      ? "Choose a guest to view that guest's submitted songs."
                      : "No songs submitted yet. The first song will appear here after it is sent."}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    {guestSubmittedSongs.map((song, songIndex) => (
                      <article
                        key={song.id}
                        className="rounded-xl border border-stone-200 bg-white px-4 py-4"
                      >
                        {editingPoolSongId === song.id ? (
                          <div className="grid gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Song Title
                                <input
                                  type="text"
                                  name="title"
                                  value={poolSongEditFormState.title}
                                  onChange={handlePoolSongEditChange}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  required
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Guest
                                <input
                                  type="text"
                                  value={song.submitted_by_name ?? guestSingerName}
                                  readOnly
                                  className="rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-sm text-stone-700 outline-none"
                                  placeholder="Singer name"
                                />
                              </label>
                            </div>

                            <p className="text-sm text-stone-600">
                              This song stays linked to the selected guest so it remains in the
                              correct guest song list.
                            </p>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Key
                              <input
                                type="text"
                                name="key"
                                value={poolSongEditFormState.key}
                                onChange={handlePoolSongEditChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Optional key"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Tempo
                              <select
                                name="tempo"
                                value={poolSongEditFormState.tempo}
                                onChange={handlePoolSongEditChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              >
                                <option value="">Not set</option>
                                <option value="fast">Fast</option>
                                <option value="medium">Medium</option>
                                <option value="slow">Slow</option>
                              </select>
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Song Type
                              <select
                                name="songType"
                                value={poolSongEditFormState.songType}
                                onChange={handlePoolSongEditChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              >
                                <option value="">Not set</option>
                                <option value="vocal">Vocal</option>
                                <option value="instrumental">Instrumental</option>
                              </select>
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handleSavePoolSong(song.id)}
                                disabled={activePendingActionId === song.id}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                Save Song
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelPoolSongEdit}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-stone-900">
                                  {songIndex + 1}. {song.title}
                                </p>
                                <p className="text-sm text-stone-600">
                                  {song.artist || guestSingerName}
                                  {song.song_key ? ` • Key: ${song.song_key}` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleStartEditingPoolSong(song.id)}
                                disabled={activePendingActionId === song.id}
                                className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit Song
                              </button>
                            </div>

                            {song.notes ? (
                              <p className="text-sm text-stone-600">{song.notes}</p>
                            ) : null}

                            {song.lyrics ? (
                              <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                  Lyrics
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                                  {song.lyrics}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {shouldShowBandSongTools && isBandSongFormOpen ? (
          <div className="print-hidden fixed inset-0 z-50 flex items-end bg-stone-950/50 sm:items-center sm:justify-center">
            <button
              type="button"
              aria-label="Close suggest a song form"
              onClick={() => setIsBandSongFormOpen(false)}
              className="absolute inset-0 cursor-default"
            />

            <section className="relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold">Suggest a Song</h2>
                  <p className="text-sm text-stone-600">
                    Add a reusable song to the library without leaving the Songs tab.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBandSongFormOpen(false)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  Close
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-5 sm:px-6">
                <form className="grid gap-4" onSubmit={handleSubmit}>
                  <div className="grid gap-4">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Song Title
                      <input
                        type="text"
                        name="title"
                        value={formState.title}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Enter song title"
                        required
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Key
                    <input
                      type="text"
                      name="key"
                      value={formState.key}
                      onChange={handleChange}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Optional key"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Tempo
                      <select
                        name="tempo"
                        value={formState.tempo}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Not set</option>
                        <option value="fast">Fast</option>
                        <option value="medium">Medium</option>
                        <option value="slow">Slow</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Song Type
                      <select
                        name="songType"
                        value={formState.songType}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Not set</option>
                        <option value="vocal">Vocal</option>
                        <option value="instrumental">Instrumental</option>
                      </select>
                    </label>
                  </div>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Notes
                    <textarea
                      name="notes"
                      value={formState.notes}
                      onChange={handleChange}
                      className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Optional notes for the setlist side"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Lyrics
                    <textarea
                      name="lyrics"
                      value={formState.lyrics}
                      onChange={handleChange}
                      className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Optional lyrics"
                    />
                  </label>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {isSubmitting ? "Submitting..." : "Add to Library"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBandSongFormOpen(false)}
                      className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        ) : null}

        {shouldShowGuestSongsTab && isGuestSongFormOpen ? (
          <div className="print-hidden fixed inset-0 z-50 flex items-end bg-stone-950/50 sm:items-center sm:justify-center">
            <button
              type="button"
              aria-label="Close guest song submission form"
              onClick={() => setIsGuestSongFormOpen(false)}
              className="absolute inset-0 cursor-default"
            />

            <section className="relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold">Submit a Song</h2>
                  <p className="text-sm text-stone-600">
                    Add one or more songs for this show using the same guest submission flow.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsGuestSongFormOpen(false)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  Close
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-5 sm:px-6">
                <form className="grid gap-4" onSubmit={handleSubmit}>
                  <div className="grid gap-4">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Song Title
                      <input
                        type="text"
                        name="title"
                        value={formState.title}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Enter song title"
                        required
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                    {guestProfiles.length === 0 ? (
                      <p>Please complete guest info first before submitting songs.</p>
                    ) : selectedGuestProfile ? (
                      <p>
                        This song will be submitted for {selectedGuestProfile.name || "your guest profile"}.
                      </p>
                    ) : (
                      <p>Choose a guest from the Songs tab before submitting a song.</p>
                    )}
                    <p>You can submit multiple songs for this show. Each one will be saved as its own entry.</p>
                  </div>

                  {selectedGuestProfile ? (
                    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Selected Guest
                      </p>
                      <p className="mt-1 text-sm font-medium text-stone-900">
                        {selectedGuestProfile.name || "Guest"}
                      </p>
                    </div>
                  ) : null}

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Key
                    <input
                      type="text"
                      name="key"
                      value={formState.key}
                      onChange={handleChange}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="Optional key"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Tempo
                      <select
                        name="tempo"
                        value={formState.tempo}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Not set</option>
                        <option value="fast">Fast</option>
                        <option value="medium">Medium</option>
                        <option value="slow">Slow</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Song Type
                      <select
                        name="songType"
                        value={formState.songType}
                        onChange={handleChange}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Not set</option>
                        <option value="vocal">Vocal</option>
                        <option value="instrumental">Instrumental</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="submit"
                      disabled={isSubmitting || isGuestSongSubmissionBlocked || requiresGuestSelection}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Song"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsGuestSongFormOpen(false)}
                      className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        ) : null}

        {isAdminView && activeAdminTab === "songs" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Guest Songs for This Show</h2>
              <p className="text-sm text-stone-600">
                Guest-submitted songs stay attached to this show and can still be added to the setlist.
              </p>
            </div>
            <SectionLoadWarning message={dataSectionErrors.guestSongs} />

            {visibleGuestSongs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                No guest songs have been submitted for this show yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleGuestSongs.map((song) => (
                <article
                  key={song.id}
                  className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                >
                  {editingPoolSongId === song.id ? (
                    <div className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Song Title
                          <input
                            type="text"
                            name="title"
                            value={poolSongEditFormState.title}
                            onChange={handlePoolSongEditChange}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            required
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Guest
                          <input
                            type="text"
                            value={song.submitted_by_name ?? ""}
                            readOnly
                            className="rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-sm text-stone-700 outline-none"
                            placeholder="Guest name"
                          />
                        </label>
                      </div>

                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Key
                        <input
                          type="text"
                          name="key"
                          value={poolSongEditFormState.key}
                          onChange={handlePoolSongEditChange}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          placeholder="Optional key"
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Tempo
                          <select
                            name="tempo"
                            value={poolSongEditFormState.tempo}
                            onChange={handlePoolSongEditChange}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          >
                            <option value="">Not set</option>
                            <option value="fast">Fast</option>
                            <option value="medium">Medium</option>
                            <option value="slow">Slow</option>
                          </select>
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Song Type
                          <select
                            name="songType"
                            value={poolSongEditFormState.songType}
                            onChange={handlePoolSongEditChange}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          >
                            <option value="">Not set</option>
                            <option value="vocal">Vocal</option>
                            <option value="instrumental">Instrumental</option>
                          </select>
                        </label>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleSavePoolSong(song.id)}
                          disabled={activePendingActionId === song.id}
                          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                        >
                          Save Song
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelPoolSongEdit}
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-semibold text-stone-900">
                          {song.title}
                        </h3>
                        <p className="text-sm text-stone-700">
                          {getDisplaySingerName(song.artist)}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 text-sm text-stone-600">
                        {song.song_key ? <p>Key: {song.song_key}</p> : null}
                        {song.notes ? (
                          <p className="whitespace-pre-wrap">
                            Notes: {renderTextWithLinks(song.notes)}
                          </p>
                        ) : null}
                      </div>

                      {song.lyrics ? (
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                          Lyrics included
                        </p>
                      ) : null}

                      {canEditPoolSong() || viewMode === "admin" ? (
                        <div className="mt-4 flex flex-col gap-3">
                          {canEditPoolSong() ? (
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handleStartEditingPoolSong(song.id)}
                                disabled={activePendingActionId === song.id}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit Song
                              </button>
                            </div>
                          ) : null}

                          {viewMode === "admin" ? (
                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleAddPoolSongToSection(song, "set1")}
                                disabled={activePendingActionId === song.id}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                Add to Set 1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddPoolSongToSection(song, "set2")}
                                disabled={activePendingActionId === song.id}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Add to Set 2
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddPoolSongToSection(song, "encore")}
                                disabled={activePendingActionId === song.id}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Add to Encore
                              </button>
                            </div>
                          ) : null}

                          {viewMode === "admin" ? (
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() =>
                                  normalizeSubmittedByRole(song.submitted_by_role) === "guest"
                                    ? handleDeleteGuestSong(song.id)
                                    : handleDeleteFromSongPool(song.id)
                                }
                                disabled={activePendingActionId === song.id}
                                className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                              >
                                Delete Song
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {shouldShowBandSongTools || (isAdminView && activeAdminTab === "songs") ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Song Library</h2>
              <p className="text-sm text-stone-600">
                Reusable songs collected from past band and admin submissions.
              </p>
            </div>
            <SectionLoadWarning message={dataSectionErrors.songLibrary} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Filter by Tempo
                <select
                  value={libraryTempoFilter}
                  onChange={(event) => setLibraryTempoFilter(event.target.value as "" | SongTempo)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                >
                  <option value="">All tempos</option>
                  <option value="fast">Fast</option>
                  <option value="medium">Medium</option>
                  <option value="slow">Slow</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Filter by Song Type
                <select
                  value={librarySongTypeFilter}
                  onChange={(event) => setLibrarySongTypeFilter(event.target.value as "" | SongType)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                >
                  <option value="">All song types</option>
                  <option value="vocal">Vocal</option>
                  <option value="instrumental">Instrumental</option>
                </select>
              </label>
            </div>

            {filteredSongLibrary.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                {songLibrary.length === 0
                  ? "No reusable songs saved yet. Band and admin submissions will build the library over time."
                  : "No library songs match the current filters."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredSongLibrary.map((song) => (
                  <article
                    key={song.id}
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                  >
                    {editingLibrarySongId === song.id ? (
                      <div className="grid gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Song Title
                            <input
                              type="text"
                              name="title"
                              value={librarySongEditFormState.title}
                              onChange={handleLibrarySongEditChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              required
                            />
                          </label>
                          <div className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            <span>Created By</span>
                            <div className="rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-sm text-stone-700">
                              {formatLibrarySourceRole(song.source_role)}
                            </div>
                          </div>
                        </div>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Key
                          <input
                            type="text"
                            name="key"
                            value={librarySongEditFormState.key}
                            onChange={handleLibrarySongEditChange}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            placeholder="Optional key"
                          />
                        </label>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Tempo
                            <select
                              name="tempo"
                              value={librarySongEditFormState.tempo}
                              onChange={handleLibrarySongEditChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            >
                              <option value="">Not set</option>
                              <option value="fast">Fast</option>
                              <option value="medium">Medium</option>
                              <option value="slow">Slow</option>
                            </select>
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Song Type
                            <select
                              name="songType"
                              value={librarySongEditFormState.songType}
                              onChange={handleLibrarySongEditChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            >
                              <option value="">Not set</option>
                              <option value="vocal">Vocal</option>
                              <option value="instrumental">Instrumental</option>
                            </select>
                          </label>
                        </div>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Notes
                          <textarea
                            name="notes"
                            value={librarySongEditFormState.notes ?? ""}
                            onChange={handleLibrarySongEditChange}
                            className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            placeholder="Optional notes for the setlist side"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Lyrics
                          <textarea
                            name="lyrics"
                            value={librarySongEditFormState.lyrics ?? ""}
                            onChange={handleLibrarySongEditChange}
                            className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            placeholder="Optional lyrics"
                          />
                        </label>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => handleSaveLibrarySong(song.id)}
                            disabled={activeSetlistActionId === song.id}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                          >
                            Save Song
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelLibrarySongEdit}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex flex-col gap-1">
                            <h3 className="text-base font-semibold text-stone-900">{song.title}</h3>
                          </div>
                          <span className="w-fit rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                            Source: {formatLibrarySourceRole(song.source_role)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 text-sm text-stone-600">
                          {song.song_key ? <p>Key: {song.song_key}</p> : null}
                          {song.tempo ? <p>Tempo: {song.tempo}</p> : null}
                          {song.song_type ? <p>Type: {song.song_type}</p> : null}
                          {song.notes?.trim() ? (
                            <p className="whitespace-pre-wrap">
                              Notes: {renderTextWithLinks(song.notes)}
                            </p>
                          ) : null}
                        </div>

                        {canEditLibrarySong(song) || viewMode === "admin" ? (
                          <div className="mt-4 flex flex-col gap-3">
                            {canEditLibrarySong(song) ? (
                              <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditingLibrarySong(song.id)}
                                  disabled={activeSetlistActionId === song.id}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Edit Song
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleLibraryLyrics(song.id)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  {openLibraryLyricsSongId === song.id ? "Hide Lyrics" : "View Lyrics"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintLibrarySong(song)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Print Lyrics
                                </button>
                              </div>
                            ) : null}

                            {viewMode === "admin" ? (
                              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleAddLibrarySongToSection(song, "set1")}
                                  disabled={activeSetlistActionId === song.id}
                                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                >
                                  Add to Set 1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddLibrarySongToSection(song, "set2")}
                                  disabled={activeSetlistActionId === song.id}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Add to Set 2
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddLibrarySongToSection(song, "encore")}
                                  disabled={activeSetlistActionId === song.id}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Add to Encore
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {openLibraryLyricsSongId === song.id ? (
                          <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Lyrics
                              </p>
                              <button
                                type="button"
                                onClick={() => handlePrintLibrarySong(song)}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Print
                              </button>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                              {song.lyrics?.trim() || "No lyrics added yet."}
                            </p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}
