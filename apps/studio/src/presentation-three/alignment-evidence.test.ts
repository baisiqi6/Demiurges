import { describe, expect, test } from "bun:test";

import {
  CUBE_REF,
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  createMarbleHunyuanCompositeSnapshot,
  createDiagnosticGaussianSplatObservation,
} from "@demiurges/world";
import {
  createAlignmentEvidence,
  createRegisteredAlignmentEvidence,
} from "./alignment-evidence";

const IDENTITY_POSE = {
  position: [0, 0, 2.4] as const,
  rotation: { x: 0, y: 0, z: 0, w: 1 } as const,
};

describe("3DGS AlignmentEvidence", () => {
  test("registered SPZ 只把 integrity 与 authored calibration/proxy witness 分层报告", () => {
    const environment = createMarbleHunyuanCompositeSnapshot().entities[0]!;
    const observation = environment.representations.observation;
    if (observation?.kind !== "registered-gaussian-splat") throw new Error("fixture 漂移");
    const evidence = createRegisteredAlignmentEvidence(
      environment.ref,
      observation,
      {
        min: [-1.187255859375, -1.81494140625, -2.52490234375],
        max: [1.823486328125, 0.875732421875, 2.66748046875],
      },
    );
    expect(evidence.integrityStatus).toBe("verified");
    expect(evidence.calibrationStatus).toBe("authored-unverified");
    expect(evidence.proxyWitnessStatus).toBe("pass");
    expect(evidence.passed).toBe(true);
    expect(evidence.contentDigest).toBe(
      "sha256:3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5",
    );

    const drifted = createRegisteredAlignmentEvidence(
      environment.ref,
      observation,
      { min: [-1, -1, -1], max: [1, 1, 1] },
    );
    expect(drifted.integrityStatus).toBe("verified");
    expect(drifted.passed).toBe(false);
  });

  test("source frame/units/transform 映射到 collision-aligned entity-local bounds", () => {
    const evidence = createAlignmentEvidence(
      CUBE_REF,
      createDiagnosticGaussianSplatObservation(),
      DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.sourceCenterBoundsMeters,
      IDENTITY_POSE,
      IDENTITY_POSE,
    );

    evidence.observedEntityLocalBounds.min.forEach((value, axis) => {
      expect(value).toBeCloseTo([-0.32, -0.22, -0.25][axis]!, 12);
    });
    evidence.observedEntityLocalBounds.max.forEach((value, axis) => {
      expect(value).toBeCloseTo([0.32, 0.22, 0.25][axis]!, 12);
    });
    expect(evidence.maxBoundsErrorMeters).toBeLessThan(1e-12);
    expect(evidence.poseTranslationErrorMeters).toBe(0);
    expect(evidence.poseAngularErrorRadians).toBe(0);
    expect(evidence.passed).toBe(true);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.observedEntityLocalBounds.min)).toBe(true);
  });

  test("bounds 或 Episode presentation pose 漂移时显式 FAIL", () => {
    const observation = createDiagnosticGaussianSplatObservation();
    const boundsDrift = createAlignmentEvidence(
      CUBE_REF,
      observation,
      { min: [-0.30, -0.25, -0.22], max: [0.32, 0.25, 0.22] },
      IDENTITY_POSE,
      IDENTITY_POSE,
    );
    expect(boundsDrift.maxBoundsErrorMeters).toBeCloseTo(0.02, 12);
    expect(boundsDrift.passed).toBe(false);

    const poseDrift = createAlignmentEvidence(
      CUBE_REF,
      observation,
      DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.sourceCenterBoundsMeters,
      IDENTITY_POSE,
      { ...IDENTITY_POSE, position: [0, 0, 2.41] },
    );
    expect(poseDrift.poseTranslationErrorMeters).toBeCloseTo(0.01, 12);
    expect(poseDrift.passed).toBe(false);

    const nonUnitPose = createAlignmentEvidence(
      CUBE_REF,
      observation,
      DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.sourceCenterBoundsMeters,
      { ...IDENTITY_POSE, rotation: { x: 0, y: 0, z: 0, w: 2 } },
      { ...IDENTITY_POSE, rotation: { x: 0, y: 0, z: 0, w: 2 } },
    );
    expect(nonUnitPose.poseAngularErrorRadians).toBe(Infinity);
    expect(nonUnitPose.passed).toBe(false);

    const reversedBounds = createAlignmentEvidence(
      CUBE_REF,
      observation,
      { min: [0.32, 0.25, 0.22], max: [-0.32, -0.25, -0.22] },
      IDENTITY_POSE,
      IDENTITY_POSE,
    );
    expect(reversedBounds.maxBoundsErrorMeters).toBe(Infinity);
    expect(reversedBounds.passed).toBe(false);

    const sparseBounds = createAlignmentEvidence(
      CUBE_REF,
      observation,
      {
        min: new Array(3) as [number, number, number],
        max: [0.32, 0.25, 0.22],
      },
      IDENTITY_POSE,
      IDENTITY_POSE,
    );
    expect(sparseBounds.maxBoundsErrorMeters).toBe(Infinity);
    expect(sparseBounds.passed).toBe(false);

    const invalidObservation = {
      ...observation,
      localTransform: {
        ...observation.localTransform,
        rotation: { ...observation.localTransform.rotation, w: 2 },
      },
    };
    const observationDrift = createAlignmentEvidence(
      CUBE_REF,
      invalidObservation,
      DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.sourceCenterBoundsMeters,
      IDENTITY_POSE,
      IDENTITY_POSE,
    );
    expect(observationDrift.maxBoundsErrorMeters).toBe(Infinity);
    expect(observationDrift.passed).toBe(false);
  });
});
