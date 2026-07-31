import type { GuestProfile } from "@/lib/types";

export type GuestReminderItem = "Promo Photo" | "Guest Bio" | "Guest Profile Information" | "Song Selections";

export function getGuestReminderMissingItems(
  profile: Pick<GuestProfile, "photo_url" | "short_bio" | "hometown" | "instruments" | "house_band_backing_guest">,
  submittedSongCount: number,
): GuestReminderItem[] {
  const missing: GuestReminderItem[] = [];
  if (!profile.photo_url?.trim()) missing.push("Promo Photo");
  if (!profile.short_bio?.trim()) missing.push("Guest Bio");
  if (!profile.hometown?.trim() || !profile.instruments?.trim()) missing.push("Guest Profile Information");
  if (profile.house_band_backing_guest && submittedSongCount === 0) missing.push("Song Selections");
  return missing;
}