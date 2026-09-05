# DH-017 Implementation Request — Durable Pre-submit Checkpoint

## Outcome

Connect an already durable first-generation `admitted` record to the smallest provider-independent pre-submit state transition. This slice must end before any credential read, provider service call, network request, or paid side effect.

The durable Generation chain must be able to say exactly one of:

- local preflight is ready and `submit_started={submitAttempt:1}` is durable; or
- a closed local reason is durable as `pre_submit_blocked={code,preSubmitResumeCount:0}`.

Do not implement submit classification, remote binding, poll, download, publication, status routes, Human resume, or UI here.

## Required design

1. Add one small package-owned coordinator around the existing `GenerationRecordJournal`; do not introduce a lifecycle framework, repository, event bus, transaction layer, or second journal.
2. Authority comes from the live `OpenedDataRoot` + live writer lease + exact durable first-generation intent/chain. Caller supplies only the safe generation identity/binding discriminator, trusted RFC3339-millisecond `recordedAt`, and one closed decision:
   - `ready`; or
   - `blocked` with only `CREDENTIAL_UNAVAILABLE | REQUEST_ABORTED | GENERATION_CAPACITY_REACHED | PROVIDER_CONTRACT_MISMATCH`.
   No caller path, record digest, raw payload, counter, lease, credential, provider response, or error text is accepted through the public facade.
3. Before the first record mutation, re-read and prove only the facts owned by this transition: live root/lease, exact durable intent, validated current `admitted` chain or matching pending successor, and shared receipt/generation capacity including the two future generated-set slots. Birth, physical-inode and publication joins remain owned by admission/startup/publication/reader boundaries and must not be repeated here.
4. `ready` appends exactly one `submit_started={submitAttempt:1}` record using the existing pending-record/witness/head protocol. `blocked` appends exactly one `pre_submit_blocked={code,preSubmitResumeCount:0}` record through the same journal.
5. Exact replay of an already durable target record is read-only and returns current truth without a second record. A different requested decision, binding/request digest drift, advanced state, conflicting pending record, capacity drift, or root/lease drift fails closed before a new mutation.
6. Do not introduce a checkpoint capability/evidence object. The next submit slice reads durable state directly and remains the only network authority.
7. Expose only the narrow safe facade needed by `WorldProjectRuntime`; do not export raw journal/coordinator/root/lease/capability. Do not wire a Gateway route or provider service in this slice.
8. Reuse existing state codecs, capacity inspection/calculation and journal fault protocol. Do not re-scan birth/catalog/publication evidence or duplicate generic hostile-object validation at this internal typed boundary.

## Required counterexamples

- Marble and Hunyuan exact admitted chain each reach one `submit_started`; replay does not change head/record count/inodes.
- Each allowed blocked code reaches one exact `pre_submit_blocked` with count `0`; unknown/provider/runtime/raw codes reject.
- Same generation concurrently requests the same decision: one durable next record. Conflicting ready-vs-blocked decisions never produce two records.
- Capacity near-boundary rejects before `.record.next` creation.
- Conflicting pending `.record.next`/witness, wrong generation/request/binding and a closed lease fail closed with existing evidence preserved.
- Journal kill points reuse the current `.record.next` + witness protocol and converge to the same digest/recordedAt; do not generate a second successor.
- Source/package-boundary test proves zero imports/calls to Marble/Hunyuan services, transport, Keychain/credential locator, fetch/network, Gateway/Studio/World/Agent tools.

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
