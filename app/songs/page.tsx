import type { Metadata } from "next";
import { MusicLibrary } from "@/app/components/music-library";

export const metadata: Metadata = { title: "Music Library | StageFlow" };

export default function MusicLibraryPage() {
  return <MusicLibrary />;
}
