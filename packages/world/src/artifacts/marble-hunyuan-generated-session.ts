import type { Snapshot, Vec3 } from "../kernel/types";
import { deepFreeze } from "../kernel/world";
import {
  GENERATED_SESSION_CALIBRATION_ID,
  GENERATED_SESSION_WITNESS_ID,
  MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID,
  createMarbleHunyuanCompositeSnapshot,
} from "./marble-hunyuan-composite-fixture";
import type { Bounds3 } from "./marble-hunyuan-registry";

export interface GeneratedObjectWorldBinding {
  readonly assetId: `asset:${string}`;
  readonly artifactSetDigest: string;
  readonly sourceBounds: Bounds3;
}

export {
  GENERATED_SESSION_CALIBRATION_ID,
  GENERATED_SESSION_WITNESS_ID,
  MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID,
};

export function deriveGeneratedObjectHalfExtents(sourceBounds: Bounds3): Vec3 {
  return deepFreeze([
    (sourceBounds.max[0] - sourceBounds.min[0]) / 2,
    (sourceBounds.max[2] - sourceBounds.min[2]) / 2,
    (sourceBounds.max[1] - sourceBounds.min[1]) / 2,
  ]) as Vec3;
}

export function createMarbleHunyuanGeneratedSessionSnapshot(
  binding: GeneratedObjectWorldBinding,
): Snapshot {
  const canonical = createMarbleHunyuanCompositeSnapshot();
  const generated = canonical.entities[2]!;
  const halfExtents = deriveGeneratedObjectHalfExtents(binding.sourceBounds);

  return deepFreeze({
    ...canonical,
    id: MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID,
    entities: [
      canonical.entities[0]!,
      canonical.entities[1]!,
      {
        ...generated,
        representations: {
          visual: {
            kind: "registered-rigid-mesh",
            assetId: binding.assetId,
            manifestDigest: `sha256:${binding.artifactSetDigest}`,
            calibrationId: GENERATED_SESSION_CALIBRATION_ID,
            witnessId: GENERATED_SESSION_WITNESS_ID,
          },
          collision: { kind: "box", halfExtents },
          observation: null,
          semantic: {
            kind: "authored-box-proxy",
            witnessId: GENERATED_SESSION_WITNESS_ID,
          },
        },
      },
    ],
  }) as Snapshot;
}
