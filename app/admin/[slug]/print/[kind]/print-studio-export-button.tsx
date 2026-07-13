"use client";

type PrintStudioRecord = Partial<Record<"event_name" | "show_date" | "show_time" | "venue" | "purchaser_name" | "guest_name" | "sponsor_name" | "ticket_type" | "seat" | "section" | "ticket_number", string>>;

type PrintStudioExportFile = {
  schemaVersion: 1;
  exportedAt: string;
  source: string;
  showSlug?: string;
  records: PrintStudioRecord[];
};

type PrintStudioExportButtonProps = {
  fileName: string;
  exportFile: PrintStudioExportFile;
};

export function PrintStudioExportButton({ fileName, exportFile }: PrintStudioExportButtonProps) {
  function handleExport() {
    const blob = new Blob([JSON.stringify(exportFile, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
    >
      Export for Print Studio
    </button>
  );
}