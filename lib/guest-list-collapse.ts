export function guestListExpandedStorageKey(showId: string) {
  return `stageflow:guest-list-ticket-entries:${showId}:expanded`;
}

export function parseSavedGuestListExpanded(value: string | null) {
  return value === null ? true : value !== "false";
}
