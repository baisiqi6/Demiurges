import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { CUBE_REF, isDeepFrozen } from "../kernel/world";
import {
  DIAGNOSTIC_RIGID_ASSET,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  createFixtureSnapshot,
  requireDiagnosticRigidVisual,
} from "./diagnostic-rigid-fixture";

const ASSET_PATH = fileURLToPath(
  new URL("../../assets/diagnostic-wedge-v1.glb", import.meta.url),
);

describe("Diagnostic imported rigid fixture", () => {
  test("repo-owned GLB bytes 与登记 identity/provenance 完全一致", () => {
    const bytes = readFileSync(ASSET_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");

    expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(bytes.byteLength).toBe(DIAGNOSTIC_RIGID_ASSET.byteLength);
    expect(`sha256:${digest}`).toBe(DIAGNOSTIC_RIGID_ASSET.contentDigest);
    expect(DIAGNOSTIC_RIGID_ASSET.provenance).toEqual({
      origin: "generated-in-repo",
      generator: "scripts/generate-diagnostic-wedge-glb.mjs",
      license: "CC0-1.0",
    });
    expect(isDeepFrozen(DIAGNOSTIC_RIGID_ASSET)).toBe(true);

    const jsonChunkLength = bytes.readUInt32LE(12);
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const gltf = JSON.parse(
      bytes.subarray(20, 20 + jsonChunkLength).toString("utf8").trim(),
    ) as {
      accessors: Array<{ min?: number[]; max?: number[] }>;
      meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
    };
    const positionAccessor = gltf.accessors[
      gltf.meshes[0]!.primitives[0]!.attributes.POSITION
    ]!;
    positionAccessor.min?.forEach((value, index) => {
      expect(value).toBeCloseTo([-0.32, -0.25, -0.22][index]!, 7);
    });
    positionAccessor.max?.forEach((value, index) => {
      expect(value).toBeCloseTo([0.32, 0.25, 0.22][index]!, 7);
    });
    expect(JSON.stringify(gltf)).not.toMatch(/api[_-]?key|credential|secret|token/i);
  });

  test("visual mesh 与 collision proxy 共享 EntityRef 但保持独立表示", () => {
    const snapshot = createFixtureSnapshot(2.4, DIAGNOSTIC_RIGID_FIXTURE_ID);
    const entity = snapshot.entities.find((candidate) => candidate.ref === CUBE_REF)!;
    const visual = entity.representations.visual;

    expect(snapshot.id).toBe("snapshot:base-diagnostic-wedge");
    expect(visual.kind).toBe("imported-rigid-mesh");
    if (visual.kind !== "imported-rigid-mesh") throw new Error("fixture visual kind 非法");
    expect(visual.assetId).toBe(DIAGNOSTIC_RIGID_ASSET.assetId);
    expect(visual.contentDigest).toBe(DIAGNOSTIC_RIGID_ASSET.contentDigest);
    expect(visual.sourceFrameRef).toBe("frame:gltf-y-up");
    expect(visual.sourceUnitMeters).toBe(1);
    expect(entity.representations.collision).toEqual({
      kind: "box",
      halfExtents: [0.32, 0.22, 0.25],
    });
    expect(DIAGNOSTIC_RIGID_ASSET.alignment).toMatchObject({
      collisionProxy: entity.representations.collision,
      toleranceMeters: 0.001,
    });
    expect([
      DIAGNOSTIC_RIGID_ASSET.localBoundsMeters.halfExtents[0],
      DIAGNOSTIC_RIGID_ASSET.localBoundsMeters.halfExtents[2],
      DIAGNOSTIC_RIGID_ASSET.localBoundsMeters.halfExtents[1],
    ]).toEqual(entity.representations.collision.halfExtents);
    expect(isDeepFrozen(snapshot)).toBe(true);
  });

  test("artifact digest、frame 或 units 漂移时 fail closed", () => {
    const snapshot = createFixtureSnapshot(2, DIAGNOSTIC_RIGID_FIXTURE_ID);
    const entity = snapshot.entities.find((candidate) => candidate.ref === CUBE_REF)!;
    const visual = entity.representations.visual;
    if (visual.kind !== "imported-rigid-mesh") throw new Error("fixture visual kind 非法");

    expect(() =>
      requireDiagnosticRigidVisual({
        ...visual,
        contentDigest: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("artifact identity");
    expect(() =>
      requireDiagnosticRigidVisual({
        ...visual,
        sourceUnitMeters: 0.01,
      }),
    ).toThrow("artifact identity");
  });
});
