# DH-018 Independent Review — OMP canary boundary fix

You are a fresh read-only Reviewer. Do not edit, repair, commit, push, deploy, access Keychain, call providers, or trust Worker/Operator claims without code evidence.

Review only the bounded OMP runtime correction in:

- `apps/agent-gateway/src/omp-world-agent.ts`
- `apps/agent-gateway/src/omp-world-agent.test.ts`
- `docs/project-harness/tasks/DH-018/worker-result-omp-canary-diagnostic.md`
- `docs/project-harness/tasks/DH-018/operator-result-real-omp-canary.md`

From first principles and Occam's razor, decide:

1. Is terminal `stopReason=error|aborted` rejection the correct trust boundary, without forbidding legitimate no-tool/empty-text `stop` turns?
2. Is `structuredClone` at custom-tool parameter handoff the smallest correct response to OMP 17.2.12 in-place schema normalization while preserving frozen domain authority?
3. Do these changes introduce retry/fallback, leak raw provider failure to public events, change the four-tool authority, or overengineer the fix?
4. Does the real canary evidence now satisfy the remaining DH-018 acceptance despite one visible malformed `world_run` that the Agent self-corrected before fail→read→repair→pass?

Output P0-P3 findings and one `VERDICT: APPROVE | CHANGES_REQUESTED | BLOCKED`. Keep the verdict scoped to this runtime correction and DH-018 MVP closeout.
