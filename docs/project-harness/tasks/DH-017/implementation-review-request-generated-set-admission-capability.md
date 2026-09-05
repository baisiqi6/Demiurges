# DH-017 independent implementation review — generated-set admission capability

## Reviewer role and product invariant

Independently review the current implementation in
`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`.

Start from this invariant:

> exactly one current first-generation `validating` truth may reserve its already
> budgeted two publication receipt slots and mint one synchronous, one-shot
> permission for the next durable intent write; stale, conflicting, over-capacity,
> cross-root, or replayed evidence must cause zero mutation.

Use first principles and Occam's razor. This is a current-MVP single-generation
gate, not the place to add multi-generation transactions or refactor the public
`OperationSingleFlight`.

## Freshness and read boundary

- Read this request first, then only the canonical capacity/intent-first
  publication sections of DH-017 and the primary files/direct authority imports.
- Do not read Worker RESULT, old reviewer verdicts, current review packet,
  handoff packet, or unrelated progress/findings.
- Read-only only: no source edit, network, credentials, provider/Git/production
  action. Focused tests/typecheck/diff check are allowed if the mode permits.

## Primary files

- `packages/world-project/src/generated-set-admission.ts`
- `packages/world-project/src/generated-set-admission.test.ts`
- `packages/world-project/src/generated-set-publication-eligibility.ts`
- `packages/world-project/src/data-root-capacity.ts`
- `packages/world-project/src/data-root-capacity-inspection.ts`
- `packages/world-project/src/generation-namespace-inspection.ts`
- directly relevant tests/codecs only

## Questions

1. Is capacity reconstructed from exact durable receipts and the revalidated
   `validating` eligibility, with the existing reservation counted exactly 2 and
   `request:"none"` (no double count)? Is `capacity-reached` used only for a
   valid snapshot rather than malformed/conflicting evidence?
2. Does the first-generation global surface truly reject second data/catalog,
   birth-staging, wrong type/symlink, nonterminal namespace, and any existing
   generated-set internal receipt? Check whether weaker local mode tests are
   already dominated by stronger namespace/eligibility validation before calling
   them; flag only exploitable gaps, not redundant style.
3. Are expected publication intent/result/catalog targets proven absent and
   layout-derived before mint and consume?
4. Is same-process single-flight exact and minimal? Can two different plans on
   the same lease mint, or can an old active capability survive a drift in a way
   that permits unsafe consume? Distinguish safe repeated read-only authorization
   from mutation authority replay.
5. Is consume one-shot in all paths? Verify forged/cross inputs do not consume a
   legitimate capability, but once origin inputs pass, any failed near-
   revalidation poisons it before returning. Look for ordering or exception paths
   that leave reusable authority.
6. Is returning the origin plan safe under the explicit synchronous no-await
   handoff contract, given cross-process writer lease and next-slice near-mutation
   validation? Do not demand an async lock without a concrete interleaving.
7. Are capability/result objects, WeakMap provenance, error behavior, package-
   root boundary, no-mutation surface, and tests sound and proportionate?
8. Confirm the near-cap test math: if exact terminal-installed first-generation
   parity makes 2048 unreachable, 2047 ready / 2049 reached is acceptable only if
   independently derived and documented, not hand-waved.

## Required verdict

Return `decision`, `may_advance`, P0/P1/P2 findings with exact evidence and a
minimal counterexample, checks against invariant/simplicity, personally run
commands/results, and boundary attestation. Do not write EXharness review-result
yet; Operator will request it after corrections and independent dynamic gates.
