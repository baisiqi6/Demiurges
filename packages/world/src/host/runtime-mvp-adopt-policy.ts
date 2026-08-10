import { LANDING_EVALUATOR_ID } from "../evaluation/evaluate-landing";
import type { AdoptPolicy } from "../kernel/types";
import { deepFreeze, LANDING_SUCCESS_CONTRACT } from "../kernel/world";

export const ADOPT_RUNTIME_MVP_POLICY: AdoptPolicy = deepFreeze({
  id: "adopt-policy:runtime-mvp-v1",
  evaluatorId: LANDING_EVALUATOR_ID,
  contractId: LANDING_SUCCESS_CONTRACT.id,
  requirePassed: true,
  episodeCompletion: "completed",
  terminalSource: "runtime-terminal",
}) as AdoptPolicy;
