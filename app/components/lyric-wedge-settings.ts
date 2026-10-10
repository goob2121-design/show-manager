import { useEffect, useState } from "react";
import { defaultDiagnosticSettings, observeDiagnosticOrientation, parseDiagnosticSettings, type DiagnosticOrientation, type DiagnosticSettings } from "./footswitch-diagnostic-settings";

export const WEDGE_SETTINGS_KEY = "stageflow.lyricWedge.settings.v1";

// Reuse validation and profile utilities, never the diagnostic persistence hook.
export function parseWedgeSettings(raw: string | null): DiagnosticSettings {
  return { ...parseDiagnosticSettings(raw), source: "stageflow", sample: "realistic", songId: "", footswitchReturnToSetlist: false };
}
export function readWedgeSettings(storage: Pick<Storage, "getItem">) {
  return parseWedgeSettings(storage.getItem(WEDGE_SETTINGS_KEY));
}
export function writeWedgeSettings(storage: Pick<Storage, "setItem">, settings: DiagnosticSettings) {
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
    catch { setSettings({ ...defaultDiagnosticSettings(), source: "stageflow" }); setStorageUnavailable(true); }
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
