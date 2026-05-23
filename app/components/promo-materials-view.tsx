import type { PromoMaterial } from "@/lib/types";

const imageFileExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const videoFileExtensions = new Set(["mp4", "mov", "webm"]);
const documentFileExtensions = new Set(["pdf", "doc", "docx"]);

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

export function getPromoMaterialGroup(
  material: Pick<PromoMaterial, "file_mime_type" | "file_name">,
): "graphics" | "videos" | "documents" | "other" {
  const mimeType = material.file_mime_type?.toLowerCase() ?? "";
  const extension = getPromoFileExtension(material.file_name);

  if (mimeType.startsWith("image/")) {
    return "graphics";
  }

  if (mimeType.startsWith("video/")) {
    return "videos";
  }

  if (
    mimeType === "application/pdf" ||
    mimeType.includes("wordprocessingml") ||
    mimeType === "application/msword"
  ) {
    return "documents";
  }

  if (extension) {
    if (imageFileExtensions.has(extension)) {
      return "graphics";
    }

    if (videoFileExtensions.has(extension)) {
      return "videos";
    }

    if (documentFileExtensions.has(extension)) {
      return "documents";
    }
  }

  return "other";
}

export function formatPromoMaterialCategory(category: string | null | undefined) {
  switch (category) {
    case "flyer":
      return "Flyer";
    case "social_graphic":
      return "Social Graphic";
    case "sponsor_graphic":
      return "Sponsor Graphic";
    case "poster":
      return "Poster";
    case "video":
      return "Video";
    case "audio_promo":
      return "Audio Promo";
    case "printable":
      return "Printable";
    case "logo_branding":
    case "logo":
      return "Logo/Branding";
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
      <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.10)] bg-[#111111] px-4 py-8 text-sm text-[#b8b8b8]">
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
            className="flex flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#161616]"
          >
            {isImage ? (
              <a
                href={material.file_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${material.title} preview`}
                className="flex h-56 items-center justify-center border-b border-[rgba(255,255,255,0.08)] bg-[#0d0d0d] p-4 transition hover:opacity-90"
              >
                <img
                  src={material.file_url}
                  alt={material.title}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </a>
            ) : (
              <div className="flex h-56 items-center justify-center border-b border-[rgba(255,255,255,0.08)] bg-[#111111]">
                <div className="flex h-24 w-20 flex-col items-center justify-center rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] text-center shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b8b8b8]">
                    File
                  </span>
                  <span className="mt-2 text-lg font-semibold uppercase text-[#f5f5f5]">
                    {fileExtension ?? "Doc"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[rgba(200,155,60,0.24)] bg-[rgba(200,155,60,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#f1dfb7]">
                  {formatPromoMaterialCategory(material.category)}
                </span>
                {material.file_mime_type ? (
                  <span className="rounded-full bg-[#1f1f1f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#b8b8b8]">
                    {material.file_mime_type.split("/").pop() || "File"}
                  </span>
                ) : null}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[#f5f5f5]">{material.title}</h3>
                {material.description?.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#b8b8b8]">
                    {material.description}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#b8b8b8]">
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
              className="mt-auto flex min-h-11 items-center justify-center rounded-xl border border-[rgba(200,155,60,0.28)] bg-[#c89b3c] px-4 py-2.5 text-center text-sm font-semibold text-[#080808] transition hover:bg-[#d6ad4a]"
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
