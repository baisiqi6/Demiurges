# DH-017 limited-fresh implementation review — intent-to-publishing transition

## Context mode and role

Use `limited-fresh` context: this is a new read-only Reviewer session, separate
from the writable Worker. Read the current canonical plan and current code; do
not rely on prior reviewer verdicts or the Worker conclusion. This slice is
durability-sensitive, but the user explicitly prefers first principles,
Occam's razor, and the smallest mechanism that covers real failure modes.

Return one verdict: `APPROVE`, `CHANGES_REQUESTED`, or `BLOCKED`, with P0-P3
findings. A finding must include exact evidence, real impact, a minimal
counterexample, and the smallest correction. Do not invent a finding merely to
appear strict.

## Bottom-level goal

After an exact internal `artifact.publish-generated-set` intent is already
durable and has taken over the Generation's reserved two receipt slots as
`actual intent 1 + pending result 1`, persist exactly one Generation
`publishing={operationId,artifactSetDigest}` record/head. The resulting durable
head is the sole handoff to the later public-CAS slice.

This implementation must stop before public Artifact CAS/catalog/result writes
and must not introduce a generic transaction/recovery framework.

## Canonical authority

Read these current files:

- `docs/project-harness/tasks/DH-017/plan.md`, especially the intent-first rule,
  capacity handoff, Generation state payloads, and acceptance around lines
  255-286, 432-450, 685.
- `docs/project-harness/tasks/DH-017/implementation-request-generated-set-publishing-transition.md`
- `packages/world-project/src/generated-set-publishing-transition.ts`
- `packages/world-project/src/generated-set-publishing-transition.test.ts`
- `packages/world-project/src/generation-state.ts`
- `packages/world-project/src/generation-state.test.ts`
- `packages/world-project/src/generation-record-journal.ts`
- `packages/world-project/src/generation-record-journal.test.ts`
- `packages/world-project/src/generated-set-intent-writer.ts`
- `packages/world-project/src/generated-set-publication-eligibility.ts`
- `packages/world-project/src/generated-set-admission.ts`
- `packages/world-project/src/data-root-capacity.ts`
- `packages/world-project/src/data-root-capacity-inspection.ts`
- `packages/world-project/src/generated-artifact-publication.ts`
- `packages/world-project/src/generated-set-storage-preflight.ts`
- `packages/world-project/src/index.ts`

You may read directly imported package-local helpers when necessary to resolve a
real ambiguity. Do not read prior DH-017 reviewer verdicts or review narratives.

## Review questions

1. Is the implementation truly one narrow durable bridge, or did it duplicate
   Journal/capacity/transaction authority?
2. Before the first `.record.next` write, does it independently revalidate the
   origin-valid admitted intent, exact plan/eligibility, live root/lease,
   validating chain/candidates, staged+receipt same inode/body, result/catalog
   absence, exact receipt classification, and capacity takeover? Identify any
   caller field or count that is trusted without a durable join.
3. Is `validating -> publishing` the only newly legal transition, with exact
   payload codec and no accidental successor/public mutation?
4. Does it really have one-shot/replay-safe mutation semantics? Distinguish
   in-memory capability consumption from the fact that a durable publishing
   head or pending Journal state may itself prevent replay. Do not require a
   new WeakSet if the existing durable authority already makes replay safe.
5. At every Journal fault stage, is the evidence preserved and public CAS still
   untouched? Is the no-witness `.record.next` fail-closed behavior accurately
   represented rather than falsely claimed as automatic convergence?
6. Are the tests validating real behavior rather than only source strings or
   Worker claims? Is any meaningful counterexample missing?
7. Can any code/state/test be removed or simplified without weakening the real
   authority and crash boundary?

## Non-goals and mutation boundary

- No edits. No commit/push/merge/deploy, network, Keychain, provider request,
  real generation, production Coordinate/MultiNexus/Discord action.
- Do not ask for public CAS/catalog/result, startup convergence, `verified`, or
  a generic framework in this review; those are later slices.
- Existing dirty worktree is expected. Observe only; preserve it.

## Independent Operator evidence

The Operator, not the Worker, ran:

`bun test packages/world-project/src/generated-set-publishing-transition.test.ts packages/world-project/src/generation-state.test.ts packages/world-project/src/generation-record-journal.test.ts`

Result: `40 pass / 0 fail / 259 expect()`.

Worker-reported full gates (`941 pass`, typecheck/build/validate/doctor) are
claims to cross-check against code shape; the Operator will rerun full gates
after review and must not treat them as approval.

## Required output

- context mode rationale;
- P0/P1/P2/P3 findings, if any;
- explicit answers to the seven review questions;
- exact verdict and `may_advance: yes|no`;
- boundary attestation: read-only/no Git mutation/no external side effect.
