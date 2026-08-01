import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelPath = new URL("reserved-seating-panel.tsx", import.meta.url);

test("reserved seating admin surfaces the auto-assignment queue without assigning seats", async () => {
  const source = await readFile(panelPath, "utf8");
  const removeHandler = source.slice(
    source.indexOf("async function handleRemoveAutoAssign"),
    source.indexOf("async function handleResetLink"),
  );

  assert.match(source, /Auto Assign Requested/);
  assert.match(source, /Customer Selecting Seats/);
  assert.match(source, /Seats Already Assigned/);
  assert.match(source, /🤝 Auto Assign Requested/);
  assert.match(source, /Show Auto Assign Requests Only/);
  assert.match(source, /Waiting for Auto Assignment/);
  assert.match(source, /Number\(right\.seat_preference === "auto_assign"\) - Number\(left\.seat_preference === "auto_assign"\)/);
  assert.match(source, /link\.seat_preference === "auto_assign" && link\.seatIds\.length === 0[\s\S]*Remove Auto Assign/);
  assert.match(removeHandler, /JSON\.stringify\(\{ token: link\.selection_token, preference: "customer_select" \}\)/);
  assert.match(removeHandler, /setLinks\(\(currentLinks\) => currentLinks\.map/);
  assert.match(removeHandler, /seat_preference: "customer_select"/);
  assert.match(removeHandler, /if \(link\.seat_preference !== "auto_assign" \|\| link\.seatIds\.length > 0\)/);
  assert.doesNotMatch(removeHandler, /show_reserved_seat_assignments/);
  assert.match(source, /autoAssignRequested: linksWithSeats\.filter/);
  assert.match(source, /if \(seatListFilter === "auto_assign"\) return link\.seat_preference === "auto_assign"/);
  assert.doesNotMatch(source, /Auto Assign All/);
});

test("reserved seating readiness uses the official ticket email timestamp and existing email action", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /🔴 Auto Assign Requests Waiting/);
  assert.match(source, /🟡 Assigned but Tickets Not Emailed/);
  assert.match(source, /🟢 Ready/);
  assert.match(source, /link\.seatIds\.length > 0 && !link\.ticket_emailed_at/);
  assert.match(source, /link\.seatIds\.length > 0 && Boolean\(link\.ticket_emailed_at\)/);
  assert.match(source, /getOfficialTicketReadiness\(link\.ticket_emailed_at\)/);
  assert.match(source, /officialTicketReadiness\.label/);
  assert.match(source, /Seats were assigned successfully\./);
  assert.match(source, /Would you like to email the tickets now\?/);
  assert.match(source, /handleResendOfficialTicketEmail\(postAssignmentPromptLink\)/);
  assert.match(source, /completedReservation && !manualAssignLink\.ticket_emailed_at/);
});
