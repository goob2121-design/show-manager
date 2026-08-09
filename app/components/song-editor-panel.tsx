"use client";

import { useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { SongTempo, SongType } from "@/lib/types";

export type SharedSongEditorState = {
  title?: string;
  key?: string;
  sungBy?: string;
  tempo?: "" | SongTempo;
  songType?: "" | SongType;
  notes?: string;
  lyrics?: string;
  chartUrl?: string;
  customTitle?: string;
  performanceFlow?: string;
  songIntroNotes?: string;
};

type SharedSongEditorProps = {
  formState: SharedSongEditorState;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  footer: ReactNode;
  topContent?: ReactNode;
  supportMaterialNotice?: ReactNode;
  readOnlyField?: {
    label: string;
    value: string;
    placeholder?: string;
  };
  detailsSummaryLabel?: string;
  detailsStartCollapsed?: boolean;
  detailsGuidance?: ReactNode;
  showTitle?: boolean;
  showKey?: boolean;
  showLeadVocal?: boolean;
  showTempo?: boolean;
  showSongType?: boolean;
  showNotes?: boolean;
  notesLabel?: string;
  notesPlaceholder?: string;
  showLyrics?: boolean;
  showChartUrl?: boolean;
  chartUrlLabel?: string;
  chartUrlPlaceholder?: string;
  chartUploadInput?: ReactNode;
  audioUploadInput?: ReactNode;
  customTitleField?: boolean;
  customTitlePlaceholder?: string;
  performanceFlowField?: boolean;
  performanceFlowPlaceholder?: string;
  songIntroNotesField?: boolean;
  songIntroNotesPlaceholder?: string;
};

export function SongEditorPanel({
  formState,
  onChange,
  footer,
  topContent,
  supportMaterialNotice,
  readOnlyField,
  detailsSummaryLabel,
  detailsStartCollapsed = false,
  detailsGuidance,
  showTitle = true,
  showKey = true,
  showLeadVocal = true,
  showTempo = true,
  showSongType = true,
  showNotes = true,
  notesLabel = "Notes / YouTube Link / Chart Link",
  notesPlaceholder = "Optional YouTube link, chart link, arrangement notes, key notes, capo notes, or anything the band should know",
  showLyrics = true,
  showChartUrl = false,
  chartUrlLabel = "Chart Link / Nashville Chart URL",
  chartUrlPlaceholder = "https://...",
  chartUploadInput,
  audioUploadInput,
  customTitleField = false,
  customTitlePlaceholder = "Leave blank to use the source song title",
  performanceFlowField = false,
  performanceFlowPlaceholder = "Intro - Fiddle\nVerse 1 - Lead vocal\nBanjo break\nVerse 2\nMandolin break\nTag ending",
  songIntroNotesField = false,
  songIntroNotesPlaceholder = "This next song was written by...\nHere's one we've always loved...\nFeature song for Kelly Caldwell...",
}: SharedSongEditorProps) {
  const hasBasicFields = showTitle || Boolean(readOnlyField) || showKey || showLeadVocal || showTempo || showSongType;
  const hasDetailFields = showNotes || showLyrics || customTitleField || performanceFlowField || songIntroNotesField;
  const hasMediaFields = showChartUrl || Boolean(chartUploadInput) || Boolean(audioUploadInput) || Boolean(supportMaterialNotice);

  return (
    <div className="grid gap-4">
      {topContent}

      {hasBasicFields ? (
        <section className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {showTitle ? (
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Song Title
                <input
                  type="text"
                  name="title"
                  value={formState.title ?? ""}
                  onChange={onChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Enter song title"
                  required
                />
              </label>
            ) : null}

            {readOnlyField ? (
              <div className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                <span>{readOnlyField.label}</span>
                <div className="rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-sm text-stone-700">
                  {readOnlyField.value || readOnlyField.placeholder || ""}
                </div>
              </div>
            ) : null}
          </div>

          {showKey || showLeadVocal ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {showKey ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Key
                  <input
                    type="text"
                    name="key"
                    value={formState.key ?? ""}
                    onChange={onChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Optional key"
                  />
                </label>
              ) : null}

              {showLeadVocal ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Lead Vocal
                  <input
                    type="text"
                    name="sungBy"
                    value={formState.sungBy ?? ""}
                    onChange={onChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                    placeholder="Optional lead vocal"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {showTempo || showSongType ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {showTempo ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Tempo
                  <select
                    name="tempo"
                    value={formState.tempo ?? ""}
                    onChange={onChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  >
                    <option value="">Not set</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium</option>
                    <option value="slow">Slow</option>
                  </select>
                </label>
              ) : null}

              {showSongType ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                  Song Type
                  <select
                    name="songType"
                    value={formState.songType ?? ""}
                    onChange={onChange}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  >
                    <option value="">Not set</option>
                    <option value="vocal">Vocal</option>
                    <option value="instrumental">Instrumental</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {hasDetailFields ? (
        detailsSummaryLabel ? (
          <details
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
            open={!detailsStartCollapsed}
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800">
              {detailsSummaryLabel}
            </summary>
            <div className="mt-4 grid gap-4">
              {detailsGuidance}
              <SongEditorDetailFields
                formState={formState}
                onChange={onChange}
                showNotes={showNotes}
                notesLabel={notesLabel}
                notesPlaceholder={notesPlaceholder}
                showLyrics={showLyrics}
                customTitleField={customTitleField}
                customTitlePlaceholder={customTitlePlaceholder}
                performanceFlowField={performanceFlowField}
                performanceFlowPlaceholder={performanceFlowPlaceholder}
                songIntroNotesField={songIntroNotesField}
                songIntroNotesPlaceholder={songIntroNotesPlaceholder}
              />
            </div>
          </details>
        ) : (
          <section className="grid gap-4">
            {detailsGuidance}
            <SongEditorDetailFields
              formState={formState}
              onChange={onChange}
              showNotes={showNotes}
              notesLabel={notesLabel}
              notesPlaceholder={notesPlaceholder}
              showLyrics={showLyrics}
              customTitleField={customTitleField}
              customTitlePlaceholder={customTitlePlaceholder}
              performanceFlowField={performanceFlowField}
              performanceFlowPlaceholder={performanceFlowPlaceholder}
              songIntroNotesField={songIntroNotesField}
              songIntroNotesPlaceholder={songIntroNotesPlaceholder}
            />
          </section>
        )
      ) : null}

      {hasMediaFields ? (
        <section className="grid gap-4">
          {showChartUrl ? (
            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
              {chartUrlLabel}
              <input
                type="url"
                name="chartUrl"
                value={formState.chartUrl ?? ""}
                onChange={onChange}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                placeholder={chartUrlPlaceholder}
              />
            </label>
          ) : null}

          {chartUploadInput}
          {audioUploadInput}
          {supportMaterialNotice}
        </section>
      ) : null}

      {footer}
    </div>
  );
}

type SongEditorDetailFieldsProps = {
  formState: SharedSongEditorState;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  showNotes: boolean;
  notesLabel: string;
  notesPlaceholder: string;
  showLyrics: boolean;
  customTitleField: boolean;
  customTitlePlaceholder: string;
  performanceFlowField: boolean;
  performanceFlowPlaceholder: string;
  songIntroNotesField: boolean;
  songIntroNotesPlaceholder: string;
};

function SongEditorDetailFields({
  formState,
  onChange,
  showNotes,
  notesLabel,
  notesPlaceholder,
  showLyrics,
  customTitleField,
  customTitlePlaceholder,
  performanceFlowField,
  performanceFlowPlaceholder,
  songIntroNotesField,
  songIntroNotesPlaceholder,
}: SongEditorDetailFieldsProps) {
const lyricsFieldId = useId();
  const lyricsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [lyricsPasteStatus, setLyricsPasteStatus] = useState<string | null>(null);
  const lyricsSearchQuery = [formState.title?.trim(), formState.sungBy?.trim(), "lyrics"]
    .filter(Boolean)
    .join(" ");
  const lyricsSearchUrl = formState.title?.trim()
    ? `https://www.google.com/search?q=${encodeURIComponent(lyricsSearchQuery)}`
    : null;

  async function handlePasteLyrics() {
    setLyricsPasteStatus(null);
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard access is unavailable.");
      }
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        setLyricsPasteStatus("Clipboard is empty.");
        return;
      }
      const textarea = lyricsTextareaRef.current;
      if (!textarea) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      valueSetter?.call(textarea, clipboardText);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      setLyricsPasteStatus("Lyrics pasted. Save when ready.");
    } catch {
      setLyricsPasteStatus("Could not access the clipboard. Please paste into the Lyrics field manually.");
    }
  }
  return (
    <>
      {customTitleField ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          Custom Title
          <input
            type="text"
            name="customTitle"
            value={formState.customTitle ?? ""}
            onChange={onChange}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder={customTitlePlaceholder}
          />
        </label>
      ) : null}

      {performanceFlowField ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          Performance Flow / Break Order
          <textarea
            name="performanceFlow"
            value={formState.performanceFlow ?? ""}
            onChange={onChange}
            rows={7}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder={performanceFlowPlaceholder}
          />
        </label>
      ) : null}

      {songIntroNotesField ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          Song Intro Notes
          <textarea
            name="songIntroNotes"
            value={formState.songIntroNotes ?? ""}
            onChange={onChange}
            rows={5}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder={songIntroNotesPlaceholder}
          />
        </label>
      ) : null}

      {showNotes ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          {notesLabel}
          <textarea
            name="notes"
            value={formState.notes ?? ""}
            onChange={onChange}
            className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder={notesPlaceholder}
          />
        </label>
      ) : null}

      {showLyrics ? (
        <div className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={lyricsFieldId}>Lyrics</label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {lyricsSearchUrl ? (
                <a
                  href={lyricsSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  Find Lyrics
                </a>
              ) : (
                <span className="cursor-not-allowed rounded-lg border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-400">
                  Find Lyrics
                </span>
              )}
              <button
                type="button"
                onClick={() => void handlePasteLyrics()}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Paste Lyrics
              </button>
            </div>
          </div>
          {lyricsPasteStatus ? <p className="text-xs text-stone-600" role="status" aria-live="polite">{lyricsPasteStatus}</p> : null}
          <textarea
            id={lyricsFieldId}
            ref={lyricsTextareaRef}
            name="lyrics"
            value={formState.lyrics ?? ""}
            onChange={onChange}
            className="min-h-40 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder="Optional lyrics"
          />
        </div>
      ) : null}
    </>
  );
}
