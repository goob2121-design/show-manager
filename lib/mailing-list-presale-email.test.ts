import assert from "node:assert/strict";
import test from "node:test";
import { buildMailingListPresaleAccessEmail } from "./mailing-list-presale-email";

function messageFor(firstName: string | null | undefined) {
  return buildMailingListPresaleAccessEmail({
    firstName,
    showName: "Cumberland Mountain Music Show",
    ticketUrl: "https://tickets.example.com/show",
    publicSaleStartsAt: null,
    presaleCode: null,
  }).text;
}

test("automatic presale greeting uses a named subscriber", () => {
  assert.match(messageFor("Bryan"), /^Your CMMS Early Access Ticket Link\n\nHey Bryan!/);
});

test("automatic presale greeting trims the subscriber name", () => {
  assert.match(messageFor(" Bryan "), /^Your CMMS Early Access Ticket Link\n\nHey Bryan!/);
});

test("automatic presale greeting falls back for null", () => {
  assert.match(messageFor(null), /^Your CMMS Early Access Ticket Link\n\nHey CMMS Family!/);
});

test("automatic presale greeting falls back for an empty name", () => {
  assert.match(messageFor(""), /^Your CMMS Early Access Ticket Link\n\nHey CMMS Family!/);
});

test("automatic presale greeting falls back for whitespace", () => {
  assert.match(messageFor("   "), /^Your CMMS Early Access Ticket Link\n\nHey CMMS Family!/);
});
