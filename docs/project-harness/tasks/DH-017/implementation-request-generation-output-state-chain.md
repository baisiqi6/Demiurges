# DH-017 Phase 3 implementation request: durable output state chain through validating

## Role and objective

You are the writable coding Worker for one bounded prerequisite slice in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Extend the existing durable Generation record chain from the already implemented
early provider states through the successful private-output path:

```text
polling -> outputs_ready -> downloading ... -> validating
```

The purpose is narrow: a later generated-set admission must be able to prove its
candidate set came from the exact durable Generation chain instead of trusting a
caller-supplied in-memory payload.

Do not implement capacity admission, `artifact.publish-generated-set` intent
writing, `publishing`/`verified`, public CAS, startup publication recovery, or
download filesystem mutations in this slice.

## First-principles and simplicity boundary

- Reuse `GenerationIntentV1`, `RemoteBoundPayloadV1`, `PollBudgetV1`,
  `requireOutputsReadyPayload`, `requireActiveDownloadPayload`, and
  `requireDownloadBudgetTransition`. Do not copy their schemas.
- The trusted remote binding must be reconstructed from the bounded durable
  chain. A route/caller must not pass a second remote identity into the record
  decoder as authority.
- Keep one chain truth. Extend the existing `GenerationStateRecordV1` /
  `GenerationRecordJournal` path; do not create a parallel journal, event store,
  workflow engine, transaction abstraction, registry, or generic state-machine
  framework.
- Implement only the successful path needed to reach an all-candidate
  `validating` head. `timed_out`, cycle-2 resume, discard/filesystem execution,
  `artifact_rejected`, `publishing`, and `verified` remain later slices unless a
  tiny type-only prerequisite is unavoidable.
- Existing early-state bytes, digests, filenames, transition semantics, and
  package-root compatibility must remain byte-identical.

## Required durable semantics

1. Widen the exact state-record payload union only with:
   - `outputs_ready: OutputsReadyPayloadV1`;
   - `downloading: ActiveDownloadPayloadV1`;
   - `validating: ActiveDownloadPayloadV1`.
2. Validate a complete bounded chain in sequence/digest order so the decoder can
   retain the exact earlier `remote_bound` evidence while reading later records.
   The maximum remains `GENERATION_STATE_MAX_SEQUENCE = 511`; do not add an
   unbounded scan or caller-maintained context object.
3. `polling -> outputs_ready` must use the same durable remote-bound ancestor and
   the immediate polling payload as `currentPollBudget`; provider/job/request
   drift fails closed.
4. `outputs_ready -> downloading` may only introduce the same remote output
   identity and a valid next `DownloadBudgetV1` derived from the exact initial
   budget. Choose the smallest rule consistent with the canonical path: either
   an unchanged initial budget state marker or exactly one legal first member
   transition, but freeze that single rule in tests and do not allow arbitrary
   jumps.
5. Each `downloading -> downloading` record must preserve the remote output
   identity byte-exact and use `requireDownloadBudgetTransition` against the
   immediate predecessor record digest. This gives exactly one member/global
   budget transition per record and preserves already completed candidates.
6. `downloading -> validating` must preserve the complete active payload
   byte-exact and require every provider-required ordered member to be final
   `stage: "candidate"`. It must not accept `idle`, `reserved`, `owned-next`,
   `discard-authorized`, `discarded`, or `cleanup-authorized` members.
7. `validating` is a stop state for this slice: no later transition is admitted
   yet. The future publication-admission slice will add the next authority.
8. The record journal's `readCurrent()`, pending-record resume, and `append()`
   must all validate the same full-chain semantics. A handcrafted individually
   valid later record that lacks the required durable ancestor/transition must
   fail closed.
9. Do not export a raw chain writer, later-state mutation capability, or new
   coordinator from `packages/world-project/src/index.ts`. Existing public
   generation-state helpers may retain their current compatibility; if an
   internal full-chain helper is necessary, keep the smallest surface and
   document why it is not an authority by itself.

## Focused counterexamples and acceptance

Cover at minimum:

- valid Marble and Hunyuan chains from `admitted` through `validating`, with
  deterministic record digest/filename behavior and all provider-required
  members final candidates;
- `outputs_ready` without a durable `remote_bound` ancestor, or with provider,
  job/request identity or poll-budget drift, fails closed;
- `outputs_ready -> downloading` arbitrary multi-member jump fails closed;
- `downloading -> downloading` two-member change, candidate rollback, candidate
  drift, remote-output drift, wrong checkpoint digest, and illegal stage jump
  fail closed;
- `downloading -> validating` with any non-candidate member or changed payload
  fails closed;
- a forged later record with locally self-consistent digest cannot be accepted
  when the earlier durable chain does not support it;
- pending `.record.next` resume applies the same chain rules and does not bypass
  them after a crash boundary;
- all existing early-state golden/digest/transition and journal crash tests stay
  green;
- no package-root export, provider call, downloads mutation, capacity/Operation
  mutation, public CAS, startup change, Gateway/UI/World dependency, or generic
  framework.

Use real existing payload constructors/fixtures. Do not manufacture a second
schema merely to make tests short.

## Allowed modifications

- `packages/world-project/src/generation-state.ts`
- `packages/world-project/src/generation-state.test.ts`
- `packages/world-project/src/generation-record-journal.ts`
- `packages/world-project/src/generation-record-journal.test.ts`
- minimal changes to `packages/world-project/src/generation-output-contracts.ts`
  and its test only if an existing exact validator must be exported or a single
  missing successful-transition helper is required

If correctness requires implementing download filesystem authority, discard /
timed-out semantics, capacity/single-flight admission, an internal Operation
writer, `publishing`/`verified`, public CAS, or startup recovery, stop and report
the exact dependency instead of expanding the slice.

## Worker lifecycle and boundaries

1. After EXharness assignment, the Worker itself must run `harnessctl accept`;
   Operator does not accept on the Worker's behalf.
2. Preserve every unrelated dirty worktree change. No reset/clean/stash/checkout
   overwrite.
3. No network, Keychain, credential/provider request, real generation, Git
   commit/push/merge, deploy, or production Coordinate/MultiNexus/Discord
   mutation.
4. Test fixtures may mutate only isolated temporary Data Roots.

## Verification and RESULT

Run focused tests first, then proportional/full serial tests, root typecheck,
build, `git diff --check`, Harness validate and doctor. Return a Chinese
structured `RESULT` with:

- exact changed files and state/chain semantics;
- counterexamples and exact test/gate counts;
- package-root and side-effect boundary attestation;
- branch/HEAD/status and any residual dependency or risk.

Worker `RESULT` is implementation evidence, not reviewer approval.
