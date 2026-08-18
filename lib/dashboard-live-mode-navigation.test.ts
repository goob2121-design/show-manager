import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync("app/shows/page.tsx", "utf8").replace(/\r\n/g, "\n");

function sourceBetween(start: string, end: string) {
  const startIndex = dashboardSource.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = dashboardSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return dashboardSource.slice(startIndex, endIndex);
}

test("Current Show Control Center links Live Mode for the selected current show", () => {
  const actions = sourceBetween(
    'className="grid w-full gap-2 sm:grid-cols-3',
    '<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">',
  );

  assert.match(actions, /href=\{`\/band\/\$\{currentShow\.slug\}\/live`\}/);
  assert.match(actions, /aria-label=\{`Open Live Mode for \$\{currentShow\.name\}`\}/);
  assert.match(actions, />Live Mode<\/span>/);
  assert.match(actions, />Run the Show<\/span>/);
  assert.equal(actions.match(/<Link\b/g)?.length, 3);
});

test("dashboard actions remain ordered Door Mode, Live Mode, Ticket Sales", () => {
  const actions = sourceBetween(
    'className="grid w-full gap-2 sm:grid-cols-3',
    '<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">',
  );
  const doorIndex = actions.indexOf(">Door Mode</span>");
  const liveIndex = actions.indexOf(">Live Mode</span>");
  const ticketsIndex = actions.indexOf("Ticket Sales");

  assert.ok(doorIndex >= 0);
  assert.ok(doorIndex < liveIndex);
  assert.ok(liveIndex < ticketsIndex);
});
