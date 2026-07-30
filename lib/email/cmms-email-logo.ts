import { readFile } from "node:fs/promises";
import path from "node:path";

export const CMMS_EMAIL_LOGO_CONTENT_ID = "cmms-logo";
export const CMMS_EMAIL_LOGO_FILENAME = "cmms-logo.png";
export const CMMS_EMAIL_LOGO_SRC = `cid:${CMMS_EMAIL_LOGO_CONTENT_ID}`;

export type CmmsEmailLogoAsset = {
  attachment: {
    filename: typeof CMMS_EMAIL_LOGO_FILENAME;
    content: Buffer;
    contentType: "image/png";
    contentId: typeof CMMS_EMAIL_LOGO_CONTENT_ID;
  };
  src: typeof CMMS_EMAIL_LOGO_SRC;
};

type LogoReader = (filePath: string) => Promise<Buffer>;

let cachedLogoAsset: Promise<CmmsEmailLogoAsset | null> | null = null;

function safeLogoLoadError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.name : "UnknownError";
}

async function readCmmsEmailLogo(readLogo: LogoReader): Promise<CmmsEmailLogoAsset | null> {
  try {
    const content = await readLogo(path.join(process.cwd(), "public", CMMS_EMAIL_LOGO_FILENAME));
    return {
      attachment: {
        filename: CMMS_EMAIL_LOGO_FILENAME,
        content,
        contentType: "image/png",
        contentId: CMMS_EMAIL_LOGO_CONTENT_ID,
      },
      src: CMMS_EMAIL_LOGO_SRC,
    };
  } catch (error) {
    console.warn("CMMS email logo could not be loaded; using a text-only header.", {
      category: safeLogoLoadError(error),
    });
    return null;
  }
}

export function loadCmmsEmailLogoAsset(readLogo: LogoReader = readFile) {
  if (readLogo !== readFile) {
    return readCmmsEmailLogo(readLogo);
  }
  cachedLogoAsset ??= readCmmsEmailLogo(readFile);
  return cachedLogoAsset;
}
