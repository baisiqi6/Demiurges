import { describe, expect, test } from "bun:test";

import {
  GeneratedArtifactReaderError,
  type GeneratedArtifactSetSummaryV1,
} from "@demiurges/world-project";

import { createGeneratedArtifactApi, GENERATED_ARTIFACT_API_TEST_SEAMS } from "./generated-artifact-api";

const marbleGenerationId = `generation:sha256:${"a".repeat(64)}` as const;
const hunyuanGenerationId = `generation:sha256:${"b".repeat(64)}` as const;
const spzAssetId = `asset:generated-sha256-${"c".repeat(64)}` as const;
const glbAssetId = `asset:generated-sha256-${"d".repeat(64)}` as const;

const sets: readonly GeneratedArtifactSetSummaryV1[] = [{
  generationId: marbleGenerationId,
  provider: "worldlabs-marble-v1",
  artifactSetDigest: "e".repeat(64),
  members: [{
    assetId: spzAssetId,
    role: "world-spz-500k",
    format: "spz-v2",
    contentDigest: "f".repeat(64),
    byteLength: 3,
    elementCount: 1,
    sourceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  }, {
    assetId: glbAssetId,
    role: "world-collider-glb",
    format: "glb-2.0",
    contentDigest: "1".repeat(64),
    byteLength: 4,
    elementCount: 1,
    sourceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  }],
}, {
  generationId: hunyuanGenerationId,
  provider: "hunyuan-ai3d-v1",
  artifactSetDigest: "2".repeat(64),
  members: [{
    assetId: `asset:generated-sha256-${"3".repeat(64)}`,
    role: "object-glb",
    format: "glb-2.0",
    contentDigest: "4".repeat(64),
    byteLength: 5,
    elementCount: 1,
    sourceBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  }],
}];

function reader(overrides: Partial<{
  list(): readonly GeneratedArtifactSetSummaryV1[];
  read(generationId: string, assetId: string): Uint8Array;
}> = {}) {
  return {
    list: () => sets,
    read(generationId: string, assetId: string) {
      if (generationId !== marbleGenerationId || assetId === glbAssetId) {
        throw new GeneratedArtifactReaderError("GENERATED_ARTIFACT_NOT_FOUND");
      }
      return new Uint8Array([1, 2, 3]);
    },
    ...overrides,
  };
}

describe("DH-017 generated Artifact Gateway API", () => {
  test("list 与 exact member read 只委托 package reader，并返回 safe summary/bytes headers", async () => {
    let listed = 0;
    let reads = 0;
    const api = createGeneratedArtifactApi({
      reader: reader({
        list() {
          listed += 1;
          return sets;
        },
        read(generationId, assetId) {
          reads += 1;
          return reader().read(generationId, assetId);
        },
      }),
    });
    const listedResponse = await api.fetch(new Request("http://local/api/artifacts"));
    expect(listedResponse?.status).toBe(200);
    expect(await listedResponse?.json()).toEqual({ schemaVersion: 1, sets });

    const response = await api.fetch(new Request(
      `http://local/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}`,
    ));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/octet-stream");
    expect(response?.headers.get("content-length")).toBe("3");
    expect(response?.headers.get("x-demiurges-generation-id")).toBe(marbleGenerationId);
    expect(response?.headers.get("x-demiurges-asset-id")).toBe(spzAssetId);
    expect(response?.headers.get("x-demiurges-content-sha256")).toBe("f".repeat(64));
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(listed).toBe(3);
    expect(reads).toBe(1);
  });

  test("empty/unavailable/recovery/not-found 都映射为有限 public response", async () => {
    const empty = createGeneratedArtifactApi({ reader: reader({ list: () => [] }) });
    expect(await (await empty.fetch(new Request("http://local/api/artifacts")))?.json()).toEqual({
      schemaVersion: 1,
      sets: [],
    });
    const unavailable = createGeneratedArtifactApi({});
    expect([ (await unavailable.fetch(new Request("http://local/api/artifacts")))?.status,
      await (await unavailable.fetch(new Request("http://local/api/artifacts")))?.json(),
    ]).toEqual([503, { code: "DATA_ROOT_UNAVAILABLE" }]);
    const recovering = createGeneratedArtifactApi({
      reader: reader({ list: () => { throw new GeneratedArtifactReaderError("GENERATION_RECOVERY_REQUIRED"); } }),
    });
    const recovery = await recovering.fetch(new Request("http://local/api/artifacts"));
    expect([recovery?.status, await recovery?.json()]).toEqual([409, { code: "GENERATION_RECOVERY_REQUIRED" }]);
    const unknown = await empty.fetch(new Request(
      `http://local/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}`,
    ));
    expect([unknown?.status, await unknown?.json()]).toEqual([404, { code: "GENERATED_ARTIFACT_NOT_FOUND" }]);
  });

  test("malformed path、query、Range、method 与 cross-set member 都在 dynamic read 前拒绝", async () => {
    let reads = 0;
    const api = createGeneratedArtifactApi({ reader: reader({ read() { reads += 1; return new Uint8Array([1]); } }) });
    const paths = [
      "/api/artifacts/%E0%A4%A/asset",
      `/api/artifacts/${encodeURIComponent(marbleGenerationId)}/%2F`,
      `/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}/extra`,
      `/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}?unexpected=1`,
    ];
    for (const path of paths) {
      const response = await api.fetch(new Request(`http://local${path}`));
      expect([response?.status, await response?.json()]).toEqual([400, { code: "INVALID_REQUEST" }]);
    }
    const range = await api.fetch(new Request(`http://local/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}`, {
      headers: { range: "bytes=0-1" },
    }));
    expect([range?.status, await range?.json()]).toEqual([416, { code: "RANGE_NOT_SUPPORTED" }]);
    const post = await api.fetch(new Request("http://local/api/artifacts", { method: "POST" }));
    expect([post?.status, await post?.json()]).toEqual([405, { code: "METHOD_NOT_ALLOWED" }]);
    const crossSet = await api.fetch(new Request(
      `http://local/api/artifacts/${encodeURIComponent(hunyuanGenerationId)}/${encodeURIComponent(spzAssetId)}`,
    ));
    expect([crossSet?.status, await crossSet?.json()]).toEqual([404, { code: "GENERATED_ARTIFACT_NOT_FOUND" }]);
    expect(reads).toBe(0);
    expect(GENERATED_ARTIFACT_API_TEST_SEAMS.decodePathSegments("/api/assets/test")).toBeUndefined();
  });

  test("pre/post abort 和 summary drift 都不会 return bytes", async () => {
    const preAbort = new AbortController();
    preAbort.abort();
    const api = createGeneratedArtifactApi({ reader: reader() });
    const pre = await api.fetch(new Request("http://local/api/artifacts", { signal: preAbort.signal }));
    expect([pre?.status, await pre?.json()]).toEqual([408, { code: "REQUEST_ABORTED" }]);

    const postAbort = new AbortController();
    const aborted = createGeneratedArtifactApi({
      reader: reader({ read() { postAbort.abort(); return new Uint8Array([1, 2, 3]); } }),
    });
    const post = await aborted.fetch(new Request(
      `http://local/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}`,
      { signal: postAbort.signal },
    ));
    expect([post?.status, await post?.json()]).toEqual([408, { code: "REQUEST_ABORTED" }]);

    let calls = 0;
    const drifted = createGeneratedArtifactApi({
      reader: reader({ list() { return calls++ === 0 ? sets : []; } }),
    });
    const drift = await drifted.fetch(new Request(
      `http://local/api/artifacts/${encodeURIComponent(marbleGenerationId)}/${encodeURIComponent(spzAssetId)}`,
    ));
    expect([drift?.status, await drift?.json()]).toEqual([409, { code: "GENERATION_RECOVERY_REQUIRED" }]);
  });
});
