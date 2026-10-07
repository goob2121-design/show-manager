"use client";

import { useEffect, useRef, useState } from "react";
import { listenForKeyboardInput, type KeyboardInputRecord } from "./footswitch-keyboard-events";

function keyLabel(key: string) { return key === " " ? 'Space (" ")' : key || "(empty)"; }
function modifiers(input: KeyboardInputRecord) {
  return `Alt: ${input.alt} · Ctrl: ${input.ctrl} · Shift: ${input.shift} · Meta: ${input.meta}`;
}

export function FootswitchTest({ onClose }: { onClose: () => void }) {
  const surface = useRef<HTMLElement>(null);
  const [history, setHistory] = useState<(KeyboardInputRecord & { id: number })[]>([]);
  const [counts, setCounts] = useState({ total: 0, keydown: 0, keyup: 0, keypress: 0 });
  const sequence = useRef(0);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
    const updateFocus = () => setListening(document.visibilityState === "visible" && document.hasFocus());
    updateFocus();
    const unsubscribe = listenForKeyboardInput(window, (input) => {
      const record = { ...input, id: ++sequence.current };
      setHistory((previous) => [record, ...previous].slice(0, 10));
      setCounts((previous) => ({ ...previous, total: previous.total + 1, [input.type]: previous[input.type as "keydown" | "keyup" | "keypress"] + 1 }));
    });
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", updateFocus);
    document.addEventListener("visibilitychange", updateFocus);
    return () => {
      unsubscribe();
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
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Footswitch / Keyboard Test</h1>
          <p className="mt-3 text-stone-600 dark:text-slate-300">Press either pedal or any keyboard key. Keep this page in the foreground. Tap the test area if input is missing.</p>
          <p className="mt-2 text-sm text-stone-600 dark:text-slate-300">Navigation keys, Enter, and Space are blocked during this test. Click or tap the buttons below. No Bluetooth pairing is needed.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span role="status" className={`rounded-full px-4 py-2 font-bold ${listening ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{listening ? "● Listening" : "● Paused — return to this page"}</span>
            <button type="button" className={buttonClass} onClick={() => {
              setHistory([]); setCounts({ total: 0, keydown: 0, keyup: 0, keypress: 0 }); sequence.current = 0;
              surface.current?.focus({ preventScroll: true });
            }}>Clear History</button>
            <button type="button" className={buttonClass} onClick={onClose}>Back to Performance Setup</button>
          </div>
        </header>

        <section onClick={() => surface.current?.focus({ preventScroll: true })} className={`rounded-3xl border-2 p-6 ${last ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-stone-300 bg-white dark:border-white/20 dark:bg-slate-900"}`}>
          <p role="status" className="text-xl font-black">{last ? `✓ Input detected · Event #${last.id} · ${last.type}` : "Waiting for pedal or keyboard input..."}</p>
          {last && <>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <div><dt className="font-bold">event.key</dt><dd className="mt-1 break-all font-mono text-4xl font-black sm:text-5xl">{keyLabel(last.key)}</dd></div>
              <div><dt className="font-bold">event.code</dt><dd className="mt-1 break-all font-mono text-4xl font-black sm:text-5xl">{last.code || "(empty)"}</dd></div>
            </dl>
            <div className="mt-5 space-y-2 break-words font-mono text-sm sm:text-base">
              <p>keyCode: {last.keyCode} · which: {last.which}</p>
              <p>{modifiers(last)}</p>
              <p>Timestamp (UTC): {last.timestamp}</p>
              <p>event.timeStamp: {last.eventTimestamp.toFixed(3)} ms</p>
              <p>Repeat: {String(last.repeat)} · Location: {last.location} · Composing: {String(last.isComposing)}</p>
              <p>Trusted: {String(last.isTrusted)} · Default prevented: {String(last.defaultPrevented)}</p>
            </div>
          </>}
        </section>
        <p className="text-lg font-bold">Events: {counts.total} · keydown: {counts.keydown} · keyup: {counts.keyup} · keypress: {counts.keypress}</p>
        <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-xl font-black">Last 10 events · newest first</h2>
          <ol className="mt-3 space-y-3">
            {history.map((input) => <li key={input.id} className="rounded-xl bg-stone-100 p-3 font-mono text-sm dark:bg-slate-800">
              <p className="break-all text-lg font-bold">#{input.id} {input.type} · key: {keyLabel(input.key)} · code: {input.code || "(empty)"}</p>
              <p>keyCode: {input.keyCode} · which: {input.which} · repeat: {String(input.repeat)}</p>
              <p>{modifiers(input)}</p><p className="break-all">{input.timestamp} · {input.eventTimestamp.toFixed(3)} ms</p>
            </li>)}
          </ol>
          {!history.length && <p className="mt-3 text-stone-600 dark:text-slate-300">No events yet.</p>}
        </section>
        <p className="text-sm text-stone-600 dark:text-slate-300">Safari may provide an empty code or legacy values of 0. Only events delivered by the browser can appear here; operating system commands may be intercepted before reaching StageFlow.</p>
      </div>
    </main>
  );
}
