export type DoorModeKeypadShortcutContext = {
  key: string;
  repeat: boolean;
  isEditableTarget: boolean;
  isScannerTarget: boolean;
  scannerValue: string;
  scanLookupPending: boolean;
  actionActive: boolean;
  modalActive: boolean;
  shortcutInFlight: boolean;
};

const DOOR_MODE_KEYPAD_QUANTITIES: Readonly<Record<string, number>> = {
  F13: 1,
  F14: 2,
  F15: 3,
  F16: 4,
};

export function doorModeKeypadQuantity(key: string) {
  return DOOR_MODE_KEYPAD_QUANTITIES[key] ?? null;
}

export function eligibleDoorModeKeypadQuantity(context: DoorModeKeypadShortcutContext) {
  const quantity = doorModeKeypadQuantity(context.key);
  if (
    quantity === null ||
    context.repeat ||
    context.scanLookupPending ||
    context.actionActive ||
    context.modalActive ||
    context.shortcutInFlight
  ) {
    return null;
  }

  if (context.isScannerTarget) {
    return context.scannerValue.trim() ? null : quantity;
  }

  return context.isEditableTarget ? null : quantity;
}
