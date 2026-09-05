# DH-017 Implementation Request — Provider-specific Fake Submit Orchestration

## Outcome

Connect the already durable first-generation `admitted → submit_started` checkpoint to the existing direct Marble/Hunyuan submit services, using injected fake transport only. Persist exactly one provider-specific submit disposition:

- trustworthy remote identity → `remote_bound`;
- World Labs documented proven-non-creation rejection → `provider_failed`;
- every no-trustworthy-identity outcome after submit may have started → `submission_ambiguous`.

Stop before poll/query, download, publication, cleanup, Gateway routes, Studio state, credentials, real network, or paid canary.

## First-principles design

1. Keep this as two narrow seams, not a lifecycle framework:
   - package-owned durable submit-result inspection/append around the existing `GenerationRecordJournal`;
   - a Gateway-internal provider selector that calls the existing `MarbleGenerationService` / `HunyuanGenerationService` through injected instances.
   Do not add a repository, event bus, retry engine, generic state machine, transaction layer, provider SDK adapter, or second journal.
2. The Gateway orchestrator owns the order. It first reads exact durable intent/current truth. If the generation is already `remote_bound | provider_failed | submission_ambiguous`, return read-only replay and make zero provider calls. Otherwise it performs local provider binding/profile preflight before the checkpoint; local mismatch must durable `pre_submit_blocked(PROVIDER_CONTRACT_MISMATCH)` with zero fetch. It then calls the existing `checkpoint(ready)`.
3. Only `checkpoint(ready)` with `replay:false` may begin one submit fetch. If checkpoint returns `replay:true` (`submit_started` was already durable from an earlier process/call), do not submit again: persist `submission_ambiguous(PROVIDER_SUBMISSION_AMBIGUOUS)` and return. Thus crash after checkpoint or after provider call can never cause a second paid submit.
4. Add the smallest zero-fetch binding preflight method to each existing service if necessary; it must reuse the service's existing runtime binding/profile validator and expose only `ready | contract-mismatch`. Do not duplicate request schemas or reveal keys/config internals.
5. Provider-specific classification after the single submit call is frozen:
   - Marble `success` → its codec-produced `remoteBound`;
   - Marble `rejected` from the existing documented submit 400/401/402/422 matrix → exact `provider_failed` code;
   - Marble `contract-mismatch` or any `transient` after the checkpoint → `submission_ambiguous`;
   - Hunyuan `success` → codec-produced `remoteBound`;
   - every Hunyuan non-success after the checkpoint, including `pre-submit-aborted`, `contract-mismatch`, `submit-ambiguous`, thrown transport, or malformed/profile-drift response → `submission_ambiguous`.
   Never reuse Marble's proven-non-creation oracle for Hunyuan.
6. Durable result authority re-reads live root/lease, exact intent/binding, validated current chain or matching pending record, and receipt capacity immediately before append. It validates outcome provider/identity/code against the durable intent and appends only through `GenerationRecordJournal`. Birth, full physical inode and generated-set publication validation stay at their owning admission/startup/publication/reader boundaries.
7. Exact durable outcome replay is read-only: no provider call and no new record. Conflicting outcome, caller identity/provider drift, conflicting pending record, root/lease drift, capacity drift, or advanced unrelated state fails closed before mutation.
8. Gateway composition, production main, Keychain/credential locator, env loading and HTTP routes stay untouched. Tests may instantiate the existing services with a clearly fake sentinel key and injected fake `fetch`; the fake must never leave process memory.

## Required counterexamples

- Marble and Hunyuan trustworthy submit response each produce one exact `remote_bound`; retry makes zero fetch and no new record.
- Orchestrator integration keeps one representative Marble documented rejection, one Marble transient response and one Hunyuan non-success response. The provider service suites own the exhaustive HTTP/body/transport status matrices; do not repeat those matrices here.
- Local binding/profile mismatch happens before `submit_started` and before fake fetch, ending at exact `pre_submit_blocked(PROVIDER_CONTRACT_MISMATCH)`.
- Crash after durable `submit_started` but before fetch, and crash after fake fetch but before durable outcome, both restart as ambiguous with submit count unchanged.
- Concurrent same-generation calls yield one fake submit at most. Conflicting provider/binding/outcome evidence never creates two successor records.
- Journal fault points reuse the existing pending/witness/head protocol and converge to the same disposition digest/recordedAt.
- Source/package boundary proves no production composition, route, Keychain/credential locator, default real `fetch`, poll/query/download/CAS/World/Studio import or call was added.

## Verification

Run focused tests, then:

```text
bun test --max-concurrency 1 --reporter=dot
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Preserve unrelated dirty worktree changes. Do not commit, push, merge, deploy, access credentials, call providers, or run a real generation.
