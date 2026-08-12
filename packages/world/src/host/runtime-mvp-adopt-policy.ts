import {
  LANDING_EVALUATOR_ID,
  STABLE_INSIDE_VESSEL_EVALUATOR_ID,
} from "../evaluation/evaluate-episode";
import type { AdoptPolicy, WorldProgram } from "../kernel/types";
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

export const ADOPT_STABLE_INSIDE_VESSEL_POLICY: AdoptPolicy = deepFreeze({
  id: "adopt-policy:stable-inside-vessel-v1",
  evaluatorId: STABLE_INSIDE_VESSEL_EVALUATOR_ID,
  contractId: "success:stable-inside-vessel",
  requirePassed: true,
  episodeCompletion: "completed",
  terminalSource: "runtime-terminal",
}) as AdoptPolicy;

export interface RuntimeMvpAdoptPolicyEntry {
  readonly programId: WorldProgram["id"];
  readonly policy: AdoptPolicy;
}

export const RUNTIME_MVP_ADOPT_POLICY_REGISTRY = deepFreeze([
  {
    programId: FALLING_CUBE_PROGRAM.id,
    policy: ADOPT_RUNTIME_MVP_POLICY,
  },
  {
    programId: BALL_VESSEL_PROGRAM.id,
    policy: ADOPT_STABLE_INSIDE_VESSEL_POLICY,
  },
] as const) as readonly RuntimeMvpAdoptPolicyEntry[];

export function requireAdoptPolicyForProgram(
  programId: WorldProgram["id"],
): AdoptPolicy {
  const entry = RUNTIME_MVP_ADOPT_POLICY_REGISTRY.find(
    (candidate) => candidate.programId === programId,
  );
  if (!entry) throw new Error(`WorldProgram 未登记 AdoptPolicy：${programId}`);
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
