import type { AuthoringCandidate } from "../packages/world/src/authoring/authoring-candidate";

// 仅由 typecheck:authoring 编译，不作为执行器；错误 payload 必须触发编译错误。
export function checkCandidateNarrowing(candidate: AuthoringCandidate): "run" | "edit" {
  switch (candidate.kind) {
    case "program":
      void candidate.program;
      // @ts-expect-error Program 候选没有 edit payload。
      void candidate.edit;
      return "run";
    case "pose-edit":
      void candidate.edit;
      // @ts-expect-error Pose Edit 候选没有 program payload。
      void candidate.program;
      return "edit";
    default: {
      const exhaustive: never = candidate;
      return exhaustive;
    }
  }
}
