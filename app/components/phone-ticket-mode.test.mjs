import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const phoneModeUrl = new URL("./phone-ticket-mode.tsx", import.meta.url);
const ticketCodeUrl = new URL("./reservation-ticket-code.tsx", import.meta.url);
const ticketPageUrl = new URL("./reserved-seat-selection-page.tsx", import.meta.url);
const routeUrl = new URL("../reserved-seating/[token]/page.tsx", import.meta.url);

test("Phone Ticket Mode reuses the reservation scan token and displays required ticket details", async () => {
  const [phone, page] = await Promise.all([
    readFile(phoneModeUrl, "utf8"),
    readFile(ticketPageUrl, "utf8"),
  ]);

  assert.match(page, /scanToken=\{seatingLink\.scan_token\}/);
  assert.match(page, /searchParams\.set\("phone", "1"\)/);
  assert.doesNotMatch(page, /generateReservationScanToken|tryGenerateReservationScanToken/);
  for (const label of ["Guest", "Event", "Date", "Time", "Venue", "Seats", "Ticket Quantity"]) {
    assert.ok(phone.includes(`"${label}"`));
  }
  assert.match(phone, /One code covers all \$\{ticketCount\} tickets in this reservation/);
  assert.match(phone, /For best scanning, turn your screen brightness up/);
  assert.match(phone, /take a screenshot of this ticket/);
});

test("Phone Ticket Mode provides requested actions and hides unsupported fullscreen", async () => {
  const phone = await readFile(phoneModeUrl, "utf8");

  assert.match(phone, /Back to Ticket/);
  assert.match(phone, /Print Ticket/);
  assert.match(phone, /requestFullscreen/);
  assert.match(phone, /\{canFullscreen \? \(/);
  assert.match(phone, /aria-label=\{isFullscreen/);
});

test("successful confirmation prioritizes all customer ticket actions", async () => {
  const page = await readFile(ticketPageUrl, "utf8");

  assert.ok((page.match(/Open Phone-Friendly Ticket/g) ?? []).length >= 2);
  assert.ok((page.match(/Print Ticket/g) ?? []).length >= 2);
  assert.ok((page.match(/Email Ticket Again/g) ?? []).length >= 2);
  assert.match(page, /View Standard Ticket/);

  const phoneAction = page.indexOf("Open Phone-Friendly Ticket");
  const printAction = page.indexOf("Print Ticket", phoneAction);
  const emailAction = page.indexOf("Email Ticket Again", printAction);
  assert.ok(phoneAction >= 0 && phoneAction < printAction);
  assert.ok(printAction < emailAction);
});

test("confirmation reuses safe phone query handling and correct ticket-count wording", async () => {
  const page = await readFile(ticketPageUrl, "utf8");

  assert.match(page, /const url = new URL\(window\.location\.href\)/);
  assert.match(page, /url\.searchParams\.set\("phone", "1"\)/);
  assert.match(page, /One code covers the ticket in this reservation\./);
  assert.match(page, /One code covers all \$\{seatingLink\.ticket_count\} tickets in this reservation\./);
  assert.match(page, /Most guests simply use their phone at the door\./);
  assert.match(page, /You may also print your ticket or email it to yourself again\./);
  assert.doesNotMatch(page, /generateReservationScanToken|tryGenerateReservationScanToken/);
});

test("ticket actions remain success-only and independent of email-delivery outcome", async () => {
  const page = await readFile(ticketPageUrl, "utf8");

  const successBranch = page.indexOf(') : (\n                <div className="mt-4 space-y-3">');
  const firstPhoneAction = page.indexOf("Open Phone-Friendly Ticket");
  assert.ok(successBranch >= 0 && firstPhoneAction > successBranch);
  assert.match(page, /setHasSubmitted\(true\)[\s\S]*setTicketEmailMessageTone/);
  assert.match(page, /ticketEmailDelivered \? "success" : "warning"/);
});

test("phone BOTH mode stacks QR before barcode and preserves existing code generation", async () => {
  const [phone, code] = await Promise.all([
    readFile(phoneModeUrl, "utf8"),
    readFile(ticketCodeUrl, "utf8"),
  ]);

  assert.match(phone, /<ReservationTicketCode[\s\S]*phone/);
  assert.match(code, /display\.format === "both" && !phone/);
  assert.ok(code.indexOf("display.qrDataUri") < code.indexOf("display.code128DataUri"));
  assert.doesNotMatch(code, /generateReservationScanToken|tryGenerateReservationScanToken/);
});

test("print CSS targets Letter portrait and protects the ticket from page breaks", async () => {
  const page = await readFile(ticketPageUrl, "utf8");

  assert.match(page, /size: Letter portrait/);
  assert.match(page, /margin: 0\.3in/);
  assert.match(page, /ticket-print-sheet/);
  assert.match(page, /break-inside: avoid-page/);
  assert.match(page, /page-break-inside: avoid/);
  assert.match(page, /ticket-print-code img\[alt="Reservation QR code"\]/);
  assert.match(page, /ticket-print-code img\[alt="Reservation barcode"\]/);
});

test("ticket route reads display time without changing reservation data", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /show_start_time/);
  assert.doesNotMatch(route, /\.update\(|\.insert\(|\.delete\(/);
});
