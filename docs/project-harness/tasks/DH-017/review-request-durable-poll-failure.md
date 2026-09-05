# DH-017 durable provider poll failure — independent review request

## Purpose

Review one small correctness fix revealed by the already-completed real Hunyuan canary. The provider returned a terminal failed poll result after one paid submit, but the durable Generation head remained `remote_bound`. The product truth must record the closed provider failure exactly once without creating a second lifecycle or recovery system.

Judge the implementation from the underlying need, first principles, and Occam's razor. Do not reward extra defensive machinery. Flag unnecessary abstraction or test bulk as well as correctness defects.

## Read boundary

Read these files first and treat them as the implementation surface:

- `docs/project-harness/tasks/DH-017/implementation-request-durable-poll-failure.md`
- `packages/world-project/src/generation-submit-result-coordinator.ts`
- `packages/world-project/src/generation-submit-result-coordinator.test.ts`
- `apps/agent-gateway/src/provider-canary-runner.ts`
- `apps/agent-gateway/src/provider-canary-runner.test.ts`

You may read only directly imported current contracts needed to validate a finding. Do not read Worker RESULT/session logs, prior reviewer output, `docs/project-harness/current/review-packet.md`, historical round requests, or unrelated progress notes.

## Required review questions

1. Does `remote_bound -> provider_failed` reuse the existing journal pending/witness/capacity/append path and converge to one durable successor across retry?
2. Are exact replays read-only and conflicting dispositions rejected before mutation?
3. Does the runner durably terminate only provider-declared terminal failures/rejections, while contract mismatch, transient, abort/deadline, and download failure remain nonterminal as specified?
4. Is the change the smallest coherent solution, with no redundant framework, duplicated state machine, speculative recovery, or excessive test matrix?
5. Do tests cover the business counterexample, one representative journal interruption, replay/conflict, and both provider classifications without over-testing implementation details?

## Boundaries

- Read-only review. No repository writes or Git mutation.
- No network, Keychain, credentials, provider calls, or real generation.
- This review cannot authorize another paid canary.
- Report P0/P1/P2 findings with exact evidence. If none, say `approved / may_advance=true`.
- Run only the two focused test files and typecheck if useful; do not chase unrelated full-suite flakes.
