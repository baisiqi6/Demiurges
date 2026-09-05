# DH-017 Implementation Request — Fake Provider Vertical Loop

## Outcome

Close the smallest local product loop after the existing durable fake submit:

`remote_bound -> one fake poll -> fixed artifact bytes -> inspect -> publish -> verified -> list/read`

Both Marble and Hunyuan use injected in-process fixture bytes only. No network, credentials, paid provider action, production route, or new lifecycle framework.

## Minimal design

1. Add one package-internal coordinator. It owns no new journal or repository and reuses `GenerationRecordJournal` plus the existing inspector/publication pipeline.
2. Accept only an exact durable `remote_bound` generation, a provider-bound remote output identity, ordered provider roles, and fixed bytes. Validate all bytes before the first mutation.
3. Write the shortest valid state chain and private candidate files, then call the existing candidate-plan, admission, publication, visible-commit, and verified-transition functions.
4. Exact `verified` retry is read-only. Unsupported partial states fail closed; do not build retry, backoff, download, recovery, audit, or multi-generation abstractions in this slice.
5. Keep the coordinator package-internal. Existing `GeneratedArtifactReader`, Gateway API, and Studio client remain unchanged.

## Acceptance

- Marble fixed SPZ + collider GLB reaches one verified set and both assets list/read.
- Hunyuan fixed object GLB reaches one verified set and lists/reads.
- Invalid bytes or provider role/order mismatch creates no poll record, candidate, catalog, or result.
- Calling again after `verified` adds no record and replaces no public bytes.
- Focused tests, full serial tests, typecheck, build, scoped diff check, Harness validate and doctor pass.

## Boundaries

No real provider call, URL download, retry engine, polling scheduler, startup framework, cleanup/GC, Gateway/Studio mutation, World authority, Keychain, Git mutation, commit, push, merge, or deploy.

## Dev-only HTTP closure

After the package-internal loop is green, expose exactly one explicit scripted-fixture-only endpoint:

- `POST /api/dev/fake-generation` with no body or query;
- it creates/replays one deterministic Hunyuan fake generation using the repo-owned GLB fixture;
- it is composed only by `scripted-fixture-main.ts`, never by production `main.ts` or package `index.ts`;
- the normal `GET /api/artifacts` reader remains the only Studio-visible surface.

The endpoint exists only to close the local HTTP/Chromium happy path. Do not add a Studio generation button, provider selector, request form, background poller, configurable fixture registry, or production feature flag.
