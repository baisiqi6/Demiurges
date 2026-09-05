# DH-017 Phase 3 implementation request: generated-set candidate plan

## Role and objective

You are the writable `Terra high` coding Worker for this slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Implement the pure semantic join between one exact Generation intent, its durable remote binding, a fully-candidate active download payload, and fresh inspector-origin results for every required member. The result is a package-internal, origin-checked `GeneratedSetCandidatePlan` containing the exact content/provenance/set/by-bytes records derived in the previous slice.

This is not yet the full filesystem-aware `requireGeneratedArtifactSetJoin`, not a CAS observation, Operation admission, publication capability, catalog body, writer, or recovery path.

## Why this slice exists

The publication layer must not independently re-derive provider/member semantics in several places. This slice freezes one small semantic truth:

`intent + remote-bound + all durable candidates + inspector-origin results → exact generated-set candidate plan`

Later filesystem preflight may add O_NOFOLLOW file identity and absent/existing CAS observations around this plan. It must not weaken or duplicate this semantic join.

## First-principles constraints

- One direct module and one focused test file. No generic graph validator, evidence registry, repository, transaction, plugin/strategy, builder, or dependency-injection layer.
- Reuse `requireGenerationIntent`, `requireActiveDownloadPayload`, `requireInspectedDynamicArtifact`, and the generated Artifact record derivers/codecs. Do not duplicate those schemas.
- Trust only inspector-origin results minted from actual bytes. A structurally valid descriptor/digest is not sufficient.
- Do not claim the plan proves candidate filename/inode still exists or public CAS state. Those are explicit later gates.
- Do not alter OperationJournal or introduce `artifact.publish-generated-set` in this slice.

## Required behavior

1. Add a package-internal module, preferably `packages/world-project/src/generated-set-candidate-plan.ts`.
2. The direct derivation accepts exact:
   - `GenerationIntentV1`;
   - matching `RemoteBoundPayloadV1`;
   - an `ActiveDownloadPayloadV1` revalidated through `requireActiveDownloadPayload`;
   - an ordered list of `{outputRole, inspection}` where every inspection passes `requireInspectedDynamicArtifact`.
3. Require every provider-required download member to be `stage:"candidate"`; reject idle/reserved/owned/discard/cleanup-authorized, incomplete or extra members.
4. Require exact ordered roles:
   - Marble `[world-spz-500k, world-collider-glb]`;
   - Hunyuan `[object-glb]`.
5. For each member, compare candidate and fresh inspection byte-for-byte/field-for-field: format/profile/content digest/byteLength/elementCount/canonical sourceBounds/inspector descriptor digest. Reject any mismatch before returning a plan.
6. Derive each content record, by-bytes pointer, generation provenance record using the remote job identity, and provider-exact set record through the existing record module. Do not accept caller-provided record bodies or digests.
7. Return one exact deep-frozen plan with only safe identities and records needed by the later storage preflight. It may include the revalidated candidate filename/file identity as expected private evidence, but must not include signed URLs, credentials, raw bytes, provider request bodies, or errors.
8. Protect the returned plan with a module-private `WeakSet` and expose a narrow package-internal origin check for the later join/admission slice. This is a single provenance check, not a general capability framework.
9. Do not export the module from `packages/world-project/src/index.ts` or production composition.

## Focused counterexamples and acceptance

At minimum cover:

- legal Marble two-member and Hunyuan one-member candidate plans from real SPZ/GLB inspection fixtures;
- deterministic exact golden plan identities/record digests/set digest;
- missing/extra/reordered inspection, candidate stage not final, role/order/cardinality drift reject;
- intent/remote provider or job mismatch, remote output identity mismatch, generation/request drift reject;
- candidate vs fresh inspection digest/length/format/count/bounds/profile/descriptor-digest drift reject;
- forged inspection and forged/copied plan origin reject；原始 immutable plan 可重复做只读 origin check，因为它不是 mutation capability；真正 one-shot 的 `GeneratedSetAdmissionCapability` 留给 full filesystem/CAS join + admission slice；
- repeated derivation from the same exact inputs is value-equal, while each returned plan has its own valid origin; all nested results frozen;
- plan contains no signed URL/raw bytes/credential/provider request and source scan confirms no fs/CAS/Operation/startup/World/root export/framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-set-candidate-plan.ts` and focused tests;
- only minimal exports of existing exact validators/types from `generation-output-contracts.ts`, `generation-state.ts`, or generated Artifact modules when the frozen semantic fact is otherwise inaccessible.

If implementation needs to inspect the filesystem, define CAS paths, mutate ArtifactStore, add Operation kinds, publish catalog, or change startup recovery, stop and report a blocker. Those are later slices.

## Forbidden actions

- No network, Keychain, provider call, real generation, filesystem/CAS mutation, Git mutation, deploy, Coordinate/MultiNexus/Discord production mutation.
- Preserve unrelated dirty worktree changes.

## Verification and RESULT

Run focused tests first, then full tests, typecheck, build, `git diff --check`, Harness validate/doctor. Return a Chinese structured RESULT with inputs, exact plan fields, counterexamples, origin proof, gate counts, boundaries, branch/HEAD/status. Worker RESULT is not approval.
