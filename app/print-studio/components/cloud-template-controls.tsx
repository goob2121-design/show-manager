"use client";

import { useCallback, useState } from "react";
import { createCloudTemplate, deleteCloudTemplate, getCloudTemplate, listCloudTemplates, updateCloudTemplate, uploadCloudBackground } from "../cloud/client";
import { createCloudPayload, dataUrlToFile, isDataUrl } from "../cloud/serialization";
import type { CloudPrintTemplateRecord, CloudPrintTemplateSummary } from "../cloud/types";
import type { BatchSettings, PrintTemplate } from "./types";

type CloudTemplateControlsProps = {
  template: PrintTemplate;
  batchSettings: BatchSettings;
  cloudTemplateId?: string;
  cloudTemplateName?: string;
  cloudBackgroundPath?: string | null;
  onCloudTemplateLoaded: (record: CloudPrintTemplateRecord) => void;
  onCloudTemplateSaved: (record: CloudPrintTemplateRecord) => void;
  onCloudTemplateDeleted: (templateId: string) => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CloudTemplateControls({
  template,
  batchSettings,
  cloudTemplateId,
  cloudTemplateName,
  cloudBackgroundPath,
  onCloudTemplateLoaded,
  onCloudTemplateSaved,
  onCloudTemplateDeleted,
}: CloudTemplateControlsProps) {
  const [editorKey, setEditorKey] = useState("");
  const [templates, setTemplates] = useState<CloudPrintTemplateSummary[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("Cloud templates use the server API. Local saves still work without cloud access.");

  const refreshTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await listCloudTemplates(includeArchived);
      setTemplates(response.templates ?? []);
      setMessage(response.templates?.length ? "Cloud templates loaded." : "No cloud templates found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load cloud templates.");
    } finally {
      setIsLoading(false);
    }
  }, [includeArchived]);

  async function uploadBackgroundIfNeeded(templateId: string) {
    if (!isDataUrl(template.backgroundImage)) return { backgroundPath: cloudBackgroundPath ?? null, backgroundUrl: template.backgroundImage ?? null };
    const file = dataUrlToFile(template.backgroundImage, `${template.name || "print-studio-background"}.png`);
    const upload = await uploadCloudBackground(templateId, file, editorKey);
    if (!upload.backgroundPath) throw new Error("Background upload did not return a storage path.");
    return { backgroundPath: upload.backgroundPath, backgroundUrl: upload.backgroundUrl ?? null };
  }

  async function saveToCloud(saveAs: boolean) {
    setIsLoading(true);
    try {
      const requestedName = saveAs || !cloudTemplateId ? window.prompt("Cloud template name", template.name) : template.name;
      const name = (requestedName ?? template.name).trim();
      if (!name) {
        setMessage("Cloud save canceled because the template needs a name.");
        return;
      }

      let record: CloudPrintTemplateRecord | undefined;
      if (!saveAs && cloudTemplateId) {
        const background = await uploadBackgroundIfNeeded(cloudTemplateId);
        const payload = createCloudPayload({ ...template, name }, batchSettings, background.backgroundPath);
        const response = await updateCloudTemplate(cloudTemplateId, payload, editorKey);
        record = response.template;
      } else {
        const createPayload = createCloudPayload({ ...template, name }, batchSettings, cloudBackgroundPath ?? null);
        const created = await createCloudTemplate(createPayload, editorKey);
        if (!created.template) throw new Error("Cloud template was not returned after create.");
        const background = await uploadBackgroundIfNeeded(created.template.id);
        if (background.backgroundPath !== createPayload.backgroundPath) {
          const updated = await updateCloudTemplate(created.template.id, createCloudPayload({ ...template, name }, batchSettings, background.backgroundPath), editorKey);
          record = updated.template;
        } else {
          record = created.template;
        }
      }

      if (!record) throw new Error("Cloud save did not return a template.");
      onCloudTemplateSaved({
        ...record,
        template: { ...record.template, backgroundImage: isDataUrl(template.backgroundImage) ? template.backgroundImage : record.backgroundUrl ?? template.backgroundImage },
      });
      setMessage(`${saveAs ? "Saved a cloud copy" : "Saved to cloud"}: ${record.name}`);
      await refreshTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud save failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTemplate(id: string) {
    if (!window.confirm("Load this cloud template and replace the current designer state?")) return;
    setIsLoading(true);
    try {
      const response = await getCloudTemplate(id);
      if (!response.template) throw new Error("Cloud template was not returned.");
      onCloudTemplateLoaded(response.template);
      setMessage(`Loaded cloud template: ${response.template.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud template load failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function renameTemplate(summary: CloudPrintTemplateSummary) {
    const name = window.prompt("Rename cloud template", summary.name)?.trim();
    if (!name || name === summary.name) return;
    setIsLoading(true);
    try {
      const response = await updateCloudTemplate(summary.id, { name }, editorKey);
      if (response.template) onCloudTemplateSaved(response.template);
      setMessage(`Renamed cloud template to ${name}.`);
      await refreshTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud rename failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function setArchived(summary: CloudPrintTemplateSummary, isArchived: boolean) {
    setIsLoading(true);
    try {
      const response = await updateCloudTemplate(summary.id, { isArchived }, editorKey);
      if (response.template) onCloudTemplateSaved(response.template);
      setMessage(`${isArchived ? "Archived" : "Restored"} ${summary.name}.`);
      await refreshTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud archive update failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function permanentlyDeleteTemplate(summary: CloudPrintTemplateSummary) {
    if (!editorKey.trim()) {
      setMessage("Print Studio editor key is invalid.");
      return;
    }
    if (!window.confirm(`Permanently delete "${summary.name}"?\n\nThis cannot be undone. Use Archive instead if the template may be needed later.`)) return;
    if (!window.confirm("Permanently Delete")) return;

    setIsLoading(true);
    try {
      await deleteCloudTemplate(summary.id, editorKey);
      onCloudTemplateDeleted(summary.id);
      setTemplates((currentTemplates) => currentTemplates.filter((item) => item.id !== summary.id));
      setMessage("Cloud template permanently deleted.");
      await refreshTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud template delete failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Cloud Templates</h2>
          <p className="mt-1 text-sm text-slate-400">{cloudTemplateName ? `Current cloud template: ${cloudTemplateName}` : "No cloud template loaded."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isLoading} onClick={() => void saveToCloud(false)} className="rounded-md bg-sky-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
            Save to Cloud
          </button>
          <button type="button" disabled={isLoading} onClick={() => void saveToCloud(true)} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-bold text-slate-100 disabled:opacity-50">
            Save As Cloud Template
          </button>
          <button type="button" disabled={isLoading} onClick={() => void refreshTemplates()} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-100 disabled:opacity-50">
            Refresh Cloud Templates
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,22rem)_auto] md:items-end">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Editor key
          <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="password" value={editorKey} onChange={(event) => setEditorKey(event.target.value)} placeholder="Required for cloud writes" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
          Include archived templates
        </label>
      </div>
      <p className="mt-3 text-sm text-slate-400">{isLoading ? "Working..." : message}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">No cloud templates to show.</div>
        ) : templates.map((item) => (
          <article key={item.id} className="rounded-md border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-white">{item.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{item.widthInches} x {item.heightInches} in - {item.orientation} - updated {formatDate(item.updatedAt)}</p>
                {item.isArchived ? <p className="mt-1 text-xs font-bold uppercase text-amber-300">Archived</p> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={isLoading} onClick={() => void loadTemplate(item.id)} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Load</button>
              <button type="button" disabled={isLoading} onClick={() => void renameTemplate(item)} className="rounded-md bg-slate-800 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">Rename</button>
              <button type="button" disabled={isLoading} onClick={() => void setArchived(item, !item.isArchived)} className="rounded-md border border-slate-700 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">{item.isArchived ? "Restore" : "Archive"}</button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void permanentlyDeleteTemplate(item)}
                className="rounded-md border border-rose-500/60 px-3 py-2 text-xs font-bold text-rose-200 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-rose-500/10"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
