import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const doorModeUrl = new URL("../app/components/door-mode-page.tsx", import.meta.url);

test("unpaid Pay at Door manual admissions show the authoritative amount instead of ordinary check-in controls", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const manualListStart = source.indexOf('id={`door-prepaid-${item.id}`}');
  assert.ok(manualListStart >= 0);
  const prepaidSection = source.slice(manualListStart, manualListStart + 8_000);

  assert.match(prepaidSection, /item\.pay_at_door && !item\.pay_at_door_paid_at/);
  assert.match(prepaidSection, /Pay at Door —/);
  assert.match(prepaidSection, /formatCurrency\(item\.pay_at_door_amount\)/);
  assert.match(prepaidSection, /onClick=\{\(\) => openPayAtDoorConfirmation\(item\)\}/);
  assert.match(prepaidSection, />\s*Pay\s*<\/button>/);
  assert.match(prepaidSection, /className="grid gap-2 sm:grid-cols-3 min-\[900px\]:gap-1\.5 2xl:gap-2"/);
  assert.match(prepaidSection, /border-rose-700 bg-rose-500\/10 px-3 py-3 text-sm font-semibold min-\[900px\]:px-2 min-\[900px\]:py-2\.5/);
  assert.doesNotMatch(prepaidSection, /border-rose-500\/70 bg-rose-950\/50/);
  assert.doesNotMatch(prepaidSection, /handlePayAtDoor\(item|Collect Cash &amp; Check In|Collect Card &amp; Check In/);
  assert.doesNotMatch(prepaidSection, /Scan Ticket to Collect Payment/);
  assert.match(prepaidSection, /\) : \(\s*<div className="grid gap-2 sm:grid-cols-3/);
});

test("generic manual check-in refuses unpaid Pay at Door admissions before any check-in write", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const handlerStart = source.indexOf("async function handleAdjustTicketCheckIn");
  const handlerEnd = source.indexOf("async function handleUndoActivity", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const guardIndex = handler.indexOf("item.pay_at_door && !item.pay_at_door_paid_at");
  const writeIndex = handler.indexOf('.from("show_comp_tickets")');

  assert.ok(guardIndex >= 0 && writeIndex > guardIndex);
  assert.match(handler.slice(guardIndex, writeIndex), /Use Collect Cash or Card & Check In/);
  assert.match(handler.slice(guardIndex, writeIndex), /return;/);
  assert.doesNotMatch(handler.slice(guardIndex, writeIndex), /\.update\(|show_finance_items|pay-at-door/);
});

test("barcode scan keeps the existing Pay at Door completion workflow", async () => {
  const source = await readFile(doorModeUrl, "utf8");

  assert.match(source, /Payment Due — \{formatCurrency\(scannedTicket\.pay_at_door_amount/);
  assert.match(source, /scannedTicket && !\(scannedTicket\.pay_at_door && !scannedTicket\.pay_at_door_paid_at\)/);
  assert.match(source, /\/pay-at-door/);
  assert.match(source, /autoTicket\?\.pay_at_door && !autoTicket\.pay_at_door_paid_at/);
  assert.match(source, /openPayAtDoorConfirmation\(autoTicket\)/);
  assert.match(source, /openPayAtDoorConfirmation\(scannedTicket\)/);
});

test("manual Cash and Card actions use the same canonical completion endpoint and update only after success", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const handlerStart = source.indexOf("async function handlePayAtDoor(ticket: ShowCompTicket");
  const handlerEnd = source.indexOf("async function handleUndoLastAction", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const successCheckIndex = handler.indexOf('payload.result?.resultStatus !== "PAID_AND_CHECKED_IN"');
  const localUpdateIndex = handler.indexOf("setCompTickets", successCheckIndex);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handler, /\/api\/admin\/shows\/\$\{encodeURIComponent\(show\.id\)\}\/pay-at-door/);
  assert.match(handler, /JSON\.stringify\(\{ slug: show\.slug, ticketId: ticket\.id, method \}\)/);
  assert.ok(successCheckIndex >= 0 && localUpdateIndex > successCheckIndex);
  assert.match(handler, /checked_in_count: payload\.result\?\.checkedInCount/);
  assert.match(handler, /pay_at_door_paid_at: payload\.result\?\.paidAt/);
});
test("manual Pay at Door confirmation modal shows the selected authoritative admission before payment", async () => {
  const source = await readFile(doorModeUrl, "utf8");
  const modalStart = source.indexOf('{pendingPayAtDoorTicket ? (');
  const modalEnd = source.indexOf('{seatView ? (', modalStart);
  const modal = source.slice(modalStart, modalEnd);

  assert.ok(modalStart >= 0 && modalEnd > modalStart);
  assert.match(modal, /data-testid="door-pay-at-door-dialog"/);
  assert.match(modal, /pendingPayAtDoorTicket\.guest_name/);
  assert.match(modal, /pendingPayAtDoorTicket\.ticket_count/);
  assert.match(modal, /formatCurrency\(pendingPayAtDoorTicket\.pay_at_door_amount\)/);
  assert.match(modal, /handlePayAtDoor\(pendingPayAtDoorTicket, "cash"\)/);
  assert.match(modal, /handlePayAtDoor\(pendingPayAtDoorTicket, "external_card"\)/);
  assert.match(modal, /setPendingPayAtDoorTicket\(null\)/);
});