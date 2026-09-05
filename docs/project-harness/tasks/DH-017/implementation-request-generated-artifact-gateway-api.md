# DH-017 implementation request — generated Artifact read-only Gateway API

## Objective

Expose the approved package-owned `GeneratedArtifactReader` through one thin, read-only Gateway API so product clients can list complete verified generated sets and fetch an exact member by `generationId + assetId`.

This slice must preserve the package reader as the sole durable visibility/membership authority. It adds no generation mutation, provider polling, publication, writer lease, cleanup, Studio UI, World adoption, or new Agent tool.

## First principles / simplicity

- The Gateway does HTTP parsing, bounded routing, stable status/code mapping, and response headers. It does not decode catalog/records, derive paths, or reimplement the published join.
- List and read delegate directly to `GeneratedArtifactReader`; no cache, in-memory registry, generated-asset map, repository, pagination framework, or background refresh loop.
- A client supplies only URL-safe `generationId` and `assetId`. It never supplies a digest, path, format, descriptor, provider/job id, or visibility flag.
- Errors expose stable product codes only; filesystem/provider/raw exception messages never reach the response.
- Static `/api/assets/:assetId` remains a separate DH-013 route and authority.

## Authorized surface

Expected:

- new `apps/agent-gateway/src/generated-artifact-api.ts` and focused tests;
- narrow export from `apps/agent-gateway/src/index.ts`;
- minimal production composition in `apps/agent-gateway/src/main.ts`;
- if needed, add the already-safe `GeneratedArtifactReader` to `WorldProjectRuntime` as a read-only field for both reader/writer modes, with focused runtime typing/test changes.

Report `BLOCK` before touching Studio/World manifest, provider services, confirmation/lifecycle, writer/recovery/cleanup, public OperationJournal, or adding broader HTTP/framework abstractions.

## Exact routes

```text
GET /api/artifacts
GET /api/artifacts/:generationId/:assetId
```

No other method or alias is accepted.

### `GET /api/artifacts`

- exact path, no query string, no body;
- delegate once to `reader.list()`;
- return exact JSON `{schemaVersion:1,sets:[...]}` where every set/member is the safe deep-frozen DTO already produced by the package reader;
- `cache-control:no-store`, `x-content-type-options:nosniff`, JSON content type;
- an empty/uninstalled generated namespace returns `200` with `sets:[]`;
- any `GENERATION_RECOVERY_REQUIRED` returns `409` with exact `{code:"GENERATION_RECOVERY_REQUIRED"}`;
- missing Data Root/reader returns `503` with exact `{code:"DATA_ROOT_UNAVAILABLE"}`.

### `GET /api/artifacts/:generationId/:assetId`

- exactly two percent-decoded path segments after `/api/artifacts/`; malformed encoding, slash/backslash/NUL, invalid generation/asset shape, extra segment, query, or `Range` is rejected before calling the reader;
- delegate only `reader.read(generationId, assetId)`; no digest/path fallback or static registry lookup;
- success returns exact bytes with `content-type` selected only from the list/joined safe member format (`spz-v2 → application/octet-stream`, `glb-2.0 → model/gltf-binary`), `content-length`, `cache-control:no-store`, `nosniff`, and safe generation/asset/content-digest headers;
- to avoid trusting a separate caller-supplied format, obtain the matching safe summary from the reader's complete list in the same request and require it matches the selected member before/after the delegated read, or add one equally narrow package safe read-result DTO if that is strictly simpler. Do not expose a raw path.
- `GENERATED_ARTIFACT_NOT_FOUND` returns `404` exact code; recovery-required returns `409`; aborted request before/after synchronous read returns `408 REQUEST_ABORTED` without claiming the underlying synchronous read was cancelled.

For non-GET requests under these paths return `405 METHOD_NOT_ALLOWED`; malformed/query/range returns `400 INVALID_REQUEST` except range may use `416 RANGE_NOT_SUPPORTED` if consistent with the existing static asset API. Every error response is `no-store` + `nosniff` and contains only `{code:<stable-code>}`.

## Production composition

- When Data Root is configured, construct/use the same `GeneratedArtifactReader` bound to the runtime's live `OpenedDataRoot`; both reader and writer runtime modes may serve verified artifacts.
- When unavailable, routes return 503; do not bootstrap or mutate Data Root from a GET.
- Compose generated routes explicitly before the catch-all ProductSession API without changing the existing static asset route or four Agent tools.
- Startup failure/recovery remains owned by existing runtime startup; the HTTP handler never invokes `recoverPendingOperations()`.

## Required counterexamples

- list empty, Marble complete two-member list, Hunyuan one-member list;
- exact SPZ/GLB bytes, media type/length/safe identity headers;
- catalog/reader recovery error maps to 409 without raw message;
- unknown/cross-set/invalid asset maps to 404/400 and does not call raw/static reader;
- percent-encoded slash/backslash/NUL, extra segment, query, Range, POST/PUT reject before dynamic read;
- Data Root absent returns 503; reader mode serves successfully without writer lease;
- request pre-abort and post-read abort do not return bytes;
- repeated list/read does not mutate files and does not add a timer/poller/cache;
- source scan proves no import of generated-set internal writer/join/recovery modules and no new Agent tool/World mutation;
- existing static provider asset API and ProductSession API tests remain green.

## Verification gates

Focused first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped/global `git diff --check`, report unrelated shared dirt separately
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

No network, Keychain, credential/provider call, real generation, filesystem mutation beyond test fixtures, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact files, route/DTO/error mapping, how the safe package reader remains sole authority, counterexamples, exact gates, branch/HEAD/status, and deferred Studio/lifecycle boundary. Worker RESULT is not approval.
