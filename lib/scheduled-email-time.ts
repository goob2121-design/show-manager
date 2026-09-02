const EASTERN_TIME_ZONE = "America/New_York";
const DAILY_CRON_HOUR_UTC = 4;
const DAILY_CRON_MINUTE_UTC = 15;

function easternDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function scheduledEmailRunForEasternDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const requested = value;
  const anchor = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return null;
  for (let offset = -1; offset <= 2; offset += 1) {
    const candidate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + offset, DAILY_CRON_HOUR_UTC, DAILY_CRON_MINUTE_UTC));
    if (easternDate(candidate) >= requested && candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}

export function isScheduledEmailDue(scheduledFor: string, now = new Date()) {
  const parsed = new Date(scheduledFor);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime();
}
