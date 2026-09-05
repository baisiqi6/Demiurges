# DH-017 implementation request — phase-aware generated-set visibility reader

## Objective

Implement the smallest package-owned read-only facade that lists and reads dynamic generated artifacts only when one entire generated set is durably and exactly published. Public visibility must be `0-or-complete`: Marble exposes exactly two ordered members, Hunyuan exactly one, and no catalog-only, result-only, pre-verified, partial-member, or drifted state is listable or readable.

This slice establishes the package list/serve authority. It does not add a Gateway route, UI, provider call, cleanup, archive/GC, World adoption, or writer behavior.

## First principles / simplicity

- Durable files are the authority after restart; no prior-process WeakMap evidence is reusable by a reader.
- Reuse the existing generated-set codecs, layout, publication derivation, validated Generation chain, inspector/content/provenance/set contracts, and stable no-follow file reads. Extract one small read-only published-join helper if that prevents duplication; do not create a repository, cache, registry, transaction system, or generic query framework.
- Catalog is the enumeration pointer, but catalog alone is not visibility. Exact internal success result, terminal `verified` Generation truth, set/members/bytes/by-bytes/provenance, and their cross-record identities must all agree.
- A public caller may select only a visible `generationId` plus a member `assetId`; it may not supply paths, digests, descriptors, records, provider/job identity, or visibility evidence.
- Reads never acquire a writer lease and never mutate or repair. Any contradiction is `GENERATION_RECOVERY_REQUIRED`; a wholly absent/empty generated catalog is a normal empty list.

## Authorized implementation surface

Expected:

- one new package module, for example `packages/world-project/src/generated-artifact-reader.ts`, with focused tests;
- surgical package-internal read-only helper extraction from existing generated-set publication/startup/visible modules only when required to reuse the durable published join;
- a narrow safe facade/type export from `packages/world-project/src/index.ts` is allowed; no raw join, path, record writer, capability, root fd, or evidence export.

Report `BLOCK` before touching Gateway/Studio/World/provider, writer/recovery mutation, cleanup, public `OperationJournal`, or introducing a broader abstraction.

## Public safe facade

Prefer one small reader object bound to an existing live `OpenedDataRoot`, analogous to `ArtifactStoreReader`:

- `list()` returns a deep-frozen bounded array of safe set summaries;
- `read(generationId, assetId)` returns the exact member bytes only after rebuilding the same complete visibility join;
- summaries contain only safe identities needed by a later Gateway/UI: generation id, provider, artifact-set digest, and exact ordered member metadata (`assetId`, role, format, content digest, byte length, element count, canonical bounds). No absolute path, inode, receipt path, raw record, job/request id, credentials, URL, lease, or mutable authority.

Names may follow existing package conventions, but the authority and output shapes above are fixed. Static DH-013 `ArtifactStoreReader` remains unchanged and separate.

## Enumeration and published join

1. Validate the live `OpenedDataRoot` and exact generated namespace/catalog layout without a writer lease.
2. Enumerate `artifacts/catalog` with a directory handle, stop at 257 entries, require exact generation-digest filenames, regular `0600` files, no symlink/wrong type/unknown entry, and stable identity/bytes. Empty catalog is `[]`.
3. For every catalog entry, rebuild the durable Generation identity and require:
   - exact birth catalog pointer and exact Generation intent;
   - fully validated record chain whose current terminal state is `verified` and whose verified payload matches the publication operation id, binding digest, artifact-set digest, catalog digest, result digest, set record digest, and ordered content/provenance digests;
   - exact generated-set publication intent and exact success result (`publishedIdentity=artifactSetDigest`);
   - exact catalog body and publication binding rederived without trusting stored derived fields.
4. Re-read and cross-check the exact set descriptor, all ordered content/provenance records, all by-bytes pointers, and all bytes CAS objects. Enforce provider role/cardinality/order, generation/provider/job/request/content identities, role→format, inspector descriptor/digest, content digest/length, unique by-bytes mapping, and catalog/result/binding closure.
5. Build a module-private, deep-frozen `GeneratedSetVisibilityEvidenceV1` (or equivalent) from rederived safe identities only. `list()` and `read()` must consume only evidence minted by this complete join. Do not expose the evidence or its join helper from package root.
6. `read()` repeats/revalidates the complete join for the selected generation, then performs a stable `O_NOFOLLOW` bounded read of the selected member bytes, validates digest/length and file identity before/after, and returns a fresh byte copy. A member from another set or a caller-forged asset id fails closed.

If a small existing read-only helper already proves part of this closure, reuse it. Do not reuse writer-only WeakMap authority or require a writer lease merely to list/read.

## Failure and visibility semantics

- No namespace/catalog: empty list; unknown/malformed namespace or non-empty contradictory generated evidence: recovery-required.
- Catalog without exact result, result without catalog, current head before `verified`, missing member, partial set, malformed/cross-record drift: the affected durable state is not visible and the whole query fails closed rather than returning a partial list.
- A valid Marble set is returned only with both ordered members; a valid Hunyuan set only with its one member.
- Exact replay is read-only and stable. Same-bytes replacement inode, type/mode/symlink/body drift between enumeration/join/read fails closed.
- No repair, cleanup, unlink, writer lease, provider call, network, World mutation, or hidden-orphan enumeration.

## Required counterexamples

- empty/uninstalled generated catalog lists `[]` without mutation;
- exact verified Marble lists two ordered members and each reads exact bytes; exact verified Hunyuan lists/reads one;
- catalog-only, result-only, publishing/result-lag, terminal failure with publication evidence, missing one Marble member, and partial public CAS are not listable/readable;
- catalog/result/verified payload/binding/operation/generation/provider/job/request/role/order/cardinality/content/by-bytes/provenance/set drift each fail closed;
- wrong filename, 257th catalog entry, symlink/wrong type/wrong mode/oversized record, same-bytes replacement inode, and phase-A-to-read drift fail closed;
- caller cannot read another set's member, raw digest/path, hidden orphan, or static-only asset through this facade;
- repeated list/read changes no inode, receipt, Generation record, or directory entry;
- package-root exports only the safe reader and safe DTO/error types; raw join/evidence/path/capability remains unexported; existing static reader and public OperationJournal behavior remain green.

## Verification gates

Run focused tests first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped/global `git diff --check`, reporting unrelated shared dirt without fixing it
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

No network, Keychain, credential/provider call, real generation, cleanup, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact files, facade/output/error shapes, durable join reuse, bounded enumeration/read behavior, counterexamples, exact gates, branch/HEAD/status, and deferred Gateway/UI boundary. Worker RESULT is not reviewer approval.
