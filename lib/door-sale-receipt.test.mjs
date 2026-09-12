import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getDoorSaleReceiptSnapshot } from "./door-sale-receipt.ts";

const doorModeUrl = new URL("../app/components/door-mode-page.tsx", import.meta.url);
const receiptPageUrl = new URL("../app/admin/[slug]/print/door-receipt/[ticketId]/page.tsx", import.meta.url);
const autoPrintUrl = new URL("../app/components/auto-print-on-mount.tsx", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/20260912_add_door_sale_receipt_snapshots.sql", import.meta.url);

test("new cash door-sale snapshots preserve the unit price and total for each quantity", () => {
  assert.deepEqual(getDoorSaleReceiptSnapshot({ door_payment_method: "cash", door_unit_price: 10, door_sale_total: 10 }), {
    paymentMethod: "cash",
    unitPrice: 10,
    total: 10,
  });
  assert.deepEqual(getDoorSaleReceiptSnapshot({ door_payment_method: "cash", door_unit_price: "10.00", door_sale_total: "20.00" }), {
    paymentMethod: "cash",
    unitPrice: 10,
    total: 20,
  });
  assert.deepEqual(getDoorSaleReceiptSnapshot({ door_payment_method: "cash", door_unit_price: 10, door_sale_total: 50 }), {
    paymentMethod: "cash",
    unitPrice: 10,
    total: 50,
  });
});

test("legacy or incomplete door-sale records do not fabricate cash receipt details", () => {
  assert.equal(getDoorSaleReceiptSnapshot({}), null);
  assert.equal(getDoorSaleReceiptSnapshot({ door_payment_method: "cash", door_unit_price: 10, door_sale_total: null }), null);
  assert.equal(getDoorSaleReceiptSnapshot({ door_payment_method: "external_card", door_unit_price: 10, door_sale_total: 10 }), null);
});

test("new ordinary Door Mode sales persist receipt snapshots in the canonical sale insert", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const saleHandler = source.slice(source.indexOf("async function handleAddDoorSale"), source.indexOf("useEffect(() => {\n    function handleDoorModeKeypadShortcut"));

  assert.match(saleHandler, /ticket_type: "door_paid"/);
  assert.match(saleHandler, /door_payment_method: "cash"/);
  assert.match(saleHandler, /door_unit_price: DOOR_TICKET_PRICE/);
  assert.match(saleHandler, /door_sale_total: quantity \* DOOR_TICKET_PRICE/);
  assert.match(saleHandler, /receiptTicketId: insertedTicket\.id/);
  assert.match(saleHandler, /openCashDrawerAfterPaidSale\(\)/);
});

test("Print Receipt actions use the returned ticket UUID and do not create another sale", async () => {
  const source = await readFile(doorModeUrl, "utf8");

  assert.match(source, /latestDoorSaleReceiptId/);
  assert.match(source, /print\/door-receipt\/\$\{encodeURIComponent\(latestDoorSaleReceiptId\)\}/);
  assert.match(source, /activity\.receiptTicketId/);
  assert.match(source, /print\/door-receipt\/\$\{encodeURIComponent\(activity\.receiptTicketId \?\? ""\)\}/);
});

test("receipt print page is protected, show-scoped, door-sale-scoped, and read-only", async () => {
  const source = await readFile(receiptPageUrl, "utf8");

  assert.match(source, /<AdminGate slug=\{slug\}/);
  assert.match(source, /\.eq\("id", ticketId\)/);
  assert.match(source, /\.eq\("show_id", show\.id\)/);
  assert.match(source, /\.eq\("ticket_type", "door_paid"\)/);
  assert.match(source, /@page \{ size: 8\.5in 3\.5in; margin: 0; \}/);
  assert.match(source, /door-sale-receipt-sheet \{ position: relative; width: 8\.5in; height: 3\.5in; overflow: hidden; \}/);
  assert.match(source, /top: -0\.2in; left: 8\.5in; box-sizing: border-box; width: 3\.5in; height: 8\.5in; overflow: hidden; transform: rotate\(90deg\); transform-origin: top left/);
  assert.match(source, /px-\[0\.28in\] py-\[0\.34in\]/);
  assert.match(source, /src="\/cmms-logo\.png"/);
  assert.match(source, /getDoorSaleReceiptSnapshot\(ticket\)/);
  assert.match(source, /Historical Sale/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
});

test("receipt auto-print runs once after mount while manual print remains available", async () => {
  const [receiptSource, autoPrintSource] = await Promise.all([
    readFile(receiptPageUrl, "utf8"),
    readFile(autoPrintUrl, "utf8"),
  ]);

  assert.match(receiptSource, /<AutoPrintOnMount \/>/);
  assert.match(receiptSource, /<PrintButton \/>/);
  assert.match(autoPrintSource, /const hasPrintedRef = useRef\(false\)/);
  assert.match(autoPrintSource, /window\.setTimeout\(\(\) => \{[\s\S]*hasPrintedRef\.current = true;[\s\S]*window\.print\(\)/);
  assert.doesNotMatch(autoPrintSource, /fetch\(|\.insert\(|\.update\(|\.delete\(/);
});

test("migration adds nullable receipt snapshots without a historic backfill", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /add column if not exists door_payment_method text/);
  assert.match(migration, /add column if not exists door_unit_price numeric\(10,2\)/);
  assert.match(migration, /add column if not exists door_sale_total numeric\(10,2\)/);
  assert.doesNotMatch(migration, /\bupdate\s+public\.show_comp_tickets\b/i);
});
