# DH-017 limited-fresh Reviewer bootstrap: Hunyuan live placeholders

## Role and independence

You are the Reviewer, not the implementer. Review the current files on disk from the bottom-level product need. Do not trust or read any Worker RESULT, prior reviewer verdict, chat completion claim, or provider raw response. Do not modify any file, run a provider request, read Keychain, use network, submit/retry a Job, or mutate Git/Harness/Coordinate/Discord.

## Bottom-level need

DH-017 must resume the one already durable Hunyuan Generation whose head is `remote_bound`, without creating a second paid submit. The live query transport returned a valid top-level response whose shape-only descriptor was:

`Response.{ErrorCode:string,ErrorMessage:string,RequestId:string,ResultCreditConsumed:number,ResultCreditDetails:string,ResultFile3Ds:array,Status:string}`

No response scalar values are available to you. The existing codec rejected this shape before it could classify the status. Current Tencent documentation defines all of those fields at query top level; its DONE example uses empty-string error fields, a non-empty JSON string for `ResultCreditDetails`, numeric credit consumption, and a non-empty result array.

## Intended minimum contract

- Keep the two configured envelope profiles frozen. No guessing or fallback.
- `WAIT`/`RUN`: permit only absent/null/empty-string error and credit-detail placeholders, absent/null/strictly empty dense `ResultFile3Ds`, and absent/null/numeric zero credit consumption. Any meaningful output, error, nonzero cost, wrong type, sparse/tagged array, unknown key, or malformed identity must fail closed.
- `FAIL`: permit absent/null/strictly empty dense `ResultFile3Ds`; continue returning only failure plus sanitized total cost. Raw error/detail text must not escape.
- `DONE`: require a valid non-empty file set with exactly one GLB; permit only empty error placeholders; permit and ignore typed `ResultCreditDetails`; preserve existing cost sanitization and ephemeral URL behavior.
- Keep the implementation direct and small. No new framework, normalization layer, retry mechanism, logging, persistence field, or provider action.

## Review scope

- `apps/agent-gateway/src/generation-provider-codecs.ts`
- `apps/agent-gateway/src/generation-provider-codecs.test.ts`
- `apps/agent-gateway/src/hunyuan-generation-service.test.ts`

You may read adjacent code needed to understand invariants and run only local, read-only verification commands. At minimum independently run:

`bun test apps/agent-gateway/src/generation-provider-codecs.test.ts apps/agent-gateway/src/hunyuan-generation-service.test.ts`

`bun run typecheck`

## Required verdict

Return concise plain text with:

1. `VERDICT: APPROVE` or `VERDICT: CHANGES_REQUESTED`
2. Findings grouped as P0/P1/P2 with exact file and line references; write `none` when empty.
3. Independent test results.
4. `MAY_POLL_EXISTING_JOB: yes|no`
5. One sentence on whether the change is the smallest sound solution under first principles and Occam's razor.

Only correctness, safety, and directly missing acceptance coverage count as findings. Do not request speculative robustness or unrelated cleanup.
