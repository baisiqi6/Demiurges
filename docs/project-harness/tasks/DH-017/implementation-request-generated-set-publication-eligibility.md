# DH-017 Phase 3 implementation request — durable publication eligibility join

## Role and objective

You are the writable coding Worker for one bounded DH-017 slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Build the smallest read-only join that proves an origin-checked
`GeneratedSetPublicationPlanV1` is still the exact publication truth of the
selected Generation's current durable `validating` head.

This slice produces immutable eligibility evidence only. It does **not** mint
the later one-shot admission capability, reserve capacity, enter a single-flight,
write an Operation intent, append `publishing`, write CAS/catalog/result files,
or change startup recovery.

## Bottom-level product intent

- A paid provider result may become public only if the current durable Generation
  chain—not a stale caller object—still proves the same provider/job/request,
  ordered final candidates, inspected bytes identities, and artifact set.
- Reuse the existing chain decoder, candidate-plan join, storage revalidation,
  and publication-plan origin. Do not create a second lifecycle codec or a
  generic evidence framework.
- Keep the result read-only and repeatably revalidatable. The later capacity
  slice will convert it into a one-shot mutation authority.

## Required behavior

1. Add a package-internal `GeneratedSetPublicationEligibilityV1` containing only
   safe exact identities needed downstream: generation/provider, validating
   sequence and record digest, publication operation/binding digest, and artifact
   set digest. Deep-freeze it and track its runtime origin privately.
2. The mint/revalidation path must require the same live `OpenedDataRoot` and
   live `DataRootWriterLease`, an exact `GenerationIntentV1`, and an
   origin-checked publication plan that was derived for that exact root.
3. Read the Generation through `GenerationRecordJournal`'s existing bounded
   full-chain decoder. Add only the narrowest package-internal read-only chain
   accessor if necessary; do not expose raw write/recovery authority from the
   package root.
4. Require the durable head to be exactly `validating`. Locate its validated
   `remote_bound` ancestor and prove the current `ActiveDownloadPayloadV1`
   byte-for-byte corresponds to the origin candidate plan:
   - same generation/provider and durable remote job/request authority;
   - provider-exact ordered roles/cardinality;
   - every member is final `candidate` with the same candidate filename,
     file identity, content digest, byte length, format, element count, canonical
     bounds, inspector descriptor and descriptor digest;
   - the candidate plan's content/provenance/set records and the publication
     plan's binding/catalog identities remain the same origin-checked truth.
   Prefer one small pure state-binding checker beside the candidate-plan logic
   instead of copying its cross-record rules into the new module.
5. Prove the durable birth anchor for the selected Generation: `intent.json`,
   initial admitted record and exact catalog pointer must bind the same intent
   and admitted-record digest. This is a selected-generation check, not the
   later all-generation capacity scan. Reuse existing birth codecs and stable
   readers; do not change `GenerationBirthJournal` policy.
6. Revalidation must repeat the live root/lease, durable chain head, birth
   anchor, publication-plan origin/storage snapshot, and state-to-candidate
   equality checks. A forged/copied eligibility object, cross-root/cross-lease
   use, stale head, replaced intent/catalog/record/candidate, or replay after
   later state advancement must fail `GENERATION_RECOVERY_REQUIRED` without
   mutation.
7. Do not export the new module, eligibility evidence, chain accessor, or test
   seams from `packages/world-project/src/index.ts`.

## Focused counterexamples

Cover at minimum:

- valid Marble and Hunyuan durable chains through `validating` mint and
  revalidate exact deterministic eligibility;
- `polling`, `outputs_ready`, and incomplete `downloading` heads cannot mint;
- a publication plan originating from another root, forged/copy plan, wrong
  intent/provider/job/request, reordered/changed candidate, filename/inode/
  descriptor/content/set drift all fail before any mutation;
- mint at `validating`, then append or replace durable head/record evidence:
  revalidation rejects the stale eligibility;
- missing/replaced/noncanonical catalog pointer or intent, wrong admitted record
  binding, fake/cross lease, and copied/forged eligibility fail closed;
- source scan proves no package-root export and no dependency on capacity,
  Operation mutation, CAS writer, startup, Gateway, UI, or World.

## Allowed modifications

- new `packages/world-project/src/generated-set-publication-eligibility.ts`
- new focused test beside it
- minimal package-internal read-only chain accessor in
  `generation-record-journal.ts` and focused regression if needed
- minimal package-internal state-binding/origin-for-root helper in
  `generated-set-candidate-plan.ts` or `generated-artifact-publication.ts`, with
  focused tests

If this requires capacity admission, an internal Operation writer,
`OperationSingleFlight` refactor, public CAS/catalog mutation, startup mutation,
or package-root export, stop and report a blocker rather than widening scope.

## Forbidden actions

- No network, Keychain, credential access, provider request, real generation,
  public CAS mutation, Git mutation, commit/push/merge, deploy, or production
  Coordinate/MultiNexus/Discord mutation.
- Preserve every unrelated dirty worktree change.

## Workflow and verification

1. Before editing, run EXharness `accept` as the assigned Worker and report a
   concise ACCEPT with understood scope/files/non-goals.
2. Make surgical changes; avoid registries, repositories, builders, generic
   transactions, or duplicated validators.
3. Run focused tests first, then proportional/full serial tests, root typecheck,
   build, scoped/global diff check, Harness validate and doctor.
4. Return a Chinese structured RESULT with exact changed files, identity/join
   behavior, counterexamples, gate counts, boundaries, branch/HEAD/status, and
   residual risks. Worker RESULT is not reviewer approval.
