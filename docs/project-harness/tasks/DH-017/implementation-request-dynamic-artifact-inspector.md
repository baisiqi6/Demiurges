# DH-017 Phase 3 implementation request: pure dynamic artifact inspector

## Role and objective

You are the writable `Terra high` coding Worker for this slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Implement the smallest content-truth boundary needed before generated Artifact publication: a pure dynamic inspector for legal World Labs SPZ v2 and Hunyuan/World collider GLB 2.0 bytes. It must derive the frozen `ArtifactInspectorDescriptorV1` and its digest from bytes alone while preserving the existing DH-013 static registered-artifact validator as the exact authority for static manifest assets.

This slice stops before download ownership, durable Generation state, CAS mutation, provenance/set/catalog records, startup publication recovery, Gateway routes, list/serve, Studio, or World mutation.

## First-principles constraints

- Reuse the existing SPZ/GLB decoding and bounds logic in `scripts/provider-artifact-validation.ts`; do not create a second parser.
- Do not introduce an inspector registry, ProviderAdapter, strategy/plugin framework, generic validation engine, dependency-injection container, or transaction abstraction.
- Dynamic inspection trusts neither caller metadata nor the static registry. Descriptor fields are computed from the actual bytes and the selected exact format/profile.
- Static validation remains stricter: registered bytes still must match the frozen manifest digest, length, element count, and bounds. A dynamic inspector must not weaken, replace, or auto-register static authority.
- Keep the dependency graph acyclic. `scripts/provider-artifact-validation.ts` must not import `packages/world-project`; a small package-internal wrapper may construct and validate `ArtifactInspectorDescriptorV1`.
- Pure means no filesystem reads/writes, CAS, network, credentials, provider calls, clocks, randomness, journals, public routes, or World state.

## Required behavior

1. Expose one small pure raw inspection seam from `scripts/provider-artifact-validation.ts` that:
   - accepts exact format `spz-v2 | glb-2.0` and `Uint8Array` bytes;
   - reuses the current decoder for that format;
   - returns actual content digest, byte length, element count, and source bounds;
   - preserves the existing decompression, JSON, chunk, external-resource, layout, finite-number, transform, and bounds checks;
   - returns newly owned/frozen data or otherwise prevents caller mutation from changing trusted output.
2. Refactor `validateRegisteredArtifactBytes()` to consume that same seam while retaining every existing exact static manifest comparison and return shape.
3. Add a package-internal module, preferably `packages/world-project/src/generation-artifact-inspector.ts`, with one direct function that:
   - maps `spz-v2` only to `spz-v2-position-bounds-v1` and `glb-2.0` only to `glb-2.0-scene-bounds-v1`;
   - constructs the exact descriptor through `requireArtifactInspectorDescriptor`;
   - returns the validated descriptor plus `artifactInspectorDescriptorDigest(descriptor)`;
   - accepts no caller-provided digest, bounds, count, profile, or descriptor override.
4. Do not export the dynamic inspector from `packages/world-project/src/index.ts` or production composition in this slice. Tests may direct-import it.
5. Keep error strings free of raw bytes or external URLs. No logging/serialization layer is needed.

## Focused counterexamples and acceptance

At minimum cover:

- legal deterministic SPZ and GLB fixtures produce exact format/profile/content digest/byteLength/elementCount/bounds and stable descriptor digest;
- repeated inspection of the same bytes is byte-equal and mutation of returned nested values cannot alter a later result;
- dynamic inspection succeeds for legal bytes without a pre-existing static manifest entry;
- wrong selected format, truncated/invalid magic/version/layout, trailing/chunk drift, external/data URI, sparse/invalid accessor, NaN/non-finite coordinates, and invalid/degenerate bounds fail closed as applicable;
- changing valid content either changes the content/descriptor digest or fails validation; no caller can override the computed result;
- existing static validator tests remain green and explicit manifest digest/length/count/bounds drift still rejects;
- lexical/source boundary confirms no package-root export and no filesystem/CAS/journal/provider/World dependency is introduced.

Prefer exact golden assertions using the existing deterministic test fixtures. A subprocess/two-process check is useful only if it stays small and deterministic; do not build a general golden-vector harness for this slice.

## Allowed modifications

- `scripts/provider-artifact-validation.ts` and its focused tests;
- new `packages/world-project/src/generation-artifact-inspector.ts` and focused tests;
- a minimal fixture export/helper adjustment in the existing provider artifact validation test if needed without widening production authority.

If closure requires changing ArtifactStore/CAS, generation journals/state, provider services, routes, UI, World, or adding a generic abstraction, stop and report a blocker.

## Forbidden actions

- No Keychain/credential read, network access, provider request, real generation, CAS/publication mutation, or production composition.
- No commit/push/merge/rebase/reset/clean/deploy or Coordinate/MultiNexus/Discord production mutation. Preserve unrelated dirty changes.

## Verification and RESULT

Run focused tests first, then full tests, typecheck, build, `git diff --check`, Harness validate/doctor. Return a Chinese structured RESULT with changed files, exact descriptor contract, counterexamples, exact gate counts, boundaries, branch/HEAD/status. Worker RESULT is not approval.
