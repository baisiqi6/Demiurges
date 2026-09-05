# DH-017 Phase 3 implementation request: generated Artifact record identities

## Role and objective

You are the writable `Terra high` coding Worker for this slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Implement the pure, immutable identity layer for generated Artifact content, generation provenance, and complete provider output sets. This layer converts already-trusted dynamic inspection results plus exact generation/provider identity into canonical bodies/records/digests. It does not read files, mutate CAS, admit an Operation, create a publication capability, or decide public visibility.

## First-principles constraints

- Separate content truth from provenance: byte-identical output has one content identity regardless of provider/job/role; provenance and set retain generation-specific facts.
- Keep this as one direct module with plain codecs/derivers. Do not add a repository, registry, ORM, builder hierarchy, plugin/strategy, generic graph engine, transaction, or publisher abstraction.
- Reuse existing exact generation/descriptor codecs and canonical JSON/digest utilities. Do not duplicate provider request schemas or artifact parsers.
- No caller-chosen assetId or record digest. Every identity is rederived from exact body fields.
- This slice is intentionally below the full `requireGeneratedArtifactSetJoin`: it freezes the record vocabulary and local cross-record integrity, but does not pretend to validate filesystem observations, CAS pointers, durable Operation evidence, or publication recovery.

## Required behavior

1. Add a package-internal module, preferably `packages/world-project/src/generated-artifact-records.ts`, with exact deep-frozen V1 schemas and codecs/derivers for:
   - `VerifiedArtifactContentBodyV1` / record;
   - `GenerationArtifactProvenanceBodyV1` / record;
   - `GeneratedArtifactSetBodyV1` / record;
   - the by-bytes pointer body `{assetId,contentDigest,contentRecordDigest}`;
   - the later catalog body `{generationId,artifactSetDigest,publicationOperationId,publicationBindingDigest}` only if it can be expressed without importing publication authority. Do not invent placeholder Operation identity.
2. Content derivation accepts a trusted `DynamicArtifactInspectionV1` and derives exact:
   - `assetId = asset:generated-sha256-<contentDigest>`;
   - descriptor fields byte-equal to format/digest/length/count/bounds;
   - fixed `integrityStatus:"verified"`, `calibrationStatus:"missing"`, `distributionPolicy:"unknown-restricted-local"`;
   - `contentRecordDigest = SHA-256("demiurges-verified-artifact-content-v1\0" + canonicalJson(contentBody))`.
3. Provenance derivation validates exact generationId/provider/providerJobId/generationRequestDigest/outputRole/contentRecordDigest and computes the frozen domain-separated digest. Use existing provider/job/generation formats where already frozen; do not accept arbitrary unsafe strings.
4. Set derivation accepts exact provider + generationId and ordered provenance/content records, then enforces:
   - Marble exact ordered roles `[world-spz-500k, world-collider-glb]` with formats `[spz-v2, glb-2.0]`;
   - Hunyuan exact ordered roles `[object-glb]` with format `glb-2.0`;
   - every provenance generation/provider/content digest matches the supplied records;
   - no duplicate/conflicting role or record digest;
   - `artifactSetDigest = SHA-256("demiurges-generated-artifact-set-v1\0" + canonicalJson(setBody))`.
5. Exact-key/plain-data/deep-frozen decoding; digest-bearing records must recompute and compare rather than trust stored digest. Apply the canonical plan's bounded record limits with the smallest local helper; do not create a configurable general limits framework.
6. Keep module out of `packages/world-project/src/index.ts` and production composition. Tests may direct-import it.

## Focused counterexamples and acceptance

At minimum cover:

- deterministic SPZ/GLB content/provenance/Marble-set/Hunyuan-set golden vectors;
- same inspected GLB bytes under Marble collider and Hunyuan object reuse identical assetId/contentRecordDigest but produce distinct provenance/set digests;
- provider/job/role/generation/request/content/format/member order/cardinality drift rejects;
- caller-supplied assetId/digest/recordDigest, unknown keys, malformed SHA/IDs, mutable/non-plain structures, oversized/deep/excess collections reject;
- descriptor/content field drift and digest replay reject;
- returned bodies, nested descriptors/bounds, members and records are deeply frozen;
- source scan shows no fs/CAS/journal/provider-service/World/package-root export and no generic framework.

## Allowed modifications

- new `packages/world-project/src/generated-artifact-records.ts` and focused tests;
- only a minimal export/type adjustment in `generation-artifact-inspector.ts` or existing exact codecs when a required frozen fact is inaccessible.

If closure requires filesystem observations, CAS/pointer writes, OperationJournal, startup recovery, Gateway/UI, World, or a generic framework, stop and report a blocker; those belong to the next join/publication slices.

## Forbidden actions

- No network, Keychain, provider call, real generation, filesystem/CAS mutation, Git mutation, deploy, Coordinate/MultiNexus/Discord production mutation.
- Preserve unrelated dirty worktree changes.

## Verification and RESULT

Run focused tests first, then full tests, typecheck, build, `git diff --check`, Harness validate/doctor. Return a Chinese structured RESULT with exact files, schemas/digests, many-to-one proof, counterexamples, gate counts, boundaries, branch/HEAD/status. Worker RESULT is not approval.
