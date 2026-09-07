export type PersonnelDirectoryInput = {
  displayName: string;
  defaultRole: string;
  defaultPayAmount: number;
  isActive: boolean;
  displayOrder: number;
};

const MONEY = /^\d+(?:\.\d{1,2})?$/;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function parsePersonnelDirectoryInput(value: Record<string, unknown>): PersonnelDirectoryInput | null {
  const displayName = text(value.displayName, 300);
  const defaultRole = text(value.defaultRole, 300);
  const payRaw = typeof value.defaultPayAmount === "number"
    ? String(value.defaultPayAmount)
    : text(value.defaultPayAmount, 32);
  const displayOrder = typeof value.displayOrder === "number"
    ? value.displayOrder
    : Number(text(value.displayOrder, 16));
  if (!displayName || !MONEY.test(payRaw)) return null;
  const defaultPayAmount = Number(payRaw);
  if (!Number.isFinite(defaultPayAmount) || defaultPayAmount < 0 || defaultPayAmount > 1_000_000) return null;
  if (!Number.isInteger(displayOrder) || displayOrder < -1_000_000 || displayOrder > 1_000_000) return null;
  return {
    displayName,
    defaultRole,
    defaultPayAmount: Math.round(defaultPayAmount * 100) / 100,
    isActive: value.isActive !== false,
    displayOrder,
  };
}

export function activePersonnelProfiles<T extends { is_active: boolean; display_order: number; display_name: string }>(profiles: T[]) {
  return profiles
    .filter((profile) => profile.is_active)
    .sort((left, right) => left.display_order - right.display_order || left.display_name.localeCompare(right.display_name));
}
