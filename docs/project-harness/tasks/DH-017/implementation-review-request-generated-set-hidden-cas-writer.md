# DH-017 limited-fresh implementation review — hidden generated-set CAS writer

## Context mode and role

Use `limited-fresh`: this is a new read-only Reviewer session, independent from
the writable Worker. Read the current canonical plan and current code/diff; do
not read the Worker RESULT or prior reviewer verdicts. The slice is durability
sensitive, but the user explicitly wants first principles, Occam's razor, and
no defensive-code pile around small hypothetical risks.

Return one verdict: `APPROVE`, `CHANGES_REQUESTED`, or `BLOCKED`, with P0-P3
findings. Each finding needs exact evidence, real product impact, a minimal
counterexample, and the smallest correction. Do not manufacture findings merely
to look strict.

## Bottom-level goal

Once the exact generated-set Operation intent and exact Generation `publishing`
head are durable, write the complete set to immutable but still hidden
content-addressed namespaces in this order:

`all bytes -> all content/by-bytes -> all provenance -> set`.

A crash may leave exact hidden evidence. It must not create catalog visibility
or an Operation success result. This is one bounded writer, not a transaction,
repository, registry, or general recovery framework.

## Canonical authority and review surface

Read:

- `docs/project-harness/tasks/DH-017/plan.md`, especially lines 255-290,
  500-524, and 702-714
- `docs/project-harness/tasks/DH-017/implementation-request-generated-set-hidden-cas-writer.md`
- `packages/world-project/src/generated-set-hidden-cas-writer.ts`
- `packages/world-project/src/generated-set-hidden-cas-writer.test.ts`
- `packages/world-project/src/generated-set-publishing-transition.ts`
- `packages/world-project/src/generated-set-publishing-transition.test.ts`
- `packages/world-project/src/generated-artifact-publication.ts`
- `packages/world-project/src/generated-set-storage-preflight.ts`
- `packages/world-project/src/generated-set-candidate-plan.ts`
- `packages/world-project/src/generated-artifact-records.ts`
- `packages/world-project/src/generated-artifact-layout.ts`
- `packages/world-project/src/generation-record-journal.ts`
- `packages/world-project/src/safe-filesystem.ts`
- `packages/world-project/src/data-root.ts`
- `packages/world-project/src/index.ts`

You may read directly imported package-local helpers or focused tests only when
necessary to resolve a concrete ambiguity. Do not read historical DH-017 review
requests/verdicts, the Worker session/RESULT, or current review packet narrative.

## Review questions

1. Does the implementation directly solve the hidden immutable-writer problem,
   or did it add unnecessary states/frameworks? Identify code that can be
   removed or merged without weakening real failure boundaries.
2. Before the first CAS mutation, does it derive authority from the exact live
   root/lease, origin-valid plan/transition, current publishing chain head,
   same-inode intent, absent result/catalog, private candidates, current target
   observations, and closed Operation attempt? Is any caller field trusted?
3. Is phase ordering actually global across Marble members, and is same-content
   many-to-one behavior correct for Marble/Hunyuan?
4. Are all final writes no-replace and durable in the right order? For bytes,
   records, by-bytes pointers, provenance, and set, test exact replay, EEXIST
   races, symlink/wrong type/mode/body/identity, parent creation/fsync, and
   post-publication reopening. Do not demand machinery for races excluded by the
   single live writer lease unless foreign evidence can violate a real boundary.
5. Does by-bytes uniqueness close both directions: pointer existing exact only
   if its content record is exact, pointer absent publishes record then pointer,
   and pointer drift prevents a second descriptor/public content truth?
6. At every test fault hook, are partials genuinely hidden/exact and are
   catalog/result/state untouched? Are the hooks placed after the actual
   durability operations they claim to represent?
7. Is attempt staging grammar/count complete and bounded without rejecting legal
   existing intent evidence or silently accepting foreign entries? Is keeping
   staged files for later startup recovery the simplest safe choice?
8. Does returned evidence/provenance avoid becoming an unverified authority for
   the later catalog/result commit? The next slice must still rebuild the
   published join; do not require that implementation in this slice.
9. Are tests behavioral and proportionate, or is the 54 KiB focused fixture
   hiding brittle/source-string-only assertions or excess defense?

## Non-goals and boundary

- No edits. No commit/push/merge/deploy, network, Keychain, provider request,
  real generation, production Coordinate/MultiNexus/Discord action.
- Do not request catalog/result commit, `verified`, startup recovery, list/serve,
  cleanup, generic CAS/transaction/recovery abstractions, or package-root export;
  they are later slices.
- Existing dirty worktree is expected. Preserve it and observe only.

## Independent Operator evidence

The Operator, not the Worker, ran:

`bun test packages/world-project/src/generated-set-hidden-cas-writer.test.ts packages/world-project/src/generated-set-publishing-transition.test.ts`

All 17 visible focused tests passed with exit code 0. The Operator will rerun
full serial tests/typecheck/build/Harness gates after review; do not treat Worker
claims as approval.

## Required output

- context-mode rationale;
- P0/P1/P2/P3 findings, if any;
- explicit answers to the nine review questions;
- exact verdict and `may_advance: yes|no`;
- boundary attestation: read-only, no Git mutation, no external side effect.
