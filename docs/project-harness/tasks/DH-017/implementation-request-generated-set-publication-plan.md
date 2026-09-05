# DH-017 Phase 3 implementation request: generated-set publication plan

## Role and objective

Implement the smallest package-internal publication identity/join layer for a generated Artifact set. It must combine an origin-checked `GeneratedSetCandidatePlanV1` with its origin-checked read-only storage preflight and derive the one exact `artifact.publish-generated-set` Operation binding, catalog commit body/digest, expected success result, and fixed relative target paths.

This slice defines immutable desired truth only. It does not admit an Operation, reserve capacity, create a one-shot capability, write CAS/catalog/receipts, mutate Generation state, or perform startup recovery.

## First-principles constraints

- Reuse the existing candidate plan, storage preflight revalidation, record identities, canonical JSON/SHA-256 helpers, generation-id digest helper, and Data Root receipt path builders.
- Mirror the existing small `generation-namespace.ts` internal-binding pattern where useful; do not widen the package-root public `OperationBinding` union or export an internal kind from `index.ts` in this slice.
- Keep one direct module and focused tests. No generic Operation abstraction, builder, registry, repository, transaction, evidence graph, codec framework, or new error hierarchy.
- The plan is repeatable read-only evidence, not a one-shot admission/mutation capability. The later coordinator will own capacity, single-flight, internal Operation admission, and consumed state.

## Exact contracts

Add `packages/world-project/src/generated-artifact-publication.ts` with exact plain/deep-frozen V1 contracts equivalent to the canonical plan:

```ts
operationId = "op:" + SHA256(
  "demiurges-generated-set-publication-v1\0" +
  generationId + "\0" + artifactSetDigest
)

binding = {
  schemaVersion: 1,
  operationId,
  operationKind: "artifact.publish-generated-set",
  target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
  expectedIdentity: null,
  candidateIdentity: {
    generationId,
    artifactSetDigest,
    orderedContentRecordDigests,
    orderedProvenanceRecordDigests
  }
}
```

- Both digest arrays must be derived in exact set-member order and match the candidate plan/set record; caller arrays or IDs are never accepted as authority.
- `publicationBindingDigest` is SHA-256 of canonical exact binding bytes, byte-compatible with the existing Operation binding digest algorithm once this internal kind is wired into the journal.
- Derive exact `catalogBody={generationId,artifactSetDigest,publicationOperationId,publicationBindingDigest}`.
- `catalogDigest=SHA256("demiurges-generated-artifact-catalog-v1\0" + canonicalJson(catalogBody))`; catalog does not enter the binding preimage.
- Expected success result is exact existing terminal shape with `publishedIdentity=artifactSetDigest`; provide an exact decoder/validator for success and `aborted-before-publish` without exposing a journal writer.
- Add the fixed catalog path builder `artifacts/catalog/<generation-id-digest>.json` to `generated-artifact-layout.ts`. Desired receipt paths must reuse `dataRootReceiptIntentPath(operationId)` and `dataRootReceiptResultPath(operationId)`.

## Publication plan origin

`deriveGeneratedSetPublicationPlan(root, candidatePlan, storageSnapshot)` must:

1. require candidate-plan origin;
2. call the existing repeatable storage near-revalidation with the same live root, exact plan object, and exact snapshot object;
3. require generation/provider/set/member/content/provenance identities to remain exact;
4. return a deep-frozen `GeneratedSetPublicationPlanV1` containing only safe identities, exact binding/digest, catalog body/digest, expected success result, and fixed relative paths;
5. retain no raw bytes, absolute path, handle, signed URL, credential, provider request, or raw error;
6. protect the result with a module-private origin map binding exact root object/identity, candidate plan object, and storage snapshot object;
7. expose only a repeatable read-only origin/revalidation check. Do not add a consumed WeakSet or call it an admission capability.

## Focused acceptance

Cover at least:

- deterministic Marble and Hunyuan binding/operation/catalog/result golden vectors;
- ordered content/provenance arrays exactly match the set members;
- binding target/kind/id/expectedIdentity/operationId/candidate arrays, catalog body/digest, terminal binding/published identity drift all fail closed;
- catalog omitted from binding preimage: changing only derived catalog evidence cannot produce a second binding identity;
- forged/copied/cross-root/cross-plan/cross-snapshot publication plans fail origin/revalidation; original read-only plan can be checked repeatedly;
- storage drift between storage preflight and publication-plan derivation fails before returning a plan;
- plan serialization/stringification contains no raw bytes, absolute path, signed query URL, credential, provider request, or mutable object;
- package root does not export the module; source scan shows no fs writer/CAS publisher/OperationJournal mutation/startup/Gateway/World/framework dependency.

## Allowed modifications

- new `packages/world-project/src/generated-artifact-publication.ts` and focused test;
- minimal catalog path addition to `generated-artifact-layout.ts` and its test;
- only minimal package-internal type/origin-check export if existing functions cannot prove the exact candidate/storage origin without duplication.

If the work requires changing `operation-journal.ts`, capacity, single-flight, state journals, startup, or any writer, stop and report a blocker; that is the next slice.

## Boundaries and gates

- No network, Keychain, provider request, real generation, production filesystem mutation, Git mutation, deploy, Coordinate/MultiNexus/Discord production mutation.
- Test fixtures may use isolated temporary Data Roots.
- Preserve all unrelated dirty worktree changes.
- Run focused tests first, then serial world-project/full tests as proportional, typecheck, build, diff check, Harness validate/doctor. Return a Chinese structured RESULT with exact files, identities, counterexamples, gate counts, boundary attestation, branch/HEAD/status. Worker RESULT is not approval.
