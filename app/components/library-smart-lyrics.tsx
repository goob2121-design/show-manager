"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LiveSmartLyrics } from "./live-smart-lyrics";
import { useDiagnosticFullscreen } from "./footswitch-fullscreen";

export type LibraryLyricSong = { id: string; title: string; lyrics: string | null; key?: string | null; performanceFlow?: string | null };

// Keep the host mounted and retain document scrolling for the existing engine.
export function useLibrarySmartLyrics() {
  const [song, setSong] = useState<LibraryLyricSong | null>(null);
  const fullscreen = useDiagnosticFullscreen();
  const saved = useRef({ x: 0, y: 0, url: "", buttonId: "", ownsFullscreen: false });
  const restoreFrame = useRef<number | null>(null);
  const generation = useRef(0);
  useEffect(() => () => {
    generation.current++;
    if (restoreFrame.current !== null) cancelAnimationFrame(restoreFrame.current);
  }, []);

  function open(next: LibraryLyricSong, buttonId: string) {
    generation.current++;
    if (restoreFrame.current !== null) cancelAnimationFrame(restoreFrame.current);
    const ownsFullscreen = document.fullscreenElement !== document.documentElement;
    saved.current = { x: window.scrollX, y: window.scrollY, url: window.location.href, buttonId, ownsFullscreen };
    if (ownsFullscreen) fullscreen.request();
    flushSync(() => setSong(next));
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.getElementById("smart-lyric-paging-display")?.focus({ preventScroll: true });
  }

  function close() {
    const currentGeneration = ++generation.current;
    const position = { ...saved.current };
    setSong(null);
    const restore = () => {
      if (generation.current !== currentGeneration) return;
      restoreFrame.current = requestAnimationFrame(() => {
        if (generation.current !== currentGeneration) return;
        // Calibration uses fragment links; restore the original library URL too.
        if (window.location.href !== position.url) window.history.replaceState(window.history.state, "", position.url);
        window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
        document.getElementById(position.buttonId)?.focus({ preventScroll: true });
        restoreFrame.current = null;
      });
    };
    if (position.ownsFullscreen) void Promise.resolve(fullscreen.close()).then(restore);
    else restore();
  }

  return { open, viewer: song ? <LiveSmartLyrics key={song.id} song={song} fullscreen={fullscreen} onClose={close} exitFullscreenOnClose={false} returnToLibrary /> : null };
}
