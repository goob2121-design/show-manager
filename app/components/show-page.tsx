"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import {
  buildBlockNoteDrafts,
  buildMcFlowItems,
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
import type {
  FinanceItemFormState,
  FinanceItemType,
  GuestProfile,
  GuestProfileFormState,
  McBlockNote,
  PayoutFormState,
  PotentialSponsor,
  PotentialSponsorStatus,
  PromoMaterial,
  PromoMaterialCategory,
  PromoMaterialFormState,
  SetSection,
  SponsorTypeOption,
  SetlistEntry,
  ShowGuestSong,
  ShowFinanceItem,
  ShowSponsor,
  SongRecord,
  SponsorLibraryEntry,
  SponsorLibraryFormState,
  ShowSponsorAssignmentFormState,
  ShowDetailsFormState,
  ShowPayoutItem,
  ShowRecord,
  ShowChecklistItem,
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
  mp3_path: string | null;
  submitted_by_role: "guest";
};

type SongLibrarySong = SongRecord & {
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  mp3_path: string | null;
  source_role: SongRecord["created_by_role"];
};

type SetlistSong = SetlistEntry & {
  set_section: SetSection;
  artist: string | null;
  song_key: string | null;
  notes: string | null;
  lyrics: string | null;
  mp3_path: string | null;
  source_role: string | null;
};

type PrintMode = "stage" | "band" | "standard";
type AdminTab =
  | "overview"
  | "setlist"
  | "songs"
  | "guests"
  | "finance"
  | "promo-materials"
  | "sponsors"
  | "mc-builder"
  | "show-details";
type BandTab = "setlist" | "songs" | "itinerary" | "promo-materials";
type GuestTab = "welcome" | "songs" | "artist-info" | "itinerary" | "promo-materials";
type SponsorAdminTab = "library" | "show";
type FinanceAdminSubTab = "reporting" | "payouts";
type SetlistSectionConfig = {
  key: SetSection;
  title: string;
  optional?: boolean;
};

const adminTabItems: Array<{ key: AdminTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "setlist", label: "Setlist" },
  { key: "songs", label: "Songs" },
  { key: "guests", label: "Guests" },
  { key: "finance", label: "Finance" },
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
  { key: "welcome", label: "Welcome" },
  { key: "artist-info", label: "Artist Info" },
  { key: "itinerary", label: "Itinerary" },
  { key: "songs", label: "Songs" },
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

const financeAdminSubTabItems: Array<{
  key: FinanceAdminSubTab;
  label: string;
  description: string;
}> = [
  {
    key: "reporting",
    label: "Reporting",
    description: "Current show finance and yearly reporting tools.",
  },
  {
    key: "payouts",
    label: "Payout Sheet",
    description: "Night-of-show payout tracking and printing.",
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
  chartUrl: "",
};

const initialGuestProfileFormState: GuestProfileFormState = {
  name: "",
  shortBio: "",
  fullBio: "",
  hometown: "",
  instruments: "",
  email: "",
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

const DEFAULT_GUEST_WELCOME_MESSAGE_INTRO =
  "Welcome to the Cumberland Mountain Music Show!";

const initialPromoMaterialFormState: PromoMaterialFormState = {
  title: "",
  description: "",
  category: "other",
  isVisible: true,
};

const initialFinanceItemFormState: FinanceItemFormState = {
  label: "",
  category: "",
  amount: "",
  notes: "",
};

const initialPayoutFormState: PayoutFormState = {
  payeeName: "",
  category: "",
  description: "",
  amount: "",
  paid: false,
  paymentMethod: "",
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

const financeCategoryOptions: Record<FinanceItemType, string[]> = {
  income: [
    "Presale Tickets",
    "Door Sales",
    "Sponsorships",
    "Donations",
    "Merch Percentage",
    "Concessions",
    "Misc Income",
  ],
  expense: [
    "Guest / Talent Pay",
    "House Band Pay",
    "Facebook Ads",
    "Printing",
    "Sponsor Signs",
    "Venue Costs",
    "Concessions",
    "Sound / Production",
    "Misc Expense",
  ],
};

const payoutCategoryOptions = [
  "Band",
  "MC",
  "Guest",
  "Sound",
  "Production",
  "Food / Hospitality",
  "Printing / Signs",
  "Other Expense",
] as const;

const payoutPaymentMethodOptions = ["Cash", "Check", "Venmo", "Other"] as const;

const defaultSingerName = "CMMS Band";
const stageflowPortalVersion = "StageFlow v1.0.15";
const SONG_AUDIO_BUCKET = "promo-materials";
const MAX_SONG_MP3_BYTES = 30 * 1024 * 1024;
const MP3_PATH_MARKER_PATTERN = /\[\[MP3_PATH:([^\]]+)\]\]/;
const urlPattern = /(https?:\/\/[^\s]+)/g;
const urlOnlyPattern = /^https?:\/\/[^\s]+$/;
const chartUrlPattern = /^https?:\/\/[^\s]+$/i;

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

function appendReferenceUrlToNotes(
  notes: string | null | undefined,
  referenceUrl: string | null | undefined,
) {
  const cleanedNotes = notes?.trim() ?? "";
  const cleanedUrl = referenceUrl?.trim() ?? "";

  if (!cleanedUrl) {
    return cleanedNotes || null;
  }

  if (cleanedNotes.includes(cleanedUrl)) {
    return cleanedNotes;
  }

  return cleanedNotes ? `${cleanedNotes}\n\n${cleanedUrl}` : cleanedUrl;
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
  chartUrl?: string;
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

type McSponsorPlacementRenderableItem =
  | {
      kind: "song";
      id: string;
      song: SetlistSong;
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

type SponsorDocumentFormState = {
  sponsorshipLevel: string;
  sponsorshipAmount: string;
  paymentStatus: string;
  proposalCoverage: "current-show" | "season-year" | "custom";
  proposalYear: string;
  proposalCustomCoverage: string;
};

type SponsorProposalGeneratorFormState = {
  businessName: string;
  contactName: string;
  sponsorshipLevel: string;
  amount: string;
  notes: string;
  proposalCoverage: "current-show" | "season-year" | "custom";
  proposalYear: string;
  proposalCustomCoverage: string;
};

type PotentialSponsorFormState = {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  status: PotentialSponsorStatus;
  notes: string;
};

const initialSponsorLibraryFormState: SponsorLibraryFormState = {
  name: "",
  shortMessage: "",
  fullMessage: "",
  website: "",
  logoUrl: "",
  sponsorType: "",
  defaultContribution: "",
  estimatedValue: "",
  recognitionNotes: "",
};

const initialSponsorDocumentFormState: SponsorDocumentFormState = {
  sponsorshipLevel: "",
  sponsorshipAmount: "",
  paymentStatus: "prospect",
  proposalCoverage: "current-show",
  proposalYear: String(new Date().getFullYear()),
  proposalCustomCoverage: "",
};

const initialSponsorProposalGeneratorFormState: SponsorProposalGeneratorFormState = {
  businessName: "",
  contactName: "",
  sponsorshipLevel: "Gold Sponsor",
  amount: "",
  notes: "",
  proposalCoverage: "current-show",
  proposalYear: String(new Date().getFullYear()),
  proposalCustomCoverage: "",
};

const potentialSponsorStatusOptions: PotentialSponsorStatus[] = [
  "Not Contacted",
  "Contacted",
  "Interested",
  "Follow Up",
  "Became Sponsor",
  "Passed",
];

const initialPotentialSponsorFormState: PotentialSponsorFormState = {
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  status: "Not Contacted",
  notes: "",
};

const initialShowSponsorAssignmentFormState: ShowSponsorAssignmentFormState = {
  sponsorId: "",
  placementType: "",
  linkedPerformer: "",
  customNote: "",
  sponsorType: "",
  defaultContribution: "",
  estimatedValue: "",
  recognitionNotes: "",
};

const sponsorTypeOptions: SponsorTypeOption[] = [
  "Cash Package",
  "In-Kind / Product Donation",
  "Food & Beverage",
  "Service Trade",
  "Giveaway / Prize",
  "Printing / Media",
  "Custom",
];

const showChecklistQuickAddTasks = [
  "Post Facebook flyer/ad",
  "Put out banners/signs",
  "Contact printers",
  "Order sponsor signs",
  "Order pizza",
  "Pick up drinks",
  "Print sponsor logo sheet",
  "Confirm sponsors",
] as const;

const sponsorPlacementOptions = [
  { value: "", label: "Flexible / not set" },
  { value: "before_performer", label: "Before Performer Block" },
  { value: "after_performer", label: "After Performer Block" },
  { value: "before_intermission", label: "Before Intermission" },
  { value: "after_intermission", label: "After Intermission" },
  { value: "closing", label: "Closing Section" },
] as const;

const sponsorDocumentLevelOptions = [
  { value: "Platinum Sponsor", label: "Platinum Sponsor" },
  { value: "Gold Sponsor", label: "Gold Sponsor" },
  { value: "Silver Sponsor", label: "Silver Sponsor" },
  { value: "Custom", label: "Custom" },
] as const;

const sponsorPaymentStatusOptions = [
  { value: "prospect", label: "Prospect" },
  { value: "quoted", label: "Quoted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "paid", label: "Paid" },
] as const;

function getDefaultSponsorTierAmount(level: string) {
  switch (level) {
    case "Platinum Sponsor":
      return "500";
    case "Gold Sponsor":
      return "250";
    case "Silver Sponsor":
      return "100";
    default:
      return null;
  }
}

function buildProposalCoverageLabel({
  coverage,
  year,
  customCoverage,
  showName,
  showDate,
}: {
  coverage: "current-show" | "season-year" | "custom";
  year: string;
  customCoverage: string;
  showName: string;
  showDate: string | null;
}) {
  if (coverage === "season-year") {
    const seasonYear = year.trim() || String(new Date().getFullYear());
    return `${seasonYear} Season`;
  }

  if (coverage === "custom") {
    return customCoverage.trim() || "Custom Sponsorship Coverage";
  }

  const showDateLabel = formatShowDate(showDate);

  if (showName.trim() && showDateLabel && showDateLabel !== "Date TBD") {
    return `${showName.trim()} — ${showDateLabel}`;
  }

  return showName.trim() || showDateLabel || "Current Show";
}

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

function getDaysUntilDate(targetDate: string | null) {
  if (!targetDate) {
    return null;
  }

  const today = new Date();
  const startOfTodayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const targetUtc = Date.parse(`${targetDate}T00:00:00Z`);

  if (Number.isNaN(targetUtc)) {
    return null;
  }

  return Math.floor((targetUtc - startOfTodayUtc) / (1000 * 60 * 60 * 24));
}

function buildShowReminderSummary(showDate: string | null) {
  const daysUntilShow = getDaysUntilDate(showDate);

  if (daysUntilShow === null) {
    return null;
  }

  const facebookReminderDays = daysUntilShow - 30;
  const bannerReminderDays = daysUntilShow - 14;

  return {
    daysUntilShow,
    facebookReminderDays,
    bannerReminderDays,
    isFacebookReminderActive: facebookReminderDays <= 0,
    isBannerReminderActive: bannerReminderDays <= 0,
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatProfitMargin(totalIncome: number, netProfit: number) {
  if (totalIncome <= 0) {
    return null;
  }

  return `${((netProfit / totalIncome) * 100).toFixed(1)}%`;
}

function formatShowDateWithOrdinal(showDate: string | null) {
  if (!showDate) {
    return null;
  }

  const date = new Date(`${showDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const day = date.getUTCDate();
  const ordinalSuffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";

  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(date);

  return `${month} ${day}${ordinalSuffix}`;
}

function normalizeMcPlacementName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getMcFlowMarkerLabel(
  marker: "before-intermission" | "after-intermission" | "closing" | "flexible",
) {
  switch (marker) {
    case "before-intermission":
      return "Before Intermission";
    case "after-intermission":
      return "After Intermission";
    case "closing":
      return "Closing Section";
    case "flexible":
      return "Flexible Placement";
    default:
      return "MC Marker";
  }
}

function formatMcBlockSectionLabel(section: SetSection) {
  switch (section) {
    case "set1":
      return "Set 1";
    case "set2":
      return "Set 2";
    case "encore":
      return "Encore";
    default:
      return "Set";
  }
}

function sortShowSponsorsByPlacement(sponsors: ShowSponsor[]) {
  return [...sponsors].sort((sponsorA, sponsorB) => {
    if (sponsorA.placement_order !== sponsorB.placement_order) {
      return sponsorA.placement_order - sponsorB.placement_order;
    }

    return sponsorA.created_at.localeCompare(sponsorB.created_at);
  });
}

function findSetlistSongIndexByAnchorSongId(songs: SetlistSong[], anchorSongId: string | null) {
  if (!anchorSongId) {
    return null;
  }

  const matchIndex = songs.findIndex((song) => song.id === anchorSongId);
  return matchIndex >= 0 ? matchIndex : null;
}

function findMatchingSetlistSongIndex(
  songs: SetlistSong[],
  linkedPerformer: string | null,
  fallbackIndex: number,
) {
  if (songs.length === 0) {
    return null;
  }

  const normalizedPerformer = normalizeMcPlacementName(linkedPerformer);

  if (!normalizedPerformer) {
    return fallbackIndex;
  }

  const exactMatchIndex = songs.findIndex(
    (song) => normalizeMcPlacementName(song.artist) === normalizedPerformer,
  );

  if (exactMatchIndex >= 0) {
    return exactMatchIndex;
  }

  const partialMatchIndex = songs.findIndex((song) => {
    const normalizedSongPerformer = normalizeMcPlacementName(song.artist);

    return (
      normalizedSongPerformer.includes(normalizedPerformer) ||
      normalizedPerformer.includes(normalizedSongPerformer)
    );
  });

  if (partialMatchIndex >= 0) {
    return partialMatchIndex;
  }

  return fallbackIndex;
}

function buildAdminMcSponsorPlacementItems(setlist: SetlistSong[], sponsors: ShowSponsor[]) {
  const orderedSongs = sortSetlistSongs(setlist);
  const orderedSponsors = sortShowSponsorsByPlacement(sponsors);
  const beforeBySongId: Record<string, ShowSponsor[]> = {};
  const afterBySongId: Record<string, ShowSponsor[]> = {};
  const beforeIntermission: ShowSponsor[] = [];
  const afterIntermission: ShowSponsor[] = [];
  const closing: ShowSponsor[] = [];
  const flexible: ShowSponsor[] = [];

  function appendSponsor(
    lookup: Record<string, ShowSponsor[]>,
    songId: string,
    sponsor: ShowSponsor,
  ) {
    if (!lookup[songId]) {
      lookup[songId] = [];
    }

    lookup[songId].push(sponsor);
  }

  orderedSponsors.forEach((sponsor) => {
    const placementType = sponsor.placement_type;

    if (placementType === "before_intermission") {
      beforeIntermission.push(sponsor);
      return;
    }

    if (placementType === "after_intermission") {
      afterIntermission.push(sponsor);
      return;
    }

    if (placementType === "closing") {
      closing.push(sponsor);
      return;
    }

    if (placementType === "before_performer") {
      const targetIndex =
        findSetlistSongIndexByAnchorSongId(orderedSongs, sponsor.mc_anchor_song_id) ??
        findMatchingSetlistSongIndex(orderedSongs, sponsor.linked_performer, 0);

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(beforeBySongId, orderedSongs[targetIndex].id, sponsor);
      return;
    }

    if (placementType === "after_performer") {
      const targetIndex =
        findSetlistSongIndexByAnchorSongId(orderedSongs, sponsor.mc_anchor_song_id) ??
        findMatchingSetlistSongIndex(
          orderedSongs,
          sponsor.linked_performer,
          Math.max(orderedSongs.length - 1, 0),
        );

      if (targetIndex === null) {
        flexible.push(sponsor);
        return;
      }

      appendSponsor(afterBySongId, orderedSongs[targetIndex].id, sponsor);
      return;
    }

    flexible.push(sponsor);
  });

  const items: McSponsorPlacementRenderableItem[] = [];
  const set1Songs = orderedSongs.filter((song) => song.section === "set1");
  const set2Songs = orderedSongs.filter((song) => song.section === "set2");
  const encoreSongs = orderedSongs.filter((song) => song.section === "encore");

  function appendSongsWithSponsors(songs: SetlistSong[]) {
    songs.forEach((song) => {
      (beforeBySongId[song.id] ?? []).forEach((sponsor) => {
        items.push({
          kind: "sponsor",
          id: `before-song-${song.id}-${sponsor.id}`,
          sponsor,
        });
      });

      items.push({
        kind: "song",
        id: song.id,
        song,
      });

      (afterBySongId[song.id] ?? []).forEach((sponsor) => {
        items.push({
          kind: "sponsor",
          id: `after-song-${song.id}-${sponsor.id}`,
          sponsor,
        });
      });
    });
  }

  appendSongsWithSponsors(set1Songs);

  if (beforeIntermission.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-before-intermission",
      marker: "before-intermission",
    });
    beforeIntermission.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `before-intermission-${sponsor.id}`,
        sponsor,
      });
    });
  }

  if (afterIntermission.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-after-intermission",
      marker: "after-intermission",
    });
    afterIntermission.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `after-intermission-${sponsor.id}`,
        sponsor,
      });
    });
  }

  appendSongsWithSponsors(set2Songs);
  appendSongsWithSponsors(encoreSongs);

  if (closing.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-closing",
      marker: "closing",
    });
    closing.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `closing-${sponsor.id}`,
        sponsor,
      });
    });
  }

  if (flexible.length > 0) {
    items.push({
      kind: "marker",
      id: "placement-marker-flexible",
      marker: "flexible",
    });
    flexible.forEach((sponsor) => {
      items.push({
        kind: "sponsor",
        id: `flexible-${sponsor.id}`,
        sponsor,
      });
    });
  }

  return items;
}

function getMcSponsorPlacementFromSongNeighbor(
  neighbor: McSponsorPlacementRenderableItem,
  direction: "up" | "down",
) {
  if (neighbor.kind === "song") {
    return {
      placement_type: direction === "up" ? "before_performer" : "after_performer",
      mc_anchor_song_id: neighbor.song.id,
      linked_performer: getDisplaySingerName(neighbor.song.artist),
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

function resolveMcSponsorPlacementFromSongFlow(
  items: McSponsorPlacementRenderableItem[],
  sponsorId: string,
) {
  const sponsorIndex = items.findIndex(
    (item) => item.kind === "sponsor" && item.sponsor.id === sponsorId,
  );

  if (sponsorIndex < 0) {
    return {
      placement_type: null,
      mc_anchor_song_id: null,
      linked_performer: null,
    };
  }

  const previousFixedItem = [...items.slice(0, sponsorIndex)]
    .reverse()
    .find((item) => item.kind === "song" || item.kind === "marker");
  const nextFixedItem = items
    .slice(sponsorIndex + 1)
    .find((item) => item.kind === "song" || item.kind === "marker");

  if (previousFixedItem?.kind === "song") {
    return {
      placement_type: "after_performer",
      mc_anchor_song_id: previousFixedItem.song.id,
      linked_performer: getDisplaySingerName(previousFixedItem.song.artist),
    };
  }

  if (nextFixedItem?.kind === "song") {
    return {
      placement_type: "before_performer",
      mc_anchor_song_id: nextFixedItem.song.id,
      linked_performer: getDisplaySingerName(nextFixedItem.song.artist),
    };
  }

  if (previousFixedItem?.kind === "marker") {
    return getMcSponsorPlacementFromSongNeighbor(previousFixedItem, "down");
  }

  if (nextFixedItem?.kind === "marker") {
    return getMcSponsorPlacementFromSongNeighbor(nextFixedItem, "up");
  }

  return {
    placement_type: null,
    mc_anchor_song_id: null,
    linked_performer: null,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to Supabase.";
}

function getGuestSongSaveErrorMessage(error: unknown) {
  const baseMessage = getErrorMessage(error);

  if (error && typeof error === "object") {
    const errorObject = error as Record<string, unknown>;
    const message = typeof errorObject.message === "string" ? errorObject.message : "";
    const code = typeof errorObject.code === "string" ? errorObject.code : "";

    if (
      code === "PGRST204" ||
      message.includes("Could not find the 'notes' column of 'show_guest_songs'") ||
      message.includes("Could not find the 'lyrics' column of 'show_guest_songs'")
    ) {
      return "Guest song notes fields are missing from Supabase. Apply the show_guest_songs notes/lyrics migration, then try again.";
    }
  }

  return baseMessage;
}

function logDataSectionError(sectionName: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    const errorObject =
      error && typeof error === "object" ? (error as Record<string, unknown>) : null;

    console.error(`Failed to load ${sectionName}.`, {
      error,
      message:
        error instanceof Error
          ? error.message
          : typeof errorObject?.message === "string"
            ? errorObject.message
            : null,
      code: typeof errorObject?.code === "string" ? errorObject.code : null,
      details:
        typeof errorObject?.details === "string" ? errorObject.details : errorObject?.details ?? null,
      hint: typeof errorObject?.hint === "string" ? errorObject.hint : errorObject?.hint ?? null,
      json: (() => {
        try {
          return JSON.stringify(error, null, 2);
        } catch {
          return null;
        }
      })(),
    });
  }
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestPotentialSponsorsApi<T>(
  init?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/potential-sponsors", {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok || payload?.success === false) {
    const error = new Error(
      payload?.error ??
        payload?.message ??
        `Potential sponsors request failed with status ${response.status}.`,
    ) as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    error.details = payload?.details ?? null;

    if (payload?.details && typeof payload.details === "object") {
      const detailRecord = payload.details as Record<string, unknown>;
      error.code = detailRecord.code;
      error.hint = detailRecord.hint;
    }

    throw error;
  }

  return (payload?.data ?? null) as T;
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
  chart_url?: string | null;
}): SongEditFormState {
  return {
    title: song.title,
    key: song.key ?? "",
    tempo: song.tempo ?? "",
    songType: song.song_type ?? "",
    notes: song.notes ?? "",
    lyrics: song.lyrics ?? "",
    chartUrl: song.chart_url ?? "",
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
  | "potentialSponsors"
  | "showSponsors"
  | "checklistItems"
  | "payoutItems"
  | "financeItems"
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
    email: profile.email ?? "",
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
    sponsorType: sponsor.sponsor_type ?? "",
    defaultContribution: sponsor.default_contribution ?? "",
    estimatedValue:
      sponsor.estimated_value === null || sponsor.estimated_value === undefined
        ? ""
        : formatNumericInputValue(sponsor.estimated_value),
    recognitionNotes: sponsor.recognition_notes ?? "",
  };
}

function buildShowSponsorAssignmentFormState(sponsor: ShowSponsor): ShowSponsorAssignmentFormState {
  return {
    sponsorId: sponsor.sponsor_id ?? "",
    placementType: sponsor.placement_type ?? "",
    linkedPerformer: sponsor.linked_performer ?? "",
    customNote: sponsor.custom_note ?? "",
    sponsorType: sponsor.sponsor_type ?? sponsor.sponsor?.sponsor_type ?? "",
    defaultContribution:
      sponsor.default_contribution ?? sponsor.sponsor?.default_contribution ?? "",
    estimatedValue:
      sponsor.estimated_value !== null && sponsor.estimated_value !== undefined
        ? formatNumericInputValue(sponsor.estimated_value)
        : sponsor.sponsor?.estimated_value !== null && sponsor.sponsor?.estimated_value !== undefined
          ? formatNumericInputValue(sponsor.sponsor.estimated_value)
          : "",
    recognitionNotes:
      sponsor.recognition_notes ?? sponsor.sponsor?.recognition_notes ?? "",
  };
}

function buildSponsorDocumentFormState(sponsor: SponsorLibraryEntry): SponsorDocumentFormState {
  return {
    sponsorshipLevel: sponsor.sponsorship_level ?? "",
    sponsorshipAmount:
      sponsor.sponsorship_amount === null || sponsor.sponsorship_amount === undefined
        ? ""
        : sponsor.sponsorship_amount.toFixed(2),
    paymentStatus: sponsor.payment_status ?? "prospect",
    proposalCoverage: "current-show",
    proposalYear: String(new Date().getFullYear()),
    proposalCustomCoverage: "",
  };
}

function buildPotentialSponsorFormState(
  potentialSponsor: PotentialSponsor,
): PotentialSponsorFormState {
  return {
    businessName: potentialSponsor.business_name,
    contactName: potentialSponsor.contact_name ?? "",
    phone: potentialSponsor.phone ?? "",
    email: potentialSponsor.email ?? "",
    status: potentialSponsor.status,
    notes: potentialSponsor.notes ?? "",
  };
}

function normalizeShowFinanceItem(
  item: Omit<ShowFinanceItem, "amount"> & { amount: number | string | null },
): ShowFinanceItem {
  const parsedAmount =
    typeof item.amount === "number"
      ? item.amount
      : typeof item.amount === "string"
        ? Number.parseFloat(item.amount)
        : 0;

  return {
    ...item,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
  };
}

function buildFinanceItemFormState(item: ShowFinanceItem): FinanceItemFormState {
  return {
    label: item.label,
    category: item.category ?? "",
    amount: item.amount.toFixed(2),
    notes: item.notes ?? "",
  };
}

function sortFinanceItems(items: ShowFinanceItem[]) {
  return [...items].sort((itemA, itemB) => itemB.created_at.localeCompare(itemA.created_at));
}

function normalizeShowPayoutItem(
  item: Omit<ShowPayoutItem, "amount"> & { amount: number | string | null },
): ShowPayoutItem {
  const parsedAmount =
    typeof item.amount === "number"
      ? item.amount
      : typeof item.amount === "string"
        ? Number.parseFloat(item.amount)
        : 0;

  return {
    ...item,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    category: item.category ?? null,
    description: item.description ?? null,
    payment_method: item.payment_method ?? null,
    paid: item.paid ?? false,
  };
}

function buildPayoutFormState(item: ShowPayoutItem): PayoutFormState {
  return {
    payeeName: item.payee_name,
    category: item.category ?? "",
    description: item.description ?? "",
    amount: item.amount.toFixed(2),
    paid: item.paid,
    paymentMethod: item.payment_method ?? "",
  };
}

function sortShowPayoutItems(items: ShowPayoutItem[]) {
  return [...items].sort((itemA, itemB) => itemA.created_at.localeCompare(itemB.created_at));
}

function sortShowChecklistItems(items: ShowChecklistItem[]) {
  return [...items].sort((itemA, itemB) => itemA.created_at.localeCompare(itemB.created_at));
}

function buildFinanceReportHtml({
  showName,
  showDate,
  venue,
  financeItems,
}: {
  showName: string;
  showDate: string | null;
  venue: string | null;
  financeItems: ShowFinanceItem[];
}) {
  const incomeItems = financeItems.filter((item) => item.type === "income");
  const expenseItems = financeItems.filter((item) => item.type === "expense");
  const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = formatProfitMargin(totalIncome, netProfit);

  const buildRows = (items: ShowFinanceItem[]) =>
    items.length === 0
      ? `<tr><td colspan="4" class="empty">No items added.</td></tr>`
      : items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.label)}</td>
                <td>${escapeHtml(item.category ?? "Uncategorized")}</td>
                <td class="amount">${escapeHtml(formatCurrency(item.amount))}</td>
                <td>${escapeHtml(item.notes ?? "")}</td>
              </tr>
            `,
          )
          .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(`${showName} - Finance Report`)}</title>
        <style>
          :root {
            color-scheme: light;
          }
          body {
            margin: 32px;
            color: #1f2937;
            font-family: Arial, sans-serif;
            background: #ffffff;
          }
          h1, h2, h3, p {
            margin: 0;
          }
          .brand {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #047857;
          }
          .header {
            margin-bottom: 24px;
          }
          .header h1 {
            margin-top: 8px;
            font-size: 28px;
          }
          .meta {
            margin-top: 8px;
            display: grid;
            gap: 4px;
            font-size: 14px;
            color: #4b5563;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 24px;
          }
          .summary-card {
            border: 1px solid #d1d5db;
            border-radius: 12px;
            padding: 12px 14px;
            background: #f9fafb;
          }
          .summary-card p:first-child {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #6b7280;
          }
          .summary-card p:last-child {
            margin-top: 6px;
            font-size: 22px;
            font-weight: 700;
          }
          .negative {
            color: #b91c1c;
          }
          .section {
            margin-top: 24px;
          }
          .section h2 {
            margin-bottom: 12px;
            font-size: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th, td {
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            vertical-align: top;
            text-align: left;
          }
          th {
            background: #f3f4f6;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #4b5563;
          }
          .amount {
            text-align: right;
            white-space: nowrap;
          }
          .totals {
            margin-top: 16px;
            display: grid;
            gap: 6px;
            font-size: 15px;
          }
          .empty {
            text-align: center;
            color: #6b7280;
          }
          @media print {
            body {
              margin: 18px;
            }
            .section {
              break-inside: avoid;
            }
            table, tr, td, th {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <header class="header">
          <p class="brand">Cumberland Mountain Music Show / StageFlow</p>
          <h1>Show Finance Report</h1>
          <div class="meta">
            <p>${escapeHtml(showName)}</p>
            <p>${escapeHtml(formatShowDate(showDate))}</p>
            <p>${escapeHtml(venue?.trim() || "Venue TBD")}</p>
          </div>
        </header>

        <section class="summary">
          <div class="summary-card">
            <p>Total Income</p>
            <p>${escapeHtml(formatCurrency(totalIncome))}</p>
          </div>
          <div class="summary-card">
            <p>Total Expenses</p>
            <p>${escapeHtml(formatCurrency(totalExpenses))}</p>
          </div>
          <div class="summary-card">
            <p>Net Profit / Loss</p>
            <p class="${netProfit < 0 ? "negative" : ""}">${escapeHtml(formatCurrency(netProfit))}</p>
          </div>
          <div class="summary-card">
            <p>Profit Margin</p>
            <p>${escapeHtml(profitMargin ?? "N/A")}</p>
          </div>
        </section>

        <section class="section">
          <h2>Income Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${buildRows(incomeItems)}</tbody>
          </table>
        </section>

        <section class="section">
          <h2>Expense Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${buildRows(expenseItems)}</tbody>
          </table>
        </section>

        <section class="section totals">
          <p><strong>Total Income:</strong> ${escapeHtml(formatCurrency(totalIncome))}</p>
          <p><strong>Total Expenses:</strong> ${escapeHtml(formatCurrency(totalExpenses))}</p>
          <p><strong>Net Profit / Loss:</strong> ${escapeHtml(formatCurrency(netProfit))}</p>
          <p><strong>Profit Margin:</strong> ${escapeHtml(profitMargin ?? "N/A")}</p>
        </section>
      </body>
    </html>
  `;
}

function buildPayoutSheetHtml({
  showName,
  showDate,
  payoutItems,
}: {
  showName: string;
  showDate: string | null;
  payoutItems: ShowPayoutItem[];
}) {
  const groupedItems = payoutCategoryOptions.map((category) => ({
    category,
    items: payoutItems.filter((item) => (item.category ?? "Other Expense") === category),
  })).filter((group) => group.items.length > 0);
  const totalAmount = payoutItems.reduce((sum, item) => sum + item.amount, 0);

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(`${showName} - Payout Sheet`)}</title>
      <style>
        :root { color-scheme: light; }
        body {
          margin: 32px;
          color: #1f2937;
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          background: #ffffff;
        }
        h1 { margin: 0; font-size: 1.9rem; }
        .meta { margin-top: 0.5rem; color: #57534e; font-size: 0.98rem; }
        .section { margin-top: 1.5rem; break-inside: avoid; page-break-inside: avoid; }
        .section h2 {
          margin: 0 0 0.55rem;
          font-size: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #44403c;
          border-bottom: 1px solid #d6d3d1;
          padding-bottom: 0.35rem;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td {
          padding: 0.55rem 0.45rem;
          border-bottom: 1px solid #e7e5e4;
          text-align: left;
          vertical-align: top;
          font-size: 0.92rem;
        }
        th {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #57534e;
          background: #fafaf9;
        }
        td.amount, th.amount { text-align: right; white-space: nowrap; }
        td.center, th.center { text-align: center; }
        .notes { color: #57534e; white-space: pre-wrap; }
        .totals {
          margin-top: 1.5rem;
          border-top: 1.5px solid #a8a29e;
          padding-top: 0.8rem;
          display: flex;
          justify-content: flex-end;
        }
        .totals-card {
          min-width: 240px;
          border: 1px solid #d6d3d1;
          border-radius: 14px;
          padding: 0.85rem 1rem;
          background: #fafaf9;
        }
        .totals-card p { margin: 0; color: #57534e; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; }
        .totals-card strong { display: block; margin-top: 0.35rem; font-size: 1.35rem; color: #111827; }
        .empty {
          margin-top: 1.5rem;
          border: 1px dashed #d6d3d1;
          border-radius: 14px;
          padding: 1rem;
          color: #57534e;
          background: #fafaf9;
        }
      </style>
    </head>
    <body>
      <main>
        <header>
          <h1>Show Payout Sheet</h1>
          <p class="meta">${escapeHtml(showName)}${showDate ? ` - ${escapeHtml(formatShowDate(showDate))}` : ""}</p>
        </header>
        ${
          payoutItems.length === 0
            ? `<div class="empty">No payout items added yet.</div>`
            : groupedItems
                .map(
                  (group) => `
                    <section class="section">
                      <h2>${escapeHtml(group.category)}</h2>
                      <table>
                        <thead>
                          <tr>
                            <th>Payee</th>
                            <th>Description / Notes</th>
                            <th class="amount">Amount</th>
                            <th class="center">Paid</th>
                            <th>Payment Method</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${group.items
                            .map(
                              (item) => `
                                <tr>
                                  <td>${escapeHtml(item.payee_name)}</td>
                                  <td class="notes">${escapeHtml(item.description ?? "")}</td>
                                  <td class="amount">${escapeHtml(formatCurrency(item.amount))}</td>
                                  <td class="center">${item.paid ? "Yes" : "No"}</td>
                                  <td>${escapeHtml(item.payment_method ?? "")}</td>
                                </tr>
                              `,
                            )
                            .join("")}
                        </tbody>
                      </table>
                    </section>
                  `,
                )
                .join("")
        }
        <section class="totals">
          <div class="totals-card">
            <p>Total Payout Amount</p>
            <strong>${escapeHtml(formatCurrency(totalAmount))}</strong>
          </div>
        </section>
      </main>
    </body>
  </html>`;
}

type YearlyFinanceQuickTotalDefinition = {
  key: string;
  label: string;
  type: ShowFinanceItem["type"];
  matchers: string[];
};

type YearlyFinanceReportShowBreakdown = {
  show: ShowRecord;
  income: number;
  expenses: number;
  net: number;
};

type YearlyFinanceReportCategoryGroup = {
  category: string;
  total: number;
  items: Array<
    ShowFinanceItem & {
      showName: string;
      showDate: string | null;
    }
  >;
};

type YearlyFinanceReportQuickTotal = {
  key: string;
  label: string;
  amount: number;
};

const yearlyFinanceQuickTotalDefinitions: YearlyFinanceQuickTotalDefinition[] = [
  { key: "sponsorship-income", label: "Sponsorship Income", type: "income", matchers: ["sponsor", "sponsorship"] },
  { key: "presale-ticket-income", label: "Presale Ticket Income", type: "income", matchers: ["presale", "pre-sale", "advance ticket", "advance sales"] },
  { key: "door-sales-income", label: "Door Sales Income", type: "income", matchers: ["door", "door sales", "ticket sales", "walk-up"] },
  { key: "advertising-expenses", label: "Advertising Expenses", type: "expense", matchers: ["advertis", "marketing", "promo", "facebook ad"] },
  { key: "talent-guest-pay", label: "Talent / Guest Pay", type: "expense", matchers: ["guest pay", "talent", "artist pay", "performer pay"] },
  { key: "band-pay", label: "Band Pay", type: "expense", matchers: ["band pay", "band"] },
  { key: "printing-signs", label: "Printing / Signs", type: "expense", matchers: ["print", "printing", "sign", "signage"] },
  { key: "misc-expenses", label: "Misc Expenses", type: "expense", matchers: ["misc", "miscellaneous", "other"] },
];

function getShowYear(showDate: string | null) {
  if (!showDate) {
    return null;
  }

  const parsedDate = new Date(`${showDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getUTCFullYear();
}

function normalizeFinanceCategoryLabel(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function buildYearToDateFinanceReportHtml({
  year,
  showCount,
  totalIncome,
  totalExpenses,
  net,
  quickTotals,
  showBreakdown,
  incomeGroups,
  expenseGroups,
  logoUrl,
}: {
  year: number;
  showCount: number;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  quickTotals: YearlyFinanceReportQuickTotal[];
  showBreakdown: YearlyFinanceReportShowBreakdown[];
  incomeGroups: YearlyFinanceReportCategoryGroup[];
  expenseGroups: YearlyFinanceReportCategoryGroup[];
  logoUrl: string;
}) {
  const summaryRows = [
    { label: "Year", value: String(year), tone: "tone-neutral" },
    {
      label: "Prepared",
      value: new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
      tone: "tone-neutral",
    },
    { label: "Total Income", value: formatCurrency(totalIncome), tone: "tone-income" },
    { label: "Total Expenses", value: formatCurrency(totalExpenses), tone: "tone-expense" },
    {
      label: "Net Profit / Loss",
      value: formatCurrency(net),
      tone: net < 0 ? "tone-net-negative" : "tone-net-positive",
    },
    {
      label: "Profit Margin",
      value: formatProfitMargin(totalIncome, net) ?? "N/A",
      tone: totalIncome > 0 && net < 0 ? "tone-net-negative" : "tone-neutral",
    },
    { label: "Total Shows Included", value: String(showCount), tone: "tone-neutral" },
  ];

  const renderCategoryGroups = (
    groups: YearlyFinanceReportCategoryGroup[],
    emptyMessage: string,
    toneClass: string,
  ) => {
    if (groups.length === 0) {
      return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    }

    return groups
      .map(
        (group) => `
          <section class="category-group avoid-break ${toneClass}">
            <div class="category-header">
              <div>
                <h3>${escapeHtml(group.category)}</h3>
                <p>${group.items.length} item${group.items.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div class="line-items">
              ${group.items
                .map(
                  (item) => `
                    <div class="line-item avoid-break">
                      <div class="line-item-main">
                        <div class="line-item-top">
                          <strong>${escapeHtml(item.label || "Untitled item")}</strong>
                          <span class="${toneClass}">${escapeHtml(formatCurrency(item.amount))}</span>
                        </div>
                        <p>${escapeHtml(item.showName)}${item.showDate ? ` • ${escapeHtml(formatShowDate(item.showDate))}` : ""}</p>
                        ${item.notes?.trim() ? `<p class="line-item-notes">${escapeHtml(item.notes.trim())}</p>` : ""}
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
            <div class="category-total-row ${toneClass}">
              <span>${escapeHtml(group.category)} Total</span>
              <strong>${escapeHtml(formatCurrency(group.total))}</strong>
            </div>
          </section>
        `,
      )
      .join("");
  };

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(`Year-to-Date Finance Report — ${year}`)}</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        @page { margin: 0.55in; }
        body { margin: 0; background: #ffffff; color: #111827; font-family: Arial, Helvetica, sans-serif; line-height: 1.42; }
        .report { display: flex; flex-direction: column; gap: 1rem; }
        .page-break { break-before: page; page-break-before: always; }
        .logo { display: block; width: auto; max-width: 280px; max-height: 90px; margin: 0 auto 0.75rem; object-fit: contain; }
        .header { text-align: center; border-bottom: 1.5px solid #a8a29e; padding-bottom: 0.65rem; margin-bottom: 0.8rem; }
        .header h1 { margin: 0.25rem 0 0; font-size: 1.7rem; line-height: 1.15; }
        .header p { margin: 0.35rem 0 0; color: #57534e; font-size: 0.96rem; }
        .summary-intro { margin: 0 0 0.8rem; color: #44403c; font-size: 0.94rem; }
        .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.25rem 1.25rem; border-top: 1px solid #d6d3d1; border-bottom: 1px solid #d6d3d1; padding: 0.2rem 0 0.35rem; }
        .summary-card { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid #ece7e1; background: transparent; }
        .summary-card:nth-last-child(-n + 2) { border-bottom: none; }
        .summary-card span { display: block; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #57534e; }
        .summary-card strong { display: block; font-size: 1rem; color: #111827; text-align: right; }
        .quick-totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.15rem 1rem; }
        .quick-total { display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-bottom: 1px solid #ece7e1; font-size: 0.92rem; }
        .section-title { margin: 1.25rem 0 0.7rem; padding-bottom: 0.3rem; border-bottom: 1px solid #d6d3d1; font-size: 1.1rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #111827; }
        .section-title:first-child { margin-top: 0; }
        .subtle { margin: 0 0 0.8rem; color: #57534e; font-size: 0.9rem; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 0.55rem 0.5rem; border-bottom: 1px solid #e7e5e4; text-align: left; vertical-align: top; font-size: 0.92rem; }
        th { font-size: 0.76rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #57534e; border-bottom: 1.5px solid #a8a29e; background: #fafaf9; }
        td.amount, th.amount { text-align: right; white-space: nowrap; }
        tbody tr:nth-child(even) { background: #fafaf9; }
        .show-row td.amount.income { color: #166534; font-weight: 600; }
        .show-row td.amount.expense { color: #b91c1c; font-weight: 600; }
        .show-row td.amount.net-positive { color: #166534; font-weight: 700; }
        .show-row td.amount.net-negative { color: #b91c1c; font-weight: 700; }
        .category-group { padding: 0 0 0.95rem; margin-bottom: 1rem; border-bottom: 1px solid #d6d3d1; }
        .category-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; border-bottom: 1px solid #e7e5e4; padding-bottom: 0.5rem; margin-bottom: 0.65rem; }
        .category-header h3 { margin: 0; font-size: 1.08rem; font-weight: 800; line-height: 1.25; color: #111827; }
        .category-header p { margin: 0.18rem 0 0; color: #57534e; font-size: 0.8rem; }
        .tone-income { color: #166534; }
        .tone-expense { color: #b91c1c; }
        .tone-net-positive { color: #166534; }
        .tone-net-negative { color: #b91c1c; }
        .tone-neutral { color: #111827; }
        .line-items { display: grid; gap: 0.15rem; }
        .line-item { padding: 0.45rem 0; border-bottom: 1px solid #f1eeea; }
        .line-item-top { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
        .line-item-top strong { font-size: 0.95rem; }
        .line-item-top span { white-space: nowrap; font-weight: 700; }
        .line-item-main p { margin: 0.25rem 0 0; color: #57534e; font-size: 0.84rem; }
        .line-item-notes { color: #44403c; font-size: 0.8rem; }
        .category-total-row { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; margin-top: 0.6rem; padding-top: 0.55rem; border-top: 1px solid #d6d3d1; font-size: 0.94rem; font-weight: 700; }
        .category-total-row strong { white-space: nowrap; }
        .empty-state { border: 1px dashed #d6d3d1; border-radius: 10px; padding: 1rem; color: #57534e; background: #ffffff; font-size: 0.92rem; }
        .final-summary { margin-top: 0.45rem; padding-top: 0.8rem; border-top: 1.5px solid #a8a29e; }
        .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <main class="report">
        <section class="avoid-break">
          <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" class="logo" />
          <div class="header">
            <h1>Year-to-Date Finance Report</h1>
            <p>${escapeHtml(String(year))} Cumberland Mountain Music Show Summary</p>
          </div>
          <p class="summary-intro">Executive Summary / Year Summary</p>
          <div class="summary-grid">
            ${summaryRows.map((row) => `
              <div class="summary-card avoid-break">
                <span>${escapeHtml(row.label)}</span>
                <strong class="${escapeHtml(row.tone)}">${escapeHtml(row.value)}</strong>
              </div>
            `).join("")}
          </div>
          ${quickTotals.length > 0 ? `
            <h2 class="section-title" style="margin-top: 1rem;">Quick Totals</h2>
            <div class="quick-totals">
              ${quickTotals.map((item) => `
                <div class="quick-total avoid-break">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(formatCurrency(item.amount))}</strong>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </section>
        <section class="page-break">
          <h2 class="section-title">Show-By-Show Summary</h2>
          <p class="subtle">All shows dated in ${escapeHtml(String(year))}, including archived and historical records.</p>
          ${showBreakdown.length === 0 ? `<div class="empty-state">No shows with dates were found for ${escapeHtml(String(year))}.</div>` : `
            <table>
              <thead>
                <tr>
                  <th>Show</th>
                  <th>Date</th>
                  <th class="amount">Income</th>
                  <th class="amount">Expenses</th>
                  <th class="amount">Net</th>
                </tr>
              </thead>
              <tbody>
                ${showBreakdown.map(({ show, income, expenses, net: showNet }) => `
                  <tr class="avoid-break show-row">
                    <td>${escapeHtml(show.name)}</td>
                    <td>${escapeHtml(formatShowDate(show.show_date))}</td>
                    <td class="amount income">${escapeHtml(formatCurrency(income))}</td>
                    <td class="amount expense">${escapeHtml(formatCurrency(expenses))}</td>
                    <td class="amount ${showNet < 0 ? "net-negative" : "net-positive"}">${escapeHtml(formatCurrency(showNet))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        </section>
        <section class="page-break">
          <h2 class="section-title">Income Breakdown</h2>
          <p class="subtle">Grouped income items for all shows in ${escapeHtml(String(year))}.</p>
          ${renderCategoryGroups(incomeGroups, `No income items were found for ${year}.`, "tone-income")}
        </section>
        <section class="page-break">
          <h2 class="section-title">Expense Breakdown</h2>
          <p class="subtle">Grouped expense items for all shows in ${escapeHtml(String(year))}.</p>
          ${renderCategoryGroups(expenseGroups, `No expense items were found for ${year}.`, "tone-expense")}
          <section class="final-summary avoid-break">
            <h2 class="section-title">Final Totals</h2>
            <div class="summary-grid">
              ${[
                { label: "Total Income", value: formatCurrency(totalIncome), tone: "tone-income" },
                { label: "Total Expenses", value: formatCurrency(totalExpenses), tone: "tone-expense" },
                { label: "Net Profit / Loss", value: formatCurrency(net), tone: net < 0 ? "tone-net-negative" : "tone-net-positive" },
                { label: "Profit Margin", value: formatProfitMargin(totalIncome, net) ?? "N/A", tone: totalIncome > 0 && net < 0 ? "tone-net-negative" : "tone-neutral" },
              ].map((row) => `
                <div class="summary-card avoid-break">
                  <span>${escapeHtml(row.label)}</span>
                  <strong class="${escapeHtml(row.tone)}">${escapeHtml(row.value)}</strong>
                </div>
              `).join("")}
            </div>
          </section>
        </section>
      </main>
    </body>
  </html>`;
}

function buildShowSponsorLogoSheetHtml({
  showName,
  showDate,
  sponsors,
  logoUrl,
}: {
  showName: string;
  showDate: string | null;
  sponsors: ShowSponsor[];
  logoUrl: string;
}) {
  const printableSponsors = sponsors.filter((sponsor) =>
    Boolean(sponsor.sponsor?.name?.trim() || sponsor.sponsor?.logo_url?.trim()),
  );

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Sponsor Logo Sheet</title>
      <style>
        :root {
          color-scheme: light;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #ffffff;
          color: #111827;
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }
        .sheet {
          padding: 0.6in 0.55in 0.5in;
        }
        .header {
          text-align: center;
          margin-bottom: 0.35in;
        }
        .header img {
          max-height: 110px;
          width: auto;
          display: block;
          margin: 0 auto 0.2in;
        }
        .header h1 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: 0.01em;
        }
        .header p {
          margin: 0.12rem 0 0;
          color: #4b5563;
          font-size: 0.98rem;
        }
        .logo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.24in;
          align-items: stretch;
        }
        .logo-card {
          min-height: 150px;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          background: #ffffff;
          padding: 0.22in 0.18in;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .logo-card img {
          max-width: 100%;
          max-height: 92px;
          object-fit: contain;
          display: block;
        }
        .logo-card .name {
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.35;
          color: #111827;
        }
        .empty {
          border: 1px dashed #d1d5db;
          border-radius: 18px;
          padding: 0.3in;
          text-align: center;
          color: #6b7280;
        }
        @page {
          size: auto;
          margin: 0.45in;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .sheet {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <header class="header">
          <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" />
          <h1>This Cumberland Mountain Music Show Is Proudly Sponsored By</h1>
        </header>
        ${
          printableSponsors.length === 0
            ? `<div class="empty">No sponsor logos or sponsor names are attached to this show yet.</div>`
            : `<section class="logo-grid">
                ${printableSponsors
                  .map((sponsor) => {
                    const sponsorName = sponsor.sponsor?.name?.trim() || "Show Sponsor";
                    const sponsorLogoUrl = sponsor.sponsor?.logo_url?.trim() || "";

                    if (sponsorLogoUrl) {
                      return `<article class="logo-card"><img src="${escapeHtml(sponsorLogoUrl)}" alt="${escapeHtml(sponsorName)} logo" /></article>`;
                    }

                    return `<article class="logo-card"><div class="name">${escapeHtml(sponsorName)}</div></article>`;
                  })
                  .join("")}
              </section>`
        }
      </main>
    </body>
  </html>`;
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
  const resolvedMp3Path =
    extractMp3PathFromNotes(librarySong?.notes) ??
    extractMp3PathFromNotes(guestSong?.notes) ??
    extractMp3PathFromNotes(song.notes) ??
    null;
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
    notes: stripMp3MarkerFromNotes(resolvedNotes),
    lyrics: resolvedLyrics,
    mp3_path: resolvedMp3Path,
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

function getGuestFirstName(name: string | null | undefined) {
  const trimmedName = name?.trim() ?? "";

  if (!trimmedName) {
    return null;
  }

  const [firstName] = trimmedName.split(/\s+/);
  return firstName || null;
}

function buildGuestProfileRecord(
  profilePayload: {
    show_id: string;
    name: string | null;
    short_bio: string | null;
    full_bio: string | null;
    hometown: string | null;
    instruments: string | null;
    email: string | null;
    facebook: string | null;
    instagram: string | null;
    website: string | null;
    photo_url: string | null;
    agreed_fee?: string | null;
    planned_song_count?: number | null;
    backup_song_count?: number | null;
    appearance_notes?: string | null;
    guest_token?: string | null;
    is_confirmed?: boolean;
    permission_granted: boolean;
  },
  overrides?: Partial<GuestProfile>,
): GuestProfile {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    show_id: profilePayload.show_id,
    name: profilePayload.name,
    short_bio: profilePayload.short_bio,
    full_bio: profilePayload.full_bio,
    hometown: profilePayload.hometown,
    instruments: profilePayload.instruments,
    email: profilePayload.email,
    facebook: profilePayload.facebook,
    instagram: profilePayload.instagram,
    website: profilePayload.website,
    photo_url: profilePayload.photo_url,
    agreed_fee: profilePayload.agreed_fee ?? overrides?.agreed_fee ?? null,
    planned_song_count: profilePayload.planned_song_count ?? overrides?.planned_song_count ?? null,
    backup_song_count: profilePayload.backup_song_count ?? overrides?.backup_song_count ?? null,
    appearance_notes: profilePayload.appearance_notes ?? overrides?.appearance_notes ?? null,
    guest_token: profilePayload.guest_token ?? null,
    portal_opened_at: overrides?.portal_opened_at ?? null,
    last_reminder_sent_at: overrides?.last_reminder_sent_at ?? null,
    is_confirmed: profilePayload.is_confirmed ?? overrides?.is_confirmed ?? false,
    permission_granted: profilePayload.permission_granted,
    created_at: overrides?.created_at ?? new Date().toISOString(),
  };
}

function formatPortalStatusDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getGuestProfilePortalStatus(
  profile: GuestProfile,
  submissions: PendingSubmission[],
): GuestPortalStatus {
  const submittedSongsCount = submissions.filter((song) =>
    isGuestSongForProfile(song, profile.name),
  ).length;

  if (submittedSongsCount > 0) {
    return {
      key: "submitted",
      label: "Songs submitted",
      openedAt: profile.portal_opened_at,
      lastReminderSentAt: profile.last_reminder_sent_at,
      submittedSongsCount,
    };
  }

  if (profile.portal_opened_at) {
    return {
      key: "opened",
      label: "Opened, no songs submitted",
      openedAt: profile.portal_opened_at,
      lastReminderSentAt: profile.last_reminder_sent_at,
      submittedSongsCount,
    };
  }

  return {
    key: "not-opened",
    label: "Not opened yet",
    openedAt: null,
    lastReminderSentAt: profile.last_reminder_sent_at,
    submittedSongsCount,
  };
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

function normalizeOptionalInteger(value: number | null | undefined) {
  return Number.isInteger(value) ? value : null;
}

function parseFinanceAmountInput(value: string) {
  const normalizedValue = value.replaceAll(",", "").trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseOptionalIntegerInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number.parseInt(trimmedValue, 10);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function normalizeChartUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return null;
  }

  return chartUrlPattern.test(trimmedValue) ? trimmedValue : null;
}

function getChartUrlValidationMessage(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return null;
  }

  return normalizeChartUrl(trimmedValue)
    ? null
    : "Chart link must start with http:// or https://.";
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

function validateSongMp3File(file: File | null) {
  if (!file) {
    return null;
  }

  const lowerName = file.name.toLowerCase();
  const isMp3File = file.type === "audio/mpeg" || lowerName.endsWith(".mp3");

  if (!isMp3File) {
    return "Only MP3 files are supported.";
  }

  if (file.size > MAX_SONG_MP3_BYTES) {
    return "MP3 files must be 30 MB or smaller.";
  }

  return null;
}

function buildSongMp3StoragePath(showSlug: string, songId: string) {
  const safeShowSlug = sanitizeFileName(showSlug || "show");
  return `song-audio/shows/${safeShowSlug}/songs/${songId}.mp3`;
}

function extractMp3PathFromNotes(notes: string | null | undefined) {
  const match = notes?.match(MP3_PATH_MARKER_PATTERN);
  return match?.[1] ?? null;
}

function stripMp3MarkerFromNotes(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  const cleanedNotes = notes.replace(MP3_PATH_MARKER_PATTERN, "").trim();
  return cleanedNotes || null;
}

function appendMp3MarkerToNotes(notes: string | null | undefined, path: string | null | undefined) {
  const cleanedNotes = stripMp3MarkerFromNotes(notes);

  if (!path) {
    return cleanedNotes;
  }

  return cleanedNotes ? `${cleanedNotes}\n\n[[MP3_PATH:${path}]]` : `[[MP3_PATH:${path}]]`;
}

function getSongMp3DownloadUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const supabase = createClient();
  const { data } = supabase.storage.from(SONG_AUDIO_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
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
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // NEXT_PUBLIC_SITE_URL is optional and used to build full admin links for emails.
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, "");
  }

  return "";
}

function buildAdminShowUrl(showSlug: string) {
  const adminPath = `/admin/${encodeURIComponent(showSlug)}`;
  const siteBaseUrl = getSiteBaseUrl();

  return siteBaseUrl ? `${siteBaseUrl}${adminPath}` : adminPath;
}

function buildGuestPrivatePortalUrl(guestIdentifier: string) {
  const guestPath = `/guest/${encodeURIComponent(guestIdentifier)}`;
  const siteBaseUrl = getSiteBaseUrl();

  return siteBaseUrl ? `${siteBaseUrl}${guestPath}` : guestPath;
}

function buildGuestReminderEmailText(profile: GuestProfile) {
  const guestIdentifier = profile.guest_token ?? profile.id;
  const guestLink = buildGuestPrivatePortalUrl(guestIdentifier);
  const guestFirstName = getGuestFirstName(profile.name);
  const greeting = guestFirstName ? `Hello ${guestFirstName},` : "Hello,";

  return `Subject: Cumberland Mountain Music Show Guest Portal Reminder

${greeting}

Just a quick reminder to complete or update your Cumberland Mountain Music Show guest portal information when you get a chance.

Your private guest portal link is below:

${guestLink}

This link is unique to you, and you can use it anytime to revisit the portal, submit songs, update artist information, upload or link materials, and review show-day details.

Please make sure your song selections and artist information are submitted as soon as possible so we can prepare for the show.

Thanks again — we’re looking forward to having you with us!

— Bryan Turner
Cumberland Mountain Music Show`;
}

function buildGuestReminderTextMessage(profile: GuestProfile) {
  const guestIdentifier = profile.guest_token ?? profile.id;
  const guestLink = buildGuestPrivatePortalUrl(guestIdentifier);
  const guestFirstName = getGuestFirstName(profile.name);
  const greeting = guestFirstName ? `Hey ${guestFirstName},` : "Hey,";

  return `${greeting} here’s your private Cumberland Mountain Music Show guest portal link: ${guestLink}

You can use it anytime to submit songs, update artist info, and review show-day details.`;
}

function buildBandSetlistMessage(showSlug: string) {
  const bandPath = `/band/${encodeURIComponent(showSlug)}`;
  const siteBaseUrl = getSiteBaseUrl();
  const bandLink = siteBaseUrl ? `${siteBaseUrl}${bandPath}` : bandPath;

  return `Hey everyone, here’s the setlist link for the show:

${bandLink}

You can use this to review songs, setlist order, itinerary, and show notes.`;
}

function buildGuestSongsUrl(showSlug: string) {
  const guestSongsPath = `/guest-songs/${encodeURIComponent(showSlug)}`;
  const siteBaseUrl = getSiteBaseUrl();

  return siteBaseUrl ? `${siteBaseUrl}${guestSongsPath}` : guestSongsPath;
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
        <title>StageFlow &mdash; Pinnacle Recording Studio</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; }
          h1 { margin: 0 0 12px; font-size: 28px; }
          .brand { margin: 0 0 16px; font-size: 12px; color: #6b7280; }
          .meta { margin: 0 0 24px; font-size: 14px; color: #4b5563; }
          .section { margin-top: 24px; }
          .label { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
          .body { margin-top: 8px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <p class="brand">StageFlow &mdash; by Pinnacle Recording Studio</p>
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

function normalizeLyricsBlockForRepeatCheck(block: string) {
  return block
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n")
    .trim()
    .toLowerCase();
}

function normalizePrintableLyricsSpacing(lyrics: string | null | undefined) {
  const trimmedLyrics = lyrics?.trim();

  if (!trimmedLyrics) {
    return null;
  }

  return trimmedLyrics.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function isClearlyMarkedChorusBlock(block: string) {
  const firstLine = block
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return false;
  }

  return /^(\[|\()?(chorus|refrain)(\]|\))?(:)?$/i.test(firstLine);
}

function collapseRepeatedChorusBlocks(lyrics: string | null | undefined) {
  const trimmedLyrics = normalizePrintableLyricsSpacing(lyrics);

  if (!trimmedLyrics) {
    return "No lyrics available";
  }

  const blocks = trimmedLyrics
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return "No lyrics available";
  }

  const seenChorusBlocks = new Set<string>();

  return blocks
    .map((block) => {
      if (!isClearlyMarkedChorusBlock(block)) {
        return block;
      }

      const normalizedBlock = normalizeLyricsBlockForRepeatCheck(block);

      if (!normalizedBlock) {
        return block;
      }

      if (seenChorusBlocks.has(normalizedBlock)) {
        return "[Repeat Chorus]";
      }

      seenChorusBlocks.add(normalizedBlock);
      return block;
    })
    .join("\n\n");
}

function formatPrintableLyricsHtml(lyrics: string | null | undefined) {
  const collapsedLyrics = collapseRepeatedChorusBlocks(lyrics);
  const blocks = collapsedLyrics
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return `<p class="lyrics-block">No lyrics available</p>`;
  }

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const firstLine = lines[0]?.trim() ?? "";

      if (!isClearlyMarkedChorusBlock(block)) {
        return `<p class="lyrics-block">${escapeHtml(block)}</p>`;
      }

      if (/^\[repeat chorus\]$/i.test(firstLine)) {
        return `<p class="lyrics-block chorus-repeat">${escapeHtml(block)}</p>`;
      }

      const chorusBody = lines.slice(1).join("\n").trim();

      return `
        <div class="lyrics-block chorus-block">
          <p class="chorus-label">${escapeHtml(firstLine)}</p>
          ${chorusBody ? `<p class="chorus-body">${escapeHtml(chorusBody)}</p>` : ""}
        </div>
      `;
    })
    .join("");
}

function buildSetLyricsSongBody(song: SetlistSong) {
  if (song.song_type === "instrumental") {
    return `
      <div class="lyrics instrumental-shell">
        <p class="instrumental-label">Instrumental</p>
      </div>
    `;
  }

  if (!song.lyrics?.trim()) {
    return `
      <div class="lyrics">
        <p class="lyrics-block">No lyrics available</p>
      </div>
    `;
  }

  return `<div class="lyrics">${formatPrintableLyricsHtml(song.lyrics)}</div>`;
}

function getSetLyricsSectionLabel(section: SetSection) {
  if (section === "set2") {
    return "Set 2";
  }

  if (section === "encore") {
    return "Encore";
  }

  return "Set 1";
}

function buildSetLyricsPrintHtml(showName: string, showDate: string | null, songs: SetlistSong[]) {
  const formattedShowDate = formatShowDate(showDate);
  const songSections = songs
    .map((song) => {
      const printableLyrics = buildSetLyricsSongBody(song);
      const pageHeader = `${showName} — ${formattedShowDate} — ${getSetLyricsSectionLabel(song.section)} Lyrics`;

      return `
        <section class="song">
          <p class="page-header">${escapeHtml(pageHeader)}</p>
          <h2>${escapeHtml(song.title || "Untitled Song")}</h2>
          ${printableLyrics}
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(`${showName} - Set Lyrics`)}</title>
        <style>
          @page { margin: 0.5in; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: Arial, sans-serif;
          }
          body { padding: 0; }
          .shell {
            max-width: 9.5in;
            margin: 0 auto;
          }
          .song {
            break-before: page;
            page-break-before: always;
            margin: 0;
            padding: 0;
            border: 0;
          }
          .song:first-of-type {
            break-before: auto;
            page-break-before: auto;
          }
          .page-header {
            margin: 0 0 0.14in;
            font-size: 13px;
            line-height: 1.2;
            font-weight: 500;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          h2 {
            margin: 0 0 0.16in;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.2;
            page-break-after: avoid;
            break-after: avoid;
          }
          .lyrics {
            font-size: 18px;
            line-height: 1.2;
          }
          .lyrics-block,
          .chorus-label,
          .chorus-body,
          .chorus-repeat {
            margin-top: 0;
            margin-bottom: 0.25em;
            white-space: pre-wrap;
            line-height: 1.2;
          }
          .lyrics-block:last-child,
          .chorus-block:last-child .chorus-body,
          .chorus-repeat:last-child {
            margin-bottom: 0;
          }
          .chorus-block {
            margin-top: 0;
            margin-bottom: 0.35em;
            padding: 0;
          }
          .chorus-label {
            font-weight: 700;
            margin-top: 0.35em;
            margin-bottom: 0.1em;
          }
          .chorus-body,
          .chorus-repeat {
            font-weight: 700;
          }
          .instrumental-shell {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 55vh;
          }
          .instrumental-label {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main class="shell">
          ${songSections || `<section class="song"><p class="page-header">${escapeHtml(`${showName} — ${formattedShowDate} — Set Lyrics`)}</p><h2>Setlist</h2><div class="lyrics"><p class="lyrics-block">No lyrics available</p></div></section>`}
        </main>
      </body>
    </html>
  `;
}

function buildStageFlowSetLyricsPrintHtml(
  showName: string,
  showDate: string | null,
  songs: SetlistSong[],
) {
  const formattedShowDate = formatShowDate(showDate);
  const songSections = songs
    .map((song) => {
      const printableLyrics = buildSetLyricsSongBody(song);
      const pageHeader = [showName, formattedShowDate, `${getSetLyricsSectionLabel(song.section)} Lyrics`].join(" — ");

      return `
        <section class="song">
          <p class="brand-mark">StageFlow &mdash; by Pinnacle Recording Studio</p>
          <p class="page-header">${escapeHtml(pageHeader)}</p>
          <h2>${escapeHtml(song.title || "Untitled Song")}</h2>
          ${printableLyrics}
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>StageFlow &mdash; Pinnacle Recording Studio</title>
        <style>
          @page { margin: 0.5in; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: Arial, sans-serif;
          }
          body { padding: 0; }
          .shell {
            max-width: 9.5in;
            margin: 0 auto;
          }
          .song {
            break-before: page;
            page-break-before: always;
            margin: 0;
            padding: 0;
            border: 0;
          }
          .song:first-of-type {
            break-before: auto;
            page-break-before: auto;
          }
          .brand-mark {
            margin: 0 0 0.08in;
            font-size: 10px;
            line-height: 1.1;
            font-weight: 500;
            text-align: center;
            color: #4b5563;
          }
          .page-header {
            margin: 0 0 0.14in;
            font-size: 13px;
            line-height: 1.2;
            font-weight: 500;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          h2 {
            margin: 0 0 0.16in;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.2;
            page-break-after: avoid;
            break-after: avoid;
          }
          .lyrics {
            font-size: 18px;
            line-height: 1.2;
          }
          .lyrics-block,
          .chorus-label,
          .chorus-body,
          .chorus-repeat {
            margin-top: 0;
            margin-bottom: 0.25em;
            white-space: pre-wrap;
            line-height: 1.2;
          }
          .lyrics-block:last-child,
          .chorus-block:last-child .chorus-body,
          .chorus-repeat:last-child {
            margin-bottom: 0;
          }
          .chorus-block {
            margin-top: 0;
            margin-bottom: 0.35em;
            padding: 0;
          }
          .chorus-label {
            font-weight: 700;
            margin-top: 0.35em;
            margin-bottom: 0.1em;
          }
          .chorus-body,
          .chorus-repeat {
            font-weight: 700;
          }
          .instrumental-shell {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 55vh;
          }
          .instrumental-label {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main class="shell">
          ${songSections || `<section class="song"><p class="brand-mark">StageFlow &mdash; by Pinnacle Recording Studio</p><p class="page-header">${escapeHtml([showName, formattedShowDate, "Set Lyrics"].join(" — "))}</p><h2>Setlist</h2><div class="lyrics"><p class="lyrics-block">No lyrics available</p></div></section>`}
        </main>
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
  fallbackMp3Path: string | null = null,
): PendingSubmission {
  const mp3Path = extractMp3PathFromNotes(submission.notes) ?? fallbackMp3Path;

  return {
    ...submission,
    key: submission.key ?? null,
    tempo: normalizeSongTempo(submission.tempo),
    song_type: normalizeSongType(submission.song_type),
    submitted_by_name: submission.submitted_by_name ?? null,
    artist: submission.submitted_by_name ?? null,
    song_key: submission.key ?? null,
    notes: stripMp3MarkerFromNotes(submission.notes),
    lyrics: submission.lyrics ?? null,
    mp3_path: mp3Path,
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
  const mp3Path = extractMp3PathFromNotes(song.notes);

  return {
    ...song,
    key: song.key ?? null,
    tempo: normalizeSongTempo(song.tempo),
    song_type: normalizeSongType(song.song_type),
    chart_url: normalizeChartUrl(song.chart_url),
    created_by_role: normalizeSubmittedByRole(song.created_by_role) as SongLibrarySong["created_by_role"],
    created_by_name: song.created_by_name ?? null,
    artist: null,
    song_key: song.key ?? null,
    notes: stripMp3MarkerFromNotes(song.notes),
    lyrics: song.lyrics ?? null,
    mp3_path: mp3Path,
    source_role: normalizeSubmittedByRole(song.created_by_role),
  };
}

function normalizeSponsorLibraryEntry(
  sponsor: SponsorLibraryEntry & { website?: string | null },
): SponsorLibraryEntry {
  const parsedSponsorshipAmount =
    typeof sponsor.sponsorship_amount === "number"
      ? sponsor.sponsorship_amount
      : typeof sponsor.sponsorship_amount === "string"
        ? Number.parseFloat(sponsor.sponsorship_amount)
        : null;
  const parsedEstimatedValue =
    typeof sponsor.estimated_value === "number"
      ? sponsor.estimated_value
      : typeof sponsor.estimated_value === "string"
        ? Number.parseFloat(sponsor.estimated_value)
        : null;

  return {
    ...sponsor,
    website: sponsor.website ?? null,
    logo_url: sponsor.logo_url ?? null,
    sponsor_type: sponsor.sponsor_type ?? null,
    default_contribution: sponsor.default_contribution ?? null,
    estimated_value: Number.isFinite(parsedEstimatedValue) ? parsedEstimatedValue : null,
    recognition_notes: sponsor.recognition_notes ?? null,
    is_archived: sponsor.is_archived ?? false,
    sponsorship_level: sponsor.sponsorship_level ?? null,
    sponsorship_amount: Number.isFinite(parsedSponsorshipAmount) ? parsedSponsorshipAmount : null,
    payment_status: sponsor.payment_status ?? "prospect",
    proposal_generated_at: sponsor.proposal_generated_at ?? null,
    quote_generated_at: sponsor.quote_generated_at ?? null,
    receipt_generated_at: sponsor.receipt_generated_at ?? null,
  };
}

function normalizePotentialSponsorEntry(
  potentialSponsor: PotentialSponsor,
): PotentialSponsor {
  return {
    ...potentialSponsor,
    contact_name: potentialSponsor.contact_name ?? null,
    phone: potentialSponsor.phone ?? null,
    email: potentialSponsor.email ?? null,
    notes: potentialSponsor.notes ?? null,
    status: potentialSponsor.status ?? "Not Contacted",
  };
}

function sortPotentialSponsors(potentialSponsors: PotentialSponsor[]) {
  return [...potentialSponsors].sort((sponsorA, sponsorB) =>
    sponsorB.created_at.localeCompare(sponsorA.created_at),
  );
}

function getPotentialSponsorStatusBadgeClasses(status: PotentialSponsorStatus) {
  switch (status) {
    case "Interested":
    case "Became Sponsor":
      return "bg-emerald-100 text-emerald-800";
    case "Contacted":
    case "Follow Up":
      return "bg-amber-100 text-amber-800";
    case "Passed":
      return "bg-stone-200 text-stone-700";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

function parseSponsorAmountInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = trimmedValue.replace(/[^0-9.-]/g, "");
  const parsedValue = Number.parseFloat(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatNumericInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getSponsorTierBenefits(level: string | null | undefined) {
  switch (level) {
    case "Platinum Sponsor":
      return [
        "Large logo placement on flyers and promotional materials",
        "Recognition on social media and online promotions",
        "Website sponsor listing",
        "Stage mentions during the show",
        "Included in MC sponsor reads",
        "Premium sponsor placement where available",
      ];
    case "Gold Sponsor":
      return [
        "Logo placement on selected promotional materials",
        "Social media recognition",
        "Website sponsor listing",
        "Stage mention during the show",
        "Included in sponsor thank-you mentions",
      ];
    case "Silver Sponsor":
      return [
        "Sponsor listing on promotional materials where space allows",
        "Social media or website recognition",
        "Stage thank-you mention during the show",
      ];
    default:
      return [
        "Sponsor recognition through Cumberland Mountain Music Show promotional and show materials",
        "Stage thank-you mention during the show",
      ];
  }
}

function formatDocumentDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatSponsorPaymentStatusLabel(value: string | null | undefined) {
  const normalizedValue = value?.trim().toLowerCase() ?? "prospect";
  const option = sponsorPaymentStatusOptions.find((status) => status.value === normalizedValue);
  return option?.label ?? "Prospect";
}

function buildSponsorOutreachEmail(sponsorName: string) {
  return `Subject: Cumberland Mountain Music Show Sponsorship Opportunity

Hello ${sponsorName},

I wanted to reach out and invite you to be part of the Cumberland Mountain Music Show as a sponsor.

Your support helps us continue bringing live bluegrass, gospel, traditional country, and acoustic music to our community, while also giving your business recognition through show promotions, social media, stage mentions, and sponsor materials.

We currently have sponsorship options available at the Platinum, Gold, and Silver levels, and I’d be glad to send over more details.

Thank you for considering being part of the show.

— Bryan Turner
Cumberland Mountain Music Show`;
}

function buildSponsorDocumentHtml({
  kind,
  sponsor,
  showName,
  showDate,
  logoUrl,
  coverageLabel,
  contactName,
  proposalNotes,
}: {
  kind: "proposal" | "quote" | "receipt";
  sponsor: SponsorLibraryEntry;
  showName: string;
  showDate: string | null;
  logoUrl: string;
  coverageLabel?: string | null;
  contactName?: string | null;
  proposalNotes?: string | null;
}) {
  const documentTitle =
    kind === "proposal" ? "Sponsorship Proposal" : kind === "quote" ? "Sponsor Quote" : "Sponsor Receipt";
  const sponsorshipLevel = sponsor.sponsorship_level ?? "Custom";
  const sponsorshipAmount =
    sponsor.sponsorship_amount === null ? "To be determined" : formatCurrency(sponsor.sponsorship_amount);
  const benefits = getSponsorTierBenefits(sponsorshipLevel);
  const showDateLabel = formatShowDate(showDate);
  const generatedDateLabel = formatDocumentDate(new Date());
  const receiptReference = `${sponsor.id.slice(0, 8).toUpperCase()}-${new Date().getFullYear()}`;
  const benefitsMarkup = benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("");
  const contactFirstName =
    contactName?.trim().split(/\s+/).find(Boolean)?.replace(/[^A-Za-z'-]/g, "") ?? "";
  const greetingLine = contactFirstName ? `${contactFirstName},` : "Hello,";
  const contactMarkup = contactName?.trim()
    ? `<div class="summary-card"><span>Contact</span><strong>${escapeHtml(contactName.trim())}</strong></div>`
    : "";
  const notesMarkup = proposalNotes?.trim()
    ? `
        <section class="notes-block">
          <h2>Notes</h2>
          <p>${escapeHtml(proposalNotes.trim())}</p>
        </section>
      `
    : "";
  const proposalTierDefinitions = [
    {
      title: "Platinum Sponsor",
      amount: "$500",
      benefits: [
        "Large logo placement on flyers and promotional materials",
        "Recognition on social media and online promotions",
        "Website sponsor listing",
        "Stage mentions during the show",
        "Included in MC sponsor reads",
        "Premium sponsor placement where available",
        "Complimentary show tickets",
      ],
    },
    {
      title: "Gold Sponsor",
      amount: "$250",
      benefits: [
        "Logo placement on selected promotional materials",
        "Social media recognition",
        "Website sponsor listing",
        "Stage mention during the show",
        "Included in sponsor thank-you mentions",
        "Complimentary show tickets",
      ],
    },
    {
      title: "Silver Sponsor",
      amount: "$100",
      benefits: [
        "Sponsor listing on promotional materials where space allows",
        "Social media or website recognition",
        "Stage thank-you mention during the show",
        "Complimentary show tickets",
      ],
    },
  ] as const;
  const selectedProposalTier =
    proposalTierDefinitions.find((tier) => tier.title === sponsorshipLevel) ?? null;
  const selectedProposalBenefits =
    sponsorshipLevel === "Custom"
      ? benefits.length > 0
        ? benefits
        : [
            "Recognition through show promotions where applicable",
            "Stage thank-you mention",
            "Support of local and regional live music",
            "Complimentary show tickets if offered",
          ]
      : selectedProposalTier?.benefits ?? benefits;
  const selectedProposalTitle = selectedProposalTier?.title ?? sponsorshipLevel;
  const selectedProposalAmount =
    sponsorshipLevel === "Custom"
      ? sponsorshipAmount
      : selectedProposalTier?.amount ?? sponsorshipAmount;
  const additionalLevelsMarkup = proposalTierDefinitions
    .filter((tier) => tier.title !== sponsorshipLevel)
    .map(
      (tier) =>
        `<li><strong>${escapeHtml(tier.title)}</strong> — ${escapeHtml(tier.amount)}</li>`,
    )
    .join("");

  const bodyMarkup =
    kind === "proposal"
      ? `
        <section class="proposal-page">
          <div class="header proposal-header">
            <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" />
            <div>
              <div class="brand">Cumberland Mountain Music Show</div>
              <div class="title">Sponsorship Proposal</div>
              <div class="meta">${escapeHtml(sponsor.name)}</div>
            </div>
          </div>
          <p class="greeting">${escapeHtml(greetingLine)}</p>
          <div class="letter-copy">
            <p>I would like to thank you for taking the time to consider support of the Cumberland Mountain Music Show.</p>
            <p>The Cumberland Mountain Music Show was created to bring people together through live music, community, and the musical traditions of our region. Each show gives us the opportunity to showcase local talent, welcome regional guest artists, and provide a stage for young musicians carrying this music forward.</p>
            <p>This show is very personal to me. As a lifelong musician and part of the Turner family's musical roots here in Claiborne County - including the legacy of my Uncle Buster Turner - one of my biggest goals is to help keep that musical heritage alive while creating a place where families, musicians, and neighbors can enjoy bluegrass, gospel, traditional country, and acoustic music together.</p>
            <p>As owner and coordinator of the Cumberland Mountain Music Show, I truly appreciate businesses and community partners who support local music and hometown events. Your sponsorship helps support the continued growth, promotion, and production of the show while creating opportunities for musicians and entertainers throughout our region.</p>
            <section class="community-reach-block">
              <h2>Community Reach &amp; Audience</h2>
              <ul>
                <li>Approximately 150 attendees per show</li>
                <li>Six live shows presented annually</li>
                <li>Entering our third full year of production</li>
                <li>Audience reach throughout East Tennessee, Southeastern Kentucky, and Southwest Virginia</li>
                <li>Strong regional Facebook engagement with promotional campaigns often reaching thousands of viewers per event</li>
                <li>Proud partnership support from Lincoln Memorial University, DeRoyal, Hearthside Bank, Giles Industries, and other local business sponsors</li>
              </ul>
            </section>
            <p>We would be honored to have ${escapeHtml(sponsor.name)} become part of the Cumberland Mountain Music Show family.</p>
          </div>
          <p class="signoff">With sincere appreciation,</p>
          <p class="signoff">Bryan Turner<br />Owner &amp; Coordinator<br />Cumberland Mountain Music Show<br />(423) 449-9150<br />bryan@pinnaclestudiotn.com</p>
        </section>
        <section class="proposal-page proposal-page-break">
          <div class="header proposal-header">
            <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" />
            <div>
              <div class="brand">Cumberland Mountain Music Show</div>
              <div class="title">Sponsorship Proposal</div>
              <div class="meta">${escapeHtml(sponsor.name)}</div>
            </div>
          </div>
          <div class="summary-grid proposal-summary-grid">
            <div class="summary-card proposal-summary-card"><span>Business</span><strong>${escapeHtml(sponsor.name)}</strong></div>
            <div class="summary-card proposal-summary-card"><span>Sponsorship level</span><strong>${escapeHtml(sponsorshipLevel)}</strong></div>
            <div class="summary-card proposal-summary-card"><span>Amount</span><strong>${escapeHtml(sponsorshipAmount)}</strong></div>
            <div class="summary-card proposal-summary-card"><span>Coverage</span><strong>${escapeHtml(coverageLabel ?? showName)}</strong></div>
            ${contactMarkup ? contactMarkup.replace('summary-card', 'summary-card proposal-summary-card') : ""}
          </div>
          <h2>Selected Sponsorship Level</h2>
          <article class="tier-card selected-tier-card">
            <div class="tier-header">
              <h3>${escapeHtml(selectedProposalTitle)}</h3>
              <p>${escapeHtml(selectedProposalAmount)}</p>
            </div>
            <ul>
              ${selectedProposalBenefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("")}
            </ul>
          </article>
          <section class="additional-levels">
            <h2>Other available sponsorship levels:</h2>
            <ul>${additionalLevelsMarkup}</ul>
          </section>
          <section class="support-note">
            <p>Sponsorship support helps fund the continued promotion, production, and growth of Cumberland Mountain Music Show events throughout the selected show or season.</p>
          </section>
          <section class="payment-note">
            <p>If you decide to support the show, checks may be made payable to:</p>
            <p><strong>The Cumberland Mountain Music Show</strong></p>
            <p class="payment-address-label">Mailing Address:</p>
            <p>319 Cowan Lane<br />LaFollette, TN 37766</p>
          </section>
          ${notesMarkup}
        </section>
      `
      : kind === "quote"
        ? `
        <div class="header">
          <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" />
          <div>
            <div class="brand">Cumberland Mountain Music Show</div>
            <div class="title">${escapeHtml(documentTitle)}</div>
            <div class="meta">${escapeHtml(sponsor.name)}</div>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>Sponsor</span><strong>${escapeHtml(sponsor.name)}</strong></div>
          <div class="summary-card"><span>Sponsorship level</span><strong>${escapeHtml(sponsorshipLevel)}</strong></div>
          <div class="summary-card"><span>Amount</span><strong>${escapeHtml(sponsorshipAmount)}</strong></div>
          <div class="summary-card"><span>Quote date</span><strong>${escapeHtml(generatedDateLabel)}</strong></div>
        </div>
        <p class="lead">Thank you for considering sponsorship support for the Cumberland Mountain Music Show.</p>
        <p><strong>Show:</strong> ${escapeHtml(showName)}${showDateLabel ? ` on ${escapeHtml(showDateLabel)}` : ""}</p>
        <h2>Included Benefits</h2>
        <ul>${benefitsMarkup}</ul>
        <p>We appreciate the opportunity to partner with sponsors who support live acoustic music in our region.</p>
      `
        : `
        <div class="header">
          <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" />
          <div>
            <div class="brand">Cumberland Mountain Music Show</div>
            <div class="title">${escapeHtml(documentTitle)}</div>
            <div class="meta">${escapeHtml(sponsor.name)}</div>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>Sponsor</span><strong>${escapeHtml(sponsor.name)}</strong></div>
          <div class="summary-card"><span>Sponsorship level</span><strong>${escapeHtml(sponsorshipLevel)}</strong></div>
          <div class="summary-card"><span>Amount paid</span><strong>${escapeHtml(sponsorshipAmount)}</strong></div>
          <div class="summary-card"><span>Receipt date</span><strong>${escapeHtml(generatedDateLabel)}</strong></div>
        </div>
        <p><strong>Show supported:</strong> ${escapeHtml(showName)}${showDateLabel ? ` on ${escapeHtml(showDateLabel)}` : ""}</p>
        <p><strong>Payment status:</strong> ${escapeHtml(formatSponsorPaymentStatusLabel(sponsor.payment_status))}</p>
        <p><strong>Receipt reference:</strong> ${escapeHtml(receiptReference)}</p>
        <p class="lead">Thank you for supporting the Cumberland Mountain Music Show. Your partnership helps us continue bringing live music to our community.</p>
      `;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(`${sponsor.name} - ${documentTitle}`)}</title>
        <style>
          body { margin: 28px; color: #111827; font-family: Arial, sans-serif; background: #ffffff; }
          h1, h2, h3, p { margin: 0; }
          .header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
          .header img { display: block; width: 88px; height: auto; object-fit: contain; flex-shrink: 0; }
          .brand { font-size: 14px; font-weight: 700; color: #047857; }
          .title { margin-top: 4px; font-size: 28px; font-weight: 700; }
          .meta { margin-top: 6px; color: #4b5563; font-size: 14px; }
          .lead { margin: 16px 0; line-height: 1.55; }
          .greeting { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
          .letter-copy { display: flex; flex-direction: column; gap: 10px; }
          .letter-copy p { line-height: 1.5; }
          .community-reach-block { border-top: 1px solid #d6d3d1; padding-top: 8px; }
          .community-reach-block h2 { margin: 0 0 6px; font-size: 17px; }
          .community-reach-block ul { margin: 0; padding-left: 18px; line-height: 1.35; }
          .community-reach-block li + li { margin-top: 2px; }
          .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0 22px; }
          .summary-card { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px 14px; background: #f9fafb; }
          .summary-card span { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
          .summary-card strong { display: block; margin-top: 6px; font-size: 18px; }
          h2 { margin: 22px 0 12px; font-size: 20px; }
          h3 { font-size: 18px; margin: 0; }
          p { line-height: 1.6; }
          ul { margin: 0; padding-left: 20px; line-height: 1.6; }
          .signoff { margin-top: 12px; line-height: 1.4; }
          .proposal-page { min-height: calc(100vh - 64px); }
          .proposal-page-break { break-before: page; page-break-before: always; }
          .proposal-header { margin-bottom: 18px; }
          .proposal-summary-grid { margin-bottom: 24px; }
          .proposal-summary-card { background: transparent; border: 0; border-bottom: 1px solid #d6d3d1; border-radius: 0; padding: 0 0 10px; }
          .tier-grid { display: grid; gap: 14px; }
          .tier-card { border-top: 2px solid #111827; border-bottom: 1px solid #d6d3d1; border-left: 0; border-right: 0; border-radius: 0; padding: 14px 0; background: #ffffff; break-inside: avoid; page-break-inside: avoid; }
          .selected-tier-card { margin-bottom: 18px; }
          .tier-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
          .tier-header p { font-size: 16px; font-weight: 700; }
          .additional-levels { margin-top: 18px; border-top: 1px solid #d6d3d1; padding-top: 14px; }
          .additional-levels ul { margin-top: 8px; }
          .support-note { margin-top: 18px; color: #374151; }
          .payment-note { margin-top: 18px; border-top: 1px solid #d6d3d1; padding-top: 14px; }
          .payment-note p + p { margin-top: 6px; }
          .payment-address-label { margin-top: 10px; font-weight: 700; }
          .selected-benefits,
          .additional-levels,
          .support-note,
          .payment-note,
          .notes-block { break-inside: avoid; page-break-inside: avoid; }
          @media print {
            body { margin: 16px; }
            img { display: block !important; }
            .proposal-page { min-height: auto; }
          }
        </style>
      </head>
      <body>
        ${bodyMarkup}
      </body>
    </html>
  `;
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

async function uploadSongMp3File({
  file,
  showSlug,
  songId,
}: {
  file: File;
  showSlug: string;
  songId: string;
}) {
  const validationError = validateSongMp3File(file);

  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = createClient();
  const filePath = buildSongMp3StoragePath(showSlug, songId);
  const { error: uploadError } = await supabase.storage
    .from(SONG_AUDIO_BUCKET)
    .upload(filePath, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    throw uploadError;
  }

  return filePath;
}

async function deletePromoMaterialFile(filePath: string | null | undefined) {
  if (!filePath) {
    return;
  }

  const supabase = createClient();
  await supabase.storage.from(SONG_AUDIO_BUCKET).remove([filePath]);
}

async function updateSongNotesField<RowType>({
  table,
  rowId,
  notes,
  currentRow,
}: {
  table: "songs" | "show_guest_songs";
  rowId: string;
  notes: string | null;
  currentRow: RowType;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .update({
      notes,
    })
    .eq("id", rowId);

  if (error) {
    throw error;
  }

  return {
    ...currentRow,
    notes,
  } as RowType;
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
  const parsedEstimatedValue =
    typeof sponsor.estimated_value === "number"
      ? sponsor.estimated_value
      : typeof sponsor.estimated_value === "string"
        ? Number.parseFloat(sponsor.estimated_value)
        : null;

  return {
    ...sponsor,
    sponsor_type: sponsor.sponsor_type ?? null,
    default_contribution: sponsor.default_contribution ?? null,
    estimated_value: Number.isFinite(parsedEstimatedValue) ? parsedEstimatedValue : null,
    recognition_notes: sponsor.recognition_notes ?? null,
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

function getShowSponsorTypeLabel(sponsor: ShowSponsor) {
  return sponsor.sponsor_type?.trim() || sponsor.sponsor?.sponsor_type?.trim() || null;
}

function getShowSponsorContributionText(sponsor: ShowSponsor) {
  return sponsor.default_contribution?.trim() || sponsor.sponsor?.default_contribution?.trim() || null;
}

function getShowSponsorRecognitionNotesText(sponsor: ShowSponsor) {
  return sponsor.recognition_notes?.trim() || sponsor.sponsor?.recognition_notes?.trim() || null;
}

function getShowSponsorEstimatedValue(sponsor: ShowSponsor) {
  if (typeof sponsor.estimated_value === "number" && Number.isFinite(sponsor.estimated_value)) {
    return sponsor.estimated_value;
  }

  if (
    typeof sponsor.sponsor?.estimated_value === "number" &&
    Number.isFinite(sponsor.sponsor.estimated_value)
  ) {
    return sponsor.sponsor.estimated_value;
  }

  return null;
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

function getSetlistSongMp3Path(
  song: SetlistSong,
  songLibrary: SongLibrarySong[],
  pendingSongs: PendingSubmission[],
) {
  if (song.mp3_path) {
    return song.mp3_path;
  }

  if (song.source_type === "library" && song.song_id) {
    return songLibrary.find((librarySong) => librarySong.id === song.song_id)?.mp3_path ?? null;
  }

  if (song.source_type === "guest" && song.guest_song_id) {
    return pendingSongs.find((pendingSong) => pendingSong.id === song.guest_song_id)?.mp3_path ?? null;
  }

  return null;
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

function SongMp3DownloadButton({
  title,
  mp3Path,
}: {
  title: string;
  mp3Path: string | null | undefined;
}) {
  const downloadUrl = getSongMp3DownloadUrl(mp3Path);

  if (!downloadUrl) {
    return null;
  }

  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noreferrer"
      download
      className="print-hidden inline-flex w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
    >
      Download MP3
      <span className="sr-only"> for {title}</span>
    </a>
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
  lockedGuestProfileId?: string | null;
  isPrivateGuestPortal?: boolean;
};

type GuestPortalStatus = {
  key: "not-opened" | "opened" | "submitted";
  label: string;
  openedAt: string | null;
  lastReminderSentAt: string | null;
  submittedSongsCount: number;
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
  lockedGuestProfileId = null,
  isPrivateGuestPortal = false,
}: ShowPageProps) {
  const requestedAdminTab = normalizeAdminTab(initialAdminTab);
  const shouldOpenPayoutsInsideFinance = initialAdminTab === "payouts";
  const [viewMode, setViewMode] = useState<ViewMode>(initialRole);
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>(
    requestedAdminTab ?? (shouldOpenPayoutsInsideFinance ? "finance" : "overview"),
  );
  const [activeBandTab, setActiveBandTab] = useState<BandTab>("setlist");
  const [activeGuestTab, setActiveGuestTab] = useState<GuestTab>("welcome");
  const [activeSponsorAdminTab, setActiveSponsorAdminTab] = useState<SponsorAdminTab>("library");
  const [activeFinanceAdminSubTab, setActiveFinanceAdminSubTab] = useState<FinanceAdminSubTab>(
    shouldOpenPayoutsInsideFinance ? "payouts" : "reporting",
  );
  const [printMode, setPrintMode] = useState<PrintMode>("standard");
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [setlist, setSetlist] = useState<SetlistSong[]>([]);
  const [formState, setFormState] = useState<SongFormState>(initialFormState);
  const [songMp3File, setSongMp3File] = useState<File | null>(null);
  const [songMp3InputKey, setSongMp3InputKey] = useState(0);
  const [showDetailsFormState, setShowDetailsFormState] = useState<ShowDetailsFormState>(
    initialShowDetailsFormState,
  );
  const [guestProfileFormState, setGuestProfileFormState] = useState<GuestProfileFormState>(
    initialGuestProfileFormState,
  );
  const [guestPhotoFile, setGuestPhotoFile] = useState<File | null>(null);
  const [editingGuestProfileId, setEditingGuestProfileId] = useState<string | null>(null);
  const [selectedGuestProfileId, setSelectedGuestProfileId] = useState<string>(
    lockedGuestProfileId ?? "",
  );
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [mcBlockNotes, setMcBlockNotes] = useState<McBlockNote[]>([]);
  const [pendingSongs, setPendingSongs] = useState<PendingSubmission[]>([]);
  const [songLibrary, setSongLibrary] = useState<SongLibrarySong[]>([]);
  const [libraryTempoFilter, setLibraryTempoFilter] = useState<"" | SongTempo>("");
  const [librarySongTypeFilter, setLibrarySongTypeFilter] = useState<"" | SongType>("");
  const [sponsorLibrary, setSponsorLibrary] = useState<SponsorLibraryEntry[]>([]);
  const [potentialSponsors, setPotentialSponsors] = useState<PotentialSponsor[]>([]);
  const [showSponsors, setShowSponsors] = useState<ShowSponsor[]>([]);
  const [showChecklistItems, setShowChecklistItems] = useState<ShowChecklistItem[]>([]);
  const [isShowChecklistOpen, setIsShowChecklistOpen] = useState(false);
  const [newChecklistTask, setNewChecklistTask] = useState("");
  const [activeChecklistActionId, setActiveChecklistActionId] = useState<string | null>(null);
  const [financeItems, setFinanceItems] = useState<ShowFinanceItem[]>([]);
  const [payoutItems, setPayoutItems] = useState<ShowPayoutItem[]>([]);
  const [payoutFormState, setPayoutFormState] = useState<PayoutFormState>(initialPayoutFormState);
  const [editingPayoutItemId, setEditingPayoutItemId] = useState<string | null>(null);
  const [editingPayoutFormState, setEditingPayoutFormState] = useState<PayoutFormState>(initialPayoutFormState);
  const [payoutStatusMessage, setPayoutStatusMessage] = useState<string | null>(null);
  const [payoutErrorMessage, setPayoutErrorMessage] = useState<string | null>(null);
  const [activePayoutActionId, setActivePayoutActionId] = useState<string | null>(null);
  const [isGuestPayoutQuickAddOpen, setIsGuestPayoutQuickAddOpen] = useState(false);
  const [yearlyFinanceShows, setYearlyFinanceShows] = useState<ShowRecord[]>([]);
  const [yearlyFinanceItems, setYearlyFinanceItems] = useState<ShowFinanceItem[]>([]);
  const [selectedYearlyFinanceYear, setSelectedYearlyFinanceYear] = useState(() => new Date().getUTCFullYear());
  const [isYearlyFinanceSummaryExpanded, setIsYearlyFinanceSummaryExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const storedValue = window.localStorage.getItem("stageflow-yearly-finance-summary-expanded");
    return storedValue === null ? false : storedValue === "true";
  });
  const [yearlyFinanceErrorMessage, setYearlyFinanceErrorMessage] = useState<string | null>(null);
  const [isPrintingYearlyFinanceReport, setIsPrintingYearlyFinanceReport] = useState(false);
  const [hasLoadedYearlyFinanceSummary, setHasLoadedYearlyFinanceSummary] = useState(false);
  const [incomeFinanceFormState, setIncomeFinanceFormState] =
    useState<FinanceItemFormState>(initialFinanceItemFormState);
  const [expenseFinanceFormState, setExpenseFinanceFormState] =
    useState<FinanceItemFormState>(initialFinanceItemFormState);
  const [editingFinanceItemId, setEditingFinanceItemId] = useState<string | null>(null);
  const [editingFinanceItemFormState, setEditingFinanceItemFormState] =
    useState<FinanceItemFormState>(initialFinanceItemFormState);
  const [promoMaterials, setPromoMaterials] = useState<PromoMaterial[]>([]);
  const [promoMaterialFormState, setPromoMaterialFormState] = useState<PromoMaterialFormState>(
    initialPromoMaterialFormState,
  );
  const [promoMaterialFile, setPromoMaterialFile] = useState<File | null>(null);
  const [editingPromoMaterialId, setEditingPromoMaterialId] = useState<string | null>(null);
  const [promoMaterialEditFormState, setPromoMaterialEditFormState] =
    useState<PromoMaterialFormState>(initialPromoMaterialFormState);
  const [editingPromoMaterialFile, setEditingPromoMaterialFile] = useState<File | null>(null);
  const [expandedMcBlockNoteIds, setExpandedMcBlockNoteIds] = useState<string[]>([]);
  const [editingPoolSongId, setEditingPoolSongId] = useState<string | null>(null);
  const [editingSetlistSongId, setEditingSetlistSongId] = useState<string | null>(null);
  const [editingLibrarySongId, setEditingLibrarySongId] = useState<string | null>(null);
  const [librarySongMp3File, setLibrarySongMp3File] = useState<File | null>(null);
  const [librarySongMp3InputKey, setLibrarySongMp3InputKey] = useState(0);
  const [openLibraryLyricsSongId, setOpenLibraryLyricsSongId] = useState<string | null>(null);
  const [isBandSongFormOpen, setIsBandSongFormOpen] = useState(false);
  const [isAdminSongFormOpen, setIsAdminSongFormOpen] = useState(false);
  const [isGuestSongFormOpen, setIsGuestSongFormOpen] = useState(false);
  const [poolSongMp3File, setPoolSongMp3File] = useState<File | null>(null);
  const [poolSongMp3InputKey, setPoolSongMp3InputKey] = useState(0);
  const [editingSponsorLibraryId, setEditingSponsorLibraryId] = useState<string | null>(null);
  const [expandedSponsorLibraryCardId, setExpandedSponsorLibraryCardId] = useState<string | null>(null);
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
    chartUrl: "",
  });
  const [sponsorLibraryFormState, setSponsorLibraryFormState] = useState<SponsorLibraryFormState>(
    initialSponsorLibraryFormState,
  );
  const [newSponsorLibraryFormState, setNewSponsorLibraryFormState] =
    useState<SponsorLibraryFormState>(initialSponsorLibraryFormState);
  const [isAddSponsorFormOpen, setIsAddSponsorFormOpen] = useState(false);
  const [isAddShowSponsorFormOpen, setIsAddShowSponsorFormOpen] = useState(false);
  const [isSponsorProposalGeneratorOpen, setIsSponsorProposalGeneratorOpen] = useState(false);
  const [isPotentialSponsorsOpen, setIsPotentialSponsorsOpen] = useState(false);
  const [isPotentialSponsorFormOpen, setIsPotentialSponsorFormOpen] = useState(false);
  const [editingPotentialSponsorId, setEditingPotentialSponsorId] = useState<string | null>(null);
  const [potentialSponsorFormState, setPotentialSponsorFormState] =
    useState<PotentialSponsorFormState>(initialPotentialSponsorFormState);
  const [showArchivedSponsors, setShowArchivedSponsors] = useState(false);
  const [sponsorProposalGeneratorFormState, setSponsorProposalGeneratorFormState] =
    useState<SponsorProposalGeneratorFormState>(initialSponsorProposalGeneratorFormState);
  const [sponsorDocumentFormStates, setSponsorDocumentFormStates] = useState<
    Record<string, SponsorDocumentFormState>
  >({});
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
  const [financeStatusMessage, setFinanceStatusMessage] = useState<string | null>(null);
  const [financeErrorMessage, setFinanceErrorMessage] = useState<string | null>(null);
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
  const [activeFinanceActionId, setActiveFinanceActionId] = useState<string | null>(null);
  const [activeSetlistActionId, setActiveSetlistActionId] = useState<string | null>(null);
  const [activeLibraryDeleteSongId, setActiveLibraryDeleteSongId] = useState<string | null>(null);
  const [activeSponsorActionId, setActiveSponsorActionId] = useState<string | null>(null);
  const [activePromoMaterialActionId, setActivePromoMaterialActionId] = useState<string | null>(null);
  const [isSavingPromoMaterial, setIsSavingPromoMaterial] = useState(false);
  const [promoMaterialMessage, setPromoMaterialMessage] = useState<string | null>(null);
  const [promoMaterialError, setPromoMaterialError] = useState<string | null>(null);
  const [copiedPromoTextKey, setCopiedPromoTextKey] = useState<string | null>(null);
  const [copiedSongLinkId, setCopiedSongLinkId] = useState<string | null>(null);
  const [copiedGuestProfileLinkId, setCopiedGuestProfileLinkId] = useState<string | null>(null);
  const [copiedBandSetlistLink, setCopiedBandSetlistLink] = useState(false);
  const [copiedGuestSongsLink, setCopiedGuestSongsLink] = useState(false);
  const [copiedGuestReminderEmailId, setCopiedGuestReminderEmailId] = useState<string | null>(null);
  const [copiedGuestShortTextId, setCopiedGuestShortTextId] = useState<string | null>(null);
  const [activeGuestAppearanceSaveId, setActiveGuestAppearanceSaveId] = useState<string | null>(null);
  const [activeGuestConfirmationSaveId, setActiveGuestConfirmationSaveId] = useState<string | null>(null);
  const [sponsorDeleteConfirmId, setSponsorDeleteConfirmId] = useState<string | null>(null);
  const [sponsorDeleteConfirmText, setSponsorDeleteConfirmText] = useState("");

  const activeSponsorLibrary = useMemo(
    () => sponsorLibrary.filter((sponsor) => !sponsor.is_archived),
    [sponsorLibrary],
  );
  const archivedSponsorLibrary = useMemo(
    () => sponsorLibrary.filter((sponsor) => sponsor.is_archived),
    [sponsorLibrary],
  );
  const visibleSponsorLibrary = useMemo(
    () => (showArchivedSponsors ? sponsorLibrary : activeSponsorLibrary),
    [activeSponsorLibrary, showArchivedSponsors, sponsorLibrary],
  );

  useEffect(() => {
    if (viewMode !== "guest" || !lockedGuestProfileId) {
      return;
    }

    const lockedProfile = guestProfiles.find((profile) => profile.id === lockedGuestProfileId);

    if (!lockedProfile) {
      return;
    }

    setSelectedGuestProfileId(lockedProfile.id);
    setEditingGuestProfileId(lockedProfile.id);
    setGuestProfileFormState(buildGuestProfileFormStateFromProfile(lockedProfile));
  }, [guestProfiles, lockedGuestProfileId, viewMode]);

  const formHeading =
    viewMode === "guest" ? "Submit Your Song Choice" : "Suggest a Song for the Show";
  const portalLabel = getPortalLabel(viewMode);
  const shouldShowPortalLogo = viewMode === "guest" || viewMode === "band" || viewMode === "admin";
  const isAdminView = viewMode === "admin";
  const isBandView = viewMode === "band";
  const isGuestView = viewMode === "guest";
  const shouldShowAdminSongSubmission =
    isAdminView && activeAdminTab === "songs";
  const shouldShowBandSongTools = isBandView && activeBandTab === "songs";
  const shouldShowGuestWelcomeTab = isGuestView && activeGuestTab === "welcome";
  const shouldShowGuestSongsTab = isGuestView && activeGuestTab === "songs";
  const shouldShowGuestArtistInfoTab = isGuestView && activeGuestTab === "artist-info";
  const shouldShowGuestItineraryTab = isGuestView && activeGuestTab === "itinerary";
  const shouldShowGuestPromoMaterialsTab = isGuestView && activeGuestTab === "promo-materials";
  const shouldShowBandPromoMaterialsTab = isBandView && activeBandTab === "promo-materials";
  const shouldShowAdminFinanceTab = isAdminView && activeAdminTab === "finance";
  const shouldShowFinanceReportingSubTab =
    shouldShowAdminFinanceTab && activeFinanceAdminSubTab === "reporting";
  const shouldShowFinancePayoutSubTab =
    shouldShowAdminFinanceTab && activeFinanceAdminSubTab === "payouts";
  const shouldShowSongSubmissionForm = shouldShowAdminSongSubmission;
  const visiblePromoMaterials = promoMaterials.filter((material) => material.is_visible);
  const totalIncome = useMemo(
    () =>
      financeItems
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + item.amount, 0),
    [financeItems],
  );
  const totalExpenses = useMemo(
    () =>
      financeItems
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0),
    [financeItems],
  );
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = formatProfitMargin(totalIncome, netProfit);
  const incomeFinanceItems = useMemo(
    () => financeItems.filter((item) => item.type === "income"),
    [financeItems],
  );
  const expenseFinanceItems = useMemo(
    () => financeItems.filter((item) => item.type === "expense"),
    [financeItems],
  );
  const payoutTotalAmount = useMemo(
    () => payoutItems.reduce((sum, item) => sum + item.amount, 0),
    [payoutItems],
  );
  const payoutItemsByCategory = useMemo(() => {
    return payoutCategoryOptions
      .map((category) => ({
        category,
        items: payoutItems.filter((item) => (item.category ?? "Other Expense") === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [payoutItems]);
  const availableYearlyFinanceYears = useMemo(() => {
    const years = new Set<number>([new Date().getUTCFullYear()]);

    yearlyFinanceShows.forEach((currentShowRecord) => {
      const showYear = getShowYear(currentShowRecord.show_date);

      if (showYear !== null) {
        years.add(showYear);
      }
    });

    return Array.from(years).sort((left, right) => right - left);
  }, [yearlyFinanceShows]);
  const selectedYearlyFinanceShows = useMemo(
    () =>
      yearlyFinanceShows.filter(
        (currentShowRecord) => getShowYear(currentShowRecord.show_date) === selectedYearlyFinanceYear,
      ),
    [selectedYearlyFinanceYear, yearlyFinanceShows],
  );
  const yearlyFinanceSummary = useMemo(() => {
    const itemsByShowId = new Map<string, ShowFinanceItem[]>();
    const selectedYearShowLookup = new Map(selectedYearlyFinanceShows.map((currentShowRecord) => [currentShowRecord.id, currentShowRecord]));

    yearlyFinanceItems.forEach((item) => {
      const currentItems = itemsByShowId.get(item.show_id) ?? [];
      currentItems.push(item);
      itemsByShowId.set(item.show_id, currentItems);
    });

    const showBreakdown = selectedYearlyFinanceShows.map((currentShowRecord) => {
      const showItems = itemsByShowId.get(currentShowRecord.id) ?? [];
      const income = showItems
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + item.amount, 0);
      const expenses = showItems
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        show: currentShowRecord,
        income,
        expenses,
        net: income - expenses,
      };
    });

    const summaryTotalIncome = showBreakdown.reduce((sum, item) => sum + item.income, 0);
    const summaryTotalExpenses = showBreakdown.reduce((sum, item) => sum + item.expenses, 0);
    const summaryNet = summaryTotalIncome - summaryTotalExpenses;
    const selectedYearItems = yearlyFinanceItems
      .filter((item) => selectedYearShowLookup.has(item.show_id))
      .map((item) => ({
        ...item,
        showName: selectedYearShowLookup.get(item.show_id)?.name ?? "Unknown show",
        showDate: selectedYearShowLookup.get(item.show_id)?.show_date ?? null,
      }));

    const categoryTotals = yearlyFinanceItems.reduce<Record<string, number>>((totals, item) => {
      const matchingShow = selectedYearlyFinanceShows.find((currentShowRecord) => currentShowRecord.id === item.show_id);

      if (!matchingShow || !item.category?.trim()) {
        return totals;
      }

      const key = `${item.type}:${item.category.trim()}`;
      totals[key] = (totals[key] ?? 0) + item.amount;
      return totals;
    }, {});

    const buildCategoryGroups = (type: ShowFinanceItem["type"]) => {
      const groups = selectedYearItems.reduce<Record<string, YearlyFinanceReportCategoryGroup>>((lookup, item) => {
        if (item.type !== type) {
          return lookup;
        }

        const category = item.category?.trim() || "Uncategorized";
        const existingGroup = lookup[category] ?? {
          category,
          total: 0,
          items: [],
        };

        existingGroup.total += item.amount;
        existingGroup.items.push(item);
        lookup[category] = existingGroup;
        return lookup;
      }, {});

      return Object.values(groups)
        .map((group) => ({
          ...group,
          items: [...group.items].sort((left, right) => {
            if (left.showDate && right.showDate) {
              return left.showDate.localeCompare(right.showDate);
            }
            if (left.showDate) {
              return -1;
            }
            if (right.showDate) {
              return 1;
            }
            return left.label.localeCompare(right.label);
          }),
        }))
        .sort((left, right) => right.total - left.total);
    };

    const quickTotals = yearlyFinanceQuickTotalDefinitions
      .map((definition) => {
        const amount = selectedYearItems.reduce((sum, item) => {
          if (item.type !== definition.type) {
            return sum;
          }
          const categoryLabel = normalizeFinanceCategoryLabel(item.category);
          return definition.matchers.some((matcher) => categoryLabel.includes(matcher))
            ? sum + item.amount
            : sum;
        }, 0);

        return { key: definition.key, label: definition.label, amount };
      })
      .filter((item) => item.amount > 0);

    return {
      totalIncome: summaryTotalIncome,
      totalExpenses: summaryTotalExpenses,
      net: summaryNet,
      showBreakdown,
      incomeGroups: buildCategoryGroups("income"),
      expenseGroups: buildCategoryGroups("expense"),
      quickTotals,
      categoryTotals: Object.entries(categoryTotals)
        .map(([key, amount]) => {
          const separatorIndex = key.indexOf(":");
          return {
            type: key.slice(0, separatorIndex),
            category: key.slice(separatorIndex + 1),
            amount,
          };
        })
        .sort((left, right) => right.amount - left.amount),
    };
  }, [selectedYearlyFinanceShows, selectedYearlyFinanceYear, yearlyFinanceItems]);
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
  const songLibraryById = useMemo(
    () =>
      songLibrary.reduce<Record<string, SongLibrarySong>>((lookup, song) => {
        lookup[song.id] = song;
        return lookup;
      }, {}),
    [songLibrary],
  );
  const librarySongSetlistUsageCounts = useMemo(
    () =>
      setlist.reduce<Record<string, number>>((usageCounts, song) => {
        if (song.source_type === "library" && song.song_id) {
          usageCounts[song.song_id] = (usageCounts[song.song_id] ?? 0) + 1;
        }

        return usageCounts;
      }, {}),
    [setlist],
  );
  const guestSongSetlistUsageCounts = useMemo(
    () =>
      setlist.reduce<Record<string, number>>((usageCounts, song) => {
        if (song.source_type === "guest" && song.guest_song_id) {
          usageCounts[song.guest_song_id] = (usageCounts[song.guest_song_id] ?? 0) + 1;
        }

        return usageCounts;
      }, {}),
    [setlist],
  );
  const submittedGuestSongsCount = useMemo(
    () =>
      pendingSongs.filter(
        (song) => normalizeSubmittedByRole(song.submitted_by_role) === "guest",
      ).length,
    [pendingSongs],
  );
  const guestsMissingSongsCount = useMemo(
    () =>
      guestProfiles.filter(
        (profile) => getGuestProfilePortalStatus(profile, pendingSongs).submittedSongsCount === 0,
      ).length,
    [guestProfiles, pendingSongs],
  );
  const guestsMissingPromoInfoCount = useMemo(
    () =>
      guestProfiles.filter(
        (profile) => !profile.short_bio?.trim() || !profile.photo_url?.trim(),
      ).length,
    [guestProfiles],
  );
  const unconfirmedGuestsCount = useMemo(
    () => guestProfiles.filter((profile) => !profile.is_confirmed).length,
    [guestProfiles],
  );

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

  function handlePrintSetLyrics() {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert("The print window was blocked. Please allow pop-ups and try again.");
      return;
    }

    const printHtml = buildStageFlowSetLyricsPrintHtml(
      show?.name ?? "Show",
      show?.show_date ?? null,
      setlist,
    );
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

  function handleFinanceFormChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    type: FinanceItemType,
    mode: "new" | "edit",
  ) {
    const { name, value } = event.target;

    if (mode === "edit") {
      setEditingFinanceItemFormState((currentState) => ({
        ...currentState,
        [name]: value,
      }));
      return;
    }

    const setState = type === "income" ? setIncomeFinanceFormState : setExpenseFinanceFormState;
    setState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function startEditingFinanceItem(item: ShowFinanceItem) {
    setEditingFinanceItemId(item.id);
    setEditingFinanceItemFormState(buildFinanceItemFormState(item));
    setFinanceErrorMessage(null);
    setFinanceStatusMessage(null);
  }

  function cancelEditingFinanceItem() {
    setEditingFinanceItemId(null);
    setEditingFinanceItemFormState(initialFinanceItemFormState);
  }

  async function handleCreateFinanceItem(event: FormEvent<HTMLFormElement>, type: FinanceItemType) {
    event.preventDefault();

    if (!show) {
      setFinanceErrorMessage("The show is not loaded yet.");
      return;
    }

    const formState = type === "income" ? incomeFinanceFormState : expenseFinanceFormState;
    const label = formState.label.trim();
    const amount = parseFinanceAmountInput(formState.amount);

    if (!label) {
      setFinanceErrorMessage("Add a label or description for this finance item.");
      return;
    }

    if (amount === null) {
      setFinanceErrorMessage("Enter a valid dollar amount.");
      return;
    }

    setFinanceErrorMessage(null);
    setFinanceStatusMessage(null);
    setActiveFinanceActionId(`create-${type}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_finance_items")
        .insert({
          show_id: show.id,
          type,
          category: normalizeOptionalField(formState.category),
          label,
          amount,
          notes: normalizeOptionalField(formState.notes),
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setFinanceItems((currentItems) =>
        sortFinanceItems([normalizeShowFinanceItem(data as ShowFinanceItem), ...currentItems]),
      );

      if (type === "income") {
        setIncomeFinanceFormState(initialFinanceItemFormState);
      } else {
        setExpenseFinanceFormState(initialFinanceItemFormState);
      }

      setFinanceStatusMessage(
        type === "income" ? "Income item added." : "Expense item added.",
      );
    } catch (error) {
      setFinanceErrorMessage(getErrorMessage(error));
    } finally {
      setActiveFinanceActionId(null);
    }
  }

  async function handleSaveFinanceItem(item: ShowFinanceItem) {
    if (!show) {
      setFinanceErrorMessage("The show is not loaded yet.");
      return;
    }

    const label = editingFinanceItemFormState.label.trim();
    const amount = parseFinanceAmountInput(editingFinanceItemFormState.amount);

    if (!label) {
      setFinanceErrorMessage("Add a label or description for this finance item.");
      return;
    }

    if (amount === null) {
      setFinanceErrorMessage("Enter a valid dollar amount.");
      return;
    }

    setFinanceErrorMessage(null);
    setFinanceStatusMessage(null);
    setActiveFinanceActionId(`edit-${item.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_finance_items")
        .update({
          category: normalizeOptionalField(editingFinanceItemFormState.category),
          label,
          amount,
          notes: normalizeOptionalField(editingFinanceItemFormState.notes),
        })
        .eq("id", item.id)
        .eq("show_id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setFinanceItems((currentItems) =>
        sortFinanceItems(
          currentItems.map((currentItem) =>
            currentItem.id === item.id
              ? normalizeShowFinanceItem(data as ShowFinanceItem)
              : currentItem,
          ),
        ),
      );
      cancelEditingFinanceItem();
      setFinanceStatusMessage("Finance item updated.");
    } catch (error) {
      setFinanceErrorMessage(getErrorMessage(error));
    } finally {
      setActiveFinanceActionId(null);
    }
  }

  async function handleDeleteFinanceItem(item: ShowFinanceItem) {
    if (!show) {
      setFinanceErrorMessage("The show is not loaded yet.");
      return;
    }

    const confirmed = window.confirm(
      `Delete this finance item?\n\n${item.label}\n${formatCurrency(item.amount)}`,
    );

    if (!confirmed) {
      return;
    }

    setFinanceErrorMessage(null);
    setFinanceStatusMessage(null);
    setActiveFinanceActionId(`delete-${item.id}`);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("show_finance_items")
        .delete()
        .eq("id", item.id)
        .eq("show_id", show.id);

      if (error) {
        throw error;
      }

      setFinanceItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );

      if (editingFinanceItemId === item.id) {
        cancelEditingFinanceItem();
      }

      setFinanceStatusMessage("Finance item deleted.");
    } catch (error) {
      setFinanceErrorMessage(getErrorMessage(error));
    } finally {
      setActiveFinanceActionId(null);
    }
  }

  function handlePayoutFormChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    mode: "new" | "edit",
  ) {
    const { name, value, type } = event.target;
    const checked = "checked" in event.target ? event.target.checked : false;
    const nextValue = type === "checkbox" ? checked : value;

    if (mode === "edit") {
      setEditingPayoutFormState((currentState) => ({
        ...currentState,
        [name]: nextValue,
      }));
      return;
    }

    setPayoutFormState((currentState) => ({
      ...currentState,
      [name]: nextValue,
    }));
  }

  function startEditingPayoutItem(item: ShowPayoutItem) {
    setEditingPayoutItemId(item.id);
    setEditingPayoutFormState(buildPayoutFormState(item));
    setPayoutErrorMessage(null);
    setPayoutStatusMessage(null);
  }

  function cancelEditingPayoutItem() {
    setEditingPayoutItemId(null);
    setEditingPayoutFormState(initialPayoutFormState);
  }

  async function handleCreatePayoutItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!show) {
      setPayoutErrorMessage("The show is not loaded yet.");
      return;
    }

    const payeeName = payoutFormState.payeeName.trim();
    const amount = parseFinanceAmountInput(payoutFormState.amount) ?? 0;

    if (!payeeName) {
      setPayoutErrorMessage("Payee name is required.");
      return;
    }

    setPayoutErrorMessage(null);
    setPayoutStatusMessage(null);
    setActivePayoutActionId("create");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_payout_items")
        .insert({
          show_id: show.id,
          payee_name: payeeName,
          category: normalizeOptionalField(payoutFormState.category),
          description: normalizeOptionalField(payoutFormState.description),
          amount,
          paid: payoutFormState.paid,
          payment_method: normalizeOptionalField(payoutFormState.paymentMethod),
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setPayoutItems((currentItems) =>
        sortShowPayoutItems([
          ...currentItems,
          normalizeShowPayoutItem(data as ShowPayoutItem),
        ]),
      );
      setPayoutFormState(initialPayoutFormState);
      setPayoutStatusMessage("Payout item added.");
    } catch (error) {
      setPayoutErrorMessage(getErrorMessage(error));
    } finally {
      setActivePayoutActionId(null);
    }
  }

  async function handleSavePayoutItem(item: ShowPayoutItem) {
    if (!show) {
      setPayoutErrorMessage("The show is not loaded yet.");
      return;
    }

    const payeeName = editingPayoutFormState.payeeName.trim();
    const amount = parseFinanceAmountInput(editingPayoutFormState.amount);

    if (!payeeName) {
      setPayoutErrorMessage("Payee name is required.");
      return;
    }

    if (amount === null) {
      setPayoutErrorMessage("Enter a valid payout amount.");
      return;
    }

    setPayoutErrorMessage(null);
    setPayoutStatusMessage(null);
    setActivePayoutActionId(`edit-${item.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_payout_items")
        .update({
          payee_name: payeeName,
          category: normalizeOptionalField(editingPayoutFormState.category),
          description: normalizeOptionalField(editingPayoutFormState.description),
          amount,
          paid: editingPayoutFormState.paid,
          payment_method: normalizeOptionalField(editingPayoutFormState.paymentMethod),
        })
        .eq("id", item.id)
        .eq("show_id", show.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setPayoutItems((currentItems) =>
        sortShowPayoutItems(
          currentItems.map((currentItem) =>
            currentItem.id === item.id
              ? normalizeShowPayoutItem(data as ShowPayoutItem)
              : currentItem,
          ),
        ),
      );
      cancelEditingPayoutItem();
      setPayoutStatusMessage("Payout item updated.");
    } catch (error) {
      setPayoutErrorMessage(getErrorMessage(error));
    } finally {
      setActivePayoutActionId(null);
    }
  }

  async function handleTogglePayoutPaid(item: ShowPayoutItem) {
    setPayoutErrorMessage(null);
    setPayoutStatusMessage(null);
    setActivePayoutActionId(`paid-${item.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_payout_items")
        .update({ paid: !item.paid })
        .eq("id", item.id)
        .eq("show_id", item.show_id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setPayoutItems((currentItems) =>
        sortShowPayoutItems(
          currentItems.map((currentItem) =>
            currentItem.id === item.id
              ? normalizeShowPayoutItem(data as ShowPayoutItem)
              : currentItem,
          ),
        ),
      );
    } catch (error) {
      setPayoutErrorMessage(getErrorMessage(error));
    } finally {
      setActivePayoutActionId(null);
    }
  }

  async function handleDeletePayoutItem(item: ShowPayoutItem) {
    if (!show) {
      setPayoutErrorMessage("The show is not loaded yet.");
      return;
    }

    const confirmed = window.confirm(
      `Delete this payout item?\n\n${item.payee_name}\n${formatCurrency(item.amount)}`,
    );

    if (!confirmed) {
      return;
    }

    setPayoutErrorMessage(null);
    setPayoutStatusMessage(null);
    setActivePayoutActionId(`delete-${item.id}`);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("show_payout_items")
        .delete()
        .eq("id", item.id)
        .eq("show_id", show.id);

      if (error) {
        throw error;
      }

      setPayoutItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );

      if (editingPayoutItemId === item.id) {
        cancelEditingPayoutItem();
      }

      setPayoutStatusMessage("Payout item deleted.");
    } catch (error) {
      setPayoutErrorMessage(getErrorMessage(error));
    } finally {
      setActivePayoutActionId(null);
    }
  }

  async function handleQuickAddGuestPayout(guestProfile: GuestProfile) {
    if (!show) {
      setPayoutErrorMessage("The show is not loaded yet.");
      return;
    }

    const payeeName = guestProfile.name?.trim();

    if (!payeeName) {
      setPayoutErrorMessage("Guest name is missing.");
      return;
    }

    setPayoutErrorMessage(null);
    setPayoutStatusMessage(null);
    setActivePayoutActionId(`guest-${guestProfile.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_payout_items")
        .insert({
          show_id: show.id,
          payee_name: payeeName,
          category: "Guest",
          description: null,
          amount: 0,
          paid: false,
          payment_method: null,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setPayoutItems((currentItems) =>
        sortShowPayoutItems([
          ...currentItems,
          normalizeShowPayoutItem(data as ShowPayoutItem),
        ]),
      );
      setPayoutStatusMessage(`Added ${payeeName} to the payout sheet.`);
    } catch (error) {
      setPayoutErrorMessage(getErrorMessage(error));
    } finally {
      setActivePayoutActionId(null);
    }
  }

  function handlePrintPayoutSheet() {
    if (!show) {
      setPayoutErrorMessage("The show is not loaded yet.");
      return;
    }

    setPayoutErrorMessage(null);
    const printHtml = buildPayoutSheetHtml({
      showName: show.name,
      showDate: show.show_date,
      payoutItems,
    });
    openPrintDocumentWindow(printHtml);
  }

  function handlePrintFinanceReport() {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert("The print window was blocked. Please allow pop-ups and try again.");
      return;
    }

    const printHtml = buildFinanceReportHtml({
      showName: show?.name ?? "Show",
      showDate: show?.show_date ?? null,
      venue: show?.venue ?? null,
      financeItems,
    });

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
          setPotentialSponsors([]);
          setShowSponsors([]);
          setShowChecklistItems([]);
          setFinanceItems([]);
          setPayoutItems([]);
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
          potentialSponsorRows,
          showSponsorRows,
          checklistItemRows,
          financeItemRows,
          payoutItemRows,
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
            "potentialSponsors",
            "potential sponsors",
            requestPotentialSponsorsApi<PotentialSponsor[]>()
              .then((data) => ({ data, error: null }))
              .catch((error) => ({ data: null, error })),
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
            "checklistItems",
            "show checklist items",
            supabase
              .from("show_checklist_items")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: true }),
            [],
          ),
          loadSection(
            "financeItems",
            "finance items",
            supabase
              .from("show_finance_items")
              .select("*")
              .eq("show_id", showRecord.id)
              .order("created_at", { ascending: false }),
            [],
          ),
          loadSection(
            "payoutItems",
            "show payout items",
            supabase
              .from("show_payout_items")
              .select("*")
              .eq("show_id", showRecord.id)
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

        const guestSongStoragePathById = new Map<string, string>();
        const guestSongStoragePrefix = `song-audio/shows/${sanitizeFileName(showRecord.slug || "show")}/songs`;

        try {
          const { data: guestSongMp3Objects, error: guestSongMp3ListError } = await supabase.storage
            .from(SONG_AUDIO_BUCKET)
            .list(guestSongStoragePrefix, { limit: 1000 });

          if (guestSongMp3ListError) {
            logDataSectionError("guest song MP3 attachments", guestSongMp3ListError);
          } else {
            for (const guestSongMp3Object of guestSongMp3Objects ?? []) {
              const objectName = guestSongMp3Object.name ?? "";
              const match = objectName.match(/^([0-9a-f-]+)\.mp3$/i);

              if (match) {
                guestSongStoragePathById.set(
                  match[1],
                  `${guestSongStoragePrefix}/${objectName}`,
                );
              }
            }
          }
        } catch (error) {
          logDataSectionError("guest song MP3 attachments", error);
        }

        setSetlist(
          sortSetlistSongs(
            (setlistRows ?? []).map((song: SetlistEntryQueryRow) =>
              normalizeSetlistSong(song),
            ),
          ),
        );
        setPendingSongs(
          (pendingRows ?? []).map((submission: PendingSubmission) =>
            normalizePendingSubmission(
              submission,
              guestSongStoragePathById.get(submission.id) ?? null,
            ),
          ),
        );
        setSongLibrary(
          (libraryRows ?? []).map((song: SongLibrarySong) => normalizeSongLibrarySong(song)),
        );
        const normalizedSponsorLibrary = (sponsorLibraryRows ?? []).map(
          (sponsor: SponsorLibraryEntry) => normalizeSponsorLibraryEntry(sponsor),
        );
        setSponsorLibrary(normalizedSponsorLibrary);
        setPotentialSponsors(
          sortPotentialSponsors(
            (potentialSponsorRows ?? []).map((potentialSponsor: PotentialSponsor) =>
              normalizePotentialSponsorEntry(potentialSponsor),
            ),
          ),
        );
        setShowSponsors(
          mergeShowSponsorsWithLibrary((showSponsorRows ?? []) as ShowSponsor[], normalizedSponsorLibrary),
        );
        setShowChecklistItems(
          sortShowChecklistItems((checklistItemRows ?? []) as ShowChecklistItem[]),
        );
        setFinanceItems(
          sortFinanceItems(
            ((financeItemRows ?? []) as Array<
              Omit<ShowFinanceItem, "amount"> & { amount: number | string | null }
            >).map((item) => normalizeShowFinanceItem(item)),
          ),
        );
        setPayoutItems(
          sortShowPayoutItems(
            ((payoutItemRows ?? []) as Array<
              Omit<ShowPayoutItem, "amount"> & { amount: number | string | null }
            >).map((item) => normalizeShowPayoutItem(item)),
          ),
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
    setSponsorDocumentFormStates((currentStates) => {
      const nextStates: Record<string, SponsorDocumentFormState> = {};

      sponsorLibrary.forEach((sponsor) => {
        nextStates[sponsor.id] = currentStates[sponsor.id] ?? buildSponsorDocumentFormState(sponsor);
      });

      return nextStates;
    });
  }, [sponsorLibrary]);

  useEffect(() => {
    if (viewMode === "admin") {
      setActiveAdminTab(requestedAdminTab ?? "overview");
    }

    if (viewMode === "band") {
      setActiveBandTab("setlist");
    }

    if (viewMode === "guest") {
      setActiveGuestTab("welcome");
    }
  }, [requestedAdminTab, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      "stageflow-yearly-finance-summary-expanded",
      isYearlyFinanceSummaryExpanded ? "true" : "false",
    );
  }, [isYearlyFinanceSummaryExpanded]);

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

  useEffect(() => {
    if (!shouldShowAdminFinanceTab || hasLoadedYearlyFinanceSummary) {
      return;
    }

    let isCancelled = false;

    async function loadYearlyFinanceSummary() {
      try {
        const supabase = createClient();
        const [{ data: yearlyShowsData, error: yearlyShowsError }, { data: yearlyItemsData, error: yearlyItemsError }] =
          await Promise.all([
            supabase
              .from("shows")
              .select("*")
              .order("show_date", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: false }),
            supabase.from("show_finance_items").select("*"),
          ]);

        if (yearlyShowsError) {
          throw yearlyShowsError;
        }

        if (yearlyItemsError) {
          throw yearlyItemsError;
        }

        if (isCancelled) {
          return;
        }

        setYearlyFinanceShows((yearlyShowsData ?? []) as ShowRecord[]);
        setYearlyFinanceItems(
          Array.isArray(yearlyItemsData)
            ? yearlyItemsData.map((item) =>
                normalizeShowFinanceItem(
                  item as Omit<ShowFinanceItem, "amount"> & { amount: number | string | null },
                ),
              )
            : [],
        );
        setYearlyFinanceErrorMessage(null);
        setHasLoadedYearlyFinanceSummary(true);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setYearlyFinanceErrorMessage(getErrorMessage(error));
        setHasLoadedYearlyFinanceSummary(true);
      }
    }

    void loadYearlyFinanceSummary();

    return () => {
      isCancelled = true;
    };
  }, [hasLoadedYearlyFinanceSummary, shouldShowAdminFinanceTab]);

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
  const adminMcSponsorPlacementItems = useMemo(
    () => buildMcFlowItems(setlist, showSponsors),
    [setlist, showSponsors],
  );
  const populatedMcSections = useMemo(
    () => mcRunSheetData.sectionItems.filter((section) => section.items.length > 0),
    [mcRunSheetData],
  );
  const mcBlockLookup = useMemo(() => {
    return mcRunSections
      .flatMap((section) => section.blocks)
      .reduce<Record<string, (typeof mcRunSections)[number]["blocks"][number]>>((lookup, block) => {
        lookup[block.anchorSongId] = block;
        return lookup;
      }, {});
  }, [mcRunSections]);
  const showReminderSummary = useMemo(
    () => buildShowReminderSummary(show?.show_date ?? null),
    [show?.show_date],
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

  function handleSongMp3Change(event: ChangeEvent<HTMLInputElement>) {
    setSongMp3File(event.target.files?.[0] ?? null);
  }

  function resetSongMp3Input() {
    setSongMp3File(null);
    setSongMp3InputKey((currentKey) => currentKey + 1);
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

  function startEditingAdminGuestArtistInfo(profileId: string) {
    startEditingGuestProfile(profileId);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("admin-guest-artist-info-form")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
    }
  }

  function resetGuestProfileForm() {
    setEditingGuestProfileId(null);
    setGuestPhotoFile(null);
    setGuestProfileFormState(initialGuestProfileFormState);
  }

  function handleGuestAppearanceDetailsChange(
    profileId: string,
    field: "agreed_fee" | "planned_song_count" | "backup_song_count" | "appearance_notes",
    value: string,
  ) {
    setGuestProfiles((currentProfiles) =>
      currentProfiles.map((profile) => {
        if (profile.id !== profileId) {
          return profile;
        }

        if (field === "planned_song_count" || field === "backup_song_count") {
          return {
            ...profile,
            [field]: parseOptionalIntegerInput(value),
          };
        }

        return {
          ...profile,
          [field]: value,
        };
      }),
    );
  }

  function handleSponsorLibraryChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    mode: "new" | "edit",
  ) {
    const { name, value } = event.target;
    const setState = mode === "edit" ? setSponsorLibraryFormState : setNewSponsorLibraryFormState;

    setState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleSponsorDocumentFormChange(
    sponsorId: string,
    field: keyof SponsorDocumentFormState,
    value: string,
  ) {
    setSponsorDocumentFormStates((currentStates) => {
      const nextState = {
        ...(currentStates[sponsorId] ?? initialSponsorDocumentFormState),
        [field]: value,
      };

      if (field === "sponsorshipLevel") {
        const defaultAmount = getDefaultSponsorTierAmount(value);

        if (defaultAmount !== null) {
          nextState.sponsorshipAmount = defaultAmount;
        }
      }

      return {
        ...currentStates,
        [sponsorId]: nextState,
      };
    });
  }

  function handleSponsorProposalGeneratorChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setSponsorProposalGeneratorFormState((currentState) => {
      const nextState = {
        ...currentState,
        [name]: value,
      };

      if (name === "sponsorshipLevel") {
        const defaultAmount = getDefaultSponsorTierAmount(value);

        if (defaultAmount !== null) {
          nextState.amount = defaultAmount;
        }
      }

      return nextState;
    });
  }

  function handlePotentialSponsorFormChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setPotentialSponsorFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function startEditingPotentialSponsor(potentialSponsorId: string) {
    const potentialSponsorToEdit = potentialSponsors.find(
      (potentialSponsor) => potentialSponsor.id === potentialSponsorId,
    );

    if (!potentialSponsorToEdit) {
      return;
    }

    setEditingPotentialSponsorId(potentialSponsorId);
    setPotentialSponsorFormState(buildPotentialSponsorFormState(potentialSponsorToEdit));
    setIsPotentialSponsorsOpen(true);
    setIsPotentialSponsorFormOpen(true);
  }

  function resetPotentialSponsorForm() {
    setEditingPotentialSponsorId(null);
    setPotentialSponsorFormState(initialPotentialSponsorFormState);
    setIsPotentialSponsorFormOpen(false);
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

    if (mode === "new" && name === "sponsorId") {
      const selectedSponsor =
        sponsorLibrary.find((sponsor) => sponsor.id === value) ?? null;

      setShowSponsorAssignmentFormState((currentState) => ({
        ...currentState,
        sponsorId: value,
        sponsorType: selectedSponsor?.sponsor_type ?? "",
        defaultContribution: selectedSponsor?.default_contribution ?? "",
        estimatedValue:
          selectedSponsor?.estimated_value === null || selectedSponsor?.estimated_value === undefined
            ? ""
            : formatNumericInputValue(selectedSponsor.estimated_value),
        recognitionNotes: selectedSponsor?.recognition_notes ?? "",
      }));
      return;
    }

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

    setExpandedSponsorLibraryCardId(sponsorId);
    setEditingSponsorLibraryId(sponsorId);
    setSponsorLibraryFormState(buildSponsorLibraryFormState(sponsorToEdit));
    setEditingSponsorLogoFile(null);
  }

  function cancelEditingSponsorLibraryEntry() {
    setEditingSponsorLibraryId(null);
    setSponsorLibraryFormState(initialSponsorLibraryFormState);
    setEditingSponsorLogoFile(null);
  }

  function syncSponsorAcrossState(updatedSponsor: SponsorLibraryEntry) {
    setSponsorLibrary((currentSponsors) =>
      currentSponsors
        .map((sponsor) => (sponsor.id === updatedSponsor.id ? updatedSponsor : sponsor))
        .sort((sponsorA, sponsorB) => sponsorA.name.localeCompare(sponsorB.name)),
    );
    setShowSponsors((currentSponsors) =>
      currentSponsors.map((sponsor) =>
        sponsor.sponsor_id === updatedSponsor.id
          ? { ...sponsor, sponsor: updatedSponsor }
          : sponsor,
      ),
    );
    setSponsorDocumentFormStates((currentStates) => ({
      ...currentStates,
      [updatedSponsor.id]: buildSponsorDocumentFormState(updatedSponsor),
    }));
  }

  function removeSponsorAcrossState(sponsorId: string) {
    setSponsorLibrary((currentSponsors) =>
      currentSponsors.filter((sponsor) => sponsor.id !== sponsorId),
    );
    setShowSponsors((currentSponsors) =>
      currentSponsors.filter((sponsor) => sponsor.sponsor_id !== sponsorId),
    );
    setSponsorDocumentFormStates((currentStates) => {
      const nextStates = { ...currentStates };
      delete nextStates[sponsorId];
      return nextStates;
    });
  }

  function buildProposalGeneratorSponsorDraft() {
    const name = sponsorProposalGeneratorFormState.businessName.trim();
    const sponsorshipAmount = parseSponsorAmountInput(sponsorProposalGeneratorFormState.amount);

    return {
      name,
      sponsorshipAmount,
      sponsor: {
        id: crypto.randomUUID(),
        name,
        short_message: null,
        full_message: null,
        website: null,
        logo_url: null,
        sponsor_type: null,
        default_contribution: null,
        estimated_value: null,
        recognition_notes: null,
        is_archived: false,
        sponsorship_level:
          normalizeOptionalField(sponsorProposalGeneratorFormState.sponsorshipLevel) ?? "Custom",
        sponsorship_amount: sponsorshipAmount,
        payment_status: "prospect",
        proposal_generated_at: null,
        quote_generated_at: null,
        receipt_generated_at: null,
        created_at: new Date().toISOString(),
      } satisfies SponsorLibraryEntry,
    };
  }

  function primeProposalGeneratorFromPotentialSponsor(potentialSponsor: PotentialSponsor) {
    setSponsorProposalGeneratorFormState((currentState) => ({
      ...currentState,
      businessName: potentialSponsor.business_name,
      contactName: potentialSponsor.contact_name ?? "",
      notes: potentialSponsor.notes ?? "",
      amount:
        currentState.amount || getDefaultSponsorTierAmount(currentState.sponsorshipLevel) || "",
    }));
    setIsSponsorProposalGeneratorOpen(true);
    setIsPotentialSponsorsOpen(true);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("sponsor-proposal-generator")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
    }
  }

  function openPrintDocumentWindow(printHtml: string) {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert("The print window was blocked. Please allow pop-ups and try again.");
      return false;
    }

    const triggerPrint = () => {
      if (printWindow.closed) {
        return;
      }

      printWindow.focus();
      printWindow.print();
    };

    const triggerPrintWhenReady = () => {
      const { document } = printWindow;
      const images = Array.from(document.images ?? []);

      if (images.length === 0) {
        window.setTimeout(triggerPrint, 150);
        return;
      }

      let settledImages = 0;
      const finishImageLoad = () => {
        settledImages += 1;

        if (settledImages >= images.length) {
          window.setTimeout(triggerPrint, 150);
        }
      };

      images.forEach((image) => {
        if (image.complete) {
          finishImageLoad();
          return;
        }

        image.addEventListener("load", finishImageLoad, { once: true });
        image.addEventListener("error", finishImageLoad, { once: true });
      });
    };

    printWindow.onload = triggerPrintWhenReady;
    printWindow.onafterprint = () => {
      printWindow.close();
    };

    const { document } = printWindow;
    document.open();
    document.write(printHtml);
    document.close();

    if (document.readyState === "complete") {
      triggerPrintWhenReady();
    }

    return true;
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
    const estimatedValue = parseSponsorAmountInput(newSponsorLibraryFormState.estimatedValue);
    const sponsorInsertPayload = {
      name,
      short_message: normalizeOptionalField(newSponsorLibraryFormState.shortMessage),
      full_message: normalizeOptionalField(newSponsorLibraryFormState.fullMessage),
      website: normalizeOptionalField(newSponsorLibraryFormState.website),
      sponsor_type: normalizeOptionalField(newSponsorLibraryFormState.sponsorType),
      default_contribution: normalizeOptionalField(newSponsorLibraryFormState.defaultContribution),
      estimated_value: estimatedValue,
      recognition_notes: normalizeOptionalField(newSponsorLibraryFormState.recognitionNotes),
      logo_url: null as string | null,
    };

    try {
      const supabase = createClient();
      const logoUrl = newSponsorLogoFile
        ? await uploadSponsorLogoFile(newSponsorLogoFile, name)
        : null;
      sponsorInsertPayload.logo_url = logoUrl;

      const { data, error } = await supabase
        .from("sponsor_library")
        .insert(sponsorInsertPayload)
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
      setIsAddSponsorFormOpen(false);
    } catch (error) {
      console.error("Sponsor library insert failed.", {
        error,
        message: error instanceof Error ? error.message : null,
        code: typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null,
        details:
          typeof error === "object" && error !== null && "details" in error
            ? (error as { details?: unknown }).details
            : null,
        hint:
          typeof error === "object" && error !== null && "hint" in error
            ? (error as { hint?: unknown }).hint
            : null,
        fullErrorJson: JSON.stringify(error, null, 2),
        table: "sponsor_library",
        payload: sponsorInsertPayload,
      });
      setActionError(`Sponsor could not be added. ${getErrorMessage(error)}`);
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
    const estimatedValue = parseSponsorAmountInput(sponsorLibraryFormState.estimatedValue);
    const sponsorUpdatePayload = {
      name,
      short_message: normalizeOptionalField(sponsorLibraryFormState.shortMessage),
      full_message: normalizeOptionalField(sponsorLibraryFormState.fullMessage),
      website: normalizeOptionalField(sponsorLibraryFormState.website),
      sponsor_type: normalizeOptionalField(sponsorLibraryFormState.sponsorType),
      default_contribution: normalizeOptionalField(sponsorLibraryFormState.defaultContribution),
      estimated_value: estimatedValue,
      recognition_notes: normalizeOptionalField(sponsorLibraryFormState.recognitionNotes),
      logo_url: null as string | null,
    };

    try {
      const supabase = createClient();
      const logoUrl = editingSponsorLogoFile
        ? await uploadSponsorLogoFile(editingSponsorLogoFile, name)
        : normalizeOptionalField(sponsorLibraryFormState.logoUrl);
      sponsorUpdatePayload.logo_url = logoUrl;

      const { data, error } = await supabase
        .from("sponsor_library")
        .update(sponsorUpdatePayload)
        .eq("id", sponsorId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const normalizedSponsor = normalizeSponsorLibraryEntry(data);
      syncSponsorAcrossState(normalizedSponsor);
      cancelEditingSponsorLibraryEntry();
    } catch (error) {
      console.error("Sponsor library update failed.", {
        error,
        message: error instanceof Error ? error.message : null,
        code: typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null,
        details:
          typeof error === "object" && error !== null && "details" in error
            ? (error as { details?: unknown }).details
            : null,
        hint:
          typeof error === "object" && error !== null && "hint" in error
            ? (error as { hint?: unknown }).hint
            : null,
        fullErrorJson: JSON.stringify(error, null, 2),
        table: "sponsor_library",
        sponsorId,
        payload: sponsorUpdatePayload,
      });
      setActionError(`Sponsor could not be saved. ${getErrorMessage(error)}`);
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleSaveSponsorDocumentDetails(sponsorId: string) {
    const currentFormState = sponsorDocumentFormStates[sponsorId] ?? initialSponsorDocumentFormState;
    const sponsor = sponsorLibrary.find((entry) => entry.id === sponsorId);

    if (!sponsor) {
      setActionError("Sponsor not found.");
      return;
    }

    const sponsorshipAmount = parseSponsorAmountInput(currentFormState.sponsorshipAmount);

    if (currentFormState.sponsorshipAmount.trim() && sponsorshipAmount === null) {
      setActionError("Enter a valid sponsor amount.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`documents-${sponsorId}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sponsor_library")
        .update({
          sponsorship_level: normalizeOptionalField(currentFormState.sponsorshipLevel),
          sponsorship_amount: sponsorshipAmount,
          payment_status: normalizeOptionalField(currentFormState.paymentStatus) ?? "prospect",
        })
        .eq("id", sponsorId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      syncSponsorAcrossState(normalizeSponsorLibraryEntry(data));
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handlePrintSponsorDocument(
    sponsor: SponsorLibraryEntry,
    kind: "proposal" | "quote" | "receipt",
  ) {
    setActionError(null);
    setActiveSponsorActionId(`${kind}-${sponsor.id}`);

    try {
      const supabase = createClient();
      const timestampField =
        kind === "proposal"
          ? "proposal_generated_at"
          : kind === "quote"
            ? "quote_generated_at"
            : "receipt_generated_at";
      const timestamp = new Date().toISOString();
      const currentFormState = sponsorDocumentFormStates[sponsor.id] ?? buildSponsorDocumentFormState(sponsor);
      const sponsorshipAmount = parseSponsorAmountInput(currentFormState.sponsorshipAmount);
      const { data, error } = await supabase
        .from("sponsor_library")
        .update({
          sponsorship_level: normalizeOptionalField(currentFormState.sponsorshipLevel),
          sponsorship_amount: sponsorshipAmount,
          payment_status: normalizeOptionalField(currentFormState.paymentStatus) ?? "prospect",
          [timestampField]: timestamp,
        })
        .eq("id", sponsor.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const normalizedSponsor = normalizeSponsorLibraryEntry(data);
      syncSponsorAcrossState(normalizedSponsor);

      const printHtml = buildSponsorDocumentHtml({
        kind,
        sponsor: normalizedSponsor,
        showName: show?.name ?? "Cumberland Mountain Music Show",
        showDate: show?.show_date ?? null,
        logoUrl: `${window.location.origin}/cmms-logo.png`,
        coverageLabel: buildProposalCoverageLabel({
          coverage: currentFormState.proposalCoverage,
          year: currentFormState.proposalYear,
          customCoverage: currentFormState.proposalCustomCoverage,
          showName: show?.name ?? "Cumberland Mountain Music Show",
          showDate: show?.show_date ?? null,
        }),
      });

      if (!openPrintDocumentWindow(printHtml)) {
        return;
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handlePrintSponsorProposalDraft() {
    const { name, sponsorshipAmount, sponsor } = buildProposalGeneratorSponsorDraft();

    if (!name) {
      setActionError("Business name is required.");
      return;
    }

    if (!sponsorProposalGeneratorFormState.amount.trim()) {
      setActionError("Amount is required.");
      return;
    }

    if (sponsorProposalGeneratorFormState.amount.trim() && sponsorshipAmount === null) {
      setActionError("Enter a valid sponsorship amount.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId("draft-proposal-print");

    try {
      const printHtml = buildSponsorDocumentHtml({
        kind: "proposal",
        sponsor,
        showName: show?.name ?? "Cumberland Mountain Music Show",
        showDate: show?.show_date ?? null,
        logoUrl: `${window.location.origin}/cmms-logo.png`,
        coverageLabel: buildProposalCoverageLabel({
          coverage: sponsorProposalGeneratorFormState.proposalCoverage,
          year: sponsorProposalGeneratorFormState.proposalYear,
          customCoverage: sponsorProposalGeneratorFormState.proposalCustomCoverage,
          showName: show?.name ?? "Cumberland Mountain Music Show",
          showDate: show?.show_date ?? null,
        }),
        contactName: sponsorProposalGeneratorFormState.contactName,
        proposalNotes: sponsorProposalGeneratorFormState.notes,
      });

      openPrintDocumentWindow(printHtml);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleAddDraftSponsorToLibrary() {
    const { name, sponsorshipAmount, sponsor } = buildProposalGeneratorSponsorDraft();

    if (!name) {
      setActionError("Business name is required.");
      return;
    }

    if (!sponsorProposalGeneratorFormState.amount.trim()) {
      setActionError("Amount is required.");
      return;
    }

    if (sponsorProposalGeneratorFormState.amount.trim() && sponsorshipAmount === null) {
      setActionError("Enter a valid sponsorship amount.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId("draft-proposal-add");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sponsor_library")
        .insert({
          name,
          sponsor_type: null,
          default_contribution: null,
          estimated_value: null,
          recognition_notes: null,
          sponsorship_level: sponsor.sponsorship_level,
          sponsorship_amount: sponsorshipAmount,
          payment_status: "prospect",
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const normalizedSponsor = normalizeSponsorLibraryEntry(data);
      setSponsorLibrary((currentSponsors) =>
        [...currentSponsors, normalizedSponsor].sort((sponsorA, sponsorB) =>
          sponsorA.name.localeCompare(sponsorB.name),
        ),
      );
      setSponsorDocumentFormStates((currentStates) => ({
        ...currentStates,
        [normalizedSponsor.id]: buildSponsorDocumentFormState(normalizedSponsor),
      }));
      setSponsorProposalGeneratorFormState(initialSponsorProposalGeneratorFormState);
      setIsSponsorProposalGeneratorOpen(false);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleSavePotentialSponsor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const businessName = potentialSponsorFormState.businessName.trim();

    if (!businessName) {
      setActionError("Business name is required.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(
      editingPotentialSponsorId ? `potential-save-${editingPotentialSponsorId}` : "potential-create",
    );

    try {
      const payload = {
        business_name: businessName,
        contact_name: normalizeOptionalField(potentialSponsorFormState.contactName),
        phone: normalizeOptionalField(potentialSponsorFormState.phone),
        email: normalizeOptionalField(potentialSponsorFormState.email),
        notes: normalizeOptionalField(potentialSponsorFormState.notes),
        status: potentialSponsorFormState.status,
      };

      if (editingPotentialSponsorId) {
        const data = await requestPotentialSponsorsApi<PotentialSponsor>({
          method: "PATCH",
          body: JSON.stringify({
            id: editingPotentialSponsorId,
            ...payload,
          }),
        });

        const normalizedPotentialSponsor = normalizePotentialSponsorEntry(data);
        setPotentialSponsors((currentSponsors) =>
          sortPotentialSponsors(
            currentSponsors.map((potentialSponsor) =>
              potentialSponsor.id === editingPotentialSponsorId
                ? normalizedPotentialSponsor
                : potentialSponsor,
            ),
          ),
        );
      } else {
        const data = await requestPotentialSponsorsApi<PotentialSponsor>({
          method: "POST",
          body: JSON.stringify(payload),
        });

        setPotentialSponsors((currentSponsors) =>
          sortPotentialSponsors([
            normalizePotentialSponsorEntry(data),
            ...currentSponsors,
          ]),
        );
      }

      resetPotentialSponsorForm();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleDeletePotentialSponsor(potentialSponsor: PotentialSponsor) {
    const shouldDelete = window.confirm(
      `Delete "${potentialSponsor.business_name}" from Potential Sponsors?`,
    );

    if (!shouldDelete) {
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`potential-delete-${potentialSponsor.id}`);

    try {
      await requestPotentialSponsorsApi<PotentialSponsor[]>({
        method: "DELETE",
        body: JSON.stringify({ id: potentialSponsor.id }),
      });

      setPotentialSponsors((currentSponsors) =>
        currentSponsors.filter((entry) => entry.id !== potentialSponsor.id),
      );

      if (editingPotentialSponsorId === potentialSponsor.id) {
        resetPotentialSponsorForm();
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleConvertPotentialSponsorToSponsor(potentialSponsor: PotentialSponsor) {
    const businessName = potentialSponsor.business_name.trim();

    if (!businessName) {
      setActionError("Potential sponsor business name is required.");
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`potential-convert-${potentialSponsor.id}`);

    try {
      const existingSponsor = sponsorLibrary.find(
        (sponsor) => sponsor.name.trim().toLowerCase() === businessName.toLowerCase(),
      );
      const supabase = createClient();

      if (!existingSponsor) {
        const { data, error } = await supabase
          .from("sponsor_library")
          .insert({
            name: businessName,
            sponsor_type: null,
            default_contribution: null,
            estimated_value: null,
            recognition_notes: null,
            payment_status: "prospect",
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const normalizedSponsor = normalizeSponsorLibraryEntry(data);
        setSponsorLibrary((currentSponsors) =>
          [...currentSponsors, normalizedSponsor].sort((sponsorA, sponsorB) =>
            sponsorA.name.localeCompare(sponsorB.name),
          ),
        );
        setSponsorDocumentFormStates((currentStates) => ({
          ...currentStates,
          [normalizedSponsor.id]: buildSponsorDocumentFormState(normalizedSponsor),
        }));
      }

      const updatedPotentialSponsor = await requestPotentialSponsorsApi<PotentialSponsor>({
        method: "PATCH",
        body: JSON.stringify({
          id: potentialSponsor.id,
          status: "Became Sponsor" as PotentialSponsorStatus,
        }),
      });

      const normalizedPotentialSponsor = normalizePotentialSponsorEntry(updatedPotentialSponsor);
      setPotentialSponsors((currentSponsors) =>
        sortPotentialSponsors(
          currentSponsors.map((entry) =>
            entry.id === potentialSponsor.id ? normalizedPotentialSponsor : entry,
          ),
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleCopySponsorEmail(sponsor: SponsorLibraryEntry) {
    try {
      await navigator.clipboard.writeText(buildSponsorOutreachEmail(sponsor.name));
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handlePrintYearToDateFinanceReport() {
    setYearlyFinanceErrorMessage(null);
    setIsPrintingYearlyFinanceReport(true);

    try {
      const printHtml = buildYearToDateFinanceReportHtml({
        year: selectedYearlyFinanceYear,
        showCount: selectedYearlyFinanceShows.length,
        totalIncome: yearlyFinanceSummary.totalIncome,
        totalExpenses: yearlyFinanceSummary.totalExpenses,
        net: yearlyFinanceSummary.net,
        quickTotals: yearlyFinanceSummary.quickTotals,
        showBreakdown: yearlyFinanceSummary.showBreakdown,
        incomeGroups: yearlyFinanceSummary.incomeGroups,
        expenseGroups: yearlyFinanceSummary.expenseGroups,
        logoUrl: `${window.location.origin}/cmms-logo.png`,
      });

      openPrintDocumentWindow(printHtml);
    } catch (error) {
      setYearlyFinanceErrorMessage(getErrorMessage(error));
    } finally {
      setIsPrintingYearlyFinanceReport(false);
    }
  }

  function handlePrintShowSponsorLogoSheet() {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    setActionError(null);

    const printHtml = buildShowSponsorLogoSheetHtml({
      showName: show.name,
      showDate: show.show_date,
      sponsors: showSponsors,
      logoUrl: `${window.location.origin}/cmms-logo.png`,
    });

    openPrintDocumentWindow(printHtml);
  }

  async function handleSetSponsorArchived(
    sponsor: SponsorLibraryEntry,
    isArchived: boolean,
  ) {
    setActionError(null);
    setActiveSponsorActionId(`${isArchived ? "archive" : "restore"}-${sponsor.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sponsor_library")
        .update({ is_archived: isArchived })
        .eq("id", sponsor.id)
        .select("*")
        .single();

      if (error) {
        console.error("Sponsor archive update failed", {
          sponsorId: sponsor.id,
          isArchived,
          data,
          error,
          message: error.message,
          code: "code" in error ? error.code : undefined,
          details: "details" in error ? error.details : undefined,
          hint: "hint" in error ? error.hint : undefined,
          json: JSON.stringify(error, null, 2),
        });
      } else {
        console.info("Sponsor archive update response", {
          sponsorId: sponsor.id,
          isArchived,
          data,
          error,
        });
      }

      if (error) {
        throw error;
      }

      syncSponsorAcrossState(normalizeSponsorLibraryEntry(data));

      if (isArchived) {
        setExpandedSponsorLibraryCardId((currentId) =>
          currentId === sponsor.id && !showArchivedSponsors ? null : currentId,
        );
        setEditingSponsorLibraryId((currentId) => (currentId === sponsor.id ? null : currentId));
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveSponsorActionId(null);
    }
  }

  async function handleDeleteSponsorPermanently(sponsor: SponsorLibraryEntry) {
    if (sponsorDeleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setActionError('Type DELETE to permanently remove this sponsor.');
      return;
    }

    setActionError(null);
    setActiveSponsorActionId(`delete-${sponsor.id}`);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("sponsor_library").delete().eq("id", sponsor.id);

      if (error) {
        console.error("Permanent sponsor delete failed", {
          sponsorId: sponsor.id,
          data,
          error,
          message: error.message,
          code: "code" in error ? error.code : undefined,
          details: "details" in error ? error.details : undefined,
          hint: "hint" in error ? error.hint : undefined,
          json: JSON.stringify(error, null, 2),
        });
      } else {
        console.info("Permanent sponsor delete response", {
          sponsorId: sponsor.id,
          data,
          error,
        });
      }

      if (error) {
        throw error;
      }

      removeSponsorAcrossState(sponsor.id);
      setSponsorDeleteConfirmId((currentId) => (currentId === sponsor.id ? null : currentId));
      setSponsorDeleteConfirmText("");
      setExpandedSponsorLibraryCardId((currentId) => (currentId === sponsor.id ? null : currentId));
      setEditingSponsorLibraryId((currentId) => (currentId === sponsor.id ? null : currentId));
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
        sponsor_type: normalizeOptionalField(showSponsorAssignmentFormState.sponsorType),
        default_contribution: normalizeOptionalField(showSponsorAssignmentFormState.defaultContribution),
        estimated_value: parseSponsorAmountInput(showSponsorAssignmentFormState.estimatedValue),
        recognition_notes: normalizeOptionalField(showSponsorAssignmentFormState.recognitionNotes),
      };

      const { data, error } = await supabase
        .from("show_sponsors")
        .insert(payload)
        .select("id, show_id, sponsor_id, placement_order, placement_type, mc_anchor_song_id, linked_performer, custom_note, sponsor_type, default_contribution, estimated_value, recognition_notes, created_at")
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
    setActiveAdminTab("sponsors");
    setActiveSponsorAdminTab("show");
  }

  function cancelEditingShowSponsor() {
    setEditingShowSponsorId(null);
    setEditingShowSponsorFormState(initialShowSponsorAssignmentFormState);
  }

  function toggleMcBlockNotes(anchorSongId: string) {
    setExpandedMcBlockNoteIds((currentIds) =>
      currentIds.includes(anchorSongId)
        ? currentIds.filter((currentId) => currentId !== anchorSongId)
        : [...currentIds, anchorSongId],
    );
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
        sponsor_type: normalizeOptionalField(editingShowSponsorFormState.sponsorType),
        default_contribution: normalizeOptionalField(editingShowSponsorFormState.defaultContribution),
        estimated_value: parseSponsorAmountInput(editingShowSponsorFormState.estimatedValue),
        recognition_notes: normalizeOptionalField(editingShowSponsorFormState.recognitionNotes),
      };

      const { data, error } = await supabase
        .from("show_sponsors")
        .update(payload)
        .eq("id", sponsorId)
        .eq("show_id", show.id)
        .select("id, show_id, sponsor_id, placement_order, placement_type, mc_anchor_song_id, linked_performer, custom_note, sponsor_type, default_contribution, estimated_value, recognition_notes, created_at")
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

  async function handleAddShowChecklistTask(taskText: string) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const task = taskText.trim();

    if (!task) {
      setActionError("Task text is required.");
      return;
    }

    setActionError(null);
    setActiveChecklistActionId("create");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_checklist_items")
        .insert({
          show_id: show.id,
          task,
          completed: false,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShowChecklistItems((currentItems) =>
        sortShowChecklistItems([...(currentItems ?? []), data as ShowChecklistItem]),
      );
      setNewChecklistTask("");
      setIsShowChecklistOpen(true);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveChecklistActionId(null);
    }
  }

  async function handleToggleShowChecklistItem(item: ShowChecklistItem) {
    setActionError(null);
    setActiveChecklistActionId(item.id);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("show_checklist_items")
        .update({ completed: !item.completed })
        .eq("id", item.id)
        .eq("show_id", item.show_id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShowChecklistItems((currentItems) =>
        sortShowChecklistItems(
          currentItems.map((currentItem) =>
            currentItem.id === item.id ? (data as ShowChecklistItem) : currentItem,
          ),
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveChecklistActionId(null);
    }
  }

  async function handleDeleteShowChecklistItem(item: ShowChecklistItem) {
    setActionError(null);
    setActiveChecklistActionId(`delete-${item.id}`);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("show_checklist_items")
        .delete()
        .eq("id", item.id)
        .eq("show_id", item.show_id);

      if (error) {
        throw error;
      }

      setShowChecklistItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveChecklistActionId(null);
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

    const mp3ValidationError = validateSongMp3File(songMp3File);

    if (mp3ValidationError) {
      setActionError(mp3ValidationError);
      return;
    }

    const chartUrlValidationMessage = getChartUrlValidationMessage(formState.chartUrl);

    if (chartUrlValidationMessage) {
      setActionError(chartUrlValidationMessage);
      return;
    }

    const normalizedChartUrl = normalizeChartUrl(formState.chartUrl);

    setActionError(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const normalizedSubmittedByRole = normalizeSubmittedByRole(viewMode);

      if (normalizedSubmittedByRole === "guest") {
        const guestNotes = appendReferenceUrlToNotes(
          normalizeOptionalField(formState.notes),
          normalizedChartUrl,
        );
        const guestLyrics = normalizeOptionalField(formState.lyrics);

        const nextGuestSongId = crypto.randomUUID();
        const guestSongPayload = {
          id: nextGuestSongId,
          show_id: show.id,
          title,
          key,
          tempo,
          song_type: songType,
          notes: guestNotes,
          lyrics: guestLyrics,
          submitted_by_name: guestSingerName || null,
        };
        const { error } = await supabase
          .from("show_guest_songs")
          .insert(guestSongPayload);

        if (error) {
          throw error;
        }

        let savedGuestSong: PendingSubmission = {
          ...guestSongPayload,
          artist: guestSongPayload.submitted_by_name,
          song_key: guestSongPayload.key,
          notes: guestNotes,
          lyrics: guestLyrics,
          mp3_path: null,
          submitted_by_role: "guest",
          created_at: new Date().toISOString(),
        };

        if (songMp3File) {
          const uploadedMp3Path = await uploadSongMp3File({
            file: songMp3File,
            showSlug: show.slug,
            songId: savedGuestSong.id,
          });

          savedGuestSong = {
            ...savedGuestSong,
            mp3_path: uploadedMp3Path,
          };
        }

        setPendingSongs((currentSongs) => [...currentSongs, normalizePendingSubmission(savedGuestSong)]);

        const adminUrl = buildAdminShowUrl(show.slug);
        void sendAdminNotification({
          subject: `Guest Song Submission - ${show.name} - ${guestSingerName || "Guest"}`,
          html: buildNotificationHtml({
            heading: "Guest Song Submission",
            intro: "A guest submitted a new song for this show.",
            rows: [
              { label: "Show Name", value: show.name },
              { label: "Who's Singing", value: guestSingerName || "Guest" },
              { label: "Song Title", value: savedGuestSong.title },
              { label: "Key", value: savedGuestSong.key },
              { label: "Tempo", value: savedGuestSong.tempo },
              { label: "Song Type", value: savedGuestSong.song_type },
              { label: "Notes", value: stripMp3MarkerFromNotes(savedGuestSong.notes) },
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
            chart_url: normalizedChartUrl,
            created_by_role: normalizedSubmittedByRole,
            created_by_name: null,
          })
            .select("*")
            .single();

          if (error) {
            throw error;
          }

          let savedLibrarySong = data as SongLibrarySong;

          if (songMp3File) {
            const uploadedMp3Path = await uploadSongMp3File({
              file: songMp3File,
              showSlug: show.slug,
              songId: savedLibrarySong.id,
            });

            try {
              savedLibrarySong = await updateSongNotesField<SongLibrarySong>({
                table: "songs",
                rowId: savedLibrarySong.id,
                notes: appendMp3MarkerToNotes(savedLibrarySong.notes, uploadedMp3Path),
                currentRow: savedLibrarySong,
              });
            } catch (error) {
              await deletePromoMaterialFile(uploadedMp3Path);
              throw error;
            }
          }

          setSongLibrary((currentSongs) =>
            [...currentSongs, normalizeSongLibrarySong(savedLibrarySong)].sort((songA, songB) =>
              songA.title.localeCompare(songB.title),
            ),
          );

          const adminUrl = buildAdminShowUrl(show.slug);
          const submittedByLabel =
            normalizedSubmittedByRole === "admin"
              ? "Admin"
              : normalizedSubmittedByRole === "band"
              ? "Band Member"
              : "Unknown";

          void sendAdminNotification({
            subject: `New Library Song Added - ${show.name} - ${savedLibrarySong.title}`,
            html: buildNotificationHtml({
              heading: "New Library Song Added",
              intro: "A new song was added to the main song library.",
              rows: [
                { label: "Show Name", value: show.name },
                { label: "Submitted Via", value: submittedByLabel },
                { label: "Song Title", value: savedLibrarySong.title },
                { label: "Key", value: savedLibrarySong.key },
                { label: "Tempo", value: savedLibrarySong.tempo },
                { label: "Song Type", value: savedLibrarySong.song_type },
                { label: "Notes", value: stripMp3MarkerFromNotes(savedLibrarySong.notes) },
              ],
              adminUrl,
            }),
          });
        } else if (
          songMp3File ||
          normalizedChartUrl !== normalizeChartUrl(existingLibrarySong.chart_url)
        ) {
          let updatedLibrarySong = existingLibrarySong;

          if (normalizedChartUrl !== normalizeChartUrl(existingLibrarySong.chart_url)) {
            const { data, error } = await supabase
              .from("songs")
              .update({
                chart_url: normalizedChartUrl,
              })
              .eq("id", existingLibrarySong.id)
              .select("*")
              .single();

            if (error) {
              throw error;
            }

            updatedLibrarySong = data as SongLibrarySong;
          }

          if (songMp3File) {
            const uploadedMp3Path = await uploadSongMp3File({
              file: songMp3File,
              showSlug: show.slug,
              songId: existingLibrarySong.id,
            });

            try {
              updatedLibrarySong = await updateSongNotesField<SongLibrarySong>({
                table: "songs",
                rowId: existingLibrarySong.id,
                notes: appendMp3MarkerToNotes(updatedLibrarySong.notes, uploadedMp3Path),
                currentRow: updatedLibrarySong,
              });
            } catch (error) {
              await deletePromoMaterialFile(uploadedMp3Path);
              throw error;
            }
          }

          setSongLibrary((currentSongs) =>
            currentSongs
              .map((song) =>
                song.id === existingLibrarySong.id
                  ? normalizeSongLibrarySong(updatedLibrarySong)
                  : song,
              )
              .sort((songA, songB) => songA.title.localeCompare(songB.title)),
          );
        }

      }

      setFormState(initialFormState);
      resetSongMp3Input();
      if (normalizedSubmittedByRole === "admin") {
        setIsAdminSongFormOpen(false);
      }
      if (normalizedSubmittedByRole === "band") {
        setIsBandSongFormOpen(false);
      }
      if (normalizedSubmittedByRole === "guest") {
        setIsGuestSongFormOpen(false);
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const errorObject =
          error && typeof error === "object" ? (error as Record<string, unknown>) : null;

        console.error("Guest song submit failed.", {
          error,
          message: error instanceof Error ? error.message : errorObject?.message ?? null,
          code: typeof errorObject?.code === "string" ? errorObject.code : null,
          details: errorObject?.details ?? null,
          hint: errorObject?.hint ?? null,
          serialized: JSON.stringify(error, null, 2),
        });
      }

      setActionError(getGuestSongSaveErrorMessage(error));
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
        email: guestProfileFormState.email.trim() || null,
        facebook: guestProfileFormState.facebook.trim() || null,
        instagram: guestProfileFormState.instagram.trim() || null,
        website: guestProfileFormState.website.trim() || null,
        photo_url: photoUrl,
        is_confirmed: existingProfile?.is_confirmed ?? false,
        permission_granted: guestProfileFormState.permissionGranted,
      };

      if (existingProfile) {
        const { error: updateError } = await supabase
          .from("guest_profiles")
          .update(profilePayload)
          .eq("id", existingProfile.id);

        if (updateError) {
          throw updateError;
        }

        const updatedProfile = buildGuestProfileRecord(profilePayload, {
          ...existingProfile,
          id: existingProfile.id,
          guest_token: existingProfile.guest_token,
          created_at: existingProfile.created_at,
          portal_opened_at: existingProfile.portal_opened_at,
          last_reminder_sent_at: existingProfile.last_reminder_sent_at,
        });

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
        const insertedProfile = buildGuestProfileRecord(
          {
            ...profilePayload,
            guest_token: null,
            is_confirmed: false,
          },
        );
        const { error: insertError } = await supabase
          .from("guest_profiles")
          .insert({
            ...profilePayload,
            id: insertedProfile.id,
          });

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

  async function handleMoveMcSponsorBySong(sponsorId: string, direction: "up" | "down") {
    if (!show) {
      setMcErrorMessage("The show is not loaded yet.");
      return;
    }

    const currentIndex = adminMcSponsorPlacementItems.findIndex(
      (item) => item.kind === "sponsor" && item.sponsor.id === sponsorId,
    );

    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= adminMcSponsorPlacementItems.length) {
      return;
    }

    const currentItem = adminMcSponsorPlacementItems[currentIndex];
    const neighborItem = adminMcSponsorPlacementItems[targetIndex];

    if (!currentItem || currentItem.kind !== "sponsor" || !neighborItem) {
      return;
    }

    const reorderedItems = [...adminMcSponsorPlacementItems];
    [reorderedItems[currentIndex], reorderedItems[targetIndex]] = [
      reorderedItems[targetIndex],
      reorderedItems[currentIndex],
    ];

    const sponsorSequence = reorderedItems.filter(
      (
        item,
      ): item is Extract<McSponsorPlacementRenderableItem, { kind: "sponsor" }> =>
        item.kind === "sponsor",
    );

    const movedSponsorPlacement = resolveMcSponsorPlacementFromSongFlow(
      reorderedItems,
      sponsorId,
    );
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
      if (process.env.NODE_ENV !== "production") {
        const errorObject =
          error && typeof error === "object" ? (error as Record<string, unknown>) : null;

        console.error("Guest song save failed.", {
          error,
          message: error instanceof Error ? error.message : errorObject?.message ?? null,
          code: typeof errorObject?.code === "string" ? errorObject.code : null,
          details: errorObject?.details ?? null,
          hint: errorObject?.hint ?? null,
          serialized: JSON.stringify(error, null, 2),
        });
      }

      setActionError(getGuestSongSaveErrorMessage(error));
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

      console.log("Deleting guest profile", {
        guestId: profileToDelete.id,
        guestName: profileToDelete.name,
        table: "guest_profiles",
      });

      if (relatedSongIds.length > 0) {
        const { error: deleteSongsError } = await supabase
          .from("show_guest_songs")
          .delete()
          .in("id", relatedSongIds);

        if (deleteSongsError) {
          console.error("Failed to delete guest songs for guest profile.", deleteSongsError);
          throw deleteSongsError;
        }
      }

      const deleteProfileResponse = await fetch("/api/guest-profiles/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guestProfileId: profileToDelete.id,
        }),
      });

      const deleteProfilePayload = (await deleteProfileResponse.json()) as {
        success?: boolean;
        data?: unknown;
        error?: string;
        details?: unknown;
      };

      console.log("Guest profile delete result", {
        data: deleteProfilePayload.data,
        error: deleteProfilePayload.error ?? null,
        errorJson: JSON.stringify(deleteProfilePayload.error ?? null, null, 2),
      });

      if (!deleteProfileResponse.ok || !deleteProfilePayload.success) {
        if (deleteProfilePayload.details) {
          console.error("Failed to delete guest profile.", deleteProfilePayload.details);
        } else {
          console.error("Failed to delete guest profile.", deleteProfilePayload.error);
        }

        throw new Error(deleteProfilePayload.error || "Failed to delete guest profile.");
      }

      setGuestProfiles((currentProfiles) =>
        currentProfiles.filter((profile) => profile.id !== profileId),
      );
      setPendingSongs((currentSongs) =>
        currentSongs.filter((song) => !relatedSongIds.includes(song.id)),
      );

      if (editingGuestProfileId === profileId) {
        resetGuestProfileForm();
      }

      if (selectedGuestProfileId === profileId) {
        setSelectedGuestProfileId("");
      }

      await loadShowData(false);
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

  function handlePoolSongMp3Change(event: ChangeEvent<HTMLInputElement>) {
    setPoolSongMp3File(event.target.files?.[0] ?? null);
  }

  function resetPoolSongMp3Input() {
    setPoolSongMp3File(null);
    setPoolSongMp3InputKey((currentKey) => currentKey + 1);
  }

  function handleStartEditingPoolSong(songId: string) {
    const songToEdit = pendingSongs.find((song) => song.id === songId);

    if (!songToEdit || !canEditPoolSong()) {
      return;
    }

    setEditingPoolSongId(songId);
    resetPoolSongMp3Input();
    setPoolSongEditFormState(buildSongEditFormState(songToEdit));
  }

  function handleCancelPoolSongEdit() {
    setEditingPoolSongId(null);
    resetPoolSongMp3Input();
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

    const mp3ValidationError = validateSongMp3File(poolSongMp3File);

    if (mp3ValidationError) {
      setActionError(mp3ValidationError);
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
        notes: normalizeOptionalField(poolSongEditFormState.notes ?? ""),
        lyrics: normalizeOptionalField(poolSongEditFormState.lyrics ?? ""),
        submitted_by_name: guestAssociationName,
      };
      const { error } = await supabase
        .from("show_guest_songs")
        .update(updatePayload)
        .eq("id", songId);

      if (error) {
        throw error;
      }

      let savedGuestSong: PendingSubmission = {
        ...songToUpdate,
        ...updatePayload,
        artist: guestAssociationName,
        song_key: updatePayload.key,
      };

      if (poolSongMp3File) {
        const uploadedMp3Path = await uploadSongMp3File({
          file: poolSongMp3File,
          showSlug: show?.slug ?? showSlug,
          songId,
        });

        savedGuestSong = {
          ...savedGuestSong,
          mp3_path: uploadedMp3Path,
        };
      }

      setPendingSongs((currentSongs) =>
        currentSongs.map((song) =>
          song.id === songId ? normalizePendingSubmission(savedGuestSong) : song,
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

  function handleLibrarySongMp3Change(event: ChangeEvent<HTMLInputElement>) {
    setLibrarySongMp3File(event.target.files?.[0] ?? null);
  }

  function resetLibrarySongMp3Input() {
    setLibrarySongMp3File(null);
    setLibrarySongMp3InputKey((currentKey) => currentKey + 1);
  }

  function handleStartEditingLibrarySong(songId: string) {
    const songToEdit = songLibrary.find((song) => song.id === songId);

    if (!songToEdit || !canEditLibrarySong(songToEdit)) {
      return;
    }

    setEditingLibrarySongId(songId);
    resetLibrarySongMp3Input();
    setLibrarySongEditFormState(buildSongEditFormState(songToEdit));
  }

  function handleCancelLibrarySongEdit() {
    setEditingLibrarySongId(null);
    resetLibrarySongMp3Input();
    setLibrarySongEditFormState({
      title: "",
      key: "",
      tempo: "",
      songType: "",
      notes: "",
      lyrics: "",
      chartUrl: "",
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

    const mp3ValidationError = validateSongMp3File(librarySongMp3File);

    if (mp3ValidationError) {
      setActionError(mp3ValidationError);
      return;
    }

    const chartUrlValidationMessage = getChartUrlValidationMessage(librarySongEditFormState.chartUrl);

    if (chartUrlValidationMessage) {
      setActionError(chartUrlValidationMessage);
      return;
    }

    const normalizedChartUrl = normalizeChartUrl(librarySongEditFormState.chartUrl);

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
          notes: appendMp3MarkerToNotes(
            normalizeOptionalField(librarySongEditFormState.notes ?? ""),
            songToUpdate.mp3_path,
          ),
          lyrics: normalizeOptionalField(librarySongEditFormState.lyrics ?? ""),
          chart_url: normalizedChartUrl,
        })
        .eq("id", songId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      let savedLibrarySong = data as SongLibrarySong;

      if (librarySongMp3File) {
        const uploadedMp3Path = await uploadSongMp3File({
          file: librarySongMp3File,
          showSlug: show?.slug ?? showSlug,
          songId,
        });

        try {
          savedLibrarySong = await updateSongNotesField<SongLibrarySong>({
            table: "songs",
            rowId: songId,
            notes: appendMp3MarkerToNotes(savedLibrarySong.notes, uploadedMp3Path),
            currentRow: savedLibrarySong,
          });
        } catch (error) {
          await deletePromoMaterialFile(uploadedMp3Path);
          throw error;
        }
      }

      setSongLibrary((currentSongs) =>
        currentSongs
          .map((song) => (song.id === songId ? normalizeSongLibrarySong(savedLibrarySong) : song))
          .sort((songA, songB) => songA.title.localeCompare(songB.title)),
      );
      setSetlist((currentSongs) =>
        currentSongs.map((setlistSong) => {
          if (setlistSong.source_type !== "library" || setlistSong.song_id !== songId) {
            return setlistSong;
          }

          return normalizeSetlistSong({
            ...setlistSong,
            library_song: savedLibrarySong,
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

  async function handleRemoveLibrarySongFromAnySetlist(song: SongLibrarySong) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const setlistEntryIdsToRemove = setlist
      .filter((setlistSong) => setlistSong.source_type === "library" && setlistSong.song_id === song.id)
      .map((setlistSong) => setlistSong.id);
    const usageCount = setlistEntryIdsToRemove.length;

    if (usageCount === 0) {
      setActionError(`"${song.title}" is not currently in this show's setlist.`);
      return;
    }

    const shouldRemove = window.confirm(
      `Remove "${song.title}" from ${usageCount} setlist entr${usageCount === 1 ? "y" : "ies"} in this show? The song will stay in the library.`,
    );

    if (!shouldRemove) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(song.id);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("setlist_entries")
        .delete()
        .eq("show_id", show.id)
        .eq("source_type", "library")
        .eq("song_id", song.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        currentSetlist.filter(
          (setlistSong) =>
            !(setlistSong.source_type === "library" && setlistSong.song_id === song.id),
        ),
      );
      setEditingSetlistSongId((currentSongId) =>
        currentSongId && setlistEntryIdsToRemove.includes(currentSongId) ? null : currentSongId,
      );
      setMcBlockNotes((currentNotes) =>
        currentNotes.filter((note) => !setlistEntryIdsToRemove.includes(note.anchor_song_id)),
      );
      setShowSponsors((currentSponsors) =>
        currentSponsors.map((sponsor) =>
          sponsor.mc_anchor_song_id && setlistEntryIdsToRemove.includes(sponsor.mc_anchor_song_id)
            ? { ...sponsor, mc_anchor_song_id: null }
            : sponsor,
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveSetlistActionId(null);
    }
  }

  async function handleCopySongLink(songId: string) {
    const routePath = `/songs/${songId}`;
    const absoluteUrl =
      typeof window === "undefined" ? routePath : `${window.location.origin}${routePath}`;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setActionError(null);
      setCopiedSongLinkId(songId);

      window.setTimeout(() => {
        setCopiedSongLinkId((currentSongId) => (currentSongId === songId ? null : currentSongId));
      }, 1800);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleCopyBandSetlistLink() {
    if (!show?.slug) {
      setActionError("Band link is not available until this show has a valid slug.");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildBandSetlistMessage(show.slug));
      setActionError(null);
      setCopiedBandSetlistLink(true);

      window.setTimeout(() => {
        setCopiedBandSetlistLink(false);
      }, 1800);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleCopyGuestSongsLink() {
    if (!show?.slug) {
      setActionError("Guest songs link is not available until this show has a valid slug.");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildGuestSongsUrl(show.slug));
      setActionError(null);
      setCopiedGuestSongsLink(true);

      window.setTimeout(() => {
        setCopiedGuestSongsLink(false);
      }, 1800);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function handleOpenGuestSongsLink() {
    if (!show?.slug) {
      setActionError("Guest songs link is not available until this show has a valid slug.");
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    window.open(buildGuestSongsUrl(show.slug), "_blank", "noopener,noreferrer");
  }

  async function handleCopyGuestProfileLink(profile: GuestProfile) {
    try {
      const guestIdentifier = profile.guest_token ?? profile.id;
      const guestUrl =
        typeof window === "undefined"
          ? `/guest/${guestIdentifier}`
          : `${window.location.origin}/guest/${guestIdentifier}`;

      await navigator.clipboard.writeText(guestUrl);
      setActionError(null);
      setCopiedGuestProfileLinkId(profile.id);

      window.setTimeout(() => {
        setCopiedGuestProfileLinkId((currentProfileId) =>
          currentProfileId === profile.id ? null : currentProfileId,
        );
      }, 1800);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleCopyGuestReminderEmail(profile: GuestProfile) {
    try {
      await navigator.clipboard.writeText(buildGuestReminderEmailText(profile));
      setActionError(null);
      setCopiedGuestReminderEmailId(profile.id);

      window.setTimeout(() => {
        setCopiedGuestReminderEmailId((currentProfileId) =>
          currentProfileId === profile.id ? null : currentProfileId,
        );
      }, 1800);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleCopyGuestShortText(profile: GuestProfile) {
    try {
      await navigator.clipboard.writeText(buildGuestReminderTextMessage(profile));
      setActionError(null);
      setCopiedGuestShortTextId(profile.id);

      window.setTimeout(() => {
        setCopiedGuestShortTextId((currentProfileId) =>
          currentProfileId === profile.id ? null : currentProfileId,
        );
      }, 1800);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function handleOpenGuestProfileLink(profile: GuestProfile) {
    try {
      const guestIdentifier = profile.guest_token ?? profile.id;
      const guestUrl =
        typeof window === "undefined"
          ? `/guest/${guestIdentifier}`
          : `${window.location.origin}/guest/${guestIdentifier}`;

      if (typeof window !== "undefined") {
        window.open(guestUrl, "_blank", "noopener,noreferrer");
      }

      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleSaveGuestAppearanceDetails(profileId: string) {
    const profileToSave = guestProfiles.find((profile) => profile.id === profileId);

    if (!profileToSave) {
      return;
    }

    setActionError(null);
    setActiveGuestAppearanceSaveId(profileId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("guest_profiles")
        .update({
          agreed_fee: normalizeOptionalField(profileToSave.agreed_fee ?? ""),
          planned_song_count: normalizeOptionalInteger(profileToSave.planned_song_count),
          backup_song_count: normalizeOptionalInteger(profileToSave.backup_song_count),
          appearance_notes: normalizeOptionalField(profileToSave.appearance_notes ?? ""),
        })
        .eq("id", profileToSave.id);

      if (error) {
        throw error;
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveGuestAppearanceSaveId(null);
    }
  }

  async function handleToggleGuestConfirmation(profileId: string) {
    const profileToUpdate = guestProfiles.find((profile) => profile.id === profileId);

    if (!profileToUpdate) {
      return;
    }

    const nextConfirmedValue = !profileToUpdate.is_confirmed;
    setActionError(null);
    setActiveGuestConfirmationSaveId(profileId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("guest_profiles")
        .update({ is_confirmed: nextConfirmedValue })
        .eq("id", profileToUpdate.id);

      if (error) {
        throw error;
      }

      setGuestProfiles((currentProfiles) =>
        currentProfiles.map((profile) =>
          profile.id === profileId ? { ...profile, is_confirmed: nextConfirmedValue } : profile,
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActiveGuestConfirmationSaveId(null);
    }
  }

  async function handleAdminAddGuest() {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const guestName = window.prompt("Guest name");
    const normalizedName = guestName?.trim() ?? "";

    if (!normalizedName) {
      return;
    }

    const duplicateProfile = guestProfiles.find(
      (profile) =>
        normalizeGuestProfileName(profile.name ?? "") === normalizeGuestProfileName(normalizedName),
    );

    if (duplicateProfile) {
      setActionError(`"${normalizedName}" is already in the guest list.`);
      return;
    }

    setActionError(null);
    setActivePendingActionId("guest-admin-add");

    try {
      const supabase = createClient();
      const insertedProfile = buildGuestProfileRecord({
        show_id: show.id,
        name: normalizedName,
        short_bio: null,
        full_bio: null,
        hometown: null,
        instruments: null,
        email: null,
        facebook: null,
        instagram: null,
        website: null,
        photo_url: null,
        guest_token: null,
        is_confirmed: false,
        permission_granted: false,
      });

      const { error } = await supabase.from("guest_profiles").insert({
        id: insertedProfile.id,
        show_id: insertedProfile.show_id,
        name: insertedProfile.name,
        short_bio: insertedProfile.short_bio,
        full_bio: insertedProfile.full_bio,
        hometown: insertedProfile.hometown,
        instruments: insertedProfile.instruments,
        email: insertedProfile.email,
        facebook: insertedProfile.facebook,
        instagram: insertedProfile.instagram,
        website: insertedProfile.website,
        photo_url: insertedProfile.photo_url,
        is_confirmed: insertedProfile.is_confirmed,
        permission_granted: insertedProfile.permission_granted,
      });

      if (error) {
        throw error;
      }

      setGuestProfiles((currentProfiles) => [...currentProfiles, insertedProfile]);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActivePendingActionId(null);
    }
  }

  async function handleDeleteLibrarySong(song: SongLibrarySong) {
    const shouldDelete = window.confirm(
      `Delete "${song.title}" from the main Song Library? This permanently deletes the library song and removes any linked setlist entries. Guest songs will not be affected.`,
    );

    if (!shouldDelete) {
      return;
    }

    const currentShowSetlistEntryIdsToRemove = setlist
      .filter((setlistSong) => setlistSong.source_type === "library" && setlistSong.song_id === song.id)
      .map((setlistSong) => setlistSong.id);

    setActionError(null);
    setActiveLibraryDeleteSongId(song.id);

    try {
      const supabase = createClient();
      const { error: setlistDeleteError } = await supabase
        .from("setlist_entries")
        .delete()
        .eq("song_id", song.id);

      if (setlistDeleteError) {
        throw setlistDeleteError;
      }

      const { error: songDeleteError } = await supabase.from("songs").delete().eq("id", song.id);

      if (songDeleteError) {
        throw songDeleteError;
      }

      setSongLibrary((currentSongs) => currentSongs.filter((librarySong) => librarySong.id !== song.id));
      setSetlist((currentSetlist) =>
        currentSetlist.filter(
          (setlistSong) =>
            !(setlistSong.source_type === "library" && setlistSong.song_id === song.id),
        ),
      );
      setEditingLibrarySongId((currentSongId) => (currentSongId === song.id ? null : currentSongId));
      setOpenLibraryLyricsSongId((currentSongId) => (currentSongId === song.id ? null : currentSongId));
      setEditingSetlistSongId((currentSongId) =>
        currentSongId && currentShowSetlistEntryIdsToRemove.includes(currentSongId) ? null : currentSongId,
      );
      setMcBlockNotes((currentNotes) =>
        currentNotes.filter((note) => !currentShowSetlistEntryIdsToRemove.includes(note.anchor_song_id)),
      );
      setShowSponsors((currentSponsors) =>
        currentSponsors.map((sponsor) =>
          sponsor.mc_anchor_song_id &&
          currentShowSetlistEntryIdsToRemove.includes(sponsor.mc_anchor_song_id)
            ? { ...sponsor, mc_anchor_song_id: null }
            : sponsor,
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
    } finally {
      setActiveLibraryDeleteSongId(null);
    }
  }

  async function handleRemoveGuestSongFromAnySetlist(song: PendingSubmission) {
    if (!show) {
      setActionError("The show is not loaded yet.");
      return;
    }

    const setlistEntryIdsToRemove = setlist
      .filter((setlistSong) => setlistSong.source_type === "guest" && setlistSong.guest_song_id === song.id)
      .map((setlistSong) => setlistSong.id);
    const usageCount = setlistEntryIdsToRemove.length;

    if (usageCount === 0) {
      setActionError(`"${song.title}" is not currently in this show's setlist.`);
      return;
    }

    const shouldRemove = window.confirm(
      `Remove "${song.title}" from ${usageCount} setlist entr${usageCount === 1 ? "y" : "ies"} in this show? The guest song will stay in the guest songs list.`,
    );

    if (!shouldRemove) {
      return;
    }

    setActionError(null);
    setActiveSetlistActionId(song.id);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("setlist_entries")
        .delete()
        .eq("show_id", show.id)
        .eq("source_type", "guest")
        .eq("guest_song_id", song.id);

      if (error) {
        throw error;
      }

      setSetlist((currentSetlist) =>
        currentSetlist.filter(
          (setlistSong) =>
            !(setlistSong.source_type === "guest" && setlistSong.guest_song_id === song.id),
        ),
      );
      setEditingSetlistSongId((currentSongId) =>
        currentSongId && setlistEntryIdsToRemove.includes(currentSongId) ? null : currentSongId,
      );
      setMcBlockNotes((currentNotes) =>
        currentNotes.filter((note) => !setlistEntryIdsToRemove.includes(note.anchor_song_id)),
      );
      setShowSponsors((currentSponsors) =>
        currentSponsors.map((sponsor) =>
          sponsor.mc_anchor_song_id && setlistEntryIdsToRemove.includes(sponsor.mc_anchor_song_id)
            ? { ...sponsor, mc_anchor_song_id: null }
            : sponsor,
        ),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
      await loadShowData(false);
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
  const formattedGuestShowDate = formatShowDateWithOrdinal(show?.show_date ?? null);
  const guestWelcomeMessage =
    guestMessage ||
    [
      DEFAULT_GUEST_WELCOME_MESSAGE_INTRO,
      formattedGuestShowDate
        ? `We’re truly honored to have you as part of our ${formattedGuestShowDate} Show! This event is built around great music, great people, and the rich tradition of mountain and acoustic sound, and we’re excited for you to help us bring that to life on stage.`
        : "We’re truly honored to have you as part of the show!",
      "This portal is here to make your experience as smooth as possible. You’ll find everything you need in one place — from submitting your song choices, to reviewing the show itinerary, to sharing any promo materials we may need.",
      "Our goal is simple: take care of the details so you can focus on what you do best — making great music.",
      "If you need anything at all, don’t hesitate to reach out. We’re looking forward to working with you and putting on a great show together.",
      "— Bryan Turner & The Cumberland Mountain Music Show Team",
    ].join("\n\n");
  const portalGuestProfiles = isPrivateGuestPortal
    ? guestProfiles
    : guestProfiles.filter((profile) => Boolean(profile.name?.trim()));
  const autoSelectedGuestProfile =
    portalGuestProfiles.length === 1 ? portalGuestProfiles[0] : null;
  const lockedGuestProfile =
    viewMode === "guest" && lockedGuestProfileId
      ? guestProfiles.find((profile) => profile.id === lockedGuestProfileId) ?? null
      : null;
  const selectedGuestProfile =
    viewMode === "guest"
      ? lockedGuestProfile ??
        portalGuestProfiles.find((profile) => profile.id === selectedGuestProfileId) ??
        autoSelectedGuestProfile
      : null;
  const guestFirstName = getGuestFirstName(selectedGuestProfile?.name);
  const privateGuestGreeting = isPrivateGuestPortal
    ? guestFirstName
      ? `Hello ${guestFirstName},`
      : "Hello,"
    : null;
  const privateGuestAppearanceDetails = isPrivateGuestPortal && selectedGuestProfile
    ? [
        selectedGuestProfile.planned_song_count
          ? `Planned performance: ${selectedGuestProfile.planned_song_count} song${
              selectedGuestProfile.planned_song_count === 1 ? "" : "s"
            }`
          : null,
        selectedGuestProfile.backup_song_count
          ? `Please have ${selectedGuestProfile.backup_song_count} additional song${
              selectedGuestProfile.backup_song_count === 1 ? "" : "s"
            } available if needed`
          : null,
        selectedGuestProfile.agreed_fee?.trim()
          ? `Agreed guest appearance fee: ${selectedGuestProfile.agreed_fee.trim()}`
          : null,
        selectedGuestProfile.appearance_notes?.trim()
          ? `Notes: ${selectedGuestProfile.appearance_notes.trim()}`
          : null,
      ].filter((detail): detail is string => Boolean(detail))
    : [];
  const privateGuestWelcomeInformation = isPrivateGuestPortal
    ? {
        intro: formattedGuestShowDate
          ? `We’re excited to have you as part of the Cumberland Mountain Music Show on ${formattedGuestShowDate}!`
          : "We’re excited to have you as part of the Cumberland Mountain Music Show!",
        summary:
          "This portal contains everything you’ll need to prepare for the show, including song submissions, artist information, itinerary details, and show-day notes.",
        portalSections: [
          "Songs — Submit your song selections, MP3s, YouTube links, charts, lyrics, or notes that may help the band prepare.",
          "Artist Info — Add your bio, hometown, photo, social media links, and other information for promo materials and introductions.",
          "Itinerary — Contains show-day details including call times, arrival information, show schedule, and other important notes.",
        ],
        showInformation: [
          "Our shows typically consist of approximately 45 minutes of music, followed by a short intermission, and then another 45 minutes to finish the evening.",
          "Guest performers are generally scheduled for 2 songs per set, and we ask that you have an additional song prepared if needed.",
          "Our house band has limited rehearsal time, so familiar songs are always helpful. Original material is absolutely welcome, and charts, MP3s, YouTube links, lyrics, or arrangement notes are always appreciated.",
          "Concessions are usually available before the show, including pizza, hot dogs, water, soft drinks, and coffee. There are also several restaurants within walking distance of the Cumberland Gap Convention Center.",
          "Guests are welcome to bring merchandise to sell during the event.",
        ],
        stageAndSoundInformation: [
          "Our shows typically use a traditional acoustic-style microphone setup featuring multiple condenser microphones for a natural, intimate live sound that works especially well for bluegrass, gospel, and acoustic music.",
          "Because of this setup, floor monitors are sometimes limited in order to maintain the best possible sound quality and reduce feedback. In many cases, performers work directly around the microphones much like a traditional live acoustic stage setup.",
          "In-ear monitor support is available for guests who prefer to use their own earbuds or in-ear monitors. Wireless body packs are provided by the show. A dedicated vocal monitor can also be arranged in some situations if needed.",
          "If you have specific stage or monitoring needs, please feel free to let us know ahead of time so we can prepare as best as possible.",
        ],
      }
    : null;
  const guestSingerName =
    viewMode === "guest"
      ? selectedGuestProfile?.name?.trim() || guestProfileFormState.name.trim() || ""
      : "";
  const requiresGuestSelection =
    viewMode === "guest" && portalGuestProfiles.length > 1 && !selectedGuestProfile;
  const isGuestSongSubmissionBlocked = viewMode === "guest" && portalGuestProfiles.length === 0;
  const shouldShowGuestProfileSelector =
    shouldShowGuestSongsTab && portalGuestProfiles.length > 1 && !isPrivateGuestPortal;
  const canOpenGuestSongForm =
    portalGuestProfiles.length === 1 ||
    Boolean(selectedGuestProfile) ||
    Boolean(lockedGuestProfile);
  const guestSubmittedSongs =
    viewMode === "guest"
      ? pendingSongs.filter((song) => {
          if (normalizeSubmittedByRole(song.submitted_by_role) !== "guest") {
            return false;
          }

          if (!selectedGuestProfile) {
            return portalGuestProfiles.length <= 1;
          }

          const submittedByName = normalizeGuestProfileName(song.submitted_by_name ?? "");
          const currentGuestName = normalizeGuestProfileName(selectedGuestProfile.name ?? "");

          return submittedByName === currentGuestName;
        })
      : [];
  const hasGuestSubmissionSupportMaterial = Boolean(
    formState.notes.trim() || formState.lyrics.trim() || songMp3File,
  );

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
    adminTabItems.find((tab) => tab.key === activeAdminTab)?.label ?? "Overview";
  const activeBandTabLabel =
    bandTabItems.find((tab) => tab.key === activeBandTab)?.label ?? "Setlist";
  const activeGuestTabLabel =
    guestTabItems.find((tab) => tab.key === activeGuestTab)?.label ?? "Welcome";

  if (isLoading) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-7xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-stone-600">Loading show data...</p>
        </section>
      </main>
    );
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-7xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
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
      className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6 lg:px-8"
    >
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 print-shell">
        <AdminQuickNav slug={showSlug} currentView={viewMode} />

        <header className="print-hidden flex flex-col gap-4 border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {shouldShowPortalLogo ? (
                <div className="mb-1 overflow-hidden">
                  <Image
                    src="/stageflow-logo-v2.png"
                    alt="StageFlow logo"
                    width={420}
                    height={210}
                    priority
                    className="h-auto w-full max-w-[94vw] object-contain -translate-y-1.5 scale-[1.11] transform-gpu sm:max-w-[350px] lg:max-w-[390px]"
                  />
                </div>
              ) : null}
              <p
                className={`uppercase ${
                  isGuestView
                    ? "text-lg font-black tracking-[0.3em] text-emerald-700 sm:text-xl"
                    : "text-sm font-semibold tracking-[0.16em] text-stone-500"
                }`}
              >
                {portalLabel}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{show.name}</h1>
              <p className="text-base text-stone-600">{formatShowDate(show.show_date)}</p>
            </div>
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
              className="flex flex-nowrap gap-4 overflow-x-auto rounded-2xl bg-stone-100 p-2 whitespace-nowrap sm:justify-center"
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
                  className={`shrink-0 rounded-2xl px-6 py-4 text-base font-semibold leading-none transition ${
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

        {isAdminView && activeAdminTab === "overview" ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                  Admin Overview
                </h2>
                <p className="text-sm text-stone-600">
                  Quick show snapshot and shortcuts into the existing admin tools.
                </p>
              </div>
              <div className="w-fit rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium tracking-[0.12em] text-stone-500">
                {stageflowPortalVersion}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Current Show
                  </p>
                  <h3 className="text-xl font-semibold text-stone-900">{show.name}</h3>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Show Date
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{formatShowDate(show.show_date)}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Venue
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{show.venue || "Venue not set"}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Guests
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{guestProfiles.length}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Setlist Entries
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{setlist.length}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Guest Songs Submitted
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{submittedGuestSongsCount}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Slug
                    </p>
                    <p className="mt-1 break-all text-sm text-stone-700">{show.slug}</p>
                  </div>
                </div>

                {showReminderSummary ? (
                  <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Countdown & Reminders
                      </p>
                      <p className="text-lg font-semibold text-stone-900">
                        {showReminderSummary.daysUntilShow >= 0
                          ? `${showReminderSummary.daysUntilShow} days until show`
                          : `${Math.abs(showReminderSummary.daysUntilShow)} days since show`}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Facebook Flyer / Ad
                        </p>
                        <p className="mt-1 text-sm text-stone-700">
                          {showReminderSummary.isFacebookReminderActive
                            ? "Facebook flyer/ad window is active"
                            : `${showReminderSummary.facebookReminderDays} days until Facebook flyer/ad window starts`}
                        </p>
                      </div>

                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Banner / Sign
                        </p>
                        <p className="mt-1 text-sm text-stone-700">
                          {showReminderSummary.isBannerReminderActive
                            ? "Banner/sign window is active"
                            : `${showReminderSummary.bannerReminderDays} days until banner/sign window starts`}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Needs Attention
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">At a Glance</h3>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Guests Missing Songs
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{guestsMissingSongsCount}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Guests Missing Bio or Photo
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{guestsMissingPromoInfoCount}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Unconfirmed Guests
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{unconfirmedGuestsCount}</p>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Show Checklist
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">Simple To-Do List</h3>
                  <p className="text-sm text-stone-600">
                    Track small show tasks without changing the rest of the admin workflow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsShowChecklistOpen((currentValue) => !currentValue)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:w-auto"
                >
                  {isShowChecklistOpen ? "Hide Checklist" : "Show Checklist"}
                </button>
              </div>

              <SectionLoadWarning message={dataSectionErrors.checklistItems} />

              {isShowChecklistOpen ? (
                <div className="mt-4 grid gap-4">
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        Quick Add
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {showChecklistQuickAddTasks.map((task) => (
                          <button
                            key={task}
                            type="button"
                            onClick={() => void handleAddShowChecklistTask(task)}
                            disabled={activeChecklistActionId === "create"}
                            className="rounded-full border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {task}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <form
                    className="rounded-2xl border border-stone-200 bg-white p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleAddShowChecklistTask(newChecklistTask);
                    }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        value={newChecklistTask}
                        onChange={(event) => setNewChecklistTask(event.target.value)}
                        className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Add a custom checklist task"
                      />
                      <button
                        type="submit"
                        disabled={activeChecklistActionId === "create"}
                        className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                      >
                        {activeChecklistActionId === "create" ? "Adding..." : "Add Task"}
                      </button>
                    </div>
                  </form>

                  {showChecklistItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500">
                      No checklist items yet. Use Quick Add or create a custom task.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {showChecklistItems.map((item) => (
                        <article
                          key={item.id}
                          className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <label className="flex min-w-0 flex-1 items-start gap-3">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => void handleToggleShowChecklistItem(item)}
                              disabled={activeChecklistActionId === item.id}
                              className="mt-0.5 h-4 w-4 rounded border border-stone-300 text-emerald-700 focus:ring-emerald-600"
                            />
                            <div className="min-w-0">
                              <p
                                className={`text-sm font-medium ${
                                  item.completed ? "text-stone-500 line-through" : "text-stone-900"
                                }`}
                              >
                                {item.task}
                              </p>
                            </div>
                          </label>

                          <button
                            type="button"
                            onClick={() => void handleDeleteShowChecklistItem(item)}
                            disabled={activeChecklistActionId === `delete-${item.id}`}
                            className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {activeChecklistActionId === `delete-${item.id}` ? "Deleting..." : "Delete"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  Quick Actions
                </p>
                <h3 className="text-lg font-semibold text-stone-900">Jump Into a Section</h3>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("setlist")}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">Setlist</p>
                  <p className="mt-1 text-sm text-stone-600">Open the official setlist and print tools.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("guests")}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">Guests</p>
                  <p className="mt-1 text-sm text-stone-600">Review bios, links, and guest readiness.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("songs")}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">Songs</p>
                  <p className="mt-1 text-sm text-stone-600">Manage the song library and show suggestions.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("show-details")}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">Itinerary</p>
                  <p className="mt-1 text-sm text-stone-600">Open timing, venue, and show logistics.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("promo-materials")}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">Promo Materials</p>
                  <p className="mt-1 text-sm text-stone-600">View and manage flyers, graphics, and assets.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAdminTab("setlist")}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">Print Center</p>
                  <p className="mt-1 text-sm text-stone-600">Use the existing print buttons in the setlist tools.</p>
                </button>
                <a
                  href="https://charts.pinnaclestudiotn.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-stone-50"
                >
                  <p className="text-sm font-semibold text-stone-900">ChartBuilder</p>
                  <p className="mt-1 text-sm text-stone-600">Open the external chart tool in a new tab.</p>
                </a>
              </div>
            </section>
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

        {shouldShowGuestWelcomeTab ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                Welcome
              </h2>
            </div>

            <div className="rounded-3xl border border-emerald-900/60 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-slate-100 shadow-sm sm:px-6">
              <div className="mx-auto flex max-w-4xl flex-col gap-4 text-center">
                <div className="flex justify-center">
                  <Image
                    src="/cmms-logo.png"
                    alt="Cumberland Mountain Music Show logo"
                    width={360}
                    height={120}
                    className="h-auto max-h-[90px] w-full max-w-[280px] object-contain sm:max-h-[110px] sm:max-w-[340px]"
                  />
                </div>
                {isPrivateGuestPortal && privateGuestWelcomeInformation ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
                    <div className="mt-3 flex flex-col gap-4 text-sm leading-7 text-slate-100">
                      {privateGuestGreeting ? (
                        <p className="text-base font-semibold text-emerald-100 sm:text-lg">
                          {privateGuestGreeting}
                        </p>
                      ) : null}
                      <p>{privateGuestWelcomeInformation.intro}</p>
                      <p>{privateGuestWelcomeInformation.summary}</p>
                      <div className="flex flex-col gap-2">
                        <h4 className="text-sm font-semibold text-emerald-100">Portal Sections</h4>
                        {privateGuestWelcomeInformation.portalSections.map((detail) => (
                          <p key={detail}>&bull; {detail}</p>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <h4 className="text-sm font-semibold text-emerald-100">Show Information</h4>
                        {privateGuestWelcomeInformation.showInformation.map((detail) => (
                          <p key={detail}>&bull; {detail}</p>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <h4 className="text-sm font-semibold text-emerald-100">
                          Stage &amp; Sound Information
                        </h4>
                        {privateGuestWelcomeInformation.stageAndSoundInformation.map((detail) => (
                          <p key={detail}>{detail}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : !isPrivateGuestPortal ? (
                  <p className="whitespace-pre-wrap text-sm leading-8 text-slate-100 sm:text-base">
                    {guestWelcomeMessage}
                  </p>
                ) : null}
                {privateGuestAppearanceDetails.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-100">
                      Appearance Details
                    </h3>
                    <div className="mt-3 flex flex-col gap-2 text-sm leading-7 text-slate-100">
                      {privateGuestAppearanceDetails.map((detail) => (
                        <p key={detail}>{detail}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {isGuestView ? (
          <section className="print-hidden flex flex-col gap-4 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Guest Sections</h2>
              <p className="text-sm text-stone-600">
                Move through your artist details, itinerary, songs, and promo materials in one place.
              </p>
            </div>

            <div
              className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-2 sm:grid-cols-5"
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
                  This ordered rundown follows the live setlist so sponsor reads can sit clearly
                  between songs without changing the actual set order.
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

              {setlist.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No official setlist is available yet, so the rundown can&apos;t show sponsor
                  placement between songs.
                </div>
              ) : (
                <div className="grid gap-3">
                  {adminMcSponsorPlacementItems.map((item, index) => {
                    if (item.kind === "marker") {
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-dashed border-stone-300 bg-stone-100/70 px-4 py-3"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
                            {getMcFlowMarkerLabel(item.marker)}
                          </p>
                        </div>
                      );
                    }

                    if (item.kind === "sponsor") {
                      const sponsorIndex = adminMcSponsorPlacementItems.findIndex(
                        (flowItem) =>
                          flowItem.kind === "sponsor" && flowItem.sponsor.id === item.sponsor.id,
                      );
                      const canMoveUp = sponsorIndex > 0;
                      const canMoveDown =
                        sponsorIndex >= 0 &&
                        sponsorIndex < adminMcSponsorPlacementItems.length - 1;
                      const isMovingSponsor = activeSponsorActionId === `mc-${item.sponsor.id}`;
                      const isEditingSponsor = activeSponsorActionId === `show-${item.sponsor.id}`;

                      return (
                        <div key={item.id} className="grid gap-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-semibold text-amber-950">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1 grid gap-3">
                              <SponsorReadCard sponsor={item.sponsor} />
                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleMoveMcSponsorBySong(item.sponsor.id, "up")}
                                  disabled={!canMoveUp || isMovingSponsor}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Move Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveMcSponsorBySong(item.sponsor.id, "down")}
                                  disabled={!canMoveDown || isMovingSponsor}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Move Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditingShowSponsor(item.sponsor.id)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShowSponsor(item.sponsor.id)}
                                  disabled={isEditingSponsor}
                                  className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                                >
                                  {isEditingSponsor ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const priorSong = adminMcSponsorPlacementItems
                      .slice(0, index)
                      .reverse()
                      .find(
                        (
                          flowItem,
                        ): flowItem is Extract<McSponsorPlacementRenderableItem, { kind: "song" }> =>
                          flowItem.kind === "song",
                      );
                    const shouldShowSectionHeader =
                      !priorSong || priorSong.song.section !== item.song.section;
                    const mcBlock = mcBlockLookup[item.song.id] ?? null;
                    const blockDraft = mcBlock
                      ? mcBlockNoteDrafts[mcBlock.anchorSongId] ?? {
                          introNote: "",
                          sponsorMention: "",
                          transitionNote: "",
                        }
                      : null;
                    const areMcBlockNotesExpanded = mcBlock
                      ? expandedMcBlockNoteIds.includes(mcBlock.anchorSongId)
                      : false;

                    return (
                      <div key={item.id} className="grid gap-3">
                        {shouldShowSectionHeader ? (
                          <div className="flex flex-col gap-1 pt-2">
                            <h4 className="text-lg font-semibold text-stone-900">
                              {formatMcBlockSectionLabel(item.song.section)}
                            </h4>
                            <p className="text-sm text-stone-600">
                              Individual song anchors for sponsor placement
                            </p>
                          </div>
                        ) : null}

                        <article className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">
                                {item.song.position}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                                    Song
                                  </span>
                                  {item.song.source_type === "guest" ? (
                                    <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-900">
                                      Guest
                                    </span>
                                  ) : null}
                                </div>
                                <h5 className="mt-2 text-base font-semibold text-stone-900">
                                  {item.song.title}
                                  {item.song.song_key ? ` (${item.song.song_key})` : ""}
                                </h5>
                                <p className="mt-1 text-sm text-stone-600">
                                  Performer: {getDisplaySingerName(item.song.artist)}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowSponsorAssignmentFormState({
                                    ...initialShowSponsorAssignmentFormState,
                                    placementType: "before_performer",
                                    linkedPerformer: getDisplaySingerName(item.song.artist),
                                  });
                                  setActiveAdminTab("sponsors");
                                }}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Add Sponsor Read Before
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowSponsorAssignmentFormState({
                                    ...initialShowSponsorAssignmentFormState,
                                    placementType: "after_performer",
                                    linkedPerformer: getDisplaySingerName(item.song.artist),
                                  });
                                  setActiveAdminTab("sponsors");
                                }}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Add Sponsor Read After
                              </button>
                            </div>
                          </div>

                          {mcBlock && blockDraft ? (
                            <div className="mt-4 grid gap-4 border-t border-stone-200 pt-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-col gap-1">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                    Performer Block Notes
                                  </p>
                                  <p className="text-sm text-stone-600">
                                    These notes stay tied to the start of this performer block.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleMcBlockNotes(mcBlock.anchorSongId)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  {areMcBlockNotesExpanded
                                    ? "Hide Performer Notes"
                                    : "Show Performer Notes"}
                                </button>
                              </div>

                              {areMcBlockNotesExpanded ? (
                                <>
                                  <div className="grid gap-4 lg:grid-cols-3">
                                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                      Intro Note
                                      <textarea
                                        value={blockDraft.introNote}
                                        onChange={(event) =>
                                          handleMcBlockDraftChange(
                                            mcBlock.anchorSongId,
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
                                            mcBlock.anchorSongId,
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
                                            mcBlock.anchorSongId,
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
                                      onClick={() => handleSaveMcBlockNote(mcBlock.anchorSongId)}
                                      disabled={activeMcBlockActionId === mcBlock.anchorSongId}
                                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                    >
                                      {activeMcBlockActionId === mcBlock.anchorSongId
                                        ? "Saving Block Notes..."
                                        : "Save Block Notes"}
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}

              {showSponsors.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No sponsors are assigned to this show yet.
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-5">
              {(mcRunSheetData.beforeIntermission.length > 0 ||
                mcRunSheetData.afterIntermission.length > 0) ? (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-lg font-semibold text-stone-900">Intermission Preview</h4>
                    <p className="text-sm text-stone-600">
                      Sponsor reads that will appear around the break.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {mcRunSheetData.beforeIntermission.map((sponsor) => (
                      <SponsorReadCard key={`admin-before-intermission-${sponsor.id}`} sponsor={sponsor} />
                    ))}

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

        {shouldShowAdminFinanceTab ? (
          <section className="print-hidden flex flex-col gap-6 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Finance</h2>
                <p className="text-sm text-stone-600">
                  Simple per-show income and expense tracking for settlement reporting.
                </p>
              </div>
              {shouldShowFinanceReportingSubTab ? (
                <button
                  type="button"
                  onClick={handlePrintFinanceReport}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:w-auto"
                >
                  Print Finance Report
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl bg-stone-100 p-2">
              {financeAdminSubTabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFinanceAdminSubTab(tab.key)}
                  className={`flex min-w-[12rem] flex-1 flex-col rounded-xl px-4 py-3 text-left transition ${
                    activeFinanceAdminSubTab === tab.key
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

            {shouldShowFinanceReportingSubTab ? (
              <>
                <SectionLoadWarning message={dataSectionErrors.financeItems} />

                {financeStatusMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {financeStatusMessage}
                  </div>
                ) : null}

                {financeErrorMessage ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {financeErrorMessage}
                  </div>
                ) : null}

                <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-semibold text-stone-900">Yearly Finance Summary</h3>
                      <p className="text-sm text-stone-600">
                        Read-only income and expense totals across all shows in the selected year.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsYearlyFinanceSummaryExpanded((currentValue) => !currentValue)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:w-auto"
                    >
                      {isYearlyFinanceSummaryExpanded ? "Hide Summary" : "Show Summary"}
                    </button>
                  </div>

                  {isYearlyFinanceSummaryExpanded ? (
                    <>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <label className="flex w-full max-w-[13rem] flex-col gap-2 text-sm font-medium text-stone-700">
                          Year
                          <select
                            value={selectedYearlyFinanceYear}
                            onChange={(event) => setSelectedYearlyFinanceYear(Number(event.target.value))}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          >
                            {availableYearlyFinanceYears.map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={() => void handlePrintYearToDateFinanceReport()}
                          disabled={isPrintingYearlyFinanceReport}
                          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          {isPrintingYearlyFinanceReport ? "Preparing Report..." : "Print Year-to-Date Report"}
                        </button>
                      </div>

                      {yearlyFinanceErrorMessage ? (
                        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          Finance summary data could not be loaded: {yearlyFinanceErrorMessage}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          {
                            label: "Total Income",
                            value: formatCurrency(yearlyFinanceSummary.totalIncome),
                            tone: "text-emerald-700",
                          },
                          {
                            label: "Total Expenses",
                            value: formatCurrency(yearlyFinanceSummary.totalExpenses),
                            tone: "text-rose-700",
                          },
                          {
                            label: "Net Profit / Loss",
                            value: formatCurrency(yearlyFinanceSummary.net),
                            tone: yearlyFinanceSummary.net < 0 ? "text-rose-700" : "text-stone-900",
                          },
                          {
                            label: "Profit Margin",
                            value: formatProfitMargin(
                              yearlyFinanceSummary.totalIncome,
                              yearlyFinanceSummary.net,
                            ) ?? "N/A",
                            tone: "text-stone-900",
                          },
                        ].map((card) => (
                          <article key={card.label} className="rounded-2xl border border-stone-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                              {card.label}
                            </p>
                            <p className={`mt-3 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
                          </article>
                        ))}
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                        <section className="rounded-2xl border border-stone-200 bg-white p-4">
                          <div className="flex flex-col gap-1">
                            <h4 className="text-base font-semibold text-stone-900">Shows in {selectedYearlyFinanceYear}</h4>
                            <p className="text-sm text-stone-600">
                              Archived and historical shows are included when they fall in the selected year.
                            </p>
                          </div>

                          {selectedYearlyFinanceShows.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                              No shows with dates were found for {selectedYearlyFinanceYear}.
                            </div>
                          ) : (
                            <div className="mt-4 grid gap-3">
                              {yearlyFinanceSummary.showBreakdown.map(({ show: yearlyShow, income, expenses, net }) => (
                                <article key={yearlyShow.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-base font-semibold text-stone-900">{yearlyShow.name}</p>
                                      <p className="mt-1 text-sm text-stone-600">{formatShowDate(yearlyShow.show_date)}</p>
                                    </div>

                                    <div className="grid gap-2 text-sm sm:text-right">
                                      <p className="text-stone-600">
                                        <span className="font-medium text-stone-900">Income:</span> {formatCurrency(income)}
                                      </p>
                                      <p className="text-stone-600">
                                        <span className="font-medium text-stone-900">Expenses:</span> {formatCurrency(expenses)}
                                      </p>
                                      <p className={`font-semibold ${net < 0 ? "text-rose-700" : "text-stone-900"}`}>
                                        Net: {formatCurrency(net)}
                                      </p>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="rounded-2xl border border-stone-200 bg-white p-4">
                          <div className="flex flex-col gap-1">
                            <h4 className="text-base font-semibold text-stone-900">Category Totals</h4>
                            <p className="text-sm text-stone-600">
                              Read-only rollup of saved income and expense categories for the year.
                            </p>
                          </div>

                          {yearlyFinanceSummary.categoryTotals.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                              No categorized finance items found for {selectedYearlyFinanceYear}.
                            </div>
                          ) : (
                            <div className="mt-4 grid gap-2">
                              {yearlyFinanceSummary.categoryTotals.map((item) => (
                                <div
                                  key={`${item.type}-${item.category}`}
                                  className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-stone-900">{item.category}</p>
                                    <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{item.type}</p>
                                  </div>
                                  <p className={`text-sm font-semibold ${item.type === "expense" ? "text-rose-700" : "text-emerald-700"}`}>
                                    {formatCurrency(item.amount)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </>
                  ) : null}
                </section>

                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Current Show Finance</h3>
                  <p className="text-sm text-stone-600">
                    Income and expenses below apply only to this show.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Total Income
                </p>
                <p className="mt-3 text-2xl font-semibold text-emerald-700">
                  {formatCurrency(totalIncome)}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Total Expenses
                </p>
                <p className="mt-3 text-2xl font-semibold text-stone-900">
                  {formatCurrency(totalExpenses)}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Net Profit / Loss
                </p>
                <p
                  className={`mt-3 text-2xl font-semibold ${
                    netProfit < 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {formatCurrency(netProfit)}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Overhead / Expenses
                </p>
                <p className="mt-3 text-2xl font-semibold text-stone-900">
                  {formatCurrency(totalExpenses)}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Profit Margin
                </p>
                <p
                  className={`mt-3 text-2xl font-semibold ${
                    netProfit < 0 ? "text-rose-700" : "text-stone-900"
                  }`}
                >
                  {profitMargin ?? "N/A"}
                </p>
              </article>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="grid gap-4 rounded-2xl border border-emerald-900/40 bg-stone-900 p-4 shadow-sm">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-50">Income</h3>
                  <p className="text-sm text-stone-300">
                    Add manual income items for this show.
                  </p>
                </div>

                <form className="grid gap-3" onSubmit={(event) => void handleCreateFinanceItem(event, "income")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Label / Description
                      <input
                        type="text"
                        name="label"
                        value={incomeFinanceFormState.label}
                        onChange={(event) => handleFinanceFormChange(event, "income", "new")}
                        className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-emerald-500"
                        placeholder="Presale Tickets"
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Category
                      <select
                        name="category"
                        value={incomeFinanceFormState.category}
                        onChange={(event) => handleFinanceFormChange(event, "income", "new")}
                        className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-emerald-500"
                      >
                        <option value="">Choose a category</option>
                        {financeCategoryOptions.income.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Notes
                      <textarea
                        name="notes"
                        value={incomeFinanceFormState.notes}
                        onChange={(event) => handleFinanceFormChange(event, "income", "new")}
                        className="min-h-20 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-emerald-500"
                        placeholder="Optional details"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Amount
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        name="amount"
                        value={incomeFinanceFormState.amount}
                        onChange={(event) => handleFinanceFormChange(event, "income", "new")}
                        className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-emerald-500"
                        placeholder="0.00"
                        required
                      />
                    </label>
                  </div>

                  <div className="flex justify-start pt-1">
                    <button
                      type="submit"
                      disabled={activeFinanceActionId === "create-income"}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {activeFinanceActionId === "create-income" ? "Adding Income..." : "Add Income Item"}
                    </button>
                  </div>
                </form>

                {incomeFinanceItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-950 px-4 py-5 text-sm text-stone-400">
                    No income items added yet.
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    {incomeFinanceItems.map((item) => (
                      <article key={item.id} className="rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-3">
                        {editingFinanceItemId === item.id ? (
                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Label / Description
                                <input
                                  type="text"
                                  name="label"
                                  value={editingFinanceItemFormState.label}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-emerald-500"
                                  required
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Category
                                <select
                                  name="category"
                                  value={editingFinanceItemFormState.category}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-emerald-500"
                                >
                                  <option value="">Choose a category</option>
                                  {financeCategoryOptions[item.type].map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Notes
                                <textarea
                                  name="notes"
                                  value={editingFinanceItemFormState.notes}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="min-h-20 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-emerald-500"
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Amount
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  name="amount"
                                  value={editingFinanceItemFormState.amount}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-emerald-500"
                                  required
                                />
                              </label>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => void handleSaveFinanceItem(item)}
                                disabled={activeFinanceActionId === `edit-${item.id}`}
                                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                              >
                                {activeFinanceActionId === `edit-${item.id}` ? "Saving..." : "Save Item"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingFinanceItem}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-stone-100">{item.label}</h4>
                                {item.category ? (
                                  <span className="rounded-full border border-emerald-800/60 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                                    {item.category}
                                  </span>
                                ) : null}
                              </div>
                              {item.notes?.trim() ? (
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stone-400">{item.notes}</p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
                              <p className="min-w-[7rem] text-sm font-semibold text-emerald-300 sm:text-right">
                                {formatCurrency(item.amount)}
                              </p>
                              <button
                                type="button"
                                onClick={() => startEditingFinanceItem(item)}
                                className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteFinanceItem(item)}
                                disabled={activeFinanceActionId === `delete-${item.id}`}
                                className="rounded-lg border border-rose-900/60 bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {activeFinanceActionId === `delete-${item.id}` ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid gap-4 rounded-2xl border border-rose-900/40 bg-stone-900 p-4 shadow-sm">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-50">Expenses</h3>
                  <p className="text-sm text-stone-300">
                    Add manual expenses for this show.
                  </p>
                </div>

                <form className="grid gap-3" onSubmit={(event) => void handleCreateFinanceItem(event, "expense")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Label / Description
                      <input
                        type="text"
                        name="label"
                        value={expenseFinanceFormState.label}
                        onChange={(event) => handleFinanceFormChange(event, "expense", "new")}
                        className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-rose-500"
                        placeholder="Facebook Ad"
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Category
                      <select
                        name="category"
                        value={expenseFinanceFormState.category}
                        onChange={(event) => handleFinanceFormChange(event, "expense", "new")}
                        className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-rose-500"
                      >
                        <option value="">Choose a category</option>
                        {financeCategoryOptions.expense.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Notes
                      <textarea
                        name="notes"
                        value={expenseFinanceFormState.notes}
                        onChange={(event) => handleFinanceFormChange(event, "expense", "new")}
                        className="min-h-20 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-rose-500"
                        placeholder="Optional details"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                      Amount
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        name="amount"
                        value={expenseFinanceFormState.amount}
                        onChange={(event) => handleFinanceFormChange(event, "expense", "new")}
                        className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none transition placeholder:text-stone-500 focus:border-rose-500"
                        placeholder="0.00"
                        required
                      />
                    </label>
                  </div>

                  <div className="flex justify-start pt-1">
                    <button
                      type="submit"
                      disabled={activeFinanceActionId === "create-expense"}
                      className="rounded-xl bg-rose-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-400"
                    >
                      {activeFinanceActionId === "create-expense" ? "Adding Expense..." : "Add Expense Item"}
                    </button>
                  </div>
                </form>

                {expenseFinanceItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-950 px-4 py-5 text-sm text-stone-400">
                    No expense items added yet.
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    {expenseFinanceItems.map((item) => (
                      <article key={item.id} className="rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-3">
                        {editingFinanceItemId === item.id ? (
                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Label / Description
                                <input
                                  type="text"
                                  name="label"
                                  value={editingFinanceItemFormState.label}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-rose-500"
                                  required
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Category
                                <select
                                  name="category"
                                  value={editingFinanceItemFormState.category}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-rose-500"
                                >
                                  <option value="">Choose a category</option>
                                  {financeCategoryOptions[item.type].map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Notes
                                <textarea
                                  name="notes"
                                  value={editingFinanceItemFormState.notes}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="min-h-20 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-rose-500"
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-200">
                                Amount
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  name="amount"
                                  value={editingFinanceItemFormState.amount}
                                  onChange={(event) => handleFinanceFormChange(event, item.type, "edit")}
                                  className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-rose-500"
                                  required
                                />
                              </label>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => void handleSaveFinanceItem(item)}
                                disabled={activeFinanceActionId === `edit-${item.id}`}
                                className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-400"
                              >
                                {activeFinanceActionId === `edit-${item.id}` ? "Saving..." : "Save Item"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingFinanceItem}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-stone-100">{item.label}</h4>
                                {item.category ? (
                                  <span className="rounded-full border border-rose-800/60 bg-rose-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-200">
                                    {item.category}
                                  </span>
                                ) : null}
                              </div>
                              {item.notes?.trim() ? (
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stone-400">{item.notes}</p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
                              <p className="min-w-[7rem] text-sm font-semibold text-rose-200 sm:text-right">
                                {formatCurrency(item.amount)}
                              </p>
                              <button
                                type="button"
                                onClick={() => startEditingFinanceItem(item)}
                                className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteFinanceItem(item)}
                                disabled={activeFinanceActionId === `delete-${item.id}`}
                                className="rounded-lg border border-rose-900/60 bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {activeFinanceActionId === `delete-${item.id}` ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
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

        {shouldShowFinancePayoutSubTab ? (
          <section className="print-hidden flex flex-col gap-6 border-t border-stone-200 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Show Payout Sheet</h2>
                <p className="text-sm text-stone-600">
                  Track simple night-of-show payouts without changing the existing finance workflow.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePrintPayoutSheet}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:w-auto"
              >
                Print Payout Sheet
              </button>
            </div>

            <SectionLoadWarning message={dataSectionErrors.payoutItems} />

            {payoutStatusMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {payoutStatusMessage}
              </div>
            ) : null}

            {payoutErrorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {payoutErrorMessage}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Total Payout
                </p>
                <p className="mt-3 text-2xl font-semibold text-stone-900">
                  {formatCurrency(payoutTotalAmount)}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Paid Items
                </p>
                <p className="mt-3 text-2xl font-semibold text-emerald-700">
                  {payoutItems.filter((item) => item.paid).length}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Unpaid Items
                </p>
                <p className="mt-3 text-2xl font-semibold text-rose-700">
                  {payoutItems.filter((item) => !item.paid).length}
                </p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Total Rows
                </p>
                <p className="mt-3 text-2xl font-semibold text-stone-900">
                  {payoutItems.length}
                </p>
              </article>
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <section className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Add Payout Item</h3>
                  <p className="text-sm text-stone-600">
                    Add band, guest, hospitality, printing, and other night-of-show payout rows.
                  </p>
                </div>

                <form className="grid gap-3" onSubmit={(event) => void handleCreatePayoutItem(event)}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Payee Name
                      <input
                        type="text"
                        name="payeeName"
                        value={payoutFormState.payeeName}
                        onChange={(event) => handlePayoutFormChange(event, "new")}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Performer or vendor"
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Category
                      <select
                        name="category"
                        value={payoutFormState.category}
                        onChange={(event) => handlePayoutFormChange(event, "new")}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Choose a category</option>
                        {payoutCategoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Description / Notes
                      <textarea
                        name="description"
                        value={payoutFormState.description}
                        onChange={(event) => handlePayoutFormChange(event, "new")}
                        className="min-h-20 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Optional details"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Amount
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        name="amount"
                        value={payoutFormState.amount}
                        onChange={(event) => handlePayoutFormChange(event, "new")}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="0.00"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Payment Method
                      <select
                        name="paymentMethod"
                        value={payoutFormState.paymentMethod}
                        onChange={(event) => handlePayoutFormChange(event, "new")}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      >
                        <option value="">Choose a payment method</option>
                        {payoutPaymentMethodOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700">
                      <input
                        type="checkbox"
                        name="paid"
                        checked={payoutFormState.paid}
                        onChange={(event) => handlePayoutFormChange(event, "new")}
                        className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                      />
                      Mark as already paid
                    </label>
                  </div>

                  <div className="flex justify-start">
                    <button
                      type="submit"
                      disabled={activePayoutActionId === "create"}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {activePayoutActionId === "create" ? "Adding..." : "Add Payout Item"}
                    </button>
                  </div>
                </form>

                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-stone-900">Quick Add Guests</h4>
                      <p className="mt-1 text-sm text-stone-600">
                        Add attached guests as payout rows with category set to Guest.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsGuestPayoutQuickAddOpen((currentValue) => !currentValue)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      {isGuestPayoutQuickAddOpen ? "Hide Guests" : "Quick Add Guests"}
                    </button>
                  </div>

                  {isGuestPayoutQuickAddOpen ? (
                    guestProfiles.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-500">
                        No guests are attached to this show yet.
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {guestProfiles.map((guestProfile) => (
                          <button
                            key={guestProfile.id}
                            type="button"
                            onClick={() => void handleQuickAddGuestPayout(guestProfile)}
                            disabled={activePayoutActionId === `guest-${guestProfile.id}`}
                            className="rounded-full border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {activePayoutActionId === `guest-${guestProfile.id}`
                              ? "Adding..."
                              : guestProfile.name?.trim() || "Unnamed Guest"}
                          </button>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              </section>

              <section className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-stone-900">Saved Payout Items</h3>
                  <p className="text-sm text-stone-600">
                    Mark items paid, edit them, or remove them before printing the final sheet.
                  </p>
                </div>

                {payoutItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500">
                    No payout items added yet.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {payoutItemsByCategory.map((group) => (
                      <section key={group.category} className="grid gap-2">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">
                          {group.category}
                        </h4>
                        {group.items.map((item) => (
                          <article key={item.id} className="rounded-xl border border-stone-200 bg-white px-4 py-4">
                            {editingPayoutItemId === item.id ? (
                              <div className="grid gap-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Payee Name
                                    <input
                                      type="text"
                                      name="payeeName"
                                      value={editingPayoutFormState.payeeName}
                                      onChange={(event) => handlePayoutFormChange(event, "edit")}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      required
                                    />
                                  </label>
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Category
                                    <select
                                      name="category"
                                      value={editingPayoutFormState.category}
                                      onChange={(event) => handlePayoutFormChange(event, "edit")}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    >
                                      <option value="">Choose a category</option>
                                      {payoutCategoryOptions.map((category) => (
                                        <option key={category} value={category}>
                                          {category}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Description / Notes
                                    <textarea
                                      name="description"
                                      value={editingPayoutFormState.description}
                                      onChange={(event) => handlePayoutFormChange(event, "edit")}
                                      className="min-h-20 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Amount
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      name="amount"
                                      value={editingPayoutFormState.amount}
                                      onChange={(event) => handlePayoutFormChange(event, "edit")}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      required
                                    />
                                  </label>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Payment Method
                                    <select
                                      name="paymentMethod"
                                      value={editingPayoutFormState.paymentMethod}
                                      onChange={(event) => handlePayoutFormChange(event, "edit")}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    >
                                      <option value="">Choose a payment method</option>
                                      {payoutPaymentMethodOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700">
                                    <input
                                      type="checkbox"
                                      name="paid"
                                      checked={editingPayoutFormState.paid}
                                      onChange={(event) => handlePayoutFormChange(event, "edit")}
                                      className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                                    />
                                    Mark as paid
                                  </label>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <button
                                    type="button"
                                    onClick={() => void handleSavePayoutItem(item)}
                                    disabled={activePayoutActionId === `edit-${item.id}`}
                                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                  >
                                    {activePayoutActionId === `edit-${item.id}` ? "Saving..." : "Save Payout"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingPayoutItem}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-sm font-semibold text-stone-900">{item.payee_name}</h4>
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                        item.paid
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-amber-100 text-amber-800"
                                      }`}
                                    >
                                      {item.paid ? "Paid" : "Unpaid"}
                                    </span>
                                    {item.payment_method ? (
                                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
                                        {item.payment_method}
                                      </span>
                                    ) : null}
                                  </div>
                                  {item.description?.trim() ? (
                                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{item.description}</p>
                                  ) : null}
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
                                  <p className="min-w-[7rem] text-sm font-semibold text-stone-900 sm:text-right">
                                    {formatCurrency(item.amount)}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => void handleTogglePayoutPaid(item)}
                                    disabled={activePayoutActionId === `paid-${item.id}`}
                                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {item.paid ? "Mark Unpaid" : "Mark Paid"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditingPayoutItem(item)}
                                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeletePayoutItem(item)}
                                    disabled={activePayoutActionId === `delete-${item.id}`}
                                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {activePayoutActionId === `delete-${item.id}` ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </article>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </section>
            </div>
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

            <SectionLoadWarning
              message={
                dataSectionErrors.sponsorLibrary ||
                dataSectionErrors.potentialSponsors ||
                dataSectionErrors.showSponsors
              }
            />

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

                <section className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-base font-semibold text-stone-900">Potential Sponsors</h4>
                      <p className="text-sm text-stone-600">
                        Track businesses you may approach before adding them to the permanent sponsor library.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPotentialSponsorsOpen((currentValue) => !currentValue)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:w-auto"
                    >
                      {isPotentialSponsorsOpen ? "Hide Potential Sponsors" : "Show Potential Sponsors"}
                    </button>
                  </div>

                  {isPotentialSponsorsOpen ? (
                    <div className="mt-4 grid gap-4">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (isPotentialSponsorFormOpen && !editingPotentialSponsorId) {
                              resetPotentialSponsorForm();
                              return;
                            }

                            setEditingPotentialSponsorId(null);
                            setPotentialSponsorFormState(initialPotentialSponsorFormState);
                            setIsPotentialSponsorFormOpen(true);
                          }}
                          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                        >
                          {isPotentialSponsorFormOpen && !editingPotentialSponsorId
                            ? "Hide Add Potential Sponsor"
                            : "Add Potential Sponsor"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setIsSponsorProposalGeneratorOpen((currentValue) => !currentValue)
                          }
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                        >
                          {isSponsorProposalGeneratorOpen
                            ? "Hide Proposal Generator"
                            : "Generate Proposal for New Business"}
                        </button>
                      </div>

                      {isPotentialSponsorFormOpen ? (
                        <form
                          className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4"
                          onSubmit={handleSavePotentialSponsor}
                        >
                          <div className="flex flex-col gap-1">
                            <h5 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-700">
                              {editingPotentialSponsorId ? "Edit Potential Sponsor" : "New Potential Sponsor"}
                            </h5>
                            <p className="text-sm text-stone-600">
                              Keep a lightweight note of sponsor prospects without creating a permanent sponsor record.
                            </p>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
                              Business Name
                              <input
                                type="text"
                                name="businessName"
                                value={potentialSponsorFormState.businessName}
                                onChange={handlePotentialSponsorFormChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Business or organization name"
                                required
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Contact Name
                              <input
                                type="text"
                                name="contactName"
                                value={potentialSponsorFormState.contactName}
                                onChange={handlePotentialSponsorFormChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Optional contact name"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Status
                              <select
                                name="status"
                                value={potentialSponsorFormState.status}
                                onChange={handlePotentialSponsorFormChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              >
                                {potentialSponsorStatusOptions.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Phone
                              <input
                                type="text"
                                name="phone"
                                value={potentialSponsorFormState.phone}
                                onChange={handlePotentialSponsorFormChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Optional phone number"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Email
                              <input
                                type="email"
                                name="email"
                                value={potentialSponsorFormState.email}
                                onChange={handlePotentialSponsorFormChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="Optional email address"
                              />
                            </label>
                          </div>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Notes
                            <textarea
                              name="notes"
                              value={potentialSponsorFormState.notes}
                              onChange={handlePotentialSponsorFormChange}
                              className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Conversation notes, context, or ideas"
                            />
                          </label>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                              type="submit"
                              disabled={
                                activeSponsorActionId === "potential-create" ||
                                activeSponsorActionId === `potential-save-${editingPotentialSponsorId ?? ""}`
                              }
                              className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                            >
                              {editingPotentialSponsorId ? "Save Potential Sponsor" : "Add Potential Sponsor"}
                            </button>
                            <button
                              type="button"
                              onClick={resetPotentialSponsorForm}
                              className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {isSponsorProposalGeneratorOpen ? (
                        <div
                          id="sponsor-proposal-generator"
                          className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4"
                        >
                          <div className="flex flex-col gap-1">
                            <h5 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-700">
                              New Business Proposal
                            </h5>
                            <p className="text-sm text-stone-600">
                              Generate and print a sponsor proposal without adding this business to the permanent sponsor library.
                            </p>
                          </div>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Business Name
                            <input
                              type="text"
                              name="businessName"
                              value={sponsorProposalGeneratorFormState.businessName}
                              onChange={handleSponsorProposalGeneratorChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Business or organization name"
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Contact Name
                            <input
                              type="text"
                              name="contactName"
                              value={sponsorProposalGeneratorFormState.contactName}
                              onChange={handleSponsorProposalGeneratorChange}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Optional contact name"
                            />
                          </label>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Sponsorship Level
                              <select
                                name="sponsorshipLevel"
                                value={sponsorProposalGeneratorFormState.sponsorshipLevel}
                                onChange={handleSponsorProposalGeneratorChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              >
                                <option value="Platinum Sponsor">Platinum</option>
                                <option value="Gold Sponsor">Gold</option>
                                <option value="Silver Sponsor">Silver</option>
                                <option value="Custom">Custom</option>
                              </select>
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Amount
                              <input
                                type="text"
                                name="amount"
                                value={sponsorProposalGeneratorFormState.amount}
                                onChange={handleSponsorProposalGeneratorChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                placeholder="$500.00"
                                required
                              />
                            </label>
                          </div>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Notes
                            <textarea
                              name="notes"
                              value={sponsorProposalGeneratorFormState.notes}
                              onChange={handleSponsorProposalGeneratorChange}
                              className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Optional notes to include on the proposal"
                            />
                          </label>

                          <div className="grid gap-4 rounded-xl border border-stone-200 bg-white p-4">
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Proposal Coverage
                              <select
                                name="proposalCoverage"
                                value={sponsorProposalGeneratorFormState.proposalCoverage}
                                onChange={handleSponsorProposalGeneratorChange}
                                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              >
                                <option value="current-show">Current Show</option>
                                <option value="season-year">Season / Year</option>
                                <option value="custom">Custom</option>
                              </select>
                            </label>

                            {sponsorProposalGeneratorFormState.proposalCoverage === "season-year" ? (
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Season / Year
                                <input
                                  type="text"
                                  name="proposalYear"
                                  value={sponsorProposalGeneratorFormState.proposalYear}
                                  onChange={handleSponsorProposalGeneratorChange}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder={String(new Date().getFullYear())}
                                />
                              </label>
                            ) : null}

                            {sponsorProposalGeneratorFormState.proposalCoverage === "custom" ? (
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Custom Coverage
                                <input
                                  type="text"
                                  name="proposalCustomCoverage"
                                  value={sponsorProposalGeneratorFormState.proposalCustomCoverage}
                                  onChange={handleSponsorProposalGeneratorChange}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Fall 2026 Show Series"
                                />
                              </label>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void handlePrintSponsorProposalDraft()}
                              disabled={activeSponsorActionId === "draft-proposal-print"}
                              className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                            >
                              {activeSponsorActionId === "draft-proposal-print"
                                ? "Generating Proposal..."
                                : "Print Proposal"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAddDraftSponsorToLibrary()}
                              disabled={activeSponsorActionId === "draft-proposal-add"}
                              className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {activeSponsorActionId === "draft-proposal-add"
                                ? "Adding Sponsor..."
                                : "Add to Sponsor Library"}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {potentialSponsors.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                          No potential sponsors have been added yet.
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {potentialSponsors.map((potentialSponsor) => (
                            <article
                              key={potentialSponsor.id}
                              className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5 className="text-base font-semibold text-stone-900">
                                      {potentialSponsor.business_name}
                                    </h5>
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPotentialSponsorStatusBadgeClasses(
                                        potentialSponsor.status,
                                      )}`}
                                    >
                                      {potentialSponsor.status}
                                    </span>
                                  </div>

                                  <div className="mt-2 grid gap-1 text-sm text-stone-600">
                                    {potentialSponsor.contact_name ? (
                                      <p>
                                        <span className="font-medium text-stone-800">Contact:</span>{" "}
                                        {potentialSponsor.contact_name}
                                      </p>
                                    ) : null}
                                    {potentialSponsor.phone ? (
                                      <p>
                                        <span className="font-medium text-stone-800">Phone:</span>{" "}
                                        {potentialSponsor.phone}
                                      </p>
                                    ) : null}
                                    {potentialSponsor.email ? (
                                      <p className="break-words">
                                        <span className="font-medium text-stone-800">Email:</span>{" "}
                                        {potentialSponsor.email}
                                      </p>
                                    ) : null}
                                    {potentialSponsor.notes ? (
                                      <p className="whitespace-pre-wrap">
                                        <span className="font-medium text-stone-800">Notes:</span>{" "}
                                        {potentialSponsor.notes}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditingPotentialSponsor(potentialSponsor.id)}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => primeProposalGeneratorFromPotentialSponsor(potentialSponsor)}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Generate Proposal
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleConvertPotentialSponsorToSponsor(potentialSponsor)}
                                    disabled={activeSponsorActionId === `potential-convert-${potentialSponsor.id}`}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Convert to Sponsor
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeletePotentialSponsor(potentialSponsor)}
                                    disabled={activeSponsorActionId === `potential-delete-${potentialSponsor.id}`}
                                    className="rounded-xl bg-stone-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setIsAddSponsorFormOpen((currentValue) => !currentValue)}
                      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      {isAddSponsorFormOpen ? "Hide Add Sponsor" : "Add Sponsor"}
                    </button>
                  </div>

                  <label
                    aria-hidden="true"
                    className="hidden items-center gap-2 text-sm font-medium text-stone-700"
                  >
                    <input
                      type="checkbox"
                      checked={showArchivedSponsors}
                      onChange={(event) => setShowArchivedSponsors(event.target.checked)}
                      className="h-4 w-4 rounded border border-stone-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    Show Archived Sponsors
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">
                      {archivedSponsorLibrary.length}
                    </span>
                  </label>
                </div>

                {isAddSponsorFormOpen ? (
                  <form className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4" onSubmit={handleCreateSponsorLibraryEntry}>
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Sponsor Type
                        <select
                          name="sponsorType"
                          value={newSponsorLibraryFormState.sponsorType}
                          onChange={(event) => handleSponsorLibraryChange(event, "new")}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        >
                          <option value="">Optional</option>
                          {sponsorTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Estimated Value
                        <input
                          type="text"
                          inputMode="decimal"
                          name="estimatedValue"
                          value={newSponsorLibraryFormState.estimatedValue}
                          onChange={(event) => handleSponsorLibraryChange(event, "new")}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          placeholder="Optional dollar amount"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Default Contribution
                      <textarea
                        name="defaultContribution"
                        value={newSponsorLibraryFormState.defaultContribution}
                        onChange={(event) => handleSponsorLibraryChange(event, "new")}
                        className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="What this sponsor usually provides"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Recognition Notes
                      <textarea
                        name="recognitionNotes"
                        value={newSponsorLibraryFormState.recognitionNotes}
                        onChange={(event) => handleSponsorLibraryChange(event, "new")}
                        className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="How this sponsor should be thanked or described"
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
                ) : null}

                {visibleSponsorLibrary.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500">
                    {showArchivedSponsors
                      ? "No sponsors match the current view yet."
                      : "No active reusable sponsors saved yet."}
                  </div>
                ) : (
                  <div className="grid gap-3">
                        {visibleSponsorLibrary.map((sponsor) => (
                      <article
                        key={sponsor.id}
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        {(() => {
                          const isEditing = editingSponsorLibraryId === sponsor.id;
                          const isExpanded = isEditing || expandedSponsorLibraryCardId === sponsor.id;
                          const sponsorDocumentFormState =
                            sponsorDocumentFormStates[sponsor.id] ?? buildSponsorDocumentFormState(sponsor);
                          const sponsorshipLevel = sponsor.sponsorship_level?.trim() || null;
                          const sponsorshipAmount =
                            sponsor.sponsorship_amount === null ? null : formatCurrency(sponsor.sponsorship_amount);
                          const sponsorType = sponsor.sponsor_type?.trim() || null;
                          const estimatedValue =
                            sponsor.estimated_value === null ? null : formatCurrency(sponsor.estimated_value);
                          const paymentStatus = sponsor.payment_status
                            ? formatSponsorPaymentStatusLabel(sponsor.payment_status)
                            : null;

                          return (
                            <>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex flex-1 items-center gap-3">
                                  <SponsorLogoThumbnail
                                    logoUrl={sponsor.logo_url}
                                    sponsorName={sponsor.name}
                                    className="h-12 w-12"
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="truncate text-base font-semibold text-stone-900">
                                        {sponsor.name}
                                      </h4>
                                      {sponsorshipLevel ? (
                                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                                          {sponsorshipLevel}
                                        </span>
                                      ) : null}
                                      {sponsorType ? (
                                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                                          {sponsorType}
                                        </span>
                                      ) : null}
                                      {paymentStatus ? (
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                          {paymentStatus}
                                        </span>
                                      ) : null}
                                      {sponsor.is_archived ? (
                                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                          Archived
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-500">
                                      {sponsorshipAmount ? <span>{sponsorshipAmount}</span> : null}
                                      {estimatedValue ? <span>Estimated value: {estimatedValue}</span> : null}
                                      {sponsor.website ? <span className="truncate">{sponsor.website}</span> : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedSponsorLibraryCardId((currentId) =>
                                        currentId === sponsor.id ? null : sponsor.id,
                                      )
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    {isExpanded ? "Hide Details" : "Expand / Details"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handlePrintSponsorDocument(sponsor, "proposal")}
                                    disabled={activeSponsorActionId === `proposal-${sponsor.id}`}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Proposal
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handlePrintSponsorDocument(sponsor, "quote")}
                                    disabled={activeSponsorActionId === `quote-${sponsor.id}`}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Quote
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handlePrintSponsorDocument(sponsor, "receipt")}
                                    disabled={activeSponsorActionId === `receipt-${sponsor.id}`}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Receipt
                                  </button>
                                  <button
                                    type="button"
                                    aria-hidden="true"
                                    onClick={() => void handleSetSponsorArchived(sponsor, !sponsor.is_archived)}
                                    disabled={
                                      activeSponsorActionId === `archive-${sponsor.id}` ||
                                      activeSponsorActionId === `restore-${sponsor.id}`
                                    }
                                    className="hidden rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {sponsor.is_archived ? "Restore" : "Archive"}
                                  </button>
                                </div>
                              </div>

                              {isExpanded ? (
                                <div className="mt-4 border-t border-stone-200 pt-4">
                        {isEditing ? (
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

                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Sponsor Type
                                <select
                                  name="sponsorType"
                                  value={sponsorLibraryFormState.sponsorType}
                                  onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                >
                                  <option value="">Optional</option>
                                  {sponsorTypeOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Estimated Value
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  name="estimatedValue"
                                  value={sponsorLibraryFormState.estimatedValue}
                                  onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional dollar amount"
                                />
                              </label>
                            </div>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Default Contribution
                              <textarea
                                name="defaultContribution"
                                value={sponsorLibraryFormState.defaultContribution}
                                onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Recognition Notes
                              <textarea
                                name="recognitionNotes"
                                value={sponsorLibraryFormState.recognitionNotes}
                                onChange={(event) => handleSponsorLibraryChange(event, "edit")}
                                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
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
                            <div className="flex justify-end">
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
                              {sponsorType ? <p>Sponsor Type: {sponsorType}</p> : null}
                              {estimatedValue ? <p>Estimated Value: {estimatedValue}</p> : null}
                              {sponsor.default_contribution ? (
                                <p className="whitespace-pre-wrap">Contribution: {sponsor.default_contribution}</p>
                              ) : null}
                              {sponsor.recognition_notes ? (
                                <p className="whitespace-pre-wrap">Recognition Notes: {sponsor.recognition_notes}</p>
                              ) : null}
                            </div>

                            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                              <div className="flex flex-col gap-1">
                                <h5 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-700">
                                  Sponsor Documents
                                </h5>
                                <p className="text-xs text-stone-500">
                                  Simple proposal, quote, and receipt details for this sponsor.
                                </p>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                  Sponsorship Level
                                  <select
                                    value={sponsorDocumentFormState.sponsorshipLevel ?? ""}
                                    onChange={(event) =>
                                      handleSponsorDocumentFormChange(
                                        sponsor.id,
                                        "sponsorshipLevel",
                                        event.target.value,
                                      )
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  >
                                    <option value="">Select level</option>
                                    {sponsorDocumentLevelOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                  Amount
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={sponsorDocumentFormState.sponsorshipAmount ?? ""}
                                    onChange={(event) =>
                                      handleSponsorDocumentFormChange(
                                        sponsor.id,
                                        "sponsorshipAmount",
                                        event.target.value,
                                      )
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    placeholder="500.00"
                                  />
                                </label>

                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                  Payment Status
                                  <select
                                    value={sponsorDocumentFormState.paymentStatus ?? "prospect"}
                                    onChange={(event) =>
                                      handleSponsorDocumentFormChange(
                                        sponsor.id,
                                        "paymentStatus",
                                        event.target.value,
                                      )
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  >
                                    {sponsorPaymentStatusOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                  Proposal Coverage
                                  <select
                                    value={sponsorDocumentFormState.proposalCoverage ?? "current-show"}
                                    onChange={(event) =>
                                      handleSponsorDocumentFormChange(
                                        sponsor.id,
                                        "proposalCoverage",
                                        event.target.value as SponsorDocumentFormState["proposalCoverage"],
                                      )
                                    }
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  >
                                    <option value="current-show">Current Show</option>
                                    <option value="season-year">Season / Year</option>
                                    <option value="custom">Custom</option>
                                  </select>
                                </label>

                                {(sponsorDocumentFormState.proposalCoverage ?? "current-show") === "season-year" ? (
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Season / Year
                                    <input
                                      type="text"
                                      value={sponsorDocumentFormState.proposalYear ?? String(new Date().getFullYear())}
                                      onChange={(event) =>
                                        handleSponsorDocumentFormChange(
                                          sponsor.id,
                                          "proposalYear",
                                          event.target.value,
                                        )
                                      }
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      placeholder={String(new Date().getFullYear())}
                                    />
                                  </label>
                                ) : null}

                                {(sponsorDocumentFormState.proposalCoverage ?? "current-show") === "custom" ? (
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
                                    Custom Coverage
                                    <input
                                      type="text"
                                      value={sponsorDocumentFormState.proposalCustomCoverage ?? ""}
                                      onChange={(event) =>
                                        handleSponsorDocumentFormChange(
                                          sponsor.id,
                                          "proposalCustomCoverage",
                                          event.target.value,
                                        )
                                      }
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      placeholder="Fall 2026 Show Series"
                                    />
                                  </label>
                                ) : null}
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveSponsorDocumentDetails(sponsor.id)}
                                  disabled={activeSponsorActionId === `documents-${sponsor.id}`}
                                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                >
                                  {activeSponsorActionId === `documents-${sponsor.id}` ? "Saving..." : "Save Sponsor Docs"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handlePrintSponsorDocument(sponsor, "proposal")}
                                  disabled={activeSponsorActionId === `proposal-${sponsor.id}`}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Print Proposal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handlePrintSponsorDocument(sponsor, "quote")}
                                  disabled={activeSponsorActionId === `quote-${sponsor.id}`}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Print Quote
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handlePrintSponsorDocument(sponsor, "receipt")}
                                  disabled={activeSponsorActionId === `receipt-${sponsor.id}`}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Print Receipt
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCopySponsorEmail(sponsor)}
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  Copy Sponsor Email
                                </button>
                              </div>

                              <div className="mt-4 grid gap-1 text-xs text-stone-500">
                                {sponsor.proposal_generated_at ? (
                                  <p>Proposal generated: {formatPortalStatusDateTime(sponsor.proposal_generated_at)}</p>
                                ) : null}
                                {sponsor.quote_generated_at ? (
                                  <p>Quote generated: {formatPortalStatusDateTime(sponsor.quote_generated_at)}</p>
                                ) : null}
                                {sponsor.receipt_generated_at ? (
                                  <p>Receipt generated: {formatPortalStatusDateTime(sponsor.receipt_generated_at)}</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                              <div className="flex flex-col gap-1">
                                <h5 className="text-sm font-semibold uppercase tracking-[0.14em] text-red-700">
                                  Remove Sponsor
                                </h5>
                                <p className="text-xs leading-5 text-red-700">
                                  Permanent delete removes this sponsor record and any show assignments tied to it. Use it only when you are sure this sponsor should be removed completely.
                                </p>
                              </div>

                              {sponsorDeleteConfirmId === sponsor.id ? (
                                <div className="mt-4 grid gap-3">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-red-800">
                                    Type DELETE to confirm permanent removal
                                    <input
                                      type="text"
                                      value={sponsorDeleteConfirmText}
                                      onChange={(event) => setSponsorDeleteConfirmText(event.target.value)}
                                      className="rounded-xl border border-red-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-red-500"
                                      placeholder="DELETE"
                                    />
                                  </label>

                                  <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteSponsorPermanently(sponsor)}
                                      disabled={activeSponsorActionId === `delete-${sponsor.id}`}
                                      className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-400"
                                    >
                                      {activeSponsorActionId === `delete-${sponsor.id}`
                                        ? "Deleting..."
                                        : "Delete Permanently"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSponsorDeleteConfirmId(null);
                                        setSponsorDeleteConfirmText("");
                                      }}
                                      className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSponsorDeleteConfirmId(sponsor.id);
                                      setSponsorDeleteConfirmText("");
                                    }}
                                    className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                                  >
                                    Delete Permanently
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
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

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handlePrintShowSponsorLogoSheet}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    Print Sponsor Logo Sheet
                  </button>
                </div>

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setIsAddShowSponsorFormOpen((currentValue) => !currentValue)}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    {isAddShowSponsorFormOpen ? "Hide Add Sponsor Form" : "Add Sponsor From Library"}
                  </button>
                </div>

                {isAddShowSponsorFormOpen ? (
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
                        {activeSponsorLibrary.map((sponsor) => (
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Sponsor Type
                        <select
                          name="sponsorType"
                          value={showSponsorAssignmentFormState.sponsorType}
                          onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        >
                          <option value="">Optional</option>
                          {sponsorTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                        Estimated Value
                        <input
                          type="text"
                          inputMode="decimal"
                          name="estimatedValue"
                          value={showSponsorAssignmentFormState.estimatedValue}
                          onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          placeholder="Optional dollar amount"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Contribution
                      <textarea
                        name="defaultContribution"
                        value={showSponsorAssignmentFormState.defaultContribution}
                        onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                        className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="What this sponsor is providing for this show"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      Recognition Notes
                      <textarea
                        name="recognitionNotes"
                        value={showSponsorAssignmentFormState.recognitionNotes}
                        onChange={(event) => handleShowSponsorAssignmentChange(event, "new")}
                        className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="How this sponsor should be recognized for this show"
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
                ) : null}

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

                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Sponsor Type
                                <select
                                  name="sponsorType"
                                  value={editingShowSponsorFormState.sponsorType}
                                  onChange={(event) =>
                                    handleShowSponsorAssignmentChange(event, "edit")
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                >
                                  <option value="">Optional</option>
                                  {sponsorTypeOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Estimated Value
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  name="estimatedValue"
                                  value={editingShowSponsorFormState.estimatedValue}
                                  onChange={(event) =>
                                    handleShowSponsorAssignmentChange(event, "edit")
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                />
                              </label>
                            </div>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Contribution
                              <textarea
                                name="defaultContribution"
                                value={editingShowSponsorFormState.defaultContribution}
                                onChange={(event) =>
                                  handleShowSponsorAssignmentChange(event, "edit")
                                }
                                className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              />
                            </label>

                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              Recognition Notes
                              <textarea
                                name="recognitionNotes"
                                value={editingShowSponsorFormState.recognitionNotes}
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
                            {(() => {
                              const sponsorType = getShowSponsorTypeLabel(sponsor);
                              const contributionText = getShowSponsorContributionText(sponsor);
                              const recognitionNotes = getShowSponsorRecognitionNotesText(sponsor);
                              const estimatedValue = getShowSponsorEstimatedValue(sponsor);

                              return (
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
                                  {sponsorType ? (
                                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                                      {sponsorType}
                                    </span>
                                  ) : null}
                                  </div>
                                  {estimatedValue !== null ? (
                                    <p className="text-sm text-stone-600">
                                      Estimated value: {formatCurrency(estimatedValue)}
                                    </p>
                                  ) : null}
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
                                  {contributionText ? (
                                    <p className="whitespace-pre-wrap text-sm text-stone-600">
                                      Contribution: {contributionText}
                                    </p>
                                  ) : null}
                                  {recognitionNotes ? (
                                    <p className="whitespace-pre-wrap text-sm text-stone-600">
                                      Recognition Notes: {recognitionNotes}
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
                              );
                            })()}
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
            {isAdminView ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyBandSetlistLink}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  {copiedBandSetlistLink ? "Band setlist link copied!" : "Copy Band Setlist Link"}
                </button>
                <button
                  type="button"
                  onClick={handleCopyGuestSongsLink}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  {copiedGuestSongsLink ? "Guest songs link copied!" : "Copy Guest Songs Link"}
                </button>
                <button
                  type="button"
                  onClick={handleOpenGuestSongsLink}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  Open Guest Songs Link
                </button>
              </>
            ) : null}
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
            <button
              type="button"
              onClick={handlePrintSetLyrics}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Print Set Lyrics
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
                      {section.songs.map((song) => {
                        const isGuestSetlistSong = song.source_type === "guest";
                        const librarySong =
                          song.source_type === "library" && song.song_id
                            ? songLibraryById[song.song_id] ?? null
                            : null;
                        const setlistSongChartUrl = normalizeChartUrl(librarySong?.chart_url);
                        const hasSetlistSongLyrics = Boolean(librarySong?.lyrics?.trim());
                        const setlistSongMp3Path = getSetlistSongMp3Path(
                          song,
                          songLibrary,
                          pendingSongs,
                        );

                        return (
                        <li key={song.id} className="pl-1">
                          <div
                            className={`rounded-2xl border px-4 py-4 ${
                              isGuestSetlistSong
                                ? "border-cyan-500/80 bg-cyan-100/90 shadow-sm shadow-cyan-200/50 dark:border-cyan-600/80 dark:bg-cyan-950/45 dark:shadow-cyan-950/35"
                                : "border-stone-200 bg-stone-50"
                            }`}
                          >
                            <div className="flex flex-wrap items-start gap-2">
                              <p className="text-base font-medium text-stone-900 sm:text-lg">
                                {song.title} - {getDisplaySingerName(song.artist)}
                                {song.song_key ? ` (${song.song_key})` : ""}
                              </p>
                              {isGuestSetlistSong ? (
                                <span className="rounded-full border border-cyan-500/80 bg-cyan-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-950 dark:border-cyan-600/80 dark:bg-cyan-900/85 dark:text-cyan-100">
                                  Guest
                                </span>
                              ) : null}
                            </div>
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

                            {hasSetlistSongLyrics || setlistSongChartUrl || setlistSongMp3Path ? (
                              <div className="print-hidden mt-3 flex flex-wrap items-center gap-2">
                                {hasSetlistSongLyrics && song.song_id ? (
                                  <Link
                                    href={`/songs/${song.song_id}`}
                                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Lyrics
                                  </Link>
                                ) : null}
                                {setlistSongChartUrl ? (
                                  <a
                                    href={setlistSongChartUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Chart
                                  </a>
                                ) : null}
                                {setlistSongMp3Path ? (
                                  <div className="min-w-0">
                                <SongMp3DownloadButton
                                  title={song.title}
                                  mp3Path={setlistSongMp3Path}
                                />
                                  </div>
                                ) : null}
                              </div>
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
                        );
                      })}
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
                {isPrivateGuestPortal
                  ? "Share or update your promo bio and photo for this show."
                  : "Share your promo bio and photo for this show, then come back anytime to update it."}
              </p>
            </div>

            {portalGuestProfiles.length > 0 && !isPrivateGuestPortal ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-stone-900">Submitted Guest Artists</h3>
                  <p className="text-sm text-stone-600">
                    Choose an entry to review or update in the form below. The same guest list is
                    used for song submission.
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  {portalGuestProfiles.map((profile) => (
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
                    ? isPrivateGuestPortal
                      ? "Updating your artist entry for this show."
                      : "Editing an existing artist entry."
                    : isPrivateGuestPortal
                      ? "Add your artist entry for this show."
                      : "Add a new artist entry for this show."}
                </div>
                {editingGuestProfileId && !isPrivateGuestPortal ? (
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
                  Email
                  <input
                    type="email"
                    name="email"
                    value={guestProfileFormState.email}
                    onChange={handleGuestProfileChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="name@example.com"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleAdminAddGuest}
                    disabled={activePendingActionId === "guest-admin-add"}
                    className="w-fit rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                  >
                    {activePendingActionId === "guest-admin-add" ? "Adding Guest..." : "Add Guest"}
                  </button>
                  <Link
                    href={`/admin/${show.slug}/print/guests`}
                    className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    Print Guest Info
                  </Link>
                </div>
              </div>

            <SectionLoadWarning message={dataSectionErrors.guestProfiles} />

            {editingGuestProfileId ? (
              <form
                id="admin-guest-artist-info-form"
                className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                onSubmit={handleGuestProfileSubmit}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-stone-900">Edit Artist Info</h3>
                    <p className="text-sm text-stone-600">
                      Update this guest&apos;s promo bio, links, and photo from the admin portal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetGuestProfileForm}
                    className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    Cancel
                  </button>
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
                      placeholder="Guest name"
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
                    Email
                    <input
                      type="email"
                      name="email"
                      value={guestProfileFormState.email}
                      onChange={handleGuestProfileChange}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="name@example.com"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
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
                    {isSavingGuestProfile ? "Saving Artist Info..." : "Save Artist Info Changes"}
                  </button>
                </div>
              </form>
            ) : null}

            {guestProfiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                No guest profiles submitted yet.
              </div>
            ) : (
                <div className="grid gap-4">
                  {guestProfiles.map((profile) => {
                  const missingBio = !profile.short_bio;
                  const missingPhoto = !profile.photo_url;
                  const guestPortalStatus = getGuestProfilePortalStatus(profile, pendingSongs);
                  const hasHometown = Boolean(profile.hometown?.trim());
                  const hasSocialLinks = Boolean(
                    profile.facebook?.trim() || profile.instagram?.trim() || profile.website?.trim(),
                  );
                  const hasSubmittedSongs = guestPortalStatus.submittedSongsCount > 0;
                  const readinessChecks = [
                    Boolean(profile.photo_url?.trim()),
                    Boolean(profile.short_bio?.trim()),
                    hasHometown,
                    hasSocialLinks,
                    hasSubmittedSongs,
                  ];
                  const profileCompletion = Math.round(
                    (readinessChecks.filter(Boolean).length / readinessChecks.length) * 100,
                  );
                  const isPromoReady =
                    Boolean(profile.photo_url?.trim()) &&
                    Boolean(profile.short_bio?.trim()) &&
                    hasHometown;
                  const openedAtLabel = formatPortalStatusDateTime(guestPortalStatus.openedAt);
                  const lastReminderLabel = formatPortalStatusDateTime(
                    guestPortalStatus.lastReminderSentAt,
                  );

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
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                                guestPortalStatus.key === "submitted"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : guestPortalStatus.key === "opened"
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-stone-200 text-stone-700"
                              }`}
                            >
                              {guestPortalStatus.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleToggleGuestConfirmation(profile.id)}
                              disabled={activeGuestConfirmationSaveId === profile.id}
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                profile.is_confirmed
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  : "bg-stone-200 text-stone-700 hover:bg-stone-300"
                              }`}
                            >
                              {activeGuestConfirmationSaveId === profile.id
                                ? "Saving..."
                                : profile.is_confirmed
                                  ? "✅ Confirmed"
                                  : "⚪ Unconfirmed"}
                            </button>
                          </div>

                          <p className="text-sm text-stone-700">
                            {profile.short_bio || "Short bio missing"}
                          </p>

                          <div className="grid gap-1 text-sm text-stone-600">
                            {profile.hometown ? <p>Hometown: {profile.hometown}</p> : null}
                            {profile.instruments ? (
                              <p>Instruments: {profile.instruments}</p>
                            ) : null}
                            {profile.email ? <p>Email: {profile.email}</p> : null}
                            {profile.full_bio ? <p>Full bio: {profile.full_bio}</p> : null}
                            {openedAtLabel ? <p>Opened: {openedAtLabel}</p> : null}
                            {lastReminderLabel ? (
                              <p>Last reminder: {lastReminderLabel}</p>
                            ) : null}
                            {guestPortalStatus.submittedSongsCount > 0 ? (
                              <p>
                                Submitted songs: {guestPortalStatus.submittedSongsCount}
                              </p>
                            ) : null}
                          </div>

                          <div className="rounded-xl border border-stone-200 bg-white p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex flex-col gap-1">
                                <h4 className="text-sm font-semibold text-stone-900">
                                  Guest Status / Readiness
                                </h4>
                                <p className="text-sm text-stone-600">
                                  Profile Completion: {profileCompletion}%
                                </p>
                              </div>
                              <span
                                className={`w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                                  isPromoReady
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {isPromoReady ? "Ready for Promo" : "Promo Info Incomplete"}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-col gap-1 text-sm text-stone-700">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                                Promo Materials
                              </p>
                              <p>{profile.short_bio?.trim() ? "✅ Bio" : "❌ Bio"}</p>
                              <p>{profile.photo_url?.trim() ? "✅ Photo" : "❌ Photo"}</p>
                              <p>{hasSocialLinks ? "✅ Social Links" : "❌ Social Links"}</p>
                              <p>{hasSubmittedSongs ? "✅ Songs Submitted" : "❌ Songs Submitted"}</p>
                            </div>
                          </div>

                          <div className="rounded-xl border border-stone-200 bg-white p-3">
                            <div className="flex flex-col gap-1">
                              <h4 className="text-sm font-semibold text-stone-900">
                                Appearance Details
                              </h4>
                              <p className="text-xs text-stone-500">
                                Optional private details shown only on this guest&apos;s unique portal
                                link.
                              </p>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Agreed Fee
                                <input
                                  type="text"
                                  value={profile.agreed_fee ?? ""}
                                  onChange={(event) =>
                                    handleGuestAppearanceDetailsChange(
                                      profile.id,
                                      "agreed_fee",
                                      event.target.value,
                                    )}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional fee"
                                />
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Planned Song Count
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={profile.planned_song_count ?? ""}
                                  onChange={(event) =>
                                    handleGuestAppearanceDetailsChange(
                                      profile.id,
                                      "planned_song_count",
                                      event.target.value,
                                    )}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional count"
                                />
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                Backup Song Count
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={profile.backup_song_count ?? ""}
                                  onChange={(event) =>
                                    handleGuestAppearanceDetailsChange(
                                      profile.id,
                                      "backup_song_count",
                                      event.target.value,
                                    )}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional count"
                                />
                              </label>

                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
                                Appearance Notes
                                <textarea
                                  value={profile.appearance_notes ?? ""}
                                  onChange={(event) =>
                                    handleGuestAppearanceDetailsChange(
                                      profile.id,
                                      "appearance_notes",
                                      event.target.value,
                                    )}
                                  className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                  placeholder="Optional private notes for this guest"
                                />
                              </label>
                            </div>

                            <div className="mt-3 flex justify-start">
                              <button
                                type="button"
                                onClick={() => void handleSaveGuestAppearanceDetails(profile.id)}
                                disabled={activeGuestAppearanceSaveId === profile.id}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {activeGuestAppearanceSaveId === profile.id
                                  ? "Saving Appearance Details..."
                                  : "Save Appearance Details"}
                              </button>
                            </div>
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

                        <div className="flex w-full max-w-[220px] flex-col gap-3">
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
                            onClick={() => startEditingAdminGuestArtistInfo(profile.id)}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            Edit Artist Info
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyGuestProfileLink(profile)}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            {copiedGuestProfileLinkId === profile.id
                              ? "Copied Guest Link"
                              : "Copy Guest Link"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyGuestReminderEmail(profile)}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            {copiedGuestReminderEmailId === profile.id
                              ? "Reminder Email Copied!"
                              : "Copy Reminder Email"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyGuestShortText(profile)}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            {copiedGuestShortTextId === profile.id
                              ? "Short Text Copied!"
                              : "Copy Short Text"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenGuestProfileLink(profile)}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                          >
                            Open Guest Link
                          </button>

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

            <div className="rounded-2xl border border-emerald-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-4 py-4 text-sm leading-7 text-slate-100 sm:px-5">
              <p>
                Our house band has limited rehearsal time, so familiar songs are always helpful.
                Original material is absolutely welcome, but if the song may not be familiar to
                the band, please include anything that can help us prepare - an MP3, YouTube link,
                chart, key notes, arrangement notes, or lyrics.
              </p>
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
                  {portalGuestProfiles.map((profile) => (
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
                    : portalGuestProfiles.length > 1
                      ? "Choose a guest above to review that guest's submitted songs."
                      : "Review and update guest-submitted songs for this show."}
                </p>
              </div>

              {guestSubmittedSongs.length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">
                  {portalGuestProfiles.length > 1 && !selectedGuestProfile
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

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Optional MP3
                            <input
                              key={poolSongMp3InputKey}
                              type="file"
                              accept="audio/mpeg,.mp3"
                              onChange={handlePoolSongMp3Change}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                            />
                            <span className="text-xs font-normal text-stone-500">
                              Optional. Upload a new MP3 attachment.
                            </span>
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
                            <p className="whitespace-pre-wrap text-sm text-stone-600">
                              {renderTextWithLinks(song.notes)}
                            </p>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">{formHeading}</h2>
                <p className="text-sm text-stone-600">
                  Open the song suggestion form when you want to add a reusable library song.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAdminSongFormOpen((currentValue) => !currentValue)}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 sm:w-auto"
              >
                Suggest a Song
              </button>
            </div>

            {isAdminSongFormOpen ? (
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
                      Notes / YouTube Link / Chart Link
                      <textarea
                        name="notes"
                        value={formState.notes}
                        onChange={handleChange}
                        className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                        placeholder="Optional YouTube link, chart link, arrangement notes, key notes, capo notes, or anything the band should know"
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

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Chart Link / Nashville Chart URL
                  <input
                    type="url"
                    name="chartUrl"
                    value={formState.chartUrl}
                    onChange={handleChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="https://..."
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Optional MP3
                  <input
                    key={songMp3InputKey}
                    type="file"
                    accept="audio/mpeg,.mp3"
                    onChange={handleSongMp3Change}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                  />
                  <span className="text-xs font-normal text-stone-500">
                    Optional. MP3 only, up to 30 MB.
                  </span>
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
                    onClick={() => setIsAdminSongFormOpen(false)}
                    className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

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
                              <p className="whitespace-pre-wrap text-sm text-stone-600">
                                {renderTextWithLinks(song.notes)}
                              </p>
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

                  <details className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800">
                      Other Information
                    </summary>

                    <div className="mt-4 grid gap-4">
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                        Our house band has limited rehearsal time, so familiar songs are always
                        helpful. Original material is absolutely welcome, but if the song may not
                        be familiar to the band, please include anything that can help us prepare -
                        an MP3, YouTube link, chart, key notes, arrangement notes, or lyrics.
                      </div>

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
                        Notes / YouTube Link / Chart Link
                        <textarea
                          name="notes"
                          value={formState.notes}
                          onChange={handleChange}
                          className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          placeholder="Optional YouTube link, chart link, arrangement notes, key notes, capo notes, or anything the band should know"
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
                    </div>
                  </details>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Chart Link / Nashville Chart URL
                    <input
                      type="url"
                      name="chartUrl"
                      value={formState.chartUrl}
                      onChange={handleChange}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                      placeholder="https://..."
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Optional MP3
                    <input
                      key={songMp3InputKey}
                      type="file"
                      accept="audio/mpeg,.mp3"
                      onChange={handleSongMp3Change}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                    />
                    <span className="text-xs font-normal text-stone-500">
                      Optional. MP3 only, up to 30 MB.
                    </span>
                  </label>

                  {hasGuestSubmissionSupportMaterial ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                      Thanks - that will help the band prepare.
                    </div>
                  ) : null}

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

                  <details className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800">
                      Other Information
                    </summary>

                    <div className="mt-4 grid gap-4">
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
                        Notes / YouTube Link / Chart Link
                        <textarea
                          name="notes"
                          value={formState.notes}
                          onChange={handleChange}
                          className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                          placeholder="Optional YouTube link, chart link, arrangement notes, key notes, capo notes, or anything the band should know"
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
                    </div>
                  </details>

                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    Optional MP3
                    <input
                      key={songMp3InputKey}
                      type="file"
                      accept="audio/mpeg,.mp3"
                      onChange={handleSongMp3Change}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                    />
                    <span className="text-xs font-normal text-stone-500">
                      Optional. MP3 only, up to 30 MB.
                    </span>
                  </label>

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
                {visibleGuestSongs.map((song) => {
                  const setlistUsageCount = guestSongSetlistUsageCounts[song.id] ?? 0;
                  const isUsedInSetlist = setlistUsageCount > 0;

                  return (
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

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Notes / Reference Link
                            <textarea
                              name="notes"
                              value={poolSongEditFormState.notes ?? ""}
                              onChange={handlePoolSongEditChange}
                              className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Optional YouTube link, chart link, arrangement notes, key notes, capo notes, or anything the band should know"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Lyrics
                            <textarea
                              name="lyrics"
                              value={poolSongEditFormState.lyrics ?? ""}
                              onChange={handlePoolSongEditChange}
                              className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                              placeholder="Optional lyrics"
                            />
                          </label>

                          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                            Optional MP3
                            <input
                              key={poolSongMp3InputKey}
                              type="file"
                              accept="audio/mpeg,.mp3"
                              onChange={handlePoolSongMp3Change}
                              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                            />
                            <span className="text-xs font-normal text-stone-500">
                              Optional. Upload a new MP3 attachment.
                            </span>
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
                            {isUsedInSetlist ? (
                              <p className="font-medium text-emerald-700">
                                Used in {setlistUsageCount} setlist entr{setlistUsageCount === 1 ? "y" : "ies"}
                              </p>
                            ) : (
                              <p>Not currently in this show&apos;s setlist.</p>
                            )}
                            {song.notes ? (
                              <p className="whitespace-pre-wrap">
                                Notes / Reference Link: {renderTextWithLinks(song.notes)}
                              </p>
                            ) : null}
                          </div>

                          {song.mp3_path ? (
                            <div className="mt-3">
                              <SongMp3DownloadButton title={song.title} mp3Path={song.mp3_path} />
                            </div>
                          ) : null}

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
                                <div className="border-t border-stone-200 pt-3">
                                  <div className="flex flex-col gap-3 sm:flex-row">
                                    {isUsedInSetlist ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveGuestSongFromAnySetlist(song)}
                                        disabled={activeSetlistActionId === song.id}
                                        className="rounded-xl border border-stone-300 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {activeSetlistActionId === song.id
                                          ? "Removing from Setlist..."
                                          : "Remove from Any Setlist"}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        normalizeSubmittedByRole(song.submitted_by_role) === "guest"
                                          ? handleDeleteGuestSong(song.id)
                                          : handleDeleteFromSongPool(song.id)
                                      }
                                      disabled={activePendingActionId === song.id}
                                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Delete Song
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </article>
                  );
                })}
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
                {filteredSongLibrary.map((song) => {
                  const setlistUsageCount = librarySongSetlistUsageCounts[song.id] ?? 0;
                  const isUsedInSetlist = setlistUsageCount > 0;
                  const chartUrl = normalizeChartUrl(song.chart_url);

                  return (
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

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Chart Link / Nashville Chart URL
                          <input
                            type="url"
                            name="chartUrl"
                            value={librarySongEditFormState.chartUrl ?? ""}
                            onChange={handleLibrarySongEditChange}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                            placeholder="https://..."
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          Optional MP3
                          <input
                            key={librarySongMp3InputKey}
                            type="file"
                            accept="audio/mpeg,.mp3"
                            onChange={handleLibrarySongMp3Change}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700"
                          />
                          <span className="text-xs font-normal text-stone-500">
                            Optional. Upload a new MP3 attachment.
                          </span>
                        </label>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => handleSaveLibrarySong(song.id)}
                              disabled={
                                activeSetlistActionId === song.id || activeLibraryDeleteSongId === song.id
                              }
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
                          {isUsedInSetlist ? (
                            <p className="font-medium text-emerald-700">
                              Used in {setlistUsageCount} setlist entr{setlistUsageCount === 1 ? "y" : "ies"}
                            </p>
                          ) : (
                            <p>Not currently in this show&apos;s setlist.</p>
                          )}
                          {song.notes?.trim() ? (
                            <p className="whitespace-pre-wrap">
                              Notes: {renderTextWithLinks(song.notes)}
                            </p>
                          ) : null}
                        </div>

                        {song.mp3_path ? (
                          <div className="mt-3">
                            <SongMp3DownloadButton title={song.title} mp3Path={song.mp3_path} />
                          </div>
                        ) : null}

                        {isBandView || canEditLibrarySong(song) || isAdminView ? (
                          <div className="mt-4 flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                              {canEditLibrarySong(song) ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditingLibrarySong(song.id)}
                                  disabled={
                                    activeSetlistActionId === song.id || activeLibraryDeleteSongId === song.id
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Edit Song
                                </button>
                              ) : null}
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
                              {chartUrl ? (
                                <a
                                  href={chartUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                  View Chart
                                </a>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleCopySongLink(song.id)}
                                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                {copiedSongLinkId === song.id ? "Copied Song Link!" : "Copy Song Link"}
                              </button>
                            </div>

                            {isAdminView ? (
                              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleAddLibrarySongToSection(song, "set1")}
                                  disabled={
                                    activeSetlistActionId === song.id || activeLibraryDeleteSongId === song.id
                                  }
                                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                >
                                  Add to Set 1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddLibrarySongToSection(song, "set2")}
                                  disabled={
                                    activeSetlistActionId === song.id || activeLibraryDeleteSongId === song.id
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Add to Set 2
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddLibrarySongToSection(song, "encore")}
                                  disabled={
                                    activeSetlistActionId === song.id || activeLibraryDeleteSongId === song.id
                                  }
                                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Add to Encore
                                </button>
                              </div>
                            ) : null}

                            {isAdminView ? (
                              <div className="border-t border-stone-200 pt-3">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLibrarySongFromAnySetlist(song)}
                                    disabled={
                                      !isUsedInSetlist ||
                                      activeSetlistActionId === song.id ||
                                      activeLibraryDeleteSongId === song.id
                                    }
                                    className="rounded-xl border border-stone-300 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {activeSetlistActionId === song.id
                                      ? "Removing from Setlist..."
                                      : "Remove from Any Setlist"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLibrarySong(song)}
                                    disabled={
                                      activeSetlistActionId === song.id || activeLibraryDeleteSongId === song.id
                                    }
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {activeLibraryDeleteSongId === song.id ? "Deleting Song..." : "Delete Song"}
                                  </button>
                                </div>
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
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}

