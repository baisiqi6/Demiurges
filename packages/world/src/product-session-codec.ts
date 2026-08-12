import type {
  Entity,
  EntityState,
  Episode,
  EvaluationRecord,
  RefRecord,
  Snapshot,
} from "./kernel/types";
import {
  CUBE_REF,
  CURRENT_WORLD_REF,
  deepFreeze,
  FLOOR_REF,
} from "./kernel/world";
import {
  BALL_REF,
  BALL_VESSEL_ASSET,
  BALL_VESSEL_FIXTURE,
  VESSEL_REF,
} from "./artifacts/ball-vessel-fixture";
import {
  BALL_VESSEL_PROGRAM,
  MUJOCO_PROFILE,
} from "./kernel/world";
import { requireDiagnosticGaussianSplatObservation } from "./artifacts/diagnostic-gaussian-splat";
import {
  requireDiagnosticRigidCollision,
  requireDiagnosticRigidVisual,
  requireRegisteredSnapshotIdentity,
} from "./artifacts/diagnostic-rigid-fixture";
import type {
  ProductSessionEvent,
  ProductSessionProjection,
  ProductWorldEvidence,
  ProductWorldToolName,
} from "./product-session-contract";
import { PRODUCT_WORLD_TOOL_NAMES } from "./product-session-contract";
import {
  deriveLandingSuccessContract,
  deriveStableInsideVesselSuccessContract,
  evaluateEpisode,
} from "./evaluation/evaluate-episode";
import { evaluateArticulatedReach } from "./evaluation/evaluate-articulated-reach";
import {
  ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST,
  runArticulatedReach,
} from "./runtime-mujoco/run-articulated-reach";
import { requireWorldProgramEvidence, requireWorldRunInput } from "./world-tools/world-tool-contract";
import type {
  WorldEditResult,
  WorldReadResult,
  WorldRunResult,
  WorldWriteResult,
} from "./world-tools/world-tool-surface";

const MAX_TEXT_LENGTH = 1_024;
const MAX_ENTITIES = 256;
const MAX_EVENTS = 10_000;
const MAX_PLAIN_DATA_DEPTH = 64;
const MAX_PLAIN_DATA_NODES = 100_000;
const MAX_PLAIN_DATA_STRING_CHARS = 2_000_000;
const MAX_PLAIN_DATA_COLLECTION_ITEMS = 10_000;

type DataRecord = Record<string, unknown>;

interface PlainDataBudget {
  nodes: number;
  stringChars: number;
}

function projectPlainData(
  value: unknown,
  label: string,
  budget: PlainDataBudget = {
    nodes: MAX_PLAIN_DATA_NODES,
    stringChars: MAX_PLAIN_DATA_STRING_CHARS,
  },
  depth = 0,
): unknown {
  budget.nodes -= 1;
  if (budget.nodes < 0) throw new Error(`${label} plain-data node budget 超限`);
  if (depth > MAX_PLAIN_DATA_DEPTH) throw new Error(`${label} plain-data depth 超限`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return finite(value, label);
  if (typeof value === "string") {
    budget.stringChars -= value.length;
    if (budget.stringChars < 0) throw new Error(`${label} plain-data string budget 超限`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} 必须是 JSON data`);

  const prototype = Object.getPrototypeOf(value);
  const ownKeys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error(`${label} 必须是 plain dense array`);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
    if (
      !Number.isSafeInteger(length) ||
      (length as number) < 0 ||
      (length as number) > MAX_PLAIN_DATA_COLLECTION_ITEMS
    ) {
      throw new Error(`${label} dense array length 非法`);
    }
    const expectedKeys = new Set(["length"]);
    const result: unknown[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const key = String(index);
      expectedKeys.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(`${label} 必须是 plain dense array`);
      }
      result.push(projectPlainData(descriptor.value, `${label}[${index}]`, budget, depth + 1));
    }
    if (
      ownKeys.length !== expectedKeys.size ||
      ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) {
      throw new Error(`${label} dense array 字段非法`);
    }
    return result;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }
  if (ownKeys.length > MAX_PLAIN_DATA_COLLECTION_ITEMS) {
    throw new Error(`${label} plain-data collection budget 超限`);
  }
  const result = Object.create(null) as DataRecord;
  for (const key of ownKeys) {
    if (typeof key !== "string" || key === "__proto__") {
      throw new Error(`${label} plain-data key 非法`);
    }
    budget.stringChars -= key.length;
    if (budget.stringChars < 0) throw new Error(`${label} plain-data string budget 超限`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} 必须是 enumerable data descriptor`);
    }
    result[key] = projectPlainData(descriptor.value, `${label}.${key}`, budget, depth + 1);
  }
  return result;
}

function record(value: unknown, label: string, keys?: readonly string[]): DataRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`${label} 必须是 plain JSON data record`);
  }
  const result = value as DataRecord;
  if (keys) {
    const ownKeys = Reflect.ownKeys(result);
    if (
      ownKeys.some((key) => typeof key !== "string") ||
      ownKeys.length !== keys.length ||
      keys.some((key) => !ownKeys.includes(key))
    ) {
      throw new Error(`${label} 字段非法`);
    }
  }
  return result;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数值`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} 必须是安全整数`);
  }
  return value as number;
}

function boundedString(value: unknown, label: string, maximum = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string" || value.length > maximum) {
    throw new Error(`${label} 必须是 bounded string`);
  }
  return value;
}

function id(value: unknown, prefix: string, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} identity 非法`);
  const result = value;
  if (!result.startsWith(prefix) || result.length === prefix.length) {
    throw new Error(`${label} identity 非法`);
  }
  return result;
}

function vec3(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} 必须是 Vec3`);
  for (let index = 0; index < 3; index += 1) {
    finite(value[index], `${label}[${index}]`);
  }
}

function entityState(value: unknown, label: string): EntityState {
  const preview = record(value, label);
  const keys = preview.articulated === undefined
    ? ["pose", "linearVelocity", "angularVelocity"]
    : ["pose", "linearVelocity", "angularVelocity", "articulated"];
  const state = record(value, label, keys);
  const pose = record(state.pose, `${label}.pose`, ["position", "rotation"]);
  vec3(pose.position, `${label}.pose.position`);
  const rotation = record(pose.rotation, `${label}.pose.rotation`, ["x", "y", "z", "w"]);
  const quaternion = (["x", "y", "z", "w"] as const).map((key) =>
    finite(rotation[key], `${label}.pose.rotation.${key}`),
  );
  if (Math.abs(Math.hypot(...quaternion) - 1) > 1e-9) {
    throw new Error(`${label}.pose.rotation 必须是单位 quaternion`);
  }
  vec3(state.linearVelocity, `${label}.linearVelocity`);
  vec3(state.angularVelocity, `${label}.angularVelocity`);
  if (state.articulated !== undefined) {
    const articulated = record(state.articulated, `${label}.articulated`, ["joints"]);
    if (!Array.isArray(articulated.joints) || articulated.joints.length !== 2) {
      throw new Error(`${label}.articulated.joints 必须恰好两项`);
    }
    const jointRefs = ["joint:arm-shoulder", "joint:arm-elbow"] as const;
    articulated.joints.forEach((value, index) => {
      const joint = record(value, `${label}.articulated.joints[${index}]`, [
        "jointRef", "positionRadians", "velocityRadiansPerSecond",
      ]);
      if (joint.jointRef !== jointRefs[index]) throw new Error(`${label}.jointRef registry 顺序漂移`);
      finite(joint.positionRadians, `${label}.positionRadians`);
      finite(joint.velocityRadiansPerSecond, `${label}.velocityRadiansPerSecond`);
    });
  }
  return state as unknown as EntityState;
}

function boxVisual(value: unknown, label: string): void {
  const representation = record(value, label, ["kind", "halfExtents", "color"]);
  if (representation.kind !== "box") throw new Error(`${label}.kind 非法`);
  vec3(representation.halfExtents, `${label}.halfExtents`);
  (representation.halfExtents as number[]).forEach((component) => {
    if (component <= 0) throw new Error(`${label}.halfExtents 必须为正数`);
  });
  boundedString(representation.color, `${label}.color`, 64);
}

function boxCollision(value: unknown, label: string): void {
  const representation = record(value, label, ["kind", "halfExtents"]);
  if (representation.kind !== "box") throw new Error(`${label}.kind 非法`);
  vec3(representation.halfExtents, `${label}.halfExtents`);
  (representation.halfExtents as number[]).forEach((component) => {
    if (component <= 0) throw new Error(`${label}.halfExtents 必须为正数`);
  });
}

function importedVisualShape(value: unknown, label: string): void {
  const representation = record(value, label, [
    "kind",
    "assetId",
    "contentDigest",
    "sourceFrameRef",
    "sourceUnitMeters",
    "localTransform",
  ]);
  if (representation.kind !== "imported-rigid-mesh") {
    throw new Error(`${label}.kind 非法`);
  }
  id(representation.assetId, "asset:", `${label}.assetId`);
  if (
    typeof representation.contentDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(representation.contentDigest)
  ) {
    throw new Error(`${label}.contentDigest 非法`);
  }
  if (representation.sourceFrameRef !== "frame:gltf-y-up") {
    throw new Error(`${label}.sourceFrameRef 非法`);
  }
  if (finite(representation.sourceUnitMeters, `${label}.sourceUnitMeters`) <= 0) {
    throw new Error(`${label}.sourceUnitMeters 必须是正数`);
  }
  const transform = record(representation.localTransform, `${label}.localTransform`, [
    "position",
    "rotation",
    "scale",
  ]);
  vec3(transform.position, `${label}.localTransform.position`);
  vec3(transform.scale, `${label}.localTransform.scale`);
  (transform.scale as number[]).forEach((component) => {
    if (component <= 0) throw new Error(`${label}.localTransform.scale 必须为正数`);
  });
  const rotation = record(transform.rotation, `${label}.localTransform.rotation`, [
    "x", "y", "z", "w",
  ]);
  const values = [rotation.x, rotation.y, rotation.z, rotation.w].map((component, index) =>
    finite(component, `${label}.localTransform.rotation[${index}]`),
  );
  if (Math.abs(Math.hypot(...values) - 1) > 1e-9) {
    throw new Error(`${label}.localTransform.rotation 必须是单位 quaternion`);
  }
}

function diagnosticImportedVisual(value: unknown, label: string): void {
  importedVisualShape(value, label);
  requireDiagnosticRigidVisual(value as never);
}

function gaussianSplatObservation(value: unknown, label: string): void {
  const representation = record(value, label, [
    "kind",
    "role",
    "assetId",
    "contentDigest",
    "sourceFrameRef",
    "sourceUnitMeters",
    "localTransform",
  ]);
  if (representation.kind !== "gaussian-splat" || representation.role !== "observation") {
    throw new Error(`${label}.kind/role 非法`);
  }
  id(representation.assetId, "asset:", `${label}.assetId`);
  if (
    typeof representation.contentDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(representation.contentDigest)
  ) {
    throw new Error(`${label}.contentDigest 非法`);
  }
  if (representation.sourceFrameRef !== "frame:gltf-y-up") {
    throw new Error(`${label}.sourceFrameRef 非法`);
  }
  if (finite(representation.sourceUnitMeters, `${label}.sourceUnitMeters`) <= 0) {
    throw new Error(`${label}.sourceUnitMeters 必须是正数`);
  }
  const transform = record(representation.localTransform, `${label}.localTransform`, [
    "position",
    "rotation",
    "scale",
  ]);
  vec3(transform.position, `${label}.localTransform.position`);
  vec3(transform.scale, `${label}.localTransform.scale`);
  const scale = transform.scale as number[];
  scale.forEach((component) => {
    if (component <= 0) throw new Error(`${label}.localTransform.scale 必须为正数`);
  });
  if (scale[0] !== scale[1] || scale[1] !== scale[2]) {
    throw new Error(`${label}.localTransform.scale 必须是 uniform scale`);
  }
  const rotation = record(transform.rotation, `${label}.localTransform.rotation`, [
    "x", "y", "z", "w",
  ]);
  const values = [rotation.x, rotation.y, rotation.z, rotation.w].map((component, index) =>
    finite(component, `${label}.localTransform.rotation[${index}]`),
  );
  if (Math.abs(Math.hypot(...values) - 1) > 1e-9) {
    throw new Error(`${label}.localTransform.rotation 必须是单位 quaternion`);
  }
  requireDiagnosticGaussianSplatObservation(representation as never);
}

type ProductScenario = "falling-rigid" | "ball-vessel" | "articulated-reach";

function snapshotScenario(refs: readonly string[], label: string): ProductScenario {
  const refSet = new Set(refs);
  if (
    refSet.size === 2 &&
    refSet.has(FLOOR_REF) &&
    refSet.has(CUBE_REF)
  ) return "falling-rigid";
  if (
    refSet.size === 3 &&
    refSet.has(FLOOR_REF) &&
    refSet.has(VESSEL_REF) &&
    refSet.has(BALL_REF)
  ) return "ball-vessel";
  if (
    refSet.size === 3 &&
    refSet.has(FLOOR_REF) &&
    refSet.has("entity:arm") &&
    refSet.has("entity:target")
  ) return "articulated-reach";
  throw new Error(`${label} 只支持 registered Product scenario`);
}

function snapshot(value: unknown, label: string): Snapshot {
  const data = record(value, label, ["schemaVersion", "id", "parentId", "source", "scenarioId", "entities"]);
  if (data.schemaVersion !== 1) throw new Error(`${label}.schemaVersion 非法`);
  id(data.id, "snapshot:", `${label}.id`);
  if (data.parentId !== null) id(data.parentId, "snapshot:", `${label}.parentId`);
  if (data.source !== "write" && data.source !== "edit" && data.source !== "runtime-terminal") {
    throw new Error(`${label}.source 非法`);
  }
  if (data.scenarioId !== "scenario:primitive-box-free-fall-v1" &&
      data.scenarioId !== "scenario:diagnostic-rigid-free-fall-v1" &&
      data.scenarioId !== "scenario:ball-vessel-free-fall-v1" &&
      data.scenarioId !== "scenario:two-joint-planar-reach-v1") {
    throw new Error(`${label}.scenarioId 非法`);
  }
  if (!Array.isArray(data.entities) || data.entities.length > MAX_ENTITIES) {
    throw new Error(`${label}.entities 非法`);
  }
  const entityRecords = data.entities.map((value, index) =>
    record(value, `${label}.entities[${index}]`, [
      "ref", "label", "frameRef", "unitSystemRef", "state", "representations", "physics",
    ]));
  const refList = entityRecords.map((entity, index) =>
    id(entity.ref, "entity:", `${label}.entities[${index}].ref`));
  if (new Set(refList).size !== refList.length) throw new Error(`${label}.entities ref 重复`);
  const scenario = snapshotScenario(refList, label);
  entityRecords.forEach((entity, index) => {
    const ref = id(entity.ref, "entity:", `${label}.entities[${index}].ref`);
    boundedString(entity.label, `${label}.entities[${index}].label`);
    if (entity.frameRef !== "frame:world" || entity.unitSystemRef !== "units:si") {
      throw new Error(`${label}.entities frame/units 非法`);
    }
    entityState(entity.state, `${label}.entities[${index}].state`);
    const representations = record(entity.representations, `${label}.entities[${index}].representations`, [
      "visual", "collision", "observation", "semantic",
    ]);
    if (scenario === "articulated-reach") {
      if (ref === "entity:arm" && (representations.semantic as { kind?: unknown } | null)?.kind !== "articulated") {
        throw new Error(`${label}.entity:arm articulated semantic 缺失`);
      }
      if (ref === "entity:target" && (representations.semantic as { kind?: unknown } | null)?.kind !== "goal-frame") {
        throw new Error(`${label}.entity:target goal frame 缺失`);
      }
      if (ref === FLOOR_REF && representations.semantic !== null) {
        throw new Error(`${label}.entity:floor semantic 必须为 null`);
      }
    } else if (scenario === "falling-rigid") {
      if (representations.semantic !== null) {
        throw new Error(`${label}.entities[${index}].representations.semantic 当前 scenario 必须为 null`);
      }
    } else if (ref === VESSEL_REF) {
      if (!samePlainData(representations.semantic, BALL_VESSEL_FIXTURE.semantic)) {
        throw new Error(`${label}.${VESSEL_REF}.semantic 与 fixture registry 漂移`);
      }
    } else if (representations.semantic !== null) {
      throw new Error(`${label}.${ref}.semantic 必须为 null`);
    }
    const visual = record(
      representations.visual,
      `${label}.entities[${index}].representations.visual`,
    );
    const visualLabel = `${label}.entities[${index}].representations.visual`;
    const collisionLabel = `${label}.entities[${index}].representations.collision`;
    if (scenario === "articulated-reach") {
      if (visual.kind === "box") boxVisual(visual, visualLabel);
      else {
        const sphere = record(visual, visualLabel, ["kind", "radius", "color"]);
        if (sphere.kind !== "sphere") throw new Error(`${visualLabel}.kind 非法`);
        finite(sphere.radius, `${visualLabel}.radius`);
        boundedString(sphere.color, `${visualLabel}.color`, 64);
      }
      const collision = record(representations.collision, collisionLabel);
      if (collision.kind === "box") boxCollision(collision, collisionLabel);
      else if (collision.kind !== "none" || Reflect.ownKeys(collision).length !== 1) {
        throw new Error(`${collisionLabel} articulated collision 非法`);
      }
    } else if (scenario === "falling-rigid") {
      if (visual.kind === "box") {
        boxVisual(visual, visualLabel);
      } else {
        diagnosticImportedVisual(visual, visualLabel);
      }
      boxCollision(representations.collision, collisionLabel);
      if (visual.kind === "imported-rigid-mesh") {
        requireDiagnosticRigidCollision(representations.collision as never);
      }
    } else if (ref === FLOOR_REF) {
      boxVisual(visual, visualLabel);
      boxCollision(representations.collision, collisionLabel);
    } else if (ref === VESSEL_REF) {
      importedVisualShape(visual, visualLabel);
      const expectedVisual = {
        kind: "imported-rigid-mesh",
        assetId: BALL_VESSEL_ASSET.assetId,
        contentDigest: BALL_VESSEL_ASSET.contentDigest,
        sourceFrameRef: BALL_VESSEL_ASSET.sourceFrameRef,
        sourceUnitMeters: BALL_VESSEL_ASSET.sourceUnitMeters,
        localTransform: BALL_VESSEL_ASSET.localTransform,
      };
      if (!samePlainData(visual, expectedVisual)) {
        throw new Error(`${label}.${VESSEL_REF}.visual artifact identity/alignment 漂移`);
      }
      if (!samePlainData(representations.collision, BALL_VESSEL_FIXTURE.collision)) {
        throw new Error(`${label}.${VESSEL_REF}.compound collision 与 fixture registry 漂移`);
      }
    } else {
      const sphereVisual = record(visual, visualLabel, ["kind", "radius", "color"]);
      const sphereCollision = record(representations.collision, collisionLabel, ["kind", "radius"]);
      if (
        sphereVisual.kind !== "sphere" ||
        finite(sphereVisual.radius, `${visualLabel}.radius`) !== BALL_VESSEL_FIXTURE.ball.radiusMeters ||
        typeof sphereVisual.color !== "string" ||
        sphereCollision.kind !== "sphere" ||
        finite(sphereCollision.radius, `${collisionLabel}.radius`) !== BALL_VESSEL_FIXTURE.ball.radiusMeters
      ) {
        throw new Error(`${label}.${BALL_REF} sphere representation 与 fixture registry 漂移`);
      }
    }
    if (representations.observation !== null) {
      if (scenario !== "falling-rigid") {
        throw new Error(`${label}.${ref}.observation 在 ball-vessel scenario 必须为 null`);
      }
      if (ref !== CUBE_REF) {
        throw new Error(
          `${label}.entities[${index}].representations.observation 必须绑定 ${CUBE_REF}`,
        );
      }
      if (visual.kind !== "imported-rigid-mesh") {
        throw new Error(
          `${label}.entities[${index}].representations.observation 只允许绑定登记 imported visual`,
        );
      }
      requireDiagnosticRigidCollision(representations.collision as never);
      gaussianSplatObservation(
        representations.observation,
        `${label}.entities[${index}].representations.observation`,
      );
    }
    const physics = record(entity.physics, `${label}.entities[${index}].physics`, [
      "bodyType", "massKg", "friction",
    ]);
    if (physics.bodyType !== "static" && physics.bodyType !== "dynamic") {
      throw new Error(`${label}.entities bodyType 非法`);
    }
    const massKg = finite(physics.massKg, `${label}.entities massKg`);
    const friction = finite(physics.friction, `${label}.entities friction`);
    if (massKg < 0 || friction < 0) {
      throw new Error(`${label}.entities massKg/friction 必须非负`);
    }
  });
  const decoded = data as unknown as Snapshot;
  requireRegisteredSnapshotIdentity(decoded);
  const entities = decoded.entities;
  const floor = entities.find((entity) => entity.ref === FLOOR_REF)!;
  if (
    floor.physics.bodyType !== "static" ||
    floor.physics.massKg !== 0 ||
    floor.state.linearVelocity.some((value) => value !== 0) ||
    floor.state.angularVelocity.some((value) => value !== 0)
  ) {
    throw new Error(`${label} 要求 0 mass/velocity 的 static floor`);
  }
  if (scenario === "falling-rigid") {
    const cube = entities.find((entity) => entity.ref === CUBE_REF)!;
    if (cube.physics.bodyType !== "dynamic" || cube.physics.massKg <= 0) {
      throw new Error(`${label} 要求 positive-mass dynamic cube`);
    }
  } else if (scenario === "ball-vessel") {
    const vessel = entities.find((entity) => entity.ref === VESSEL_REF)!;
    const ball = entities.find((entity) => entity.ref === BALL_REF)!;
    if (
      vessel.physics.bodyType !== "static" ||
      vessel.physics.massKg !== 0 ||
      vessel.state.linearVelocity.some((component) => component !== 0) ||
      vessel.state.angularVelocity.some((component) => component !== 0)
    ) {
      throw new Error(`${label} 要求 static vessel`);
    }
    if (
      ball.physics.bodyType !== "dynamic" ||
      ball.physics.massKg !== BALL_VESSEL_FIXTURE.ball.massKg
    ) {
      throw new Error(`${label} 要求 registered positive-mass dynamic ball`);
    }
  } else {
    const arm = entities.find((entity) => entity.ref === "entity:arm")!;
    const target = entities.find((entity) => entity.ref === "entity:target")!;
    if (arm.physics.bodyType !== "static" || !arm.state.articulated || target.physics.bodyType !== "static") {
      throw new Error(`${label} 要求 registered static articulated arm/target`);
    }
  }
  return decoded;
}

function refRecord(value: unknown, label: string): RefRecord {
  const ref = record(value, label, ["name", "snapshotId", "version"]);
  if (ref.name !== CURRENT_WORLD_REF) {
    throw new Error(`${label}.name 必须是 ${CURRENT_WORLD_REF}`);
  }
  id(ref.snapshotId, "snapshot:", `${label}.snapshotId`);
  safeInteger(ref.version, `${label}.version`, 1);
  return ref as unknown as RefRecord;
}

function worldReadLike(
  value: unknown,
  expectedTool: "read" | "write",
  label: string,
): WorldReadResult | WorldWriteResult {
  const data = record(value, label, ["tool", "ref", "snapshot"]);
  if (data.tool !== expectedTool) throw new Error(`${label}.tool 非法`);
  const ref = refRecord(data.ref, `${label}.ref`);
  const current = snapshot(data.snapshot, `${label}.snapshot`);
  if (ref.snapshotId !== current.id) throw new Error(`${label} ref/snapshot identity 漂移`);
  if (expectedTool === "write" && (current.source !== "write" || current.parentId !== null)) {
    throw new Error(`${label} write Snapshot lineage 非法`);
  }
  return data as unknown as WorldReadResult | WorldWriteResult;
}

function worldEdit(
  value: unknown,
  label: string,
  expectedWorld: WorldAuthorityContext,
): WorldEditResult {
  const data = record(value, label, ["tool", "update"]);
  if (data.tool !== "edit") throw new Error(`${label}.tool 非法`);
  const update = record(data.update, `${label}.update`, ["status", "operation", "ref", "snapshot"]);
  if (update.status !== "updated" && update.status !== "stale_ref") {
    throw new Error(`${label}.update.status 非法`);
  }
  if (update.operation !== "advance") {
    throw new Error(`${label}.update.operation 非法`);
  }
  const ref = refRecord(update.ref, `${label}.update.ref`);
  const current = snapshot(update.snapshot, `${label}.update.snapshot`);
  if (ref.snapshotId !== current.id) {
    throw new Error(`${label}.update identity 漂移`);
  }
  if (update.status === "stale_ref") {
    if (!sameWorldAuthority({ ref, snapshot: current }, expectedWorld)) {
      throw new Error(`${label}.update stale_ref 与前序 world authority 不一致`);
    }
  } else if (
    current.source !== "edit" ||
    current.parentId !== expectedWorld.snapshot.id ||
    current.scenarioId !== expectedWorld.snapshot.scenarioId ||
    ref.name !== expectedWorld.ref.name ||
    ref.version !== expectedWorld.ref.version + 1
  ) {
    throw new Error(`${label}.update 没有从前序 world authority 直接推进`);
  }
  return data as unknown as WorldEditResult;
}

type WorldAuthorityContext = Pick<WorldReadResult, "ref" | "snapshot">;

function worldAuthority(value: WorldAuthorityContext): WorldAuthorityContext {
  return { ref: value.ref, snapshot: value.snapshot };
}

function sameWorldAuthority(
  left: WorldAuthorityContext | null,
  right: WorldAuthorityContext | null,
): boolean {
  if (left === null || right === null) return left === right;
  return samePlainData(worldAuthority(left), worldAuthority(right));
}

function samePlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => samePlainData(value, right[index]));
  }
  if (
    typeof left !== "object" || left === null ||
    typeof right !== "object" || right === null
  ) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      samePlainData(leftRecord[key], rightRecord[key])
    );
}

function entityMap(current: Snapshot): Map<Entity["ref"], Entity> {
  return new Map(current.entities.map((entity) => [entity.ref, entity]));
}

function requireExactEntityRefs(
  actual: readonly string[],
  expected: ReadonlySet<string>,
  label: string,
): void {
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== actual.length ||
    actual.some((ref) => !expected.has(ref))
  ) throw new Error(`${label} EntityRef 证据链非法`);
}

function requireEpisodeEvidenceChain(
  runEpisode: Episode,
  baseSnapshot: Snapshot,
  label: string,
): void {
  const baseEntities = entityMap(baseSnapshot);
  const expectedRefs = new Set(baseEntities.keys());
  const terminalEntities = entityMap(runEpisode.terminalSnapshot);
  requireExactEntityRefs(
    [...terminalEntities.keys()],
    expectedRefs,
    `${label}.terminalSnapshot`,
  );

  runEpisode.samples.forEach((sample, index) => {
    requireExactEntityRefs(
      Object.keys(sample.states),
      expectedRefs,
      `${label}.samples[${index}].states`,
    );
    if (runEpisode.program.kind === "actuator-sequence") {
      for (const [ref, baseEntity] of baseEntities) {
        const sampleState = sample.states[ref];
        if (!sampleState) throw new Error(`${label}.samples[${index}].${ref} state 缺失`);
        if (ref !== "entity:arm" && !samePlainData(sampleState, baseEntity.state)) {
          throw new Error(`${label}.samples[${index}].${ref} fixed state 漂移`);
        }
        if (ref === "entity:arm" && !samePlainData(
          { pose: sampleState.pose, linearVelocity: sampleState.linearVelocity, angularVelocity: sampleState.angularVelocity },
          { pose: baseEntity.state.pose, linearVelocity: baseEntity.state.linearVelocity, angularVelocity: baseEntity.state.angularVelocity },
        )) throw new Error(`${label}.samples[${index}].entity:arm root state 漂移`);
      }
    }
  });
  runEpisode.events.forEach((event, index) => {
    requireExactEntityRefs(
      [...event.entities],
      new Set(event.entities),
      `${label}.events[${index}].entities`,
    );
    if (event.entities.some((ref) => !expectedRefs.has(ref))) {
      throw new Error(`${label}.events[${index}].entities EntityRef 证据链非法`);
    }
  });

  for (const [ref, baseEntity] of baseEntities) {
    const terminalEntity = terminalEntities.get(ref);
    if (!terminalEntity) throw new Error(`${label} EntityRef 证据链非法`);
    if (
      terminalEntity.label !== baseEntity.label ||
      terminalEntity.frameRef !== baseEntity.frameRef ||
      terminalEntity.unitSystemRef !== baseEntity.unitSystemRef ||
      !samePlainData(terminalEntity.representations, baseEntity.representations) ||
      !samePlainData(terminalEntity.physics, baseEntity.physics)
    ) throw new Error(`${label}.${ref} representation 证据链非法`);
  }

  const lastSample = runEpisode.samples.at(-1);
  if (!lastSample) throw new Error(`${label}.samples 不能为空`);
  for (const [ref, terminalEntity] of terminalEntities) {
    if (!samePlainData(lastSample.states[ref], terminalEntity.state)) {
      throw new Error(`${label}.${ref} terminal state 证据链非法`);
    }
  }
}

function episode(value: unknown, label: string): Episode {
  const data = record(value, label, [
    "id", "baseSnapshotId", "scenarioId", "program", "runtimeProfileId", "explicitInputs", "completion",
    "samples", "events", "terminalSnapshot", "runtimeEvidence",
  ]);
  id(data.id, "episode:", `${label}.id`);
  id(data.baseSnapshotId, "snapshot:", `${label}.baseSnapshotId`);
  const programPreview = record(data.program, `${label}.program`);
  const programData = record(data.program, `${label}.program`, programPreview.kind === "actuator-sequence"
    ? ["id","kind","targetRef","durationSeconds","sampleRateHz","steps"]
    : ["id","kind","targetRef","durationSeconds","sampleRateHz"]);
  const programId = id(programData.id, "program:", `${label}.program.id`);
  const { id: _programId, ...programContent } = programData;
  const trustedProgram = requireWorldProgramEvidence(programContent);
  if (programId !== trustedProgram.id || !samePlainData(programData, trustedProgram)) {
    throw new Error(`${label}.program 与 canonical Program 不一致`);
  }
  if (data.scenarioId !== "scenario:primitive-box-free-fall-v1" &&
      data.scenarioId !== "scenario:diagnostic-rigid-free-fall-v1" &&
      data.scenarioId !== "scenario:ball-vessel-free-fall-v1" &&
      data.scenarioId !== "scenario:two-joint-planar-reach-v1") {
    throw new Error(`${label}.scenarioId 非法`);
  }
  if (data.runtimeProfileId !== MUJOCO_PROFILE.id) {
    throw new Error(`${label}.runtimeProfileId 未登记`);
  }
  const inputs = record(data.explicitInputs, `${label}.explicitInputs`, ["runId"]);
  id(inputs.runId, "run:", `${label}.explicitInputs.runId`);
  if (data.completion !== "completed") throw new Error(`${label}.completion 非法`);
  const articulated = trustedProgram.kind === "actuator-sequence";
  const ballVessel = data.scenarioId === "scenario:ball-vessel-free-fall-v1";
  const expectedSampleCount = trustedProgram.durationSeconds * trustedProgram.sampleRateHz + 1;
  if (!Array.isArray(data.samples) || data.samples.length !== expectedSampleCount) {
    throw new Error(`${label}.samples 非法`);
  }
  data.samples.forEach((value, index) => {
    const sampleLabel = `${label}.samples[${index}]`;
    const sample = record(value, sampleLabel, articulated
      ? ["timeSeconds", "states", "contactCount", "articulated"]
      : ballVessel
      ? ["timeSeconds", "states", "contactCount", "contacts"]
      : ["timeSeconds", "states", "contactCount"]);
    const timeSeconds = finite(sample.timeSeconds, `${sampleLabel}.timeSeconds`);
    if (Math.abs(timeSeconds - index / 30) > 1e-9) {
      throw new Error(`${sampleLabel}.timeSeconds 不在 registered sample grid`);
    }
    const contactCount = safeInteger(sample.contactCount, `${sampleLabel}.contactCount`);
    const states = record(sample.states, `${label}.samples[${index}].states`);
    const stateKeys = Reflect.ownKeys(states);
    if (stateKeys.length > MAX_ENTITIES || stateKeys.some((key) => typeof key !== "string")) {
      throw new Error(`${label}.samples[${index}].states 非法`);
    }
    for (const key of stateKeys as string[]) {
      id(key, "entity:", `${label}.samples[${index}].states key`);
      entityState(states[key], `${label}.samples[${index}].states.${key}`);
    }
    if (articulated) {
      if (contactCount !== 0) throw new Error(`${sampleLabel}.contactCount 必须为 0`);
      const evidence = record(sample.articulated, `${sampleLabel}.articulated`, [
        "targetRef", "joints", "sensors", "activeCommands",
      ]);
      if (evidence.targetRef !== "entity:arm") throw new Error(`${sampleLabel}.targetRef 非法`);
      const state = entityState(states["entity:arm"], `${sampleLabel}.states.entity:arm`);
      if (!samePlainData(evidence.joints, state.articulated?.joints)) {
        throw new Error(`${sampleLabel}.joint evidence 与 state 不一致`);
      }
      if (!Array.isArray(evidence.sensors) || evidence.sensors.length !== 4) {
        throw new Error(`${sampleLabel}.sensors 必须恰好四项`);
      }
      const sensorRefs = [
        "sensor:arm-shoulder-position", "sensor:arm-shoulder-velocity",
        "sensor:arm-elbow-position", "sensor:arm-elbow-velocity",
      ];
      const joints = state.articulated!.joints;
      const sensorValues = [
        joints[0]!.positionRadians, joints[0]!.velocityRadiansPerSecond,
        joints[1]!.positionRadians, joints[1]!.velocityRadiansPerSecond,
      ];
      evidence.sensors.forEach((value, sensorIndex) => {
        const sensor = record(value, `${sampleLabel}.sensors[${sensorIndex}]`, ["sensorRef", "value"]);
        if (sensor.sensorRef !== sensorRefs[sensorIndex] || Math.abs(finite(sensor.value, `${sampleLabel}.sensor.value`) - sensorValues[sensorIndex]!) > 1e-9) {
          throw new Error(`${sampleLabel}.sensor registry/value 漂移`);
        }
      });
      const activeStep = [...trustedProgram.steps].reverse().find((step) => step.timeSeconds <= timeSeconds)!;
      if (!samePlainData(evidence.activeCommands, activeStep.commands)) {
        throw new Error(`${sampleLabel}.activeCommands 与 Program 不一致`);
      }
    }
    if (ballVessel) {
      if (!Array.isArray(sample.contacts) || sample.contacts.length !== contactCount) {
        throw new Error(`${sampleLabel}.contacts 与 contactCount 不一致`);
      }
      sample.contacts.forEach((value, contactIndex) => {
        const contactLabel = `${sampleLabel}.contacts[${contactIndex}]`;
        const contact = record(value, contactLabel, [
          "targetRef", "otherRef", "normalOnTargetWorld", "penetrationMeters",
        ]);
        if (contact.targetRef !== BALL_REF || contact.otherRef !== VESSEL_REF) {
          throw new Error(`${contactLabel} semantic EntityRef pair 非法`);
        }
        vec3(contact.normalOnTargetWorld, `${contactLabel}.normalOnTargetWorld`);
        if (Math.abs(Math.hypot(...contact.normalOnTargetWorld as number[]) - 1) > 1e-6) {
          throw new Error(`${contactLabel}.normalOnTargetWorld 必须是单位向量`);
        }
        if (finite(contact.penetrationMeters, `${contactLabel}.penetrationMeters`) < 0) {
          throw new Error(`${contactLabel}.penetrationMeters 不能为负数`);
        }
      });
    }
  });
  if (!Array.isArray(data.events) || data.events.length > MAX_EVENTS) {
    throw new Error(`${label}.events 非法`);
  }
  data.events.forEach((value, index) => {
    const event = record(value, `${label}.events[${index}]`, ["type", "timeSeconds", "entities"]);
    if (event.type !== "contact-began") throw new Error(`${label}.events type 非法`);
    finite(event.timeSeconds, `${label}.events timeSeconds`);
    if (!Array.isArray(event.entities) || event.entities.length !== 2) {
      throw new Error(`${label}.events entities 非法`);
    }
    event.entities.forEach((entity, entityIndex) =>
      id(entity, "entity:", `${label}.events[${index}].entities[${entityIndex}]`),
    );
  });
  const terminal = snapshot(data.terminalSnapshot, `${label}.terminalSnapshot`);
  const runtime = record(data.runtimeEvidence, `${label}.runtimeEvidence`, articulated
    ? ["provider", "version", "modelFormat", "modelCausalDigest"]
    : ["provider", "version", "modelFormat"]);
  if (
    runtime.provider !== MUJOCO_PROFILE.provider ||
    runtime.version !== MUJOCO_PROFILE.version ||
    runtime.modelFormat !== "MJCF"
  ) throw new Error(`${label}.runtimeEvidence identity 非法`);
  if (articulated && (typeof runtime.modelCausalDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(runtime.modelCausalDigest))) {
    throw new Error(`${label}.runtimeEvidence.modelCausalDigest 非法`);
  }
  if (terminal.source !== "runtime-terminal" || terminal.parentId !== data.baseSnapshotId) {
    throw new Error(`${label}.terminalSnapshot lineage 非法`);
  }
  if (terminal.scenarioId !== data.scenarioId) {
    throw new Error(`${label}.terminalSnapshot scenario 与 Episode authority 不一致`);
  }
  const scenario = snapshotScenario(terminal.entities.map((entity) => entity.ref), label);
  if (
    (scenario === "ball-vessel") !== ballVessel || (scenario === "articulated-reach") !== articulated
  ) throw new Error(`${label}.program 与 terminal scenario 不匹配`);
  return data as unknown as Episode;
}

function evaluation(value: unknown, expectedEpisodeId: string, label: string): EvaluationRecord {
  const data = record(value, label, ["id", "evaluatorId", "episodeId", "contractId", "passed", "metrics"]);
  id(data.id, "evaluation:", `${label}.id`);
  id(data.evaluatorId, "evaluator:", `${label}.evaluatorId`);
  id(data.episodeId, "episode:", `${label}.episodeId`);
  if (data.episodeId !== expectedEpisodeId) {
    throw new Error(`${label} identity 非法`);
  }
  if (typeof data.passed !== "boolean") throw new Error(`${label}.passed 非法`);
  if (
    data.contractId === "success:stable-on-floor" &&
    data.evaluatorId === "evaluator:stable-landing-v1"
  ) {
    const metrics = record(data.metrics, `${label}.metrics`, [
      "terminalCenterHeight", "heightError", "terminalLinearSpeed",
    ]);
    finite(metrics.terminalCenterHeight, `${label}.metrics.terminalCenterHeight`);
    finite(metrics.heightError, `${label}.metrics.heightError`);
    finite(metrics.terminalLinearSpeed, `${label}.metrics.terminalLinearSpeed`);
  } else if (
    data.contractId === "success:stable-inside-vessel" &&
    data.evaluatorId === "evaluator:stable-inside-vessel-v1"
  ) {
    const metrics = record(data.metrics, `${label}.metrics`, [
      "supportSamples",
      "requiredSupportSamples",
      "maxHorizontalOffsetMeters",
      "maxLinearSpeedMetersPerSecond",
      "maxFloorDistanceErrorMeters",
      "maxPenetrationMeters",
    ]);
    safeInteger(metrics.supportSamples, `${label}.metrics.supportSamples`);
    safeInteger(metrics.requiredSupportSamples, `${label}.metrics.requiredSupportSamples`);
    [
      "maxHorizontalOffsetMeters",
      "maxLinearSpeedMetersPerSecond",
      "maxFloorDistanceErrorMeters",
      "maxPenetrationMeters",
    ].forEach((key) => {
      if (finite(metrics[key], `${label}.metrics.${key}`) < 0) {
        throw new Error(`${label}.metrics.${key} 不能为负数`);
      }
    });
  } else if (
    data.contractId === "success:end-effector-reaches-frame" &&
    data.evaluatorId === "evaluator:end-effector-reach-v1"
  ) {
    const metrics = record(data.metrics, `${label}.metrics`, [
      "supportSamples", "requiredSupportSamples", "maxPositionErrorMeters", "maxJointSpeedRadiansPerSecond",
    ]);
    safeInteger(metrics.supportSamples, `${label}.metrics.supportSamples`);
    if (metrics.requiredSupportSamples !== 16) throw new Error(`${label}.requiredSupportSamples 必须为 16`);
    finite(metrics.maxPositionErrorMeters, `${label}.maxPositionErrorMeters`);
    finite(metrics.maxJointSpeedRadiansPerSecond, `${label}.maxJointSpeedRadiansPerSecond`);
  } else {
    throw new Error(`${label} evaluator/contract identity 非法`);
  }
  return data as unknown as EvaluationRecord;
}

function worldRun(
  value: unknown,
  label: string,
  expectedWorld?: WorldAuthorityContext,
  allowUnverifiedArticulated = false,
): WorldRunResult {
  const data = record(value, label, ["tool", "baseRef", "episode", "evaluation"]);
  if (data.tool !== "run") throw new Error(`${label}.tool 非法`);
  const baseRef = refRecord(data.baseRef, `${label}.baseRef`);
  const runEpisode = episode(data.episode, `${label}.episode`);
  const runEvaluation = evaluation(data.evaluation, runEpisode.id, `${label}.evaluation`);
  if (runEpisode.program.kind === "actuator-sequence"
    ? runEvaluation.contractId !== "success:end-effector-reaches-frame"
    : (runEpisode.program.id === BALL_VESSEL_PROGRAM.id) !== (runEvaluation.contractId === "success:stable-inside-vessel")) {
    throw new Error(`${label} Program/Evaluation scenario identity 漂移`);
  }
  if (baseRef.snapshotId !== runEpisode.baseSnapshotId) throw new Error(`${label} base identity 漂移`);
  const trustedEpisode = deepFreeze(runEpisode) as Episode;
  if (
    runEpisode.program.kind === "actuator-sequence" &&
    runEpisode.runtimeEvidence.modelCausalDigest !== ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST
  ) throw new Error(`${label}.runtimeEvidence 与 canonical Runtime registry 不一致`);
  const trustedEvaluation = runEpisode.program.kind === "actuator-sequence"
    ? evaluateArticulatedReach(trustedEpisode)
    : evaluateEpisode(trustedEpisode, runEpisode.program.id === BALL_VESSEL_PROGRAM.id
      ? deriveStableInsideVesselSuccessContract(trustedEpisode)
      : deriveLandingSuccessContract(trustedEpisode));
  if (!samePlainData(runEvaluation, trustedEvaluation)) {
    throw new Error(`${label}.evaluation Evaluation 与受信 evaluator 结果不一致`);
  }
  if (expectedWorld) {
    if (
      baseRef.name !== expectedWorld.ref.name ||
      baseRef.snapshotId !== expectedWorld.ref.snapshotId ||
      baseRef.version !== expectedWorld.ref.version ||
      runEpisode.baseSnapshotId !== expectedWorld.snapshot.id ||
      runEpisode.scenarioId !== expectedWorld.snapshot.scenarioId
    ) throw new Error(`${label} base ref 证据链非法`);
    if (runEpisode.terminalSnapshot.id === expectedWorld.snapshot.id) {
      throw new Error(`${label} terminal Snapshot identity 必须与 base 不同`);
    }
    requireEpisodeEvidenceChain(runEpisode, expectedWorld.snapshot, `${label}.episode`);
  }
  if (runEpisode.program.kind === "actuator-sequence" && !allowUnverifiedArticulated) {
    throw new Error(`${label} articulated evidence 必须经过 trusted Runtime replay`);
  }
  return data as unknown as WorldRunResult;
}

async function requireTrustedArticulatedReplay(
  result: WorldRunResult,
  expectedWorld: WorldAuthorityContext,
  label: string,
): Promise<void> {
  if (result.episode.program.kind !== "actuator-sequence") return;
  const { id: _programId, ...programContent } = result.episode.program;
  const replayProgram = requireWorldRunInput({
    runId: result.episode.explicitInputs.runId,
    program: JSON.parse(JSON.stringify(programContent)),
  }).program;
  const replay = await runArticulatedReach(
    deepFreeze(JSON.parse(JSON.stringify(expectedWorld.snapshot))) as Snapshot,
    replayProgram as Extract<Episode["program"], { kind: "actuator-sequence" }>,
    MUJOCO_PROFILE,
    deepFreeze({ runId: result.episode.explicitInputs.runId }),
  );
  if (!samePlainData(result.episode, replay)) {
    throw new Error(`${label}.episode 与 trusted Runtime replay 不一致`);
  }
}

function evidence(
  value: unknown,
  tool: ProductWorldToolName,
  label: string,
  expectedWorld?: WorldAuthorityContext | null,
): ProductWorldEvidence {
  switch (tool) {
    case "world_read": {
      if (!expectedWorld) throw new Error(`${label} successful world_read 缺少既有 world authority`);
      const read = worldReadLike(value, "read", label) as WorldReadResult;
      if (!sameWorldAuthority(read, expectedWorld)) {
        throw new Error(`${label} world_read 与前序 world authority 不一致`);
      }
      return read;
    }
    case "world_write": {
      if (expectedWorld) throw new Error(`${label} world_write 不得替换既有 world authority`);
      return worldReadLike(value, "write", label) as WorldWriteResult;
    }
    case "world_edit": {
      if (!expectedWorld) throw new Error(`${label} world_edit 缺少前序 world authority`);
      return worldEdit(value, label, expectedWorld);
    }
    case "world_run": {
      if (!expectedWorld) throw new Error(`${label} world_run 缺少 authored world context`);
      return worldRun(value, label, expectedWorld);
    }
  }
}

function toolName(value: unknown, label: string): ProductWorldToolName {
  if (typeof value !== "string" || !(PRODUCT_WORLD_TOOL_NAMES as readonly string[]).includes(value)) {
    throw new Error(`${label} 非法`);
  }
  return value as ProductWorldToolName;
}

function decodeProductSessionEventInternal(
  value: unknown,
  expectedSessionId: string,
  expectedSequence: number,
  expectedWorld?: WorldAuthorityContext | null,
  allowUnverifiedArticulated = false,
): ProductSessionEvent {
  const data = record(projectPlainData(value, "Product Session event"), "Product Session event");
  if (safeInteger(data.sequence, "event.sequence", 1) !== expectedSequence) {
    throw new Error(`Product Session event sequence 必须为 ${expectedSequence}`);
  }
  if (data.sessionId !== expectedSessionId) throw new Error("Product Session event session identity 漂移");
  id(data.turnId, `turn:${expectedSessionId.slice("session:".length)}:`, "event.turnId");
  switch (data.type) {
    case "turn.started":
      record(data, "turn.started event", ["sequence", "sessionId", "turnId", "type"]);
      break;
    case "tool.completed": {
      const keys = data.evidence === undefined
        ? ["sequence", "sessionId", "turnId", "type", "tool", "trace"]
        : ["sequence", "sessionId", "turnId", "type", "tool", "trace", "evidence"];
      record(data, "tool.completed event", keys);
      const tool = toolName(data.tool, "event.tool");
      const trace = record(data.trace, "event.trace");
      const traceKeys = ["sequence", "tool", "input", "status"];
      if (trace.result !== undefined) traceKeys.push("result");
      if (trace.error !== undefined) traceKeys.push("error");
      record(trace, "event.trace", traceKeys);
      safeInteger(trace.sequence, "event.trace.sequence", 1);
      if (trace.tool !== tool || (trace.status !== "succeeded" && trace.status !== "failed")) {
        throw new Error("tool trace 与产品 event 不一致");
      }
      if (trace.status === "failed") {
        boundedString(trace.error, "event.trace.error", 240);
        if (trace.input !== "[redacted]" || trace.result !== undefined || data.evidence !== undefined) {
          throw new Error("failed tool trace 必须脱敏且不能携带 result/evidence");
        }
      } else {
        if (trace.error !== undefined || data.evidence === undefined) {
          throw new Error("succeeded tool evidence 非法");
        }
        if (tool === "world_run") {
          if (!expectedWorld) throw new Error("event.evidence world_run 缺少 authored world context");
          worldRun(data.evidence, "event.evidence", expectedWorld, allowUnverifiedArticulated);
        } else {
          evidence(data.evidence, tool, "event.evidence", expectedWorld);
        }
      }
      break;
    }
    case "turn.completed":
      record(data, "turn.completed event", ["sequence", "sessionId", "turnId", "type", "responseText"]);
      boundedString(data.responseText, "event.responseText", 8_000);
      break;
    case "turn.failed":
      record(data, "turn.failed event", ["sequence", "sessionId", "turnId", "type", "error"]);
      boundedString(data.error, "event.error", 240);
      break;
    default:
      throw new Error(`未知 Product Session event type: ${String(data.type)}`);
  }
  return deepFreeze(data) as unknown as ProductSessionEvent;
}

export function decodeProductSessionEvent(
  value: unknown,
  expectedSessionId: string,
  expectedSequence: number,
  expectedWorld?: WorldAuthorityContext | null,
): ProductSessionEvent {
  return decodeProductSessionEventInternal(value, expectedSessionId, expectedSequence, expectedWorld);
}

export async function decodeProductSessionEventTrusted(
  value: unknown,
  expectedSessionId: string,
  expectedSequence: number,
  expectedWorld?: WorldAuthorityContext | null,
): Promise<ProductSessionEvent> {
  const decoded = decodeProductSessionEventInternal(
    value, expectedSessionId, expectedSequence, expectedWorld, true,
  );
  if (decoded.type === "tool.completed" && decoded.evidence?.tool === "run") {
    if (!expectedWorld) throw new Error("event.evidence world_run 缺少 authored world context");
    await requireTrustedArticulatedReplay(decoded.evidence, expectedWorld, "event.evidence");
  }
  return decoded;
}

function decodeProductSessionProjectionInternal(
  value: unknown,
  expectedSessionId?: string,
  allowUnverifiedArticulated = false,
): ProductSessionProjection {
  const data = record(projectPlainData(value, "Product Session projection"), "Product Session projection", [
    "sessionId", "world", "lastRun", "lastSequence", "running",
  ]);
  id(data.sessionId, "session:local-", "projection.sessionId");
  if (expectedSessionId !== undefined && data.sessionId !== expectedSessionId) {
    throw new Error("Product Session projection session identity 漂移");
  }
  safeInteger(data.lastSequence, "projection.lastSequence");
  if (typeof data.running !== "boolean") throw new Error("projection.running 非法");
  const currentWorld = data.world === null
    ? null
    : worldReadLike(data.world, "read", "projection.world") as WorldReadResult;
  if (data.lastRun !== null) {
    if (!currentWorld) throw new Error("projection.lastRun 缺少 authored world context");
    worldRun(data.lastRun, "projection.lastRun", currentWorld, allowUnverifiedArticulated);
  }
  return deepFreeze(data) as unknown as ProductSessionProjection;
}

export function decodeProductSessionProjection(
  value: unknown,
  expectedSessionId?: string,
): ProductSessionProjection {
  return decodeProductSessionProjectionInternal(value, expectedSessionId);
}

export async function decodeProductSessionProjectionTrusted(
  value: unknown,
  expectedSessionId?: string,
  expectedWorld?: WorldAuthorityContext | null,
): Promise<ProductSessionProjection> {
  const decoded = decodeProductSessionProjectionInternal(value, expectedSessionId, true);
  if (expectedWorld !== undefined) {
    if (!sameWorldAuthority(decoded.world, expectedWorld)) {
      throw new Error("projection.world 与已验证的 authored world authority 不一致");
    }
  }
  if (decoded.lastRun?.episode.program.kind === "actuator-sequence") {
    if (!decoded.world || !expectedWorld) {
      throw new Error("projection.lastRun 缺少独立验证的 authored world authority");
    }
    await requireTrustedArticulatedReplay(decoded.lastRun, expectedWorld, "projection.lastRun");
  }
  return decoded;
}
