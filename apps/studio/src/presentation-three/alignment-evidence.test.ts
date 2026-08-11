import { describe, expect, test } from "bun:test";

import {
  CUBE_REF,
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  createDiagnosticGaussianSplatObservation,
} from "@demiurges/world";
import { createAlignmentEvidence } from "./alignment-evidence";

const IDENTITY_POSE = {
  position: [0, 0, 2.4] as const,
  rotation: { x: 0, y: 0, z: 0, w: 1 } as const,
};

describe("3DGS AlignmentEvidence", () => {
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
