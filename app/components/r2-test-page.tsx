"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type R2TestFile = {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  url: string;
};

type R2TestPageProps = {
  configSummary: {
    accountId: string;
    bucketName: string;
    endpoint: string;
    testPrefix: string;
  } | null;
  configError?: string | null;
};

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function R2TestPage({ configSummary, configError = null }: R2TestPageProps) {
  const [files, setFiles] = useState<R2TestFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeDeleteKey, setActiveDeleteKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileCountLabel = useMemo(
    () => `${files.length} test file${files.length === 1 ? "" : "s"}`,
    [files.length],
  );

  async function loadFiles() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/r2-test/files", { cache: "no-store" });
      const payload = (await response.json()) as
        | { success: true; files: R2TestFile[] }
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error("error" in payload ? payload.error || "Unable to load R2 test files." : "Unable to load R2 test files.");
      }

      setFiles(payload.files);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load R2 test files.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFiles();
  }, []);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uploadForm = event.currentTarget;

    if (!selectedFile) {
      setErrorMessage("Choose a file before uploading to R2.");
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const response = await fetch("/api/r2-test/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | { success: true; file: R2TestFile }
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error("error" in payload ? payload.error || "Unable to upload the R2 test file." : "Unable to upload the R2 test file.");
      }

      setFiles((currentFiles) => [payload.file, ...currentFiles]);
      setSelectedFile(null);
      setStatusMessage(`Uploaded "${payload.file.name}" to R2.`);
      uploadForm.reset();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload the R2 test file.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(file: R2TestFile) {
    const shouldDelete = window.confirm(`Delete "${file.name}" from the R2 test bucket?`);

    if (!shouldDelete) {
      return;
    }

    setActiveDeleteKey(file.key);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/r2-test/files", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ key: file.key }),
      });
      const payload = (await response.json()) as
        | { success: true; deletedKey: string }
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error("error" in payload ? payload.error || "Unable to delete the R2 test file." : "Unable to delete the R2 test file.");
      }

      setFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile.key !== payload.deletedKey));
      setStatusMessage(`Deleted "${file.name}" from R2.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete the R2 test file.");
    } finally {
      setActiveDeleteKey(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-8 text-slate-100 sm:px-6 sm:py-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              StageFlow R2 Test
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Cloudflare R2 Connectivity</h1>
            <p className="max-w-3xl text-sm text-slate-300 sm:text-base">
              This isolated Phase 1 page tests R2 uploads, listing, and deletes without touching any
              existing Supabase Storage flows.
            </p>
          </div>

          <Link
            href="/shows"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Upload Test File</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Files from this page are stored under the isolated prefix{" "}
                  <span className="font-semibold text-emerald-300">{configSummary?.testPrefix ?? "stageflow-r2-test/"}</span>.
                </p>
              </div>

              <form className="flex flex-col gap-4" onSubmit={handleUpload}>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Test file
                  <input
                    type="file"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-100"
                  />
                </label>

                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                >
                  {isUploading ? "Uploading..." : "Upload to R2"}
                </button>
              </form>

              {configSummary ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">R2 Config</p>
                  <div className="mt-3 grid gap-2">
                    <p><span className="font-medium text-slate-100">Bucket:</span> {configSummary.bucketName}</p>
                    <p><span className="font-medium text-slate-100">Endpoint:</span> {configSummary.endpoint}</p>
                    <p><span className="font-medium text-slate-100">Account:</span> {configSummary.accountId}</p>
                    <p><span className="font-medium text-slate-100">Test Prefix:</span> {configSummary.testPrefix}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  {configError ?? "R2 environment variables are not configured yet."}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">R2 Test Files</h2>
                  <p className="mt-1 text-sm text-slate-400">{fileCountLabel} in the isolated R2 test area.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadFiles()}
                  disabled={isLoading}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Refreshing..." : "Refresh List"}
                </button>
              </div>

              {statusMessage ? (
                <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {statusMessage}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {errorMessage}
                </div>
              ) : null}

              {isLoading && files.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-8 text-sm text-slate-400">
                  Loading R2 test files...
                </div>
              ) : files.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-8 text-sm text-slate-400">
                  No R2 test files found yet. Upload one to verify connectivity.
                </div>
              ) : (
                <div className="grid gap-3">
                  {files.map((file) => (
                    <article
                      key={file.key}
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="break-all text-sm font-semibold text-white">{file.name}</p>
                          <p className="text-xs text-slate-400">{file.key}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span>{formatFileSize(file.size)}</span>
                            <span>{formatTimestamp(file.lastModified)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleDelete(file)}
                            disabled={activeDeleteKey === file.key}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {activeDeleteKey === file.key ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
