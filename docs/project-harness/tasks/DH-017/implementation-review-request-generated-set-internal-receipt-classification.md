# DH-017 Phase 3 review request: generated-set internal receipt classification

## Context mode and role

Use `limited-fresh` context. You are an independent read-only Reviewer, not the
Worker and not a mutation authority. Do not read the Worker RESULT/session,
prior review verdicts, `current/review-packet.md`, or historical round-review
outputs. Read this request first, then the canonical plan, implementation request,
current code/diff, and only directly relevant tests/helpers.

Worktree:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

## Product intent

The eventual publisher needs bounded receipt readers to recognize the exact
internal `artifact.publish-generated-set` intent/result without exposing it as a
public `OperationBinding` or allowing package-root mutation APIs to create,
recover, finalize, or clean it. This slice should do only that classification.

Judge from first principles and Occam's razor. A valid classifier must preserve
impossible-state detection; do not approve a broad condition merely because it
makes future receipts parse. Conversely, do not demand admission, capacity
handoff, capability, startup recovery, CAS, or state publication in this slice.

## Canonical inputs

- `docs/project-harness/tasks/DH-017/plan.md`, especially the internal-kind,
  capacity, intent-first publication, public-facade denial, and acceptance
  sections around lines 238-290, 513-522, 685-715;
- `implementation-request-generated-set-internal-receipt-classification.md`;
- current code and tests in:
  - `packages/world-project/src/operation-journal.ts/.test.ts`
  - `packages/world-project/src/data-root-capacity-inspection.ts/.test.ts`
  - `packages/world-project/src/generated-artifact-publication.ts/.test.ts`
  - namespace inspection/binding helpers only as needed;
  - `packages/world-project/src/index.ts` only for the export boundary.

## Mandatory review questions

1. Does the private classifier reuse the exact generated-set binding/result
   codecs and preserve public binding/result behavior?
2. Does `listBindings()` validate hidden internal intent/result evidence while
   returning only public bindings and remaining bounded?
3. Does capacity inspection count physical entries and pending results exactly,
   yet still reject impossible lifecycle combinations? In particular, determine
   whether a generated-set publication receipt can legally coexist with:
   - `absent-no-intent` namespace;
   - `install-intent-pending` namespace;
   - `directory-published-result-pending` namespace;
   - `terminal-installed` namespace.
   Use the canonical ordering: a publication intent requires an admitted
   generation and complete private set, which in turn requires the terminal
   Generation namespace/birth chain.
4. Are namespace receipt identity/count checks still exact, rather than replaced
   by a lower-bound condition that admits unrelated internal evidence in an
   impossible state?
5. Do all package-root authority/mutation entrances reject the internal kind
   before any receipt/staging/catalog/CAS mutation, without widening public types
   or exports?
6. Are the added tests minimal and product-relevant? Flag duplicated fixtures or
   defensive matrices only if they materially complicate the slice; do not ask
   for a framework.
7. Confirm no writer/admission/capability/single-flight/startup/CAS/Gateway/UI/
   World expansion occurred.

## Counterexamples

At minimum execute or reason through:

- exact hidden intent only; exact success/aborted result; result without intent;
- wrong filename, noncanonical bytes, binding/result drift;
- namespace internal + generated-set internal + public receipt in the one legal
  lifecycle phase;
- generated-set intent placed in every nonterminal/absent namespace phase;
- structural/typed generated binding passed through public mutation/authority
  entrances, with receipt/staging snapshots unchanged;
- no package-root export.

## Verdict and boundaries

Run focused tests, package typecheck, and relevant diff checks. You may run the
full suite if useful, but do not edit files. Return Chinese structured:

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 counts
- findings with exact evidence, impact, minimal counterexample, and minimal
  correction
- simplicity assessment
- commands/results and read-only attestation
- branch/HEAD

Approval requires no unresolved P0/P1 and no material simplicity regression.
Reviewer approval is evidence, not permission to commit/push/deploy or begin
public CAS.
