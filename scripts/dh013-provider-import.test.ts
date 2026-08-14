import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ManifestAssetEntry } from "../packages/world/src/artifacts/marble-hunyuan-registry";
import {
  PROVIDER_IMPORT_TEST_SEAMS,
  ProviderImportError,
  artifactCachePath,
  importDh013ProviderArtifacts,
} from "./dh013-provider-import";
import { sha256Hex } from "./provider-artifact-validation";

const ORIGIN = "https://hunyuan-prod-1258344699.cos.ap-guangzhou.tencentcos.cn";
const SECRET = "test-secret-never-log";
let cacheRoot = "";

function response(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, {
    status,
    headers: status === 200 ? {
      "content-type": "model/gltf-binary",
      "content-length": String(bytes.byteLength),
    } : undefined,
  });
}

function createGlbFixture(): Uint8Array {
  const positions = [
    [-1, -2, -3], [-1, -2, 6], [-1, 5, -3], [-1, 5, 6],
    [4, -2, -3], [4, -2, 6], [4, 5, -3], [4, 5, 6],
  ] as const;
  const binary = new Uint8Array(positions.length * 12);
  const binaryView = new DataView(binary.buffer);
  positions.forEach((position, index) => position.forEach((component, axis) =>
    binaryView.setFloat32(index * 12 + axis * 4, component, true)));
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, -2, 0.5] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: 8,
      type: "VEC3",
      min: [-1, -2, -3],
      max: [4, 5, 6],
    }],
  });
  const source = new TextEncoder().encode(json);
  const jsonLength = Math.ceil(source.byteLength / 4) * 4;
  const binaryOffset = 20 + jsonLength;
  const bytes = new Uint8Array(binaryOffset + 8 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(source, 20);
  view.setUint32(binaryOffset, binary.byteLength, true);
  view.setUint32(binaryOffset + 4, 0x004e4942, true);
  bytes.set(binary, binaryOffset + 8);
  return bytes;
}

function fixtureEntry() {
  const bytes = createGlbFixture();
  const entry: ManifestAssetEntry = {
    assetId: "asset:hunyuan-rounded-cube-v1",
    provider: "fixture",
    resourceId: "fixture-resource",
    format: "glb-2.0",
    elementCount: 1,
    byteLength: bytes.byteLength,
    digest: sha256Hex(bytes),
    sourceBounds: { min: [0, -4, -2.5], max: [5, 3, 6.5] },
    distributionPolicy: "unknown-restricted-local",
  };
  return {
    bytes,
    entry,
  };
}

beforeEach(async () => {
  cacheRoot = await mkdtemp(join(tmpdir(), "demiurges-dh013-import-"));
});

afterEach(async () => {
  await rm(cacheRoot, { recursive: true, force: true });
});

describe("DH-013 provider importer boundary", () => {
  test("download 不携带 provider credential，验证后以 0600 content-addressed bytes 原子发布", async () => {
    const { bytes, entry } = fixtureEntry();
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      expect(String(input)).toBe(`${ORIGIN}/signed.glb?temporary=1`);
      expect(init?.redirect).toBe("manual");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("wlt-api-key")).toBeNull();
      expect([...headers.values()].join(" ")).not.toContain(SECRET);
      return response(bytes);
    }) as typeof fetch;

    await PROVIDER_IMPORT_TEST_SEAMS.downloadAndPublish(
      `${ORIGIN}/signed.glb?temporary=1`,
      ORIGIN,
      cacheRoot,
      entry,
      new AbortController().signal,
      fetchImpl,
    );
    const target = artifactCachePath(cacheRoot, entry);
    expect(await readFile(target)).toEqual(Buffer.from(bytes));
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    expect(calls).toBe(1);
    expect(await readdir(join(cacheRoot, ".tmp"))).toEqual([]);
  });

  test("signed URL 只刷新一次；首次 403 后成功，receipt 不含 URL/credential", async () => {
    const { bytes, entry } = fixtureEntry();
    let fetchCalls = 0;
    let queryAttempts = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return fetchCalls === 1 ? response(new Uint8Array(), 403) : response(bytes);
    }) as typeof fetch;
    const receipt = await PROVIDER_IMPORT_TEST_SEAMS.importOne(
      entry,
      cacheRoot,
      async () => {
        queryAttempts += 1;
        return `${ORIGIN}/expired.glb`;
      },
      async () => {
        queryAttempts += 1;
        return `${ORIGIN}/refreshed.glb`;
      },
      ORIGIN,
      () => queryAttempts,
      new AbortController().signal,
      fetchImpl,
    );
    expect(receipt).toEqual({
      assetId: entry.assetId,
      digest: entry.digest,
      byteLength: entry.byteLength,
      status: "imported",
      queryAttempts: 2,
      downloadAttempts: 2,
    });
    expect(JSON.stringify(receipt)).not.toContain("https://");
    expect(JSON.stringify(receipt)).not.toContain(SECRET);
  });

  test("matching cache 可离线复用，失败下载不覆盖既有 valid digest bytes", async () => {
    const { bytes, entry } = fixtureEntry();
    const target = artifactCachePath(cacheRoot, entry);
    await mkdir(join(cacheRoot, "sha256"), { recursive: true });
    await writeFile(target, bytes, { mode: 0o600 });
    let fetchCalls = 0;
    const receipt = await PROVIDER_IMPORT_TEST_SEAMS.importOne(
      entry,
      cacheRoot,
      async () => { throw new Error("offline query 不应执行"); },
      async () => { throw new Error("offline refresh 不应执行"); },
      ORIGIN,
      () => 0,
      new AbortController().signal,
      (async () => {
        fetchCalls += 1;
        throw new Error("offline fetch 不应执行");
      }) as typeof fetch,
    );
    expect(receipt.status).toBe("cache-hit");
    expect(fetchCalls).toBe(0);
    expect(await readFile(target)).toEqual(Buffer.from(bytes));
  });

  test("matching bytes 仍必须是 0600 regular file，symlink/宽权限 cache fail closed", async () => {
    const { bytes, entry } = fixtureEntry();
    const directory = join(cacheRoot, "sha256");
    const target = artifactCachePath(cacheRoot, entry);
    await mkdir(directory, { recursive: true });
    await writeFile(target, bytes, { mode: 0o600 });
    expect(await PROVIDER_IMPORT_TEST_SEAMS.readValidCache(cacheRoot, entry)).toBe(true);

    await chmod(target, 0o644);
    await expect(PROVIDER_IMPORT_TEST_SEAMS.readValidCache(cacheRoot, entry))
      .rejects.toMatchObject({ code: "CACHE_CORRUPT" });

    await rm(target);
    const external = join(cacheRoot, "external.glb");
    await writeFile(external, bytes, { mode: 0o600 });
    await symlink(external, target);
    await expect(PROVIDER_IMPORT_TEST_SEAMS.readValidCache(cacheRoot, entry))
      .rejects.toMatchObject({ code: "CACHE_CORRUPT" });

    await rm(target);
    const fifo = Bun.spawn(["mkfifo", target], { stdout: "ignore", stderr: "ignore" });
    expect(await fifo.exited).toBe(0);
    const started = performance.now();
    await expect(PROVIDER_IMPORT_TEST_SEAMS.readValidCache(
      cacheRoot,
      entry,
      AbortSignal.timeout(100),
    )).rejects.toMatchObject({ code: "CACHE_CORRUPT" });
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("wrong host、redirect、streamed oversize 与 identity mismatch 均 fail closed 并清 temp", async () => {
    const { bytes, entry } = fixtureEntry();
    let fetchCalls = 0;
    await expect(PROVIDER_IMPORT_TEST_SEAMS.downloadAndPublish(
      "https://attacker.invalid/file.glb",
      ORIGIN,
      cacheRoot,
      entry,
      new AbortController().signal,
      (async () => { fetchCalls += 1; return response(bytes); }) as typeof fetch,
    )).rejects.toMatchObject({ code: "DOWNLOAD_HOST_REJECTED" });
    expect(fetchCalls).toBe(0);

    await expect(PROVIDER_IMPORT_TEST_SEAMS.downloadAndPublish(
      `${ORIGIN}/redirect.glb`, ORIGIN, cacheRoot, entry,
      new AbortController().signal,
      (async () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } })) as typeof fetch,
    )).rejects.toMatchObject({ code: "DOWNLOAD_REDIRECT" });

    const streamed = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(entry.byteLength + 1));
        controller.close();
      },
    });
    await expect(PROVIDER_IMPORT_TEST_SEAMS.downloadAndPublish(
      `${ORIGIN}/oversize.glb`, ORIGIN, cacheRoot, entry,
      new AbortController().signal,
      (async () => new Response(streamed, { headers: { "content-type": "model/gltf-binary" } })) as typeof fetch,
    )).rejects.toMatchObject({ code: "DOWNLOAD_BUDGET_EXCEEDED" });

    const tampered = bytes.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(PROVIDER_IMPORT_TEST_SEAMS.downloadAndPublish(
      `${ORIGIN}/tampered.glb`, ORIGIN, cacheRoot, entry,
      new AbortController().signal,
      (async () => response(tampered)) as typeof fetch,
    )).rejects.toMatchObject({ code: "ARTIFACT_IDENTITY_MISMATCH" });
    expect(await readdir(join(cacheRoot, ".tmp"))).toEqual([]);
  });

  test("authenticated query exact headers/body，错误只暴露稳定 code 而不回显 secret/body/URL", async () => {
    const { entry } = fixtureEntry();
    const marbleUrl = "https://cdn.marble.worldlabs.ai/world.spz?signature=hidden";
    const colliderUrl = "https://cdn.marble.worldlabs.ai/collider.glb?signature=hidden";
    const marbleFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("api.worldlabs.ai/marble/v1/worlds/");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("wlt-api-key")).toBe(SECRET);
      return Response.json({
        world_id: "7ece758a-aea5-42a0-890d-303d6bbab9b0",
        model: "marble-1.0-draft",
        assets: {
          splats: { spz_urls: { "500k": marbleUrl } },
          mesh: { collider_mesh_url: colliderUrl },
        },
      });
    }) as typeof fetch;
    expect(await PROVIDER_IMPORT_TEST_SEAMS.queryMarble(
      SECRET, entry, new AbortController().signal, marbleFetch,
    )).toEqual({ spz: marbleUrl, collider: colliderUrl });

    const hunyuanUrl = `${ORIGIN}/asset.glb?signature=hidden`;
    const hunyuanFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(SECRET);
      expect(init?.body).toBe(JSON.stringify({ JobId: "1479369951965601792" }));
      return Response.json({ Status: "DONE", ResultFile3Ds: [{ Type: "GLB", Url: hunyuanUrl }] });
    }) as typeof fetch;
    expect(await PROVIDER_IMPORT_TEST_SEAMS.queryHunyuan(
      SECRET, entry, new AbortController().signal, hunyuanFetch,
    )).toBe(hunyuanUrl);

    const hunyuanTextPlainFetch = (async () => new Response(JSON.stringify({
      Response: {
        Status: "DONE",
        ResultFile3Ds: [{ Type: "GLB", Url: hunyuanUrl }],
      },
    }), {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as typeof fetch;
    expect(await PROVIDER_IMPORT_TEST_SEAMS.queryHunyuan(
      SECRET, entry, new AbortController().signal, hunyuanTextPlainFetch,
    )).toBe(hunyuanUrl);

    await expect(PROVIDER_IMPORT_TEST_SEAMS.queryHunyuan(
      SECRET,
      entry,
      new AbortController().signal,
      (async () => new Response("not-json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })) as typeof fetch,
    )).rejects.toMatchObject({ code: "QUERY_RESPONSE_INVALID" });

    const providerBody = `${SECRET} ${hunyuanUrl}`;
    let caught: unknown;
    try {
      await PROVIDER_IMPORT_TEST_SEAMS.queryHunyuan(
        SECRET,
        entry,
        new AbortController().signal,
        (async () => new Response(providerBody, {
          status: 500,
          headers: { "content-type": "text/plain" },
        })) as typeof fetch,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderImportError);
    expect(String(caught)).toContain("QUERY_REJECTED");
    expect(String(caught)).not.toContain(SECRET);
    expect(String(caught)).not.toContain(hunyuanUrl);
  });

  test("query/download body stream rejection 统一脱敏为稳定 public code", async () => {
    const { entry } = fixtureEntry();
    const marker = `${SECRET} signature=dummy-secret ${ORIGIN}/signed.glb?token=dummy`;
    const failedBody = () => new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error(marker));
      },
    });

    let queryError: unknown;
    try {
      await PROVIDER_IMPORT_TEST_SEAMS.queryHunyuan(
        SECRET,
        entry,
        new AbortController().signal,
        (async () => new Response(failedBody(), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
      );
    } catch (error) {
      queryError = error;
    }
    expect(queryError).toBeInstanceOf(ProviderImportError);
    expect(queryError).toMatchObject({ code: "QUERY_REJECTED", stage: "query" });
    expect(String(queryError)).not.toContain(marker);
    expect(String(queryError)).not.toContain("dummy-secret");

    let downloadError: unknown;
    try {
      await PROVIDER_IMPORT_TEST_SEAMS.downloadAndPublish(
        `${ORIGIN}/signed.glb?token=dummy`,
        ORIGIN,
        cacheRoot,
        entry,
        new AbortController().signal,
        (async () => new Response(failedBody(), {
          status: 200,
          headers: { "content-type": "model/gltf-binary" },
        })) as typeof fetch,
      );
    } catch (error) {
      downloadError = error;
    }
    expect(downloadError).toBeInstanceOf(ProviderImportError);
    expect(downloadError).toMatchObject({ code: "DOWNLOAD_REJECTED", stage: "download" });
    expect(String(downloadError)).not.toContain(marker);
    expect(String(downloadError)).not.toContain("dummy-secret");
    expect(await readdir(join(cacheRoot, ".tmp"))).toEqual([]);
  });

  test("共享 deadline 可回收忽略 AbortSignal 的 credential dependency", async () => {
    const started = performance.now();
    await expect(importDh013ProviderArtifacts({
      cacheRoot,
      deadlineMs: 20,
      dependencies: {
        readCredential: async () => await new Promise<string>(() => undefined),
        fetch: (async () => { throw new Error("fetch 不应执行"); }) as typeof fetch,
      },
    })).rejects.toMatchObject({ code: "DEADLINE_EXCEEDED" });
    expect(performance.now() - started).toBeLessThan(500);
  });
});
