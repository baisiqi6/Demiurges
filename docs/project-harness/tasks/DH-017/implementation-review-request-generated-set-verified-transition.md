# DH-017 implementation review request — visible publication to `verified`

## Posture

Independent read-only review. Do not read the Worker RESULT, worker messages/session, `current/review-packet.md`, prior reviewer outputs, or historical review notes. Start from Demiurges' durable-evidence intent, first principles, and Occam's razor. Review actual code/tests and the canonical request/plan. Do not reward extra defense or architecture for its own sake.

No writes, installs, network, credentials/provider calls, Git mutation, cleanup, or production actions. Preserve the dirty worktree.

## Product question

Does the implementation append exactly one terminal Generation `verified` record only when the already-durable catalog, internal Operation success result, all generated member evidence, and current `publishing` head still form one exact published join—while crash/replay/drift cannot create a second or false terminal truth?

## Primary files

- `packages/world-project/src/generation-state.ts`
- `packages/world-project/src/generation-state.test.ts`
- `packages/world-project/src/generated-set-visible-commit.ts`
- `packages/world-project/src/generated-set-visible-commit.test.ts`
- `packages/world-project/src/generated-set-verified-transition.ts`

## Relevant context

- `docs/project-harness/tasks/DH-017/implementation-request-generated-set-verified-transition.md`
- `docs/project-harness/tasks/DH-017/plan.md`
- generated-set publication/hidden-CAS/visible-commit modules and tests
- generation record journal/state chain, records/layout/storage preflight, safe filesystem, root/lease, and `index.ts`

## Mandatory questions

1. Is `verified` exact-key, exact-id, only reachable from `publishing`, and terminal without breaking prior chain compatibility?
2. Is the original visible evidence a real in-process authority bound to same root/lease/intent/plan, not a structural token?
3. Before append and before replay acceptance, does the implementation rebuild the full published join from stable durable files and exact current head?
4. Does it use the existing `GenerationRecordJournal.append()` without duplicating its crash protocol? Are pending next/witness/final/head/cleanup shapes deterministically resumed or fail closed?
5. Can a crash after the verified head becomes durable cause a second record, a different digest, or a false replay? Is the previous digest/payload/sequence exact?
6. Do catalog-only/result-only/missing member/cross-record drift, stale head, same-bytes replacement inode where lineage is required, forged/copy/cross-root/cross-lease/cross-intent/cross-plan evidence all fail before new Generation mutation?
7. Does any new helper/export widen package-root writer/list/serve/startup authority or create an unnecessary framework?
8. Are tests adversarial and tied to observable durable facts, including record-journal fault boundaries?

## Verification

Run focused tests and typecheck; run wider tests if proportionate. Report only commands/results you actually ran.

## Verdict

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 findings with exact file/line evidence and smallest required change
- mandatory checks/counterexamples
- tests actually run
- boundary attestation

Immediately report any P0/P1, then complete bounded closure. If none remain, explicitly state P0/P1/P2 counts.
