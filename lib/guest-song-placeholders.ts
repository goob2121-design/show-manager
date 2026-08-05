type ExistingGuestSongPlaceholder = {
  guest_profile_id?: string | null;
  is_placeholder?: boolean | null;
  placeholder_number?: number | null;
};

type BuildGuestSongPlaceholderRowsInput = {
  showId: string;
  guestProfileId: string;
  guestDisplayName: string;
  quantity: number;
  existingSongs: ExistingGuestSongPlaceholder[];
};

export function buildGuestSongPlaceholderRows({
  showId,
  guestProfileId,
  guestDisplayName,
  quantity,
  existingSongs,
}: BuildGuestSongPlaceholderRowsInput) {
  const normalizedGuestName = guestDisplayName.trim();
  if (!normalizedGuestName) throw new Error("Guest display name is required.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("Placeholder quantity must be between 1 and 10.");
  }

  const highestExistingNumber = existingSongs.reduce((highest, song) => {
    if (!song.is_placeholder || song.guest_profile_id !== guestProfileId) return highest;
    return Math.max(highest, song.placeholder_number ?? 0);
  }, 0);

  return Array.from({ length: quantity }, (_, index) => {
    const placeholderNumber = highestExistingNumber + index + 1;
    return {
      show_id: showId,
      guest_profile_id: guestProfileId,
      submitted_by_name: normalizedGuestName,
      is_placeholder: true,
      placeholder_number: placeholderNumber,
      title: `${normalizedGuestName} — Guest Song ${placeholderNumber}`,
    };
  });
}
