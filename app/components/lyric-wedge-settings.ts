import { useEffect, useState } from "react";
import { defaultDiagnosticSettings, observeDiagnosticOrientation, parseDiagnosticSettings, type DiagnosticOrientation, type DiagnosticSettings } from "./footswitch-diagnostic-settings";

export const WEDGE_SETTINGS_KEY = "stageflow.lyricWedge.settings.v1";
export type WedgeSettings = DiagnosticSettings & { lineSpacing: number };
export function adjustWedgeFont(size: number, direction: -1 | 1) {
  return Math.max(32, Math.min(96, size + direction * 4));
}
export function adjustWedgeSpacing(spacing: number, direction: -1 | 1) {
  return Math.max(1.2, Math.min(1.8, Math.round((spacing + direction * 0.1) * 10) / 10));
}

// Reuse validation and profile utilities, never the diagnostic persistence hook.
export function parseWedgeSettings(raw: string | null): WedgeSettings {
  let value: { preferredSize?: unknown; lineSpacing?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed;
  } catch { /* Invalid storage falls back to independent wedge defaults. */ }
  const defaults = parseDiagnosticSettings(raw);
  const size = value.preferredSize, spacing = value.lineSpacing;
  return { ...defaults,
    preferredSize: typeof size === "number" && Number.isInteger(size) && size >= 32 && size <= 96 && size % 4 === 0 ? size : defaults.preferredSize,
    lineSpacing: typeof spacing === "number" && spacing >= 1.2 && spacing <= 1.8 && Math.abs(spacing * 10 - Math.round(spacing * 10)) < 1e-9 ? spacing : 1.4,
    source: "stageflow", sample: "realistic", songId: "", footswitchReturnToSetlist: false };
}
export function readWedgeSettings(storage: Pick<Storage, "getItem">) {
  return parseWedgeSettings(storage.getItem(WEDGE_SETTINGS_KEY));
}
export function writeWedgeSettings(storage: Pick<Storage, "setItem">, settings: WedgeSettings) {
  storage.setItem(WEDGE_SETTINGS_KEY, JSON.stringify(parseWedgeSettings(JSON.stringify(settings))));
}
export function useWedgeSettings() {
  const [settings, setSettings] = useState(() => parseWedgeSettings(null));
  const [orientation, setOrientation] = useState<DiagnosticOrientation>("portrait");
  const [loaded, setLoaded] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  useEffect(() => {
    // Hydrate before any write, including when browser storage is unavailable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setSettings(readWedgeSettings(window.localStorage)); }
    catch { setSettings({ ...defaultDiagnosticSettings(), source: "stageflow", lineSpacing: 1.4 }); setStorageUnavailable(true); }
    setLoaded(true);
    return observeDiagnosticOrientation(window, setOrientation);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { writeWedgeSettings(window.localStorage, settings); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    catch { setStorageUnavailable(true); }
  }, [loaded, settings]);
  return { settings, setSettings, orientation, loaded, storageUnavailable };
}
