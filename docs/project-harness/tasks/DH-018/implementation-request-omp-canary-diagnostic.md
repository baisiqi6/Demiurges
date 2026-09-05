# DH-018 Worker Request — OMP empty-turn diagnostic

You are a bounded coding Worker. Requested route: local ZCode `GLM-5.3`, reasoning variant `max`.

## Bootstrap

Verify `/Users/Admin/projects/WorkTrees/Demiurges-DH-017` and branch `agent/codex/DH-017`. Read the DH-018 plan, `canary-blocker-omp-empty-turn.md`, `apps/agent-gateway/src/omp-world-agent.ts`, its tests, and the installed OMP 17.2.12 SDK source. Before edits, print ACCEPT and run:

```bash
.artifacts/harness/harnessctl accept DH-018 zcode-glm53-max-worker-canary dh018-omp-canary-diagnostic-20260825 --branch agent/codex/DH-017
```

## Single goal

Determine why a real pinned OMP turn can settle with no tool trace and empty assistant text while Product Session emits `turn.completed`. Implement the smallest truthful boundary fix if supported by current SDK evidence.

Preferred hypothesis to verify, not assume: `AgentSession` exposes a terminal assistant message with `stopReason=error|aborted` and/or `errorMessage`, but `RestrictedOmpSdkClient.promptAndWait()` only waits for idle and `getLastAssistantText()` loses that failure.

## Boundaries

- Prefer changes only to `apps/agent-gateway/src/omp-world-agent.ts` and `omp-world-agent.test.ts`, plus RESULT.
- Do not force every Product Session prompt to call tools; conversational/no-op turns may be legitimate.
- Do not add retries, fallback models, provider adapters, orchestration state machines, fifth tools, logging frameworks, or expose raw provider errors to public product events.
- Do not change generated binding, fixture, codec, Project v1, provider generation, Keychain, Studio, registry, or persistence.
- No commit/push/deploy/reset/checkout/clean/revert. Preserve all dirty worktree changes.

If the root cause cannot be proven from SDK/current runtime, return BLOCKED with exact evidence instead of speculative code.

## Verification

Run focused tests and root typecheck. If COMPLETE, Operator will rerun the real canary; Worker should not call Marble/Hunyuan or Keychain. Write `worker-result-omp-canary-diagnostic.md`; do not mark done or self-approve.
