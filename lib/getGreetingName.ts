export function getGreetingName(guestName: string | null | undefined, greetingName?: string | null): string {
  const override = greetingName?.trim();

  if (override) {
    return override;
  }

  const trimmed = guestName?.trim() ?? "";

  if (!trimmed) {
    return "Guest";
  }

  const words = trimmed.split(/\s+/);

  if (words.length === 1) {
    return trimmed;
  }

  const organizationPrefixes = [
    "the",
    "team",
    "band",
    "church",
    "company",
    "club",
    "choir",
    "family",
    "association",
    "committee",
    "department",
    "city",
    "county",
    "school",
    "university",
    "college",
  ];

  if (organizationPrefixes.includes(words[0].toLowerCase())) {
    return trimmed;
  }

  if (/\d/.test(trimmed)) {
    return trimmed;
  }

  if (words.length >= 4) {
    return trimmed;
  }

  return words[0] || "Guest";
}