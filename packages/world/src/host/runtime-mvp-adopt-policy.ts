import {
  LANDING_EVALUATOR_ID,
  STABLE_INSIDE_VESSEL_EVALUATOR_ID,
} from "../evaluation/evaluate-episode";
import type { AdoptPolicy, WorldProgram } from "../kernel/types";
import { END_EFFECTOR_REACH_CONTRACT, END_EFFECTOR_REACH_EVALUATOR_ID } from "../evaluation/evaluate-articulated-reach";
import {
  BALL_VESSEL_PROGRAM,
  deepFreeze,
  FALLING_CUBE_PROGRAM,
  LANDING_SUCCESS_CONTRACT,
} from "../kernel/world";

export const ADOPT_RUNTIME_MVP_POLICY: AdoptPolicy = deepFreeze({
  id: "adopt-policy:runtime-mvp-v1",
  evaluatorId: LANDING_EVALUATOR_ID,
  contractId: LANDING_SUCCESS_CONTRACT.id,
  requirePassed: true,
  episodeCompletion: "completed",
  terminalSource: "runtime-terminal",
}) as AdoptPolicy;

export const ADOPT_DIAGNOSTIC_RIGID_POLICY: AdoptPolicy = deepFreeze({
  id: "adopt-policy:diagnostic-rigid-v1",
  evaluatorId: LANDING_EVALUATOR_ID,
  contractId: LANDING_SUCCESS_CONTRACT.id,
  requirePassed: true,
  episodeCompletion: "completed",
  terminalSource: "runtime-terminal",
}) as AdoptPolicy;

export const ADOPT_STABLE_INSIDE_VESSEL_POLICY: AdoptPolicy = deepFreeze({
  id: "adopt-policy:stable-inside-vessel-v1",
  evaluatorId: STABLE_INSIDE_VESSEL_EVALUATOR_ID,
  contractId: "success:stable-inside-vessel",
  requirePassed: true,
  episodeCompletion: "completed",
  terminalSource: "runtime-terminal",
}) as AdoptPolicy;

export const ADOPT_END_EFFECTOR_REACH_POLICY: AdoptPolicy = deepFreeze({
  id: "adopt-policy:end-effector-reach-v1",
  evaluatorId: END_EFFECTOR_REACH_EVALUATOR_ID,
  contractId: END_EFFECTOR_REACH_CONTRACT.id,
  requirePassed: true,
  episodeCompletion: "completed",
  terminalSource: "runtime-terminal",
}) as AdoptPolicy;

export interface RuntimeMvpAdoptPolicyEntry {
  readonly scenarioId: string;
  readonly programKind: WorldProgram["kind"];
  readonly policy: AdoptPolicy;
}

export const RUNTIME_MVP_ADOPT_POLICY_REGISTRY = deepFreeze([
  {
    scenarioId: "scenario:primitive-box-free-fall-v1",
    programKind: FALLING_CUBE_PROGRAM.kind,
    policy: ADOPT_RUNTIME_MVP_POLICY,
  },
  {
    scenarioId: "scenario:diagnostic-rigid-free-fall-v1",
    programKind: FALLING_CUBE_PROGRAM.kind,
    policy: ADOPT_DIAGNOSTIC_RIGID_POLICY,
  },
  {
    scenarioId: "scenario:ball-vessel-free-fall-v1",
    programKind: BALL_VESSEL_PROGRAM.kind,
    policy: ADOPT_STABLE_INSIDE_VESSEL_POLICY,
  },
  {
    scenarioId: "scenario:two-joint-planar-reach-v1",
    programKind: "actuator-sequence",
    policy: ADOPT_END_EFFECTOR_REACH_POLICY,
  },
] as const) as readonly RuntimeMvpAdoptPolicyEntry[];

const policyIds = RUNTIME_MVP_ADOPT_POLICY_REGISTRY.map(({ policy }) => policy.id);
if (new Set(policyIds).size !== policyIds.length) {
  throw new Error("Runtime MVP AdoptPolicy registry 的 policy.id 必须全局唯一");
}

export function requireAdoptPolicyForProgram(
  scenarioId: string,
  programKind: WorldProgram["kind"],
): AdoptPolicy {
  const entry = RUNTIME_MVP_ADOPT_POLICY_REGISTRY.find(
    (candidate) => candidate.scenarioId === scenarioId && candidate.programKind === programKind,
  );
  if (!entry) throw new Error(`scenario/program kind 未登记 AdoptPolicy：${scenarioId}/${programKind}`);
  return entry.policy;
}

export function requireAdoptPolicyById(
  policyId: AdoptPolicy["id"],
): RuntimeMvpAdoptPolicyEntry {
  const entry = RUNTIME_MVP_ADOPT_POLICY_REGISTRY.find(
    (candidate) => candidate.policy.id === policyId,
  );
  if (!entry) {
    throw new Error(`请求的 AdoptPolicy 不是 Host 注册 policy（closed registry）：${policyId}`);
  }
  return entry;
}
