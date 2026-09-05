import { describe, expect, test } from "bun:test";

import {
  decodeGeneratedArtifactList,
  GeneratedArtifactsClient,
  generatedArtifactDownloadHref,
} from "./generated-artifacts-client";

const generationId = `generation:sha256:${"a".repeat(64)}`;
const marbleAssetId = `asset:generated-sha256-${"b".repeat(64)}`;
const colliderAssetId = `asset:generated-sha256-${"c".repeat(64)}`;
const hunyuanGenerationId = `generation:sha256:${"d".repeat(64)}`;
const hunyuanAssetId = `asset:generated-sha256-${"e".repeat(64)}`;

function member(assetId: string, role: "world-spz-500k" | "world-collider-glb" | "object-glb", format: "spz-v2" | "glb-2.0") {
  return {
    assetId,
    role,
    format,
    contentDigest: assetId.slice("asset:generated-sha256-".length),
    byteLength: 32,
    elementCount: 7,
    sourceBounds: { min: [-1, -2, -3], max: [1, 2, 3] },
  };
}

const marbleSet = {
  generationId,
  provider: "worldlabs-marble-v1",
  artifactSetDigest: "f".repeat(64),
  members: [
    member(marbleAssetId, "world-spz-500k", "spz-v2"),
    member(colliderAssetId, "world-collider-glb", "glb-2.0"),
  ],
};

const hunyuanSet = {
  generationId: hunyuanGenerationId,
  provider: "hunyuan-ai3d-v1",
  artifactSetDigest: "0".repeat(64),
  members: [member(hunyuanAssetId, "object-glb", "glb-2.0")],
};

describe("Generated Artifacts Studio client", () => {
  test("只读取 exact safe list，并接受 empty、Marble 与 Hunyuan 的完整有序集合", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const client = new GeneratedArtifactsClient(async (input, init) => {
      calls.push({ input, init });
      return Response.json({ schemaVersion: 1, sets: [marbleSet, hunyuanSet] });
    });

    const result = await client.refresh();

    expect(result).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/api/artifacts");
    expect(calls[0]?.init).toEqual({ signal: expect.any(AbortSignal) });
    await expect(new GeneratedArtifactsClient(async () => Response.json({ schemaVersion: 1, sets: [] })).refresh())
      .resolves.toEqual([]);
  });

  test("未知 key、错误 schema/provider/role-format/cardinality/identifier/digest/bounds 都 fail closed", async () => {
    const malformed = [
      { schemaVersion: 2, sets: [] },
      { schemaVersion: 1, sets: [{ ...marbleSet, provider: "unknown" }] },
      { schemaVersion: 1, sets: [{ ...marbleSet, members: [member(marbleAssetId, "world-spz-500k", "glb-2.0"), marbleSet.members[1]] }] },
      { schemaVersion: 1, sets: [{ ...marbleSet, members: [marbleSet.members[0]] }] },
      { schemaVersion: 1, sets: [{ ...marbleSet, generationId: "generation:unsafe" }] },
      { schemaVersion: 1, sets: [{ ...marbleSet, members: [{ ...marbleSet.members[0], contentDigest: "0".repeat(64) }, marbleSet.members[1]] }] },
      { schemaVersion: 1, sets: [{ ...marbleSet, members: [{ ...marbleSet.members[0], sourceBounds: { min: [0, 0, 0], max: [0, 1, 1] } }, marbleSet.members[1]] }] },
      { schemaVersion: 1, sets: [], unexpected: true },
    ];
    for (const body of malformed) {
      await expect(new GeneratedArtifactsClient(async () => Response.json(body)).refresh())
        .rejects.toThrow("资产列表响应无效");
    }
    await expect(new GeneratedArtifactsClient(async () => Response.json({ schemaVersion: 1, sets: [] }, { status: 201 })).refresh())
      .rejects.toThrow("暂时无法加载已验证资产");
    expect(() => decodeGeneratedArtifactList({
      schemaVersion: 1,
      sets: [marbleSet, { ...hunyuanSet, generationId }],
    })).toThrow("资产列表响应无效");
    expect(() => decodeGeneratedArtifactList({
      schemaVersion: 1,
      sets: [marbleSet, {
        ...hunyuanSet,
        members: [member(colliderAssetId, "object-glb", "glb-2.0")],
      }],
    })).not.toThrow();
  });

  test("409、503 与其他失败仅公开稳定 Studio copy，不泄露 response body", async () => {
    const cases = [
      [409, { code: "GENERATION_RECOVERY_REQUIRED" }, "已验证资产暂不可读取"],
      [503, { code: "DATA_ROOT_UNAVAILABLE" }, "资产目录暂不可用"],
      [500, { code: "SECRET_PROVIDER_TRACE" }, "暂时无法加载已验证资产"],
    ] as const;
    for (const [status, body, expected] of cases) {
      await expect(new GeneratedArtifactsClient(async () => Response.json(body, { status })).refresh())
        .rejects.toThrow(expected);
    }
  });

  test("refresh 取消旧请求，迟到的旧响应不能覆盖最新集合，dispose 也会 abort", async () => {
    const pending: Array<{ signal: AbortSignal; resolve(response: Response): void }> = [];
    const client = new GeneratedArtifactsClient((_input, init) => new Promise<Response>((resolve) => {
      pending.push({ signal: init!.signal as AbortSignal, resolve });
    }));
    const first = client.refresh();
    const second = client.refresh();
    expect(pending[0]?.signal.aborted).toBe(true);
    pending[1]!.resolve(Response.json({ schemaVersion: 1, sets: [hunyuanSet] }));
    pending[0]!.resolve(Response.json({ schemaVersion: 1, sets: [marbleSet] }));
    expect(await second).toEqual(expect.arrayContaining([expect.objectContaining({ generationId: hunyuanGenerationId })]));
    expect(await first).toBeUndefined();

    const third = client.refresh();
    client.dispose();
    expect(pending[2]?.signal.aborted).toBe(true);
    pending[2]!.resolve(Response.json({ schemaVersion: 1, sets: [marbleSet] }));
    expect(await third).toBeUndefined();
  });

  test("download href 只由 safe identifiers percent-encode 构成，不读取 member bytes", () => {
    expect(generatedArtifactDownloadHref("generation:sha256:a/b?c", "asset:generated-sha256-d/e?f"))
      .toBe("/api/artifacts/generation%3Asha256%3Aa%2Fb%3Fc/asset%3Agenerated-sha256-d%2Fe%3Ff");
  });
});
