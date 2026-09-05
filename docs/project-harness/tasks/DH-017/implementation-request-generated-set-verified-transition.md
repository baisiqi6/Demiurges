# DH-017 implementation request — generated-set visible evidence to `verified`

## Objective

Implement the smallest durable transition that consumes the approved generated-set visible evidence and appends exactly one Generation `verified={artifactSetDigest,publicationOperationId}` record/head after independently proving the complete published join is still exact.

This slice only closes Generation truth. It must not clean the Operation attempt/private downloads, add startup recovery, expose list/serve, modify Gateway/Studio/World, or call a provider.

## First principles / simplicity

- The durable catalog + exact internal Operation success result + complete member join is the only authority for `verified`.
- Reuse `GenerationRecordJournal.append()` for the crash-safe record/head protocol; do not create another journal or transaction framework.
- Add only the missing `publishing → verified` state contract and a narrow package-internal coordinator.
- Do not export the coordinator or visible-commit internals from `packages/world-project/src/index.ts`.
- Fail closed and preserve evidence. No cleanup in this slice.

## Authorized implementation surface

Expected:

- minimal `generation-state.ts` + focused state tests for exact `VerifiedPayloadV1` and transition;
- new `generated-set-verified-transition.ts` + focused tests;
- at most a surgical package-internal revalidation/provenance accessor in `generated-set-visible-commit.ts`.

Report `BLOCK` before touching other product files.

## Exact state contract

- Add `verified` payload exact shape `{artifactSetDigest, publicationOperationId}`.
- Both fields must be exact lowercase/frozen identities matching the publication plan/result/catalog.
- The only incoming edge is `publishing → verified`.
- `verified` is terminal; no successor.
- Existing legal state chains and the `publishing` payload remain byte-compatible.

## Required authority and pre-mutation checks

The single live entry must require:

- original `GeneratedSetVisibleCommitEvidenceV1` object identity;
- the same live `OpenedDataRoot` / `DataRootWriterLease` / exact intent / exact publication plan used to mint it;
- current Generation chain head still exact `publishing={operationId,artifactSetDigest}` and matching the evidence's sequence/digest;
- staged/receipt intent same inode and exact binding bytes;
- catalog/result staged/final same inode and exact canonical bodies;
- all bytes/content/by-bytes/provenance/set durable files and cross-record identities still exact;
- result variant success and `publishedIdentity===artifactSetDigest`.

The visible-commit module may expose a narrow package-internal revalidator that returns safe provenance/evidence. It must not expose a raw writer, root path, reusable journal, or public list/serve authority.

After all checks, call the existing `GenerationRecordJournal.append()` with state `verified` and exact payload. Re-read current durable head/record and prove it is the returned record before returning a small deep-frozen result.

## Crash/replay behavior

- Faults at the existing record journal `.record.next`/witness/final/head/cleanup boundaries must follow that journal's already approved deterministic resume/fail-closed behavior; do not wrap or duplicate it.
- If a prior call durably advanced the head to the exact `verified` record but the caller lost the return value, a fresh call with the same in-process origin evidence may return an exact replay only after rebuilding the full published join and proving the verified payload/previous digest. Otherwise fail closed and leave evidence.
- A structurally identical copied/forged visible evidence object is never authority.
- `publishing` with missing/drifted catalog/result/member evidence must not append.
- Existing exact catalog/result with head still publishing is not by itself enough unless the full visible join revalidates.

## Required counterexamples

- Marble and Hunyuan happy paths append one exact terminal `verified` record/head; catalog/result/member inodes remain unchanged.
- Full record-journal fault matrix around append: before/after next, witness, final link, head publication, next/witness cleanup; deterministic exact resume or preserved recovery-required.
- exact post-head replay returns no second record/digest.
- forged/copy/cross-root/cross-lease/cross-intent/cross-plan/stale publishing evidence: zero Generation mutation.
- catalog-only, result-only, missing member, intent/catalog/result/member body/mode/type/symlink/same-bytes replacement inode where lineage is required, set/member/order/binding/result drift: zero Generation mutation.
- verified payload unknown key, uppercase/short digest, invalid operation id, wrong operation/set identity, and any successor from verified reject.
- package-root remains closed; no new raw writer/export.

## Verification gates

Run focused tests first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped/global `git diff --check` without fixing unrelated shared dirt
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

No network, Keychain, provider call, real generation, cleanup, startup/list/serve, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact changed files, authority/transition, fault/counterexample evidence, exact gates, branch/HEAD/status, and remaining boundary. Worker RESULT is not reviewer approval.
