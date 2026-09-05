# DH-017 implementation review request — generated-set visible commit

## Reviewer posture

Perform an independent, read-only implementation review. Start from the product intent and failure model, not from the Worker's RESULT or a checklist-compliance presumption. Apply first principles and Occam's razor: approve the smallest sufficient authority chain; flag real safety/correctness/recovery defects, not hypothetical framework opportunities.

Do not read Worker session JSONL, Worker RESULT, prior reviewer output, `current/review-packet.md`, or historical review notes. You may read the canonical DH-017 plan, the implementation request, actual changed code/tests, and directly relevant existing modules/tests. Preserve the dirty worktree. No writes, installs, network, credentials, provider calls, Git mutation, or production actions.

## Product-level question

Does the implementation ensure that a generated set becomes visible only after the complete durable member join, exact catalog hard-link + catalog-directory fsync, and exact internal Operation success result hard-link + receipts fsync—while all crash/drift shapes remain hidden or fail closed—without widening public writer authority or adding unnecessary machinery?

## Primary files

- `packages/world-project/src/generated-set-visible-commit.ts`
- `packages/world-project/src/generated-set-visible-commit.test.ts`
- `packages/world-project/src/generated-set-hidden-cas-writer.ts`
- `packages/world-project/src/generated-artifact-publication.ts`

## Directly relevant context

- `docs/project-harness/tasks/DH-017/implementation-request-generated-set-visible-commit.md`
- `docs/project-harness/tasks/DH-017/plan.md`, especially generated-record join and publication ordering
- generated-set candidate/publication/eligibility/admission/intent/publishing/hidden-CAS modules and tests
- generated artifact records/layout/storage preflight/inspector modules and tests
- Generation state/record journal, safe filesystem, data-root/lease, OperationJournal public/internal-kind classification and tests
- `packages/world-project/src/index.ts`

## Mandatory review questions

1. Is the original hidden evidence an actual runtime authority bound to the same live root/lease/plan/intent/current publishing head, with forged/copy/cross-root/cross-lease/stale evidence rejected before catalog/result mutation?
2. Before catalog and again before result, is the full durable cross-record join rebuilt from stable no-follow reads—including bytes/content/by-bytes/provenance/set/intent—and does it reject same-bytes replacement inodes where the frozen protocol requires inode lineage rather than merely byte equality?
3. Is publication order exact and crash-closed: staged catalog + attempt fsync → catalog hard-link + catalog dir fsync → full rejoin → staged result + attempt fsync → result hard-link + receipts fsync → full final join?
4. Is catalog-only still hidden, result-only always recovery-required, and exact catalog-only resume deterministic without overwriting or cleanup?
5. Do EEXIST/replay paths require exact canonical bytes and the protocol's same staged/final inode? Do symlink/wrong type/mode/body/identity/extra-name drifts retain evidence and fail closed?
6. Do the surgical helper exports preserve package-internal authority, or do they create a raw writer/bypass/reusable capability? Does `index.ts` remain closed and public `OperationJournal` still reject both internal kinds?
7. Are tests meaningful fault/adversarial proofs rather than tautologies? Identify missing counterexamples that could change the verdict.
8. Is the implementation materially simpler than a new generic transaction/recovery framework while still satisfying the actual contract?

## Verification

Run focused tests and typecheck if useful and read-only in effect. You may run full tests if proportionate. Report exact commands/results. Do not trust Worker-reported gates.

## Verdict format

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 findings with exact file/line evidence and minimal required change
- checks and counterexample coverage
- tests actually run
- boundary attestation

P0/P1 findings must be reported immediately to the Operator before completing the bounded review. If none remain, explicitly state P0/P1/P2 = 0.
