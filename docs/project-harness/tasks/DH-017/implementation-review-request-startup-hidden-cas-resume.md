# DH-017 implementation review request — startup hidden generated-set CAS resume

## Posture

Independent read-only review. Do not read Worker RESULT/messages/session, `current/review-packet.md`, prior reviewer outputs, or historical review notes. Start from the durable product truth and first principles: restart must not lose a paid generation's already-validated private candidates, but it must also never manufacture authority from caller memory or create a second CAS publication protocol. Apply Occam's razor and reject unnecessary frameworks or duplicated defenses.

No writes, installs, network, credentials/provider calls, cleanup, Git mutation, or production actions. Preserve the dirty worktree.

## Product question

Can startup now take the exact `publishing + intent + no catalog/result` durable state, resume one and only one hidden generated-set CAS writer from verified private evidence, then safely reuse the approved visible commit and verified transition—across crashes and drift—without widening public authority?

## Primary files

- `packages/world-project/src/generated-set-hidden-cas-writer.ts`
- its focused tests
- `packages/world-project/src/generated-set-startup-recovery.ts`
- startup/visible focused tests changed for this slice
- any narrowly changed publication/visible/verified accessor

## Relevant authority

- `docs/project-harness/tasks/DH-017/implementation-request-startup-hidden-cas-resume.md`
- `docs/project-harness/tasks/DH-017/plan.md`
- Generation chain/record journal, dynamic inspector, candidate/publication plan
- storage preflight, generated records, hidden writer, visible commit, verified transition
- startup global preflight/capacity and `index.ts`

## Mandatory questions

1. Is there still exactly one hidden-CAS write order/implementation, shared by live and startup paths rather than copied?
2. Does the live writer keep its existing origin checks, fault semantics, names, bytes and return evidence compatibility?
3. Does startup independently rederive and near-revalidate the exact durable predicates represented by the lost live publishing-transition evidence: head, intent, binding, candidates, inspector records, storage, attempt grammar and capacity?
4. Can caller-provided paths/records/storage/counters/descriptors/roles or a copied startup plan influence the writer?
5. Does the startup entry mint a genuine existing hidden evidence object whose private provenance makes the unchanged visible commit accept it only for the same root/lease/intent/plan?
6. Does apply perform hidden resume → existing visible commit → existing verified transition, with each module revalidating after the previous mutation rather than trusting stale Phase-A observations?
7. Do absent, each supported exact partial hidden layer, and already-complete hidden set converge idempotently without replacing exact target/staged inodes where lineage is required?
8. Do unsupported partials, foreign attempt entries, candidate/head/receipt/capacity drift, body/mode/type/symlink/lineage mismatch fail before the next mutation and preserve evidence?
9. Are handoff crashes between hidden/visible and visible/verified governed by existing protocols with no duplicate catalog/result/record?
10. Does the change avoid cleanup/list/serve/provider/network/World/public `OperationJournal` or package-root authority, and stay small rather than becoming a generic recovery framework?

## Counterexample closure

- Marble and Hunyuan all-absent startup full convergence;
- representative bytes, content/by-bytes, provenance and set residues plus the existing live full fault matrix;
- already-complete hidden set with inode preservation;
- private candidate, head, receipt/capacity, attempt and target drift;
- forged/copy/replay/cross-root/cross-lease startup authority and direct resume calls;
- hidden→catalog and visible→verified crash handoffs;
- package-root negative export and zero cleanup/list/serve/provider action.

Do not require the startup tests to duplicate every live writer fault row when the same common core and its existing exhaustive suite are demonstrably reused; require a representative restart matrix plus proof of shared implementation.

## Verification

Run focused tests and typecheck; wider tests only when proportionate. Report only commands/results actually run.

## Verdict

- `decision: approved | changes_requested | blocked`
- `may_advance: yes | no`
- P0/P1/P2 findings with exact file/line evidence and smallest required change
- mandatory checks/counterexamples
- tests actually run
- boundary attestation

Immediately report any P0/P1, then complete bounded closure. If none remain, explicitly state P0/P1/P2 counts.
