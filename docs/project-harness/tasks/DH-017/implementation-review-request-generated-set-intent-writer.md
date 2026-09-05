# DH-017 limited-fresh implementation review — durable generated-set intent writer

## Reviewer role and context mode

You are the read-only independent Reviewer for one DH-017 durability slice in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Context mode is **limited-fresh**: read this request first, then the canonical
plan sections and current code needed to decide correctness. Do not read the
Worker RESULT, prior reviewer verdicts, current review packet, handoff packet,
or unrelated progress/history. This avoids anchoring while retaining the real
product intent.

## Bottom-level product intent

The system has already proved one complete private generated set and reserved
two future receipt slots. This slice must turn that in-memory one-shot admission
into the first durable, crash-recoverable publication fact without exposing
public bytes:

`reservation 2 -> durable exact intent 1 + pending result reservation 1`.

The implementation should be the smallest mechanism that makes that handoff
true. Apply first principles and Occam's razor:

- do not reward defensive code that protects impossible scenarios;
- do not demand a generic transaction/recovery framework for one internal kind;
- do not weaken real inode/fsync/capacity/authority boundaries merely to reduce
  lines;
- distinguish a package-internal read-only provenance accessor from a reusable
  mutation capability.

## Canonical constraints

Read only the directly relevant parts of
`docs/project-harness/tasks/DH-017/plan.md`, especially the shared capacity,
intent-first handoff, internal Operation binding, and package-root authority
sections around lines 238-290 and the relevant acceptance rows.

The live ordering is fixed:

1. consume exact one-shot admission with no `await` gap;
2. create the existing flat 24-hex Operation attempt;
3. write/fsync canonical staged intent, hard-link no-replace to receipt, fsync
   receipts and prove same inode/body;
4. recalculate capacity as validating + matching intent/no result and prove the
   effective count did not change;
5. stop before Generation `publishing` and before any public CAS/catalog/result.

## Primary files

- `packages/world-project/src/generated-set-intent-writer.ts`
- `packages/world-project/src/generated-set-intent-writer.test.ts`
- `packages/world-project/src/generated-set-admission.ts`
- `packages/world-project/src/generated-artifact-publication.ts`
- `packages/world-project/src/data-root-capacity.ts`
- `packages/world-project/src/data-root-capacity-inspection.ts`
- exact filesystem/Data Root helpers directly imported by the writer
- `packages/world-project/src/index.ts` only to verify non-export

## Review questions

1. Does every filesystem mutation require a legitimately consumed capability,
   same live root/lease and exact origin inputs? Can forged/cross/replayed calls
   mutate or accidentally consume a legitimate capability?
2. Is the staged-intent → hard-link receipt protocol actually durable and
   no-replace, with the necessary parent directory fsyncs and same-inode/body
   proof? Check concrete crash windows; do not invent extra fsyncs without a
   persistence reason.
3. Is the post-write capacity handoff proved from current disk evidence, with
   used `+1`, pending `+1`, generation reservation `0`, requested `0`, identical
   effective entries, no result/catalog and unchanged public Operations? Could a
   conflicting or unrelated internal receipt satisfy the count-only checks?
4. Does the returned evidence expose excessive authority or secrets? Is its
   module-private provenance just enough for the next synchronous `publishing`
   slice, or has this slice accidentally created a general raw writer?
5. On EEXIST, fsync ambiguity, same-bytes replacement, drift or injected failure,
   is evidence preserved without unsafe cleanup/overwrite/CAS/state append?
6. Are tests tied to real failure boundaries and proportional? Product code is
   roughly one direct module; flag duplicated policy/abstraction only when a
   smaller implementation would preserve the same durable guarantees.
7. Confirm no package-root export, public Operation facade expansion, public CAS,
   catalog/result, Generation state append, startup/provider/Gateway/UI/World or
   generic framework work slipped into the slice.

## Required counterexamples

- forged/copy/replay/cross-root/cross-lease/cross-plan/cross-eligibility;
- failure at each mkdir/write/link/fsync/takeover boundary;
- EEXIST/conflicting receipt and same-bytes replacement inode;
- post-link result/catalog/public-receipt drift;
- exact near-cap reservation before/after;
- package-root and forbidden dependency scan.

If a finding is real, give exact Evidence, Impact, Minimal counterexample and
Minimal correction. Do not manufacture findings to appear strict.

## Authority and output

- Read-only: no source/docs edit, no Git mutation, network, credentials,
  provider call, deploy or production action.
- In plan mode, do not claim to have run commands that the mode did not permit;
  Operator will independently run dynamic gates.
- Return Chinese structured verdict:
  `decision: APPROVE | CHANGES_REQUESTED | BLOCKED`, `may_advance`, P0/P1/P2,
  checks, unverified facts and boundary attestation.
- Do not run EXharness `review-result`; Operator will request that only after
  corrections and independent dynamic gates.
