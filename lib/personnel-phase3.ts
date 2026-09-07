import type { ShowPayoutItem } from "@/lib/types";

export function previousShowPersonnelPreview<T extends { show_date: string | null; id: string }>(shows: T[], currentDate: string | null) {
  if (!currentDate) return null;
  return shows.filter((show) => Boolean(show.show_date) && show.show_date! < currentDate).sort((a, b) => b.show_date!.localeCompare(a.show_date!))[0] ?? null;
}

export function yearlyPersonnelTotals(items: ShowPayoutItem[]) {
  const committed = items.reduce((sum, item) => sum + item.amount, 0);
  const paid = items.filter((item) => item.paid).reduce((sum, item) => sum + item.amount, 0);
  return { committed, paid, remaining: committed - paid };
}

export function copyablePersonnel(items: ShowPayoutItem[], existingProfileIds: Set<string>, existingCustomKeys: Set<string>) {
  return items.filter((item) => {
    if (item.personnel_profile_id) return !existingProfileIds.has(item.personnel_profile_id);
    return !existingCustomKeys.has(`${item.payee_name.trim().toLowerCase()}|${(item.role_snapshot ?? "").trim().toLowerCase()}`);
  }).map((item) => ({ ...item, guest_profile_id: null, paid: false, paid_at: null, payment_method: null, payment_note: null }));
}
