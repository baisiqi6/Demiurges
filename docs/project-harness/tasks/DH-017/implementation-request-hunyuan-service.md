# DH-017 Phase 2 implementation request: Hunyuan authenticated service

## Role and objective

You are the writable `Terra high` coding Worker for this slice. Work only in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Implement one provider-specific boundary: `HunyuanGenerationService` for authenticated paid submit and bound job query, using the already-frozen request/binding codecs, exact URLs, strict provider-response JSON bytes decoder, and Hunyuan response codecs. All tests use injected fake transport/deadline; no real credential or provider call.

This is not the Generation coordinator, polling loop, download path, Artifact publication, Gateway route, or Studio UI.

## First-principles constraints

- Keep a direct Hunyuan service. Do not create a generic ProviderAdapter/SDK, endpoint DSL, retry framework, DI container, transaction abstraction, or shared lifecycle state machine.
- Reuse the existing strict response bytes decoder and Hunyuan codecs. Do not add another JSON parser or duplicate request/response schema validation.
- Hunyuan paid-submit ambiguity is intentionally asymmetric with Marble. Once fetch begins, no status/error without a trustworthy decoded JobId proves non-creation.
- The service performs one fetch and returns a small closed provider-specific outcome. The later coordinator owns durable `submit_started`, ambiguity, checkpoints, retry/backoff, and terminal state.

## Required behavior

1. Add `apps/agent-gateway/src/hunyuan-generation-service.ts` with exactly two operations:
   - `submitHunyuanObject` from a runtime-revalidated durable `GenerationBindingBodyV1`;
   - `queryHunyuanJob` from the same validated binding plus a matching durable `RemoteBoundPayloadV1`.
2. Constructor/composition freezes the runtime Hunyuan `contractProfile` (`cloud-response-v1 | compat-top-level-v1`) and exact 64-hex `contractShapeDigest`. Every call revalidates the durable binding and requires provider/profile/digest byte-equal to the configured values before fetch. Do not guess between profiles.
3. Submit sends exact `POST https://api.ai3d.cloud.tencent.com/v1/ai3d/submit`, raw key in `Authorization` with no `Bearer`, exact accept/content-type, and body only from the re-derived `{Prompt,Model}` provider request. Forged provider/model/prompt/extra fields/profile/digest fail before fetch.
4. Query sends exact `POST https://api.ai3d.cloud.tencent.com/v1/ai3d/query`, same raw Authorization rule, and exact body `{JobId:<durable remoteJobId>}`. Binding/remote provider/job/profile drift and unsafe ids fail before fetch.
5. Each call combines caller abort with an injected 30-second deadline, uses redirect error, incrementally reads at most 256 KiB, fatal UTF-8 + existing strict duplicate-key-safe JSON decode, and performs at most one fetch. No retry.
6. Submit outcome must preserve paid ambiguity:
   - only exact HTTP 200 + configured-profile codec success yields trustworthy `RemoteBoundPayloadV1`;
   - any post-fetch non-200 status, malformed/profile-drift 200, transport/body/caller-abort/deadline returns one redacted `submit-ambiguous` outcome suitable for later durable `PROVIDER_SUBMISSION_AMBIGUOUS`;
   - provider-call-before local binding/profile/request drift returns `contract-mismatch`, fetch=0.
   - caller/deadline signal already aborted before fetch begins returns a distinct redacted `pre-submit-aborted` outcome with fetch=0; it must not be called ambiguous because no paid side effect was possible.
   Do not map Hunyuan 400/401/402/422 to provider_failed and do not reuse Marble submit classification.
7. Bound query outcome uses the frozen matrix: `401|403 → PROVIDER_UNAUTHORIZED`; `400|404|422 → PROVIDER_REJECTED`; `429|5xx|transport|body|deadline` remain closed transient; exact 200 decodes `WAIT|RUN|FAIL|DONE`, preserves only sanitized total cost, binds the durable JobId/profile, and keeps legal GLB URL only in ephemeral in-process success result.
   A body stream/read failure is transient, but deterministic `256 KiB + 1` overflow is `PROVIDER_CONTRACT_MISMATCH`, not retryable.
8. Credential/raw response/status text/error/signed URL must not enter rejected/transient/ambiguous errors, diagnostics, durable/HTTP/log/DOM values. A legal decoded DONE result may carry the GLB signed URL ephemerally for the later downloader; do not add a serializer or opaque capability framework.
9. Do not export from a broad package root or modify production composition in this slice. Tests may import the module directly.

## Focused counterexamples and acceptance

At minimum cover:

- exact submit/query method, URL, Authorization value, headers, body, redirect policy, signal, and one-fetch count;
- two profiles are tested separately from configured service instances; runtime never falls back from one to the other;
- valid submit binding and legal query `WAIT/RUN/FAIL/DONE`, including optional legal failure/success cost and unique GLB with optional ignored OBJ;
- submit `400/401/402/422/429/5xx/other status`, malformed/profile-drift 200, fetch/body/abort/deadline all produce the same redacted ambiguous class after exactly one fetch;
- query `400/401/403/404/422/429/5xx`, malformed/identity drift, fetch/body/abort/deadline hit their distinct closed query classes;
- forged binding/provider/model/request/profile/digest and remote provider/job mismatch produce contract mismatch with fetch=0;
- unknown/duplicate JSON key, invalid UTF-8, 256 KiB+1, bad JobId/RequestId, profile envelope mismatch, WAIT/RUN outputs/cost, FAIL outputs, DONE duplicate/missing GLB all fail closed;
- no `Bearer`, credential, raw body/status/error, or signed URL appears in non-success serialized outcomes; no Hunyuan rule changes Marble tests.

## Allowed modifications

- new `apps/agent-gateway/src/hunyuan-generation-service.ts` and tests;
- only minimal reuse fixes to existing generation provider transport/codecs/tests if a frozen Hunyuan fact is inaccessible.

If this requires changing durable journals, lifecycle coordinator, download transport, Artifact CAS, Gateway routes, Studio, World, production composition, or adding a new generic abstraction/parser, stop and report a blocker.

## Forbidden actions

- No Keychain/credential read, network access, real Hunyuan/Marble request, or real generation.
- No retry/poll loop, durable state append, download/publication/UI/World mutation.
- No commit/push/merge/rebase/reset/clean/deploy or Coordinate/MultiNexus/Discord production mutation. Preserve unrelated dirty changes.

## Verification and RESULT

Run focused tests, then full tests, typecheck, build, `git diff --check`, Harness validate/doctor. Return a Chinese structured RESULT with changed files, exact outcome contract, counterexamples, exact gate counts, boundaries, branch/HEAD/status. Worker RESULT is not approval.
