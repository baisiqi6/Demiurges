import type {
  EntityState,
  Episode,
  EvaluationRecord,
  LandingSuccessContract,
  SemanticContactEvidence,
  StableInsideVesselEvaluationRecord,
  StableInsideVesselSuccessContract,
  SuccessContract,
  Vec3,
} from "../kernel/types";
import {
  BALL_VESSEL_PROGRAM,
  FLOOR_REF,
  deepFreeze,
  findEntity,
  isDeepFrozen,
} from "../kernel/world";

export const LANDING_EVALUATOR_ID = "evaluator:stable-landing-v1" as const;
export const STABLE_INSIDE_VESSEL_EVALUATOR_ID =
  "evaluator:stable-inside-vessel-v1" as const;

const TAIL_TIMESTAMP_TOLERANCE_SECONDS = 1e-9;
const CONTACT_NORMAL_TOLERANCE = 1e-6;
const SUPPORT_WORLD_UP_DOT_MINIMUM = 0.5;
const RIM_CLEARANCE_METERS = 0.005;
const EVALUATION_NUMBER_SIGNIFICANT_DIGITS = 15;

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数值`);
  }
}

function canonicalEvaluationNumber(value: number, label: string): number {
  requireFinite(value, label);
  const rounded = Number(value.toPrecision(EVALUATION_NUMBER_SIGNIFICANT_DIGITS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function projectedHalfHeight(
  halfExtents: readonly [number, number, number],
  rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
): number {
  const zAxisX = 2 * (rotation.x * rotation.z - rotation.w * rotation.y);
  const zAxisY = 2 * (rotation.y * rotation.z + rotation.w * rotation.x);
  const zAxisZ = 1 - 2 * (rotation.x ** 2 + rotation.y ** 2);
  const height =
    Math.abs(zAxisX) * halfExtents[0] +
    Math.abs(zAxisY) * halfExtents[1] +
    Math.abs(zAxisZ) * halfExtents[2];
  requireFinite(height, "collision projected half height");
  return height;
}

export function deriveLandingSuccessContract(episode: Episode): LandingSuccessContract {
  if (!isDeepFrozen(episode)) {
    throw new Error("Episode 必须是递归冻结的 plain data record");
  }
  if (episode.program.kind !== "free-fall") {
    throw new Error("landing evaluator 只支持 free-fall Program");
  }
  const terminal = episode.terminalSnapshot;
  const floor = findEntity(terminal, FLOOR_REF);
  const target = findEntity(terminal, episode.program.targetRef);
  const floorShape = floor.representations.collision;
  const targetShape = target.representations.collision;
  if (floorShape.kind !== "box" || targetShape.kind !== "box") {
    throw new Error("landing evaluator 只支持受信 box collision proxy");
  }
  const floorTop =
    floor.state.pose.position[2] +
    projectedHalfHeight(floorShape.halfExtents, floor.state.pose.rotation);
  const expectedCenterHeight = canonicalEvaluationNumber(
    floorTop + projectedHalfHeight(targetShape.halfExtents, target.state.pose.rotation),
    "collision-derived expectedCenterHeight",
  );

  return deepFreeze({
    id: "success:stable-on-floor",
    targetRef: target.ref,
    expectedCenterHeight,
    heightTolerance: 0.015,
    maxLinearSpeed: 0.08,
  }) as LandingSuccessContract;
}

function landingContractKey(contract: LandingSuccessContract): string {
  requireFinite(contract.expectedCenterHeight, "expectedCenterHeight");
  requireFinite(contract.heightTolerance, "heightTolerance");
  requireFinite(contract.maxLinearSpeed, "maxLinearSpeed");
  if (contract.heightTolerance < 0 || contract.maxLinearSpeed < 0) {
    throw new Error("Evaluation tolerance 不能为负数");
  }

  return [
    LANDING_EVALUATOR_ID.slice("evaluator:".length),
    contract.id.slice("success:".length),
    contract.targetRef.slice("entity:".length),
    contract.expectedCenterHeight,
    contract.heightTolerance,
    contract.maxLinearSpeed,
  ].join(":");
}

function exactOwnDataRecord(
  value: unknown,
  label: string,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`${label} 必须是 plain data record`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new Error(`${label} 字段非法`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} 必须是 enumerable own-data property`);
    }
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireDenseFiniteVec3(value: unknown, label: string): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !Object.hasOwn(value, 0) ||
    !Object.hasOwn(value, 1) ||
    !Object.hasOwn(value, 2)
  ) {
    throw new Error(`${label} 必须是 dense Vec3`);
  }
  const result = [value[0], value[1], value[2]] as const;
  result.forEach((component, index) => requireFinite(component, `${label}[${index}]`));
  return result;
}

function requireStableInsideContract(
  contract: StableInsideVesselSuccessContract,
): void {
  exactOwnDataRecord(contract, "stable-inside-vessel contract", [
    "id",
    "targetRef",
    "containerRef",
    "rimFrameRef",
    "settleWindowSeconds",
    "maxHorizontalOffsetMeters",
    "maxFloorDistanceErrorMeters",
    "maxLinearSpeedMetersPerSecond",
    "maxPenetrationMeters",
  ]);
  if (
    contract.id !== "success:stable-inside-vessel" ||
    contract.targetRef !== "entity:ball" ||
    contract.containerRef !== "entity:vessel" ||
    contract.rimFrameRef !== "frame:vessel-rim-center"
  ) {
    throw new Error("stable-inside-vessel contract identity 非法");
  }
  const values = [
    contract.settleWindowSeconds,
    contract.maxHorizontalOffsetMeters,
    contract.maxFloorDistanceErrorMeters,
    contract.maxLinearSpeedMetersPerSecond,
    contract.maxPenetrationMeters,
  ];
  values.forEach((value, index) => requireFinite(value, `stable-inside contract[${index}]`));
  if (values.some((value) => value < 0) || contract.settleWindowSeconds !== 0.5) {
    throw new Error("stable-inside-vessel contract tolerance 非法");
  }
}

function stableInsideContractKey(contract: StableInsideVesselSuccessContract): string {
  requireStableInsideContract(contract);
  return [
    STABLE_INSIDE_VESSEL_EVALUATOR_ID.slice("evaluator:".length),
    contract.id.slice("success:".length),
    contract.targetRef.slice("entity:".length),
    contract.containerRef.slice("entity:".length),
    contract.rimFrameRef.slice("frame:".length),
    contract.settleWindowSeconds,
    contract.maxHorizontalOffsetMeters,
    contract.maxFloorDistanceErrorMeters,
    contract.maxLinearSpeedMetersPerSecond,
    contract.maxPenetrationMeters,
  ].join(":");
}

function rotateByInverseQuaternion(
  vector: Vec3,
  rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
): Vec3 {
  const { x, y, z, w } = rotation;
  const ix = w * vector[0] - y * vector[2] + z * vector[1];
  const iy = w * vector[1] - z * vector[0] + x * vector[2];
  const iz = w * vector[2] - x * vector[1] + y * vector[0];
  const iw = x * vector[0] + y * vector[1] + z * vector[2];
  return [
    ix * w + iw * x + iy * z - iz * y,
    iy * w + iw * y + iz * x - ix * z,
    iz * w + iw * z + ix * y - iy * x,
  ];
}

function stateInContainerFrame(
  state: EntityState,
  containerState: EntityState,
): Vec3 {
  return rotateByInverseQuaternion([
    state.pose.position[0] - containerState.pose.position[0],
    state.pose.position[1] - containerState.pose.position[1],
    state.pose.position[2] - containerState.pose.position[2],
  ], containerState.pose.rotation);
}

function requireSemanticContact(
  value: SemanticContactEvidence,
  knownRefs: ReadonlySet<string>,
  label: string,
): SemanticContactEvidence {
  exactOwnDataRecord(value, label, [
    "targetRef",
    "otherRef",
    "normalOnTargetWorld",
    "penetrationMeters",
  ]);
  if (!knownRefs.has(value.targetRef) || !knownRefs.has(value.otherRef)) {
    throw new Error(`${label} EntityRef 非法`);
  }
  const normal = requireDenseFiniteVec3(value.normalOnTargetWorld, `${label}.normalOnTargetWorld`);
  if (Math.abs(Math.hypot(...normal) - 1) > CONTACT_NORMAL_TOLERANCE) {
    throw new Error(`${label}.normalOnTargetWorld 必须是单位向量`);
  }
  requireFinite(value.penetrationMeters, `${label}.penetrationMeters`);
  if (value.penetrationMeters < 0) {
    throw new Error(`${label}.penetrationMeters 不能为负数`);
  }
  return value;
}

export function deriveStableInsideVesselSuccessContract(
  episode: Episode,
): StableInsideVesselSuccessContract {
  if (!isDeepFrozen(episode)) {
    throw new Error("Episode 必须是递归冻结的 plain data record");
  }
  if (episode.program.id !== BALL_VESSEL_PROGRAM.id) {
    throw new Error("stable-inside-vessel evaluator 只支持登记的 ball-vessel Program");
  }
  const target = findEntity(episode.terminalSnapshot, BALL_VESSEL_PROGRAM.targetRef);
  const container = findEntity(episode.terminalSnapshot, "entity:vessel");
  if (
    target.representations.collision.kind !== "sphere" ||
    container.representations.semantic?.kind !== "vessel"
  ) {
    throw new Error("stable-inside-vessel evaluator 需要 sphere target 与 vessel semantic");
  }
  const maximumOffset = canonicalEvaluationNumber(
    container.representations.semantic.innerEnvelope.radiusMeters -
      target.representations.collision.radius -
      0.01,
    "stable-inside-vessel maxHorizontalOffsetMeters",
  );
  if (maximumOffset < 0) throw new Error("vessel inner envelope 不能容纳 target sphere");
  return deepFreeze({
    id: "success:stable-inside-vessel",
    targetRef: target.ref,
    containerRef: container.ref,
    rimFrameRef: container.representations.semantic.rimFrame.ref,
    settleWindowSeconds: 0.5,
    maxHorizontalOffsetMeters: maximumOffset,
    maxFloorDistanceErrorMeters: 0.005,
    maxLinearSpeedMetersPerSecond: 0.02,
    maxPenetrationMeters: 0.005,
  }) as StableInsideVesselSuccessContract;
}

function evaluateStableInsideVessel(
  episode: Episode,
  contract: StableInsideVesselSuccessContract,
): StableInsideVesselEvaluationRecord {
  requireStableInsideContract(contract);
  if (episode.program.id !== BALL_VESSEL_PROGRAM.id) {
    throw new Error("stable-inside-vessel contract 与 Episode Program 不匹配");
  }
  const terminal = episode.terminalSnapshot;
  const target = findEntity(terminal, contract.targetRef);
  const container = findEntity(terminal, contract.containerRef);
  const targetCollision = target.representations.collision;
  const semantic = container.representations.semantic;
  if (targetCollision.kind !== "sphere" || semantic?.kind !== "vessel") {
    throw new Error("stable-inside-vessel geometry 非法");
  }
  if (semantic.rimFrame.ref !== contract.rimFrameRef) {
    throw new Error("stable-inside-vessel rim frame identity 漂移");
  }

  const requiredSupportSamples = Math.round(
    contract.settleWindowSeconds * BALL_VESSEL_PROGRAM.sampleRateHz,
  ) + 1;
  const tail = episode.samples.slice(-requiredSupportSamples);
  if (tail.length !== requiredSupportSamples) {
    throw new Error("settle tail sample count 非法");
  }
  const terminalTime = tail.at(-1)!.timeSeconds;
  const expectedStart = terminalTime - contract.settleWindowSeconds;
  tail.forEach((sample, index) => {
    requireFinite(sample.timeSeconds, `tail timestamp[${index}]`);
    const expected = expectedStart + index / BALL_VESSEL_PROGRAM.sampleRateHz;
    if (Math.abs(sample.timeSeconds - expected) > TAIL_TIMESTAMP_TOLERANCE_SECONDS) {
      throw new Error(`tail timestamp[${index}] 不在 30Hz grid`);
    }
    if (index > 0 && sample.timeSeconds <= tail[index - 1]!.timeSeconds) {
      throw new Error(`tail timestamp[${index}] 必须严格递增`);
    }
  });

  let supportSamples = 0;
  let maxHorizontalOffsetMeters = 0;
  let maxLinearSpeedMetersPerSecond = 0;
  let maxFloorDistanceErrorMeters = 0;
  let maxPenetrationMeters = 0;
  let statePredicatesPassed = true;
  const knownRefs = new Set(terminal.entities.map((entity) => entity.ref));
  for (let sampleIndex = 0; sampleIndex < tail.length; sampleIndex += 1) {
    const sample = tail[sampleIndex]!;
    const targetState = sample.states[contract.targetRef];
    const containerState = sample.states[contract.containerRef];
    if (!targetState || !containerState) {
      throw new Error(`tail sample[${sampleIndex}] 缺少 target/container state`);
    }
    const localCenter = stateInContainerFrame(targetState, containerState);
    localCenter.forEach((value, axis) => requireFinite(value, `tail local center[${axis}]`));
    const horizontalOffset = canonicalEvaluationNumber(
      Math.hypot(localCenter[0], localCenter[1]),
      `tail horizontal offset[${sampleIndex}]`,
    );
    const speed = canonicalEvaluationNumber(
      Math.hypot(...requireDenseFiniteVec3(
        targetState.linearVelocity,
        `tail sample[${sampleIndex}].linearVelocity`,
      )),
      `tail linear speed[${sampleIndex}]`,
    );
    const ballBottom = canonicalEvaluationNumber(
      localCenter[2] - targetCollision.radius,
      `tail ball bottom[${sampleIndex}]`,
    );
    const ballTop = canonicalEvaluationNumber(
      localCenter[2] + targetCollision.radius,
      `tail ball top[${sampleIndex}]`,
    );
    const floorDistanceError = canonicalEvaluationNumber(
      Math.abs(ballBottom - semantic.innerEnvelope.innerFloorZMeters),
      `tail floor distance error[${sampleIndex}]`,
    );
    [horizontalOffset, speed, ballBottom, ballTop, floorDistanceError].forEach(
      (value, index) => requireFinite(value, `tail derived metric[${sampleIndex}][${index}]`),
    );
    maxHorizontalOffsetMeters = Math.max(maxHorizontalOffsetMeters, horizontalOffset);
    maxLinearSpeedMetersPerSecond = Math.max(maxLinearSpeedMetersPerSecond, speed);
    maxFloorDistanceErrorMeters = Math.max(maxFloorDistanceErrorMeters, floorDistanceError);
    if (
      horizontalOffset > contract.maxHorizontalOffsetMeters ||
      ballTop > semantic.innerEnvelope.rimZMeters + RIM_CLEARANCE_METERS ||
      floorDistanceError > contract.maxFloorDistanceErrorMeters ||
      speed > contract.maxLinearSpeedMetersPerSecond
    ) {
      statePredicatesPassed = false;
    }

    if (!Array.isArray(sample.contacts)) {
      throw new Error(`tail sample[${sampleIndex}].contacts 必须是 dense array`);
    }
    for (let contactIndex = 0; contactIndex < sample.contacts.length; contactIndex += 1) {
      if (!Object.hasOwn(sample.contacts, contactIndex)) {
        throw new Error(`tail sample[${sampleIndex}].contacts 必须是 dense array`);
      }
    }
    if (sample.contactCount !== sample.contacts.length) {
      throw new Error(`tail sample[${sampleIndex}].contactCount 与 contacts 不一致`);
    }
    let hasSupport = false;
    sample.contacts.forEach((contact, contactIndex) => {
      requireSemanticContact(
        contact,
        knownRefs,
        `tail sample[${sampleIndex}].contacts[${contactIndex}]`,
      );
      if (
        contact.targetRef === contract.targetRef &&
        contact.otherRef === contract.containerRef
      ) {
        maxPenetrationMeters = Math.max(
          maxPenetrationMeters,
          contact.penetrationMeters,
        );
        if (contact.normalOnTargetWorld[2] >= SUPPORT_WORLD_UP_DOT_MINIMUM) {
          hasSupport = true;
        }
      }
    });
    if (hasSupport) supportSamples += 1;
  }

  const metrics = {
    supportSamples,
    requiredSupportSamples,
    maxHorizontalOffsetMeters,
    maxLinearSpeedMetersPerSecond,
    maxFloorDistanceErrorMeters,
    maxPenetrationMeters,
  };
  Object.entries(metrics).forEach(([key, value]) => requireFinite(value, `metrics.${key}`));
  return deepFreeze({
    id: `evaluation:${episode.id.slice("episode:".length)}:${stableInsideContractKey(contract)}`,
    evaluatorId: STABLE_INSIDE_VESSEL_EVALUATOR_ID,
    episodeId: episode.id,
    contractId: contract.id,
    passed:
      statePredicatesPassed &&
      supportSamples === requiredSupportSamples &&
      maxPenetrationMeters <= contract.maxPenetrationMeters,
    metrics,
  }) as StableInsideVesselEvaluationRecord;
}

export function evaluateEpisode(
  episode: Episode,
  contract: SuccessContract,
): EvaluationRecord {
  if (!isDeepFrozen(episode) || !isDeepFrozen(contract)) {
    throw new Error("Episode 与 SuccessContract 必须是递归冻结的 plain data record");
  }
  if (contract.id === "success:stable-inside-vessel") {
    return evaluateStableInsideVessel(episode, contract);
  }
  if (contract.id === "success:end-effector-reaches-frame") {
    throw new Error("articulated contract 必须由 evaluateArticulatedReach 处理");
  }
  const target = episode.terminalSnapshot.entities.find(
    (entity) => entity.ref === contract.targetRef,
  );
  if (!target) {
    throw new Error(`TerminalSnapshot 中不存在 ${contract.targetRef}`);
  }

  const [vx, vy, vz] = target.state.linearVelocity;
  requireFinite(vx, "terminal linearVelocity.x");
  requireFinite(vy, "terminal linearVelocity.y");
  requireFinite(vz, "terminal linearVelocity.z");
  const terminalLinearSpeed = canonicalEvaluationNumber(
    Math.hypot(vx, vy, vz),
    "terminal linear speed",
  );
  const terminalCenterHeight = canonicalEvaluationNumber(
    target.state.pose.position[2],
    "terminal center height",
  );
  const heightError = canonicalEvaluationNumber(
    Math.abs(terminalCenterHeight - contract.expectedCenterHeight),
    "terminal height error",
  );

  return deepFreeze({
    id: `evaluation:${episode.id.slice("episode:".length)}:${landingContractKey(contract)}`,
    evaluatorId: LANDING_EVALUATOR_ID,
    episodeId: episode.id,
    contractId: contract.id,
    passed:
      heightError <= contract.heightTolerance &&
      terminalLinearSpeed <= contract.maxLinearSpeed,
    metrics: {
      terminalCenterHeight,
      heightError,
      terminalLinearSpeed,
    },
  }) as EvaluationRecord;
}
