import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SparkRenderer, SplatFileType, SplatMesh } from "@sparkjsdev/spark";

import {
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  type Entity,
  type EpisodeSample,
  type Snapshot,
} from "@demiurges/world";
import type { PresentationMode } from "../presentation-model";
import {
  createAlignmentEvidence,
  type AlignmentEvidence,
  type Bounds3,
} from "./alignment-evidence";
import {
  createCollisionOverlay,
  createArticulatedArmPresentation,
  applyArticulatedArmState,
  createRimFrameOverlay,
  setCollisionOverlayVisible,
} from "./entity-presentation";
import { resolveImportedVisualAsset } from "./presentation-assets";

const DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET_URL = new URL(
  "../../../../packages/world/assets/diagnostic-wedge-3dgs-v1.ply",
  import.meta.url,
).href;

export type { PresentationMode } from "../presentation-model";

interface ThreeViewportProps {
  readonly snapshot?: Snapshot;
  readonly sample?: EpisodeSample;
  readonly selectedRef?: Entity["ref"];
  readonly presentationMode: PresentationMode;
  readonly onSelect?: (ref: Entity["ref"]) => void;
  readonly onAlignmentEvidence?: (evidence: AlignmentEvidence | undefined) => void;
}

interface EntityObject {
  readonly root: THREE.Object3D;
  readonly signature: string;
  readonly visualRoot: THREE.Group;
  readonly observationRoot?: THREE.Group;
  readonly collisionRoot: THREE.Group;
  readonly rimFrameRoot?: THREE.Group;
  readonly articulatedRoot?: THREE.Group;
  active: boolean;
  splat?: SplatMesh;
  observedSourceBounds?: Bounds3;
}

function visualSignature(entity: Entity): string {
  return JSON.stringify(entity.representations);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof SplatMesh) return;
    if (!("geometry" in object) || !(object.geometry instanceof THREE.BufferGeometry)) return;
    object.geometry.dispose();
    if (!("material" in object)) return;
    const material = object.material as THREE.Material | THREE.Material[];
    const materials = Array.isArray(material) ? material : [material];
    for (const material of materials) material.dispose();
  });
}

async function sha256(bytes: ArrayBuffer): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function applyPresentationMode(record: EntityObject, mode: PresentationMode): void {
  record.visualRoot.visible = mode !== "3dgs" || !record.observationRoot;
  if (record.observationRoot) record.observationRoot.visible = mode !== "mesh";
  setCollisionOverlayVisible(record.collisionRoot, mode === "overlay");
  if (record.rimFrameRoot) record.rimFrameRoot.visible = mode === "overlay";
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

function disposeSparkWhenIdle(spark: SparkRenderer): void {
  spark.autoUpdate = false;
  spark.onDirty = undefined;
  if (spark.updateTimeoutId !== -1) clearTimeout(spark.updateTimeoutId);
  if (spark.sortTimeoutId !== -1) clearTimeout(spark.sortTimeoutId);

  const finish = () => {
    if (spark.sorting) {
      window.setTimeout(finish, 16);
      return;
    }
    spark.dispose();
  };
  finish();
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
  let spark: SparkRenderer | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let renderFrame: number | undefined;
  let resizeFrame: number | undefined;
  let pendingSize: { width: number; height: number } | undefined;
  let disposed = false;

  const renderScene = () => {
    renderFrame = undefined;
    if (disposed) return;
    if (scene && camera && renderer) renderer.render(scene, camera);
  };

  const scheduleRender = () => {
    if (disposed || renderFrame !== undefined) return;
    renderFrame = requestAnimationFrame(renderScene);
  };

  const removeObject = (ref: Entity["ref"]) => {
    const current = objects.get(ref);
    if (!current) return;
    current.active = false;
    scene?.remove(current.root);
    objects.delete(ref);
    current.splat?.dispose();
    disposeObject(current.root);
  };

  const evidenceFor = (
    entity: Entity,
    state: NonNullable<EpisodeSample["states"][Entity["ref"]]>,
    record: EntityObject,
  ): AlignmentEvidence | undefined => {
    const observation = entity.representations.observation;
    if (!observation || !record.observedSourceBounds) return undefined;
    return createAlignmentEvidence(
      entity.ref,
      observation,
      record.observedSourceBounds,
      state.pose,
      {
        position: [record.root.position.x, record.root.position.y, record.root.position.z],
        rotation: {
          x: record.root.quaternion.x,
          y: record.root.quaternion.y,
          z: record.root.quaternion.z,
          w: record.root.quaternion.w,
        },
      },
    );
  };

  const loadObservation = async (
    entity: Entity,
    record: EntityObject,
  ): Promise<void> => {
    const observation = entity.representations.observation;
    const observationRoot = record.observationRoot;
    if (!observation || !observationRoot) return;
    container.dataset.observationStatus = "loading";
    delete container.dataset.observationError;
    delete container.dataset.observationEntityRef;
    delete container.dataset.alignmentStatus;
    let stage = "fetch";
    let splat: SplatMesh | undefined;
    try {
      const response = await fetch(DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET_URL);
      if (!response.ok) throw new Error("3DGS bytes 无法读取");
      const bytes = await response.arrayBuffer();
      stage = "identity";
      if (
        bytes.byteLength !== DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.byteLength ||
        await sha256(bytes) !== observation.contentDigest
      ) {
        throw new Error("3DGS bytes 与登记 artifact identity 不一致");
      }
      if (disposed || !record.active || objects.get(entity.ref) !== record) return;

      stage = "spark-initialize";
      splat = new SplatMesh({
        fileBytes: bytes,
        fileType: SplatFileType.PLY,
        fileName: "diagnostic-wedge-3dgs-v1.ply",
        editable: false,
        raycastable: false,
      });
      await splat.initialized;
      if (disposed || !record.active || objects.get(entity.ref) !== record) {
        splat.dispose();
        return;
      }
      stage = "bounds";
      const bounds = splat.getBoundingBox(true);
      record.observedSourceBounds = {
        min: [bounds.min.x, bounds.min.y, bounds.min.z],
        max: [bounds.max.x, bounds.max.y, bounds.max.z],
      };
      record.splat = splat;
      observationRoot.add(splat);
      applyPresentationMode(record, props.presentationMode);
      container.dataset.observationStatus = "loaded";
      delete container.dataset.observationError;
      container.dataset.observationEntityRef = entity.ref;
      const state = props.sample ? props.sample.states[entity.ref] : entity.state;
      const evidence = state ? evidenceFor(entity, state, record) : undefined;
      if (props.selectedRef === entity.ref) props.onAlignmentEvidence?.(evidence);
      if (evidence) {
        container.dataset.alignmentStatus = evidence.passed ? "pass" : "fail";
      } else {
        delete container.dataset.alignmentStatus;
      }
      renderScene();
    } catch {
      if (splat) {
        observationRoot.remove(splat);
        if (record.splat === splat) record.splat = undefined;
        splat.dispose();
      }
      if (!record.active || objects.get(entity.ref) !== record) return;
      record.observedSourceBounds = undefined;
      container.dataset.observationStatus = "error";
      container.dataset.observationError = stage;
      delete container.dataset.observationEntityRef;
      container.dataset.alignmentStatus = "fail";
      if (props.selectedRef === entity.ref) props.onAlignmentEvidence?.(undefined);
      renderScene();
    }
  };

  const createObject = (entity: Entity): EntityObject => {
    const visual = entity.representations.visual;
    const root = new THREE.Group();
    root.name = entity.ref;
    root.userData.entityRef = entity.ref;
    const visualRoot = new THREE.Group();
    visualRoot.name = `${entity.ref}:visual`;
    visualRoot.userData.entityRef = entity.ref;
    const collisionRoot = createCollisionOverlay(entity);
    const rimFrameRoot = createRimFrameOverlay(entity);
    const articulatedRoot = createArticulatedArmPresentation(entity);
    root.add(visualRoot, collisionRoot);
    if (rimFrameRoot) root.add(rimFrameRoot);
    if (articulatedRoot) {
      visualRoot.visible = false;
      root.add(articulatedRoot);
    }

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
      mesh.name = `${entity.ref}:visual-mesh`;
      mesh.userData.entityRef = entity.ref;
      visualRoot.add(mesh);
      const record = {
        root,
        signature: visualSignature(entity),
        visualRoot,
        collisionRoot,
        rimFrameRoot,
        articulatedRoot,
        active: true,
      };
      applyPresentationMode(record, props.presentationMode);
      return record;
    }

    if (visual.kind === "sphere") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(visual.radius, 48, 32),
        new THREE.MeshStandardMaterial({
          color: visual.color,
          roughness: 0.42,
          metalness: 0.03,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `${entity.ref}:visual-mesh`;
      mesh.userData.entityRef = entity.ref;
      visualRoot.add(mesh);
      const record = {
        root,
        signature: visualSignature(entity),
        visualRoot,
        collisionRoot,
        rimFrameRoot,
        articulatedRoot,
        active: true,
      };
      applyPresentationMode(record, props.presentationMode);
      return record;
    }

    const asset = resolveImportedVisualAsset(visual);
    const observationRoot = new THREE.Group();
    observationRoot.name = `${entity.ref}:observation`;
    observationRoot.userData.entityRef = entity.ref;
    root.add(observationRoot);
    const record: EntityObject = {
      root,
      signature: visualSignature(entity),
      visualRoot,
      observationRoot,
      collisionRoot,
      rimFrameRoot,
      articulatedRoot,
      active: true,
    };
    container.dataset.assetStatus = "loading";
    loader.load(
      asset.url,
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
        visualRoot.add(content);
        container.dataset.assetStatus = "loaded";
        container.dataset.assetEntityRef = entity.ref;
        container.dataset.assetId = asset.assetId;
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
    const observation = entity.representations.observation;
    if (observation) {
      const transform = observation.localTransform;
      observationRoot.position.set(...transform.position);
      observationRoot.quaternion.set(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      );
      observationRoot.scale.setScalar(
        transform.scale[0] * observation.sourceUnitMeters,
      );
      void loadObservation(entity, record);
    }
    applyPresentationMode(record, props.presentationMode);
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
      delete container.dataset.assetId;
    }
    const hasObservation = [...entities.values()].some(
      (entity) => entity.representations.observation !== null,
    );
    if (!hasObservation) {
      delete container.dataset.observationStatus;
      delete container.dataset.observationError;
      delete container.dataset.observationEntityRef;
      delete container.dataset.alignmentStatus;
      props.onAlignmentEvidence?.(undefined);
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

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = "world-canvas";
    renderer.domElement.setAttribute("aria-label", "Demiurges 三维世界观察窗口");
    renderer.domElement.addEventListener("pointerdown", selectAtPointer);
    container.append(renderer.domElement);

    spark = new SparkRenderer({
      renderer,
      onDirty: scheduleRender,
    });
    scene.add(spark);

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
      pendingSize = { width, height };
      if (resizeFrame !== undefined) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = undefined;
        const size = pendingSize;
        pendingSize = undefined;
        if (disposed || !size || !camera || !renderer) return;
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
        renderer.setSize(size.width, size.height, false);
        renderScene();
      });
    });
    resizeObserver.observe(container);
    setReady(true);
  });

  createEffect(() => {
    if (!ready()) return;
    const sample = props.sample;
    const snapshot = props.snapshot;
    const selectedRef = props.selectedRef;
    const presentationMode = props.presentationMode;
    syncObjects(snapshot);

    let selectedEvidence: AlignmentEvidence | undefined;

    for (const entity of snapshot?.entities ?? []) {
      const record = objects.get(entity.ref);
      const object = record?.root;
      if (!record || !object) continue;
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
      if (record.articulatedRoot) applyArticulatedArmState(record.articulatedRoot, state);
      setSelected(object, selectedRef === entity.ref);
      applyPresentationMode(record, presentationMode);
      if (selectedRef === entity.ref) {
        selectedEvidence = evidenceFor(entity, state, record);
      }
    }
    props.onAlignmentEvidence?.(selectedEvidence);
    if (selectedEvidence) {
      container.dataset.alignmentStatus = selectedEvidence.passed ? "pass" : "fail";
    } else {
      delete container.dataset.alignmentStatus;
    }
    renderScene();
  });

  onCleanup(() => {
    disposed = true;
    if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    resizeObserver?.disconnect();
    renderer?.domElement.removeEventListener("pointerdown", selectAtPointer);
    for (const ref of [...objects.keys()]) removeObject(ref);
    if (spark) {
      scene?.remove(spark);
      disposeSparkWhenIdle(spark);
    }
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  return <div class="world-viewport" data-testid="world-viewport" ref={container} />;
}
