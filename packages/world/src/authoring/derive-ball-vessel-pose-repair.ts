import type { PoseEditCandidate } from "./authoring-candidate";
import { ballVesselStagingPosition, requireBallVesselTaskWorld } from "./ball-vessel-authoring";
import { deepFreeze, isDeepFrozen } from "../kernel/world";
import type { Episode, EvaluationRecord, RefRecord, Snapshot } from "../kernel/types";
import { BALL_VESSEL_PROGRAM } from "../kernel/world";
import { decodeProductSessionProjection } from "../product-session-codec";

export type BallVesselPoseRepairResult =
  | (PoseEditCandidate & { readonly status: "available" })
  | { readonly status: "unavailable"; readonly reason: "already_passed" | "invalid_evidence" };

// 结构/证据链校验不认证调用来源。Gateway 只传入本 session Host 持有的 read/lastRun。
export function deriveBallVesselPoseRepair(
  read: { readonly ref: RefRecord; readonly snapshot: Snapshot },
  run: { readonly baseRef: RefRecord; readonly episode: Episode; readonly evaluation: EvaluationRecord },
): BallVesselPoseRepairResult {
  try {
    if (!isDeepFrozen(read) || !isDeepFrozen(run)) return { status: "unavailable", reason: "invalid_evidence" };
    const projection = decodeProductSessionProjection({
      sessionId: "session:local-ball-repair", world: read, lastRun: run, lastSequence: 0, running: false,
    });
    const world = projection.world!, lastRun = projection.lastRun!;
    requireBallVesselTaskWorld(world);
    if (lastRun.episode.program.id !== BALL_VESSEL_PROGRAM.id ||
        lastRun.evaluation.evaluatorId !== "evaluator:stable-inside-vessel-v1") return { status: "unavailable", reason: "invalid_evidence" };
    if (lastRun.evaluation.passed) return { status: "unavailable", reason: "already_passed" };
    const [x, y, z] = ballVesselStagingPosition(world);
    const ball = world.snapshot.entities.find((entity) => entity.ref === "entity:ball")!;
    const expected = { name: world.ref.name, snapshotId: world.ref.snapshotId, version: world.ref.version };
    return deepFreeze({
      status: "available" as const, kind: "pose-edit" as const, sourceRef: world.ref,
      sourceEpisodeId: lastRun.episode.id, sourceEvaluationId: lastRun.evaluation.id,
      basis: ["maxHorizontalOffsetMeters", "maxFloorDistanceErrorMeters"] as const,
      edit: { expected, targetRef: "entity:ball" as const,
        change: { kind: "pose" as const, frameRef: "frame:world" as const,
          pose: { position: { x, y, z }, rotation: { ...ball.state.pose.rotation } },
        },
      },
    });
  } catch { return { status: "unavailable", reason: "invalid_evidence" }; }
}
