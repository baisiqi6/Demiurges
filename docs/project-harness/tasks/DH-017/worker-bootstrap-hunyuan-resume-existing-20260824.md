# DH-017 Worker bootstrap: resume the exact existing remote-bound canary

## Role

You are the coding Worker. Begin with `ACCEPT`, implement only this bounded offline slice, run local fake tests, and end with a concise `RESULT`. Do not read Keychain, use network, call a provider, run the real canary, inspect production, modify Harness/Coordinate/Discord, commit, stage, push, or touch files outside the scope below.

## Bottom-level need

The one paid Hunyuan canary is durably `remote_bound`. After the reviewed query-codec fix, an Operator no-generation query classified that exact Job as `DONE`. No duplicate submit is allowed. The existing `ProviderCanaryRunner.run` intentionally blocks any second invocation, so it cannot reuse the already implemented poll, bounded download, validation, `completeDownloaded`, and verified publication path.

Implement the smallest sound resume behavior inside the existing runner/script. Do not add a second runner, generic recovery framework, scheduler, retry abstraction, provider SDK, or new persistence format.

## Required behavior

1. When the exact generation already exists and its current durable state is `remote_bound`, `ProviderCanaryRunner.run` must:
   - use the durable existing intent, not the newly constructed candidate intent;
   - require that the durable intent still matches the frozen provider/model/prompt/profile/shape contract;
   - skip admission and skip submit entirely;
   - continue through the existing bounded poll/download/`completeDownloaded` path.
2. An existing generation in any other state remains blocked with zero provider fetch. Do not add terminal replay in this slice.
3. The absent-generation path must remain unchanged: at most one submit, then the same poll/download/publication path.
4. `runDh017ProviderCanary` must permit the exact existing `remote_bound` generation to reach the runner. Remove only the redundant fresh-namespace stop that prevents this; retain existing invocation validation, zero-artifact precondition, fixed idempotency key, contract profile/digest, Keychain locator, deadlines, download limits, URL allowlist, no-auth-to-COS rule, and stale `existingHunyuanJobId` rejection.
5. Update the existing tests so they prove:
   - first invocation can stop at `remote_bound`, second invocation resumes to `verified`;
   - across both invocations Hunyuan submit count remains exactly 1, second invocation performs no submit, and signed asset download receives no Authorization header;
   - mismatched durable contract or non-`remote_bound` existing state blocks before provider fetch;
   - the fresh absent path still submits once.

## Allowed files

- `apps/agent-gateway/src/provider-canary-runner.ts`
- `apps/agent-gateway/src/provider-canary-runner.test.ts`
- `scripts/run-dh017-provider-canary.ts`
- `scripts/run-dh017-provider-canary.test.ts`
- `.artifacts/canary/DH-017/20260824T153710Z/hunyuan/worker-result-resume-existing.md` for your final RESULT only

## Required verification

Run at minimum:

`bun test apps/agent-gateway/src/provider-canary-runner.test.ts scripts/run-dh017-provider-canary.test.ts`

`bun run typecheck`

Report exact changed files, test counts, and confirm provider fetch=0 / Keychain read=0 during your work. Prefer direct branching over refactoring unrelated code.
