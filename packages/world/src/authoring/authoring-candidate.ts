import type { ActuatorSequenceWorldProgram, Episode, EvaluationRecord, RefRecord } from "../kernel/types";
import type { WorldEditPoseWireInput } from "../world-tools/world-tool-contract";

// 内部候选只描述待执行内容。来源字段不是授权；通过既有四工具执行后才有新证据。
interface CandidateSource {
  readonly sourceRef: RefRecord;
  readonly sourceEpisodeId: Episode["id"];
  readonly sourceEvaluationId: EvaluationRecord["id"];
  readonly basis: readonly string[];
}

export type ProgramCandidate = CandidateSource & {
  readonly kind: "program";
  // canonical Program 含 id；world_run 的 wire input 仍需要调用端去掉 id。
  readonly program: ActuatorSequenceWorldProgram;
};

export type PoseEditCandidate = CandidateSource & {
  readonly kind: "pose-edit";
  // expected 固定为推导时的 Ref，不允许调用端静默重绑定到最新世界。
  readonly edit: WorldEditPoseWireInput;
};

export type AuthoringCandidate = ProgramCandidate | PoseEditCandidate;
