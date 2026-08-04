import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showPagePath = new URL("../app/components/show-page.tsx", import.meta.url);

function countOccurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

test("Sponsor Management exposes four accessible tabs with Sponsor Library as the default", async () => {
  const source = await readFile(showPagePath, "utf8");
  const library = source.indexOf('key: "library"');
  const currentShow = source.indexOf('key: "current-show"');
  const rsvp = source.indexOf('key: "rsvp"');
  const print = source.indexOf('key: "print"');

  assert.ok(source.includes('type SponsorAdminTab = "library" | "current-show" | "rsvp" | "print"'));
  assert.ok(library >= 0 && library < currentShow && currentShow < rsvp && rsvp < print);
  assert.ok(source.includes('useState<SponsorAdminTab>("library")'));
  assert.ok(source.includes('role="tablist"'));
  assert.ok(source.includes('role="tab"'));
  assert.ok(source.includes('aria-selected={activeSponsorAdminTab === tab.key}'));
  assert.ok(source.includes('aria-controls='));
});

test("each Sponsor Management workflow has one tab home", async () => {
  const source = await readFile(showPagePath, "utf8");

  assert.ok(source.includes('id="sponsor-tabpanel-library"'));
  assert.ok(source.includes('id="sponsor-tabpanel-current-show"'));
  assert.ok(source.includes('id="sponsor-tabpanel-rsvp"'));
  assert.ok(source.includes('id="sponsor-tabpanel-print"'));
  assert.ok(source.includes("Add Sponsor From Library"));
  assert.ok(source.includes("Sponsor Packet Builder"));
  assert.equal(countOccurrences(source, "<SponsorRsvpAdminPanel "), 1);
  assert.equal(countOccurrences(source, "<SponsorMailingLabelBulkAction "), 1);
  assert.equal(countOccurrences(source, "<CmmsReturnMailingLabelActions />"), 1);
  assert.equal(countOccurrences(source, ">Sponsor Packet Builder</Link>"), 1);
  assert.equal(countOccurrences(source, ">Print Sponsor Rundown</Link>"), 1);
  assert.equal(countOccurrences(source, ">Print Sponsor Logo Sheet</button>"), 1);
});

test("RSVP form remains mounted while inactive and the tab bar is overflow-safe", async () => {
  const source = await readFile(showPagePath, "utf8");

  assert.ok(source.includes('hidden={activeSponsorAdminTab !== "rsvp"}'));
  assert.ok(source.includes("flex max-w-full flex-wrap gap-2 overflow-x-auto"));
  assert.ok(source.includes("min-w-[10.5rem]"));
  assert.ok(source.includes("sm:grid-cols-2 lg:grid-cols-3"));
});