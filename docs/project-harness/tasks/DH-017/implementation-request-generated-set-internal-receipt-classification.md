# DH-017 Phase 3 implementation request: generated-set internal receipt classification

## Role and objective

You are the writable coding Worker for this bounded slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Teach the existing read paths to recognize and validate the exact internal
`artifact.publish-generated-set` receipt kind while keeping every package-root
`OperationJournal` mutation/authority entrance closed to it.

This is deliberately a classification slice. It does not admit an internal
Operation, reserve or transfer capacity, mint a capability, create staging,
write CAS/catalog/result evidence, append Generation state, or change startup
recovery ordering.

## Product intent and simplicity boundary

- A future generated-set intent must not look like corruption to bounded receipt
  enumeration, capacity inspection, or public binding listing.
- Recognizing an internal receipt is not permission to create, recover, finalize,
  or clean it through the public `OperationJournal` facade.
- Reuse the exact codecs already implemented in
  `generated-artifact-publication.ts`; do not copy its binding/result rules.
- Extend the existing two-way classifier with one direct third variant. Do not
  introduce a registry, plugin system, generic codec framework, transaction,
  repository, or new error hierarchy.

## Required behavior

1. In `operation-journal.ts`, extend the private classified receipt union with
   `visibility: "internal-generated-set"` carrying the exact
   `GeneratedSetPublicationBindingV1`.
2. The private classifier must try the existing public binding, namespace
   internal binding, then generated-set internal binding, using the existing
   exact codecs. Malformed/unknown evidence remains
   `OPERATION_RECOVERY_REQUIRED`.
3. Classified result validation must call
   `requireGeneratedSetPublicationResult` for the new variant.
4. `listBindings()` must validate generated-set intent/result evidence but never
   return the internal binding in its public result.
5. `data-root-capacity-inspection.ts` must recognize the same third variant,
   validate its terminal result, count its physical intent/result entries and
   pending result reservation exactly as before, and include it in
   `internalOperationCount`. Namespace state validation remains exact: the
   namespace operation is still the only internal receipt tied to namespace
   installation, while additional valid generated-set internal receipts are
   allowed.
6. Keep `OperationJournal.readIntent`, `readResult`, `admit`, `beginRecovery`,
   `inspectExistingAttempts`, `confirmExistingTerminal`, `finalizeSuccess`,
   `finalizeAborted`, and `cleanupAttempt` unable to accept or mint authority for
   `artifact.publish-generated-set`. Do not widen `OperationBinding`,
   `AdmittedOperation`, `OperationAdmission`, `OperationSingleFlight`, or the
   package-root export surface.
7. No production path may write a generated-set intent/result in this slice.

## Focused counterexamples and acceptance

Cover at minimum:

- exact generated-set intent without result: capacity inspection counts the
  physical intent and one pending result reservation; internal count increments;
- exact intent plus exact success result and exact aborted result each validate,
  with no pending reservation after a result;
- `OperationJournal.listBindings()` returns only public bindings while validating
  the hidden generated-set receipt;
- generated-set result without intent, binding/result drift, unknown key,
  malformed canonical bytes, and a binding under the wrong filename fail closed;
- coexistence of namespace internal, generated-set internal, and public receipts
  has exact counts and does not change namespace-state classification;
- all package-root authority/mutation entrances reject a structural or typed
  generated-set binding/operation before receipt, staging, catalog, or CAS
  mutation; add the narrowest executable matrix that proves this without
  manufacturing a new public API;
- no new export from `packages/world-project/src/index.ts` and no dependency on
  startup, Generation state writer, CAS publisher, Gateway, UI, or World.

## Allowed modifications

- `packages/world-project/src/operation-journal.ts`
- `packages/world-project/src/operation-journal.test.ts`
- `packages/world-project/src/data-root-capacity-inspection.ts`
- `packages/world-project/src/data-root-capacity-inspection.test.ts`
- only a minimal package-internal type/codec export from
  `generated-artifact-publication.ts` if the existing exports are insufficient
  (they are expected to be sufficient)

If correct implementation requires a generated-set writer, capability,
single-flight change, capacity reservation authority, startup mutation, public
CAS, or package-root export, stop and report a blocker rather than expanding the
slice.

## Forbidden actions

- No network, Keychain, credential, provider request, real generation, public
  CAS, Git mutation, commit/push/merge, deploy, or production
  Coordinate/MultiNexus/Discord mutation.
- Preserve all unrelated dirty worktree changes.
- Test fixtures may create isolated temporary Data Roots and exact receipt files
  only.

## Verification and RESULT

Run focused tests first, then the proportional/full test suite (serial mode if
the known lease tests contend), typecheck, build, `git diff --check`, Harness
validate and doctor. Return a Chinese structured RESULT with exact files,
classifier behavior, public-denial evidence, tests/gate counts, boundaries,
branch/HEAD/status, and any residual risk. Worker RESULT is not approval.
