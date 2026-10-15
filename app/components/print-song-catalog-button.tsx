"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { catalogHtml, type CatalogSong } from "@/lib/song-catalog";

export function PrintSongCatalogButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openCatalog() {
    const preview = window.open("", "_blank");
    if (!preview) { setError("Allow pop-ups to open the song catalog."); return; }
    preview.opener = null;
    preview.document.title = "Loading Song Catalog";
    preview.document.body.textContent = "Loading the complete Song Library…";
    setLoading(true);
    setError("");
    try {
      const songs: CatalogSong[] = [];
      const client = createClient();
      // A small batch stays below Supabase's default response cap.
      const batchSize = 500;
      for (let offset = 0; ; offset += batchSize) {
        // Guest-only submissions live in show_guest_songs. Read only the reusable
        // songs library; guest appearances/notes do not make a library song guest-only.
        const { data, error } = await client.from("songs").select("id,title,key,tempo,song_type")
          .order("id", { ascending: true }).range(offset, offset + batchSize - 1);
        if (error) throw error;
        if (!data) throw new Error("The Song Library returned no data.");
        songs.push(...data as CatalogSong[]);
        if (data.length < batchSize) break;
      }
      if (!preview.closed) {
        preview.document.open();
        preview.document.write(catalogHtml(songs));
        preview.document.close();
      }
    } catch {
      if (!preview.closed) preview.close();
      setError("Could not load the complete Song Library. Please try again.");
    } finally { setLoading(false); }
  }

  return <div><button type="button" disabled={loading} onClick={openCatalog} className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50">{loading ? "Loading Song Catalog…" : "Print Song Catalog"}</button>{error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}</div>;
}
