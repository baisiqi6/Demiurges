# DH-017 independent implementation review — durable publication eligibility

## Reviewer role

Review the current implementation in
`/Users/Admin/projects/WorkTrees/Demiurges-DH-017` as an independent engineering
Reviewer. Begin from the product invariant, not the Worker report or a checklist:

> public generated artifacts may only advance from the exact current durable
> `validating` Generation truth; a stale/cross-root/forged in-memory plan must
> never become mutation authority.

Use first principles and Occam's razor. Demand evidence for real integrity and
authority boundaries, but do not reward redundant inode checks or framework
layers where immutable content-addressed bytes are already the canonical truth.

## Freshness and read boundary

- Read this request first, then the canonical DH-017 plan sections relevant to
  Generation chain, candidate/published join, and admission.
- Inspect the current implementation and tests listed below plus only their
  directly imported authority codecs.
- Do not read Worker RESULT, previous reviewer verdicts, current review packet,
  or unrelated progress/findings notes.
- Read-only only: no source edits, network, credentials, provider calls, Git
  mutation, or production action. You may run focused tests/typecheck/diff check.

## Primary files

- `packages/world-project/src/generated-set-publication-eligibility.ts`
- `packages/world-project/src/generated-set-publication-eligibility.test.ts`
- `packages/world-project/src/generation-record-journal.ts`
- `packages/world-project/src/generation-state.ts`
- `packages/world-project/src/generated-set-candidate-plan.ts`
- `packages/world-project/src/generated-artifact-publication.ts`
- `packages/world-project/src/generated-set-storage-preflight.ts`
- directly relevant tests beside those modules

## Questions to answer

1. Does eligibility depend on the actual bounded durable chain and exact
   `validating` head, or can a structurally valid/stale plan bypass current
   Generation truth?
2. Is remote binding and every ordered final candidate tied to the existing
   candidate/storage/publication origin without duplicating or weakening codecs?
3. Is the selected Generation's birth anchor adequately proved? Distinguish:
   - evidence whose authority is canonical content/digest and therefore safely
     survives a byte-identical inode replacement;
   - hard-link/commit-pointer provenance where inode continuity is materially
     required. If same-byte replacement is unsafe, provide the smallest concrete
     counterexample and minimal correction.
4. Can forged/copied eligibility, a plan from another root, fake/cross lease,
   replaced/stale head, record drift, catalog/intent drift, candidate inode/bytes
   drift, provider/job/request/role/member drift pass revalidation?
5. Is the new `readValidatedChain()` a narrow read-only seam, and do all new
   symbols remain outside the package root and runtime composition?
6. Does this slice remain read-only and minimal—no hidden capacity,
   single-flight, Operation, CAS/catalog write, startup, Gateway/UI/World or
   generic framework behavior?
7. Are tests proportional and do they prove mutation-free rejection rather than
   only happy-path shapes? Flag material over-complexity as P2, not taste alone.

## Required verdict

Return:

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 findings with exact file/line evidence and a minimal counterexample
- checks against the product invariant and simplicity boundary
- tests/typecheck/diff commands personally run and exact results
- read-only/freshness/boundary attestation

Do not write the EXharness verdict yet; Operator will request that separately
after any required correction and independent gates.
