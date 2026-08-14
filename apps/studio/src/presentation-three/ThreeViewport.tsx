import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatFileType, SplatMesh } from "@sparkjsdev/spark";

import {
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  type Entity,
  type EpisodeSample,
  type Snapshot,
} from "@demiurges/world";
import type {
  PresentationLayers,
  RegisteredAssetLoadState,
  RegisteredAssetLoadStatus,
} from "../presentation-model";
import {
  createAlignmentEvidence,
  createRegisteredAlignmentEvidence,
  type AlignmentEvidence,
  type Bounds3,
} from "./alignment-evidence";
import {
  createAlignmentOverlay,
  createCollisionOverlay,
  createArticulatedArmPresentation,
  applyArticulatedArmState,
  createRimFrameOverlay,
  setCollisionOverlayVisible,
} from "./entity-presentation";
import { resolveImportedVisualAsset } from "./presentation-assets";
import { resolveRegisteredPresentationAsset } from "./registered-presentation";

const DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET_URL = new URL(
  "../../../../packages/world/assets/diagnostic-wedge-3dgs-v1.ply",
  import.meta.url,
).href;

export type { PresentationLayers } from "../presentation-model";

interface ThreeViewportProps {
  readonly snapshot?: Snapshot;
  readonly sample?: EpisodeSample;
  readonly selectedRef?: Entity["ref"];
  readonly presentationLayers: PresentationLayers;
  readonly onSelect?: (ref: Entity["ref"]) => void;
  readonly onAlignmentEvidence?: (evidence: AlignmentEvidence | undefined) => void;
  readonly onRegisteredAssetStates?: (states: readonly RegisteredAssetLoadState[]) => void;
}

interface EntityObject {
  readonly root: THREE.Object3D;
  readonly signature: string;
  readonly visualRoot: THREE.Group;
  readonly observationRoot?: THREE.Group;
  readonly collisionRoot: THREE.Group;
  readonly alignmentRoot?: THREE.Group;
  readonly rimFrameRoot?: THREE.Group;
  readonly articulatedRoot?: THREE.Group;
  readonly abortControllers: Set<AbortController>;
  readonly generation: number;
  active: boolean;
  splat?: SplatMesh;
  observedSourceBounds?: Bounds3;
  alignmentEvidence?: AlignmentEvidence;
}

function visualSignature(entity: Entity): string {
  return JSON.stringify(entity.representations);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof SplatMesh) return;
    if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) {
      object.geometry.dispose();
    }
    if (!("material" in object)) return;
    const material = object.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const candidate of materials) {
      for (const value of Object.values(candidate)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      candidate.dispose();
    }
  });
}

async function sha256(bytes: ArrayBuffer): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function applyPresentationLayers(record: EntityObject, layers: PresentationLayers): void {
  record.visualRoot.visible = layers.mesh && !record.articulatedRoot;
  if (record.articulatedRoot) record.articulatedRoot.visible = layers.mesh;
  if (record.observationRoot) record.observationRoot.visible = layers.splat;
  setCollisionOverlayVisible(record.collisionRoot, layers.collision);
  if (record.rimFrameRoot) record.rimFrameRoot.visible = layers.alignment;
  if (record.alignmentRoot) record.alignmentRoot.visible = layers.alignment;
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

  let remainingFrames = 120;
  const finish = () => {
    if (spark.sorting && remainingFrames > 0) {
      remainingFrames -= 1;
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
  let controls: OrbitControls | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let renderFrame: number | undefined;
  let resizeFrame: number | undefined;
  let pendingSize: { width: number; height: number } | undefined;
  let disposed = false;
  let nextGeneration = 0;
  const assetStates = new Map<string, RegisteredAssetLoadStatus>();

  const publishAssetStates = () => {
    const states = [...assetStates.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([assetId, status]) => ({ assetId, status }));
    container.dataset.registeredAssets = JSON.stringify(states);
    props.onRegisteredAssetStates?.(states);
  };

  const setAssetState = (
    assetId: string,
    status: RegisteredAssetLoadStatus,
  ) => {
    assetStates.set(assetId, status);
    publishAssetStates();
  };

  const isCurrent = (ref: Entity["ref"], record: EntityObject) => {
    const current = objects.get(ref);
    return !disposed && record.active && current === record &&
      current.generation === record.generation;
  };

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
    for (const controller of current.abortControllers) controller.abort();
    current.abortControllers.clear();
    scene?.remove(current.root);
    objects.delete(ref);
    for (const representation of [
      current.root.userData.visualAssetId,
      current.root.userData.observationAssetId,
    ]) {
      if (typeof representation === "string") assetStates.delete(representation);
    }
    publishAssetStates();
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
    if (observation.kind === "registered-gaussian-splat") {
      return createRegisteredAlignmentEvidence(
        entity.ref,
        observation,
        record.observedSourceBounds,
      );
    }
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
    const registered = observation.kind === "registered-gaussian-splat"
      ? resolveRegisteredPresentationAsset(observation)
      : undefined;
    const controller = new AbortController();
    record.abortControllers.add(controller);
    if (registered) {
      record.root.userData.observationAssetId = registered.asset.assetId;
      setAssetState(registered.asset.assetId, "loading");
      const calibration = registered.calibration;
      observationRoot.position.set(...calibration.translation);
      observationRoot.quaternion.set(...calibration.rotation);
      observationRoot.scale.setScalar(
        calibration.uniformScale * calibration.sourceUnitMeters / calibration.targetUnitMeters,
      );
    } else if (observation.kind === "gaussian-splat") {
      const transform = observation.localTransform;
      observationRoot.position.set(...transform.position);
      observationRoot.quaternion.set(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      );
      observationRoot.scale.setScalar(transform.scale[0] * observation.sourceUnitMeters);
    }
    container.dataset.observationStatus = "loading";
    delete container.dataset.observationError;
    delete container.dataset.observationEntityRef;
    delete container.dataset.alignmentStatus;
    let stage = "fetch";
    let splat: SplatMesh | undefined;
    try {
      const response = await fetch(
        registered?.url ?? DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET_URL,
        { signal: controller.signal },
      );
      if (!response.ok) {
        if (registered && response.status === 404) {
          setAssetState(registered.asset.assetId, "not-imported");
          container.dataset.observationStatus = "not-imported";
        }
        throw new Error("3DGS bytes 无法读取");
      }
      const bytes = await response.arrayBuffer();
      stage = "identity";
      const expectedBytes = registered?.asset.byteLength ?? DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET.byteLength;
      const expectedDigest = observation.kind === "registered-gaussian-splat"
        ? `sha256:${registered!.asset.digest}`
        : observation.contentDigest;
      if (registered && (
        response.headers.get("x-demiurges-asset-id") !== registered.asset.assetId ||
        response.headers.get("x-demiurges-content-sha256") !== registered.asset.digest
      )) {
        throw new Error("registered 3DGS response identity 缺失");
      }
      if (bytes.byteLength !== expectedBytes || await sha256(bytes) !== expectedDigest) {
        throw new Error("3DGS bytes 与登记 artifact identity 不一致");
      }
      if (!isCurrent(entity.ref, record)) return;

      stage = "spark-initialize";
      splat = new SplatMesh({
        fileBytes: bytes,
        fileType: registered ? SplatFileType.SPZ : SplatFileType.PLY,
        fileName: registered ? "marble-world-500k.spz" : "diagnostic-wedge-3dgs-v1.ply",
        editable: false,
        raycastable: false,
      });
      await Promise.race([
        splat.initialized,
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
      ]);
      if (!isCurrent(entity.ref, record)) {
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
      applyPresentationLayers(record, props.presentationLayers);
      container.dataset.observationStatus = "loaded";
      delete container.dataset.observationError;
      container.dataset.observationEntityRef = entity.ref;
      const state = props.sample ? props.sample.states[entity.ref] : entity.state;
      const evidence = state ? evidenceFor(entity, state, record) : undefined;
      record.alignmentEvidence = evidence;
      if (registered) setAssetState(registered.asset.assetId, "loaded");
      props.onAlignmentEvidence?.(evidence);
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
      if (!isCurrent(entity.ref, record)) return;
      record.observedSourceBounds = undefined;
      record.alignmentEvidence = undefined;
      if (registered && assetStates.get(registered.asset.assetId) !== "not-imported") {
        setAssetState(registered.asset.assetId, "error");
      }
      if (container.dataset.observationStatus !== "not-imported") {
        container.dataset.observationStatus = "error";
      }
      container.dataset.observationError = stage;
      delete container.dataset.observationEntityRef;
      container.dataset.alignmentStatus = "fail";
      props.onAlignmentEvidence?.(undefined);
      renderScene();
    } finally {
      record.abortControllers.delete(controller);
    }
  };

  const loadVisual = async (entity: Entity, record: EntityObject): Promise<void> => {
    const visual = entity.representations.visual;
    if (visual.kind !== "imported-rigid-mesh" && visual.kind !== "registered-rigid-mesh") return;
    const registered = visual.kind === "registered-rigid-mesh"
      ? resolveRegisteredPresentationAsset(visual)
      : undefined;
    const imported = visual.kind === "imported-rigid-mesh"
      ? resolveImportedVisualAsset(visual)
      : undefined;
    const assetId = registered?.asset.assetId ?? imported!.assetId;
    const controller = new AbortController();
    record.abortControllers.add(controller);
    record.root.userData.visualAssetId = assetId;
    if (registered) setAssetState(assetId, "loading");
    container.dataset.assetStatus = "loading";
    container.dataset.assetEntityRef = entity.ref;
    container.dataset.assetId = assetId;
    let parsed: THREE.Object3D | undefined;
    try {
      const response = await fetch(registered?.url ?? imported!.url, { signal: controller.signal });
      if (!response.ok) {
        container.dataset.assetStatus = response.status === 404 ? "not-imported" : "error";
        if (registered && response.status === 404) setAssetState(assetId, "not-imported");
        throw new Error("GLB bytes 无法读取");
      }
      const bytes = await response.arrayBuffer();
      const expectedDigest = registered
        ? `sha256:${registered.asset.digest}`
        : imported!.contentDigest;
      if (registered && (
        response.headers.get("x-demiurges-asset-id") !== registered.asset.assetId ||
        response.headers.get("x-demiurges-content-sha256") !== registered.asset.digest ||
        bytes.byteLength !== registered.asset.byteLength
      )) {
        throw new Error("registered GLB response identity 缺失");
      }
      if (await sha256(bytes) !== expectedDigest) throw new Error("GLB digest 漂移");
      const gltf = await loader.parseAsync(bytes, "");
      parsed = gltf.scene;
      if (!isCurrent(entity.ref, record)) {
        disposeObject(parsed);
        return;
      }
      if (registered) {
        const calibration = registered.calibration;
        parsed.position.set(...calibration.translation);
        parsed.quaternion.set(...calibration.rotation);
        parsed.scale.setScalar(
          calibration.uniformScale * calibration.sourceUnitMeters / calibration.targetUnitMeters,
        );
      } else if (visual.kind === "imported-rigid-mesh") {
        const transform = visual.localTransform;
        parsed.position.set(...transform.position);
        parsed.quaternion.set(
          transform.rotation.x,
          transform.rotation.y,
          transform.rotation.z,
          transform.rotation.w,
        );
        parsed.scale.set(
          transform.scale[0] * visual.sourceUnitMeters,
          transform.scale[1] * visual.sourceUnitMeters,
          transform.scale[2] * visual.sourceUnitMeters,
        );
      }
      parsed.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = entity.physics.bodyType === "dynamic";
        object.receiveShadow = true;
        object.userData.entityRef = entity.ref;
        if (entity.ref !== "entity:environment") return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.transparent = true;
          material.opacity = 0.14;
          material.depthWrite = false;
          if (material instanceof THREE.MeshStandardMaterial) material.wireframe = true;
        }
      });
      record.visualRoot.add(parsed);
      container.dataset.assetStatus = "loaded";
      if (registered) setAssetState(assetId, "loaded");
      setSelected(record.root, props.selectedRef === entity.ref);
      applyPresentationLayers(record, props.presentationLayers);
      renderScene();
    } catch {
      if (parsed && !record.visualRoot.children.includes(parsed)) disposeObject(parsed);
      if (!isCurrent(entity.ref, record)) return;
      if (registered && assetStates.get(assetId) !== "not-imported") {
        setAssetState(assetId, "error");
      }
      if (container.dataset.assetStatus === "loading") container.dataset.assetStatus = "error";
      renderScene();
    } finally {
      record.abortControllers.delete(controller);
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
    const observationRoot = entity.representations.observation
      ? new THREE.Group()
      : undefined;
    if (observationRoot) {
      observationRoot.name = `${entity.ref}:observation`;
      observationRoot.userData.entityRef = entity.ref;
    }
    const collisionRoot = createCollisionOverlay(entity);
    const rimFrameRoot = createRimFrameOverlay(entity);
    const alignmentRoot = createAlignmentOverlay(entity);
    const articulatedRoot = createArticulatedArmPresentation(entity);
    root.add(visualRoot, collisionRoot);
    if (observationRoot) root.add(observationRoot);
    if (rimFrameRoot) root.add(rimFrameRoot);
    if (alignmentRoot) root.add(alignmentRoot);
    if (articulatedRoot) root.add(articulatedRoot);

    const record: EntityObject = {
      root,
      signature: visualSignature(entity),
      visualRoot,
      observationRoot,
      collisionRoot,
      alignmentRoot,
      rimFrameRoot,
      articulatedRoot,
      abortControllers: new Set(),
      generation: ++nextGeneration,
      active: true,
    };

    if (visual.kind === "box") {
      const [hx, hy, hz] = visual.halfExtents;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        new THREE.MeshStandardMaterial({
          color: visual.color,
          roughness: entity.physics.bodyType === "static" ? 0.92 : 0.58,
          metalness: 0.02,
        }),
      );
      mesh.castShadow = entity.physics.bodyType === "dynamic";
      mesh.receiveShadow = true;
      mesh.name = `${entity.ref}:visual-mesh`;
      mesh.userData.entityRef = entity.ref;
      visualRoot.add(mesh);
    } else if (visual.kind === "sphere") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(visual.radius, 48, 32),
        new THREE.MeshStandardMaterial({ color: visual.color, roughness: 0.42, metalness: 0.03 }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `${entity.ref}:visual-mesh`;
      mesh.userData.entityRef = entity.ref;
      visualRoot.add(mesh);
    } else {
      void loadVisual(entity, record);
    }
    if (observationRoot) void loadObservation(entity, record);
    applyPresentationLayers(record, props.presentationLayers);
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
      (entity) => entity.representations.visual.kind === "imported-rigid-mesh" ||
        entity.representations.visual.kind === "registered-rigid-mesh",
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

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = "world-canvas";
    renderer.domElement.setAttribute("aria-label", "Demiurges 三维世界观察窗口");
    renderer.domElement.addEventListener("pointerdown", selectAtPointer);
    container.append(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.65);
    controls.enableDamping = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.addEventListener("change", scheduleRender);
    controls.update();

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
    const fillLight = new THREE.DirectionalLight("#c6dcff", 1.35);
    fillLight.position.set(4, 2, 4);
    scene.add(fillLight);

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
    const presentationLayers = props.presentationLayers;
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
      applyPresentationLayers(record, presentationLayers);
      if (selectedRef === entity.ref) {
        selectedEvidence = evidenceFor(entity, state, record);
      }
    }
    selectedEvidence ??= [...objects.values()]
      .map((record) => record.alignmentEvidence)
      .find((evidence) => evidence !== undefined);
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
    controls?.removeEventListener("change", scheduleRender);
    controls?.dispose();
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
