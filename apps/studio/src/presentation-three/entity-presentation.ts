import * as THREE from "three";

import type { Entity } from "@demiurges/world";

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
