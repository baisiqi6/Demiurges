import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import * as THREE from "three";

import type { Entity, EpisodeSample, Snapshot } from "@demiurges/world";

interface ThreeViewportProps {
  readonly snapshot?: Snapshot;
  readonly sample?: EpisodeSample;
}

export function ThreeViewport(props: ThreeViewportProps) {
  let container!: HTMLDivElement;
  const [ready, setReady] = createSignal(false);
  const meshes = new Map<Entity["ref"], THREE.Mesh>();
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const renderScene = () => {
    if (scene && camera && renderer) {
      renderer.render(scene, camera);
    }
  };

  const disposeMesh = (mesh: THREE.Mesh) => {
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material.dispose());
  };

  const syncMeshes = (snapshot: Snapshot | undefined) => {
    if (!scene) return;
    const visibleRefs = new Set(snapshot?.entities.map((entity) => entity.ref) ?? []);
    for (const [ref, mesh] of meshes) {
      if (visibleRefs.has(ref)) continue;
      scene.remove(mesh);
      meshes.delete(ref);
      disposeMesh(mesh);
    }
    for (const entity of snapshot?.entities ?? []) {
      if (meshes.has(entity.ref)) continue;
      const shape = entity.representations.visual;
      const [hx, hy, hz] = shape.halfExtents;
      const geometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
      const material = new THREE.MeshStandardMaterial({
        color: shape.color,
        roughness: entity.physics.bodyType === "static" ? 0.92 : 0.58,
        metalness: 0.02,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = entity.physics.bodyType === "dynamic";
      mesh.receiveShadow = true;
      mesh.name = entity.ref;
      meshes.set(entity.ref, mesh);
      scene.add(mesh);
    }
  };

  onMount(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#dce2dc");
    scene.fog = new THREE.Fog("#dce2dc", 8, 15);

    camera = new THREE.PerspectiveCamera(42, 1, 0.01, 40);
    camera.up.set(0, 0, 1);
    camera.position.set(4.4, -5.4, 3.4);
    camera.lookAt(0, 0, 0.55);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = "world-canvas";
    renderer.domElement.setAttribute("aria-label", "Demiurges 三维世界观察窗口");
    container.append(renderer.domElement);

    const skyLight = new THREE.HemisphereLight("#f4f0e6", "#53635d", 2.2);
    scene.add(skyLight);

    const keyLight = new THREE.DirectionalLight("#fff0dc", 3.2);
    keyLight.position.set(-3, -4, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const axes = new THREE.AxesHelper(0.65);
    axes.position.set(-2.7, -2.7, 0.01);
    scene.add(axes);

    resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !camera || !renderer) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderScene();
    });
    resizeObserver.observe(container);
    setReady(true);
  });

  createEffect(() => {
    if (!ready()) return;
    const sample = props.sample;
    const snapshot = props.snapshot;
    syncMeshes(snapshot);

    for (const entity of snapshot?.entities ?? []) {
      const mesh = meshes.get(entity.ref);
      if (!mesh) continue;
      const state = sample?.states[entity.ref] ?? entity.state;
      const [x, y, z] = state.pose.position;
      const rotation = state.pose.rotation;
      mesh.position.set(x, y, z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
    renderScene();
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    for (const mesh of meshes.values()) {
      disposeMesh(mesh);
    }
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  return <div class="world-viewport" data-testid="world-viewport" ref={container} />;
}
