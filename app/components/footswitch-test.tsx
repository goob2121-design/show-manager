"use client";

import { useEffect, useRef, useState } from "react";
import { listenForKeyboardInput, type KeyboardInputRecord } from "./footswitch-keyboard-events";
import { listenForPointerMouseInput, type PointerMouseInputRecord } from "./footswitch-pointer-events";
import { NativeScrollTest } from "./footswitch-native-scroll-test";
import { CompactLyricScrollTest } from "./footswitch-compact-scroll-test";
import { SmartLyricPagingTest } from "./footswitch-smart-paging-test";

type InputRecord = KeyboardInputRecord | PointerMouseInputRecord;
const EMPTY_COUNTS = { total: 0, keydown: 0, keyup: 0, keypress: 0, pointerMouse: 0 };

function keyLabel(key: string) { return key === " " ? 'Space (" ")' : key || "(empty)"; }
function modifiers(input: KeyboardInputRecord) {
  return `Alt: ${input.alt} · Ctrl: ${input.ctrl} · Shift: ${input.shift} · Meta: ${input.meta}`;
}

export function FootswitchTest({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"diagnostic" | "native" | "compact" | "smart">("diagnostic");

  // Separate component types ensure every diagnostic effect cleans up on mode change.
  // Keeping the diagnostic mounted but hidden would still intercept native input.
  return mode === "native"
    ? <NativeScrollTest onReturn={() => setMode("diagnostic")} onCompact={() => setMode("compact")} />
    : mode === "compact"
      ? <CompactLyricScrollTest onReturn={() => setMode("diagnostic")} onNativeScroll={() => setMode("native")} />
      : mode === "smart"
        ? <SmartLyricPagingTest onReturn={() => setMode("diagnostic")} />
        : <FootswitchEventDiagnostic onClose={onClose} onNativeScroll={() => setMode("native")} onCompact={() => setMode("compact")} onSmart={() => setMode("smart")} />;
}

function FootswitchEventDiagnostic({ onClose, onNativeScroll, onCompact, onSmart }: { onClose: () => void; onNativeScroll: () => void; onCompact: () => void; onSmart: () => void }) {
  const surface = useRef<HTMLElement>(null);
  const inputArea = useRef<HTMLElement>(null);
  const [history, setHistory] = useState<(InputRecord & { id: number })[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [hit, setHit] = useState<{ x: number; y: number; input: PointerMouseInputRecord } | null>(null);
  const sequence = useRef(0);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
    const updateFocus = () => setListening(document.visibilityState === "visible" && document.hasFocus());
    updateFocus();
    const recordInput = (input: InputRecord) => {
      const record = { ...input, id: ++sequence.current };
      setHistory((previous) => [record, ...previous].slice(0, 10));
      const countKey = input.kind === "KEYBOARD" ? input.type as "keydown" | "keyup" | "keypress" : "pointerMouse";
      setCounts((previous) => ({ ...previous, total: previous.total + 1, [countKey]: previous[countKey] + 1 }));
      if (input.kind === "POINTER/MOUSE" && input.inTestArea && inputArea.current) {
        const rect = inputArea.current.getBoundingClientRect();
        setHit({
          x: Math.max(0, Math.min(100, (input.clientX - rect.left) / rect.width * 100)),
          y: Math.max(0, Math.min(100, (input.clientY - rect.top) / rect.height * 100)), input,
        });
      }
    };
    const unsubscribe = listenForKeyboardInput(window, recordInput);
    const unsubscribePointer = listenForPointerMouseInput(window,
      (event) => event.target instanceof Node && Boolean(inputArea.current?.contains(event.target)), recordInput);
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", updateFocus);
    document.addEventListener("visibilitychange", updateFocus);
    return () => {
      unsubscribe();
      unsubscribePointer();
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", updateFocus);
      document.removeEventListener("visibilitychange", updateFocus);
    };
  }, []);

  const last = history[0];
  const buttonClass = "min-h-12 rounded-xl border border-stone-300 bg-white px-4 py-3 font-bold text-stone-800 hover:bg-stone-100 dark:border-white/20 dark:bg-slate-800 dark:text-slate-100";
  return (
    <main ref={surface} tabIndex={-1} aria-label="Footswitch diagnostic" className="min-h-screen bg-stone-100 px-4 py-5 text-stone-950 outline-none dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">Performance Setup · Diagnostic only</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Footswitch / Keyboard / Pointer Test</h1>
          <p className="mt-3 text-stone-600 dark:text-slate-300">Press either pedal in mouse-button or keyboard mode. Listening starts automatically; no tap is required. Keep this page in the foreground.</p>
          <p className="mt-2 text-sm text-stone-600 dark:text-slate-300">Navigation keys, Enter, and Space are blocked during this test. Click or tap the buttons below. No Bluetooth pairing is needed.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span role="status" className={`rounded-full px-4 py-2 font-bold ${listening ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{listening ? "● Listening" : "● Paused — return to this page"}</span>
            <button type="button" className={buttonClass} onClick={() => {
              setHistory([]); setCounts(EMPTY_COUNTS); setHit(null); sequence.current = 0;
              surface.current?.focus({ preventScroll: true });
            }}>Clear History</button>
            <button type="button" className={buttonClass} onClick={onNativeScroll}>Native Scroll Test</button>
            <button type="button" className={buttonClass} onClick={onCompact}>Compact Lyric Scroll Test</button>
            <button type="button" className={buttonClass} onClick={onSmart}>Smart Lyric Paging Test</button>
            <button type="button" className={buttonClass} onClick={onClose}>Back to Performance Setup</button>
          </div>
        </header>

        <section ref={inputArea} id="footswitch-input-test-area" aria-label="Footswitch Input Test Area" className="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-stone-400 bg-stone-200 p-6 text-center dark:border-slate-500 dark:bg-slate-800 sm:min-h-[420px]">
          <div className="pointer-events-none relative z-10">
            <h2 className="text-2xl font-black sm:text-3xl">Footswitch Input Test Area</h2>
            <p className="mt-3 text-stone-700 dark:text-slate-200">Neutral area — no links or actions. Pedal clicks are safe here.</p>
            <p className="mt-3 text-sm text-stone-700 dark:text-slate-200">A ring marks the last detected pointer position inside this area.</p>
            {hit && <p className="mt-5 break-words text-2xl font-black text-emerald-800 dark:text-emerald-300">✓ {hit.input.type} · button {hit.input.button}<br />x: {hit.input.clientX} · y: {hit.input.clientY}</p>}
          </div>
          {hit && <span aria-hidden="true" className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-emerald-500 bg-emerald-400/25" style={{ left: `${hit.x}%`, top: `${hit.y}%` }} />}
        </section>

        <section className={`rounded-3xl border-2 p-6 ${last ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-stone-300 bg-white dark:border-white/20 dark:bg-slate-900"}`}>
          <p role="status" className="text-xl font-black">{last ? `✓ Input detected · Event #${last.id} · ${last.kind} · ${last.type}` : "Waiting for pedal, pointer, or keyboard input..."}</p>
          {last && <>
            {last.kind === "KEYBOARD" ? <>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <div><dt className="font-bold">event.key</dt><dd className="mt-1 break-all font-mono text-4xl font-black sm:text-5xl">{keyLabel(last.key)}</dd></div>
              <div><dt className="font-bold">event.code</dt><dd className="mt-1 break-all font-mono text-4xl font-black sm:text-5xl">{last.code || "(empty)"}</dd></div>
            </dl>
            <div className="mt-5 space-y-2 break-words font-mono text-sm sm:text-base">
              <p>keyCode: {last.keyCode} · which: {last.which}</p>
              <p>{modifiers(last)}</p>
              <p>Repeat: {String(last.repeat)} · Location: {last.location} · Composing: {String(last.isComposing)}</p>
            </div>
            </> : <>
              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                <div><dt className="font-bold">event.button</dt><dd className="mt-1 font-mono text-5xl font-black">{last.button}</dd></div>
                <div><dt className="font-bold">event.buttons</dt><dd className="mt-1 font-mono text-5xl font-black">{last.buttons}</dd></div>
              </dl>
              <div className="mt-5 space-y-2 break-words font-mono text-sm sm:text-base">
                <p>pointerType: {last.pointerType ?? "(unavailable)"} · pointerId: {last.pointerId ?? "(unavailable)"} · isPrimary: {last.isPrimary === null ? "(unavailable)" : String(last.isPrimary)}</p>
                <p>clientX: {last.clientX} · clientY: {last.clientY}</p>
                <p>Target: {last.target} · {last.inTestArea ? "Inside test area" : "Outside test area"}</p>
              </div>
            </>}
            <div className="mt-3 space-y-2 break-words font-mono text-sm sm:text-base">
              <p>Timestamp (UTC): {last.timestamp}</p>
              <p>event.timeStamp: {last.eventTimestamp.toFixed(3)} ms</p>
              <p>Trusted: {String(last.isTrusted)} · Default prevented: {String(last.defaultPrevented)}</p>
            </div>
          </>}
        </section>
        <p className="text-lg font-bold">Events: {counts.total} · POINTER/MOUSE: {counts.pointerMouse} · KEYBOARD: {counts.total - counts.pointerMouse}<br />keydown: {counts.keydown} · keyup: {counts.keyup} · keypress: {counts.keypress}</p>
        <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-xl font-black">Last 10 events · newest first</h2>
          <ol className="mt-3 space-y-3">
            {history.map((input) => <li key={input.id} className="rounded-xl bg-stone-100 p-3 font-mono text-sm dark:bg-slate-800">
              <p className="font-black">{input.kind} · #{input.id} · {input.type}</p>
              {input.kind === "KEYBOARD" ? <>
              <p className="break-all text-lg font-bold">#{input.id} {input.type} · key: {keyLabel(input.key)} · code: {input.code || "(empty)"}</p>
              <p>keyCode: {input.keyCode} · which: {input.which} · repeat: {String(input.repeat)}</p>
              <p>{modifiers(input)}</p>
              </> : <>
                <p className="text-lg font-bold">button: {input.button} · buttons: {input.buttons}</p>
                <p>pointerType: {input.pointerType ?? "(unavailable)"} · pointerId: {input.pointerId ?? "(unavailable)"} · isPrimary: {input.isPrimary === null ? "(unavailable)" : String(input.isPrimary)}</p>
                <p>clientX: {input.clientX} · clientY: {input.clientY}</p>
                <p className="break-all">Target: {input.target} · {input.inTestArea ? "Inside" : "Outside"} test area</p>
              </>}
              <p className="break-all">{input.timestamp} · {input.eventTimestamp.toFixed(3)} ms</p>
            </li>)}
          </ol>
          {!history.length && <p className="mt-3 text-stone-600 dark:text-slate-300">No events yet.</p>}
        </section>
        <p className="text-sm text-stone-600 dark:text-slate-300">Touch taps and clicks on diagnostic controls are also recorded; these events do not identify the pedal by themselves. One action may produce both pointer and mouse events. Pointer events do not require keyboard focus. If keyboard input is missing, tapping the neutral area may help Safari regain page focus. Only events delivered by the browser can appear here; operating system commands may be intercepted before reaching StageFlow.</p>
      </div>
    </main>
  );
}
