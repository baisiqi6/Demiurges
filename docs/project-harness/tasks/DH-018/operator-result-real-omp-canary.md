# DH-018 Operator Result — real restricted OMP Agent canary

## Result

PASS after two bounded runtime-boundary corrections.

## Initial failure evidence

1. Before terminal checking, two canaries emitted `turn.completed` with `tools=[]`, empty response, no world, and no Evaluation.
2. After terminal checking, the same canary correctly emitted `turn.failed` with `OmpAgentTurnError: Attempted to assign to readonly property.`
3. OMP 17.2.12 source and a direct SDK schema repro located the mutation at the wire-schema normalization boundary: OMP mutates custom-tool `parameters`, while Demiurges had passed the deep-frozen domain contract by reference.

## Minimal corrections

- Treat terminal assistant `stopReason=error|aborted` as a failed OMP turn instead of empty success.
- Give OMP a `structuredClone` of each tool parameter schema; retain the canonical `WORLD_TOOL_CONTRACT` as frozen authority.
- No retry, fallback model, new tool, provider generation, registry, Project v1, persistence, or orchestration framework.

## Final real canary

- Pinned Agent model selector: `deepseek/deepseek-v4-flash`
- Fixed generated object identity: DH-017 Hunyuan binding
- Tool event sequence:
  - `world_write`
  - `world_read`
  - `world_edit`
  - `world_run` (first malformed/no-evidence attempt; Agent continued)
  - `world_run` → Evaluation `passed=false`, base Ref version 2
  - `world_read`
  - `world_edit` using fresh Ref
  - `world_run` → Evaluation `passed=true`, base Ref version 3
- Final authority: `snapshot:edit-2`, Ref version 3, Evaluation passed, `lastSequence=10`, terminal event `turn.completed`.

The malformed first `world_run` was not hidden: it remained a tool event without Evaluation evidence, and the Agent repaired its own call before completing the required world repair loop.

## Independent operator checks

- `apps/agent-gateway/src/omp-world-agent.test.ts`: 25 pass / 0 fail / 111 assertions
- root `bun run typecheck`: pass for world-project, agent-gateway, and studio
- targeted `git diff --check`: clean
- no scratch repro file remains
