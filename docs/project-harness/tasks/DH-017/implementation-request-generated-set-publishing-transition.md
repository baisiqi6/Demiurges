# DH-017 Phase 3 implementation request — intent-to-publishing transition

## Role and objective

You are the writable coding Worker for one bounded DH-017 slice in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Consume the already admitted, durable generated-set Operation intent evidence,
revalidate the exact `validating + matching intent/no result` truth and its
capacity takeover, then append/fsync exactly one Generation
`publishing={operationId,artifactSetDigest}` record/head.

This slice stops before the first public Artifact CAS/catalog/result mutation.

## Product invariant and simplicity boundary

The real problem is not a generic cross-journal transaction. It is one narrow,
crash-safe bridge:

`durable exact Operation intent -> capacity takeover still exact -> durable
Generation publishing head -> later CAS slice`.

- Reuse `GenerationRecordJournal` for record/witness/head durability and the
  existing intent-writer provenance, publication eligibility join, receipt
  inspection, and shared capacity calculator.
- Do not create a transaction manager, recovery registry, state-machine
  framework, repository, provider adapter, or second capacity model.
- Same-process serialization is synchronous and the live Data Root writer lease
  is the existing cross-process writer authority. A JavaScript critical section
  is not crash atomicity.
- Any failure preserves durable evidence and fails closed. Startup convergence
  and public publication are later slices.

## Required behavior

1. Add one package-internal transition module, preferably
   `generated-set-publishing-transition.ts`, with one live mutation entry. It
   must require the same live `OpenedDataRoot` and `DataRootWriterLease`, the
   exact `GenerationIntentV1`, the origin-valid publication plan/eligibility,
   and the origin-valid `AdmittedGeneratedSetIntentEvidenceV1` produced by the
   previous slice. Forged/copy/replay/cross-root/cross-lease/cross-intent/
   cross-plan/cross-eligibility inputs fail before Generation mutation.
2. Before consuming the transition authority, re-run the existing read-only
   durable checks rather than trusting fields copied from the evidence:
   - the Generation full chain and birth anchor still end at the exact
     `validating` sequence/digest represented by eligibility;
   - all private candidates and storage observations still match the plan;
   - staged and receipt intent names still exist as exact `0600` regular files,
     same inode/body, with the plan's canonical binding bytes; attempt token/path
     remains the admitted 24-hex flat attempt;
   - result and catalog remain absent;
   - receipt inspection is still `terminal-installed`, contains the exact
     matching generated-set intent/no result and no conflicting/extra internal
     evidence, and public counts have not drifted;
   - shared capacity remains `ready` with generation reservation `0`, requested
     entries `0`, and actual intent `1` + pending result `1` preserving the
     evidence's exact effective count.
3. Extend the existing Generation state codec only as much as needed:
   - add exact state payload
     `publishing={operationId,artifactSetDigest}`;
   - allow only `validating -> publishing` in this slice;
   - validate canonical operation-id / 64-lowercase-hex digest shapes;
   - keep `publishing` a stop state here: no `verified`, CAS, result, or recovery
     transition is implemented in this slice.
4. After all read-only checks, consume the transition authority once and call
   the existing `GenerationRecordJournal.append()` with the exact plan-derived
   payload and caller-supplied canonical timestamp. Re-read current state and
   prove the returned/current record is the same exact `publishing` record.
   Record/witness/head ordering, fsyncs, inode replacement checks, and bounded
   physical caps remain owned by the existing Journal; do not duplicate them.
5. Return only a deep-frozen package-internal evidence object sufficient for the
   next public-CAS slice. Keep root/lease/plan/journal authority module-private.
   No raw writer, fd, path list, bytes, URL, credential, or provider request may
   escape. No new symbol may be exported from `packages/world-project/src/index.ts`.

## Focused counterexamples

- Happy path proves `validating` remains current, durable intent/attempt inode
  and body remain exact, capacity stays `2 == actual intent 1 + pending result
  1`, one `publishing` record/head becomes durable, and every public CAS/catalog/
  result target is still absent.
- Forged/copied/replayed/cross-root/cross-lease/cross-intent/cross-plan/
  cross-eligibility admitted evidence performs zero Generation mutation; wrong
  inputs do not accidentally consume the valid authority.
- Drift the validating head, private candidate inode/bytes, birth anchor,
  staged/receipt intent inode/body/mode/link relation, attempt shape, result,
  catalog, receipt counts, conflicting/extra internal receipt, or effective
  capacity: fail before `.record.next` creation and preserve all evidence.
- Exercise existing Generation journal fault hooks at next-file fsync, witness
  fsync, final link/fsync, head.next, head rename/fsync, and pending cleanup. The
  only supported recovery is the Journal's exact same-inode pending protocol;
  no public CAS/catalog/result mutation occurs at any boundary.
- State codec rejects `publishing` from every state except `validating`, unknown
  keys, malformed operation ID/digest, payload drift, second append, and terminal
  successor.
- Source scan proves no package-root export and no ArtifactStore/CAS/catalog/
  result/startup/Gateway/UI/World/provider/generic-framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-set-publishing-transition.ts`
- new focused test beside it
- minimal `packages/world-project/src/generation-state.ts` and test changes for
  the exact `publishing` payload/state/transition only
- minimal `packages/world-project/src/generated-set-intent-writer.ts` and test
  provenance extension only if the transition otherwise cannot revalidate the
  original eligibility/intent without copying authority
- minimal package-internal receipt/capacity inspection helper only if the
  existing inspector cannot distinguish the exact matching intent; prefer
  composing current functions

If correct implementation requires public CAS/catalog/result writes, startup
recovery, package-root public `OperationJournal` expansion, a new generic
transaction/recovery framework, or broader state-machine work, stop and report
BLOCK.

## Forbidden actions

- No network, Keychain, credentials, provider requests, real generation, Git
  mutation, commit/push/merge, deploy, or production Coordinate/MultiNexus/
  Discord action.
- Preserve every unrelated dirty worktree change. Do not clean/reset/stash.

## Workflow and verification

1. Run EXharness `accept DH-017 zcode-glm53-publishing-transition-worker
   29FEEDAE-B7F6-458D-ACBB-34F6587B48B7 --branch agent/codex/DH-017` first and
   report concise ACCEPT.
2. Implement surgically. If an allowed helper is unnecessary, do not add it.
3. Run focused tests, proportional/full serial tests, root typecheck/build,
   scoped/global diff checks, Harness validate and doctor.
4. Return Chinese structured RESULT with exact paths, precheck/consume/append
   order, durable fault evidence, capacity arithmetic, exact gate counts,
   boundaries, branch/HEAD and residual risks. Worker RESULT is not reviewer
   approval.
