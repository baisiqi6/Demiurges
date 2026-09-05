# DH-017 implementation request — startup generated-set publication tail

## Objective

Implement the smallest startup recovery slice that makes generated-set durable publication evidence part of the global read-only preflight before any legacy Project/Artifact recovery mutation, then uniquely converges the already-published tail:

- `validating + exact matching publication intent + no result` → append exact `publishing` with public CAS still untouched;
- `publishing + exact catalog + no result` → publish the exact internal Operation success result, then append exact terminal `verified`;
- exact success result with a lagging `validating` or `publishing` Generation head → converge through the same complete published join to exact `verified`;
- exact `verified` → read-only validate/replay.

This slice may classify a `publishing + exact intent + no catalog/result` site as a durable follow-up recovery plan, but it must not rebuild or write missing hidden CAS members yet. That is the next slice. It must not add list/serve, cleanup, provider calls, or a generic recovery framework.

## First principles / simplicity

- Durable files are the authority after restart; no startup path may depend on a prior process's `WeakMap` object identity.
- Reuse the existing Generation chain, generated records/codecs, publication binding/result/catalog contracts, storage preflight, and `GenerationRecordJournal` crash protocol.
- Separate read-only Phase A inspection from apply. Any malformed, conflicting, missing-required, foreign, or extra evidence fails before old Project/Artifact mutation.
- Add one narrow generated-set startup plan and the minimum pure rehydration helpers. Do not create a registry, transaction manager, second journal, generic workflow engine, or public writer.
- Preserve all evidence on failure. No cleanup in this slice.

## Authorized implementation surface

Expected:

- new package-internal `generated-set-startup-recovery.ts` and focused tests;
- minimal integration/tests in `startup-recovery.ts`;
- surgical pure/read-only rehydration or exact-write helpers in the existing generated-set publication/visible/verified modules when reuse is genuinely necessary;
- minimal test-only seam for a Phase-A→apply drift counterexample.

Do not export the new plan, inspector, apply function, or test seam from `packages/world-project/src/index.ts`. Report `BLOCK` before touching Gateway/Studio/World, provider services, public `OperationJournal` API, or unrelated product files.

## Global Phase A contract

Before `recoverPendingOperations()` performs any repair, beginRecovery, finalize, cleanup, namespace apply, birth apply, generated CAS/catalog/result write, or Generation append, inspect from the same live root/lease:

- Generation namespace and birth evidence already covered by the existing Phase A;
- every supported Generation chain under the current first-generation MVP surface;
- exact generated-set Operation intent/result receipt classification;
- current state (`validating | publishing | verified`) and exact payload/previous digest;
- publication binding, operationId, bindingDigest, artifactSetDigest and provider/generation identity;
- catalog/result presence and exact canonical body;
- complete bytes/content/by-bytes/provenance/set join whenever catalog or result is present;
- the exact Operation attempt/staged names and inode/body lineage required for catalog-only completion;
- receipt capacity classification: matching intent takes over the exact two slots; matching result remains actual two; `publishing + no intent` retains two and is recovery-required.

Return a deep-frozen, module-private branded recovery plan bound to root, lease and the exact file/directory identities, bytes digests, entry sets, chain head and receipt/capacity snapshot observed. Apply must consume the original plan once and near-revalidate every dependency before its first mutation.

## Supported classifications and apply order

1. No generated-set publication evidence and no eligible tail: no plan, no behavior change.
2. `validating + matching exact intent + no result/catalog`:
   - after all global Phase A checks, append/resume the exact `publishing={operationId,artifactSetDigest}` using the existing journal;
   - assert catalog/result/public generated-set visibility is still absent;
   - stop with a durable follow-up classification for the later hidden-CAS recovery slice.
3. `publishing + matching intent + no catalog/result`:
   - validate and preserve; do not guess or write hidden CAS in this slice;
   - return a durable follow-up classification without old/public mutation beyond previously approved legacy recovery ordering.
4. `publishing + exact catalog + no result`:
   - require the full hidden member join and exact staged catalog lineage;
   - create/reuse the deterministic exact staged result and no-replace hard-link it to the internal result receipt, fsync receipts;
   - rebuild the complete published join, then append/resume exact `verified`.
5. exact result with `validating` or `publishing` lag:
   - require catalog and every member exact; result-without-catalog/member is recovery-required;
   - if head is `validating`, first prove the matching intent takeover and append/resume exact `publishing` without rewriting CAS/catalog/result;
   - rebuild the published join and append/resume exact `verified`.
6. exact `verified`:
   - validate exact payload/previous digest and the full published join; no new record or write.
7. `publishing + no matching intent`, conflicting/extra intent/result/catalog, terminal failure with publication evidence, or any cross-record drift: `GENERATION_RECOVERY_REQUIRED`, zero mutation.

The apply plan may perform generated-set tail mutations only after the existing global read-only inspection has succeeded. Do not treat an in-process mutex/critical section as crash atomicity.

## Required counterexamples

- A legacy terminal Project/Artifact Operation plus malformed generated intent/result/catalog/member/head evidence: startup fails before legacy attempt cleanup/result repair.
- Phase A then same-bytes replacement or body/mode/type/symlink/entry-set drift of intent, result, catalog, set/member, Generation head/record, or staged result: apply rejects before its first generated-set mutation.
- `validating + exact intent` appends exactly one publishing record; replay adds none; catalog/result remain absent.
- `publishing + no intent` preserves all evidence, retains capacity 2, and fails closed.
- catalog-only completes result then verified; kills at staged result write/fsync, attempt fsync, result link, receipts fsync, verified next/witness/final/head/cleanup uniquely resume or preserve recovery-required evidence.
- result-complete with validating/publishing lag converges without rewriting catalog/result/member inodes; verified replay adds no record.
- result-only, catalog without complete hidden join, wrong result identity, cross generation/provider/job/request/role/member/binding drift: zero mutation.
- near-cap 2044..2048 rebuild uses exact matching-intent/result actual+reservation arithmetic; no double count and no capacity loss.
- forged/copied/replayed/cross-root/cross-lease recovery plan rejects before mutation.
- package root remains closed; no provider/network/credential call and no cleanup/list/serve/public World authority.

## Verification gates

Run focused tests first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped/global `git diff --check` without fixing unrelated shared dirt
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

No network, Keychain, provider call, real generation, cleanup, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact files, Phase-A authority snapshot, classification/apply order, fault/counterexample evidence, exact gates, branch/HEAD/status, and the intentionally deferred hidden-CAS restart boundary. Worker RESULT is not reviewer approval.
