import { open } from "node:fs/promises";
import { join } from "node:path";

import {
  MARBLE_HUNYUAN_REGISTRY,
  type ManifestAssetEntry,
} from "@demiurges/world";

import { validateRegisteredArtifactBytes } from "../../../scripts/provider-artifact-validation";
import {
  requireOpenedFileIdentity,
  requireStableOpenedFileIdentity,
  VERIFIED_CACHE_OPEN_FLAGS,
} from "../../../scripts/verified-cache-file";

type ArtifactValidator = (
  entry: ManifestAssetEntry,
  bytes: Uint8Array,
) => unknown;

export interface ProviderAssetApiOptions {
  readonly cacheRoot: string;
  readonly assets?: readonly ManifestAssetEntry[];
  readonly validate?: ArtifactValidator;
  readonly readDeadlineMs?: number;
  readonly maximumConcurrentReads?: number;
  readonly readArtifact?: (
    entry: ManifestAssetEntry,
    signal: AbortSignal,
  ) => Promise<Uint8Array>;
}

const ASSET_ROUTE_PREFIX = "/api/assets/";

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function mediaType(entry: ManifestAssetEntry): string {
  return entry.format === "spz-v2"
    ? "application/octet-stream"
    : "model/gltf-binary";
}

function exactAssetId(pathname: string): string | undefined {
  if (!pathname.startsWith(ASSET_ROUTE_PREFIX)) return undefined;
  const encoded = pathname.slice(ASSET_ROUTE_PREFIX.length);
  if (encoded.length === 0 || encoded.includes("/")) return "";
  try {
    const decoded = decodeURIComponent(encoded);
    return decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")
      ? ""
      : decoded;
  } catch {
    return "";
  }
}

async function readExactArtifact(
  cacheRoot: string,
  entry: ManifestAssetEntry,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  const artifactPath = join(cacheRoot, "sha256", entry.digest);
  const handle = await open(artifactPath, VERIFIED_CACHE_OPEN_FLAGS);
  try {
    const before = await handle.stat({ bigint: true });
    requireOpenedFileIdentity(before, entry.byteLength);
    const bytes = new Uint8Array(entry.byteLength);
    let offset = 0;
    while (offset < bytes.byteLength) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        Math.min(256 * 1024, bytes.byteLength - offset),
        offset,
      );
      if (bytesRead === 0) throw new Error("identity");
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    requireStableOpenedFileIdentity(before, after, entry.byteLength);
    return bytes;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function createProviderAssetApi(
  options: ProviderAssetApiOptions,
): { readonly fetch: (request: Request) => Promise<Response | undefined> } {
  const assets = options.assets ?? MARBLE_HUNYUAN_REGISTRY.assets;
  const validate = options.validate ?? validateRegisteredArtifactBytes;
  const readDeadlineMs = options.readDeadlineMs ?? 10_000;
  const maximumConcurrentReads = options.maximumConcurrentReads ?? 4;
  if (!Number.isFinite(readDeadlineMs) || readDeadlineMs <= 0) {
    throw new Error("asset read deadline 必须为正有限毫秒数");
  }
  if (!Number.isSafeInteger(maximumConcurrentReads) || maximumConcurrentReads < 1) {
    throw new Error("asset concurrent read 上限必须为正整数");
  }
  const readArtifact = options.readArtifact ?? ((entry, signal) =>
    readExactArtifact(options.cacheRoot, entry, signal));
  const byId = new Map(assets.map((entry) => [entry.assetId, entry] as const));
  let activeReads = 0;

  return Object.freeze({
    async fetch(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      const assetId = exactAssetId(url.pathname);
      if (assetId === undefined) return undefined;
      if (request.method !== "GET") return errorResponse(405, "method_not_allowed");
      if (url.search !== "") return errorResponse(400, "asset_query_not_allowed");
      if (request.headers.has("range")) return errorResponse(416, "range_not_supported");
      const entry = byId.get(assetId as ManifestAssetEntry["assetId"]);
      if (!entry) return errorResponse(404, "asset_not_registered");
      if (activeReads >= maximumConcurrentReads) {
        return errorResponse(503, "asset_read_capacity_reached");
      }

      activeReads += 1;
      let releasePendingRead: (() => void) | undefined;
      try {
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(readDeadlineMs),
        ]);
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          activeReads -= 1;
        };
        releasePendingRead = release;
        const pendingRead = Promise.resolve().then(() => readArtifact(entry, signal));
        pendingRead.then(release, release);
        const bytes = await raceAbort(pendingRead, signal);
        validate(entry, bytes);
        if (request.signal.aborted) return errorResponse(408, "asset_request_aborted");
        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": mediaType(entry),
            "content-length": String(entry.byteLength),
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "x-demiurges-asset-id": entry.assetId,
            "x-demiurges-content-sha256": entry.digest,
          },
        });
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          (typeof error === "object" && error !== null && "name" in error &&
            error.name === "AbortError")
        ) {
          return errorResponse(408, "asset_request_aborted");
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return errorResponse(404, "asset_not_imported");
        }
        return errorResponse(409, "asset_identity_mismatch");
      } finally {
        // read promise 自己持有并发 slot，只有底层真正 settle 后才释放。
        // 若在创建 promise 前同步失败，才由此处兜底释放。
        if (!releasePendingRead) activeReads -= 1;
      }
    },
  });
}

export const PROVIDER_ASSET_API_TEST_SEAMS = Object.freeze({ exactAssetId });
