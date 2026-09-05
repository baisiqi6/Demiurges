# DH-017 Phase 3 implementation request — hidden generated-set CAS writer

## Role and objective

You are the writable coding Worker for one bounded DH-017 slice in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Starting only from the already durable exact generated-set Operation intent and
the already durable exact Generation `publishing={operationId,artifactSetDigest}`
head, write the complete generated set into hidden immutable CAS namespaces:

`bytes -> content + by-bytes -> provenance -> set`.

This slice must stop before the only visibility commit (`artifacts/catalog/...`)
and before the Operation success result. A crash may leave exact hidden CAS
evidence, but must never make a generated Artifact visible.

## Product invariant and simplicity boundary

The real problem is a small ordered immutable writer, not a general transaction
system:

`publishing head + exact durable intent -> complete hidden CAS -> later catalog/result commit`.

- Reuse the existing publication plan, candidate/storage join, publishing
  transition evidence, live root/lease, canonical record codecs, exact layout,
  and safe filesystem helpers.
- Prefer direct, deterministic content-addressed operations and the existing
  Operation attempt as the only staging authority. Do not add a repository,
  registry, transaction manager, recovery framework, generic CAS abstraction,
  or new state machine.
- Existing exact targets are idempotent replay. Existing drift, symlink, wrong
  type/mode/body/identity, foreign attempt evidence, or a race that does not end
  in the exact desired file fails closed and preserves evidence.
- Do not add defensive machinery for hypothetical future multi-generation or
  garbage collection. Startup convergence and visibility commit are later
  slices.

## Required behavior

1. Add one package-internal writer module, preferably
   `generated-set-hidden-cas-writer.ts`, with one synchronous mutation entry.
   It must require the same live `OpenedDataRoot` and `DataRootWriterLease`, the
   exact `GenerationIntentV1`, origin-valid `GeneratedSetPublicationPlanV1`, and
   origin-valid `GeneratedSetPublishingTransitionEvidenceV1`. Forged/copy,
   cross-root, cross-lease, cross-intent, cross-plan, wrong generation/provider/
   operation/set/binding, or a non-current publishing head fails before the
   first CAS mutation. The durable publishing head, not a caller boolean, is
   the mutation authority.
2. Before the first write/link, re-read and prove:
   - the Generation chain currently ends at the exact publishing sequence and
     record digest carried by transition evidence;
   - staged and receipt Operation intents remain same-inode exact canonical
     binding files; result and catalog remain absent;
   - publication plan/candidate origin, private candidate files, inspector
     records, and current target observations are exact;
   - the root/lease and admitted 24-hex Operation attempt remain live/exact.
   Extend the publishing-transition module with the smallest package-internal
   origin/provenance accessor only if needed. Do not expose it from `index.ts`.
3. Publish in this exact phase order, completing all members of a phase before
   the next phase:
   - all bytes CAS at `artifacts/sha256/<contentDigest>`;
   - for each unique content, its content record and exact by-bytes pointer;
   - all provenance records;
   - the set record.
   Private candidate bytes are the trusted source for bytes CAS. Canonical
   record/pointer bytes must be derived from the origin-valid plan, never from
   caller-provided bytes/paths/arrays.
4. Each final target is immutable and no-replace. If absent, use the smallest
   crash-safe protocol consistent with the canonical plan: file contents are
   fsynced before publication and the containing directory is fsynced after a
   no-replace link/name becomes durable. The by-bytes pointer specifically must
   use an exact staged canonical pointer file followed by a no-replace hard-link
   and parent fsync. Any deterministic staging names must live only in the
   already admitted Operation attempt, have a closed bounded grammar/count, and
   remain covered hidden evidence for the later startup slice. Do not invent a
   second staging root.
5. Before publishing a new content record, classify its by-bytes pointer:
   existing exact means idempotent reuse; existing drift means fail before any
   new record/provenance/set mutation; absent permits content record then pointer
   publication. A pointer race is accepted only if the resulting target is the
   exact canonical pointer; otherwise fail closed. A hidden orphan content
   record is acceptable, but two public content truths are not.
6. After every target publication, re-open with no-follow semantics and verify
   exact type/mode/body/digest/identity as appropriate before advancing. Recheck
   the live root/lease between mutations. Do not delete private candidates or
   attempt evidence in this slice.
7. Return a deep-frozen package-internal evidence object containing only safe
   identities/digests and the completed hidden phase. It must not contain raw
   bytes, fd, absolute path, URL, credential, provider request, raw journal, or
   writer capability. No new symbol may be exported from
   `packages/world-project/src/index.ts`.

## Focused counterexamples

- Marble writes two members in exact phase order; Hunyuan writes one. Before,
  during, and after every fault hook, catalog/result remain absent and list/
  serve has no new visibility authority.
- Exact pre-existing bytes/content/by-bytes/provenance/set files are reused;
  mixed absent/existing exact targets converge without overwrite.
- Same bytes shared across Marble/Hunyuan reuse one bytes/content/by-bytes truth
  while retaining distinct provenance/set records.
- Existing pointer-to-second-descriptor, missing record behind pointer,
  content/descriptor drift, symlink/wrong type/mode, private candidate inode or
  bytes replacement, publishing head drift, intent inode/body drift, result or
  catalog appearance, cross-root/lease/plan/evidence all fail before the next
  mutation and preserve evidence.
- Fault hooks cover file write/fsync, final hard-link, and parent-directory fsync
  for bytes/content/pointer/provenance/set as actually used by the implementation.
  Each observed partial is either exact hidden evidence or fail-closed evidence;
  none creates catalog/result.
- Attempt staging entry count/name grammar is bounded; extra/foreign/wrong-type
  staging evidence fails closed rather than being deleted or ignored.
- Source scan proves no package-root export and no catalog/result/startup/
  verified/Gateway/UI/World/provider/generic-framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-set-hidden-cas-writer.ts`
- new focused test beside it
- minimal package-internal provenance accessor in
  `packages/world-project/src/generated-set-publishing-transition.ts` and test
- minimal package-internal current-observation helper in
  `packages/world-project/src/generated-set-storage-preflight.ts` and test only
  if composing the existing inspector is otherwise impossible
- minimal `safe-filesystem.ts` helper and test only if an existing primitive
  cannot express exact no-replace hard-link publication; prefer current helpers

If correctness requires catalog/result publication, `verified`, startup
recovery, a public `ArtifactStore` bypass, package-root export, or a generic
transaction/CAS/recovery framework, stop and report BLOCK rather than widening
the slice.

## Forbidden actions

- No network, Keychain, credentials, provider request, real generation, public
  catalog/result mutation, Git mutation, commit/push/merge, deploy, or production
  Coordinate/MultiNexus/Discord action.
- Preserve every unrelated dirty worktree change. Do not clean/reset/stash.

## Workflow and verification

1. Run the exact EXharness `accept` command supplied by the Operator first and
   emit a concise ACCEPT with understood scope/files/non-goals.
2. Inspect the canonical plan and current code, then implement the smallest
   direct mechanism. If an allowed helper is unnecessary, do not add it.
3. Run focused tests, full serial tests, root typecheck/build, scoped/global
   diff checks, Harness validate and doctor.
4. Return a Chinese structured RESULT with exact paths, ordered mutation and
   fsync protocol, fault/counterexample evidence, gate counts, model/session
   identity, boundaries, branch/HEAD, and residual risks. Worker RESULT is not
   reviewer approval.
