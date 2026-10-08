import { useEffect, useRef, useState } from "react";

export type FullscreenStatus = { label: string; message: string };
export const INITIAL_FULLSCREEN_STATUS: FullscreenStatus = { label: "Normal", message: "Fullscreen has not been attempted." };
export function supportsDiagnosticFullscreen(doc: Document) {
  return doc.fullscreenEnabled === true && typeof doc.documentElement.requestFullscreen === "function" && typeof doc.exitFullscreen === "function";
}
export function createDiagnosticFullscreen(doc: Document, onStatus: (status: FullscreenStatus) => void) {
  let disposed = false, closing = false, pending = false;
  const report = (label: string, message: string) => { if (!disposed) onStatus({ label, message }); };
  const exit = () => {
    if (doc.fullscreenElement !== doc.documentElement) return;
    try {
      Promise.resolve(doc.exitFullscreen()).catch(() => report("Exit failed", "Fullscreen could not exit. Use your browser's exit fullscreen control; your settings are preserved."));
    } catch { report("Exit failed", "Use your browser's exit fullscreen control; your settings are preserved."); }
  };
  const change = () => {
    if (doc.fullscreenElement === doc.documentElement) {
      if (closing || disposed) exit();
      else report("Fullscreen", "Browser fullscreen confirmed. Test pedal scrolling; the browser may behave differently here.");
    } else if (doc.fullscreenElement) report("Other view", "Another element is fullscreen. The diagnostic remains available normally.");
    else report("Normal", "Fullscreen exited. Normal lyric display remains available.");
  };
  const error = () => report("Declined", "Fullscreen was rejected. Normal lyrics remain available.");
  doc.addEventListener("fullscreenchange", change);
  doc.addEventListener("fullscreenerror", error);
  report(supportsDiagnosticFullscreen(doc) ? "Ready to try" : "Unavailable", supportsDiagnosticFullscreen(doc)
    ? "Experimental fullscreen is available to attempt from a tap; support is confirmed only after entry."
    : "Browser fullscreen is unavailable here. Use the normal lyric test.");
  return {
    request() {
      if (pending) return;
      closing = false;
      if (!supportsDiagnosticFullscreen(doc)) { report("Unavailable", "Browser fullscreen is unavailable here. Normal lyrics still work."); return; }
      if (doc.fullscreenElement) { change(); return; }
      pending = true;
      report("Requesting", "Requesting browser fullscreen…");
      try {
        // Called directly in the tap handler, before any await/render/async work.
        const result = doc.documentElement.requestFullscreen();
        Promise.resolve(result).then(() => {
          pending = false;
          if (closing || disposed) { exit(); return; }
          if (doc.fullscreenElement === doc.documentElement) change();
          else report("Not entered", "The browser did not enter fullscreen. Normal lyrics remain available.");
        }, () => { pending = false; if (!closing) error(); });
      } catch { pending = false; error(); }
    },
    close() { closing = true; exit(); },
    destroy() {
      disposed = true; closing = true;
      doc.removeEventListener("fullscreenchange", change);
      doc.removeEventListener("fullscreenerror", error);
      exit();
    },
  };
}
export function useDiagnosticFullscreen() {
  const [status, setStatus] = useState(INITIAL_FULLSCREEN_STATUS);
  const session = useRef<ReturnType<typeof createDiagnosticFullscreen> | null>(null);
  useEffect(() => {
    session.current = createDiagnosticFullscreen(document, setStatus);
    return () => { session.current?.destroy(); session.current = null; };
  }, []);
  return { status, request: () => session.current?.request(), close: () => session.current?.close() };
}
