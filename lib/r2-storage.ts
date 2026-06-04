import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

const r2TestPrefix = "stageflow-r2-test/";
const awsAlgorithm = "AWS4-HMAC-SHA256";
const awsService = "s3";
const awsRegion = "auto";

export type R2TestFile = {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  url: string;
};

type R2Config = {
  accountId: string;
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function getRequiredEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing required R2 environment variable: ${name}`);
  }

  return value.trim();
}

function getR2Config(): R2Config {
  return {
    accountId: getRequiredEnv("R2_ACCOUNT_ID"),
    bucketName: getRequiredEnv("R2_BUCKET_NAME"),
    endpoint: getRequiredEnv("R2_ENDPOINT").replace(/\/+$/, ""),
    accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeR2Key(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildCanonicalQuery(searchParams: URLSearchParams) {
  return [...searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key).replace(/%20/g, "%20")}` +
        `=${encodeURIComponent(value).replace(/%20/g, "%20")}`,
    )
    .join("&");
}

async function signedR2Request({
  method,
  key,
  searchParams,
  body,
  contentType,
}: {
  method: "GET" | "PUT" | "DELETE";
  key?: string;
  searchParams?: URLSearchParams;
  body?: Buffer;
  contentType?: string;
}) {
  const config = getR2Config();
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const endpointUrl = new URL(config.endpoint);
  const canonicalUri = key
    ? `/${encodeURIComponent(config.bucketName)}/${encodeR2Key(key)}`
    : `/${encodeURIComponent(config.bucketName)}`;
  const query = searchParams ?? new URLSearchParams();
  const canonicalQueryString = buildCanonicalQuery(query);
  const payloadHash = sha256Hex(body ?? "");
  const host = endpointUrl.host;

  const headers = new Headers();
  headers.set("host", host);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);

  if (contentType) {
    headers.set("content-type", contentType);
  }

  const canonicalHeaders = [...headers.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([headerKey, headerValue]) => `${headerKey}:${headerValue.trim()}\n`)
    .join("");
  const signedHeaders = [...headers.keys()].sort().join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${awsRegion}/${awsService}/aws4_request`;
  const stringToSign = [
    awsAlgorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), awsRegion), awsService),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  headers.set(
    "authorization",
    `${awsAlgorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );

  const requestUrl = `${config.endpoint}${canonicalUri}${canonicalQueryString ? `?${canonicalQueryString}` : ""}`;
  return fetch(requestUrl, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
    cache: "no-store",
  });
}

function parseXmlTagValues(xml: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}>(.*?)</${tagName}>`, "gs");
  return [...xml.matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildPublicTestUrl(key: string) {
  const { endpoint, bucketName } = getR2Config();
  return `${endpoint}/${encodeURIComponent(bucketName)}/${encodeR2Key(key)}`;
}

function normalizeTestKey(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return `${r2TestPrefix}${Date.now()}-${randomUUID()}-${safeName || "upload.bin"}`;
}

export async function listR2TestFiles() {
  const response = await signedR2Request({
    method: "GET",
    searchParams: new URLSearchParams({
      "list-type": "2",
      prefix: r2TestPrefix,
    }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`R2 list failed (${response.status}): ${bodyText}`);
  }

  const contents = [...bodyText.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => match[1] ?? "");
  const files: R2TestFile[] = contents.map((content) => {
    const key = decodeXmlEntities(parseXmlTagValues(content, "Key")[0] ?? "");
    const size = Number(parseXmlTagValues(content, "Size")[0] ?? "0");
    const lastModified = parseXmlTagValues(content, "LastModified")[0] ?? null;

    return {
      key,
      name: key.slice(r2TestPrefix.length),
      size: Number.isFinite(size) ? size : 0,
      lastModified,
      url: buildPublicTestUrl(key),
    };
  });

  return files.sort((left, right) => (right.lastModified ?? "").localeCompare(left.lastModified ?? ""));
}

export async function uploadR2TestFile(file: File) {
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const key = normalizeTestKey(file.name);
  const response = await signedR2Request({
    method: "PUT",
    key,
    body: fileBuffer,
    contentType: file.type || "application/octet-stream",
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`R2 upload failed (${response.status}): ${bodyText}`);
  }

  return {
    key,
    name: key.slice(r2TestPrefix.length),
    size: file.size,
    lastModified: new Date().toISOString(),
    url: buildPublicTestUrl(key),
  } satisfies R2TestFile;
}

export async function deleteR2TestFile(key: string) {
  if (!key.startsWith(r2TestPrefix)) {
    throw new Error("Only files inside the R2 test prefix can be deleted from this tool.");
  }

  const response = await signedR2Request({
    method: "DELETE",
    key,
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`R2 delete failed (${response.status}): ${bodyText}`);
  }
}

export function getR2TestConfigSummary() {
  const config = getR2Config();

  return {
    accountId: config.accountId,
    bucketName: config.bucketName,
    endpoint: config.endpoint,
    testPrefix: r2TestPrefix,
  };
}
