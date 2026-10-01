import type { MainModule, MjContact, MjData, MjModel } from "@mujoco/mujoco";

import type {
  Entity,
  EntityState,
  Episode,
  EpisodeEvent,
  EpisodeSample,
  ExplicitInputs,
  SemanticContactEvidence,
  RuntimeProfile,
  Snapshot,
  WorldProgram,
} from "../kernel/types";
import {
  BALL_REF,
  BALL_VESSEL_FIXTURE,
  VESSEL_REF,
  requireBallVesselSnapshot,
  requireSnapshotRepresentationIntegrity,
} from "../artifacts/ball-vessel-fixture";
import { requireDiagnosticGaussianSplatObservation } from "../artifacts/diagnostic-gaussian-splat";
import {
  requireDiagnosticRigidCollision,
  requireDiagnosticRigidVisual,
  requireRegisteredSnapshotIdentity,
} from "../artifacts/diagnostic-rigid-fixture";
import { CUBE_REF, deepFreeze, findEntity, FLOOR_REF, isDeepFrozen } from "../kernel/world";
import {
  GENERATED_OBJECT_REF,
  MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
  requireMarbleHunyuanCompositeSnapshot,
} from "../artifacts/marble-hunyuan-composite-fixture";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";

const PROGRAM_SAMPLE_RATE_HZ = 30;
const RUNTIME_PROFILE_ID = "runtime:mujoco-wasm-single-3.11.0";
const RUNTIME_PROVIDER = "MuJoCo WASM";
const RUNTIME_VERSION = "3.11.0";
const RUNTIME_TIMESTEP_SECONDS = 1 / 240;
const RUNTIME_GRAVITY = [0, 0, -9.81] as const;

interface PreparedRun {
  readonly scenario: "falling-rigid" | "ball-vessel" | "composite";
  readonly floor: Entity;
  readonly target: Entity;
  readonly vessel?: Entity;
  readonly stepCount: number;
  readonly sampleEverySteps: number;
}

interface CompiledRun {
  readonly xml: string;
  readonly geomOwners: Readonly<Record<string, Entity["ref"]>>;
}

let modulePromise: Promise<MainModule> | undefined;

function getMujoco(): Promise<MainModule> {
  modulePromise ??= import("@mujoco/mujoco").then(({ default: loadMujoco }) => loadMujoco());
  return modulePromise;
}

function xmlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`MJCF 不能包含非有限数值：${value}`);
  }
  return String(value);
}

function xmlVec(values: readonly number[]): string {
  return values.map(xmlNumber).join(" ");
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 必须是有限正数`);
  }
}

function requireFiniteVec(values: readonly number[], label: string): void {
  if (
    !Array.isArray(values) ||
    values.length !== 3 ||
    !Number.isFinite(values[0]) ||
    !Number.isFinite(values[1]) ||
    !Number.isFinite(values[2])
  ) {
    throw new Error(`${label} 必须是 3 个有限数值`);
  }
}

function sameVec(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function isZeroVec(values: readonly number[]): boolean {
  return values.length === 3 && values[0] === 0 && values[1] === 0 && values[2] === 0;
}

function requireUnitQuaternion(
  rotation: EntityState["pose"]["rotation"],
  label: string,
): void {
  const values = [rotation.x, rotation.y, rotation.z, rotation.w];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} 必须是有限 quaternion`);
  }
  const norm = Math.hypot(...values);
  if (Math.abs(norm - 1) > 1e-9) {
    throw new Error(`${label} 必须是单位 quaternion`);
  }
}

function requireExactOwnKeys(
  value: object,
  label: string,
  expected: readonly string[],
): void {
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    throw new Error(`${label} 字段非法`);
  }
}

function requireEntityCommon(entity: Entity): void {
  if (entity.frameRef !== "frame:world") {
    throw new Error(`${entity.ref} 必须使用 frame:world`);
  }
  if (entity.unitSystemRef !== "units:si") {
    throw new Error(`${entity.ref} 必须使用 units:si`);
  }
  requireFiniteVec(entity.state.pose.position, `${entity.ref} position`);
  requireUnitQuaternion(entity.state.pose.rotation, `${entity.ref} rotation`);
  requireFiniteVec(entity.state.linearVelocity, `${entity.ref} linearVelocity`);
  requireFiniteVec(entity.state.angularVelocity, `${entity.ref} angularVelocity`);
  if (!Number.isFinite(entity.physics.friction) || entity.physics.friction < 0) {
    throw new Error(`${entity.ref} friction 必须是有限非负数`);
  }
}

function requireEntity(entity: Entity): void {
  requireEntityCommon(entity);

  const collision = entity.representations.collision;
  requireExactOwnKeys(collision, `${entity.ref} collision`, ["kind", "halfExtents"]);
  if (collision.kind !== "box") {
    throw new Error(`${entity.ref} 只支持 box collision`);
  }
  requireFiniteVec(collision.halfExtents, `${entity.ref} halfExtents`);
  for (let index = 0; index < 3; index += 1) {
    requirePositive(collision.halfExtents[index]!, `${entity.ref} halfExtents[${index}]`);
  }

  const visual = entity.representations.visual;
  if (visual.kind === "box") {
    requireExactOwnKeys(visual, `${entity.ref} box visual`, ["kind", "halfExtents", "color"]);
    requireFiniteVec(visual.halfExtents, `${entity.ref} visual halfExtents`);
    for (let index = 0; index < 3; index += 1) {
      requirePositive(visual.halfExtents[index]!, `${entity.ref} visual halfExtents[${index}]`);
    }
    if (typeof visual.color !== "string" || visual.color.length === 0 || visual.color.length > 64) {
      throw new Error(`${entity.ref} visual color 非法`);
    }
  } else if (visual.kind === "registered-rigid-mesh") {
    requireExactOwnKeys(visual, `${entity.ref} registered visual`, [
      "kind", "assetId", "manifestDigest", "calibrationId", "witnessId",
    ]);
    if (
      !visual.assetId.startsWith("asset:") ||
      !/^sha256:[a-f0-9]{64}$/.test(visual.manifestDigest) ||
      !visual.calibrationId.startsWith("calibration:") ||
      !visual.witnessId.startsWith("witness:")
    ) throw new Error(`${entity.ref} registered visual identity 非法`);
  } else if (visual.kind === "imported-rigid-mesh") {
    requireExactOwnKeys(visual, `${entity.ref} imported visual`, [
      "kind", "assetId", "contentDigest", "sourceFrameRef", "sourceUnitMeters", "localTransform",
    ]);
    requireDiagnosticRigidVisual(visual);
    requireDiagnosticRigidCollision(collision);
    requirePositive(visual.sourceUnitMeters, `${entity.ref} sourceUnitMeters`);
    requireExactOwnKeys(visual.localTransform, `${entity.ref} localTransform`, [
      "position", "rotation", "scale",
    ]);
    requireFiniteVec(visual.localTransform.position, `${entity.ref} local position`);
    requireUnitQuaternion(visual.localTransform.rotation, `${entity.ref} local rotation`);
    requireFiniteVec(visual.localTransform.scale, `${entity.ref} local scale`);
    for (let index = 0; index < 3; index += 1) {
      requirePositive(visual.localTransform.scale[index]!, `${entity.ref} local scale[${index}]`);
    }
  } else {
    throw new Error(`${entity.ref} visual kind 非法`);
  }
  const observation = entity.representations.observation;
  if (observation !== null) {
    if (entity.ref !== CUBE_REF) {
      throw new Error(`${entity.ref} observation 必须绑定 ${CUBE_REF}`);
    }
    if (visual.kind !== "imported-rigid-mesh") {
      throw new Error(`${entity.ref} observation 只允许绑定登记 imported visual`);
    }
    if (observation.kind !== "gaussian-splat") {
      throw new Error(`${entity.ref} diagnostic observation kind 非法`);
    }
    requireDiagnosticRigidCollision(collision);
    requireExactOwnKeys(observation, `${entity.ref} observation`, [
      "kind",
      "role",
      "assetId",
      "contentDigest",
      "sourceFrameRef",
      "sourceUnitMeters",
      "localTransform",
    ]);
    requireDiagnosticGaussianSplatObservation(observation);
  }
}

const TEST_ONLY_TOP_LID = deepFreeze({
  partKey: "test-only-top-lid",
  localPose: {
    position: [0, 0, 0.65] as const,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  },
  shape: { kind: "box" as const, halfExtents: [0.5, 0.5, 0.02] as const },
});

function requireBallVesselRuntimeSnapshot(snapshot: Snapshot): {
  readonly floor: Entity;
  readonly vessel: Entity;
  readonly ball: Entity;
} {
  requireSnapshotRepresentationIntegrity(snapshot);
  const refs = snapshot.entities.map((entity) => entity.ref);
  if (
    refs.length !== 3 ||
    refs[0] !== FLOOR_REF ||
    refs[1] !== VESSEL_REF ||
    refs[2] !== BALL_REF
  ) {
    throw new Error("ball-vessel Runtime 必须恰好为 floor/vessel/ball");
  }
  const [floor, vessel, ball] = snapshot.entities as readonly [Entity, Entity, Entity];
  requireEntity(floor);
  requireEntityCommon(vessel);
  requireEntityCommon(ball);
  const collision = vessel.representations.collision;
  if (collision.kind !== "compound") {
    throw new Error("entity:vessel 必须是 compound collision");
  }

  if (collision.parts.length === BALL_VESSEL_FIXTURE.collision.parts.length) {
    requireBallVesselSnapshot(snapshot);
  } else if (collision.parts.length === BALL_VESSEL_FIXTURE.collision.parts.length + 1) {
    const lid = collision.parts.at(-1);
    if (JSON.stringify(lid) !== JSON.stringify(TEST_ONLY_TOP_LID)) {
      throw new Error("closed proxy 只接纳 frozen test-only top lid");
    }
    const canonical = deepFreeze({
      ...snapshot,
      entities: snapshot.entities.map((entity): Entity => entity.ref === VESSEL_REF
        ? {
            ...entity,
            representations: {
              ...entity.representations,
              collision: { kind: "compound", parts: collision.parts.slice(0, -1) },
            },
          }
        : entity),
    }) as Snapshot;
    requireBallVesselSnapshot(canonical);
  } else {
    throw new Error("vessel compound 必须包含 exact 17 parts 或 test-only closed proxy");
  }

  if (
    floor.physics.bodyType !== "static" ||
    vessel.physics.bodyType !== "static" ||
    floor.physics.massKg !== 0 ||
    vessel.physics.massKg !== 0 ||
    !isZeroVec(floor.state.linearVelocity) ||
    !isZeroVec(floor.state.angularVelocity) ||
    !isZeroVec(vessel.state.linearVelocity) ||
    !isZeroVec(vessel.state.angularVelocity)
  ) {
    throw new Error("ball-vessel 要求静态 floor/vessel 使用 0 mass 与 0 velocity");
  }
  if (ball.physics.bodyType !== "dynamic") {
    throw new Error("ball-vessel target 必须是 dynamic ball");
  }
  requirePositive(ball.physics.massKg, "entity:ball massKg");
  return { floor, vessel, ball };
}

function integerRatio(value: number, label: string): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(value) || rounded <= 0 || Math.abs(value - rounded) > 1e-9) {
    throw new Error(`${label} 必须对齐 integer physics-step`);
  }
  return rounded;
}

function prepareRun(
  snapshot: Snapshot,
  program: WorldProgram,
  profile: RuntimeProfile,
): PreparedRun {
  if (!isDeepFrozen(snapshot) || !isDeepFrozen(program) || !isDeepFrozen(profile)) {
    throw new Error("Snapshot、WorldProgram 与 RuntimeProfile 必须是递归冻结的 plain data record");
  }
  requireSnapshotRepresentationIntegrity(snapshot);
  if (program.kind !== "free-fall") {
    throw new Error(`MuJoCo Runtime 尚不支持 ${program.kind}`);
  }
  requirePositive(program.durationSeconds, "durationSeconds");
  requirePositive(program.sampleRateHz, "sampleRateHz");
  const scenario = snapshot.scenarioId === "scenario:ball-vessel-free-fall-v1"
    ? "ball-vessel"
    : snapshot.scenarioId === MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID
      ? "composite"
      : snapshot.scenarioId === "scenario:primitive-box-free-fall-v1" ||
          snapshot.scenarioId === "scenario:diagnostic-rigid-free-fall-v1"
        ? "falling-rigid"
        : null;
  if (
    scenario === null ||
    program.targetRef !== (scenario === "falling-rigid"
      ? CUBE_REF
      : scenario === "ball-vessel" ? BALL_REF : GENERATED_OBJECT_REF) ||
    program.durationSeconds !== (scenario === "ball-vessel" ? 3 : 2.5) ||
    program.sampleRateHz !== PROGRAM_SAMPLE_RATE_HZ
  ) {
    throw new Error(`不受支持的 WorldProgram：${program.id}`);
  }
  const { id: suppliedProgramId, ...programContent } = program;
  if (suppliedProgramId !== `program:sha256:${sha256Hex(canonicalJsonBytes(programContent))}`) {
    throw new Error("WorldProgram ID 与 canonical content digest 不一致");
  }

  if (
    profile.id !== RUNTIME_PROFILE_ID ||
    profile.provider !== RUNTIME_PROVIDER ||
    profile.version !== RUNTIME_VERSION ||
    profile.equivalence !== "numeric"
  ) {
    throw new Error(`不受支持的 RuntimeProfile：${profile.id}`);
  }
  requirePositive(profile.timestepSeconds, "timestepSeconds");
  requireFiniteVec(profile.gravity, "gravity");
  if (
    profile.timestepSeconds !== RUNTIME_TIMESTEP_SECONDS ||
    !sameVec(profile.gravity, RUNTIME_GRAVITY)
  ) {
    throw new Error(`RuntimeProfile identity 与执行参数不一致：${profile.id}`);
  }

  const entityRefs = new Set(snapshot.entities.map((entity) => entity.ref));
  if (entityRefs.size !== snapshot.entities.length) {
    throw new Error("Snapshot 不能包含重复 EntityRef");
  }
  let floor: Entity;
  let target: Entity;
  let vessel: Entity | undefined;
  if (scenario === "falling-rigid") {
    requireRegisteredSnapshotIdentity(snapshot);
    if (
      snapshot.entities.length !== 2 ||
      !entityRefs.has(FLOOR_REF) ||
      !entityRefs.has(CUBE_REF)
    ) {
      throw new Error("falling-cube Runtime 只支持 entity:floor 与 entity:cube");
    }
    floor = findEntity(snapshot, FLOOR_REF);
    target = findEntity(snapshot, program.targetRef);
    requireEntity(floor);
    requireEntity(target);
    if (floor.physics.bodyType !== "static" || target.physics.bodyType !== "dynamic") {
      throw new Error("falling-cube 要求静态地面与动态目标物体");
    }
    if (
      floor.physics.massKg !== 0 ||
      !isZeroVec(floor.state.linearVelocity) ||
      !isZeroVec(floor.state.angularVelocity)
    ) {
      throw new Error("静态地面必须使用 0 massKg、0 linearVelocity 与 0 angularVelocity");
    }
    requirePositive(target.physics.massKg, `${target.ref} massKg`);
  } else if (scenario === "composite") {
    requireMarbleHunyuanCompositeSnapshot(snapshot);
    if (snapshot.entities.length !== 3) {
      throw new Error("composite Runtime 必须恰好为 environment/floor/generated-object");
    }
    const [environment, compositeFloor, generated] = snapshot.entities as readonly [
      Entity,
      Entity,
      Entity,
    ];
    requireEntityCommon(environment);
    if (environment.representations.collision.kind !== "none") {
      throw new Error("composite environment 必须是 no-collision observation Entity");
    }
    requireEntity(compositeFloor);
    requireEntity(generated);
    if (compositeFloor.physics.bodyType !== "static" || generated.physics.bodyType !== "dynamic") {
      throw new Error("composite 要求静态 floor 与动态 generated-object");
    }
    if (
      compositeFloor.physics.massKg !== 0 ||
      !isZeroVec(compositeFloor.state.linearVelocity) ||
      !isZeroVec(compositeFloor.state.angularVelocity) ||
      environment.physics.massKg !== 0 ||
      !isZeroVec(environment.state.linearVelocity) ||
      !isZeroVec(environment.state.angularVelocity)
    ) {
      throw new Error("composite 静态 Entity 必须使用 0 massKg 与 0 velocity");
    }
    requirePositive(generated.physics.massKg, `${generated.ref} massKg`);
    floor = compositeFloor;
    target = generated;
  } else {
    const prepared = requireBallVesselRuntimeSnapshot(snapshot);
    floor = prepared.floor;
    target = prepared.ball;
    vessel = prepared.vessel;
  }

  return {
    scenario,
    floor,
    target,
    vessel,
    stepCount: integerRatio(
      program.durationSeconds / profile.timestepSeconds,
      "durationSeconds / timestepSeconds",
    ),
    sampleEverySteps: integerRatio(
      1 / (program.sampleRateHz * profile.timestepSeconds),
      "sampleRateHz / physics-step",
    ),
  };
}

function quaternionValues(entity: Entity): readonly [number, number, number, number] {
  const { x, y, z, w } = entity.state.pose.rotation;
  return [w, x, y, z];
}

function rotateVector(
  vector: readonly [number, number, number],
  rotation: EntityState["pose"]["rotation"],
): readonly [number, number, number] {
  const [vx, vy, vz] = vector;
  const tx = 2 * (rotation.y * vz - rotation.z * vy);
  const ty = 2 * (rotation.z * vx - rotation.x * vz);
  const tz = 2 * (rotation.x * vy - rotation.y * vx);
  return [
    vx + rotation.w * tx + rotation.y * tz - rotation.z * ty,
    vy + rotation.w * ty + rotation.z * tx - rotation.x * tz,
    vz + rotation.w * tz + rotation.x * ty - rotation.y * tx,
  ];
}

function renderMjcf(prepared: PreparedRun, profile: RuntimeProfile): CompiledRun {
  const { floor, target } = prepared;
  const floorShape = floor.representations.collision;
  if (floorShape.kind !== "box") {
    throw new Error("MuJoCo floor 只接纳 box collision");
  }

  if (prepared.scenario === "falling-rigid") {
    const targetShape = target.representations.collision;
    if (targetShape.kind !== "box") {
      throw new Error("falling-cube MJCF 只接纳 box collision");
    }
    return {
      xml: `<mujoco model="demiurges-falling-cube">
  <compiler angle="radian" alignfree="false"/>
  <option timestep="${xmlNumber(profile.timestepSeconds)}" gravity="${xmlVec(profile.gravity)}"/>
  <worldbody>
    <geom name="floor" type="box" pos="${xmlVec(floor.state.pose.position)}" quat="${xmlVec(quaternionValues(floor))}" size="${xmlVec(floorShape.halfExtents)}" friction="${xmlNumber(floor.physics.friction)} 0.005 0.0001"/>
    <body name="cube" pos="${xmlVec(target.state.pose.position)}" quat="${xmlVec(quaternionValues(target))}">
      <freejoint name="cube_free" align="false"/>
      <geom name="cube_geom" type="box" size="${xmlVec(targetShape.halfExtents)}" mass="${xmlNumber(target.physics.massKg)}" friction="${xmlNumber(target.physics.friction)} 0.005 0.0001"/>
    </body>
  </worldbody>
</mujoco>`,
      geomOwners: { floor: FLOOR_REF, cube_geom: CUBE_REF },
    };
  }

  if (prepared.scenario === "composite") {
    const targetShape = target.representations.collision;
    if (targetShape.kind !== "box") {
      throw new Error("composite MJCF 只接纳 box generated-object proxy");
    }
    return {
      xml: `<mujoco model="demiurges-marble-hunyuan-composite">
  <compiler angle="radian" alignfree="false"/>
  <option timestep="${xmlNumber(profile.timestepSeconds)}" gravity="${xmlVec(profile.gravity)}"/>
  <worldbody>
    <geom name="floor" type="box" pos="${xmlVec(floor.state.pose.position)}" quat="${xmlVec(quaternionValues(floor))}" size="${xmlVec(floorShape.halfExtents)}" friction="${xmlNumber(floor.physics.friction)} 0.005 0.0001"/>
    <body name="generated" pos="${xmlVec(target.state.pose.position)}" quat="${xmlVec(quaternionValues(target))}">
      <freejoint name="generated_free" align="false"/>
      <geom name="generated_geom" type="box" size="${xmlVec(targetShape.halfExtents)}" mass="${xmlNumber(target.physics.massKg)}" friction="${xmlNumber(target.physics.friction)} 0.005 0.0001"/>
    </body>
  </worldbody>
</mujoco>`,
      geomOwners: { floor: FLOOR_REF, generated_geom: GENERATED_OBJECT_REF },
    };
  }


  const vessel = prepared.vessel;
  const vesselShape = vessel?.representations.collision;
  const ballShape = target.representations.collision;
  if (!vessel || vesselShape?.kind !== "compound" || ballShape.kind !== "sphere") {
    throw new Error("ball-vessel MJCF 要求 compound vessel 与 sphere ball");
  }
  const geomOwners: Record<string, Entity["ref"]> = {
    floor: FLOOR_REF,
    ball_geom: BALL_REF,
  };
  const vesselGeoms = vesselShape.parts.map((part) => {
    const name = `vessel_${part.partKey}`;
    geomOwners[name] = VESSEL_REF;
    return `      <geom name="${name}" type="box" pos="${xmlVec(part.localPose.position)}" quat="${xmlVec([
      part.localPose.rotation.w,
      part.localPose.rotation.x,
      part.localPose.rotation.y,
      part.localPose.rotation.z,
    ])}" size="${xmlVec(part.shape.halfExtents)}" friction="${xmlNumber(vessel.physics.friction)} 0.005 0.0001"/>`;
  }).join("\n");

  return {
    xml: `<mujoco model="demiurges-ball-vessel">
  <compiler angle="radian" alignfree="false"/>
  <option timestep="${xmlNumber(profile.timestepSeconds)}" gravity="${xmlVec(profile.gravity)}"/>
  <worldbody>
    <geom name="floor" type="box" pos="${xmlVec(floor.state.pose.position)}" quat="${xmlVec(quaternionValues(floor))}" size="${xmlVec(floorShape.halfExtents)}" friction="${xmlNumber(floor.physics.friction)} 0.005 0.0001"/>
    <body name="vessel" pos="${xmlVec(vessel.state.pose.position)}" quat="${xmlVec(quaternionValues(vessel))}">
${vesselGeoms}
    </body>
    <body name="ball" pos="${xmlVec(target.state.pose.position)}" quat="${xmlVec(quaternionValues(target))}">
      <joint name="ball_free" type="free" damping="0.05"/>
      <geom name="ball_geom" type="sphere" size="${xmlNumber(ballShape.radius)}" mass="${xmlNumber(target.physics.massKg)}" friction="${xmlNumber(target.physics.friction)} 0.005 0.0001"/>
    </body>
  </worldbody>
</mujoco>`,
    geomOwners,
  };
}

export function createFallingCubeMjcf(
  snapshot: Snapshot,
  program: WorldProgram,
  profile: RuntimeProfile,
): string {
  return renderMjcf(prepareRun(snapshot, program, profile), profile).xml;
}

function copyDynamicState(data: MjData): EntityState {
  const qpos = data.qpos as ArrayLike<number>;
  const qvel = data.qvel as ArrayLike<number>;
  const rotation = { x: qpos[4], y: qpos[5], z: qpos[6], w: qpos[3] };
  const angularVelocity = rotateVector(
    [qvel[3], qvel[4], qvel[5]],
    rotation,
  );
  const state: EntityState = {
    pose: {
      position: [qpos[0], qpos[1], qpos[2]],
      rotation,
    },
    linearVelocity: [qvel[0], qvel[1], qvel[2]],
    angularVelocity,
  };
  requireFiniteVec(state.pose.position, "MuJoCo position");
  requireUnitQuaternion(state.pose.rotation, "MuJoCo rotation");
  requireFiniteVec(state.linearVelocity, "MuJoCo linearVelocity");
  requireFiniteVec(state.angularVelocity, "MuJoCo angularVelocity");
  return state;
}

function applyInitialVelocity(data: MjData, target: Entity): void {
  const qvel = data.qvel as { [index: number]: number };
  const [vx, vy, vz] = target.state.linearVelocity;
  const rotation = target.state.pose.rotation;
  const localAngularVelocity = rotateVector(target.state.angularVelocity, {
    x: -rotation.x,
    y: -rotation.y,
    z: -rotation.z,
    w: rotation.w,
  });
  [qvel[0], qvel[1], qvel[2]] = [vx, vy, vz];
  [qvel[3], qvel[4], qvel[5]] = localAngularVelocity;
}

function createGeomOwnerMap(
  model: MjModel,
  compiled: CompiledRun,
): ReadonlyMap<number, Entity["ref"]> {
  const result = new Map<number, Entity["ref"]>();
  for (const [name, owner] of Object.entries(compiled.geomOwners)) {
    const geom = model.geom(name);
    try {
      if (!Number.isSafeInteger(geom.id) || geom.id < 0 || result.has(geom.id)) {
        throw new Error(`MuJoCo geom owner map 非法：${name}`);
      }
      result.set(geom.id, owner);
    } finally {
      geom.delete();
    }
  }
  if (result.size !== Object.keys(compiled.geomOwners).length) {
    throw new Error("MuJoCo geom owner map 不完整");
  }
  return result;
}

function contactEvidence(
  contact: MjContact,
  owners: ReadonlyMap<number, Entity["ref"]>,
  targetRef: Entity["ref"],
): SemanticContactEvidence | null {
  const firstOwner = owners.get(contact.geom1);
  const secondOwner = owners.get(contact.geom2);
  if (!firstOwner || !secondOwner) {
    throw new Error("MuJoCo contact geom 缺少 EntityRef owner");
  }
  if (firstOwner === secondOwner) return null;
  const targetIsFirst = firstOwner === targetRef;
  const targetIsSecond = secondOwner === targetRef;
  if (!targetIsFirst && !targetIsSecond) return null;

  const frame = contact.frame as ArrayLike<number>;
  const direction = targetIsFirst ? -1 : 1;
  const normal = [
    direction * frame[0],
    direction * frame[1],
    direction * frame[2],
  ] as const;
  requireFiniteVec(normal, "MuJoCo contact normal");
  const norm = Math.hypot(...normal);
  if (Math.abs(norm - 1) > 1e-6) {
    throw new Error("MuJoCo contact normal 必须是单位 world-space vector");
  }
  if (!Number.isFinite(contact.dist)) {
    throw new Error("MuJoCo contact distance 必须有限");
  }
  return {
    targetRef,
    otherRef: targetIsFirst ? secondOwner : firstOwner,
    normalOnTargetWorld: normal,
    penetrationMeters: Math.max(0, -contact.dist),
  };
}

function readSemanticContacts(
  data: MjData,
  owners: ReadonlyMap<number, Entity["ref"]>,
  targetRef: Entity["ref"],
): readonly SemanticContactEvidence[] {
  if (!Number.isSafeInteger(data.ncon) || data.ncon < 0 || data.ncon > data.contact.size()) {
    throw new Error("MuJoCo contact count 非法");
  }
  const contacts: SemanticContactEvidence[] = [];
  for (let index = 0; index < data.ncon; index += 1) {
    const contact = data.contact.get(index);
    if (!contact) throw new Error(`MuJoCo contact[${index}] 缺失`);
    try {
      const evidence = contactEvidence(contact, owners, targetRef);
      if (evidence) contacts.push(evidence);
    } finally {
      contact.delete();
    }
  }
  return contacts;
}

function createSample(
  snapshot: Snapshot,
  targetRef: Entity["ref"],
  data: MjData,
  contacts?: readonly SemanticContactEvidence[],
  timeSeconds: number = data.time,
): EpisodeSample {
  if (!Number.isFinite(data.time) || !Number.isInteger(data.ncon) || data.ncon < 0) {
    throw new Error("MuJoCo observation 包含非有限 time 或无效 contact count");
  }
  if (!Number.isFinite(timeSeconds) || Math.abs(timeSeconds - data.time) > 1e-9) {
    throw new Error("MuJoCo sample time 与受信采样网格不一致");
  }
  const states = Object.fromEntries(
    snapshot.entities.map((entity) => [
      entity.ref,
      entity.ref === targetRef ? copyDynamicState(data) : entity.state,
    ]),
  ) as Record<Entity["ref"], EntityState>;

  const sample = {
    timeSeconds,
    states,
    contactCount: contacts?.length ?? data.ncon,
  };
  return contacts === undefined ? sample : { ...sample, contacts };
}

function createTerminalSnapshot(
  base: Snapshot,
  targetRef: Entity["ref"],
  terminalState: EntityState,
  runKey: string,
): Snapshot {
  return {
    schemaVersion: 1,
    id: `snapshot:terminal-${runKey}`,
    parentId: base.id,
    source: "runtime-terminal",
    scenarioId: base.scenarioId,
    entities: base.entities.map((entity) =>
      entity.ref === targetRef ? { ...entity, state: terminalState } : entity,
    ),
  };
}

function runKey(inputs: ExplicitInputs): string {
  if (!isDeepFrozen(inputs)) {
    throw new Error("ExplicitInputs 必须递归冻结");
  }
  if (typeof inputs.runId !== "string" || !inputs.runId.startsWith("run:")) {
    throw new Error("runId 必须以 run: 开头");
  }
  const value = inputs.runId.slice("run:".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("runId 仅允许字母、数字、点、下划线与连字符");
  }
  return value;
}

function snapshotKey(snapshot: Snapshot): string {
  if (!snapshot.id.startsWith("snapshot:")) {
    throw new Error("Snapshot id 必须以 snapshot: 开头");
  }
  const value = snapshot.id.slice("snapshot:".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("Snapshot id 仅允许字母、数字、点、下划线与连字符");
  }
  return value;
}

export function freeFallExecutionKey(run: string, snapshot: string): string {
  return `${run.length}-${run}-${snapshot.length}-${snapshot}`;
}

export async function runFallingCube(
  snapshot: Snapshot,
  program: WorldProgram,
  profile: RuntimeProfile,
  inputs: ExplicitInputs,
): Promise<Episode> {
  const run = runKey(inputs);
  const prepared = prepareRun(snapshot, program, profile);
  const key = freeFallExecutionKey(run, snapshotKey(snapshot));
  const compiled = renderMjcf(prepared, profile);
  const mujoco = await getMujoco();
  let model: MjModel | undefined;
  let data: MjData | undefined;

  try {
    model = mujoco.MjModel.from_xml_string(compiled.xml);
    data = new mujoco.MjData(model);
    const geomOwners = createGeomOwnerMap(model, compiled);
    applyInitialVelocity(data, prepared.target);
    mujoco.mj_forward(model, data);

    let contacts = prepared.scenario === "ball-vessel"
      ? readSemanticContacts(data, geomOwners, program.targetRef)
      : undefined;
    const samples: EpisodeSample[] = [
      createSample(snapshot, program.targetRef, data, contacts, 0),
    ];
    const events: EpisodeEvent[] = [];
    let contactRecorded = contacts ? contacts.length > 0 : data.ncon > 0;
    if (contactRecorded) {
      events.push({
        type: "contact-began",
        timeSeconds: data.time,
        entities: [program.targetRef, contacts?.[0]?.otherRef ?? FLOOR_REF],
      });
    }

    for (let step = 1; step <= prepared.stepCount; step += 1) {
      mujoco.mj_step(model, data);
      mujoco.mj_forward(model, data);
      contacts = prepared.scenario === "ball-vessel"
        ? readSemanticContacts(data, geomOwners, program.targetRef)
        : undefined;

      if (!contactRecorded && (contacts ? contacts.length > 0 : data.ncon > 0)) {
        events.push({
          type: "contact-began",
          timeSeconds: data.time,
          entities: [program.targetRef, contacts?.[0]?.otherRef ?? FLOOR_REF],
        });
        contactRecorded = true;
      }

      if (step % prepared.sampleEverySteps === 0) {
        samples.push(createSample(
          snapshot,
          program.targetRef,
          data,
          contacts,
          samples.length / program.sampleRateHz,
        ));
      }
    }

    const lastSample = samples.at(-1);
    if (!lastSample || Math.abs(lastSample.timeSeconds - data.time) > 1e-9) {
      samples.push(createSample(
        snapshot,
        program.targetRef,
        data,
        contacts,
        program.durationSeconds,
      ));
    }

    const terminalState = samples.at(-1)?.states[program.targetRef];
    if (!terminalState) {
      throw new Error("MuJoCo 未产生 terminal state");
    }

    return deepFreeze({
      id: `episode:${key}`,
      baseSnapshotId: snapshot.id,
      scenarioId: snapshot.scenarioId,
      program,
      runtimeProfileId: profile.id,
      explicitInputs: inputs,
      completion: "completed",
      samples,
      events,
      terminalSnapshot: createTerminalSnapshot(snapshot, program.targetRef, terminalState, key),
      runtimeEvidence: {
        provider: RUNTIME_PROVIDER,
        version: RUNTIME_VERSION,
        modelFormat: "MJCF",
      },
    }) as Episode;
  } finally {
    try {
      data?.delete();
    } finally {
      model?.delete();
    }
  }
}
