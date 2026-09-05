# DH-017 Phase 3 review request: generated-set publication plan

Independently review the current generated-set publication identity/plan implementation in `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`. Read `implementation-request-generated-set-publication-plan.md` first. Do not read Worker RESULT/session, prior review outputs, current review-packet contents, or harness history. This is read-only review; do not edit files.

Review from product intent, first principles, and Occam simplicity:

1. Prove the operation ID, exact internal binding shape, candidate digest arrays/order, binding digest, catalog body/digest, success result, and fixed receipt/catalog paths are uniquely derived from trusted candidate/storage evidence.
2. Verify the publication binding digest really is byte-compatible with the existing `operationBindingDigest` algorithm (canonical exact binding bytes followed by SHA-256), while not widening the current public binding codec or package root.
3. Verify catalog evidence is downstream and cannot enter/cycle into the binding preimage.
4. Verify `deriveGeneratedSetPublicationPlan` requires the exact origin candidate plan and exact origin storage snapshot, performs current near-revalidation on the same live root, and cannot be used as a one-shot admission/mutation capability.
5. Challenge forged/copy/cross-root/cross-plan/cross-snapshot, storage drift, binding/catalog/result drift, sparse/extra/noncanonical arrays, unknown keys, unsafe strings, and serialization leakage.
6. Confirm the module has no writer, OperationJournal mutation, capacity, startup, state journal, CAS publisher, root export, Gateway/UI/World, network, credential, or Git side effect.
7. Apply the simplicity gate: the production module is about 469 lines and the focused test is large. Identify duplicated validators/structures/speculative checks that can be removed without weakening a real authority boundary. Do not propose a generic Operation/codec/builder/repository/transaction framework.

Primary surface:

- `packages/world-project/src/generated-artifact-publication.ts`
- `packages/world-project/src/generated-artifact-publication.test.ts`
- current catalog-path addition in `generated-artifact-layout.ts/.test.ts`
- directly imported candidate/storage/records/generation/data-root/canonical helpers as needed
- `operation-journal.ts` only to compare digest/terminal algorithms and confirm it was not modified for this slice
- `index.ts` only to confirm no new export

Run focused tests, package typecheck, and relevant diff checks as needed. Return a Chinese structured verdict with `decision`, `may_advance`, P0/P1/P2 counts, exact file/line evidence, minimal repairs, actual commands/results, branch/HEAD, and read-only attestation. Approval requires no unresolved P0/P1 and no P2 that materially violates the simplicity goal.
