import type {
  EndEffectorReachEvaluationRecord,
  EndEffectorReachSuccessContract,
  Episode,
} from "../kernel/types";
import { deepFreeze, findEntity } from "../kernel/world";
import { articulatedForwardKinematics } from "../runtime-mujoco/run-articulated-reach";

export const END_EFFECTOR_REACH_EVALUATOR_ID = "evaluator:end-effector-reach-v1" as const;
export const END_EFFECTOR_REACH_CONTRACT: EndEffectorReachSuccessContract = deepFreeze({
  id: "success:end-effector-reaches-frame",
  targetRef: "entity:arm",
  goalFrameRef: "frame:reach-target",
  settleWindowSeconds: 0.5,
  positionToleranceMeters: 0.02,
  maxJointSpeedRadiansPerSecond: 0.02,
}) as EndEffectorReachSuccessContract;

function canonical(value: number): number {
  if (!Number.isFinite(value)) throw new Error("reach metric 必须 finite");
  const result = Number(value.toPrecision(15));
  return Object.is(result, -0) ? 0 : result;
}

export function evaluateArticulatedReach(episode: Episode): EndEffectorReachEvaluationRecord {
  if (episode.scenarioId !== "scenario:two-joint-planar-reach-v1" || episode.program.kind !== "actuator-sequence") {
    throw new Error("reach evaluator 只接纳 registered articulated Episode");
  }
  const target = findEntity(episode.terminalSnapshot, "entity:target");
  if (target.representations.semantic?.kind !== "goal-frame") throw new Error("reach target frame 缺失");
  const expectedSamples = episode.program.durationSeconds * episode.program.sampleRateHz + 1;
  if (episode.samples.length !== expectedSamples) throw new Error("reach Episode sample count 非法");
  episode.samples.forEach((sample, index) => {
    if (sample.timeSeconds !== index / episode.program.sampleRateHz) {
      throw new Error("reach Episode sample grid 非法");
    }
  });
  const window = episode.samples.slice(-16);
  if (window.length !== 16) throw new Error("reach settle window 必须恰好 16 samples");
  let supportSamples = 0;
  let maxPositionErrorMeters = 0;
  let maxJointSpeedRadiansPerSecond = 0;
  for (const sample of window) {
    const joints = sample.articulated?.joints;
    if (!joints || joints.length !== 2) throw new Error("reach sample joint evidence 缺失");
    if (
      joints[0]?.jointRef !== "joint:arm-shoulder" ||
      joints[1]?.jointRef !== "joint:arm-elbow"
    ) throw new Error("reach sample joint registry 漂移");
    const tool = articulatedForwardKinematics(joints[0]!.positionRadians, joints[1]!.positionRadians);
    const goal = target.state.pose.position;
    const error = canonical(Math.hypot(tool[0]-goal[0],tool[1]-goal[1],tool[2]-goal[2]));
    const speed = canonical(Math.max(Math.abs(joints[0]!.velocityRadiansPerSecond),Math.abs(joints[1]!.velocityRadiansPerSecond)));
    maxPositionErrorMeters=Math.max(maxPositionErrorMeters,error);
    maxJointSpeedRadiansPerSecond=Math.max(maxJointSpeedRadiansPerSecond,speed);
    if (error<=END_EFFECTOR_REACH_CONTRACT.positionToleranceMeters && speed<=END_EFFECTOR_REACH_CONTRACT.maxJointSpeedRadiansPerSecond) supportSamples+=1;
  }
  const metrics={supportSamples,requiredSupportSamples:16 as const,maxPositionErrorMeters:canonical(maxPositionErrorMeters),maxJointSpeedRadiansPerSecond:canonical(maxJointSpeedRadiansPerSecond)};
  return deepFreeze({
    id:`evaluation:${episode.id.slice(8)}:end-effector-reach-v1`,
    evaluatorId:END_EFFECTOR_REACH_EVALUATOR_ID,
    episodeId:episode.id,
    contractId:END_EFFECTOR_REACH_CONTRACT.id,
    passed:supportSamples===16,
    metrics,
  }) as EndEffectorReachEvaluationRecord;
}
