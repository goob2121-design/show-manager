import type { PromoMaterial } from "@/lib/types";

const imageFileExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function getPromoFileExtension(fileName: string | null | undefined) {
  const extension = fileName?.split(".").pop()?.trim().toLowerCase();
  return extension && extension !== fileName?.toLowerCase() ? extension : null;
}

export function isPromoMaterialImage(material: Pick<PromoMaterial, "file_mime_type" | "file_name">) {
  if (material.file_mime_type?.toLowerCase().startsWith("image/")) {
    return true;
  }

  const extension = getPromoFileExtension(material.file_name);
  return extension ? imageFileExtensions.has(extension) : false;
}

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
        const isImage = isPromoMaterialImage(material);
        const fileExtension = getPromoFileExtension(material.file_name);

        return (
          <article
            key={material.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-stone-50"
          >
            {isImage ? (
              <a
                href={material.file_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${material.title} preview`}
                className="block aspect-[4/3] border-b border-stone-200 bg-stone-200 bg-cover bg-center transition hover:opacity-90"
                style={{ backgroundImage: `url("${material.file_url}")` }}
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center border-b border-stone-200 bg-white">
                <div className="flex h-24 w-20 flex-col items-center justify-center rounded-xl border border-stone-300 bg-stone-50 text-center shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    File
                  </span>
                  <span className="mt-2 text-lg font-semibold uppercase text-stone-800">
                    {fileExtension ?? "Doc"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
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
                <span className="break-all normal-case tracking-normal">{material.file_name}</span>
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
            </div>
          </article>
        );
      })}
    </div>
  );
}
