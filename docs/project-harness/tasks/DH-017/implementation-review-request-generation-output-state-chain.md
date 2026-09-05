# DH-017 Phase 3 limited-fresh review: durable output state chain through validating

## Reviewer role and context mode

You are an independent read-only Reviewer. Use **limited-fresh** context:

- start from this request, the product intent below, the canonical DH-017 plan,
  current code/tests, and current Git/worktree facts;
- do not read Worker RESULT, earlier reviewer verdicts, prior-round plan-review
  narratives, or current review packet content;
- do not edit files or run any command that mutates the repo, Git, Data Root,
  network, credentials, provider state, Coordinate/MultiNexus, or deployment.

The Operator will run dynamic gates separately. Your job is correctness,
authority, simplicity, and review—not approving the Worker because tests are
claimed green.

## Bottom-level product intent

DH-017 must publish generated Artifact sets only from durable, restart-safe
Generation truth. The immediate problem in this slice is that the previous
record journal stopped at early provider states, while candidate/publication
planning consumed an in-memory output payload. A later publication admission
must be able to prove `outputs_ready -> downloading -> validating` from the
exact durable chain, including the original remote binding and per-record
download-budget transitions.

At the same time, the user explicitly prefers first principles, Occam's razor,
and minimal mechanisms. Do not reward defensive complexity that does not serve
a real crash/authority boundary. Ask whether the implementation solves the
actual durable-truth gap with the smallest local extension, or has created a
parallel state framework / unnecessary public surface.

## Canonical boundaries

Read:

- `docs/project-harness/tasks/DH-017/plan.md`, especially the durable state
  payload/transition and candidate-carry sections around the private download
  state machine;
- `docs/project-harness/tasks/DH-017/implementation-request-generation-output-state-chain.md`;
- current:
  - `packages/world-project/src/generation-state.ts`
  - `packages/world-project/src/generation-state.test.ts`
  - `packages/world-project/src/generation-record-journal.ts`
  - `packages/world-project/src/generation-record-journal.test.ts`
  - `packages/world-project/src/generation-output-contracts.ts`
  - `packages/world-project/src/generation-output-contracts.test.ts`
  - `packages/world-project/src/index.ts`
- only the narrow imported code needed to verify exact helpers or existing
  journal semantics.

This slice is allowed to write durable Generation state records in isolated
tests through the existing journal. It is not allowed to implement provider
calls, download filesystem ownership, discard/timed-out/cycle-2, capacity,
single-flight, internal Operation intent, `publishing`/`verified`, public CAS,
startup recovery, Gateway/UI/World, root export, or a generic framework.

## Review questions

Start from the real problem, not only the implementation-request bullets:

1. Does every accepted later record derive its remote/provider/job/request and
   poll truth from the same bounded durable chain, or can a caller still inject
   a self-consistent second authority?
2. Do normal `append`, `readCurrent`, pending `.record.next` recovery, already
   advanced head cleanup, and handcrafted final records all use one chain
   decoder without a bypass?
3. Are the three newly admitted states exact and no broader than necessary?
   Are existing early record bytes/digests/transitions preserved?
4. Is `outputs_ready -> downloading` deliberately one minimal rule, and do later
   `downloading` transitions use the immediate predecessor digest exactly?
5. Can any member change twice in one record, regress from candidate, drift while
   another member changes, or enter `validating` before the full ordered set is
   final candidate?
6. Are sequence/digest/time/predecessor bounds still closed at 512 records,
   including pending recovery?
7. Did the implementation accidentally expose a raw authority through
   `index.ts`, introduce duplicate schemas, create a generic state framework, or
   touch unrelated product surfaces?
8. Which code/tests can be simplified or removed without weakening the real
   authority/crash boundary? Do not create a finding merely to be strict.

## Required counterexamples

Reason through or inspect executable coverage for:

- missing/foreign remote-bound ancestor, provider/job/request drift, poll-budget
  drift;
- self-consistent forged later record on an unsupported earlier chain;
- `outputs_ready -> downloading` unchanged rule versus one/two-member jump;
- two-member change, illegal stage jump, wrong checkpoint, candidate rollback or
  drift, and unchanged candidate carry while another member advances;
- non-candidate or changed payload entering `validating`;
- pending record before head, head already advanced, and invalid pending pair;
- early golden/digest/transition compatibility and no new package-root export.

If a requested test would only defend an impossible state already excluded by a
single exact decoder, treat it as optional rather than demanding redundant
layers.

## Evidence and verdict

You may use read-only `Read/Grep/Glob`. Do not rely on Worker claims. The Operator
will independently provide/execute tests after your static verdict.

For each P0-P3 finding give exact evidence, real impact, minimal counterexample,
and the smallest correction. Distinguish code fact from unverified runtime
claim. End with exactly one:

- `APPROVE / may_advance=yes`
- `CHANGES_REQUESTED / may_advance=no`
- `BLOCKED / may_advance=no`

Also state context mode, P0/P1/P2/P3 counts, simplicity assessment, scope
attestation, and any verification you personally performed.
