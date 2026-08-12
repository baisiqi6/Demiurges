import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  BALL_REF,
  BALL_VESSEL_ASSET,
  DIAGNOSTIC_RIGID_ASSET,
  createBallVesselSnapshot,
  createFixtureSnapshot,
  createTwoJointReachSnapshot,
} from "@demiurges/world";
import {
  createCollisionOverlay,
  createArticulatedArmPresentation,
  applyArticulatedArmState,
  createRimFrameOverlay,
} from "./entity-presentation";
import { resolveImportedVisualAsset } from "./presentation-assets";

describe("Three.js Entity presentation", () => {
  test("sphere 与 compound overlay 都保留单一 EntityRef selection identity", () => {
    const snapshot = createBallVesselSnapshot();
    const vessel = snapshot.entities.find((entity) => entity.ref === "entity:vessel")!;
    const ball = snapshot.entities.find((entity) => entity.ref === BALL_REF)!;
    const vesselOverlay = createCollisionOverlay(vessel);
    const ballOverlay = createCollisionOverlay(ball);

    expect(vesselOverlay.children).toHaveLength(17);
    expect(vesselOverlay.children.every((child) => child.userData.entityRef === vessel.ref)).toBe(true);
    expect(vesselOverlay.children.map((child) => child.userData.partKey)).toEqual([
      "base",
      ...Array.from({ length: 16 }, (_, index) => `wall-${String(index).padStart(2, "0")}`),
    ]);
    expect(ballOverlay.children).toHaveLength(1);
    expect(ballOverlay.children[0]?.userData.entityRef).toBe(BALL_REF);
  });

  test("rim-center helper 使用受信 semantic local pose，不从 mesh bounds 推导", () => {
    const vessel = createBallVesselSnapshot().entities.find(
      (entity) => entity.ref === "entity:vessel",
    )!;
    const frame = createRimFrameOverlay(vessel);

    expect(frame).toBeInstanceOf(THREE.Group);
    expect(frame?.name).toBe("frame:vessel-rim-center");
    expect(frame?.position.toArray()).toEqual([0, 0, 0.65]);
    expect(frame?.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(frame?.userData.entityRef).toBe(vessel.ref);
    expect(frame?.userData.frameRef).toBe("frame:vessel-rim-center");
  });

  test("imported visual URL 只由 repo-owned identity registry 解析", () => {
    const diagnostic = createFixtureSnapshot(2.8, "fixture:diagnostic-wedge-v1")
      .entities.find((entity) => entity.ref === "entity:cube")!;
    const vessel = createBallVesselSnapshot().entities.find(
      (entity) => entity.ref === "entity:vessel",
    )!;
    if (diagnostic.representations.visual.kind !== "imported-rigid-mesh") throw new Error();
    if (vessel.representations.visual.kind !== "imported-rigid-mesh") throw new Error();

    expect(resolveImportedVisualAsset(diagnostic.representations.visual)).toMatchObject({
      assetId: DIAGNOSTIC_RIGID_ASSET.assetId,
      contentDigest: DIAGNOSTIC_RIGID_ASSET.contentDigest,
      provenance: DIAGNOSTIC_RIGID_ASSET.provenance,
    });
    const resolvedVessel = resolveImportedVisualAsset(vessel.representations.visual);
    expect(resolvedVessel).toMatchObject({
      assetId: BALL_VESSEL_ASSET.assetId,
      contentDigest: BALL_VESSEL_ASSET.contentDigest,
      provenance: BALL_VESSEL_ASSET.provenance,
    });
    expect(Object.isFrozen(resolvedVessel)).toBe(true);
    expect(Object.isFrozen(resolvedVessel.provenance)).toBe(true);
    const originalUrl = resolvedVessel.url;
    expect(() => {
      (resolvedVessel as unknown as { url: string }).url = "https://attacker.invalid/vessel.glb";
    }).toThrow(TypeError);
    expect(resolveImportedVisualAsset(vessel.representations.visual).url).toBe(originalUrl);

    const forged = {
      ...vessel.representations.visual,
      contentDigest: DIAGNOSTIC_RIGID_ASSET.contentDigest,
    };
    expect(() => resolveImportedVisualAsset(forged)).toThrow("未登记 imported visual");
  });

  test("articulated arm 保持单一 EntityRef，并由 Episode joint state 驱动 link hierarchy", () => {
    const arm = createTwoJointReachSnapshot().entities.find((entity) => entity.ref === "entity:arm")!;
    const root = createArticulatedArmPresentation(arm)!;
    applyArticulatedArmState(root, {
      ...arm.state,
      articulated: { joints: [
        { jointRef: "joint:arm-shoulder", positionRadians: 0.65, velocityRadiansPerSecond: 0 },
        { jointRef: "joint:arm-elbow", positionRadians: -1, velocityRadiansPerSecond: 0 },
      ] },
    });
    expect(root.getObjectByName("joint:arm-shoulder")?.rotation.z).toBe(0.65);
    expect(root.getObjectByName("joint:arm-elbow")?.rotation.z).toBe(-1);
    expect(root.getObjectByName("frame:arm-tool")?.userData.frameRef).toBe("frame:arm-tool");
    expect(root.children.every((child) => child.userData.entityRef === arm.ref)).toBe(true);
  });
});
