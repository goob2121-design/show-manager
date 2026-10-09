import type { createClient } from "./supabase/client";
import { nonEmptyPerformanceFlow } from "./song-resolvers";

export const EXISTING_LIBRARY_DEFAULT_MESSAGE = "This song already has a Library Default. Edit the permanent default in the Song Library if you want to change it.";

export function savedPerformanceFlowSource(override: string | null | undefined, libraryDefault: string | null | undefined) {
  return nonEmptyPerformanceFlow(override) ? "Show Override" : nonEmptyPerformanceFlow(libraryDefault) ? "Library Default" : "Not Set";
}

export async function savePerformanceFlowDefault(client: ReturnType<typeof createClient>, songId: string, arrangement: string) {
  if (!nonEmptyPerformanceFlow(arrangement)) throw new Error("Enter a Performance Flow before saving a Library Default.");
  const read = async () => {
    const { data, error } = await client.from("songs").select("id, default_performance_flow").eq("id", songId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The linked Song Library record could not be loaded.");
    return data as { id: string; default_performance_flow: string | null };
  };
  const current = await read();
  if (nonEmptyPerformanceFlow(current.default_performance_flow)) return { saved: false, song: current };

  // The condition is evaluated atomically with the UPDATE. A competing save
  // changes this value, so this request cannot overwrite its nonempty default.
  const update = client.from("songs").update({ default_performance_flow: arrangement }).eq("id", songId);
  const conditional = current.default_performance_flow === null
    ? update.is("default_performance_flow", null)
    : update.eq("default_performance_flow", current.default_performance_flow);
  const { data, error } = await conditional.select("id, default_performance_flow").maybeSingle();
  if (error) throw error;
  if (!data) {
    const refreshed = await read();
    if (nonEmptyPerformanceFlow(refreshed.default_performance_flow)) return { saved: false, song: refreshed };
    throw new Error("Library Default was not saved. Check your song editing access and try again.");
  }
  return { saved: true, song: data as { id: string; default_performance_flow: string | null } };
}
