import { describe, expect, test } from "bun:test";
import {
  canonicalJsonBytes,
  createInitialSnapshot,
  createMarbleHunyuanCompositeSnapshot,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  createFixtureSnapshot,
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  sha256Hex,
  type RefRecord,
  type Snapshot,
} from "@demiurges/world";
import {
  WORLD_PROJECT_REGISTRY_ID,
  WorldProjectCodecError,
  computeWorldProjectRevision,
  decodeWorldProjectManifestV1,
  encodeWorldProjectManifestV1,
  type WorldProjectCodecErrorCode,
  type WorldProjectManifestV1,
} from "./world-project-manifest";

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

interface BuildOptions {
  projectId?: string;
  displayName?: string;
  snapshots: readonly Snapshot[];
  cursor?: number;
  refVersion?: number;
  artifacts?: WorldProjectManifestV1["artifacts"];
}

/** 测试内独立构建合法 manifest（revision 与 artifacts 由测试自行推导）。 */
function buildManifest(options: BuildOptions): WorldProjectManifestV1 {
  const projectId = (options.projectId ?? "project:dh-016-test") as `project:${string}`;
  const displayName = options.displayName ?? "DH-016 测试世界";
  const snapshots = options.snapshots;
  const cursor = options.cursor ?? 0;
  const refVersion = options.refVersion ?? 1;

  // 独立推导 registered artifacts（不调用实现 code path）
  const byDigest = new Map<
    string,
    { assetId: string; digest: string; byteLength: number; format: "spz-v2" | "glb-2.0" }
  >();
  for (const snapshot of snapshots) {
    for (const entity of snapshot.entities) {
      const visual = entity.representations.visual;
      if (visual.kind === "registered-rigid-mesh") {
        const entry = MARBLE_HUNYUAN_REGISTRY.assets.find(
          (asset) => asset.assetId === visual.assetId,
        );
        if (entry) {
          byDigest.set(entry.digest, {
            assetId: entry.assetId,
            digest: entry.digest,
            byteLength: entry.byteLength,
            format: entry.format,
          });
        }
      }
      const observation = entity.representations.observation;
      if (observation?.kind === "registered-gaussian-splat") {
        const entry = MARBLE_HUNYUAN_REGISTRY.assets.find(
          (asset) => asset.assetId === observation.assetId,
        );
        if (entry) {
          byDigest.set(entry.digest, {
            assetId: entry.assetId,
            digest: entry.digest,
            byteLength: entry.byteLength,
            format: entry.format,
          });
        }
      }
    }
  }
  const artifacts = (options.artifacts ?? [...byDigest.values()].sort((a, b) =>
    a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : 0,
  )) as WorldProjectManifestV1["artifacts"];

  const body = {
    schemaVersion: 1,
    projectId,
    metadata: { displayName },
    registry: {
      id: WORLD_PROJECT_REGISTRY_ID,
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
    },
    snapshots,
    history: {
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      cursor,
    },
    currentRef: {
      name: "world:current",
      snapshotId: (snapshots[cursor] ?? snapshots[snapshots.length - 1])!.id,
      version: refVersion,
    } as RefRecord,
    artifacts,
  };
  return {
    ...body,
    revision: `project-revision:sha256:${sha256Hex(canonicalJsonBytes(body))}`,
  } as WorldProjectManifestV1;
}

/** 深拷贝为可变的 plain JSON graph，供 adversarial mutation。 */
function mutableCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** mutation 后按同一语义重算 revision，避免把 revision 校验混入目标反例。 */
function resign(manifest: WorldProjectManifestV1): WorldProjectManifestV1 {
  const { revision: _omit, ...body } = mutableCopy(manifest);
  return {
    ...body,
    revision: computeWorldProjectRevision(
      body as Omit<WorldProjectManifestV1, "revision">,
    ),
  } as WorldProjectManifestV1;
}

function expectCode(code: WorldProjectCodecErrorCode) {
  return (operation: () => unknown) => {
    expect(operation).toThrow(expect.objectContaining({ code }));
  };
}

function makePrimitiveChain(): Snapshot[] {
  const write = createInitialSnapshot();
  const edit = {
    ...mutableCopy(write),
    id: "snapshot:edit-1",
    parentId: write.id,
    source: "edit",
  } as Snapshot;
  edit.entities[1]!.state.pose.position = [0, 0, 2.4];
  return [write, edit];
}

describe("WorldProjectManifestV1 codec", () => {
  test("primitive round-trip：canonical bytes 与 revision exact", () => {
    const snapshots = makePrimitiveChain();
    const manifest = buildManifest({
      snapshots,
      cursor: 1,
      refVersion: 2,
    });
    const encoded = encodeWorldProjectManifestV1(manifest);
    const decoded = decodeWorldProjectManifestV1(encoded);
    expect(decoded.revision).toBe(manifest.revision);
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.currentRef).toEqual({
      name: "world:current",
      snapshotId: "snapshot:edit-1",
      version: 2,
    });
    expect(decoded.artifacts).toEqual([]);
    // exact canonical round-trip
    expect(sameBytes(canonicalJsonBytes(decoded), encoded)).toBe(true);
    // string 输入等价
    expect(
      sameBytes(
        canonicalJsonBytes(decodeWorldProjectManifestV1(new TextDecoder().decode(encoded))),
        encoded,
      ),
    ).toBe(true);
    // revision 由测试内独立重算一致
    const { revision: _stored, ...body } = manifest;
    expect(computeWorldProjectRevision(body as Omit<WorldProjectManifestV1, "revision">)).toBe(
      manifest.revision,
    );

    // computeWorldProjectRevision 拒绝携带 revision 字段的输入
    expect(() => computeWorldProjectRevision(manifest)).toThrow("不得包含 revision");
  });

  test("registered Marble × Hunyuan round-trip：registry 与三项 Artifact exact", () => {
    const snapshots = [createMarbleHunyuanCompositeSnapshot()];
    const manifest = buildManifest({ snapshots });
    const decoded = decodeWorldProjectManifestV1(encodeWorldProjectManifestV1(manifest));
    expect(decoded.registry).toEqual({
      id: "registry:marble-hunyuan-v1",
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
    });
    expect(decoded.artifacts.length).toBe(3);
    decoded.artifacts.forEach((entry, index) => {
      const registryEntry = MARBLE_HUNYUAN_REGISTRY.assets[index]!;
      expect(entry.assetId).toBe(registryEntry.assetId);
      expect(entry.digest).toBe(registryEntry.digest);
      expect(entry.byteLength).toBe(registryEntry.byteLength);
      expect(entry.format).toBe(registryEntry.format);
    });
    // 排序严格升序
    for (let index = 1; index < decoded.artifacts.length; index += 1) {
      expect(decoded.artifacts[index]!.digest > decoded.artifacts[index - 1]!.digest).toBe(true);
    }
  });

  test("同一语义内容 key 顺序不同 → 同一 revision", () => {
    const manifest = buildManifest({ snapshots: [createInitialSnapshot()] });
    const decoded = decodeWorldProjectManifestV1(encodeWorldProjectManifestV1(manifest));
    const reordered = mutableCopy(manifest);
    const reorderedRoot: Record<string, unknown> = {
      currentRef: reordered.currentRef,
      artifacts: reordered.artifacts,
      history: reordered.history,
      snapshots: reordered.snapshots,
      registry: reordered.registry,
      metadata: reordered.metadata,
      projectId: reordered.projectId,
      revision: reordered.revision,
      schemaVersion: reordered.schemaVersion,
    };
    expect(
      decodeWorldProjectManifestV1(reorderedRoot).revision,
    ).toBe(decoded.revision);
  });

  test("未知/多余/稀疏/非有限/-0/accessor 输入 fail closed", () => {
    const base = buildManifest({ snapshots: [createInitialSnapshot()] });

    const withExtra = mutableCopy(base) as unknown as Record<string, unknown>;
    withExtra.extraField = 1;
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(withExtra));

    const withMetadataExtra = mutableCopy(base);
    (withMetadataExtra.metadata as unknown as Record<string, unknown>).extra = 1;
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(withMetadataExtra));

    const withSnapshotExtra = mutableCopy(base);
    (withSnapshotExtra.snapshots[0] as unknown as Record<string, unknown>).extra = 1;
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(resign(withSnapshotExtra)),
    );

    const sparse = mutableCopy(base);
    delete (sparse.snapshots as unknown as Array<unknown>)[0];
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(sparse));

    const nonFinite = mutableCopy(base);
    nonFinite.history.cursor = Number.POSITIVE_INFINITY;
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(nonFinite));

    const negativeZero = mutableCopy(base);
    negativeZero.history.cursor = -0;
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(negativeZero));

    const accessor = mutableCopy(base) as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "revision", {
      enumerable: true,
      get: () => "project-revision:sha256:" + "a".repeat(64),
    });
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(accessor));

    const snapshotAccessor = mutableCopy(base);
    Object.defineProperty(snapshotAccessor.snapshots[0], "id", {
      enumerable: true,
      get: () => snapshotAccessor.snapshots[0]!.id,
    });
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(snapshotAccessor));
  });

  test("bad projectId/displayName 拒绝", () => {
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        projectId: "project:UPPER",
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        projectId: "project:a/b",
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        projectId: "project:a.b",
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        projectId: `project:${"a".repeat(65)}`,
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        projectId: "project:a%20b",
        snapshots: [createInitialSnapshot()],
      })),
    );

    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        displayName: "bad\u0001control",
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        displayName: "e\u0301", // 非 NFC（decomposed é）
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        displayName: "",
        snapshots: [createInitialSnapshot()],
      })),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(buildManifest({
        displayName: "长".repeat(129),
        snapshots: [createInitialSnapshot()],
      })),
    );
  });

  test("schemaVersion 不支持/缺失 分别返回 PROJECT_SCHEMA_UNSUPPORTED / INVALID", () => {
    const base = mutableCopy(buildManifest({ snapshots: [createInitialSnapshot()] }));
    base.schemaVersion = 2 as 1;
    expectCode("PROJECT_SCHEMA_UNSUPPORTED")(() => decodeWorldProjectManifestV1(base));

    const missing = mutableCopy(buildManifest({ snapshots: [createInitialSnapshot()] }));
    delete (missing as unknown as Record<string, unknown>).schemaVersion;
    expectCode("PROJECT_MANIFEST_INVALID")(() => decodeWorldProjectManifestV1(missing));
  });

  test("forged revision → PROJECT_REVISION_MISMATCH", () => {
    const base = mutableCopy(buildManifest({ snapshots: [createInitialSnapshot()] }));
    base.revision = (`project-revision:sha256:${"b".repeat(64)}`) as `project-revision:sha256:${string}`;
    expectCode("PROJECT_REVISION_MISMATCH")(() => decodeWorldProjectManifestV1(base));
  });

  test("branch/cycle/orphan/duplicate/reordered lineage 拒绝", () => {
    // branch：第二项 parentId 不是第一项 id
    const branch = mutableCopy(buildManifest({
      snapshots: makePrimitiveChain(),
      cursor: 1,
    }));
    branch.snapshots[1]!.parentId = "snapshot:other";
    expectCode("PROJECT_LINEAGE_INVALID")(() => decodeWorldProjectManifestV1(resign(branch)));

    // orphan：parentId 指向不存在项
    const orphan = mutableCopy(buildManifest({
      snapshots: makePrimitiveChain(),
      cursor: 1,
    }));
    orphan.snapshots[1]!.parentId = "snapshot:missing";
    expectCode("PROJECT_LINEAGE_INVALID")(() => decodeWorldProjectManifestV1(resign(orphan)));

    // duplicate：两项同 ID
    const duplicate = mutableCopy(buildManifest({
      snapshots: makePrimitiveChain(),
      cursor: 1,
    }));
    duplicate.snapshots[1]!.id = duplicate.snapshots[0]!.id;
    duplicate.history.snapshotIds[1] = duplicate.snapshots[0]!.id;
    expectCode("PROJECT_LINEAGE_INVALID")(() => decodeWorldProjectManifestV1(resign(duplicate)));

    // reordered：第二、三项交换
    const three = [makePrimitiveChain()[0]!, makePrimitiveChain()[1]!];
    const third = {
      ...mutableCopy(three[1]!),
      id: "snapshot:edit-2",
      parentId: three[1]!.id,
    } as Snapshot;
    const reordered = mutableCopy(buildManifest({
      snapshots: [three[0]!, third, three[1]!],
      cursor: 2,
    }));
    reordered.history.snapshotIds = reordered.snapshots.map((snapshot) => snapshot.id);
    expectCode("PROJECT_LINEAGE_INVALID")(() =>
      decodeWorldProjectManifestV1(resign(reordered)),
    );

    // 首项非 write
    const nonWriteRoot = mutableCopy(buildManifest({
      snapshots: makePrimitiveChain(),
      cursor: 1,
    }));
    nonWriteRoot.snapshots[0]!.source = "edit";
    nonWriteRoot.snapshots[0]!.parentId = null;
    expectCode("PROJECT_LINEAGE_INVALID")(() =>
      decodeWorldProjectManifestV1(resign(nonWriteRoot)),
    );
  });

  test("forged cursor/currentRef/version 拒绝", () => {
    const chain = makePrimitiveChain();
    const outOfRange = mutableCopy(buildManifest({ snapshots: chain, cursor: 2 }));
    expectCode("PROJECT_CURSOR_INVALID")(() => decodeWorldProjectManifestV1(outOfRange));

    const fractional = mutableCopy(buildManifest({ snapshots: chain, cursor: 0.5 }));
    expectCode("PROJECT_CURSOR_INVALID")(() => decodeWorldProjectManifestV1(fractional));

    const wrongName = mutableCopy(buildManifest({ snapshots: chain, cursor: 1 }));
    wrongName.currentRef.name = "world:other";
    expectCode("PROJECT_CURRENT_REF_INVALID")(() => decodeWorldProjectManifestV1(resign(wrongName)));

    const wrongSnapshot = mutableCopy(buildManifest({ snapshots: chain, cursor: 1 }));
    wrongSnapshot.currentRef.snapshotId = chain[0]!.id;
    expectCode("PROJECT_CURRENT_REF_INVALID")(() => decodeWorldProjectManifestV1(resign(wrongSnapshot)));

    const zeroVersion = mutableCopy(buildManifest({ snapshots: chain, cursor: 1, refVersion: 0 }));
    expectCode("PROJECT_CURRENT_REF_INVALID")(() => decodeWorldProjectManifestV1(resign(zeroVersion)));

    const fractionalVersion = mutableCopy(buildManifest({
      snapshots: chain,
      cursor: 1,
      refVersion: 1.5,
    }));
    expectCode("PROJECT_CURRENT_REF_INVALID")(() => decodeWorldProjectManifestV1(resign(fractionalVersion)));

    const unsafeVersion = mutableCopy(buildManifest({
      snapshots: chain,
      cursor: 1,
      refVersion: Number.MAX_SAFE_INTEGER + 1,
    }));
    expectCode("PROJECT_CURRENT_REF_INVALID")(() => decodeWorldProjectManifestV1(resign(unsafeVersion)));
  });

  test("registry id/manifestDigest 漂移拒绝", () => {
    const badId = mutableCopy(buildManifest({ snapshots: [createInitialSnapshot()] }));
    badId.registry.id = "registry:other-v1";
    expectCode("PROJECT_REGISTRY_INVALID")(() => decodeWorldProjectManifestV1(resign(badId)));

    const badDigest = mutableCopy(buildManifest({ snapshots: [createInitialSnapshot()] }));
    badDigest.registry.manifestDigest = `sha256:${"0".repeat(64)}` as typeof MARBLE_HUNYUAN_MANIFEST_DIGEST;
    expectCode("PROJECT_REGISTRY_INVALID")(() => decodeWorldProjectManifestV1(resign(badDigest)));
  });

  test("artifact missing/extra/duplicate/order/drift 拒绝", () => {
    const composite = createMarbleHunyuanCompositeSnapshot();
    const manifest = buildManifest({ snapshots: [composite] });

    const missing = mutableCopy(manifest);
    missing.artifacts = missing.artifacts.slice(0, 2);
    expectCode("PROJECT_ARTIFACT_INVALID")(() => decodeWorldProjectManifestV1(resign(missing)));

    const extra = mutableCopy(manifest);
    extra.artifacts = [...extra.artifacts, {
      assetId: "asset:extra",
      digest: "f".repeat(64),
      byteLength: 1,
      format: "glb-2.0",
    }];
    expectCode("PROJECT_ARTIFACT_INVALID")(() => decodeWorldProjectManifestV1(resign(extra)));

    const duplicate = mutableCopy(manifest);
    duplicate.artifacts = [duplicate.artifacts[0]!, ...duplicate.artifacts];
    expectCode("PROJECT_ARTIFACT_INVALID")(() => decodeWorldProjectManifestV1(resign(duplicate)));

    const reordered = mutableCopy(manifest);
    reordered.artifacts = [...reordered.artifacts].reverse();
    expectCode("PROJECT_ARTIFACT_INVALID")(() => decodeWorldProjectManifestV1(resign(reordered)));

    const driftedLength = mutableCopy(manifest);
    driftedLength.artifacts[0]!.byteLength += 1;
    expectCode("PROJECT_ARTIFACT_INVALID")(() => decodeWorldProjectManifestV1(resign(driftedLength)));

    const driftedDigest = mutableCopy(manifest);
    driftedDigest.artifacts[0]!.digest =
      driftedDigest.artifacts[0]!.digest.startsWith("0")
        ? "1" + driftedDigest.artifacts[0]!.digest.slice(1)
        : "0" + driftedDigest.artifacts[0]!.digest.slice(1);
    expectCode("PROJECT_ARTIFACT_INVALID")(() => decodeWorldProjectManifestV1(resign(driftedDigest)));
  });

  test("legacy imported-rigid-mesh / gaussian-splat external representation → PROJECT_ARTIFACT_UNBACKED", () => {
    const diagnostic = createFixtureSnapshot(2, DIAGNOSTIC_RIGID_FIXTURE_ID);
    const manifest = buildManifest({ snapshots: [diagnostic] });
    expectCode("PROJECT_ARTIFACT_UNBACKED")(() =>
      decodeWorldProjectManifestV1(encodeWorldProjectManifestV1(manifest)),
    );
    expectCode("PROJECT_ARTIFACT_UNBACKED")(() => decodeWorldProjectManifestV1(manifest));
  });

  test("registered rep 引用未登记 asset 或 registry digest 漂移 fail closed", () => {
    const composite = createMarbleHunyuanCompositeSnapshot();
    const unknownAsset = mutableCopy(composite);
    (unknownAsset.entities[2]!.representations.visual as { assetId: string }).assetId =
      "asset:unknown-provider-entry";
    const unknownManifest = buildManifest({ snapshots: [unknownAsset] });
    expect(() => decodeWorldProjectManifestV1(unknownManifest)).toThrow(WorldProjectCodecError);

    const driftedDigest = mutableCopy(composite);
    (driftedDigest.entities[2]!.representations.visual as { manifestDigest: string }).manifestDigest =
      `sha256:${"0".repeat(64)}`;
    const driftedManifest = buildManifest({ snapshots: [driftedDigest] });
    expect(() => decodeWorldProjectManifestV1(driftedManifest)).toThrow(WorldProjectCodecError);
  });

  test("byte budget / UTF-8 / JSON 输入 fail closed", () => {
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(new TextEncoder().encode("{ 不是 JSON")),
    );
    expectCode("PROJECT_MANIFEST_INVALID")(() =>
      decodeWorldProjectManifestV1(new Uint8Array([0xff, 0xfe, 0xfd])),
    );
  });
});
