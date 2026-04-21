"use client";

import Image from "next/image";
import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ShowRecord } from "@/lib/types";

type ShowFormState = {
  name: string;
  showDate: string;
  venue: string;
  slug: string;
};

const initialFormState: ShowFormState = {
  name: "",
  showDate: "",
  venue: "",
  slug: "",
};

function formatShowDate(showDate: string | null) {
  if (!showDate) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${showDate}T00:00:00`));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to Supabase.";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildShowFormState(show: Pick<ShowRecord, "name" | "show_date" | "venue" | "slug">) {
  return {
    name: show.name,
    showDate: show.show_date ?? "",
    venue: show.venue ?? "",
    slug: show.slug,
  };
}

export default function ShowsDashboardPage() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [formState, setFormState] = useState<ShowFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [editFormState, setEditFormState] = useState<ShowFormState>(initialFormState);
  const [activeShowActionId, setActiveShowActionId] = useState<string | null>(null);

  const activeShows = shows.filter((show) => !show.is_archived);
  const archivedShows = shows.filter((show) => show.is_archived);

  const loadShows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .order("show_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setShows(data ?? []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShows();
  }, [loadShows]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement>,
    options?: {
      mode?: "create" | "edit";
      preserveManualSlug?: boolean;
    },
  ) {
    const { name, value } = event.target;
    const mode = options?.mode ?? "create";
    const preserveManualSlug = options?.preserveManualSlug ?? false;
    const setState = mode === "edit" ? setEditFormState : setFormState;

    setState((currentState) => {
      if (name === "name") {
        return {
          ...currentState,
          name: value,
          slug:
            preserveManualSlug && currentState.slug
              ? currentState.slug
              : currentState.slug
                ? currentState.slug
                : slugify(value),
        };
      }

      if (name === "slug") {
        return {
          ...currentState,
          slug: slugify(value),
        };
      }

      return {
        ...currentState,
        [name]: value,
      };
    });
  }

  function startEditingShow(show: ShowRecord) {
    setEditingShowId(show.id);
    setEditFormState(buildShowFormState(show));
    setErrorMessage(null);
  }

  function cancelEditingShow() {
    setEditingShowId(null);
    setEditFormState(initialFormState);
  }

  function validateShowValues({
    name,
    slug,
    existingShowId,
  }: {
    name: string;
    slug: string;
    existingShowId?: string;
  }) {
    if (!name) {
      return "Show name is required.";
    }

    if (!slug) {
      return "Slug is required.";
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return "Slug must be URL-friendly and use lowercase letters, numbers, and hyphens only.";
    }

    if (shows.some((show) => show.slug === slug && show.id !== existingShowId)) {
      return "A show with that slug already exists.";
    }

    return null;
  }

  async function handleCopyLink(slug: string, role: "guest" | "band" | "admin") {
    const routePath = `/${role}/${slug}`;
    const absoluteUrl =
      typeof window === "undefined" ? routePath : `${window.location.origin}${routePath}`;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      const nextKey = `${role}-${slug}`;
      setCopiedLinkKey(nextKey);

      window.setTimeout(() => {
        setCopiedLinkKey((currentKey) => (currentKey === nextKey ? null : currentKey));
      }, 1800);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = formState.name.trim();
    const slug = slugify(formState.slug);
    const validationError = validateShowValues({ name, slug });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .insert({
          name,
          slug,
          show_date: formState.showDate || null,
          venue: formState.venue.trim() || null,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      window.location.href = `/admin/${data.slug}`;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveShow(event: FormEvent<HTMLFormElement>, showId: string) {
    event.preventDefault();

    const name = editFormState.name.trim();
    const slug = slugify(editFormState.slug);
    const validationError = validateShowValues({ name, slug, existingShowId: showId });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setActiveShowActionId(showId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({
          name,
          slug,
          show_date: editFormState.showDate || null,
          venue: editFormState.venue.trim() || null,
        })
        .eq("id", showId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShows((currentShows) =>
        currentShows.map((show) => (show.id === showId ? data : show)),
      );
      cancelEditingShow();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  async function handleSetArchived(showId: string, nextArchivedValue: boolean) {
    setErrorMessage(null);
    setActiveShowActionId(showId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({ is_archived: nextArchivedValue })
        .eq("id", showId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShows((currentShows) =>
        currentShows.map((show) => (show.id === showId ? data : show)),
      );

      if (editingShowId === showId) {
        cancelEditingShow();
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="flex flex-col gap-2 border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {showLogo ? (
              <Image
                src="/cmms-logo.png"
                alt="CMMS logo"
                width={72}
                height={72}
                className="h-14 w-auto rounded-lg object-contain"
                onError={() => setShowLogo(false)}
                priority
              />
            ) : null}

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
                CMMS Portal
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Show Manager
              </h1>
            </div>
          </div>
          <p className="text-base text-stone-600">
            Create a new event, then open the Guest, Band, or Admin portal for that show.
          </p>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-8 lg:grid-cols-[1.05fr_1.45fr]">
          <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Create New Show</h2>
              <p className="text-sm text-stone-600">
                Create a show record and jump straight into its admin portal.
              </p>
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Show Name
                <input
                  type="text"
                  name="name"
                  value={formState.name}
                  onChange={handleChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Cumberland Mountain Music Show"
                  required
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Show Date
                <input
                  type="date"
                  name="showDate"
                  value={formState.showDate}
                  onChange={handleChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Venue
                <input
                  type="text"
                  name="venue"
                  value={formState.venue}
                  onChange={handleChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="Optional venue"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Slug
                <input
                  type="text"
                  name="slug"
                  value={formState.slug}
                  onChange={handleChange}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                  placeholder="cmms-april-27"
                  required
                />
              </label>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isSubmitting ? "Creating Show..." : "Create Show"}
                </button>
              </div>
            </form>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Shows</h2>
                <p className="text-sm text-stone-600">
                  Open portals, fix show details, or archive older shows safely.
                </p>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                  className="h-4 w-4"
                />
                <span>Show Archived</span>
              </label>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                Loading shows...
              </div>
            ) : activeShows.length === 0 && (!showArchived || archivedShows.length === 0) ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                No shows created yet.
              </div>
            ) : (
              <div className="grid gap-6">
                <section className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-stone-900">Active Shows</h3>
                    <p className="text-sm text-stone-600">
                      Shows visible in the normal dashboard list.
                    </p>
                  </div>

                  {activeShows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                      No active shows right now.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {activeShows.map((show) => {
                        const isEditing = editingShowId === show.id;

                        return (
                          <article
                            key={show.id}
                            className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
                          >
                            {isEditing ? (
                              <form
                                className="grid gap-4"
                                onSubmit={(event) => handleSaveShow(event, show.id)}
                              >
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Show Name
                                    <input
                                      type="text"
                                      name="name"
                                      value={editFormState.name}
                                      onChange={(event) =>
                                        handleChange(event, {
                                          mode: "edit",
                                          preserveManualSlug: true,
                                        })
                                      }
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      required
                                    />
                                  </label>

                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Show Date
                                    <input
                                      type="date"
                                      name="showDate"
                                      value={editFormState.showDate}
                                      onChange={(event) => handleChange(event, { mode: "edit" })}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    />
                                  </label>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Venue
                                    <input
                                      type="text"
                                      name="venue"
                                      value={editFormState.venue}
                                      onChange={(event) => handleChange(event, { mode: "edit" })}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                    />
                                  </label>

                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                    Slug
                                    <input
                                      type="text"
                                      name="slug"
                                      value={editFormState.slug}
                                      onChange={(event) => handleChange(event, { mode: "edit" })}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      required
                                    />
                                  </label>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <button
                                    type="submit"
                                    disabled={activeShowActionId === show.id}
                                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                  >
                                    Save Changes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingShow}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="flex flex-col gap-2">
                                  <h4 className="text-lg font-semibold text-stone-900">
                                    {show.name}
                                  </h4>
                                  <div className="grid gap-1 text-sm text-stone-600">
                                    <p>Date: {formatShowDate(show.show_date)}</p>
                                    {show.venue ? <p>Venue: {show.venue}</p> : null}
                                    <p>Slug: {show.slug}</p>
                                  </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-3">
                                  <Link
                                    href={`/guest/${show.slug}`}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Guest Portal
                                  </Link>
                                  <Link
                                    href={`/band/${show.slug}`}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Band Portal
                                  </Link>
                                  <Link
                                    href={`/admin/${show.slug}`}
                                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                                  >
                                    Admin Portal
                                  </Link>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(show.slug, "guest")}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    {copiedLinkKey === `guest-${show.slug}`
                                      ? "Copied!"
                                      : "Copy Guest Link"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(show.slug, "band")}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    {copiedLinkKey === `band-${show.slug}`
                                      ? "Copied!"
                                      : "Copy Band Link"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(show.slug, "admin")}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    {copiedLinkKey === `admin-${show.slug}`
                                      ? "Copied!"
                                      : "Copy Admin Link"}
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-3 border-t border-stone-200 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => startEditingShow(show)}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    Edit Show
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetArchived(show.id, true)}
                                    disabled={activeShowActionId === show.id}
                                    className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-stone-500"
                                  >
                                    Archive Show
                                  </button>
                                </div>
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                {showArchived ? (
                  <section className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-semibold text-stone-900">Archived Shows</h3>
                      <p className="text-sm text-stone-600">
                        Hidden from the normal list but still restorable and accessible by link.
                      </p>
                    </div>

                    {archivedShows.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                        No archived shows yet.
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {archivedShows.map((show) => {
                          const isEditing = editingShowId === show.id;

                          return (
                            <article
                              key={show.id}
                              className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5"
                            >
                              {isEditing ? (
                                <form
                                  className="grid gap-4"
                                  onSubmit={(event) => handleSaveShow(event, show.id)}
                                >
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                      Show Name
                                      <input
                                        type="text"
                                        name="name"
                                        value={editFormState.name}
                                        onChange={(event) =>
                                          handleChange(event, {
                                            mode: "edit",
                                            preserveManualSlug: true,
                                          })
                                        }
                                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                        required
                                      />
                                    </label>

                                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                      Show Date
                                      <input
                                        type="date"
                                        name="showDate"
                                        value={editFormState.showDate}
                                        onChange={(event) => handleChange(event, { mode: "edit" })}
                                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      />
                                    </label>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                      Venue
                                      <input
                                        type="text"
                                        name="venue"
                                        value={editFormState.venue}
                                        onChange={(event) => handleChange(event, { mode: "edit" })}
                                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                      />
                                    </label>

                                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                      Slug
                                      <input
                                        type="text"
                                        name="slug"
                                        value={editFormState.slug}
                                        onChange={(event) => handleChange(event, { mode: "edit" })}
                                        className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
                                        required
                                      />
                                    </label>
                                  </div>

                                  <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                      type="submit"
                                      disabled={activeShowActionId === show.id}
                                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                    >
                                      Save Changes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditingShow}
                                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <>
                                  <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="text-lg font-semibold text-stone-900">
                                        {show.name}
                                      </h4>
                                      <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                                        Archived
                                      </span>
                                    </div>
                                    <div className="grid gap-1 text-sm text-stone-600">
                                      <p>Date: {formatShowDate(show.show_date)}</p>
                                      {show.venue ? <p>Venue: {show.venue}</p> : null}
                                      <p>Slug: {show.slug}</p>
                                    </div>
                                  </div>

                                  <div className="mt-4 flex flex-wrap gap-3">
                                    <Link
                                      href={`/guest/${show.slug}`}
                                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                    >
                                      Guest Portal
                                    </Link>
                                    <Link
                                      href={`/band/${show.slug}`}
                                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                    >
                                      Band Portal
                                    </Link>
                                    <Link
                                      href={`/admin/${show.slug}`}
                                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                                    >
                                      Admin Portal
                                    </Link>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-3 border-t border-amber-300 pt-3">
                                    <button
                                      type="button"
                                      onClick={() => startEditingShow(show)}
                                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                    >
                                      Edit Show
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSetArchived(show.id, false)}
                                      disabled={activeShowActionId === show.id}
                                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                    >
                                      Restore Show
                                    </button>
                                  </div>
                                </>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ) : null}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
