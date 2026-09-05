# DH-017 implementation review request — startup generated-set publication tail

## Posture

Independent read-only review. Do not read Worker RESULT/messages/session, `current/review-packet.md`, prior reviewer outputs, or historical review notes. Start from the product need: after process restart, only exact durable evidence may authorize generated-set publication tail recovery, and malformed generation evidence must block every older Project/Artifact mutation. Use first principles and Occam's razor; do not request duplicate defenses or a framework when an existing journal/codec already closes the invariant.

No writes, installs, network, credentials/provider calls, cleanup, Git mutation, or production actions. Preserve the dirty worktree.

## Product question

Does startup now perform one genuinely global read-only preflight over Generation and generated-set publication truth before any existing recovery mutation, then uniquely converge only the approved publication tail cases without trusting prior-process object identity, rewriting public artifacts incorrectly, or widening authority?

## Primary files

- `packages/world-project/src/generated-set-startup-recovery.ts`
- its focused test file
- `packages/world-project/src/startup-recovery.ts`
- `packages/world-project/src/startup-recovery.test.ts`
- any narrowly changed generated-set publication/visible/verified helper and test files

## Relevant authority

- `docs/project-harness/tasks/DH-017/implementation-request-startup-generated-set-publication-tail.md`
- `docs/project-harness/tasks/DH-017/plan.md`
- Generation state/record journal and physical snapshot inspection
- generated content/provenance/set records, storage preflight, publication binding/catalog/result
- hidden CAS, visible commit and verified transition modules
- Operation receipt/capacity classification, namespace/birth startup preflight, root/lease, `index.ts`

## Mandatory questions

1. Is every generated-set classification purely reconstructed from bounded durable evidence, with no dependence on a prior process's WeakMap/capability?
2. Is the generated-set inspection completed before any legacy repair/beginRecovery/finalize/cleanup, namespace/birth apply, catalog/result write, or Generation append?
3. Is the recovery plan truly module-private, root/lease bound, exact-snapshot bound and one-shot; do forged/copy/replay/cross-root/cross-lease plans fail before mutation?
4. Does `validating + exact intent` append/resume exactly one matching `publishing` record while catalog/result/public CAS remain absent? Does `publishing + no intent` fail closed with reservation 2?
5. Does catalog-only require the full hidden join and exact attempt/catalog lineage before publishing the exact result, then rebuild the complete join before `verified`?
6. Does result-complete with a lagging validating/publishing head converge without rewriting catalog/result/member inodes, and does exact verified replay remain read-only?
7. Do result-only, incomplete members, wrong operation/result identity, conflicting/extra receipts/catalog, terminal failure plus publication evidence, state/binding/member drift and Phase-A→apply replacements fail before the first affected mutation?
8. Are capacity reconstruction and the `validating intent → publishing` handoff exact near 2044..2048, with no double-count or lost reservation?
9. Are the existing record-journal and no-replace result protocols reused rather than duplicated? Are fault boundaries around result and verified append deterministic?
10. Is the deliberately deferred boundary honest: this slice must not rebuild missing hidden CAS, cleanup attempts/private downloads, expose list/serve, or broaden package-root/provider/World authority?
11. Did the change stay proportionate, avoiding generic recovery registries, repositories, policy tables or speculative multi-generation machinery?

## Required counterexample review

- old terminal Operation plus malformed generated evidence blocks old cleanup/repair;
- post-preflight same-bytes inode/body/mode/type/symlink/entry-set drift rejects before apply mutation;
- validating+intent, publishing-no-intent, catalog-only, result-complete lag and verified replay;
- result-only/incomplete hidden join/cross-record identity drift;
- near-cap receipt arithmetic;
- result staging/link/fsync and verified journal fault boundaries;
- forged/copy/replay/cross-root/cross-lease plan;
- package-root negative export and zero provider/network/cleanup/list/serve action.

## Verification

Run focused tests and typecheck; wider tests only when proportionate. Report only commands/results actually run. A Worker claim is not evidence.

## Verdict

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 findings with exact file/line evidence and smallest required change
- mandatory checks/counterexamples
- tests actually run
- boundary attestation

Immediately report any P0/P1, then complete bounded closure. If none remain, explicitly state P0/P1/P2 counts.
