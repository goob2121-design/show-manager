export const PRESALE_SCHEDULER_UTC_HOUR = 4;
export const PRESALE_SCHEDULER_UTC_MINUTE = 15;
export const PRESALE_SCHEDULER_TIME_ZONE = "America/New_York";

export function nextDailyPresaleSchedulerRun(presaleStartsAt: string, now: Date = new Date()) {
  const presale = new Date(presaleStartsAt);
  if (Number.isNaN(presale.getTime())) return null;
  const threshold = Math.max(now.getTime(), presale.getTime());
  const candidate = new Date(threshold);
  candidate.setUTCHours(PRESALE_SCHEDULER_UTC_HOUR, PRESALE_SCHEDULER_UTC_MINUTE, 0, 0);
  if (candidate.getTime() < threshold) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

function calendarDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRESALE_SCHEDULER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function isNextCalendarDayPresaleDelivery(presaleStartsAt: string, automaticSendAt: Date | null) {
  if (!automaticSendAt) return false;
  const presale = new Date(presaleStartsAt);
  if (Number.isNaN(presale.getTime())) return false;
  return calendarDay(automaticSendAt) !== calendarDay(presale);
}
