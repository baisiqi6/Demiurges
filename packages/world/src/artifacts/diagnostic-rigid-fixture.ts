import type {
  BoxCollisionRepresentation,
  ImportedRigidMeshRepresentation,
  Snapshot,
} from "../kernel/types";
import {
  CUBE_REF,
  createInitialSnapshot,
  deepFreeze,
} from "../kernel/world";
import { createDiagnosticGaussianSplatObservation } from "./diagnostic-gaussian-splat";

export const PRIMITIVE_BOX_FIXTURE_ID = "fixture:primitive-box" as const;
export const DIAGNOSTIC_RIGID_FIXTURE_ID = "fixture:diagnostic-wedge-v1" as const;
export type RigidFixtureId =
  | typeof PRIMITIVE_BOX_FIXTURE_ID
  | typeof DIAGNOSTIC_RIGID_FIXTURE_ID;

export const DIAGNOSTIC_RIGID_ASSET = deepFreeze({
  assetId: "asset:diagnostic-wedge-v1" as const,
  mediaType: "model/gltf-binary" as const,
  repoPath: "packages/world/assets/diagnostic-wedge-v1.glb" as const,
  contentDigest: "sha256:26e032d8ae8f4d3bea41e446a36087fba90afee58f583080830d2e70ee94590e" as const,
  byteLength: 1_568,
  provenance: {
    origin: "generated-in-repo" as const,
    generator: "scripts/generate-diagnostic-wedge-glb.mjs" as const,
    license: "CC0-1.0" as const,
  },
  sourceFrameRef: "frame:gltf-y-up" as const,
  sourceUnitMeters: 1,
  localBoundsMeters: {
    center: [0, 0, 0] as const,
    halfExtents: [0.32, 0.25, 0.22] as const,
  },
  alignment: {
    localTransform: {
      position: [0, 0, 0] as const,
      rotation: {
        x: Math.SQRT1_2,
        y: 0,
        z: 0,
        w: Math.SQRT1_2,
      },
      scale: [1, 1, 1] as const,
    },
    collisionProxy: {
      kind: "box" as const,
      halfExtents: [0.32, 0.22, 0.25] as const,
    },
    toleranceMeters: 0.001,
  },
} as const);

function sameVec(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

export function requireRigidFixtureId(value: unknown): RigidFixtureId {
  if (value !== PRIMITIVE_BOX_FIXTURE_ID && value !== DIAGNOSTIC_RIGID_FIXTURE_ID) {
    throw new Error(
      `fixtureId 必须是 ${PRIMITIVE_BOX_FIXTURE_ID} 或 ${DIAGNOSTIC_RIGID_FIXTURE_ID}`,
    );
  }
  return value;
}

export function requireDiagnosticRigidVisual(
  visual: ImportedRigidMeshRepresentation,
): void {
  if (
    visual.assetId !== DIAGNOSTIC_RIGID_ASSET.assetId ||
    visual.contentDigest !== DIAGNOSTIC_RIGID_ASSET.contentDigest ||
    visual.sourceFrameRef !== DIAGNOSTIC_RIGID_ASSET.sourceFrameRef ||
    visual.sourceUnitMeters !== DIAGNOSTIC_RIGID_ASSET.sourceUnitMeters
  ) {
    throw new Error("imported rigid visual 与 repo-owned artifact identity 不一致");
  }
  const expected = DIAGNOSTIC_RIGID_ASSET.alignment.localTransform;
  if (
    !sameVec(visual.localTransform.position, expected.position) ||
    !sameVec(visual.localTransform.scale, expected.scale) ||
    visual.localTransform.rotation.x !== expected.rotation.x ||
    visual.localTransform.rotation.y !== expected.rotation.y ||
    visual.localTransform.rotation.z !== expected.rotation.z ||
    visual.localTransform.rotation.w !== expected.rotation.w
  ) {
    throw new Error("imported rigid visual 与登记 alignment transform 不一致");
  }
}

export function requireDiagnosticRigidCollision(
  collision: BoxCollisionRepresentation,
): void {
  const expected = DIAGNOSTIC_RIGID_ASSET.alignment.collisionProxy;
  if (collision.kind !== expected.kind || !sameVec(collision.halfExtents, expected.halfExtents)) {
    throw new Error("imported rigid collision 与登记 proxy 不一致");
  }
}

export function createFixtureSnapshot(
  height: number,
  fixtureId: RigidFixtureId = PRIMITIVE_BOX_FIXTURE_ID,
): Snapshot {
  if (fixtureId === PRIMITIVE_BOX_FIXTURE_ID) {
    return createInitialSnapshot(height);
  }

  const base = createInitialSnapshot(height);
  return deepFreeze({
    ...base,
    id: "snapshot:base-diagnostic-wedge" as const,
    entities: base.entities.map((entity) =>
      entity.ref === CUBE_REF
        ? {
            ...entity,
            label: "Diagnostic imported wedge",
            representations: {
              visual: {
                kind: "imported-rigid-mesh" as const,
                assetId: DIAGNOSTIC_RIGID_ASSET.assetId,
                contentDigest: DIAGNOSTIC_RIGID_ASSET.contentDigest,
                sourceFrameRef: DIAGNOSTIC_RIGID_ASSET.sourceFrameRef,
                sourceUnitMeters: DIAGNOSTIC_RIGID_ASSET.sourceUnitMeters,
                localTransform: DIAGNOSTIC_RIGID_ASSET.alignment.localTransform,
              },
              collision: DIAGNOSTIC_RIGID_ASSET.alignment.collisionProxy,
              observation: createDiagnosticGaussianSplatObservation(),
            },
          }
        : entity,
    ),
  }) as Snapshot;
}
