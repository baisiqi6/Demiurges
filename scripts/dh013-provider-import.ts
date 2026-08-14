import { constants } from "node:fs";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  MARBLE_HUNYUAN_REGISTRY,
  type ManifestAssetEntry,
} from "../packages/world/src/artifacts/marble-hunyuan-registry";
import { validateRegisteredArtifactBytes } from "./provider-artifact-validation";
import {
  requireOpenedFileIdentity,
  requireStableOpenedFileIdentity,
  VERIFIED_CACHE_OPEN_FLAGS,
} from "./verified-cache-file";

const MARBLE_QUERY_URL =
  "https://api.worldlabs.ai/marble/v1/worlds/7ece758a-aea5-42a0-890d-303d6bbab9b0";
const MARBLE_WORLD_ID = "7ece758a-aea5-42a0-890d-303d6bbab9b0";
const MARBLE_MODEL = "marble-1.0-draft";
const MARBLE_DOWNLOAD_ORIGIN = "https://cdn.marble.worldlabs.ai";
const HUNYUAN_QUERY_URL = "https://api.ai3d.cloud.tencent.com/v1/ai3d/query";
const HUNYUAN_JOB_ID = "1479369951965601792";
const HUNYUAN_DOWNLOAD_ORIGIN =
  "https://hunyuan-prod-1258344699.cos.ap-guangzhou.tencentcos.cn";

export const PROVIDER_IMPORT_TOTAL_DEADLINE_MS = 90_000;
export const PROVIDER_METADATA_MAX_BYTES = 256 * 1024;

const MAX_DOWNLOAD_BYTES: Readonly<Record<ManifestAssetEntry["assetId"], number>> = {
  "asset:marble-world-500k-spz-v1": 16 * 1024 * 1024,
  "asset:marble-world-collider-v1": 32 * 1024 * 1024,
  "asset:hunyuan-rounded-cube-v1": 64 * 1024 * 1024,
};

const KEYCHAIN_LOCATORS = {
  marble: { service: "demiurges-marble-probe", account: "Admin" },
  hunyuan: { service: "demiurges-hunyuan-probe", account: "Admin" },
} as const;

type ImportStage = "credential" | "query" | "download" | "validate" | "publish";

export type ProviderImportCode =
  | "CREDENTIAL_UNAVAILABLE"
  | "DEADLINE_EXCEEDED"
  | "QUERY_REJECTED"
  | "QUERY_REDIRECT"
  | "QUERY_RESPONSE_INVALID"
  | "DOWNLOAD_HOST_REJECTED"
  | "DOWNLOAD_REDIRECT"
  | "SIGNED_URL_EXPIRED"
  | "DOWNLOAD_REJECTED"
  | "DOWNLOAD_TYPE_INVALID"
  | "DOWNLOAD_BUDGET_EXCEEDED"
  | "ARTIFACT_IDENTITY_MISMATCH"
  | "CACHE_CORRUPT"
  | "CACHE_PUBLISH_FAILED";

export class ProviderImportError extends Error {
  readonly code: ProviderImportCode;
  readonly assetId: ManifestAssetEntry["assetId"];
  readonly stage: ImportStage;

  constructor(
    code: ProviderImportCode,
    assetId: ManifestAssetEntry["assetId"],
    stage: ImportStage,
  ) {
    super(`${code}:${assetId}:${stage}`);
    this.name = "ProviderImportError";
    this.code = code;
    this.assetId = assetId;
    this.stage = stage;
  }
}

export interface ProviderImportReceipt {
  readonly assetId: ManifestAssetEntry["assetId"];
  readonly digest: string;
  readonly byteLength: number;
  readonly status: "imported" | "cache-hit";
  readonly queryAttempts: number;
  readonly downloadAttempts: number;
}

export interface ProviderImportDependencies {
  readonly fetch: typeof fetch;
  readonly readCredential: (
    locator: { readonly service: string; readonly account: string },
    signal: AbortSignal,
  ) => Promise<string>;
}

export interface ProviderImportOptions {
  readonly cacheRoot: string;
  readonly deadlineMs?: number;
  readonly dependencies?: Partial<ProviderImportDependencies>;
}

interface MarbleUrls {
  readonly spz: string;
  readonly collider: string;
}

function artifact(
  assetId: ManifestAssetEntry["assetId"],
): ManifestAssetEntry {
  const entry = MARBLE_HUNYUAN_REGISTRY.assets.find((asset) => asset.assetId === assetId);
  if (!entry) throw new Error(`未登记 artifact：${assetId}`);
  return entry;
}

function publicError(
  code: ProviderImportCode,
  entry: ManifestAssetEntry,
  stage: ImportStage,
): ProviderImportError {
  return new ProviderImportError(code, entry.assetId, stage);
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cleanContentType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function raceAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  entry: ManifestAssetEntry,
  stage: ImportStage,
): Promise<T> {
  if (signal.aborted) throw publicError("DEADLINE_EXCEEDED", entry, stage);
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(publicError("DEADLINE_EXCEEDED", entry, stage));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readTransportChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  entry: ManifestAssetEntry,
  stage: "credential" | "query" | "download",
): Promise<ReadableStreamReadResult<Uint8Array>> {
  try {
    return await raceAbort(reader.read(), signal, entry, stage);
  } catch (error) {
    if (error instanceof ProviderImportError) throw error;
    const code: ProviderImportCode = stage === "credential"
      ? "CREDENTIAL_UNAVAILABLE"
      : stage === "query"
        ? "QUERY_REJECTED"
        : "DOWNLOAD_REJECTED";
    throw publicError(code, entry, stage);
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
  entry: ManifestAssetEntry,
  stage: ImportStage,
): Promise<Uint8Array> {
  if (!response.body) throw publicError(
    stage === "query" ? "QUERY_RESPONSE_INVALID" : "DOWNLOAD_REJECTED",
    entry,
    stage,
  );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await readTransportChunk(
        reader,
        signal,
        entry,
        stage === "credential" ? "credential" : stage === "query" ? "query" : "download",
      );
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        throw publicError(
          stage === "query" ? "QUERY_RESPONSE_INVALID" : "DOWNLOAD_BUDGET_EXCEEDED",
          entry,
          stage,
        );
      }
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function queryJson(
  url: string,
  init: RequestInit,
  entry: ManifestAssetEntry,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  acceptedContentTypes: readonly string[] = ["application/json"],
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await raceAbort(
      fetchImpl(url, { ...init, redirect: "manual", signal }),
      signal,
      entry,
      "query",
    );
  } catch (error) {
    if (error instanceof ProviderImportError) throw error;
    throw publicError("QUERY_REJECTED", entry, "query");
  }
  if (response.status >= 300 && response.status < 400) {
    throw publicError("QUERY_REDIRECT", entry, "query");
  }
  if (
    !response.ok ||
    !acceptedContentTypes.includes(cleanContentType(response.headers.get("content-type")))
  ) {
    throw publicError("QUERY_REJECTED", entry, "query");
  }
  const bytes = await readBoundedBody(
    response,
    PROVIDER_METADATA_MAX_BYTES,
    signal,
    entry,
    "query",
  );
  try {
    return plainRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))) ??
      (() => { throw new Error("record"); })();
  } catch {
    throw publicError("QUERY_RESPONSE_INVALID", entry, "query");
  }
}

async function queryMarble(
  credential: string,
  entry: ManifestAssetEntry,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<MarbleUrls> {
  const payload = await queryJson(MARBLE_QUERY_URL, {
    method: "GET",
    headers: { Accept: "application/json", "WLT-Api-Key": credential },
  }, entry, signal, fetchImpl);
  const world = payload;
  const assets = plainRecord(world?.assets);
  const splats = plainRecord(assets?.splats);
  const spzUrls = plainRecord(splats?.spz_urls);
  const mesh = plainRecord(assets?.mesh);
  if (
    world?.world_id !== MARBLE_WORLD_ID ||
    world.model !== MARBLE_MODEL ||
    typeof spzUrls?.["500k"] !== "string" ||
    typeof mesh?.collider_mesh_url !== "string"
  ) {
    throw publicError("QUERY_RESPONSE_INVALID", entry, "query");
  }
  return { spz: spzUrls["500k"], collider: mesh.collider_mesh_url };
}

async function queryHunyuan(
  credential: string,
  entry: ManifestAssetEntry,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const payload = await queryJson(HUNYUAN_QUERY_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: credential,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ JobId: HUNYUAN_JOB_ID }),
  }, entry, signal, fetchImpl, ["application/json", "text/plain"]);
  const result = plainRecord(payload.Response) ?? payload;
  const files = Array.isArray(result.ResultFile3Ds) ? result.ResultFile3Ds : undefined;
  const glbs = files?.filter((value) => plainRecord(value)?.Type === "GLB") ?? [];
  const glb = plainRecord(glbs[0]);
  if (result.Status !== "DONE" || glbs.length !== 1 || typeof glb?.Url !== "string") {
    throw publicError("QUERY_RESPONSE_INVALID", entry, "query");
  }
  return glb.Url;
}

function requireDownloadUrl(
  value: string,
  expectedOrigin: string,
  entry: ManifestAssetEntry,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw publicError("DOWNLOAD_HOST_REJECTED", entry, "download");
  }
  if (
    url.origin !== expectedOrigin ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw publicError("DOWNLOAD_HOST_REJECTED", entry, "download");
  }
  return url;
}

function requireDownloadType(response: Response, entry: ManifestAssetEntry): void {
  const contentType = cleanContentType(response.headers.get("content-type"));
  const accepted = entry.format === "spz-v2"
    ? new Set(["application/octet-stream", "application/gzip", "binary/octet-stream"])
    : new Set(["model/gltf-binary", "application/octet-stream", "binary/octet-stream"]);
  if (!accepted.has(contentType)) throw publicError("DOWNLOAD_TYPE_INVALID", entry, "download");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== entry.byteLength)) {
    throw publicError("DOWNLOAD_BUDGET_EXCEEDED", entry, "download");
  }
}

export function artifactCachePath(cacheRoot: string, entry: ManifestAssetEntry): string {
  if (!/^[a-f0-9]{64}$/.test(entry.digest)) throw new Error("manifest digest 非法");
  return join(cacheRoot, "sha256", entry.digest);
}

async function readValidCache(
  cacheRoot: string,
  entry: ManifestAssetEntry,
  signal: AbortSignal = AbortSignal.timeout(PROVIDER_IMPORT_TOTAL_DEADLINE_MS),
): Promise<boolean> {
  const target = artifactCachePath(cacheRoot, entry);
  try {
    const handle = await raceAbort(open(target, VERIFIED_CACHE_OPEN_FLAGS), signal, entry, "validate");
    try {
      const before = await raceAbort(handle.stat({ bigint: true }), signal, entry, "validate");
      requireOpenedFileIdentity(before, entry.byteLength, 0o600);
      const bytes = await raceAbort(handle.readFile(), signal, entry, "validate");
      const after = await raceAbort(handle.stat({ bigint: true }), signal, entry, "validate");
      requireStableOpenedFileIdentity(before, after, entry.byteLength, 0o600);
      validateRegisteredArtifactBytes(entry, bytes);
      return true;
    } finally {
      await handle.close().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof ProviderImportError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw publicError("CACHE_CORRUPT", entry, "validate");
  }
}

async function downloadAndPublish(
  signedUrl: string,
  expectedOrigin: string,
  cacheRoot: string,
  entry: ManifestAssetEntry,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = requireDownloadUrl(signedUrl, expectedOrigin, entry);
  let response: Response;
  try {
    response = await raceAbort(fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { Accept: entry.format === "spz-v2" ? "application/octet-stream" : "model/gltf-binary" },
    }), signal, entry, "download");
  } catch (error) {
    if (error instanceof ProviderImportError) throw error;
    throw publicError("DOWNLOAD_REJECTED", entry, "download");
  }
  if (response.status >= 300 && response.status < 400) {
    throw publicError("DOWNLOAD_REDIRECT", entry, "download");
  }
  if ([401, 403, 404, 410].includes(response.status)) {
    throw publicError("SIGNED_URL_EXPIRED", entry, "download");
  }
  if (!response.ok || !response.body) throw publicError("DOWNLOAD_REJECTED", entry, "download");
  requireDownloadType(response, entry);

  const tempRoot = join(cacheRoot, ".tmp");
  await mkdir(tempRoot, { recursive: true, mode: 0o700 });
  await chmod(tempRoot, 0o700);
  const tempDirectory = await mkdtemp(join(tempRoot, "candidate-"));
  await chmod(tempDirectory, 0o700);
  const candidate = join(tempDirectory, "artifact.tmp");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(candidate, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const reader = response.body.getReader();
    let total = 0;
    try {
      while (true) {
        const result = await readTransportChunk(reader, signal, entry, "download");
        if (result.done) break;
        total += result.value.byteLength;
        if (total > MAX_DOWNLOAD_BYTES[entry.assetId] || total > entry.byteLength) {
          throw publicError("DOWNLOAD_BUDGET_EXCEEDED", entry, "download");
        }
        await raceAbort(handle.write(result.value), signal, entry, "download");
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    await raceAbort(handle.sync(), signal, entry, "publish");
    await handle.close();
    handle = undefined;
    if (total !== entry.byteLength) {
      throw publicError("ARTIFACT_IDENTITY_MISMATCH", entry, "validate");
    }
    try {
      validateRegisteredArtifactBytes(
        entry,
        await raceAbort(readFile(candidate, { signal }), signal, entry, "validate"),
      );
    } catch {
      throw publicError("ARTIFACT_IDENTITY_MISMATCH", entry, "validate");
    }

    const digestDirectory = join(cacheRoot, "sha256");
    await mkdir(digestDirectory, { recursive: true, mode: 0o700 });
    await chmod(digestDirectory, 0o700);
    const target = artifactCachePath(cacheRoot, entry);
    try {
      await link(candidate, target);
      await unlink(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        if (!await readValidCache(cacheRoot, entry, signal)) {
          throw publicError("CACHE_CORRUPT", entry, "publish");
        }
      } else {
        throw publicError("CACHE_PUBLISH_FAILED", entry, "publish");
      }
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function readKeychainCredential(
  locator: { readonly service: string; readonly account: string },
  signal: AbortSignal,
): Promise<string> {
  const entry = artifact(locator.service.includes("marble")
    ? "asset:marble-world-500k-spz-v1"
    : "asset:hunyuan-rounded-cube-v1");
  const child = Bun.spawn([
    "security",
    "find-generic-password",
    "-w",
    "-s",
    locator.service,
    "-a",
    locator.account,
  ], { stdout: "pipe", stderr: "ignore" });
  const abort = () => child.kill("SIGKILL");
  signal.addEventListener("abort", abort, { once: true });
  try {
    const bytes = await raceAbort(
      readBoundedStream(child.stdout, 4096, signal, entry),
      signal,
      entry,
      "credential",
    );
    const exitCode = await raceAbort(child.exited, signal, entry, "credential");
    const credential = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (exitCode !== 0 || credential.length === 0) {
      throw publicError("CREDENTIAL_UNAVAILABLE", entry, "credential");
    }
    return credential;
  } catch (error) {
    if (error instanceof ProviderImportError && error.code === "DEADLINE_EXCEEDED") {
      throw error;
    }
    throw publicError("CREDENTIAL_UNAVAILABLE", entry, "credential");
  } finally {
    signal.removeEventListener("abort", abort);
    if (signal.aborted) {
      child.kill("SIGKILL");
      await child.exited.catch(() => undefined);
    }
  }
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
  signal: AbortSignal,
  entry: ManifestAssetEntry,
): Promise<Uint8Array> {
  const response = new Response(stream);
  return await readBoundedBody(response, maximumBytes, signal, entry, "credential");
}

async function importOne(
  entry: ManifestAssetEntry,
  cacheRoot: string,
  getSignedUrl: () => Promise<string>,
  refreshSignedUrl: () => Promise<string>,
  expectedOrigin: string,
  queryAttempts: () => number,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderImportReceipt> {
  if (await readValidCache(cacheRoot, entry, signal)) {
    return {
      assetId: entry.assetId,
      digest: entry.digest,
      byteLength: entry.byteLength,
      status: "cache-hit",
      queryAttempts: queryAttempts(),
      downloadAttempts: 0,
    };
  }
  let url = await getSignedUrl();
  let downloadAttempts = 0;
  try {
    downloadAttempts += 1;
    await downloadAndPublish(url, expectedOrigin, cacheRoot, entry, signal, fetchImpl);
  } catch (error) {
    if (!(error instanceof ProviderImportError) || error.code !== "SIGNED_URL_EXPIRED") throw error;
    url = await refreshSignedUrl();
    downloadAttempts += 1;
    await downloadAndPublish(url, expectedOrigin, cacheRoot, entry, signal, fetchImpl);
  }
  return {
    assetId: entry.assetId,
    digest: entry.digest,
    byteLength: entry.byteLength,
    status: "imported",
    queryAttempts: queryAttempts(),
    downloadAttempts,
  };
}

export async function importDh013ProviderArtifacts(
  options: ProviderImportOptions,
): Promise<readonly ProviderImportReceipt[]> {
  const dependencies: ProviderImportDependencies = {
    fetch: options.dependencies?.fetch ?? fetch,
    readCredential: options.dependencies?.readCredential ?? readKeychainCredential,
  };
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.deadlineMs ?? PROVIDER_IMPORT_TOTAL_DEADLINE_MS,
  );
  const spz = artifact("asset:marble-world-500k-spz-v1");
  const collider = artifact("asset:marble-world-collider-v1");
  const hunyuan = artifact("asset:hunyuan-rounded-cube-v1");
  try {
    await mkdir(options.cacheRoot, { recursive: true, mode: 0o700 });
    await chmod(options.cacheRoot, 0o700);
    let marbleCredential: string | undefined;
    const getMarbleCredential = async (): Promise<string> => {
      marbleCredential ??= await raceAbort(
        dependencies.readCredential(KEYCHAIN_LOCATORS.marble, controller.signal),
        controller.signal,
        spz,
        "credential",
      );
      return marbleCredential;
    };
    let hunyuanCredential: string | undefined;
    const getHunyuanCredential = async (): Promise<string> => {
      hunyuanCredential ??= await raceAbort(
        dependencies.readCredential(KEYCHAIN_LOCATORS.hunyuan, controller.signal),
        controller.signal,
        hunyuan,
        "credential",
      );
      return hunyuanCredential;
    };
    let marbleQueries = 0;
    let marbleUrls: MarbleUrls | undefined;
    const queryMarbleOnce = async (): Promise<MarbleUrls> => {
      if (marbleQueries >= 2) throw publicError("SIGNED_URL_EXPIRED", spz, "download");
      marbleQueries += 1;
      marbleUrls = await queryMarble(
        await getMarbleCredential(),
        spz,
        controller.signal,
        dependencies.fetch,
      );
      return marbleUrls;
    };
    const currentMarble = async (): Promise<MarbleUrls> => marbleUrls ?? queryMarbleOnce();

    let hunyuanQueries = 0;
    let hunyuanUrl: string | undefined;
    const queryHunyuanOnce = async (): Promise<string> => {
      if (hunyuanQueries >= 2) throw publicError("SIGNED_URL_EXPIRED", hunyuan, "download");
      hunyuanQueries += 1;
      hunyuanUrl = await queryHunyuan(
        await getHunyuanCredential(),
        hunyuan,
        controller.signal,
        dependencies.fetch,
      );
      return hunyuanUrl;
    };

    const receipts: ProviderImportReceipt[] = [];
    receipts.push(await importOne(
      spz,
      options.cacheRoot,
      async () => (await currentMarble()).spz,
      async () => (await queryMarbleOnce()).spz,
      MARBLE_DOWNLOAD_ORIGIN,
      () => marbleQueries,
      controller.signal,
      dependencies.fetch,
    ));
    receipts.push(await importOne(
      collider,
      options.cacheRoot,
      async () => (await currentMarble()).collider,
      async () => (await queryMarbleOnce()).collider,
      MARBLE_DOWNLOAD_ORIGIN,
      () => marbleQueries,
      controller.signal,
      dependencies.fetch,
    ));
    receipts.push(await importOne(
      hunyuan,
      options.cacheRoot,
      async () => hunyuanUrl ?? queryHunyuanOnce(),
      queryHunyuanOnce,
      HUNYUAN_DOWNLOAD_ORIGIN,
      () => hunyuanQueries,
      controller.signal,
      dependencies.fetch,
    ));
    return Object.freeze(receipts.map((receipt) => Object.freeze(receipt)));
  } finally {
    clearTimeout(timer);
  }
}

export async function writeSanitizedImportReceipt(
  cacheRoot: string,
  receipts: readonly ProviderImportReceipt[],
): Promise<void> {
  const receiptDirectory = join(cacheRoot, "receipts");
  await mkdir(receiptDirectory, { recursive: true, mode: 0o700 });
  await chmod(receiptDirectory, 0o700);
  const temp = join(receiptDirectory, `DH-013-${process.pid}.tmp`);
  const target = join(receiptDirectory, "DH-013.json");
  try {
    await writeFile(temp, `${JSON.stringify({ schemaVersion: 1, receipts }, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, target);
    await chmod(target, 0o600);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

export const PROVIDER_IMPORT_TEST_SEAMS = Object.freeze({
  downloadAndPublish,
  importOne,
  queryHunyuan,
  queryMarble,
  readValidCache,
});
