export type GenerationProviderTransportErrorCode =
  | "PROVIDER_CONTRACT_MISMATCH"
  | "DOWNLOAD_REJECTED";

export class GenerationProviderTransportError extends Error {
  readonly code: GenerationProviderTransportErrorCode;

  constructor(code: GenerationProviderTransportErrorCode) {
    super(code);
    this.name = "GenerationProviderTransportError";
    this.code = code;
  }
}

const MARBLE_ORIGIN = "https://api.worldlabs.ai";
const HUNYUAN_ORIGIN = "https://api.ai3d.cloud.tencent.com";
const MARBLE_SAFE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const VISIBLE_ASCII = /^[\x21-\x7e]{1,2048}$/;
const HUNYUAN_COS_BUCKET =
  /^[a-z0-9-]+\.cos\.ap-guangzhou\.tencentcos\.cn$/;

function reject(code: GenerationProviderTransportErrorCode): never {
  throw new GenerationProviderTransportError(code);
}

function exactUrl(origin: string, pathname: string): URL {
  const url = new URL(pathname, origin);
  if (
    url.origin !== origin ||
    url.pathname !== pathname ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    return reject("PROVIDER_CONTRACT_MISMATCH");
  }
  return url;
}

function requireMarbleId(value: string): string {
  if (!MARBLE_SAFE_ID.test(value) || value === "." || value === "..") {
    return reject("PROVIDER_CONTRACT_MISMATCH");
  }
  return value;
}

export function marbleSubmitUrl(): URL {
  return exactUrl(MARBLE_ORIGIN, "/marble/v1/worlds:generate");
}

export function marbleOperationUrl(operationId: string): URL {
  const id = requireMarbleId(operationId);
  return exactUrl(MARBLE_ORIGIN, `/marble/v1/operations/${id}`);
}

export function marbleWorldUrl(worldId: string): URL {
  const id = requireMarbleId(worldId);
  return exactUrl(MARBLE_ORIGIN, `/marble/v1/worlds/${id}`);
}

export function hunyuanSubmitUrl(): URL {
  return exactUrl(HUNYUAN_ORIGIN, "/v1/ai3d/submit");
}

export function hunyuanQueryUrl(): URL {
  return exactUrl(HUNYUAN_ORIGIN, "/v1/ai3d/query");
}

function requireAssetUrl(
  value: string | URL,
  validHostname: (hostname: string) => boolean,
): URL {
  const raw = typeof value === "string" ? value : value.href;
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 4096) {
    return reject("DOWNLOAD_REJECTED");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return reject("DOWNLOAD_REJECTED");
  }
  const authority = raw.match(/^https:\/\/([^/?#]+)/)?.[1];
  if (
    authority === undefined ||
    authority !== url.hostname ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hostname !== url.hostname.toLowerCase() ||
    !validHostname(url.hostname)
  ) {
    return reject("DOWNLOAD_REJECTED");
  }
  return url;
}

export function requireMarbleAssetUrl(value: string | URL): URL {
  return requireAssetUrl(
    value,
    (hostname) => hostname === "cdn.marble.worldlabs.ai",
  );
}

export function requireHunyuanAssetUrl(value: string | URL): URL {
  return requireAssetUrl(
    value,
    (hostname) =>
      hostname === "cos.ap-guangzhou.tencentcos.cn" ||
      HUNYUAN_COS_BUCKET.test(hostname),
  );
}

export type AssetResponseClassification =
  | { readonly kind: "success" }
  | {
      readonly kind: "redirect";
      readonly nextUrl: URL;
      readonly redirectCount: number;
    }
  | { readonly kind: "refresh-required" }
  | { readonly kind: "transient" };

export function classifyAssetResponse(input: {
  readonly status: number;
  readonly locationValues: readonly string[];
  readonly currentUrl: URL;
  readonly redirectCount: number;
  readonly requireUrl: (value: string | URL) => URL;
}): AssetResponseClassification {
  if (
    !Number.isSafeInteger(input.status) ||
    input.status < 100 ||
    input.status > 599 ||
    !Number.isSafeInteger(input.redirectCount) ||
    input.redirectCount < 0 ||
    input.redirectCount > 2 ||
    !Array.isArray(input.locationValues)
  ) {
    return reject("DOWNLOAD_REJECTED");
  }
  if (input.status === 200) {
    if (input.locationValues.length !== 0) return reject("DOWNLOAD_REJECTED");
    return { kind: "success" };
  }
  if (REDIRECT_STATUSES.has(input.status)) {
    if (
      input.redirectCount >= 2 ||
      input.locationValues.length !== 1 ||
      !VISIBLE_ASCII.test(input.locationValues[0] ?? "") ||
      new TextEncoder().encode(input.locationValues[0]).byteLength > 2048
    ) {
      return reject("DOWNLOAD_REJECTED");
    }
    let resolved: URL;
    try {
      resolved = new URL(input.locationValues[0]!, input.currentUrl);
    } catch {
      return reject("DOWNLOAD_REJECTED");
    }
    return {
      kind: "redirect",
      nextUrl: input.requireUrl(resolved),
      redirectCount: input.redirectCount + 1,
    };
  }
  if (input.locationValues.length !== 0) return reject("DOWNLOAD_REJECTED");
  if (input.status === 401 || input.status === 403) {
    return { kind: "refresh-required" };
  }
  if (
    input.status === 408 ||
    input.status === 425 ||
    input.status === 429 ||
    input.status >= 500
  ) {
    return { kind: "transient" };
  }
  return reject("DOWNLOAD_REJECTED");
}
