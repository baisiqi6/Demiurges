# DH-017 Phase 3 implementation request — durable generated-set intent writer

## Role and objective

You are the writable coding Worker for one bounded DH-017 slice in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Consume the approved one-shot `GeneratedSetAdmissionCapability`, publish the
exact internal `artifact.publish-generated-set` Operation intent durably, and
prove that the Generation's pre-existing two-slot publication reservation has
been taken over exactly by actual intent `1` + pending result reservation `1`.

This slice stops before appending Generation `publishing` and before any public
Artifact CAS/catalog/result mutation.

## Product invariant and simplicity boundary

The real problem is a crash-safe handoff between durable Generation truth and a
short internal publication Operation. The smallest valid mechanism is:

`one-shot admission -> flat staged intent inode -> no-replace receipt hard-link
-> receipts fsync -> capacity takeover proof`.

- Reuse the existing Data Root flat Operation attempt grammar and filesystem
  primitives. Do not create a generic transaction manager, provider adapter,
  registry, repository, workflow engine, or second capacity model.
- Same-process sequencing is synchronous; cross-process exclusion already
  belongs to the live Data Root writer lease. Do not refactor public
  `OperationSingleFlight` just to share a name.
- A failure after any durable write preserves exact evidence and returns/fails
  closed. Do not guess cleanup or retry in this slice; startup recovery is a
  later slice.

## Required behavior

1. Add one package-internal generated-set intent writer (prefer a direct module
   such as `generated-set-intent-writer.ts`; choose the smallest locally
   consistent name). Its only live mutation entry must require:
   - the same live `OpenedDataRoot` and `DataRootWriterLease`;
   - exact intent/publication plan/eligibility inputs;
   - an origin-valid `GeneratedSetAdmissionCapability` consumed exactly once.
   Forged, copied, replayed, cross-root/lease/plan/eligibility inputs fail before
   filesystem mutation.
2. After consuming the capability, with no `await` gap, create one exact flat
   Operation attempt using the existing 96-bit / 24 lowercase-hex token grammar:
   `staging/<operationId>-<attemptToken>/` mode `0700`.
   - fsync the staging directory after mkdir;
   - write exact canonical binding bytes to `operation-intent.json` as a new
     `0600` regular file and fsync the file;
   - fsync the attempt directory;
   - no-replace hard-link that inode to the plan-derived receipt intent path;
   - fsync `receipts/`;
   - prove the staged and receipt names still reference the same exact regular
     inode/body and the live root/lease did not drift.
   Do not write the receipt as a standalone copied file and do not call the
   package-root public `OperationJournal` facade for the internal kind.
3. Immediately after the receipt directory fsync, re-run the existing durable
   receipt inspection and the existing shared capacity calculation. Require:
   - namespace still `terminal-installed`;
   - public Operation count unchanged;
   - exactly one additional internal Operation and exactly the expected
     generated-set intent, with no result/catalog;
   - `usedReceiptEntries` increased by exactly `1`;
   - `pendingResultReservations` increased by exactly `1`;
   - current Generation classification is
     `{state:"validating", publicationEvidence:"matching-intent-no-result"}`;
   - `generationPublicationReservations===0`, `requestedEntries===0`, status
     `ready`, and `effectiveEntries` exactly equals the pre-write authorized
     value. This is the authoritative `2 -> actual 1 + pending 1` takeover.
4. Return only a deep-frozen, package-internal admitted-intent evidence object
   sufficient for the next `publishing` append slice. Any mutation authority or
   absolute attempt path must remain in module-private provenance. The object
   must not expose a reusable raw writer, public `OperationJournal`, signed URL,
   credential, raw bytes, or provider request.
5. Existing matching intent belongs to restart/recovery, not fresh admission.
   Conflicting/EEXIST evidence, result/catalog appearance, same-bytes replacement
   inode, mode/body/identity drift, fsync ambiguity, capacity mismatch, or lease
   drift all preserve evidence and fail closed. Do not unlink or overwrite.
6. No new symbol may be exported from `packages/world-project/src/index.ts`.

## Focused counterexamples

- Happy path proves exact binding bytes, staged/receipt same inode, 24-hex flat
  attempt, durable fsync order, one intent/no result, and effective capacity
  unchanged from pre-write reservation.
- Fault/kill hooks at attempt mkdir before/after staging-dir fsync, staged intent
  file write/fsync, attempt-dir fsync, hard-link, receipts-dir fsync, and takeover
  inspection preserve only the expected bounded evidence; no CAS/catalog/result/
  Generation `publishing` write occurs.
- Forged/copy/replay/cross-root/cross-lease/cross-plan/cross-eligibility
  capability inputs perform zero mutation; the valid capability is not
  accidentally consumed by a mismatched call.
- Inject EEXIST/conflicting or same-bytes replacement receipt, replace staged
  intent inode/body/mode, add result/catalog, or change public receipt counts at
  the post-link boundary: fail closed, preserve all evidence, no cleanup.
- Near-cap valid boundary keeps the same effective count after handoff; the
  writer never requests another two slots and never reports capacity success by
  dropping the pending-result reservation.
- Source scan proves no package-root export and no public CAS, catalog/result,
  Generation state append, startup, Gateway/UI/World, provider, or generic
  framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-set-intent-writer.ts`
- new focused test beside it
- minimal change to `packages/world-project/src/generated-set-admission.ts` and
  its test only if a narrow consumed handoff must carry the exact pre-write
  snapshot; do not add a second authority state machine
- minimal package-internal read-only classifier/provenance helper in
  `data-root-capacity-inspection.ts` or exact binding helper in
  `generated-artifact-publication.ts` only if needed to prove the written intent
- minimal package-internal filesystem helper/test seam only when the existing
  `writeNewSyncedFile`, `syncDirectory`, hard-link and stable-read primitives
  cannot express the required proof

If correct implementation requires public CAS, catalog/result publication,
Generation `publishing` append, startup recovery, public Operation facade
expansion, or a generic internal-Operation framework, stop and report BLOCK.

## Forbidden actions

- No network, Keychain, credentials, provider requests, real generation, Git
  mutation, commit/push/merge, deploy, or production Coordinate/MultiNexus/
  Discord action.
- Preserve every unrelated dirty worktree change. Do not clean/reset/stash.

## Workflow and verification

1. Run EXharness `accept DH-017 zcode-glm53-generated-set-intent-worker
   703F0B58-4867-434F-91E8-0B2FF5DE4230 --branch agent/codex/DH-017` first and
   report concise ACCEPT.
2. Implement surgically; every changed line must trace to this intent handoff.
3. Run focused tests, proportional/full serial tests, root typecheck/build,
   scoped/global diff checks, Harness validate and doctor.
4. Return Chinese structured RESULT with exact paths, durable ordering,
   capacity-before/after arithmetic, counterexamples, exact gate counts,
   boundaries, branch/HEAD and residual risks. Worker RESULT is not reviewer
   approval.
