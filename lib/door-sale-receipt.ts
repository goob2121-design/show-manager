export type DoorSaleReceiptSnapshot = {
  paymentMethod: "cash" | "card";
  unitPrice: number;
  total: number;
};

type DoorSaleReceiptSource = {
  door_payment_method?: string | null;
  door_unit_price?: number | string | null;
  door_sale_total?: number | string | null;
};

function parseSnapshotAmount(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function getDoorSaleReceiptSnapshot(source: DoorSaleReceiptSource): DoorSaleReceiptSnapshot | null {
  const unitPrice = parseSnapshotAmount(source.door_unit_price);
  const total = parseSnapshotAmount(source.door_sale_total);

  if ((source.door_payment_method !== "cash" && source.door_payment_method !== "card") || unitPrice === null || total === null) {
    return null;
  }

  return { paymentMethod: source.door_payment_method, unitPrice, total };
}
