# DH-017 Implementation Request — Confirmed Durable Admission

## Outcome

Connect the already-implemented server-side `GenerationConfirmationStore` to the already-implemented first-generation durable admission path through the existing active `ProductSession` registry.

This slice ends when an exact request is durably visible as Generation state `admitted` (or is replayed/conflicted safely). It must make **zero provider calls** and perform **zero credential reads**.

Keep this as a narrow coordinator/API slice. Do not build a generic workflow engine, transaction framework, retry framework, provider SDK, or background lifecycle manager.

## Required authority and ordering

1. Routes are exact:
   - `POST /api/sessions/:sessionId/generations/prepare`
   - `POST /api/sessions/:sessionId/generations/:generationId/confirm`
2. `sessionId` and `generationId` come only from the decoded route. Body/header/cookie/query/localStorage cannot provide or override either identity. The ProductSession must already exist in the current Gateway registry.
3. `prepare`:
   - strict `application/json`, bounded request bytes, fatal UTF-8, duplicate-key rejection, exact provider-specific request codec via existing `requireGenerationRequest`;
   - stores the exact prepared request privately with the public confirmation so confirm can derive a binding without adding `idempotencyKey` to the frozen public confirmation payload;
   - returns only safe confirmation/preview truth;
   - provider calls = 0; Data Root mutations = 0.
4. Contract selection is injected server configuration, not caller data. It supplies only an exact provider-compatible `contractProfile` and lowercase 64-hex `contractShapeDigest`. Do not invent a Hunyuan profile/digest or read credentials. If unavailable/drifted, fail before confirmation consumption or durable mutation.
5. Confirm precedence under one in-memory generation single-flight is exact:
   1. validate route/body syntax and request digest;
   2. inspect durable Generation identity by route `generationId` before reading or consuming confirmation;
   3. exact durable binding/request-digest replay returns the current `admitted` truth without consuming/depending on the confirmation; conflicting durable binding returns `OPERATION_BINDING_CONFLICT` and does not consume the token;
   4. only when no durable binding exists may the leader inspect the same-session confirmation, rederive the prepared request/binding from trusted store + injected contract, atomically consume that exact confirmation, create the intent with injected trusted clock, and call the existing `FirstGenerationCoordinator`/birth machinery;
   5. followers never consume a second token. A follower abort must not cancel a leader that has started durable admission.
6. Response loss after durable admission must be retryable with the already-consumed confirmation id: route generation id + request digest finds and replays durable truth.
7. Same generation id with different request/provider/model/prompt is conflict and performs zero provider calls. Foreign/expired/mismatched/forged confirmation never consumes another session's valid token.
8. Preserve all existing Generation namespace/birth/capacity/recovery invariants. Reuse those implementations; do not duplicate their filesystem protocol.

## Small implementation surface

Expected files (adjust narrowly when existing boundaries make a nearby test/helper necessary):

- `apps/agent-gateway/src/generation-confirmation.ts` and tests: retain private prepared request and expose the minimum inspect/consume semantics needed for precedence.
- one small Gateway coordinator/API module and focused tests.
- `apps/agent-gateway/src/product-session-api.ts` and composition tests: exact active-session routes only.
- `packages/world-project/src/first-generation-coordinator.ts` or one adjacent package-internal read-only helper: inspect durable first-generation intent/current state without mutation.
- `packages/world-project/src/world-project-runtime.ts` only if a safe package-owned admission facade is necessary so Gateway never receives the writer lease.
- package root exports only for safe DTO/facade types actually required by Gateway. Do not export raw journal, lease, recovery plan, or filesystem authority.

Reuse the existing exact JSON parser if practical; do not introduce a second large JSON/parser framework just for two routes.

## Exact slice boundary

In scope:

- prepare and confirm HTTP adapters;
- active ProductSession authority;
- confirmation inspect/consume ordering;
- generation-id single-flight;
- safe contract configuration;
- durable first-generation `admitted` birth/replay/conflict;
- stable public error mapping and focused adversarial tests.

Out of scope:

- `MarbleGenerationService` or `HunyuanGenerationService` invocation;
- Keychain, credentials, network, authenticated capture, paid submit;
- `submit_started`, `pre_submit_blocked`, polling, resume, download, inspection, CAS, generated-set publication;
- Studio generation form/status UI;
- multi-generation framework, archive/GC;
- World/Snapshot/Project/Repository/Episode/Evaluation/AdoptPolicy/four-tool changes;
- Coordinate/MultiNexus/Discord production actions, Git commit/push/merge/deploy.

## Required counterexamples

- prepare: malformed/non-JSON/wrong media type/oversize/duplicate key/unknown key/false or absent `costUnknownAccepted` or `waitForCompletionAndDownload`; all zero Data Root mutation and zero provider call.
- route authority: missing/foreign session, encoded slash, body/header/cookie/query session spoof; cannot consume a valid token.
- confirmation: foreign session, wrong generation, wrong digest, expired, already consumed with no durable binding; original valid token remains when mismatch applies.
- precedence: durable exact replay succeeds after token consumption and after a new Gateway confirmation store; durable conflict does not consume a valid token.
- concurrency: same binding concurrent confirm yields exactly one durable birth; follower waits/replays; aborted follower does not cancel leader.
- drift: configured provider/profile/digest changes between prepare and confirm fail before consume/mutation.
- capacity/recovery: capacity-reached and injected birth fault preserve evidence and expose only stable codes; no provider imports/calls.
- public/package boundary: no raw root path, lease, journal, confirmation private prepared request, provider request, credential, or error text in response.

## Gates and RESULT

Before editing, run:

```bash
.artifacts/harness/harnessctl accept DH-017 omp-deepseek-v4-flash-admission-worker dh017-confirmed-admission --branch agent/codex/DH-017
```

Then report `ACCEPT` before implementation. Preserve the dirty worktree; never reset/clean/stash.

Run focused tests first, then:

```bash
bun test --max-concurrency 1 --reporter=dot
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

If global `git diff --check` fails only on an unrelated pre-existing dirty file, do not edit it; run scoped checks and report exact evidence.

RESULT must list changed files, exact ordering/authority, counterexamples, test totals, boundaries, branch/HEAD, and any remaining blocker. Worker RESULT is not reviewer approval.
