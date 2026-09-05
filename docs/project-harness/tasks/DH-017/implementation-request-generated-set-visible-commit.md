# DH-017 implementation request — generated-set visible commit

## Objective

Implement the smallest package-internal live commit facade that consumes the already approved hidden-CAS evidence and makes exactly one generated artifact set visible in the canonical order:

1. rebuild a complete published join from durable bytes/content/by-bytes/provenance/set evidence;
2. publish the exact catalog body by no-replace hard-link and fsync the catalog directory;
3. only after the catalog is durable, publish the exact internal Operation success result by no-replace hard-link and fsync `receipts/`;
4. return deep-frozen, non-serializable-origin visibility evidence proving the complete exact set.

This slice stops there. Do not append Generation `verified`, clean the Operation attempt, add startup recovery, expose list/serve, or touch any provider/World/Gateway/UI surface.

## First principles / simplicity

- Catalog is the sole visibility pointer; result is the durable commit acknowledgement. Neither alone is sufficient.
- Reuse the existing generated-set publication plan, hidden-CAS provenance, exact record codecs/layout, safe filesystem primitives, and namespace install's proven staged-file + hard-link + directory-fsync pattern.
- Do not introduce a transaction framework, generic repository, generic CAS publisher, recovery registry, or new public `OperationJournal` API.
- The package-root public `OperationJournal` must continue to reject `artifact.publish-generated-set`; this facade is package-internal and must not be exported from `index.ts`.
- Fail closed and retain evidence. Do not unlink, overwrite, guess cleanup, or manufacture a second truth.

## Authorized implementation surface

Expected:

- new `packages/world-project/src/generated-set-visible-commit.ts`;
- new focused tests beside it;
- at most a surgical package-internal provenance/helper addition to an already-created generated-set module if required.

Do not broaden beyond these files without reporting `BLOCK` first.

## Required input authority

The only mutation entry must require:

- original `GeneratedSetHiddenCasEvidenceV1` object identity;
- the same live `OpenedDataRoot` and `DataRootWriterLease` used to mint it;
- exact `GenerationIntentV1` and exact `GeneratedSetPublicationPlanV1` identity;
- the current Generation chain head still exact `publishing={operationId,artifactSetDigest}` with the hidden evidence's sequence/digest;
- the existing staged/receipt Operation intent still same inode, exact 0600 regular, and canonical bytes equal to `plan.binding`;
- the exact admitted Operation attempt path from the hidden evidence provenance.

Forged/copy/cross-root/cross-lease/cross-plan/cross-intent/stale-head evidence must fail before catalog/result mutation.

## Published join before catalog

Immediately before the first catalog mutation, read with `O_NOFOLLOW`/bounded stable snapshots and prove all of the following from durable files, not caller claims:

- every unique bytes CAS path contains the exact bytes digest and expected length;
- each content record and by-bytes pointer is exact and mutually consistent;
- each provenance record is exact and matches generation/provider/job/request/role/content;
- the set record is exact, ordered, and matches all member record digests;
- the publication binding/operation id/binding digest/catalog body/result all rederive exactly from that set;
- the receipt intent is exact;
- catalog and result are both absent for the first live call;
- attempt staging has a bounded closed grammar containing only the durable intent plus expected hidden staged records. Unknown/symlink/wrong-type/extra evidence fails closed.

Use the existing candidate/publication/hidden-CAS objects only to locate expected truth; re-read durable files and re-run the cross-record checks. Do not trust a caller-provided descriptor or list of members.

## Exact mutation protocol

### Catalog

- Stage canonical `plan.catalogBody` in the same admitted Operation attempt using a deterministic name owned by this protocol.
- `writeNewSyncedFile`, then fsync the attempt directory.
- no-replace hard-link staged catalog to `plan.catalogPath`;
- on `EEXIST`, accept only exact canonical bytes *and* the same staged/final inode; otherwise recovery-required;
- fsync the catalog parent directory;
- re-open and prove exact bytes, mode, inode relation, and complete hidden member evidence again before result mutation.

### Operation result

- Only after catalog durability and the second complete published join, stage canonical `plan.expectedResult` in the same attempt with a deterministic name;
- fsync staged file/attempt directory;
- no-replace hard-link to `plan.receiptResultPath`;
- on `EEXIST`, accept only exact canonical bytes and the same staged/final inode;
- fsync `receipts/`;
- re-open and prove exact result, intent, catalog, set/members and their cross-record join.

The returned evidence may be a small deep-frozen safe identity summary, but its mutation/list/serve authority must be a module-private `WeakMap`/brand tied to root, lease, plan, intent and observed durable identities. Do not include absolute paths, credentials, URLs, raw bytes, or reusable writer objects.

## Crash/idempotence boundary

- Pre-catalog hidden CAS: invisible.
- Catalog durable but result absent: hidden pending; a fresh live call may either safely resume exact catalog -> result or fail closed for the later startup slice. Choose one behavior explicitly and test it. Do not treat it as visible.
- Result without catalog/member evidence: always recovery-required.
- Catalog + result + all exact members: visible evidence may be minted.
- Any replacement inode, same bytes on a foreign inode, body drift, wrong mode/type/symlink, missing member, extra staged name, or chain-head drift fails closed without additional mutation.
- Do not clean staged catalog/result or the attempt in this slice.

## Required focused counterexamples

- Marble happy path produces one complete two-member visible evidence; Hunyuan one-member path succeeds.
- Exact order probes: no result before catalog-dir fsync; no visibility before result-dir fsync.
- Kill/fault after staged catalog file, attempt fsync, catalog link, catalog dir fsync, staged result, attempt fsync, result link, receipts fsync; supported exact resume or explicit preserved fail-closed behavior must be deterministic.
- Catalog-only is hidden; result-only/missing member is recovery-required.
- forged/copy/cross-root/cross-lease/cross-plan/cross-intent/stale publishing head: zero catalog/result mutation.
- intent/catalog/result/bytes/content/pointer/provenance/set same-bytes replacement inode and body/mode/type/symlink drift: fail closed.
- cross-record generation/provider/job/request/role/format/member/order/binding/catalog/result drift: fail closed before the next mutation.
- package-root source/behavior negative: no raw visible-commit writer/export and public `OperationJournal` still rejects both internal kinds.

## Verification gates

Run focused tests first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped and global `git diff --check` (report unrelated existing dirt separately; do not fix it)
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

No network, Keychain, credentials, provider calls, real generation, public CAS readers, World mutation, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact changed files, authority/order implemented, counterexamples, exact gate counts, branch/HEAD/status, and remaining boundary. Worker RESULT is not reviewer approval.
