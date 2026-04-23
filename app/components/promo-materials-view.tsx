import type { PromoMaterial } from "@/lib/types";

export function formatPromoMaterialCategory(category: string | null | undefined) {
  switch (category) {
    case "flyer":
      return "Flyer";
    case "social_graphic":
      return "Social Graphic";
    case "poster":
      return "Poster";
    case "sponsor_graphic":
      return "Sponsor Graphic";
    case "logo":
      return "Logo";
    case "promo_photo":
      return "Promo Photo";
    default:
      return "Other";
  }
}

export function formatPromoFileSize(fileSize: number | null | undefined) {
  if (!fileSize || fileSize <= 0) {
    return null;
  }

  if (fileSize < 1024 * 1024) {
    return `${Math.ceil(fileSize / 1024)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPromoUploadDate(createdAt: string | null | undefined) {
  if (!createdAt) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt));
}

type PromoMaterialsViewProps = {
  materials: PromoMaterial[];
  emptyMessage?: string;
};

export function PromoMaterialsView({
  materials,
  emptyMessage = "No promo materials are available yet.",
}: PromoMaterialsViewProps) {
  if (materials.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {materials.map((material) => {
        const uploadDate = formatPromoUploadDate(material.created_at);
        const fileSize = formatPromoFileSize(material.file_size);

        return (
          <article
            key={material.id}
            className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  {formatPromoMaterialCategory(material.category)}
                </span>
                {material.file_mime_type ? (
                  <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                    {material.file_mime_type.split("/").pop() || "File"}
                  </span>
                ) : null}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-stone-900">{material.title}</h3>
                {material.description?.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                    {material.description}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                {uploadDate ? <span>Uploaded {uploadDate}</span> : null}
                {fileSize ? <span>{fileSize}</span> : null}
              </div>
            </div>

            <a
              href={material.file_url}
              download={material.file_name}
              target="_blank"
              rel="noreferrer"
              className="mt-auto flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              Download
            </a>
          </article>
        );
      })}
    </div>
  );
}
