export function getDaysUntilDate(targetDate: string | null) {
  if (!targetDate) {
    return null;
  }

  const now = new Date();
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.parse(`${targetDate}T00:00:00Z`);

  if (Number.isNaN(targetUtc)) {
    return null;
  }

  return Math.floor((targetUtc - startOfTodayUtc) / (1000 * 60 * 60 * 24));
}

export function buildShowReminderSummary(showDate: string | null) {
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

function formatDayCount(value: number) {
  return `${value} day${value === 1 ? "" : "s"}`;
}

export function buildShowTimelineMessages(showDate: string | null) {
  const summary = buildShowReminderSummary(showDate);

  if (!summary) {
    return [];
  }

  return [
    summary.daysUntilShow >= 0
      ? `${formatDayCount(summary.daysUntilShow)} until show`
      : `${formatDayCount(Math.abs(summary.daysUntilShow))} since show`,
    summary.isFacebookReminderActive
      ? "Facebook flyer/ads should be running"
      : `${formatDayCount(summary.facebookReminderDays)} until Facebook flyer/ad window starts`,
    summary.isBannerReminderActive
      ? "Banners/signs should be out"
      : `${formatDayCount(summary.bannerReminderDays)} until banner/sign window starts`,
  ];
}
