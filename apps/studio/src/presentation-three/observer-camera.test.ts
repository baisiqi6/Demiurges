import { describe, expect, test } from "bun:test";

import {
  FALLBACK_WORLD_BOUNDS,
  boundaryWarning,
  boundsContains,
  cameraKeyAdmission,
  fitBounds,
  interpolatePose,
  isFinitePose,
  isFiniteVec3,
  moveZUp,
  normalizeBounds,
  resolveObserverBounds,
  transformBounds,
  unionBounds,
  type CameraPose,
  type Vec3,
} from "./observer-camera";

const pose: CameraPose = {
  position: [0, 0, 1],
  target: [0, 1, 1],
};

describe("Observer camera math", () => {
  test("sparse Vec3 values fail closed before bounds or camera math", () => {
    const sparse = Array(3) as number[];
    expect(isFiniteVec3(sparse)).toBe(false);
    expect(normalizeBounds({ min: sparse as unknown as Vec3, max: [1, 1, 1] })).toBeUndefined();
    const resolved = resolveObserverBounds({
      registered: { min: sparse as unknown as Vec3, max: [1, 1, 1] },
      fallbackPosition: [0, 0, 0],
    });
    expect(resolved.provenance).toBe("authored-fallback");
    expect(isFinitePose(fitBounds(resolved.bounds, 1).pose)).toBe(true);
  });
  test("W/S/A/D stay horizontal while Q/E use world Z", () => {
    const forward = moveZUp(pose, { forward: 1, right: 0, up: 0, accelerated: false }, 2, 0.5);
    expect(forward.pose.position).toEqual([0, 0.1, 1]);
    const right = moveZUp(pose, { forward: 0, right: 1, up: 0, accelerated: false }, 2, 0.05);
    expect(right.pose.position).toEqual([0.1, 0, 1]);
    const up = moveZUp(pose, { forward: 0, right: 0, up: 1, accelerated: false }, 2, 0.05);
    expect(up.pose.position).toEqual([0, 0, 1.1]);
  });

  test("diagonal movement is normalized, Shift accelerates, delta is clamped", () => {
    const normal = moveZUp(pose, { forward: 1, right: 1, up: 1, accelerated: false }, 1, 2);
    const accelerated = moveZUp(pose, { forward: 1, right: 1, up: 1, accelerated: true }, 1, 2);
    const normalDistance = Math.hypot(
      normal.pose.position[0], normal.pose.position[1], normal.pose.position[2] - 1,
    );
    const acceleratedDistance = Math.hypot(
      accelerated.pose.position[0], accelerated.pose.position[1], accelerated.pose.position[2] - 1,
    );
    expect(normalDistance).toBeCloseTo(0.05, 10);
    expect(acceleratedDistance).toBeCloseTo(0.15, 10);
  });

  test("near-vertical look keeps the last finite horizontal forward", () => {
    const vertical: CameraPose = { position: [0, 0, 0], target: [0, 0, 1] };
    const moved = moveZUp(
      vertical,
      { forward: 1, right: 0, up: 0, accelerated: false },
      1,
      0.05,
      [1, 0, 0],
    );
    expect(moved.pose.position).toEqual([0.05, 0, 0]);
    expect(moved.pose.position.every(Number.isFinite)).toBe(true);
  });

  test("fit bounds is aspect-aware and finite for degenerate or invalid input", () => {
    const tall = fitBounds({ min: [0, 0, 0], max: [0, 0, 0] }, 0.5);
    const wide = fitBounds({ min: [-2, -1, 0], max: [2, 1, 2] }, 2);
    const fallback = fitBounds({ min: [2, 0, 0], max: [1, 0, 0] }, Number.NaN);
    for (const result of [tall, wide, fallback]) {
      expect([...result.pose.position, ...result.pose.target].every(Number.isFinite)).toBe(true);
      expect(result.envelope.near).toBeGreaterThan(0);
      expect(result.envelope.far).toBeGreaterThan(result.envelope.near);
      expect(result.envelope.maxDistance).toBeGreaterThan(result.envelope.minDistance);
    }
    expect(fallback.bounds).toEqual(FALLBACK_WORLD_BOUNDS);
    expect(tall.bounds).toEqual(FALLBACK_WORLD_BOUNDS);
    expect(resolveObserverBounds({
      registered: { min: [0, 0, 0], max: [1, 1, 0] },
      fallbackPosition: [0, 0, 0],
    }).provenance).toBe("authored-fallback");
  });

  test("entity-local bounds transform all eight corners into world Z-up", () => {
    const transformed = transformBounds(
      { min: [-1, -2, -0.5], max: [1, 2, 0.5] },
      [4, 5, 6],
      { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
    );
    expect(transformed?.min[0]).toBeCloseTo(2);
    expect(transformed?.max[0]).toBeCloseTo(6);
    expect(transformed?.min[1]).toBeCloseTo(4);
    expect(transformed?.max[1]).toBeCloseTo(6);
    expect(transformed?.min[2]).toBeCloseTo(5.5);
    expect(transformed?.max[2]).toBeCloseTo(6.5);
  });

  test("union, containment, boundary and transition remain deterministic", () => {
    const bounds = unionBounds([
      { min: [-1, -1, 0], max: [0, 0, 1] },
      { min: [0, 0, 0], max: [2, 3, 4] },
      undefined,
    ]);
    expect(bounds).toEqual({ min: [-1, -1, 0], max: [2, 3, 4] });
    expect(boundsContains(bounds!, [0, 0, 1])).toBe(true);
    expect(boundaryWarning(bounds, [0, 0, 1])).toBe("inside");
    expect(boundaryWarning(bounds, [-0.99, 0, 1])).toBe("near");
    expect(boundaryWarning(bounds, [9, 0, 1])).toBe("unknown");
    expect(interpolatePose(pose, { position: [1, 1, 2], target: [1, 2, 2] }, 1))
      .toEqual({ position: [1, 1, 2], target: [1, 2, 2] });
    expect(normalizeBounds({ min: [0, 0, 0], max: [Number.NaN, 1, 1] })).toBeUndefined();
  });

  test("camera keys require viewport ownership and reject editable targets", () => {
    expect(cameraKeyAdmission({
      viewportFocused: true,
      pointerOwned: false,
      editableTarget: false,
    })).toBe(true);
    expect(cameraKeyAdmission({
      viewportFocused: true,
      pointerOwned: false,
      editableTarget: true,
    })).toBe(false);
    expect(cameraKeyAdmission({
      viewportFocused: false,
      pointerOwned: true,
      editableTarget: false,
    })).toBe(true);
    expect(cameraKeyAdmission({
      viewportFocused: false,
      pointerOwned: false,
      editableTarget: false,
    })).toBe(false);
  });

  test("primitive, imported mesh, missing 3DGS and Marble bounds use explicit fallback order", () => {
    const primitive = { min: [-1, -1, 0], max: [1, 1, 2] } as const;
    const imported = { min: [-2, -1, 0], max: [2, 1, 3] } as const;
    const marble = { min: [-1.5, -2.6, -0.1], max: [1.51, 2.58, 2.59] } as const;
    expect(resolveObserverBounds({
      primitiveOrCollision: primitive,
      fallbackPosition: [0, 0, 0],
    })).toEqual({ bounds: primitive, provenance: "primitive-or-collision" });
    expect(resolveObserverBounds({
      loadedDigest: imported,
      primitiveOrCollision: primitive,
      fallbackPosition: [0, 0, 0],
    })).toEqual({ bounds: imported, provenance: "derived-from-loaded-digest" });
    const missing = resolveObserverBounds({ fallbackPosition: [4, 5, 6] });
    expect(missing.provenance).toBe("authored-fallback");
    expect(boundsContains(missing.bounds, [4, 5, 6])).toBe(true);
    expect(resolveObserverBounds({
      registered: marble,
      loadedDigest: imported,
      fallbackPosition: [0, 0, 0],
    })).toEqual({ bounds: marble, provenance: "registered" });
  });
});
