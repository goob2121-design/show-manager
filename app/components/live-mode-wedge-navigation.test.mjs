import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./band-live-page.tsx", import.meta.url), "utf8");

test("Live Mode opens the current show's Wedge Lyrics viewer in a new tab", () => {
  const links = source.match(/<Link[\s\S]*?href=\{`\/band\/\$\{encodeURIComponent\(showSlug\)\}\/lyrics-follow`\}[\s\S]*?>[\s\S]*?Open Wedge Lyrics[\s\S]*?<\/Link>/g) ?? [];

  assert.equal(links.length, 2, "Mobile and desktop headers must both include the Wedge Lyrics link");
  for (const link of links) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }
});
