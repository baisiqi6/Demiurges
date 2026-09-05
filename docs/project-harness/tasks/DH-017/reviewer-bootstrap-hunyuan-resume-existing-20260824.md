# DH-017 limited-fresh Reviewer bootstrap: exact remote-bound resume

## Role and independence

You are the Reviewer, not the implementer. Review current disk state from the product need below. Do not read any Worker RESULT, prior reviewer verdict, or chat completion claim. Do not modify files, use network, read Keychain, run the real canary, mutate Git/Harness/Coordinate/Discord, or call any provider.

## Bottom-level need

One paid Hunyuan canary already exists with a durable `remote_bound` head. A separately reviewed product-service query now classifies that exact Job as `DONE`. We must download its GLB and enter the already existing `completeDownloaded` verified-publication path without a second submit. The prior canary runner deliberately blocked all second invocations; this change should open only the exact `remote_bound` case.

## Required invariants

- Existing exact `remote_bound`: use the durable intent and remote binding, re-check frozen provider/model/prompt/profile/shape, skip admission and submit, then reuse the existing bounded poll/download/publication path.
- Existing any other state, contract drift, or malformed durable binding: fail before provider fetch. Do not invent terminal replay.
- Absent generation: preserve the old admission and at-most-one-submit path.
- The Operator script may remove only the redundant fresh-generation-namespace guard that prevented resume. It must retain the zero-published-artifact precondition, fixed idempotency key and contract, Keychain locator, deadlines, response/download bounds, URL/redirect allowlist, no-auth-to-COS rule, and stale caller-supplied JobId rejection.
- No second runner, framework, scheduler, retry abstraction, new durable format, raw response persistence, or signed URL persistence.

## Review scope

- `apps/agent-gateway/src/provider-canary-runner.ts`
- `apps/agent-gateway/src/provider-canary-runner.test.ts`
- `scripts/run-dh017-provider-canary.ts`
- `scripts/run-dh017-provider-canary.test.ts`

Read adjacent code only as needed. Independently run:

`bun test apps/agent-gateway/src/provider-canary-runner.test.ts scripts/run-dh017-provider-canary.test.ts`

`bun run typecheck`

## Required verdict

Return:

1. `VERDICT: APPROVE` or `VERDICT: CHANGES_REQUESTED`
2. P0/P1/P2 findings with exact file/line references, or `none`
3. Independent test results
4. `MAY_RUN_REAL_RESUME: yes|no`
5. One sentence on whether this is the smallest sound solution under first principles and Occam's razor

Only correctness, safety, and directly missing acceptance coverage count. Do not request speculative robustness or unrelated cleanup.
