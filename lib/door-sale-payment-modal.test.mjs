import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const doorModeUrl = new URL("../app/components/door-mode-page.tsx", import.meta.url);

async function doorModeSource() {
  return readFile(doorModeUrl, "utf8");
}

test("ordinary quantity actions open a shared payment modal before any sale insert", async () => {
  const source = await doorModeSource();
  const openStart = source.indexOf("function openDoorSaleConfirmation");
  const openEnd = source.indexOf("function closeDoorSaleConfirmation", openStart);
  const keypadStart = source.indexOf("function handleDoorModeKeypadShortcut");
  const keypadEnd = source.indexOf("async function handleSubtractDoorSale", keypadStart);
  const keypad = source.slice(keypadStart, keypadEnd);

  assert.ok(openStart >= 0 && openEnd > openStart);
  assert.match(source.slice(openStart, openEnd), /setPendingDoorSaleQuantity\(quantity\)/);
  assert.doesNotMatch(source.slice(openStart, openEnd), /\.from\(|\.insert\(|openCashDrawerAfterPaidSale/);
  assert.match(keypad, /openDoorSaleConfirmation\(quantity\)/);
  assert.match(source, /onClick=\{\(\) => openDoorSaleConfirmation\(quantity\)\}/);
});

test("Cancel clears the ordinary-sale modal without sale, activity, drawer, or receipt work", async () => {
  const source = await doorModeSource();
  const closeStart = source.indexOf("function closeDoorSaleConfirmation");
  const closeEnd = source.indexOf("function openDoorSaleReceipt", closeStart);
  const closeHandler = source.slice(closeStart, closeEnd);

  assert.match(closeHandler, /setPendingDoorSaleQuantity\(null\)/);
  assert.match(closeHandler, /setCompletedCashDoorSale\(null\)/);
  assert.doesNotMatch(closeHandler, /\.from\(|\.insert\(|openCashDrawerAfterPaidSale|pushRecentActivity|window\.open/);
});

test("cash and card share one canonical insert while persisting payment snapshots", async () => {
  const source = await doorModeSource();
  const handlerStart = source.indexOf('async function handleAddDoorSale(quantity: number, paymentMethod: "cash" | "card")');
  const handlerEnd = source.indexOf("async function handleCompleteDoorSale", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handler, /ticket_type: "door_paid"/);
  assert.match(handler, /door_payment_method: paymentMethod/);
  assert.match(handler, /door_unit_price: DOOR_TICKET_PRICE/);
  assert.match(handler, /door_sale_total: quantity \* DOOR_TICKET_PRICE/);
  assert.match(handler, /checked_in: true[\s\S]*checked_in_count: quantity/);
  assert.match(handler, /publishWelcome\(/);
  assert.match(handler, /pushRecentActivity\(/);
  assert.match(handler, /undo:[\s\S]*\.delete\(\)[\s\S]*\.eq\("id", insertedTicket\.id\)/);
});

test("cash opens the drawer only after a successful insert and card never opens it", async () => {
  const source = await doorModeSource();
  const handlerStart = source.indexOf('async function handleAddDoorSale(quantity: number, paymentMethod: "cash" | "card")');
  const handlerEnd = source.indexOf("async function handleCompleteDoorSale", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const insertSuccess = handler.indexOf("const insertedTicket = normalizeShowCompTicket");
  const drawerRequest = handler.indexOf("openCashDrawerAfterPaidSale");

  assert.ok(insertSuccess >= 0 && drawerRequest > insertSuccess);
  assert.match(handler, /if \(paymentMethod === "cash"\) \{[\s\S]*openCashDrawerAfterPaidSale\(\)/);
  assert.match(handler, /if \(paymentMethod === "cash"\) \{[\s\S]*openCashDrawerAfterPaidSale\(\)/);
});

test("cash completion retains the modal with exact receipt UUID, while card closes it", async () => {
  const source = await doorModeSource();
  const completeStart = source.indexOf("async function handleCompleteDoorSale");
  const completeEnd = source.indexOf("useEffect(() => {", completeStart);
  const completeHandler = source.slice(completeStart, completeEnd);
  const modalStart = source.indexOf("{pendingDoorSaleQuantity !== null ? (");
  const modalEnd = source.indexOf("{pendingPayAtDoorTicket ? (", modalStart);
  const modal = source.slice(modalStart, modalEnd);

  assert.match(completeHandler, /if \(paymentMethod === "cash"\) \{[\s\S]*setCompletedCashDoorSale\(insertedTicket\)/);
  assert.match(completeHandler, /closeDoorSaleConfirmation\(\)/);
  assert.match(modal, /data-testid="door-sale-payment-dialog"/);
  assert.match(modal, /Door Admission/);
  assert.match(modal, /Collect Cash/);
  assert.match(modal, /Collect Card/);
  assert.match(modal, /Payment Complete/);
  assert.match(modal, /openDoorSaleReceipt\(completedCashDoorSale\.id\)/);
  assert.match(modal, /Done/);
});

test("submission lock prevents duplicate cash or card sale inserts", async () => {
  const source = await doorModeSource();
  const handlerStart = source.indexOf("async function handleCompleteDoorSale");
  const handlerEnd = source.indexOf("useEffect(() => {", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.match(handler, /doorSaleSubmissionRef\.current/);
  assert.match(handler, /doorSaleSubmissionRef\.current = true/);
  assert.match(handler, /if \(!keepSubmissionLock\) \{[\s\S]*doorSaleSubmissionRef\.current = false/);
});

test("the existing Pay at Door completion path and scanner routing remain separate", async () => {
  const source = await doorModeSource();

  assert.match(source, /async function handlePayAtDoor\(ticket: ShowCompTicket, method: "cash" \| "external_card"\)/);
  assert.match(source, /\/api\/admin\/shows\/\$\{encodeURIComponent\(show\.id\)\}\/pay-at-door/);
  assert.match(source, /autoTicket\?\.pay_at_door && !autoTicket\.pay_at_door_paid_at/);
  assert.match(source, /openPayAtDoorConfirmation\(autoTicket\)/);
});
