import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const emailSourceUrl = new URL("reserved-seat-email.ts", import.meta.url);

function assertOrdered(source, labels) {
  const positions = labels.map((label) => source.indexOf(label));
  assert.ok(positions.every((position) => position >= 0), `Missing ordered marker: ${labels[positions.indexOf(-1)]}`);
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
}

test("reserved-seat email puts customer actions before reservation details", async () => {
  const source = await readFile(emailSourceUrl, "utf8");
  const actionStart = source.indexOf("const seatSelectionActionHtml");
  const htmlStart = source.indexOf("const html =", actionStart);
  const textStart = source.indexOf("const text =", htmlStart);
  const action = source.slice(actionStart, htmlStart);
  const html = source.slice(htmlStart, textStart);
  const text = source.slice(textStart, source.indexOf("return { subject, html, text }", textStart));

  assertOrdered(action, [
    "Next Step: Choose Your Reserved Seats",
    "Select Your Reserved Seats",
    "${autoAssignHtml}",
    "Need a little help choosing your seats?",
  ].filter((label) => action.includes(label)));
  assert.match(action, /href="\$\{safe\.seatSelectionUrl\}"/);
  assert.match(source, /href="\$\{safeAutoAssignUrl\}"/);
  assert.match(source, /Thank you for reserving \$\{reservedSeatPurchaseText\(count\)\}/);
  assert.match(source, /Your payment has been received successfully\. The next step is to choose your reserved seats\./);
  assert.doesNotMatch(source, /Your reserved seats have been purchased successfully/);
  assert.doesNotMatch(source, /Please choose your .*reserved seats? using the button above/);
  assert.doesNotMatch(source, /Once your seats are confirmed, they will be reserved for you/);

  assertOrdered(html, [
    "Thank You for Your Purchase!",
    "${seatSelectionActionHtml}",
    "Reservation Details",
    "${ticketCodeSection.html}",
    "${directionsHtml}",
    "Questions?",
  ]);
  assertOrdered(text, [
    "Next Step: Choose Your Reserved Seats",
    "Select Your Reserved Seats:",
    "Need a little help choosing your seats?",
    "Reservation Details:",
    "ticketCodeSection.text",
    "Directions",
    "Parking Information",
    "Questions?",
  ]);
});