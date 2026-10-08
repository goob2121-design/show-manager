import { useEffect, useState } from "react";

export const FOOTSWITCH_SETTINGS_KEY = "stageflow.footswitchDiagnostic.settings.v1";
export type DiagnosticOrientation = "portrait" | "landscape";
export type DiagnosticSettings = {
  preferredSize: number; portraitCalibration: number; landscapeCalibration: number;
  portraitCalibrated: boolean; landscapeCalibrated: boolean;
  fullscreenPortraitCalibration: number; fullscreenLandscapeCalibration: number;
  fullscreenPortraitCalibrated: boolean; fullscreenLandscapeCalibrated: boolean;
  source: "sample" | "stageflow"; sample: "realistic" | "overflow"; songId: string;
  footswitchReturnToSetlist: boolean;
};
export function defaultDiagnosticSettings(): DiagnosticSettings {
  return { preferredSize: 56, portraitCalibration: -100, landscapeCalibration: 0,
    portraitCalibrated: false, landscapeCalibrated: false, fullscreenPortraitCalibration: -100, fullscreenLandscapeCalibration: 0,
    fullscreenPortraitCalibrated: false, fullscreenLandscapeCalibrated: false, source: "sample", sample: "realistic", songId: "", footswitchReturnToSetlist: false };
}
export function parseDiagnosticSettings(raw: string | null): DiagnosticSettings {
  const defaults = defaultDiagnosticSettings();
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const calibration = (number: unknown, fallback: number) => typeof number === "number" && Number.isInteger(number) && number >= -300 && number <= 300 && number % 5 === 0 ? number : fallback;
    return { preferredSize: [40, 48, 56].includes(value.preferredSize) ? value.preferredSize : defaults.preferredSize,
      portraitCalibration: calibration(value.portraitCalibration, defaults.portraitCalibration),
      landscapeCalibration: calibration(value.landscapeCalibration, defaults.landscapeCalibration),
      portraitCalibrated: value.portraitCalibrated === true && calibration(value.portraitCalibration, NaN) === value.portraitCalibration,
      landscapeCalibrated: value.landscapeCalibrated === true && calibration(value.landscapeCalibration, NaN) === value.landscapeCalibration,
      fullscreenPortraitCalibration: calibration(value.fullscreenPortraitCalibration, defaults.fullscreenPortraitCalibration),
      fullscreenLandscapeCalibration: calibration(value.fullscreenLandscapeCalibration, defaults.fullscreenLandscapeCalibration),
      fullscreenPortraitCalibrated: value.fullscreenPortraitCalibrated === true && calibration(value.fullscreenPortraitCalibration, NaN) === value.fullscreenPortraitCalibration,
      fullscreenLandscapeCalibrated: value.fullscreenLandscapeCalibrated === true && calibration(value.fullscreenLandscapeCalibration, NaN) === value.fullscreenLandscapeCalibration,
      source: value.source === "stageflow" ? "stageflow" : "sample", sample: value.sample === "overflow" ? "overflow" : "realistic",
      songId: typeof value.songId === "string" && value.songId.length <= 200 ? value.songId : "",
      footswitchReturnToSetlist: value.footswitchReturnToSetlist === true };
  } catch { return defaults; }
}
export function readDiagnosticSettings(storage: Pick<Storage, "getItem">): DiagnosticSettings {
  try { return parseDiagnosticSettings(storage.getItem(FOOTSWITCH_SETTINGS_KEY)); } catch { return defaultDiagnosticSettings(); }
}
export function writeDiagnosticSettings(storage: Pick<Storage, "setItem">, settings: DiagnosticSettings): boolean {
  try { storage.setItem(FOOTSWITCH_SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
export function orientationCalibration(settings: DiagnosticSettings, orientation: DiagnosticOrientation, fullscreen = false) {
  if (fullscreen) return orientation === "portrait" ? settings.fullscreenPortraitCalibration : settings.fullscreenLandscapeCalibration;
  return orientation === "portrait" ? settings.portraitCalibration : settings.landscapeCalibration;
}
export function updateOrientationCalibration(settings: DiagnosticSettings, orientation: DiagnosticOrientation, value: number, fullscreen = false): DiagnosticSettings {
  if (fullscreen) return orientation === "portrait" ? { ...settings, fullscreenPortraitCalibration: value, fullscreenPortraitCalibrated: true }
    : { ...settings, fullscreenLandscapeCalibration: value, fullscreenLandscapeCalibrated: true };
  return orientation === "portrait" ? { ...settings, portraitCalibration: value, portraitCalibrated: true }
    : { ...settings, landscapeCalibration: value, landscapeCalibrated: true };
}
export function calibrationProfileNeedsTesting(settings: DiagnosticSettings, orientation: DiagnosticOrientation, fullscreen = false) {
  return !(fullscreen ? orientation === "portrait" ? settings.fullscreenPortraitCalibrated : settings.fullscreenLandscapeCalibrated
    : orientation === "portrait" ? settings.portraitCalibrated : settings.landscapeCalibrated);
}
export function observeDiagnosticOrientation(page: Window, onOrientation: (orientation: DiagnosticOrientation) => void) {
  const query = typeof page.matchMedia === "function" ? page.matchMedia("(orientation: landscape)") : null;
  const report = () => onOrientation((query ? query.matches : page.innerWidth > page.innerHeight) ? "landscape" : "portrait");
  query?.addEventListener("change", report);
  if (!query) page.addEventListener("resize", report, { passive: true });
  report();
  return () => { query?.removeEventListener("change", report); if (!query) page.removeEventListener("resize", report); };
}
export function useDiagnosticSettings() {
  const [settings, setSettings] = useState(defaultDiagnosticSettings);
  const [orientation, setOrientation] = useState<DiagnosticOrientation>("portrait");
  const [loaded, setLoaded] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  useEffect(() => {
    // Hydrate only in the browser, before enabling editing or persistence.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setSettings(readDiagnosticSettings(window.localStorage)); } catch { setStorageUnavailable(true); }
    setLoaded(true);
    return observeDiagnosticOrientation(window, setOrientation);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!writeDiagnosticSettings(window.localStorage, settings)) setStorageUnavailable(true);
    } catch { setStorageUnavailable(true); }
  }, [loaded, settings]);
  return { settings, setSettings, orientation, loaded, storageUnavailable };
}
