import { ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST, articulatedForwardKinematics } from "../runtime-mujoco/run-articulated-reach";
import { requireRegisteredSnapshotIdentity } from "../artifacts/diagnostic-rigid-fixture";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";
import { deepFreeze, isDeepFrozen } from "../kernel/world";
import type { ActuatorSequenceWorldProgram, Episode, EvaluationRecord, RefRecord, Snapshot } from "../kernel/types";
import { evaluateArticulatedReach } from "../evaluation/evaluate-articulated-reach";
import { requireWorldRunInput } from "../world-tools/world-tool-contract";

const GOLDEN_READ_DIGEST = "0595999e413f1c85fc7ae7c162581d96d60b4aa92db3a44b524a01ad98e55acb" as const;
const GOLDEN_RUN_DIGEST = "0cff4c8b8948864357a717d16ba86eea0761578884747bde68f936f0d8fa05a2" as const;
const GOLDEN_PROGRAM_ID = "program:sha256:d77947b5f1f1344d253702d44310418ec831f23a5b6b7867cb8a9660dc0bb405" as const;
const GOLDEN_RUN_ID = "run:dh019-zero" as const;
const GOLDEN_EPISODE_ID = "episode:10-dh019-zero-6-edit-1-d77947b5f1f1344d253702d44310418ec831f23a5b6b7867cb8a9660dc0bb405" as const;
const GOLDEN_REPAIR_BASIS = ["maxPositionErrorMeters", "maxJointSpeedRadiansPerSecond"] as const;

export type ArticulatedRepairResult =
  | { readonly status: "available"; readonly sourceEpisodeId: Episode["id"]; readonly sourceEvaluationId: string; readonly basis: typeof GOLDEN_REPAIR_BASIS; readonly program: ActuatorSequenceWorldProgram }
  | { readonly status: "unavailable"; readonly reason: "already_passed" | "unreachable" | "invalid_evidence" };

function same(a: unknown, b: unknown): boolean {
  return sha256Hex(canonicalJsonBytes(a)) === sha256Hex(canonicalJsonBytes(b));
}
function rounded(value: number): number {
  if (!Number.isFinite(value)) throw new Error("IK angle 必须 finite");
  const result = Number(value.toPrecision(15));
  return Object.is(result, -0) ? 0 : result;
}
const invalid = (): ArticulatedRepairResult => ({ status: "unavailable", reason: "invalid_evidence" });

export function deriveArticulatedReachRepair(
  read: { readonly ref: RefRecord; readonly snapshot: Snapshot },
  run: { readonly baseRef: RefRecord; readonly episode: Episode; readonly evaluation: EvaluationRecord },
  nextRunId: `run:${string}`,
): ArticulatedRepairResult {
  try {
    if (!isDeepFrozen(read) || !isDeepFrozen(run)) return invalid();
    if (!same(read, { tool: "read", ref: read.ref, snapshot: read.snapshot }) || !same(run.baseRef, read.ref)) return invalid();
    if (sha256Hex(canonicalJsonBytes(read)) !== GOLDEN_READ_DIGEST || sha256Hex(canonicalJsonBytes(run)) !== GOLDEN_RUN_DIGEST) return invalid();
    requireRegisteredSnapshotIdentity(read.snapshot);
    const { episode, evaluation } = run;
    if (episode.id !== GOLDEN_EPISODE_ID || episode.explicitInputs.runId !== GOLDEN_RUN_ID || episode.program.id !== GOLDEN_PROGRAM_ID || episode.scenarioId !== "scenario:two-joint-planar-reach-v1" || episode.baseSnapshotId !== read.ref.snapshotId) return invalid();
    if (episode.runtimeProfileId !== "runtime:mujoco-wasm-single-3.11.0" || episode.runtimeEvidence.provider !== "MuJoCo WASM" || episode.runtimeEvidence.version !== "3.11.0" || episode.runtimeEvidence.modelFormat !== "MJCF" || episode.runtimeEvidence.modelCausalDigest !== ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST) return invalid();
    if (evaluation.passed) return { status: "unavailable", reason: "already_passed" };
    if (evaluation.evaluatorId !== "evaluator:end-effector-reach-v1" || evaluation.contractId !== "success:end-effector-reaches-frame" || evaluation.episodeId !== episode.id || !same(evaluation, evaluateArticulatedReach(episode))) return invalid();
    const arm = read.snapshot.entities.find((entity) => entity.ref === "entity:arm");
    const target = read.snapshot.entities.find((entity) => entity.ref === "entity:target");
    const semantic = arm?.representations.semantic;
    if (!arm || !target || semantic?.kind !== "articulated" || target.representations.semantic?.kind !== "goal-frame") return invalid();
    if (!same(episode.terminalSnapshot.entities.find((entity) => entity.ref === "entity:target"), target)) return invalid();
    if (target.state.pose.position[2] !== 0.75 || semantic.links[1]?.lengthMeters !== 0.55 || semantic.links[2]?.lengthMeters !== 0.45) return invalid();
    const [x, y] = target.state.pose.position;
    const l1 = semantic.links[1]!.lengthMeters, l2 = semantic.links[2]!.lengthMeters;
    const cosine = (x * x + y * y - l1 * l1 - l2 * l2) / (2 * l1 * l2);
    if (!Number.isFinite(cosine) || cosine < -1 || cosine > 1) return { status: "unavailable", reason: "unreachable" };
    const elbow = rounded(-Math.acos(cosine));
    const shoulder = rounded(Math.atan2(y, x) - Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow)));
    const limits = semantic.joints.map((joint) => joint.limitRadians);
    if (shoulder < limits[0]![0] || shoulder > limits[0]![1] || elbow < limits[1]![0] || elbow > limits[1]![1]) return { status: "unavailable", reason: "unreachable" };
    const fk = articulatedForwardKinematics(shoulder, elbow);
    if (Math.hypot(fk[0] - x, fk[1] - y, fk[2] - target.state.pose.position[2]) > 1e-9) return { status: "unavailable", reason: "unreachable" };
    const content = { kind: "actuator-sequence" as const, targetRef: "entity:arm" as const, durationSeconds: episode.program.durationSeconds, sampleRateHz: episode.program.sampleRateHz, steps: [{ timeSeconds: 0, commands: [{ actuatorRef: "actuator:arm-shoulder-position" as const, valueRadians: shoulder }, { actuatorRef: "actuator:arm-elbow-position" as const, valueRadians: elbow }] as const }] };
    const program = requireWorldRunInput({ runId: nextRunId, program: content }).program as ActuatorSequenceWorldProgram;
    return deepFreeze({ status: "available" as const, sourceEpisodeId: episode.id, sourceEvaluationId: evaluation.id, basis: GOLDEN_REPAIR_BASIS, program });
  } catch { return invalid(); }
}
