# DH-017 Phase 2 implementation request: Marble authenticated service

## Role and objective

You are the writable `Terra high` coding Worker for this slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Implement one provider-specific boundary: `MarbleGenerationService` for authenticated submit, operation query, and get-world metadata refresh. It must consume the already-frozen request builders, URL constructors, and response codecs, and it must be fully testable with an injected fake transport and fake deadline source.

This is not the full Generation lifecycle. Do not append GenerationJournal states, do not download artifacts, do not publish Artifact CAS, do not add Gateway routes/UI, and do not make a real World Labs request.

## First-principles constraints

- Keep a direct Marble service. Do not create `ProviderAdapter`, a generic provider SDK, a transaction layer, a retry framework, or a provider plugin abstraction.
- Reuse `generation-contracts.ts`, `generation-provider-transport.ts`, and `generation-provider-codecs.ts`; do not duplicate their model, URL, asset-host, or response-shape validators.
- The service owns only transport facts that are truly Marble-specific: exact endpoint/method/header/body, 30-second per-call deadline, bounded response reading, stable classification, and redacted errors.
- The lifecycle coordinator will later own durable checkpoints, retries, backoff, state transitions, and ambiguity. This service must return a small closed outcome that lets the coordinator make those decisions; it must not silently retry.
- Prefer a small injected fetch-like function and clock/deadline seam. Do not introduce a DI container or configurable policy graph.

## Required behavior

1. Add a module-private/product-internal `MarbleGenerationService` with exactly three operations:
   - submit from a runtime-revalidated durable `GenerationBindingBodyV1` whose provider/profile and re-derived provider request are exact, to `POST /marble/v1/worlds:generate`;
   - query a durable operation id via `GET /marble/v1/operations/{operationId}`;
   - refresh a durable world id via `GET /marble/v1/worlds/{worldId}`.
2. Credential is supplied server-side to the service call/composition. `WLT-Api-Key` may be attached only to these three exact URLs. It must never appear in a returned outcome, thrown message, test snapshot, log, or serialized object.
3. Submit body bytes must come from the already-frozen provider request object. Use exact JSON content type and explicit accept; GET has no body. Do not send caller-controlled extra headers.
4. Every call combines caller abort with a 30-second injected deadline. Abort/deadline/transport/body-stream failures must return or throw only a closed redacted classification; never include URL, status text, raw error, body, header, path, or credential.
5. Read response bytes incrementally with a hard 256 KiB limit and fatal UTF-8 decoding before JSON decoding. Do not call unbounded `text()`, `json()`, or `arrayBuffer()` first. If exact duplicate-key rejection is not already available through the approved codec surface, stop and report the smallest missing seam instead of introducing a general JSON parser in this slice.
6. Success-path 2xx must be exact HTTP 200 and pass the existing Marble codec:
   - submit yields a trustworthy `RemoteBoundPayloadV1` only from a legal initial Operation response;
   - query binds `operation_id` byte-exactly to the durable id;
   - get-world binds `world_id` byte-exactly to the durable id and returns the existing sanitized output identity/asset URLs.
   Unknown keys, malformed JSON/UTF-8, oversized bodies, identity drift, and codec/profile drift map only to `PROVIDER_CONTRACT_MISMATCH`.
7. Do not decide durable lifecycle state in the service. Return a closed provider-specific outcome for:
   - legal decoded success/pending/failure;
   - documented no-creation submit rejection statuses `400/401/402/422`, with stable public classification and no raw body exposure;
   - transient/ambiguous transport classes (`429`, `5xx`, abort/deadline/body stream, other unsupported status) that the later coordinator can map according to submit vs poll semantics.
   Do not retry inside the service and do not generalize World Labs submit rejection semantics to Hunyuan.
8. Keep this module out of `packages/world-project`; it belongs under `apps/agent-gateway/src/`. Do not export it from a broader public package root unless current gateway composition genuinely needs that export; tests may import the file directly.
9. For bound query/get-world, classify the frozen deterministic rejection matrix before any coordinator exists: `401|403 → PROVIDER_UNAUTHORIZED`; `400|404|422 → PROVIDER_REJECTED`. These are not transient. Submit keeps its distinct documented no-creation matrix; do not merge the two stages.

## Focused counterexamples and acceptance

At minimum test:

- exact submit/query/get-world method, URL, body, headers, and caller/deadline signal propagation;
- malicious operation/world path segments are rejected before fetch count increments;
- 200 legal pending, done success, provider failure, and get-world refresh decode;
- query operation-id drift and get-world world-id drift fail closed;
- malformed JSON, invalid UTF-8, body `256 KiB + 1`, unknown response key, non-200 2xx, 400/401/402/422, 429, 5xx, fetch rejection, body-stream rejection, caller abort, and deadline;
- no error, rejected/transient outcome, HTTP/durable/log/DOM value, or stringified diagnostic contains credential, signed URL, raw response body, status text, absolute provider path, or injected raw error message. A legal decoded success may carry signed asset URLs ephemerally in process because the later downloader needs them; tests must not snapshot/log the full success object, and no durable/public serializer is introduced in this slice;
- each service call performs at most one fetch and never retries;
- Hunyuan modules and semantics remain untouched.

Tests must assert the actual outbound `Request` rather than only a mocked high-level result. A bounded local fake HTTP server is optional; do not add one if the injected fetch tests already prove the transport boundary.

## Allowed modifications

- new `apps/agent-gateway/src/marble-generation-service.ts` and tests;
- minimal reuse-oriented changes to `generation-provider-transport.ts` or `generation-provider-codecs.ts` and their tests if an already-frozen Marble fact is not exposed;
- package manifest/test wiring only if genuinely required.

If satisfying the slice requires changing GenerationJournal, OperationJournal, startup recovery, Artifact CAS, provider download transport, Hunyuan service, Gateway routes, Studio, or production composition, stop and report a blocker.

### Operator scope decision after Worker blocker

The reported missing seam is approved, narrowly: `generation-provider-codecs.ts` may add one small shared provider-response bytes decoder that performs the already-frozen 256 KiB bound, fatal UTF-8 decoding, exact JSON grammar, and duplicate object-key rejection before returning a plain JSON value to the existing Marble codec. It may be shared later by Hunyuan because this is an identical transport fact, but this slice must not add a parser framework, configurable limits, schema DSL, dependency, or provider lifecycle abstraction. Keep the implementation private to the gateway generation-provider modules unless one direct test-only export is necessary. Unknown/duplicate keys must fail with the existing redacted `PROVIDER_CONTRACT_MISMATCH` surface.

## Forbidden actions

- No Keychain/credential reads, network access, real provider calls, or real generation.
- No download, polling loop/backoff, durable state append, publication, World mutation, Gateway route, Studio UI, Coordinate/MultiNexus/Discord production mutation.
- No generic provider abstraction or defensive framework beyond the three exact calls.
- No commit/push/merge/rebase/reset/clean/deploy. Preserve all unrelated dirty-worktree changes.

## Verification and RESULT

Run focused tests first, then:

```text
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Return a Chinese structured `RESULT`: files changed, exact service/outcome contract, request/response/redaction counterexamples, exact gate counts, scope not implemented, and branch/HEAD/status. Worker RESULT is not reviewer approval.
