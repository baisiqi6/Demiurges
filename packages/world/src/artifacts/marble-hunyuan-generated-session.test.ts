import { describe, expect, test } from "bun:test";

import { isDeepFrozen } from "../kernel/world";
import {
  MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
  createMarbleHunyuanCompositeSnapshot,
  requireMarbleHunyuanCompositeSnapshot,
} from "./marble-hunyuan-composite-fixture";
import { MARBLE_HUNYUAN_MANIFEST_DIGEST } from "./marble-hunyuan-registry";
import {
  GENERATED_SESSION_CALIBRATION_ID,
  GENERATED_SESSION_WITNESS_ID,
  MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID,
  createMarbleHunyuanGeneratedSessionSnapshot,
  deriveGeneratedObjectHalfExtents,
  type GeneratedObjectWorldBinding,
} from "./marble-hunyuan-generated-session";

const binding: GeneratedObjectWorldBinding = {
  artifactSetDigest: "5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d",
  assetId: "asset:generated-sha256-65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a",
  sourceBounds: {
    min: [-0.48395800590515137, -3.736129973702895e-8, -0.2797180492002527],
    max: [0.4801819920539856, 0.574190135291325, 0.2780711007797188],
  },
};

describe("DH-018 generated Marble/Hunyuan session fixture", () => {
  test("Y-up to Z-up authored AABB projection derives exact half extents", () => {
    expect(deriveGeneratedObjectHalfExtents(binding.sourceBounds)).toEqual([
      0.4820699989795685,
      0.27889457498998575,
      0.28709508632631236,
    ]);
  });

  test("session Snapshot replaces only generated identity and authored proxy", () => {
    const canonical = createMarbleHunyuanCompositeSnapshot();
    const snapshot = createMarbleHunyuanGeneratedSessionSnapshot(binding);

    expect(snapshot).toMatchObject({
      id: MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID,
      parentId: null,
      source: "write",
      scenarioId: MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
    });
    expect(snapshot.entities.slice(0, 2)).toEqual(canonical.entities.slice(0, 2));
    expect(snapshot.entities[2]!.state).toEqual(canonical.entities[2]!.state);
    expect(snapshot.entities[2]!.physics).toEqual(canonical.entities[2]!.physics);
    expect(snapshot.entities[2]!.representations).toEqual({
      visual: {
        kind: "registered-rigid-mesh",
        assetId: binding.assetId,
        manifestDigest: `sha256:${binding.artifactSetDigest}`,
        calibrationId: GENERATED_SESSION_CALIBRATION_ID,
        witnessId: GENERATED_SESSION_WITNESS_ID,
      },
      collision: {
        kind: "box",
        halfExtents: [0.4820699989795685, 0.27889457498998575, 0.28709508632631236],
      },
      observation: null,
      semantic: {
        kind: "authored-box-proxy",
        witnessId: GENERATED_SESSION_WITNESS_ID,
      },
    });
    expect(isDeepFrozen(snapshot)).toBe(true);
    expect(() => requireMarbleHunyuanCompositeSnapshot(snapshot)).not.toThrow();

    const staticVisual = canonical.entities[2]!.representations.visual;
    expect(staticVisual).toMatchObject({
      assetId: "asset:hunyuan-rounded-cube-v1",
      manifestDigest: MARBLE_HUNYUAN_MANIFEST_DIGEST,
      calibrationId: "calibration:hunyuan-glb-v1",
      witnessId: "witness:hunyuan-glb-box-proxy-v1",
    });
  });
});
