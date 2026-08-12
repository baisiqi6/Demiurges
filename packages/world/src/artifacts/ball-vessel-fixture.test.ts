import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { isDeepFrozen } from "../kernel/world";
import {
  BALL_REF,
  BALL_VESSEL_ASSET,
  BALL_VESSEL_FIXTURE,
  BALL_VESSEL_FIXTURE_ID,
  VESSEL_REF,
  createBallVesselSnapshot,
  requireBallVesselSnapshot,
  vesselLocalPointToWorld,
} from "./ball-vessel-fixture";

const ASSET_PATH = fileURLToPath(
  new URL("../../assets/smooth-vessel-v1.glb", import.meta.url),
);

describe("Ball-vessel deterministic fixture", () => {
  test("cross-engine fixture registry 不在运行时重算三角函数 pose", async () => {
    const source = await Bun.file(new URL("./ball-vessel-fixture.ts", import.meta.url)).text();
    expect(source).not.toContain("Math.sin");
    expect(source).not.toContain("Math.cos");
    expect(BALL_VESSEL_FIXTURE.collision.parts).toHaveLength(17);
  });

  test("repo-owned smooth GLB bytes、bounds 与 provenance 完全闭合", () => {
    const bytes = readFileSync(ASSET_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");

    expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(bytes.byteLength).toBe(BALL_VESSEL_ASSET.byteLength);
    expect(`sha256:${digest}`).toBe(BALL_VESSEL_ASSET.contentDigest);
    expect(BALL_VESSEL_ASSET.provenance).toEqual({
      origin: "generated-in-repo",
      generator: "scripts/generate-smooth-vessel-glb.mjs",
      license: "CC0-1.0",
    });
    expect(BALL_VESSEL_ASSET.radialSegments).toBeGreaterThanOrEqual(48);
    expect(isDeepFrozen(BALL_VESSEL_ASSET)).toBe(true);

    const jsonChunkLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(
      bytes.subarray(20, 20 + jsonChunkLength).toString("utf8").trim(),
    ) as {
      accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
      meshes: Array<{
        primitives: Array<{
          mode: number;
          indices: number;
          attributes: { POSITION: number };
        }>;
      }>;
    };
    const positionAccessor = gltf.accessors[
      gltf.meshes[0]!.primitives[0]!.attributes.POSITION
    ]!;
    positionAccessor.min?.forEach((value, axis) => {
      expect(value).toBeCloseTo([-0.52, 0, -0.52][axis]!, 7);
    });
    positionAccessor.max?.forEach((value, axis) => {
      expect(value).toBeCloseTo([0.52, 0.65, 0.52][axis]!, 7);
    });
    expect(positionAccessor.count).toBe(585);
    expect(gltf.meshes[0]!.primitives[0]!.mode).toBe(4);
    expect(gltf.accessors[gltf.meshes[0]!.primitives[0]!.indices]!.count).toBe(3_072);
    expect(JSON.stringify(gltf)).not.toMatch(/api[_-]?key|credential|secret|token/i);
  });

  test("canonical Snapshot 恰好是 floor + one vessel Entity + dynamic ball", () => {
    const snapshot = createBallVesselSnapshot();
    expect(snapshot.id).toBe("snapshot:base-ball-vessel");
    expect(snapshot.entities.map((entity) => entity.ref)).toEqual([
      "entity:floor",
      VESSEL_REF,
      BALL_REF,
    ]);
    const vessel = snapshot.entities.find((entity) => entity.ref === VESSEL_REF)!;
    const ball = snapshot.entities.find((entity) => entity.ref === BALL_REF)!;
    expect(vessel.physics.bodyType).toBe("static");
    expect(vessel.representations.visual).toMatchObject({
      kind: "imported-rigid-mesh",
      assetId: BALL_VESSEL_ASSET.assetId,
      contentDigest: BALL_VESSEL_ASSET.contentDigest,
    });
    expect(vessel.representations.collision.kind).toBe("compound");
    if (vessel.representations.collision.kind !== "compound") {
      throw new Error("vessel collision 不是 compound");
    }
    expect(vessel.representations.collision.parts).toHaveLength(17);
    expect(vessel.representations.collision.parts.map((part) => part.partKey)).toEqual([
      "base",
      ...Array.from({ length: 16 }, (_, index) => `wall-${String(index).padStart(2, "0")}`),
    ]);
    expect(new Set(vessel.representations.collision.parts.map((part) => part.partKey)).size)
      .toBe(17);
    expect(vessel.representations.semantic).toEqual(
      BALL_VESSEL_FIXTURE.semantic,
    );
    expect(ball.physics.bodyType).toBe("dynamic");
    expect(ball.physics.massKg).toBeGreaterThan(0);
    expect(ball.representations.visual).toMatchObject({ kind: "sphere", radius: 0.1 });
    expect(ball.representations.collision).toEqual({ kind: "sphere", radius: 0.1 });
    expect(ball.representations.semantic).toBeNull();
    expect(snapshot.entities.some((entity) => entity.ref.includes("part"))).toBe(false);
    expect(isDeepFrozen(snapshot)).toBe(true);
    expect(() => requireBallVesselSnapshot(snapshot)).not.toThrow();
  });

  test("registered ball-vessel identity 在 Kernel admission 拒绝 floor/ball representation 与 vessel physics 漂移", () => {
    const floorExtentDrift = structuredClone(createBallVesselSnapshot());
    const floor = floorExtentDrift.entities.find((entity) => entity.ref === "entity:floor")!;
    if (floor.representations.visual.kind !== "box" ||
      floor.representations.collision.kind !== "box") {
      throw new Error("fixture floor 必须是 box representation");
    }
    floor.representations.visual.halfExtents = [9.9, 9.9, 0.05];
    floor.representations.collision.halfExtents = [9.9, 9.9, 0.05];
    expect(() => requireBallVesselSnapshot(floorExtentDrift)).toThrow(
      "fixture registry 漂移",
    );

    const ballColorDrift = structuredClone(createBallVesselSnapshot());
    const ball = ballColorDrift.entities.find((entity) => entity.ref === BALL_REF)!;
    if (ball.representations.visual.kind !== "sphere") {
      throw new Error("fixture ball 必须是 sphere visual");
    }
    ball.representations.visual.color = "#000000";
    expect(() => requireBallVesselSnapshot(ballColorDrift)).toThrow(
      "fixture registry 漂移",
    );

    const vesselPhysicsDrift = structuredClone(createBallVesselSnapshot());
    const vessel = vesselPhysicsDrift.entities.find((entity) => entity.ref === VESSEL_REF)!;
    vessel.physics.friction = 0.01;
    expect(() => requireBallVesselSnapshot(vesselPhysicsDrift)).toThrow(
      "vessel physics 与 fixture registry 漂移",
    );
  });

  test("translated + yaw vessel 对 rim 与 off-axis diagnostic point 使用同一 pose composition", () => {
    const snapshot = structuredClone(createBallVesselSnapshot());
    const vessel = snapshot.entities.find((entity) => entity.ref === VESSEL_REF)!;
    vessel.state.pose = {
      position: [1.25, -0.5, 0.2],
      rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
    };
    const translatedYaw = structuredClone(snapshot);
    expect(() => requireBallVesselSnapshot(translatedYaw)).not.toThrow();
    const offAxisWorld = vesselLocalPointToWorld(vessel.state.pose, [0.2, 0, 0.65]);
    [1.25, -0.3, 0.85].forEach((value, axis) => {
      expect(offAxisWorld[axis]).toBeCloseTo(value, 12);
    });
    const rimWorld = vesselLocalPointToWorld(
      vessel.state.pose,
      BALL_VESSEL_FIXTURE.semantic.rimFrame.localPose.position,
    );
    [1.25, -0.5, 0.85].forEach((value, axis) => {
      expect(rimWorld[axis]).toBeCloseTo(value, 12);
    });
  });

  test("artifact、rim、compound part identity/local pose 任一漂移都 fail closed", () => {
    const digestDrift = structuredClone(createBallVesselSnapshot()) as any;
    digestDrift.entities[1].representations.visual.contentDigest =
      `sha256:${"0".repeat(64)}`;
    expect(() => requireBallVesselSnapshot(digestDrift)).toThrow("artifact identity");

    const rimDrift = structuredClone(createBallVesselSnapshot()) as any;
    rimDrift.entities[1].representations.semantic.rimFrame.localPose.position[2] += 0.01;
    expect(() => requireBallVesselSnapshot(rimDrift)).toThrow("rim-center");

    const duplicatePart = structuredClone(createBallVesselSnapshot()) as any;
    duplicatePart.entities[1].representations.collision.parts[1].partKey = "base";
    expect(() => requireBallVesselSnapshot(duplicatePart)).toThrow("partKey");

    const sparsePose = structuredClone(createBallVesselSnapshot()) as any;
    sparsePose.entities[1].representations.collision.parts[1].localPose.position =
      new Array(3);
    expect(() => requireBallVesselSnapshot(sparsePose)).toThrow("dense");

    const nonFinitePose = structuredClone(createBallVesselSnapshot()) as any;
    nonFinitePose.entities[1].representations.collision.parts[1]
      .localPose.rotation.w = Number.NaN;
    expect(() => requireBallVesselSnapshot(nonFinitePose)).toThrow("有限数值");

    let getterReads = 0;
    const accessorPose = structuredClone(createBallVesselSnapshot()) as any;
    Object.defineProperty(
      accessorPose.entities[1].representations.collision.parts[1].localPose,
      "position",
      {
        enumerable: true,
        get() {
          getterReads += 1;
          return [0, 0, 0];
        },
      },
    );
    expect(() => requireBallVesselSnapshot(accessorPose)).toThrow("own-data");
    expect(getterReads).toBe(0);

    const extraPart = structuredClone(createBallVesselSnapshot()) as any;
    extraPart.entities[1].representations.collision.parts.push(
      structuredClone(extraPart.entities[1].representations.collision.parts[1]),
    );
    extraPart.entities[1].representations.collision.parts.at(-1).partKey = "wall-extra";
    expect(() => requireBallVesselSnapshot(extraPart)).toThrow("17");
  });

  test("fixture identity 是 closed constant，不接受第四种或 caller-authored artifact", () => {
    expect(BALL_VESSEL_FIXTURE_ID).toBe("fixture:ball-vessel-v1");
    expect(Object.keys(BALL_VESSEL_FIXTURE).sort()).toEqual([
      "artifact",
      "ball",
      "collision",
      "fixtureId",
      "semantic",
    ]);
  });
});
