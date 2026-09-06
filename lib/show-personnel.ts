import type { ShowFinanceItem, ShowPayoutItem } from "@/lib/types";

export const PERSONNEL_FINANCE_SOURCE = "personnel";
export const PERSONNEL_FINANCE_SOURCE_KIND = "performer_pay";

export function normalizePersonnelPayout(
  item: Omit<ShowPayoutItem, "amount"> & { amount: number | string | null },
): ShowPayoutItem {
  const amount =
    typeof item.amount === "number"
      ? item.amount
      : Number.parseFloat(item.amount ?? "0");
  return {
    ...item,
    amount: Number.isFinite(amount) ? amount : 0,
    entry_kind: item.entry_kind === "personnel" ? "personnel" : "general",
    personnel_profile_id: item.personnel_profile_id ?? null,
    guest_profile_id: item.guest_profile_id ?? null,
    role_snapshot: item.role_snapshot ?? null,
    paid_at: item.paid_at ?? null,
    payment_note: item.payment_note ?? null,
    display_order: Number.isFinite(item.display_order) ? item.display_order : 0,
    updated_at: item.updated_at ?? item.created_at,
  };
}

export function personnelFinanceCategory(item: ShowPayoutItem) {
  if ((item.category ?? "").toLowerCase() === "band") return "House Band Pay";
  return "Guest / Talent Pay";
}

export function personnelFinanceLabel(item: ShowPayoutItem) {
  const role = item.role_snapshot?.trim();
  return role
    ? `${item.payee_name} - ${role} Pay`
    : `${item.payee_name} - Performer Pay`;
}

export function derivePersonnelFinanceItems(
  payoutItems: ShowPayoutItem[],
): ShowFinanceItem[] {
  return payoutItems
    .filter((item) => item.entry_kind === "personnel")
    .map((item) => ({
      id: `personnel:${item.id}`,
      show_id: item.show_id,
      type: "expense",
      category: personnelFinanceCategory(item),
      label: personnelFinanceLabel(item),
      amount: item.amount,
      notes: null,
      created_at: item.created_at,
      source: PERSONNEL_FINANCE_SOURCE,
      source_kind: PERSONNEL_FINANCE_SOURCE_KIND,
      is_system_managed: true,
    }));
}

export function aggregateFinanceItems(
  financeItems: ShowFinanceItem[],
  payoutItems: ShowPayoutItem[],
) {
  return [...financeItems, ...derivePersonnelFinanceItems(payoutItems)];
}

export function personnelPayTotals(items: ShowPayoutItem[]) {
  const personnel = items.filter((item) => item.entry_kind === "personnel");
  const total = personnel.reduce((sum, item) => sum + item.amount, 0);
  const paid = personnel
    .filter((item) => item.paid)
    .reduce((sum, item) => sum + item.amount, 0);
  return { total, paid, remaining: total - paid };
}

export function hasPossibleManualPersonnelOverlap(
  financeItems: ShowFinanceItem[],
) {
  const terms = [
    "house band pay",
    "guest / talent pay",
    "performer pay",
    "artist pay",
    "talent pay",
  ];
  return financeItems.some((item) => {
    if (item.type !== "expense" || item.source) return false;
    const value = `${item.label} ${item.category ?? ""}`.toLowerCase();
    return terms.some((term) => value.includes(term));
  });
}
