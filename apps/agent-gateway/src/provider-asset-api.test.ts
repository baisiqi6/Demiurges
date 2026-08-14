import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ManifestAssetEntry } from "@demiurges/world";
import { sha256Hex, validateRegisteredArtifactBytes } from "../../../scripts/provider-artifact-validation";
import { createProviderAssetApi, PROVIDER_ASSET_API_TEST_SEAMS } from "./provider-asset-api";

let cacheRoot = "";

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
    nodes: [{ mesh: 0 }],
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

function fixture(): { entry: ManifestAssetEntry; bytes: Uint8Array } {
  const bytes = createGlbFixture();
  return {
    bytes,
    entry: {
      assetId: "asset:test-registered-glb-v1",
      provider: "test-provider",
      resourceId: "test-resource",
      format: "glb-2.0",
      elementCount: 1,
      byteLength: bytes.byteLength,
      digest: sha256Hex(bytes),
      sourceBounds: { min: [-1, -2, -3], max: [4, 5, 6] },
      distributionPolicy: "unknown-restricted-local",
    },
  };
}

async function writeCache(entry: ManifestAssetEntry, bytes: Uint8Array): Promise<void> {
  const directory = join(cacheRoot, "sha256");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, entry.digest), bytes, { mode: 0o600 });
}

beforeEach(async () => {
  cacheRoot = await mkdtemp(join(tmpdir(), "demiurges-asset-api-"));
});

afterEach(async () => {
  await rm(cacheRoot, { recursive: true, force: true });
});

describe("DH-013 verified same-origin asset route", () => {
  test("closed assetId 命中后从 fd 重验 identity 并返回固定 media/header", async () => {
    const { entry, bytes } = fixture();
    await writeCache(entry, bytes);
    const api = createProviderAssetApi({ cacheRoot, assets: [entry] });

    const response = await api.fetch(new Request(
      `http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`,
    ));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("model/gltf-binary");
    expect(response?.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(response?.headers.get("x-demiurges-asset-id")).toBe(entry.assetId);
    expect(response?.headers.get("x-demiurges-content-sha256")).toBe(entry.digest);
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual(Array.from(bytes));
  });

  test("cache miss、截断、错误 magic 与 symlink 均 fail closed", async () => {
    const { entry, bytes } = fixture();
    const api = createProviderAssetApi({ cacheRoot, assets: [entry] });
    const url = `http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`;
    expect((await api.fetch(new Request(url)))?.status).toBe(404);

    await writeCache(entry, bytes.slice(0, -1));
    expect((await api.fetch(new Request(url)))?.status).toBe(409);

    const corrupted = bytes.slice();
    corrupted[0] ^= 0xff;
    await writeFile(join(cacheRoot, "sha256", entry.digest), corrupted);
    expect((await api.fetch(new Request(url)))?.status).toBe(409);

    await rm(join(cacheRoot, "sha256", entry.digest));
    const external = join(cacheRoot, "external.glb");
    await writeFile(external, bytes);
    await symlink(external, join(cacheRoot, "sha256", entry.digest));
    expect((await api.fetch(new Request(url)))?.status).toBe(409);

    await rm(join(cacheRoot, "sha256", entry.digest));
    const fifo = Bun.spawn(["mkfifo", join(cacheRoot, "sha256", entry.digest)], {
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await fifo.exited).toBe(0);
    const started = performance.now();
    expect((await api.fetch(new Request(url)))?.status).toBe(409);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("traversal、unknown、query、Range、非 GET 与 abort 不会读取 arbitrary path", async () => {
    const { entry } = fixture();
    const api = createProviderAssetApi({ cacheRoot, assets: [entry] });
    expect(PROVIDER_ASSET_API_TEST_SEAMS.exactAssetId("/api/sessions")).toBeUndefined();
    expect(PROVIDER_ASSET_API_TEST_SEAMS.exactAssetId("/api/assets/%2e%2e%2fsecret")).toBe("");
    expect((await api.fetch(new Request("http://127.0.0.1/api/assets/asset%3Aunknown")))?.status).toBe(404);
    expect((await api.fetch(new Request(`http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}?url=hidden`)))?.status).toBe(400);
    expect((await api.fetch(new Request(`http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`, {
      headers: { Range: "bytes=0-10" },
    })))?.status).toBe(416);
    expect((await api.fetch(new Request(`http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`, {
      method: "POST",
    })))?.status).toBe(405);
    const controller = new AbortController();
    controller.abort();
    expect((await api.fetch(new Request(
      `http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`,
      { signal: controller.signal },
    )))?.status).toBe(408);
  });

  test("response 前执行完整 validator，validator failure 不服务 bytes", async () => {
    const { entry, bytes } = fixture();
    await writeCache(entry, bytes);
    let calls = 0;
    const api = createProviderAssetApi({
      cacheRoot,
      assets: [entry],
      validate(candidate, value) {
        calls += 1;
        validateRegisteredArtifactBytes(candidate, value);
        throw new Error("forced-validator-failure");
      },
    });
    const response = await api.fetch(new Request(
      `http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`,
    ));
    expect(calls).toBe(1);
    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({ error: "asset_identity_mismatch" });
  });

  test("固定 deadline 与并发上限约束忽略 signal 的底层读取", async () => {
    const { entry, bytes } = fixture();
    const pending: Array<(value: Uint8Array) => void> = [];
    let reads = 0;
    const api = createProviderAssetApi({
      cacheRoot,
      assets: [entry],
      readDeadlineMs: 20,
      maximumConcurrentReads: 2,
      readArtifact: async () => {
        reads += 1;
        if (reads > 2) return bytes;
        return await new Promise<Uint8Array>((resolve) => pending.push(resolve));
      },
    });
    const request = () => new Request(
      `http://127.0.0.1/api/assets/${encodeURIComponent(entry.assetId)}`,
    );
    const first = api.fetch(request());
    const second = api.fetch(request());
    expect((await api.fetch(request()))?.status).toBe(503);
    expect((await first)?.status).toBe(408);
    expect((await second)?.status).toBe(408);
    expect((await api.fetch(request()))?.status).toBe(503);
    pending.forEach((resolve) => resolve(bytes));
    await Bun.sleep(1);
    expect((await api.fetch(request()))?.status).toBe(200);
  });
});
