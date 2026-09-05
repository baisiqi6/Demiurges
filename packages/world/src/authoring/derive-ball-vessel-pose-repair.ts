import { requireRegisteredSnapshotIdentity } from "../artifacts/diagnostic-rigid-fixture";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";
import { deepFreeze, isDeepFrozen } from "../kernel/world";
import type { Episode, EvaluationRecord, RefRecord, Snapshot } from "../kernel/types";

const GOLDEN_READ_DIGEST = "45059a194fb41d05d18478a9c8b3643324882f087648f05bb7d0a781cc7bb721";
const GOLDEN_RUN_DIGEST = "316f5e0c99f16ff6197d601bd333faf2aa758609a0ba176295cacc9b74ce7f48";
const GOLDEN_EPISODE_ID = "episode:13-dh021-outside-6-edit-1";
const GOLDEN_EVALUATOR_ID = "evaluator:stable-inside-vessel-v1";
const GOLDEN_CONTRACT_ID = "success:stable-inside-vessel";
const normalize = (value: unknown): unknown => typeof value === "number" && Object.is(value, -0) ? 0 : Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)])) : value;
const digest = (value: unknown) => sha256Hex(canonicalJsonBytes(normalize(value)));

export type BallVesselPoseRepairResult =
  | { readonly status: "available"; readonly sourceEpisodeId: string; readonly sourceEvaluationId: string; readonly basis: readonly ["maxHorizontalOffsetMeters", "maxFloorDistanceErrorMeters"]; readonly pose: { readonly frameRef: "frame:world"; readonly position: readonly [number, number, number]; readonly rotation: { readonly x: 0; readonly y: 0; readonly z: 0; readonly w: 1 } } }
  | { readonly status: "unavailable"; readonly reason: "already_passed" | "invalid_evidence" };

export function deriveBallVesselPoseRepair(read: { readonly ref: RefRecord; readonly snapshot: Snapshot }, run: { readonly baseRef: RefRecord; readonly episode: Episode; readonly evaluation: EvaluationRecord }): BallVesselPoseRepairResult {
  try {
    if (!isDeepFrozen(read) || !isDeepFrozen(run) || digest(read) !== GOLDEN_READ_DIGEST || digest(run) !== GOLDEN_RUN_DIGEST) return { status: "unavailable", reason: "invalid_evidence" };
    requireRegisteredSnapshotIdentity(read.snapshot);
    const { episode, evaluation } = run;
    if (episode.id !== GOLDEN_EPISODE_ID || episode.scenarioId !== "scenario:ball-vessel-free-fall-v1" || episode.explicitInputs.runId !== "run:dh021-outside" || episode.runtimeEvidence.provider !== "MuJoCo WASM" || episode.runtimeEvidence.version !== "3.11.0" || episode.runtimeEvidence.modelFormat !== "MJCF" || evaluation.evaluatorId !== GOLDEN_EVALUATOR_ID || evaluation.contractId !== GOLDEN_CONTRACT_ID || evaluation.episodeId !== episode.id) return { status: "unavailable", reason: "invalid_evidence" };
    if (evaluation.passed) return { status: "unavailable", reason: "already_passed" };
    if (evaluation.metrics.supportSamples !== 0 || evaluation.metrics.maxHorizontalOffsetMeters <= 0.29 || evaluation.metrics.maxFloorDistanceErrorMeters <= 0.005) return { status: "unavailable", reason: "invalid_evidence" };
    const vessel = read.snapshot.entities.find((entity) => entity.ref === "entity:vessel");
    const ball = read.snapshot.entities.find((entity) => entity.ref === "entity:ball");
    if (!vessel || !ball || vessel.representations.semantic?.kind !== "vessel" || ball.representations.collision?.kind !== "sphere") return { status: "unavailable", reason: "invalid_evidence" };
    const rim = vessel.representations.semantic.rimFrame;
    const radius = ball.representations.collision.radius;
    const position: [number, number, number] = [Number(rim.localPose.position[0].toPrecision(15)), Number(rim.localPose.position[1].toPrecision(15)), Number((rim.localPose.position[2] + radius / 2).toPrecision(15))];
    return deepFreeze({ status: "available" as const, sourceEpisodeId: episode.id, sourceEvaluationId: evaluation.id, basis: ["maxHorizontalOffsetMeters", "maxFloorDistanceErrorMeters"] as const, pose: { frameRef: "frame:world" as const, position, rotation: { x: 0 as const, y: 0 as const, z: 0 as const, w: 1 as const } } });
  } catch { return { status: "unavailable", reason: "invalid_evidence" }; }
}
