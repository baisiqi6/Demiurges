import { describe, expect, test } from "bun:test";

import {
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  RuntimeMvpHost,
  WorldToolSurface,
  admitMarbleHunyuanCompositeEdit,
  canonicalJsonBytes,
  requireWorldEditInput,
} from "./index";

function createWorld() {
  const surface = new WorldToolSurface(new RuntimeMvpHost());
  surface.write({ fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID });
  return { surface, world: surface.read() };
}

function input(world: ReturnType<typeof createWorld>["world"], pose: unknown) {
  return {
    expected: world.ref,
    targetRef: "entity:generated-object",
    change: { kind: "pose", frameRef: "frame:world", pose },
  };
}

describe("DH-015 composite human authoring admission", () => {
  test("accepts one canonical world-Z pose and emits reparsable wire data", () => {
    const { world } = createWorld();
    const half = Math.SQRT1_2;
    const result = admitMarbleHunyuanCompositeEdit(world, input(world, {
      position: { x: 0.5, y: -0.25, z: 1.2 },
      rotation: { x: 0, y: 0, z: half, w: half },
    }));

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.canonicalWireInput.change.pose.position).toEqual({ x: 0.5, y: -0.25, z: 1.2 });
    expect(canonicalJsonBytes(requireWorldEditInput(result.canonicalWireInput))).toEqual(
      canonicalJsonBytes(result.parsedInput),
    );
  });

  test("returns unchanged for a semantic no-op without touching Repository sequence", () => {
    const { surface, world } = createWorld();
    const noOp = admitMarbleHunyuanCompositeEdit(world, input(world, {
      position: { x: 0, y: 0, z: 1.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }));
    expect(noOp).toEqual({ status: "unchanged" });

    const accepted = admitMarbleHunyuanCompositeEdit(world, input(world, {
      position: { x: 0.25, y: 0, z: 1.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }));
    if (accepted.status !== "accepted") throw new Error("expected accepted");
    const update = surface.edit(accepted.canonicalWireInput);
    expect(update.update.status).toBe("updated");
    if (update.update.status === "updated") expect(update.update.snapshot.id).toBe("snapshot:edit-1");
  });

  test("separates structural invalidity from composite pose invalidity", () => {
    const { world } = createWorld();
    expect(admitMarbleHunyuanCompositeEdit(world, { nope: true })).toEqual({
      status: "rejected", code: "INVALID_REQUEST",
    });
    expect(admitMarbleHunyuanCompositeEdit(world, {
      expected: world.ref,
      targetRef: "entity:generated-object",
      change: { kind: "joint-state", joints: [null, null] },
    })).toEqual({ status: "rejected", code: "INVALID_REQUEST" });
    const sparseJoints = Array(2);
    let accessorReads = 0;
    const accessorJoints = Array(2);
    Object.defineProperty(accessorJoints, "0", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return null;
      },
    });
    Object.defineProperty(accessorJoints, "1", { enumerable: true, value: null });
    const exactJoints = [
      { jointRef: "joint:arm-shoulder", positionRadians: 0, velocityRadiansPerSecond: 0 },
      { jointRef: "joint:arm-elbow", positionRadians: 0, velocityRadiansPerSecond: 0 },
    ];
    for (const joints of [
      sparseJoints,
      accessorJoints,
      [{ ...exactJoints[0], extra: true }, exactJoints[1]],
      [{ ...exactJoints[0], jointRef: 1 }, exactJoints[1]],
      [{ ...exactJoints[0], positionRadians: "0" }, exactJoints[1]],
    ]) {
      expect(admitMarbleHunyuanCompositeEdit(world, {
        expected: world.ref,
        targetRef: "entity:generated-object",
        change: { kind: "joint-state", joints },
      })).toEqual({ status: "rejected", code: "INVALID_REQUEST" });
    }
    expect(accessorReads).toBe(0);
    expect(admitMarbleHunyuanCompositeEdit(world, {
      expected: world.ref,
      targetRef: "entity:generated-object",
      change: { kind: "joint-state", joints: exactJoints },
    })).toEqual({ status: "rejected", code: "FIXTURE_NOT_COMPOSABLE" });
    for (const pose of [
      { position: { x: -0, y: 0, z: 1.2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { position: { x: 5, y: 0, z: 1.2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { position: { x: 0, y: 0, z: 1.2 }, rotation: { x: 1, y: 0, z: 0, w: 0 } },
      { position: { x: 0, y: 0, z: 1.2 }, rotation: { x: 0, y: 0, z: 0, w: -1 } },
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ]) {
      expect(admitMarbleHunyuanCompositeEdit(world, input(world, pose))).toEqual({
        status: "rejected", code: "POSE_NOT_COMPOSABLE",
      });
    }
  });

  test("rejects stale and non-composite authority before mutation", () => {
    const { world } = createWorld();
    const stale = input(world, {
      position: { x: 0.2, y: 0, z: 1.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }) as Record<string, unknown>;
    stale.expected = { ...world.ref, version: world.ref.version + 1 };
    expect(admitMarbleHunyuanCompositeEdit(world, stale)).toEqual({
      status: "rejected", code: "STALE_REF",
    });

    const primitive = new WorldToolSurface(new RuntimeMvpHost());
    primitive.write({ fixtureId: "fixture:primitive-box" });
    const other = primitive.read();
    expect(admitMarbleHunyuanCompositeEdit(other, input(other as typeof world, {
      position: { x: 0.2, y: 0, z: 1.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }))).toEqual({ status: "rejected", code: "FIXTURE_NOT_COMPOSABLE" });
  });
});
