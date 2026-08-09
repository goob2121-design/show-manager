import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/components/performance-setup-page.tsx", "utf8").replace(/\r\n/g, "\n");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const canonicalFields = [
  "intro_auto_open_lyrics",
  "intro_auto_open_delay",
  "lyrics_auto_start_scroll",
  "lyrics_auto_scroll_speed",
  "lyrics_auto_scroll_delay",
  "lyrics_font_size",
  "lyrics_reading_mode",
] as const;

test("Performance Setup loads canonical settings when the deployed schema supports them", () => {
  const query = sourceBetween(
    "const PERFORMANCE_SETUP_SELECT",
    "const LEGACY_PERFORMANCE_SETUP_SELECT",
  );
  for (const field of canonicalFields) {
    assert.match(query, new RegExp(`\\b${field}\\b`));
  }
  for (const field of canonicalFields) {
    const defaultField = field
      .replace("intro_", "default_intro_")
      .replace("lyrics_", "default_lyrics_");
    assert.match(query, new RegExp(`\\b${defaultField}\\b`));
  }
});

test("Performance Setup retries its prior query only for a missing-column schema error", () => {
  assert.match(source, /if \(rowError\?\.code === "42703"\)/);
  assert.match(source, /select\(LEGACY_PERFORMANCE_SETUP_SELECT\)\.eq\("show_id", showRow\.id\)/);
  const legacyQuery = sourceBetween(
    "const LEGACY_PERFORMANCE_SETUP_SELECT",
    "type SectionKey",
  );
  for (const field of canonicalFields) {
    assert.doesNotMatch(legacyQuery, new RegExp(`\\b${field}\\b`));
  }
});

test("Apply Defaults to All persists all seven canonical fields for every setlist entry", () => {
  const mapping = sourceBetween(
    "const SETTINGS_DATABASE_FIELDS",
    "function first",
  );
  for (const field of canonicalFields) {
    assert.match(mapping, new RegExp(`"${field}"`));
  }
  assert.match(source, /void bulk\("Apply Defaults to All Songs", defaults\)/);
  assert.match(source, /const targetIds = songs\.map\(\(song\) => song\.id\)/);
  assert.match(source, /from\("setlist_entries"\)\.update\(payload\)\.in\("id", targetIds\)/);
});

test("font-size and reading-mode bulk actions persist only their selected field", () => {
  assert.match(
    source,
    /void bulk\("Apply Font Size to All Songs", \{ fontSize: defaults\.fontSize \}\)/,
  );
  assert.match(
    source,
    /void bulk\("Apply Reading Mode to All Songs", \{ reading: defaults\.reading \}\)/,
  );
});

test("auto-scroll bulk action targets every entry including songs without lyrics", () => {
  const handler = source.match(
    /void bulk\("Apply Auto Scroll Settings to All Songs", ([^\n]+)\)/,
  )?.[0] ?? "";
  assert.match(handler, /autoStart: defaults\.autoStart/);
  assert.match(handler, /speed: defaults\.speed/);
  assert.match(handler, /delay: defaults\.delay/);
  assert.doesNotMatch(handler, /lyrics|filter/);

  const bulk = sourceBetween(
    "  async function bulk(",
    "  async function saveText(",
  );
  assert.match(bulk, /for \(const song of songs\)/);
  assert.doesNotMatch(bulk, /filter/);
});

test("undefined initial values cannot overwrite defined saved settings", () => {
  const merge = sourceBetween(
    "function mergeDefinedSettings",
    "function databaseSettingsUpdate",
  );
  for (const key of ["autoStart", "speed", "delay", "fontSize", "reading", "introAuto", "introDelay"]) {
    assert.match(merge, new RegExp(`initial\\.${key} \\?\\? saved\\.${key}`));
  }
  assert.doesNotMatch(source, /\.\.\.loadSettings\(song\.id\), \.\.\.song\.initialSettings/);
});

test("localStorage never receives an undefined setting", () => {
  const write = sourceBetween("function write(", "function loadSettings(");
  assert.match(write, /if \(value === undefined\) return/);
  assert.match(write, /localStorage\.setItem\(key\(base, id\), String\(value\)\)/);
  assert.doesNotMatch(write, /String\(undefined\)/);
  assert.match(source, /if \(value !== undefined\) payload\[SETTINGS_DATABASE_FIELDS\[settingKey\]\] = value/);
});

test("database failure cannot produce a false bulk success state", () => {
  const bulk = sourceBetween(
    "  async function bulk(",
    "  async function saveText(",
  );
  const errorCheck = bulk.indexOf("if (bulkError) throw bulkError;");
  const stateUpdate = bulk.indexOf("setSettings((current)");
  const success = bulk.indexOf('setMessage(label + " complete.");');
  const failure = bulk.lastIndexOf("setError(");
  assert.ok(errorCheck >= 0);
  assert.ok(errorCheck < stateUpdate);
  assert.ok(stateUpdate < success);
  assert.ok(success < failure);
  assert.match(bulk, /setMessage\(null\); setError\(null\)/);
});
