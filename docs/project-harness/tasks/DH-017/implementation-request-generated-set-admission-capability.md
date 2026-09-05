# DH-017 Phase 3 implementation request — generated-set admission capability

## Role and objective

You are the writable coding Worker for one bounded DH-017 slice in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Consume the approved read-only publication eligibility evidence to perform the
current MVP's exact Data Root capacity/single-flight preflight and mint a
package-internal, one-shot `GeneratedSetAdmissionCapability`.

This capability will be consumed by the next slice immediately before writing
the durable `artifact.publish-generated-set` intent. This slice itself performs
no durable mutation.

## First-principles and simplicity boundary

- Capacity must come from current durable receipts + current durable Generation
  truth, never from a caller counter.
- The current implemented product surface admits exactly the one born first
  Generation. If a second Generation/catalog entry or existing generated-set
  receipt is observed, fail closed. Do not build future multi-generation policy,
  a registry, a transaction manager, or startup recovery here.
- Same-process concurrency only needs one exact active admission per live writer
  lease. Cross-process exclusion already belongs to the Data Root writer lease.
  Do not refactor the public `OperationSingleFlight` merely to make names align.
- Authorization and consumption are synchronous and read-only. The next writer
  must consume and perform its first synchronous durable intent mutation without
  an `await` gap; document this contract rather than introducing locks.

## Required behavior

1. Add a package-internal `GeneratedSetAdmissionCapability` with private
   `WeakMap` authority and a closed result:
   - `{status:"authorized", capability}`; or
   - `{status:"capacity-reached"}`.
   The public capability body contains only a safe kind/operation identity (and
   optionally effective entry count); all authority stays in the WeakMap.
2. `authorizeGeneratedSetAdmission(root, lease, intent, publicationPlan,
   eligibility)` must:
   - require the same live root/lease and revalidate the exact eligibility;
   - require terminal-installed namespace;
   - boundedly inspect `receipts/generations/data`, `catalog`, and
     `birth-staging`, accepting exactly the selected Generation data directory,
     exactly its catalog pointer, and empty birth-staging; wrong type/symlink/
     extra/second-generation evidence is recovery-required;
   - call existing `inspectDataRootCapacity()` and require exactly the namespace
     internal Operation plus any valid public Operations, with no existing
     generated-set internal receipt. Do not trust only filenames;
   - require the selected publication plan's receipt intent, receipt result, and
     public catalog target to be absent. Existing matching evidence belongs to
     replay/recovery, not fresh admission;
   - call existing `calculateDataRootCapacity()` with the exact durable current
     Generation classification `{state:"validating",publicationEvidence:"none"}`
     and `request:"none"`. The Generation's already-held future publication
     reservation is exactly 2; do not request or double-count another 2;
   - return `capacity-reached` only for a valid, non-drifted snapshot whose
     effective entries exceed 2048. Any malformed/conflicting evidence is
     recovery-required.
3. Same live lease may have one active capability. Repeating authorization for
   the byte-exact same root/intent/plan/eligibility/snapshot returns the same
   capability; a competing different publication on that lease fails closed.
   This is the bounded synchronous single-flight for this slice.
4. `consumeGeneratedSetAdmissionCapability(...)` must be one-shot and must:
   - reject forged/copy/replayed/cross-root/cross-lease/cross-plan/cross-
     eligibility input;
   - mark the authority consumed before near-revalidation;
   - rerun eligibility, namespace/generation surface, target absence, receipt
     inspection and capacity calculation; require the exact snapshot and
     `canAdmit=true`;
   - return only the origin-checked publication plan (or an equally narrow
     internal admitted value) for the immediately following synchronous intent
     writer. It must not expose a reusable writer or raw journal authority.
5. After a failed consume, the old capability stays consumed/poisoned. A caller
   may request a new capability only after durable evidence is again valid; do
   not add cleanup or retry machinery.
6. No new symbol is exported from `packages/world-project/src/index.ts`.

## Focused counterexamples

- valid first Generation at boundary effective entries 2048 authorizes and
  consumes exactly once; 2049 returns capacity-reached before mutation;
- the calculated reservation remains 2, not 4, and public Operation receipt
  counts/pending-result reservations are included;
- exact same concurrent authorization returns the same capability; conflicting
  plan/eligibility on the same lease fails closed;
- after authorization, add/remove/replace a public receipt so counts/pending
  change, add a second generation/catalog entry, add birth-staging evidence,
  create expected publication intent/result/catalog, change the validating head,
  replace candidate/storage evidence, or close/reacquire lease: consume rejects
  with zero mutation and cannot be replayed;
- wrong-type/symlink/unknown entries and an exact generated-set receipt already
  present are recovery-required, not capacity-reached;
- forged/copied capability, plan or eligibility; fake/cross-root/cross-lease;
  and target-path drift all fail closed;
- source scan proves zero package-root export and no Operation mutation,
  state append, CAS/catalog/result writer, startup, Gateway/UI/World or generic
  framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-set-admission.ts`
- new focused test beside it
- the narrowest package-internal inspection helper in
  `data-root-capacity-inspection.ts` only if exact internal-kind counts cannot be
  established safely from the current return value; do not expose receipt bodies
  or writer authority
- minimal read-only helper/test seam in the approved eligibility/publication
  module if strictly necessary

If correct implementation needs to write an intent, append `publishing`, change
public `OperationJournal`/`OperationSingleFlight`, support multiple Generations,
or mutate CAS/catalog/startup, stop and report a blocker.

## Forbidden actions

- No network, Keychain, credentials, provider requests, real generation, Git
  mutation, commit/push/merge, deploy, or production Coordinate/MultiNexus/
  Discord action.
- Preserve every unrelated dirty worktree change.

## Workflow and verification

1. Run EXharness `accept` first and report concise ACCEPT.
2. Implement surgically; do not manufacture abstractions for future phases.
3. Run focused tests, proportional/full serial tests, root typecheck/build,
   scoped/global diff checks, Harness validate and doctor.
4. Return Chinese structured RESULT with exact paths, authority/capacity/
   concurrency semantics, counterexamples, gate counts, boundaries, branch/HEAD,
   and residual risks. Worker RESULT is not reviewer approval.
