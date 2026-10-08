"use client";

const SECTIONS = [
  "VERSE 1", "VERSE 2", "CHORUS 1", "VERSE 3", "CHORUS 2",
  "BRIDGE", "VERSE 4", "CHORUS 3", "ENDING",
];

// Original placeholder text only; no song data or saved performance settings.
const MOCK_LINES = [
  "Morning light across the stage",
  "Another turn, another page",
  "The room is quiet, the lights are low",
  "We take our time and let it flow",
  "A steady rhythm fills the air",
  "The next few lines are waiting there",
  "Across the room, a distant sound",
  "Our feet are planted on the ground",
  "We follow where the verses lead",
  "One page at a time is all we need",
  "The numbered lines will mark the way",
  "Until the ending fades away",
];

export function NativeScrollTest({ onReturn, onCompact }: { onReturn: () => void; onCompact?: () => void }) {
  const buttonClass = "min-h-12 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 font-bold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-100";
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-5 text-stone-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl">
        <header className="sticky top-0 z-10 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-black sm:text-3xl">Native Scroll Test</h1>
            <button type="button" className={buttonClass} onClick={onReturn}>Back to Footswitch Test</button>
            {onCompact && <button type="button" className={buttonClass} onClick={onCompact}>Compact Lyric Scroll Test</button>}
          </div>
          <p className="mt-2 font-bold text-emerald-700 dark:text-emerald-300">Native document scrolling · Keyboard/pointer diagnostic OFF</p>
        </header>

        <div className="my-6 space-y-3 text-lg leading-relaxed text-stone-700 dark:text-slate-200">
          <p>Set the Speedy to Page Up / Page Down mode and press each pedal. Watch whether the numbered sections move. No tap is required to start this test.</p>
          <p>This mock sheet uses ordinary webpage scrolling. If it stays still, try scrolling with your finger to confirm the sheet can move. Keep Safari in the foreground.</p>
          <p>Returning to Footswitch Test starts a fresh event history.</p>
        </div>

        <article aria-label="Mock lyrics for native document scrolling" className="space-y-10">
          {SECTIONS.map((title, sectionIndex) => (
            <section key={title} aria-labelledby={`native-scroll-section-${sectionIndex + 1}`} className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-8 dark:border-white/10 dark:bg-slate-900">
              <h2 id={`native-scroll-section-${sectionIndex + 1}`} className="mb-6 text-3xl font-black text-emerald-800 dark:text-emerald-300 sm:text-4xl">{String(sectionIndex + 1).padStart(2, "0")} · {title}</h2>
              <ol className="space-y-4 text-2xl font-semibold leading-relaxed sm:text-3xl">
                {MOCK_LINES.map((line, lineIndex) => (
                  <li key={line} className="flex gap-4">
                    <span className="w-14 shrink-0 font-mono text-lg text-stone-500 dark:text-slate-400">{String(sectionIndex * MOCK_LINES.length + lineIndex + 1).padStart(3, "0")}</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </article>
        <footer className="py-8">
          <p className="mb-4 text-xl font-bold">End of mock lyric sheet · 108 lines</p>
          <button type="button" className={buttonClass} onClick={onReturn}>Back to Footswitch Test</button>
        </footer>
      </div>
    </main>
  );
}
