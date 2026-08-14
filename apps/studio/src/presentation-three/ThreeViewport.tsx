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
import {
  hasExactRegisteredPresentationScenario,
  resolveRegisteredObserverEntry,
  resolveRegisteredPresentationAsset,
} from "./registered-presentation";
import { CameraRig } from "./camera-rig";
import {
  FALLBACK_WORLD_BOUNDS,
  boundaryWarning,
  boundsFromCenterHalfExtents,
  cameraKeyAdmission,
  fitBounds,
  isEditableTarget,
  poseDataset,
  resolveObserverBounds,
  transformBounds,
  unionBounds,
  type Bounds3 as ObserverBounds3,
  type CameraPose,
  type ObserverMode,
} from "./observer-camera";

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
  visualLocalBounds?: ObserverBounds3;
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
  const [observerMode, setObserverMode] = createSignal<ObserverMode>("overview");
  const [flySpeed, setFlySpeed] = createSignal(1.2);
  const [entryTruthLabel, setEntryTruthLabel] = createSignal("ENTRY POSE · AUTHORED FALLBACK");
  const [entryProvenance, setEntryProvenance] = createSignal("等待世界 Presentation context");
  const [boundsProvenance, setBoundsProvenance] = createSignal("authored-fallback");
  const [boundaryState, setBoundaryState] = createSignal<"inside" | "near" | "unknown">("unknown");
  const [presentationError, setPresentationError] = createSignal<string>();
  const objects = new Map<Entity["ref"], EntityObject>();
  const loader = new GLTFLoader();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let spark: SparkRenderer | undefined;
  let controls: OrbitControls | undefined;
  let gridHelper: THREE.GridHelper | undefined;
  let worldBoundsHelper: THREE.Box3Helper | undefined;
  let cameraRig: CameraRig | undefined;
  let cameraTarget = new THREE.Vector3(0, 0, 0.65);
  let observerBounds: ObserverBounds3 = FALLBACK_WORLD_BOUNDS;
  let observerContextKey: string | undefined;
  let reducedMotion: MediaQueryList | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let renderFrame: number | undefined;
  let resizeFrame: number | undefined;
  let pendingSize: { width: number; height: number } | undefined;
  let disposed = false;
  let lastFrameTime: number | undefined;
  let renderedFrameCount = 0;
  let pointerStart: { id: number; x: number; y: number } | undefined;
  let draggingLook = false;
  let ownedPointerLock = false;
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

  const clearPresentationError = () => {
    delete container.dataset.observerRepresentationError;
    setPresentationError(undefined);
  };

  const markPresentationError = (code: string, message: string) => {
    container.dataset.observerRepresentationError = code;
    setPresentationError(message);
  };

  const isCurrent = (ref: Entity["ref"], record: EntityObject) => {
    const current = objects.get(ref);
    return !disposed && record.active && current === record &&
      current.generation === record.generation;
  };

  const currentCameraPose = (): CameraPose => ({
    position: camera
      ? [camera.position.x, camera.position.y, camera.position.z]
      : [0, 0, 1],
    target: [cameraTarget.x, cameraTarget.y, cameraTarget.z],
  });

  const setCameraPose = (pose: CameraPose) => {
    if (!camera) return;
    camera.position.set(...pose.position);
    cameraTarget.set(...pose.target);
    camera.lookAt(cameraTarget);
    if (controls?.enabled) {
      controls.target.copy(cameraTarget);
      controls.update();
    }
  };

  const effectiveLayers = (): PresentationLayers => ({
    ...props.presentationLayers,
    collision: observerMode() === "explore" ? false : props.presentationLayers.collision,
  });

  const publishObserverState = () => {
    if (!camera) return;
    const pose = currentCameraPose();
    const boundary = boundaryWarning(observerBounds, pose.position);
    setBoundaryState(boundary);
    container.dataset.observerMode = observerMode();
    container.dataset.cameraPose = poseDataset(pose);
    container.dataset.rafCount = String(renderedFrameCount);
    container.dataset.flySpeed = cameraRig?.flySpeed.toFixed(2) ?? flySpeed().toFixed(2);
    container.dataset.entryTruth = entryTruthLabel().includes("UNVERIFIED")
      ? "authored-unverified"
      : "authored-fallback";
    container.dataset.entryProvenance = entryProvenance();
    container.dataset.boundsProvenance = boundsProvenance();
    container.dataset.boundary = boundary;
    container.dataset.collisionEffective = String(effectiveLayers().collision);
  };

  const renderScene = (timestamp = performance.now()) => {
    renderFrame = undefined;
    if (disposed) return;
    const deltaSeconds = lastFrameTime === undefined ? 0 : (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;
    const update = cameraRig?.update(deltaSeconds);
    if (scene && camera && renderer) renderer.render(scene, camera);
    renderedFrameCount += 1;
    publishObserverState();
    if (update?.needsNextFrame) scheduleRender();
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

  const primitiveLocalBounds = (entity: Entity): ObserverBounds3 | undefined => {
    const visual = entity.representations.visual;
    if (visual.kind === "box") {
      return boundsFromCenterHalfExtents([0, 0, 0], visual.halfExtents);
    }
    if (visual.kind === "sphere") {
      return boundsFromCenterHalfExtents([0, 0, 0], [visual.radius, visual.radius, visual.radius]);
    }
    const collision = entity.representations.collision;
    if (collision.kind === "box") {
      return boundsFromCenterHalfExtents([0, 0, 0], collision.halfExtents);
    }
    if (collision.kind === "sphere") {
      return boundsFromCenterHalfExtents([0, 0, 0], [collision.radius, collision.radius, collision.radius]);
    }
    if (collision.kind === "compound") {
      return unionBounds(collision.parts.map((part) => {
        const local = boundsFromCenterHalfExtents([0, 0, 0], part.shape.halfExtents);
        return local
          ? transformBounds(local, part.localPose.position, part.localPose.rotation)
          : undefined;
      }));
    }
    return undefined;
  };

  const entityWorldBounds = (
    entity: Entity,
    state: Entity["state"],
    record: EntityObject | undefined,
    allowRegistered: boolean,
  ): { readonly bounds: ObserverBounds3; readonly provenance: string } => {
    let registeredBounds: ObserverBounds3 | undefined;
    for (const representation of allowRegistered
      ? [entity.representations.observation, entity.representations.visual]
      : []) {
      if (representation?.kind !== "registered-gaussian-splat" &&
          representation?.kind !== "registered-rigid-mesh") continue;
      try {
        const resolved = resolveRegisteredPresentationAsset(representation);
        const registered = transformBounds(
          resolved.calibration.targetBounds,
          state.pose.position,
          state.pose.rotation,
        );
        if (registered) {
          registeredBounds = registered;
          break;
        }
      } catch {
        markPresentationError("registry-binding", "REGISTERED PRESENTATION INTEGRITY FAILED");
      }
    }
    const loaded = record?.visualLocalBounds
      ? transformBounds(record.visualLocalBounds, state.pose.position, state.pose.rotation)
      : undefined;
    const local = primitiveLocalBounds(entity);
    const primitiveOrCollision = local
      ? transformBounds(local, state.pose.position, state.pose.rotation)
      : undefined;
    return resolveObserverBounds({
      registered: registeredBounds,
      loadedDigest: loaded,
      primitiveOrCollision,
      fallbackPosition: state.pose.position,
    });
  };

  const focusEntity = (ref: Entity["ref"] | undefined) => {
    if (!camera || !ref || observerMode() !== "inspect") return;
    const entity = props.snapshot?.entities.find((candidate) => candidate.ref === ref);
    if (!entity) return;
    const state = props.sample?.states[ref] ?? entity.state;
    let allowRegistered = false;
    try {
      allowRegistered = hasExactRegisteredPresentationScenario(props.snapshot);
    } catch {
      markPresentationError("registry-binding", "REGISTERED PRESENTATION INTEGRITY FAILED");
    }
    const result = entityWorldBounds(entity, state, objects.get(ref), allowRegistered);
    const fitted = fitBounds(result.bounds, camera.aspect, camera.fov, 1.12);
    setBoundsProvenance(result.provenance);
    cameraRig?.focus(fitted.pose);
    scheduleRender();
  };

  const refreshObserverContext = (snapshot: Snapshot | undefined, reset = false) => {
    if (!camera || !cameraRig) return;
    const hasPersistentLoadError = [...assetStates.values()].some((status) => status === "error") ||
      container.dataset.observationStatus === "error" ||
      container.dataset.assetStatus === "error";
    if (!hasPersistentLoadError) clearPresentationError();
    let allowRegistered = false;
    try {
      allowRegistered = hasExactRegisteredPresentationScenario(snapshot);
    } catch {
      markPresentationError("registry-binding", "REGISTERED PRESENTATION INTEGRITY FAILED");
    }
    const resolvedBounds = (snapshot?.entities ?? []).map((entity) => {
      const state = props.sample?.states[entity.ref] ?? entity.state;
      return entityWorldBounds(entity, state, objects.get(entity.ref), allowRegistered);
    });
    observerBounds = unionBounds(resolvedBounds.map((entry) => entry.bounds)) ?? FALLBACK_WORLD_BOUNDS;
    const overview = fitBounds(observerBounds, camera.aspect, camera.fov);
    let explorePose: CameraPose = {
      position: [
        overview.center[0],
        observerBounds.min[1] + (observerBounds.max[1] - observerBounds.min[1]) * 0.22,
        Math.min(Math.max(overview.center[2], observerBounds.min[2] + 0.5), observerBounds.max[2] - 0.05),
      ],
      target: [overview.center[0], overview.center[1], overview.center[2]],
    };
    let truth = "ENTRY POSE · AUTHORED FALLBACK";
    let provenance = "deterministic fit-bounds fallback";
    let registeredBoundsProvenance = resolvedBounds.some((entry) => entry.provenance === "registered")
      ? "registered"
      : resolvedBounds.some((entry) => entry.provenance === "derived-from-loaded-digest")
        ? "derived-from-loaded-digest"
        : "authored-fallback";
    try {
      const entry = resolveRegisteredObserverEntry(snapshot);
      if (entry) {
        const entity = snapshot!.entities.find((candidate) => candidate.ref === entry.entityRef)!;
        const worldEntryBounds = transformBounds(entry.bounds, entity.state.pose.position, entity.state.pose.rotation);
        const worldEntryPosition = transformBounds(
          { min: entry.entryPose.position, max: entry.entryPose.position },
          entity.state.pose.position,
          entity.state.pose.rotation,
        );
        const worldEntryTarget = transformBounds(
          { min: entry.entryPose.target, max: entry.entryPose.target },
          entity.state.pose.position,
          entity.state.pose.rotation,
        );
        if (!worldEntryBounds || !worldEntryPosition || !worldEntryTarget) {
          throw new Error("registered Observer entry transform 无效");
        }
        explorePose = {
          position: worldEntryPosition.min,
          target: worldEntryTarget.min,
        };
        truth = "ENTRY POSE · AUTHORED / UNVERIFIED";
        provenance = entry.provenance;
        registeredBoundsProvenance = "registered";
      }
    } catch {
      markPresentationError("entry-fallback", "REGISTERED ENTRY INTEGRITY FAILED · USING FINITE FALLBACK");
    }
    cameraRig.setResetPoses({
      overview: overview.pose,
      inspect: fitBounds(observerBounds, camera.aspect, camera.fov, 1.12).pose,
      explore: explorePose,
    });
    cameraRig.setEnvelope(overview.envelope);
    observerBounds = overview.bounds;
    if (worldBoundsHelper) {
      worldBoundsHelper.box.min.set(...observerBounds.min);
      worldBoundsHelper.box.max.set(...observerBounds.max);
      worldBoundsHelper.visible = effectiveLayers().bounds;
      worldBoundsHelper.updateMatrixWorld(true);
    }
    if (gridHelper) {
      gridHelper.position.z = observerBounds.min[2];
      gridHelper.scale.setScalar(Math.max(0.5, overview.radius / 4));
      gridHelper.visible = effectiveLayers().grid;
    }
    setEntryTruthLabel(truth);
    setEntryProvenance(provenance);
    setBoundsProvenance(registeredBoundsProvenance);
    const key = snapshot
      ? `${snapshot.id}:${snapshot.scenarioId}:${snapshot.entities.map(visualSignature).join("|")}`
      : "empty";
    if (reset || observerContextKey === undefined || observerContextKey !== key && observerMode() === "overview") {
      cameraRig.reset();
      scheduleRender();
    }
    observerContextKey = key;
    publishObserverState();
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
    let registered: ReturnType<typeof resolveRegisteredPresentationAsset> | undefined;
    try {
      if (observation.kind === "registered-gaussian-splat") {
        if (!hasExactRegisteredPresentationScenario(props.snapshot)) {
          throw new Error("registered Observation 不属于 exact scenario");
        }
        registered = resolveRegisteredPresentationAsset(observation);
      }
    } catch {
      record.root.userData.observationAssetId = observation.assetId;
      setAssetState(observation.assetId, "error");
      container.dataset.observationStatus = "error";
      container.dataset.observationError = "registry";
      delete container.dataset.observationEntityRef;
      container.dataset.alignmentStatus = "fail";
      props.onAlignmentEvidence?.(undefined);
      refreshObserverContext(props.snapshot);
      markPresentationError("observation-registry", "REGISTERED OBSERVATION INTEGRITY FAILED");
      scheduleRender();
      return;
    }
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
      applyPresentationLayers(record, effectiveLayers());
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
      refreshObserverContext(props.snapshot);
      scheduleRender();
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
      refreshObserverContext(props.snapshot);
      markPresentationError(
        `observation-${stage}`,
        `OBSERVATION PRESENTATION INTEGRITY FAILED · ${stage.toUpperCase()}`,
      );
      scheduleRender();
    } finally {
      record.abortControllers.delete(controller);
    }
  };

  const loadVisual = async (entity: Entity, record: EntityObject): Promise<void> => {
    const visual = entity.representations.visual;
    if (visual.kind !== "imported-rigid-mesh" && visual.kind !== "registered-rigid-mesh") return;
    let registered: ReturnType<typeof resolveRegisteredPresentationAsset> | undefined;
    let imported: ReturnType<typeof resolveImportedVisualAsset> | undefined;
    try {
      if (visual.kind === "registered-rigid-mesh") {
        if (!hasExactRegisteredPresentationScenario(props.snapshot)) {
          throw new Error("registered Visual 不属于 exact scenario");
        }
        registered = resolveRegisteredPresentationAsset(visual);
      } else {
        imported = resolveImportedVisualAsset(visual);
      }
    } catch {
      record.root.userData.visualAssetId = visual.assetId;
      if (visual.kind === "registered-rigid-mesh") setAssetState(visual.assetId, "error");
      container.dataset.assetStatus = "error";
      container.dataset.assetEntityRef = entity.ref;
      container.dataset.assetId = visual.assetId;
      refreshObserverContext(props.snapshot);
      markPresentationError("visual-registry", "REGISTERED VISUAL INTEGRITY FAILED");
      scheduleRender();
      return;
    }
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
      parsed.updateMatrixWorld(true);
      const visualBounds = new THREE.Box3().setFromObject(parsed);
      if (!visualBounds.isEmpty() && [
        visualBounds.min.x, visualBounds.min.y, visualBounds.min.z,
        visualBounds.max.x, visualBounds.max.y, visualBounds.max.z,
      ].every(Number.isFinite)) {
        record.visualLocalBounds = {
          min: [visualBounds.min.x, visualBounds.min.y, visualBounds.min.z],
          max: [visualBounds.max.x, visualBounds.max.y, visualBounds.max.z],
        };
      }
      record.visualRoot.add(parsed);
      container.dataset.assetStatus = "loaded";
      if (registered) setAssetState(assetId, "loaded");
      setSelected(record.root, props.selectedRef === entity.ref);
      applyPresentationLayers(record, effectiveLayers());
      refreshObserverContext(props.snapshot);
      scheduleRender();
    } catch {
      if (parsed && !record.visualRoot.children.includes(parsed)) disposeObject(parsed);
      if (!isCurrent(entity.ref, record)) return;
      if (registered && assetStates.get(assetId) !== "not-imported") {
        setAssetState(assetId, "error");
      }
      record.visualLocalBounds = undefined;
      if (container.dataset.assetStatus === "loading") container.dataset.assetStatus = "error";
      refreshObserverContext(props.snapshot);
      markPresentationError("visual-load", "VISUAL PRESENTATION INTEGRITY FAILED");
      scheduleRender();
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
    applyPresentationLayers(record, effectiveLayers());
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

  const entityAtPointer = (event: PointerEvent): Entity["ref"] | undefined => {
    if (!camera || !renderer) return undefined;
    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return undefined;
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
    return object?.userData.entityRef as Entity["ref"] | undefined;
  };

  const changeObserverMode = (mode: ObserverMode) => {
    clearInput();
    setObserverMode(mode);
    cameraRig?.setMode(mode);
    for (const record of objects.values()) applyPresentationLayers(record, effectiveLayers());
    if (mode === "explore") renderer?.domElement.focus({ preventScroll: true });
    scheduleRender();
  };

  const resetObserver = () => {
    clearInput();
    cameraRig?.reset();
    renderer?.domElement.focus({ preventScroll: true });
    scheduleRender();
  };

  const ownsKeyboard = (event: KeyboardEvent): boolean => {
    if (!renderer) return false;
    return cameraKeyAdmission({
      viewportFocused: document.activeElement === renderer.domElement,
      pointerOwned: renderer.domElement.hasPointerCapture(pointerStart?.id ?? -1) ||
        document.pointerLockElement === renderer.domElement,
      editableTarget: isEditableTarget(event.target),
    });
  };

  const releasePointerInput = () => {
    if (renderer && pointerStart && renderer.domElement.hasPointerCapture(pointerStart.id)) {
      renderer.domElement.releasePointerCapture(pointerStart.id);
    }
    pointerStart = undefined;
    draggingLook = false;
  };

  const clearInput = () => {
    cameraRig?.clearInput();
    releasePointerInput();
    scheduleRender();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!ownsKeyboard(event)) return;
    if (event.code === "Escape") {
      event.preventDefault();
      clearInput();
      renderer?.domElement.blur();
      return;
    }
    if (event.code === "KeyF" && observerMode() === "inspect") {
      event.preventDefault();
      focusEntity(props.selectedRef);
      return;
    }
    if (cameraRig?.keyDown(event.code)) {
      event.preventDefault();
      scheduleRender();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (cameraRig?.keyUp(event.code)) {
      event.preventDefault();
      scheduleRender();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!renderer) return;
    renderer.domElement.focus({ preventScroll: true });
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (observerMode() === "explore") {
      draggingLook = true;
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!draggingLook || observerMode() !== "explore" || !cameraRig) return;
    const deltaX = event.movementX || (pointerStart ? event.clientX - pointerStart.x : 0);
    const deltaY = event.movementY || (pointerStart ? event.clientY - pointerStart.y : 0);
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    cameraRig.look(deltaX, deltaY);
    scheduleRender();
  };

  const onPointerUp = (event: PointerEvent) => {
    const start = pointerStart;
    if (observerMode() === "inspect" && start && start.id === event.pointerId &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 4) {
      const ref = entityAtPointer(event);
      if (ref) props.onSelect?.(ref);
    }
    releasePointerInput();
  };

  const onDoubleClick = (event: MouseEvent) => {
    if (observerMode() !== "inspect") return;
    const ref = entityAtPointer(event as unknown as PointerEvent);
    if (ref) {
      props.onSelect?.(ref);
      focusEntity(ref);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (observerMode() !== "explore" || document.activeElement !== renderer?.domElement) return;
    event.preventDefault();
    const speed = cameraRig?.adjustSpeed(event.deltaY);
    if (speed !== undefined) setFlySpeed(speed);
    publishObserverState();
  };

  const onPointerLockChange = () => {
    const ownsNow = document.pointerLockElement === renderer?.domElement;
    if (ownedPointerLock && !ownsNow) clearInput();
    ownedPointerLock = ownsNow;
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") clearInput();
  };

  const onControlsChange = () => {
    if (controls?.enabled) cameraTarget.copy(controls.target);
    scheduleRender();
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
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "application");
    container.append(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.65);
    controls.enableDamping = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.addEventListener("change", onControlsChange);
    controls.update();

    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initial = fitBounds(FALLBACK_WORLD_BOUNDS, 1, camera.fov);
    cameraRig = new CameraRig(
      {
        getPose: currentCameraPose,
        setPose: setCameraPose,
        setControlsEnabled: (enabled) => {
          if (!controls) return;
          controls.enabled = enabled;
          if (enabled) {
            controls.target.copy(cameraTarget);
            controls.update();
          }
        },
        setEnvelope: (envelope) => {
          if (!camera || !controls || !scene) return;
          camera.near = envelope.near;
          camera.far = envelope.far;
          camera.updateProjectionMatrix();
          controls.minDistance = envelope.minDistance;
          controls.maxDistance = envelope.maxDistance;
          scene.fog = new THREE.Fog("#dce2dc", envelope.fogNear, envelope.fogFar);
        },
      },
      {
        overview: initial.pose,
        inspect: fitBounds(FALLBACK_WORLD_BOUNDS, 1, camera.fov, 1.12).pose,
        explore: { position: [0, -1, 1], target: [0, 0, 1] },
      },
      () => reducedMotion?.matches ?? false,
    );
    cameraRig.setEnvelope(initial.envelope);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", clearInput);
    renderer.domElement.addEventListener("lostpointercapture", clearInput);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("blur", clearInput);

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

    gridHelper = new THREE.GridHelper(10, 20, "#6b7d74", "#a8b4ae");
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.visible = false;
    scene.add(gridHelper);
    worldBoundsHelper = new THREE.Box3Helper(
      new THREE.Box3(
        new THREE.Vector3(...FALLBACK_WORLD_BOUNDS.min),
        new THREE.Vector3(...FALLBACK_WORLD_BOUNDS.max),
      ),
      "#a94d32",
    );
    worldBoundsHelper.visible = false;
    scene.add(worldBoundsHelper);

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
        refreshObserverContext(props.snapshot, observerMode() === "overview");
        scheduleRender();
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
    props.presentationLayers;
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
      applyPresentationLayers(record, effectiveLayers());
      if (selectedRef === entity.ref) {
        selectedEvidence = evidenceFor(entity, state, record);
      }
    }
    if (gridHelper) gridHelper.visible = effectiveLayers().grid;
    if (worldBoundsHelper) worldBoundsHelper.visible = effectiveLayers().bounds;
    selectedEvidence ??= [...objects.values()]
      .map((record) => record.alignmentEvidence)
      .find((evidence) => evidence !== undefined);
    props.onAlignmentEvidence?.(selectedEvidence);
    if (selectedEvidence) {
      container.dataset.alignmentStatus = selectedEvidence.passed ? "pass" : "fail";
    } else {
      delete container.dataset.alignmentStatus;
    }
    refreshObserverContext(snapshot);
    scheduleRender();
  });

  onCleanup(() => {
    disposed = true;
    cameraRig?.dispose();
    if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    resizeObserver?.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearInput);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    controls?.removeEventListener("change", onControlsChange);
    controls?.dispose();
    renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer?.domElement.removeEventListener("pointermove", onPointerMove);
    renderer?.domElement.removeEventListener("pointerup", onPointerUp);
    renderer?.domElement.removeEventListener("pointercancel", clearInput);
    renderer?.domElement.removeEventListener("lostpointercapture", clearInput);
    renderer?.domElement.removeEventListener("dblclick", onDoubleClick);
    renderer?.domElement.removeEventListener("wheel", onWheel);
    renderer?.domElement.removeEventListener("blur", clearInput);
    for (const ref of [...objects.keys()]) removeObject(ref);
    if (gridHelper) {
      scene?.remove(gridHelper);
      disposeObject(gridHelper);
    }
    if (worldBoundsHelper) {
      scene?.remove(worldBoundsHelper);
      disposeObject(worldBoundsHelper);
    }
    if (spark) {
      scene?.remove(spark);
      disposeSparkWhenIdle(spark);
    }
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  return (
    <div class="world-viewport" data-testid="world-viewport" ref={container}>
      <div class="observer-controls" aria-label="Observer modes">
        <div class="observer-mode-switch" role="group" aria-label="Observer mode">
          {(["overview", "inspect", "explore"] as const).map((mode) => (
            <button
              type="button"
              data-testid={`observer-mode-${mode}`}
              aria-pressed={observerMode() === mode}
              onClick={() => changeObserverMode(mode)}
            >
              {mode === "overview" ? "Overview" : mode === "inspect" ? "Inspect" : "进入世界"}
            </button>
          ))}
          <button type="button" data-testid="observer-reset" onClick={resetObserver}>Reset</button>
        </div>
        <div class="observer-readout" aria-live="polite">
          <strong data-testid="observer-current-mode">
            {observerMode() === "overview"
              ? "Overview · 世界外部概览"
              : observerMode() === "inspect"
                ? "Inspect · Orbit / Entity focus"
                : "Explore · Fly（无 validated navigation surface）"}
          </strong>
          <span data-testid="observer-entry-truth">{entryTruthLabel()}</span>
          <span data-testid="observer-entry-provenance">{entryProvenance()}</span>
          <span data-testid="observer-bounds-provenance">BOUNDS · {boundsProvenance()}</span>
          {presentationError()
            ? <em class="observer-error" role="alert" data-testid="observer-presentation-error">{presentationError()}</em>
            : null}
          <span data-testid="observer-help">
            {observerMode() === "explore"
              ? `W/A/S/D 平移 · Q/E 升降 · Shift 加速 · 滚轮调速 ${flySpeed().toFixed(2)} m/s · 拖拽视线 · Esc 释放`
              : observerMode() === "inspect"
                ? "单击选择 · F / 双击聚焦 · 鼠标 Orbit"
                : "完整世界边界 · 可开启 Grid / Bounds / Alignment / Collision debug layers"}
          </span>
          {observerMode() === "explore" && boundaryState() !== "inside"
            ? <em data-testid="observer-boundary-warning">当前世界边界 / 未知区域</em>
            : null}
        </div>
      </div>
    </div>
  );
}
