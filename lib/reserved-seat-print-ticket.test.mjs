import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("../app/components/reserved-seating-panel.tsx", import.meta.url);
const publicPageUrl = new URL("../app/reserved-seating/[token]/page.tsx", import.meta.url);
const publicTicketUrl = new URL("../app/components/reserved-seat-selection-page.tsx", import.meta.url);
const emailUrl = new URL("./email/official-ticket-email.ts", import.meta.url);
const lookupUrl = new URL("./reserved-seat-pay-at-door-ticket.ts", import.meta.url);

test("admin Print Ticket is available without email and opens the existing read-only ticket view", async () => {
  const panel = await readFile(panelUrl, "utf8");

  assert.match(panel, /function getCustomerPrintTicketUrl\(token: string\)[\s\S]*\?print=1/);
  assert.match(panel, /link\.submitted_at && link\.scan_token/);
  assert.match(panel, /function handlePrintTicket\(link: LinkWithSeats\)[\s\S]*link\.selection_token/);
  assert.match(panel, /Print Ticket/);
  assert.match(panel, /link\.submitted_at && resolvedRecipientEmail/);
  const printHandler = panel.slice(panel.indexOf("function handlePrintTicket"), panel.indexOf("async function copyReservedSeatingMessageText"));
  assert.doesNotMatch(printHandler, /fetch\(|\.insert\(|\.update\(|generateReservationScanToken/);
});

test("public ticket and email resolve only the canonical admission amount and preserve one reservation token", async () => {
  const [publicPage, publicTicket, email, lookup] = await Promise.all([
    readFile(publicPageUrl, "utf8"),
    readFile(publicTicketUrl, "utf8"),
    readFile(emailUrl, "utf8"),
    readFile(lookupUrl, "utf8"),
  ]);

  assert.match(publicPage, /loadReservedSeatPayAtDoorTicket\(createReadOnlyServiceClient\(\), typedSeatingLink\)/);
  assert.match(publicTicket, /PAY AT DOOR/i);
  assert.match(publicTicket, /formatReservedSeatPayAtDoorDue\(payAtDoorTicket\.amount\)/);
  assert.match(publicTicket, /scanToken=\{seatingLink\.scan_token\}/);
  assert.match(email, /PAY AT DOOR/);
  assert.match(email, /payAtDoorAmount: payAtDoorTicket\?\.amount/);
  assert.match(email, /scanToken: link\.scan_token/);
  assert.match(lookup, /\.select\("pay_at_door,pay_at_door_amount"\)/);
  assert.doesNotMatch(lookup, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("Pay at Door due display formats only the authoritative stored amount", async () => {
  const lookup = await readFile(lookupUrl, "utf8");

  assert.match(lookup, /\$\{amount\.toFixed\(2\)\} DUE AT DOOR/);
  assert.doesNotMatch(lookup, /ticket_count|\*\s*10|DOOR_TICKET_PRICE/);
});
