import * as THREE from "three";

import type { Entity } from "@demiurges/world";
import { resolveRegisteredPresentationAsset } from "./registered-presentation";

function applyPose(object: THREE.Object3D, pose: Entity["state"]["pose"]): void {
  object.position.set(pose.position[0], pose.position[1], pose.position[2]);
  object.quaternion.set(
    pose.rotation.x,
    pose.rotation.y,
    pose.rotation.z,
    pose.rotation.w,
  );
}

function collisionMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: "#d78331",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    wireframe: true,
  });
}

function collisionMesh(
  entity: Entity,
  partKey: string,
  geometry: THREE.BufferGeometry,
  pose?: Entity["state"]["pose"],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, collisionMaterial());
  mesh.userData.entityRef = entity.ref;
  mesh.userData.partKey = partKey;
  if (pose) applyPose(mesh, pose);
  return mesh;
}

export function createCollisionOverlay(entity: Entity): THREE.Group {
  const root = new THREE.Group();
  root.name = `${entity.ref}:collision`;
  root.userData.entityRef = entity.ref;
  const collision = entity.representations.collision;
  if (collision.kind === "box") {
    const [hx, hy, hz] = collision.halfExtents;
    root.add(collisionMesh(
      entity,
      "body",
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
    ));
    return root;
  }
  if (collision.kind === "sphere") {
    root.add(collisionMesh(
      entity,
      "body",
      new THREE.SphereGeometry(collision.radius, 24, 16),
    ));
    return root;
  }
  if (collision.kind === "none") return root;
  for (const part of collision.parts) {
    const [hx, hy, hz] = part.shape.halfExtents;
    root.add(collisionMesh(
      entity,
      part.partKey,
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      part.localPose,
    ));
  }
  return root;
}

export function setCollisionOverlayVisible(
  root: THREE.Group,
  visible: boolean,
): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (!(material instanceof THREE.MeshBasicMaterial)) return;
    material.opacity = visible ? 0.72 : 0;
    material.depthWrite = visible;
  });
}

export function createRimFrameOverlay(entity: Entity): THREE.Group | undefined {
  const semantic = entity.representations.semantic;
  if (semantic?.kind !== "vessel") return undefined;
  const root = new THREE.Group();
  root.name = semantic.rimFrame.ref;
  root.userData.entityRef = entity.ref;
  root.userData.frameRef = semantic.rimFrame.ref;
  applyPose(root, semantic.rimFrame.localPose);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      semantic.innerEnvelope.radiusMeters - 0.008,
      semantic.innerEnvelope.radiusMeters + 0.008,
      64,
    ),
    new THREE.MeshBasicMaterial({
      color: "#16839a",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  ring.userData.entityRef = entity.ref;
  ring.userData.frameRef = semantic.rimFrame.ref;
  const axes = new THREE.AxesHelper(0.22);
  axes.userData.entityRef = entity.ref;
  axes.userData.frameRef = semantic.rimFrame.ref;
  root.add(ring, axes);
  return root;
}

function addCalibrationBounds(
  root: THREE.Group,
  representation: Extract<
    Entity["representations"]["visual"] | NonNullable<Entity["representations"]["observation"]>,
    { kind: "registered-rigid-mesh" | "registered-gaussian-splat" }
  >,
  color: THREE.ColorRepresentation,
): void {
  const resolved = resolveRegisteredPresentationAsset(representation);
  const bounds = resolved.calibration.targetBounds;
  const helper = new THREE.Box3Helper(
    new THREE.Box3(
      new THREE.Vector3(...bounds.min),
      new THREE.Vector3(...bounds.max),
    ),
    color,
  );
  helper.userData.assetId = resolved.asset.assetId;
  helper.userData.calibrationId = resolved.calibration.id;
  helper.userData.witnessId = resolved.witness.id;
  root.add(helper);
}

export function createAlignmentOverlay(entity: Entity): THREE.Group | undefined {
  const visual = entity.representations.visual;
  const observation = entity.representations.observation;
  if (
    visual.kind !== "registered-rigid-mesh" &&
    observation?.kind !== "registered-gaussian-splat"
  ) return undefined;
  const root = new THREE.Group();
  root.name = `${entity.ref}:alignment`;
  root.userData.entityRef = entity.ref;
  if (visual.kind === "registered-rigid-mesh") {
    addCalibrationBounds(root, visual, "#27a8a2");
  }
  if (observation?.kind === "registered-gaussian-splat") {
    addCalibrationBounds(root, observation, "#d45bb6");
  }
  const axes = new THREE.AxesHelper(0.45);
  axes.userData.entityRef = entity.ref;
  root.add(axes);
  return root;
}

function linkMesh(
  entity: Entity,
  name: string,
  length: number,
  color: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.05, Math.max(0, length - 0.1), 8, 20),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.08 }),
  );
  mesh.name = name;
  mesh.userData.entityRef = entity.ref;
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.x = length / 2;
  mesh.castShadow = true;
  return mesh;
}

export function createArticulatedArmPresentation(entity: Entity): THREE.Group | undefined {
  if (entity.representations.semantic?.kind !== "articulated") return undefined;
  const root = new THREE.Group();
  root.name = "entity:arm:articulated";
  root.userData.entityRef = entity.ref;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.14, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.62 }),
  );
  base.rotation.x = Math.PI / 2;
  base.position.z = -0.05;
  base.userData.entityRef = entity.ref;
  base.userData.linkRef = "link:arm-base";

  const shoulder = new THREE.Group();
  shoulder.name = "joint:arm-shoulder";
  shoulder.userData.entityRef = entity.ref;
  shoulder.userData.jointRef = "joint:arm-shoulder";
  const upper = linkMesh(entity, "link:arm-upper", 0.55, "#d97757");
  upper.userData.linkRef = "link:arm-upper";
  const elbowMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 20, 12),
    new THREE.MeshStandardMaterial({ color: "#f4b183", roughness: 0.38 }),
  );
  elbowMarker.position.x = 0.55;
  elbowMarker.userData.entityRef = entity.ref;

  const elbow = new THREE.Group();
  elbow.name = "joint:arm-elbow";
  elbow.position.x = 0.55;
  elbow.userData.entityRef = entity.ref;
  elbow.userData.jointRef = "joint:arm-elbow";
  const forearm = linkMesh(entity, "link:arm-forearm", 0.45, "#2f6f73");
  forearm.userData.linkRef = "link:arm-forearm";
  const tool = new THREE.AxesHelper(0.13);
  tool.name = "frame:arm-tool";
  tool.position.x = 0.45;
  tool.userData.entityRef = entity.ref;
  tool.userData.frameRef = "frame:arm-tool";
  elbow.add(forearm, tool);
  shoulder.add(upper, elbowMarker, elbow);
  root.add(base, shoulder);
  return root;
}

export function applyArticulatedArmState(
  root: THREE.Group,
  state: Entity["state"],
): void {
  const joints = state.articulated?.joints;
  if (!joints || joints.length !== 2) throw new Error("articulated Presentation state 缺失");
  const shoulder = root.getObjectByName("joint:arm-shoulder");
  const elbow = root.getObjectByName("joint:arm-elbow");
  if (!shoulder || !elbow) throw new Error("articulated Presentation hierarchy 缺失");
  shoulder.rotation.z = joints[0]!.positionRadians;
  elbow.rotation.z = joints[1]!.positionRadians;
}
