# DH-017 implementation review request — phase-aware generated-set visibility reader

## Reviewer posture

Perform an independent, read-only implementation review from the product intent: users may observe either no generated set or one complete, exact, durable set. Apply first principles and Occam's razor. Look for real visibility, authority, boundedness, and restart defects; do not request speculative frameworks or defense unrelated to the supported filesystem/protocol.

Do not read Worker session/RESULT, current review packet, prior reviewer output, or historical review notes. You may read this request, the canonical implementation request/plan, actual code/tests, and directly relevant existing modules. Preserve the dirty worktree. No writes, network, credentials/provider calls, Git mutation, or production actions.

## Product-level question

Does the safe reader rebuild one complete published join from durable truth on every list/read, expose only complete verified sets and exact member bytes, remain bounded and read-only, and keep raw CAS/path/join/writer authority private without unnecessary machinery?

## Primary surface

- `packages/world-project/src/generated-artifact-reader.ts` (or the Worker-chosen equivalent) and focused tests
- any surgical read-only helper change in generated-set publication/startup/visible modules
- the narrow `packages/world-project/src/index.ts` export

## Mandatory review questions

1. Is catalog only an enumeration pointer, with exact result, current `verified` Generation payload, publication binding, set, all member records/pointers/bytes, and cross-record identities required before visibility?
2. Does the join derive trusted identities from durable inputs rather than caller fields or prior-process WeakMap/writer evidence?
3. Are catalog enumeration and every record/bytes read bounded, no-follow, stable, and closed against unknown filename/type/mode/symlink/replacement drift?
4. Is Marble always zero or exact ordered two members and Hunyuan zero or exact one, with no result-lag/publishing/partial-member visibility?
5. Does `read(generationId, assetId)` prove membership in the freshly joined visible set and return only stable verified bytes, never a raw path/digest lookup or hidden/static artifact?
6. Are empty/uninstalled states distinguished from contradictory durable evidence without repair or writer lease?
7. Does package root expose only safe reader/DTO/error types while raw join/evidence/path/capability stays private and static reader/OperationJournal authority stays unchanged?
8. Are tests adversarial and meaningful, including same-bytes replacement/phase drift, 257 limit, catalog-only/result-only/pre-verified, missing Marble member, cross-record drift, cross-set read, and repeated zero-mutation reads?
9. Is the implementation the smallest sufficient read-only facade, with no cache/repository/query framework or Gateway/UI/product expansion?

## Verification

Run focused tests and typecheck; run full tests if proportionate. Report exact commands/results and do not trust Worker gate claims.

## Verdict format

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 with exact file/line evidence and minimal fix
- checks/counterexamples/tests actually run
- boundary attestation

Report P0/P1 immediately to the Operator, then finish only bounded review closure. If none remain, explicitly state P0/P1/P2=0.
