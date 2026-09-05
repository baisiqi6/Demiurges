# DH-017 Phase 3 review request: generated-set storage preflight

## Reviewer role

Independently review the current implementation in:

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

Start from the product intent and first principles, not from the Worker RESULT. The product needs a small, read-only evidence gate before a later writer may publish a generated artifact set. This review does **not** authorize implementation changes.

Read the canonical slice request first:

`docs/project-harness/tasks/DH-017/implementation-request-generated-set-storage-preflight.md`

Then inspect only the implementation and directly required contracts/tests. Do not read prior reviewer outputs or Worker session logs.

## Primary questions

1. Does production code remain strictly read-only while proving the private candidate and every fixed public target from current Data Root evidence?
2. Can path traversal, symlinks, wrong types/modes, ancestor replacement, same-bytes inode replacement, unstable absence, noncanonical JSON, duplicate keys, or self-consistent wrong records be accepted?
3. Does the single-fd regular-file snapshot actually prove stable identity plus bytes without trusting a path after it changes?
4. Are bytes CAS, content record, by-bytes pointer, provenance records, and set record checked against the exact candidate-plan truth, including content deduplication?
5. Is the snapshot origin bound to the exact live root object/identity and exact candidate-plan object, and does repeatable near-revalidation reject all evidence drift without becoming a mutation capability?
6. Is the design the smallest direct solution? In particular, challenge the approximately 666-line production module and 1044-line test: identify duplicated walkers/codecs/evidence structures, speculative defenses, or test bulk that can be removed without weakening a real safety boundary. Do not request a generic repository, transaction, registry, graph, VFS, watcher, or framework.
7. Are tests demonstrating behavior rather than merely source-scanning tokens? Are important counterexamples missing or assertions accidentally coupled to fixture layout?
8. Did the implementation stay out of CAS writes, Operation/catalog/result/capacity/startup, package-root exports, Gateway/UI/World, network, credentials, and Git mutation?

## Review surface

- `packages/world-project/src/generated-artifact-layout.ts`
- `packages/world-project/src/generated-artifact-layout.test.ts`
- `packages/world-project/src/generated-set-storage-preflight.ts`
- `packages/world-project/src/generated-set-storage-preflight.test.ts`
- the current diff in `packages/world-project/src/safe-filesystem.ts`
- the current diff in `packages/world-project/src/safe-filesystem.test.ts`
- directly imported DH-017 contracts/inspector/candidate/record/Data Root helpers and their focused tests as needed
- `packages/world-project/src/index.ts` only to confirm there is no new root export

Preserve the dirty worktree. Read-only review may run focused tests, typecheck, and `git diff --check`; do not edit files, commit, push, deploy, use network/Keychain/provider calls, or mutate production Coordinate/Discord.

## Required verdict

Return Chinese structured findings ordered by severity with exact file/line evidence and minimal first-principles repairs. State:

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- `P0/P1/P2` counts
- checks for correctness, authority/TOCTOU, mutation-zero, simplicity/maintainability, tests, and boundaries
- exact commands/results actually run
- branch/HEAD and read-only boundary attestation

Worker tests and RESULT are claims, not review evidence. Approval requires no unresolved P0/P1 and no P2 that materially violates the explicit simplicity goal.
