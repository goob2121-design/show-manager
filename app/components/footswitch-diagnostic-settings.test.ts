import assert from "node:assert/strict";
import test from "node:test";
const settings = await import(new URL("./footswitch-diagnostic-settings.ts", import.meta.url).href) as typeof import("./footswitch-diagnostic-settings");

test("fresh preferences match the working portrait configuration and landscape remains independent", () => {
  const defaults = settings.defaultDiagnosticSettings();
  assert.equal(defaults.preferredSize, 56);
  assert.equal(defaults.portraitCalibration, -100);
  assert.equal(defaults.landscapeCalibration, 0);
  const landscape = settings.updateOrientationCalibration(defaults, "landscape", 40);
  assert.equal(landscape.portraitCalibration, -100);
  assert.equal(landscape.landscapeCalibration, 40);
  const portrait = settings.updateOrientationCalibration(landscape, "portrait", -80);
  assert.equal(portrait.landscapeCalibration, 40);
  assert.equal(portrait.portraitCalibration, -80);
  assert.equal(portrait.portraitCalibrated, true);
  assert.equal(portrait.landscapeCalibrated, true);
});

test("stored fields are validated individually and corrupted storage falls back safely", () => {
  for (const raw of [null, "broken", "null", "[]", "42"]) assert.deepEqual(settings.parseDiagnosticSettings(raw), settings.defaultDiagnosticSettings());
  const stored = settings.parseDiagnosticSettings(JSON.stringify({ preferredSize: 48, portraitCalibration: -70, landscapeCalibration: 20, source: "stageflow", sample: "overflow", songId: "entry", portraitCalibrated: true }));
  assert.equal(stored.preferredSize, 48);
  assert.equal(stored.portraitCalibration, -70);
  assert.equal(stored.landscapeCalibration, 20);
  assert.equal(stored.songId, "entry");
  assert.equal(stored.sample, "overflow");
  for (const value of [-110, 110, 12, "-100", null]) assert.equal(settings.parseDiagnosticSettings(JSON.stringify({ portraitCalibration: value, portraitCalibrated: true })).portraitCalibrated, false);
  const invalid = settings.parseDiagnosticSettings('{"preferredSize":100,"landscapeCalibration":25,"source":"other","songId":42}');
  assert.equal(invalid.preferredSize, 56);
  assert.equal(invalid.landscapeCalibration, 0);
  assert.equal(invalid.source, "sample");
  assert.equal(invalid.songId, "");
});

test("storage writes only the diagnostic key and unavailable storage is safe", () => {
  const values = new Map([["stageflow_live_lyrics_font_size", "28"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const preferences = settings.updateOrientationCalibration(settings.defaultDiagnosticSettings(), "landscape", 30);
  assert.equal(settings.writeDiagnosticSettings(storage, preferences), true);
  assert.deepEqual(settings.readDiagnosticSettings(storage), preferences);
  assert.equal(values.get("stageflow_live_lyrics_font_size"), "28");
  assert.equal(values.size, 2);
  const blocked = { getItem: () => { throw new Error("unavailable"); }, setItem: () => { throw new Error("unavailable"); } };
  assert.deepEqual(settings.readDiagnosticSettings(blocked), settings.defaultDiagnosticSettings());
  assert.equal(settings.writeDiagnosticSettings(blocked, preferences), false);
});
