import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleMapsDirectionsUrl,
  buildReservedSeatEmail,
  RESERVED_SEAT_EMAIL_EVENT_NAME,
  RESERVED_SEAT_EMAIL_FROM,
  RESERVED_SEAT_EMAIL_REPLY_TO,
  sendReservedSeatEmail,
  type ReservedSeatEmailInput,
} from "./reserved-seat-email";
import {
  buildReservedSeatSelectionUrl,
  getStageFlowEmailLogoUrl,
  normalizeStageFlowPublicUrl,
} from "../server/stageflow-public-url";

process.env.STAGEFLOW_PUBLIC_URL = "https://stageflow.cumberlandmountainmusic.com";

const input: ReservedSeatEmailInput = {
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  showName: "Cumberland Mountain Music Show",
  showDate: "August 15, 2026",
  showTime: "7:00 PM",
  venueName: "Cumberland Gap Convention Center",
  venueAddress: "601 Colwyn St, Cumberland Gap, TN 37724",
  ticketCount: 2,
  seatSelectionUrl: "https://stageflow.cumberlandmountainmusic.com/reserved-seating/private-token",
};

test("builds the revised plural reserved-seat message", () => {
  const email = buildReservedSeatEmail(input);
  assert.equal(email.subject, "Select Your Reserved Seats - The Cumberland Mountain Music Show");
  assert.match(email.html, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
  assert.match(email.text, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
  assert.match(email.html, /src="cid:cmms-logo"/);
  assert.match(email.html, /Tickets Purchased/);
  assert.match(email.html, /2 Reserved Seats/);
  assert.match(email.text, /Tickets Purchased: 2 Reserved Seats/);
  assert.match(email.html, /Thank You for Your Purchase!/);
  assert.match(email.html, /<h1 style="[^"]*text-align:center[^"]*">Thank You for Your Purchase!<\/h1>/);
  assert.match(email.html, /Big-Time Show &bull; Small-Town Hospitality/);
  assert.match(email.text, /Thank You for Your Purchase!/);
  assert.match(email.html, /Thank you for purchasing 2 seats for The Cumberland Mountain Music Show\./);
  assert.match(email.text, /Thank you for purchasing 2 seats for The Cumberland Mountain Music Show\./);
  assert.match(email.html, /looking forward to seeing you on Saturday, August 15, 2026!/);
  assert.match(email.text, /looking forward to seeing you on Saturday, August 15, 2026!/);
  assert.match(email.html, /The Cumberland Mountain Music Show/);
  assert.match(email.text, /Show: The Cumberland Mountain Music Show/);
  assert.match(email.html, /Your payment has been received successfully\./);
  assert.match(email.text, /Your payment has been received successfully\./);
  assert.match(email.html, /Your private seat-selection link will remain available until the day of the show\./);
  assert.match(email.text, /Your private seat-selection link will remain available until the day of the show\./);
  assert.match(email.html, /Please choose your 2 reserved seats using the button above\./);
  assert.match(email.text, /Please choose your 2 reserved seats using the button above\./);
});

test("includes encoded HTTPS directions, parking, and questions while preserving seat links", () => {
  const directionsUrl = buildGoogleMapsDirectionsUrl(input.venueName, input.venueAddress);
  assert.equal(
    directionsUrl,
    "https://www.google.com/maps/search/?api=1&query=Cumberland%20Gap%20Convention%20Center%2C%20601%20Colwyn%20St%2C%20Cumberland%20Gap%2C%20TN%2037724",
  );
  assert.equal(new URL(directionsUrl ?? "").protocol, "https:");

  const email = buildReservedSeatEmail(input);
  assert.match(email.html, /Directions/);
  assert.match(email.html, /Get Directions/);
  assert.ok(email.html.includes((directionsUrl ?? "").replace("&", "&amp;")));
  assert.match(email.text, /Directions/);
  assert.ok(email.text.includes(directionsUrl ?? ""));
  assert.match(email.html, /Free parking is available on-site at the Cumberland Gap Convention Center\./);
  assert.match(email.text, /Free parking is available on-site at the Cumberland Gap Convention Center\./);
  assert.match(email.html, /Questions\?/);
  assert.match(email.text, /Questions\?/);
  assert.match(email.html, /mailto:info@cumberlandmountainmusic\.com/);
  assert.match(email.html, /info@cumberlandmountainmusic\.com/);
  assert.match(email.text, /info@cumberlandmountainmusic\.com/);
  assert.match(email.html, />Select Your Reserved Seats<\/a>/);
  assert.match(email.html, /Need a little help choosing your seats\?/);
  assert.match(email.html, /Choose My Seats for Me<\/a>/);
  assert.match(email.html, /\?preference=auto/);
  assert.ok(email.html.indexOf("Select Your Reserved Seats") < email.html.indexOf("Need a little help choosing your seats?"));
  assert.match(email.html, /Your advance ticket purchase already guarantees your reserved seats\./);
  assert.match(email.text, /Need a little help choosing your seats\?/);
  assert.match(email.text, /Choose My Seats for Me:/);
  assert.match(email.html, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
  assert.match(email.text, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
});
test("uses singular ticket and seat-selection wording", () => {
  const email = buildReservedSeatEmail({ ...input, ticketCount: 1 });
  assert.match(email.html, /1 Reserved Seat/);
  assert.doesNotMatch(email.html, /1 Reserved Seats/);
  assert.match(email.text, /Tickets Purchased: 1 Reserved Seat/);
  assert.match(email.text, /Thank you for purchasing 1 seat for The Cumberland Mountain Music Show\./);
  assert.match(email.html, /Please choose your reserved seat using the button above\./);
  assert.match(email.text, /Please choose your reserved seat using the button above\./);
});

test("email generation still succeeds when scan_token is null", () => {
  const email = buildReservedSeatEmail({ ...input, scanToken: null, ticketCodeFormat: "both" });
  assert.doesNotMatch(email.html, /YOUR ENTRY CODE/);
  assert.doesNotMatch(email.text, /YOUR ENTRY CODE/);
  assert.match(email.html, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
});

test("email generation still succeeds when barcode rendering fails", () => {
  const email = buildReservedSeatEmail({
    ...input,
    scanToken: "bad\ntoken",
    ticketCodeFormat: "code128",
  });
  assert.doesNotMatch(email.html, /YOUR ENTRY CODE/);
  assert.match(email.text, /Select Your Reserved Seats:/);
  assert.match(email.html, /https:\/\/stageflow\.cumberlandmountainmusic\.com\/reserved-seating\/private-token/);
});

test("email includes a ticket-code section when scan_token is present", () => {
  const email = buildReservedSeatEmail({
    ...input,
    scanToken: "stf_A8D23F7C19B84E2A",
    ticketCodeFormat: "both",
    assignedSeatLabels: ["L-A1", "L-A2"],
  });
  assert.match(email.html, /YOUR ENTRY CODE/);
  assert.doesNotMatch(email.html, /Ticket Code:/i);
  assert.doesNotMatch(email.text, /Ticket Code:/i);
  assert.match(email.html, /L-A1, L-A2/);
});

test("uses the production sender and reply-to addresses", () => {
  assert.equal(RESERVED_SEAT_EMAIL_EVENT_NAME, "The Cumberland Mountain Music Show");
  assert.equal(RESERVED_SEAT_EMAIL_FROM, "The Cumberland Mountain Music Show <tickets@cumberlandmountainmusic.com>");
  assert.equal(RESERVED_SEAT_EMAIL_REPLY_TO, "info@cumberlandmountainmusic.com");
});

test("rejects a missing customer email before sending", async () => {
  const result = await sendReservedSeatEmail({ ...input, customerEmail: "" });
  assert.equal(result.success, false);
  assert.equal(result.error, "A valid customer email is required.");
});

test("rejects a missing seat-selection URL before sending", async () => {
  const result = await sendReservedSeatEmail({ ...input, seatSelectionUrl: "" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Seat-selection URL must use the configured StageFlow public URL.");
});

test("normalizes whitespace and trailing slashes from the public URL", () => {
  assert.equal(normalizeStageFlowPublicUrl("  https://stageflow.cumberlandmountainmusic.com///  "), "https://stageflow.cumberlandmountainmusic.com");
});

test("builds the canonical seat-selection and logo URLs", () => {
  assert.equal(buildReservedSeatSelectionUrl("private-token"), "https://stageflow.cumberlandmountainmusic.com/reserved-seating/private-token");
  assert.equal(getStageFlowEmailLogoUrl(), "https://stageflow.cumberlandmountainmusic.com/cmms-logo.png");
});

test("does not fall back to a different deployment host", () => {
  process.env.STAGEFLOW_PUBLIC_URL = "";
  process.env.NEXT_PUBLIC_SITE_URL = "https://shows.pinnaclestudiotn.com";
  assert.throws(() => buildReservedSeatSelectionUrl("private-token"), /STAGEFLOW_PUBLIC_URL is not configured/);
  process.env.STAGEFLOW_PUBLIC_URL = "https://stageflow.cumberlandmountainmusic.com";
});

test("rejects invalid configuration and mismatched seat-link origins", async () => {
  assert.throws(() => normalizeStageFlowPublicUrl("http://stageflow.cumberlandmountainmusic.com"), /HTTPS origin/);
  const result = await sendReservedSeatEmail({ ...input, seatSelectionUrl: "https://example.com/reserved-seating/private-token" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Seat-selection URL must use the configured StageFlow public URL.");
});
