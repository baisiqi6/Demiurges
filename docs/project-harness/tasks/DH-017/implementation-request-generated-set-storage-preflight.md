# DH-017 Phase 3 implementation request: generated-set storage preflight

## Role and objective

You are the writable `Terra high` coding Worker for this slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Implement a read-only filesystem preflight that binds an origin-checked `GeneratedSetCandidatePlanV1` to the current Data Root evidence. It must reopen every private candidate with `O_NOFOLLOW`, prove the recorded inode and fresh bytes truth, and classify every pre-catalog public target needed for the set as exact `absent | existing`. It returns an origin-checked immutable snapshot that can be rerun for near-revalidation.

This slice performs no filesystem mutation and does not inspect or derive the publication Operation intent/result or public catalog pointer. Those require the later admission/publication authority.

## First-principles constraints

- Read-only means zero mkdir/write/link/unlink/rename/fsync/cleanup. It may open/read/fstat/lstat directories and regular files.
- Reuse the current Data Root handle authority, safe no-follow file reader, dynamic inspector, candidate plan, and record codecs. Do not duplicate parsers or artifact semantics.
- The snapshot proves only current storage evidence. It is not an admission capability and does not authorize CAS mutation.
- Keep a direct fixed layout. No generic filesystem transaction, virtual FS, repository, graph/evidence engine, configurable path registry, or watcher.
- Public targets before catalog are bytes CAS, content record, by-bytes pointer, provenance records, and set record. Catalog/result are explicitly absent from this slice.

## Required behavior

1. Add a small exact generated-artifact layout module if needed, with pure path builders for:
   - `artifacts/sha256/<contentDigest>`;
   - `artifacts/records/content/sha256/<contentRecordDigest>`;
   - `artifacts/records/content/by-bytes/sha256/<contentDigest>.json`;
   - `artifacts/records/provenance/sha256/<provenanceRecordDigest>`;
   - `artifacts/sets/sha256/<artifactSetDigest>`.
   Every input digest must be exact lowercase SHA-256; no free-form path input.
2. Add only the minimal safe-filesystem read seam needed to return stable regular-file identity plus bytes from one `O_RDONLY|O_NOFOLLOW` fd. Require regular file, mode `0600`, bounded exact size, and before/after stable dev/ino/mode/uid/gid/size/mtime/ctime. Existing callers must remain unchanged.
3. Add `packages/world-project/src/generated-set-storage-preflight.ts` with one inspect function that consumes:
   - live `OpenedDataRoot`;
   - origin-checked `GeneratedSetCandidatePlanV1`.
4. Resolve each private candidate only under exact `receipts/generations/data/<generation-digest>/downloads/<candidateName>`. Reopen it through the stable reader, require returned dev/ino/mode/uid/gid and exact size to match the candidate plan, rerun `inspectDynamicArtifactBytes(format, bytes)`, and compare the resulting descriptor/content identity to the candidate plan records. Raw bytes must not be retained in the snapshot.
5. Classify each desired public target as:
   - `absent`: the path and any missing fixed descendants are stably absent under the deepest existing exact `0700` directory ancestor;
   - `existing`: exact `0600` regular file, stable identity, bounded canonical bytes, and content byte-for-byte/field-for-field equal to the plan-derived target.
   Wrong type, symlink, path/ancestor replacement, noncanonical JSON, duplicate-key/noncanonical bytes, digest/body drift, or unstable presence is `GENERATION_RECOVERY_REQUIRED`, not `absent`.
6. Existing bytes CAS must be re-inspected from bytes and equal the content record. Existing content/provenance/set records and by-bytes pointer must parse as fatal UTF-8 JSON, be canonical byte-equal after their existing exact codec, and equal the plan record/pointer.
7. Snapshot the relevant existing directory and regular-file identities plus exact status for every target. Support both all-absent fresh layout and mixed exact replay evidence. Deduplicate byte/content/by-bytes observations when multiple members share identical content.
8. Return a deep-frozen snapshot containing no raw bytes, signed URL, credential, provider request, raw errors, absolute path, or mutable handle. Protect it with a module-private origin map binding exact root object/identity and exact candidate-plan object.
9. Expose a narrow read-only near-revalidation function: require the original snapshot origin, require the same live root and same origin plan, rerun the complete inspection, and reject any identity/status/body drift. Revalidation may be repeated; this is not a one-shot capability.
10. Do not export new modules from `packages/world-project/src/index.ts` or production composition.

## Focused counterexamples and acceptance

At minimum cover:

- legal Marble and Hunyuan private candidates with all public namespaces/targets absent;
- exact mixed replay: one shared bytes/content/by-bytes target existing, provider-specific provenance/set absent or exact;
- byte-identical Marble collider/Hunyuan object deduplicates content observations but keeps separate provenance/set observations;
- private candidate missing, wrong mode/type/symlink, same-bytes replacement inode, file-identity drift, content/descriptor drift fail closed;
- public wrong type/symlink, noncanonical JSON, duplicate key, self-consistent wrong record, bytes digest/descriptor drift fail closed;
- missing ancestor becoming present, absent target appearing, existing target replacement/body drift, root replacement/cross-root/forged snapshot all fail near-revalidation;
- inspect and revalidate leave directory entry sets and file bytes unchanged;
- source scan shows no write/link/unlink/rename/fsync/CAS publisher/Operation/startup/World/root export/framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-artifact-layout.ts` and tests if useful;
- minimal read-only stable file snapshot seam in `safe-filesystem.ts` and focused tests;
- new `packages/world-project/src/generated-set-storage-preflight.ts` and focused tests;
- only minimal package-internal exports from candidate-plan/record modules when exact validation is otherwise inaccessible.

If implementation requires creating public directories, writing a target, reserving capacity, adding an Operation kind, catalog/result evidence, startup mutation, Gateway/UI, or World changes, stop and report a blocker.

## Forbidden actions

- No network, Keychain, provider request, real generation, filesystem mutation outside test fixtures, Git mutation, deploy, Coordinate/MultiNexus/Discord production mutation.
- Test fixtures may create isolated temporary Data Roots only; production code must remain read-only.
- Preserve unrelated dirty worktree changes.

## Verification and RESULT

Run focused tests first, then full tests (use serial mode if the known lease tests contend), typecheck, build, `git diff --check`, Harness validate/doctor. Return a Chinese structured RESULT with exact evidence model, counterexamples, mutation-zero proof, gate counts, boundaries, branch/HEAD/status. Worker RESULT is not approval.
