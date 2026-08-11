import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import {
  DIAGNOSTIC_RIGID_ASSET,
  type Entity,
  type EpisodeSample,
  type Snapshot,
} from "@demiurges/world";

const DIAGNOSTIC_RIGID_ASSET_URL = new URL(
  "../../../../packages/world/assets/diagnostic-wedge-v1.glb",
  import.meta.url,
).href;

interface ThreeViewportProps {
  readonly snapshot?: Snapshot;
  readonly sample?: EpisodeSample;
  readonly selectedRef?: Entity["ref"];
  readonly onSelect?: (ref: Entity["ref"]) => void;
}

interface EntityObject {
  readonly root: THREE.Object3D;
  readonly signature: string;
  active: boolean;
}

function visualSignature(entity: Entity): string {
  return JSON.stringify(entity.representations.visual);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

function setSelected(root: THREE.Object3D, selected: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.set(selected ? "#15343d" : "#000000");
        material.emissiveIntensity = selected ? 0.55 : 0;
      }
    }
  });
}

export function ThreeViewport(props: ThreeViewportProps) {
  let container!: HTMLDivElement;
  const [ready, setReady] = createSignal(false);
  const objects = new Map<Entity["ref"], EntityObject>();
  const loader = new GLTFLoader();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let disposed = false;

  const renderScene = () => {
    if (scene && camera && renderer) renderer.render(scene, camera);
  };

  const removeObject = (ref: Entity["ref"]) => {
    const current = objects.get(ref);
    if (!current) return;
    current.active = false;
    scene?.remove(current.root);
    objects.delete(ref);
    disposeObject(current.root);
  };

  const createObject = (entity: Entity): EntityObject => {
    const visual = entity.representations.visual;
    if (visual.kind === "box") {
      const [hx, hy, hz] = visual.halfExtents;
      const geometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
      const material = new THREE.MeshStandardMaterial({
        color: visual.color,
        roughness: entity.physics.bodyType === "static" ? 0.92 : 0.58,
        metalness: 0.02,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = entity.physics.bodyType === "dynamic";
      mesh.receiveShadow = true;
      mesh.name = entity.ref;
      mesh.userData.entityRef = entity.ref;
      return { root: mesh, signature: visualSignature(entity), active: true };
    }

    if (
      visual.assetId !== DIAGNOSTIC_RIGID_ASSET.assetId ||
      visual.contentDigest !== DIAGNOSTIC_RIGID_ASSET.contentDigest
    ) {
      throw new Error(`未登记 imported visual：${visual.assetId}`);
    }

    const root = new THREE.Group();
    root.name = entity.ref;
    root.userData.entityRef = entity.ref;
    const record: EntityObject = {
      root,
      signature: visualSignature(entity),
      active: true,
    };
    container.dataset.assetStatus = "loading";
    loader.load(
      DIAGNOSTIC_RIGID_ASSET_URL,
      (gltf) => {
        if (disposed || !record.active || objects.get(entity.ref) !== record) {
          disposeObject(gltf.scene);
          return;
        }
        const content = gltf.scene;
        const transform = visual.localTransform;
        content.position.set(...transform.position);
        content.quaternion.set(
          transform.rotation.x,
          transform.rotation.y,
          transform.rotation.z,
          transform.rotation.w,
        );
        content.scale.set(
          transform.scale[0] * visual.sourceUnitMeters,
          transform.scale[1] * visual.sourceUnitMeters,
          transform.scale[2] * visual.sourceUnitMeters,
        );
        content.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });
        root.add(content);
        container.dataset.assetStatus = "loaded";
        container.dataset.assetEntityRef = entity.ref;
        setSelected(root, props.selectedRef === entity.ref);
        renderScene();
      },
      undefined,
      () => {
        if (!record.active || objects.get(entity.ref) !== record) return;
        container.dataset.assetStatus = "error";
        renderScene();
      },
    );
    return record;
  };

  const syncObjects = (snapshot: Snapshot | undefined) => {
    if (!scene) return;
    const entities = new Map(
      snapshot?.entities.map((entity) => [entity.ref, entity] as const) ?? [],
    );
    for (const [ref, current] of objects) {
      const entity = entities.get(ref);
      if (entity && current.signature === visualSignature(entity)) continue;
      removeObject(ref);
    }
    for (const entity of entities.values()) {
      if (objects.has(entity.ref)) continue;
      const object = createObject(entity);
      objects.set(entity.ref, object);
      scene.add(object.root);
    }
    const hasImportedVisual = [...entities.values()].some(
      (entity) => entity.representations.visual.kind === "imported-rigid-mesh",
    );
    if (!hasImportedVisual) {
      delete container.dataset.assetStatus;
      delete container.dataset.assetEntityRef;
    }
  };

  const selectAtPointer = (event: PointerEvent) => {
    if (!camera || !renderer) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(
      [...objects.values()].map((record) => record.root),
      true,
    )[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && typeof object.userData.entityRef !== "string") {
      object = object.parent;
    }
    if (object?.userData.entityRef) {
      props.onSelect?.(object.userData.entityRef as Entity["ref"]);
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
    renderer.domElement.addEventListener("pointerdown", selectAtPointer);
    container.append(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#f4f0e6", "#53635d", 2.2));
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
    const selectedRef = props.selectedRef;
    syncObjects(snapshot);

    for (const entity of snapshot?.entities ?? []) {
      const object = objects.get(entity.ref)?.root;
      if (!object) continue;
      const state = sample ? sample.states[entity.ref] : entity.state;
      if (!state) {
        object.visible = false;
        continue;
      }
      object.visible = true;
      const [x, y, z] = state.pose.position;
      const rotation = state.pose.rotation;
      object.position.set(x, y, z);
      object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      setSelected(object, selectedRef === entity.ref);
    }
    renderScene();
  });

  onCleanup(() => {
    disposed = true;
    resizeObserver?.disconnect();
    renderer?.domElement.removeEventListener("pointerdown", selectAtPointer);
    for (const ref of [...objects.keys()]) removeObject(ref);
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  return <div class="world-viewport" data-testid="world-viewport" ref={container} />;
}
