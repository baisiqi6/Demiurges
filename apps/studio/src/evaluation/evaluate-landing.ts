import type { Episode, EvaluationRecord, LandingSuccessContract } from "../kernel/types";
import { deepFreeze, isDeepFrozen } from "../kernel/world";

export const LANDING_EVALUATOR_ID = "evaluator:stable-landing-v1" as const;

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数值`);
  }
}

function contractKey(contract: LandingSuccessContract): string {
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

export function evaluateLanding(
  episode: Episode,
  contract: LandingSuccessContract,
): EvaluationRecord {
  if (!isDeepFrozen(episode) || !isDeepFrozen(contract)) {
    throw new Error("Episode 与 SuccessContract 必须是递归冻结的 plain data record");
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
  const terminalLinearSpeed = Math.hypot(vx, vy, vz);
  requireFinite(terminalLinearSpeed, "terminal linear speed");
  const terminalCenterHeight = target.state.pose.position[2];
  requireFinite(terminalCenterHeight, "terminal center height");
  const heightError = Math.abs(terminalCenterHeight - contract.expectedCenterHeight);
  requireFinite(heightError, "terminal height error");

  return deepFreeze({
    id: `evaluation:${episode.id.slice("episode:".length)}:${contractKey(contract)}`,
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
