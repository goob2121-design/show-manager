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
  for (const value of [-305, 305, 12, "-100", null]) assert.equal(settings.parseDiagnosticSettings(JSON.stringify({ portraitCalibration: value, portraitCalibrated: true })).portraitCalibrated, false);
  const invalid = settings.parseDiagnosticSettings('{"preferredSize":100,"landscapeCalibration":27,"source":"other","songId":42}');
  assert.equal(invalid.preferredSize, 56);
  assert.equal(invalid.landscapeCalibration, 0);
  assert.equal(invalid.source, "sample");
  assert.equal(invalid.songId, "");
});

test("four independent profiles survive persistence and existing v1 preferences migrate without resetting regular values", () => {
  let preferences = settings.parseDiagnosticSettings('{"portraitCalibration":-80,"landscapeCalibration":20,"preferredSize":56,"source":"stageflow","songId":"existing"}');
  assert.equal(preferences.fullscreenPortraitCalibration, -100);
  assert.equal(preferences.fullscreenLandscapeCalibration, 0);
  preferences = settings.updateOrientationCalibration(preferences, "portrait", -125, true);
  preferences = settings.updateOrientationCalibration(preferences, "landscape", -175, true);
  preferences = settings.updateOrientationCalibration(preferences, "portrait", -110);
  preferences = settings.parseDiagnosticSettings(JSON.stringify(preferences));
  assert.equal(settings.orientationCalibration(preferences, "portrait"), -110);
  assert.equal(settings.orientationCalibration(preferences, "landscape"), 20);
  assert.equal(settings.orientationCalibration(preferences, "portrait", true), -125);
  assert.equal(settings.orientationCalibration(preferences, "landscape", true), -175);
  assert.equal(preferences.songId, "existing");
  assert.equal(preferences.source, "stageflow");
  assert.equal(settings.calibrationProfileNeedsTesting(preferences, "portrait", true), false);
  assert.equal(settings.calibrationProfileNeedsTesting(preferences, "landscape"), true);
  for (const value of [-300, -200, -175, -150, -125, -110, -100, 5, 300]) {
    assert.equal(settings.parseDiagnosticSettings(JSON.stringify({ fullscreenPortraitCalibration: value })).fullscreenPortraitCalibration, value);
  }
  assert.equal(settings.parseDiagnosticSettings('{"fullscreenPortraitCalibration":-999,"fullscreenPortraitCalibrated":true}').fullscreenPortraitCalibrated, false);
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

test("footswitch return defaults off, migrates safely and persists without changing calibrated profiles", () => {
  assert.equal(settings.defaultDiagnosticSettings().footswitchReturnToSetlist, false);
  const original = settings.parseDiagnosticSettings(JSON.stringify({ preferredSize: 56, fullscreenPortraitCalibration: -175,
    fullscreenLandscapeCalibration: -25, portraitCalibration: -100, landscapeCalibration: 10, songId: "saved" }));
  assert.equal(original.footswitchReturnToSetlist, false);
  for (const invalid of ["true", 1, null]) assert.equal(settings.parseDiagnosticSettings(JSON.stringify({ footswitchReturnToSetlist: invalid })).footswitchReturnToSetlist, false);
  let raw = "";
  const storage = { getItem: () => raw, setItem: (key: string, value: string) => { assert.equal(key, settings.FOOTSWITCH_SETTINGS_KEY); raw = value; } };
  settings.writeDiagnosticSettings(storage, { ...original, footswitchReturnToSetlist: true });
  assert.deepEqual(settings.readDiagnosticSettings(storage), { ...original, footswitchReturnToSetlist: true });
  settings.writeDiagnosticSettings(storage, { ...settings.readDiagnosticSettings(storage), footswitchReturnToSetlist: false });
  assert.deepEqual(settings.readDiagnosticSettings(storage), original);
});
