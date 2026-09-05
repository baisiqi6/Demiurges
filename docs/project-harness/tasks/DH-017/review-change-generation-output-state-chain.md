# DH-017 Review Change — Generation Output State Chain

## Verdict being addressed

`changes_requested`; one bounded recovery-integrity correction is required before this slice can advance.

## Required correction

1. In `GenerationRecordJournal.resumePending()`, when the durable `head.json` already identifies the witnessed pending record, reject any extra final record outside the committed head chain **before** unlinking `.record.next` or `.record.next.witness`.
   - The only supported one-extra-final shape is the normal pending `head + 1` final while the head has not yet advanced.
   - Add a focused counterexample: stop after `head-directory-synced`, inject a foreign `head + 1` final record, reopen, call `resumePending()`, expect `GENERATION_RECOVERY_REQUIRED`, and prove the pending next/witness plus foreign evidence are all preserved (zero cleanup mutation).
2. Remove the redundant explicit `"outputs_ready" | "downloading" | "validating"` members from `GenerationStateV1`; they are already included through `EarlyGenerationStateV1`. Do not rename the existing public type in this slice.

## Explicit non-goals

- Do not remove or change pre-existing package-root exports in `generation-output-contracts` or `index.ts`; that reviewer observation is unrelated to this Worker slice.
- Do not add a transaction framework, generic orphan cleaner, new recovery state, capacity authority, publication logic, CAS, startup wiring, provider calls, routes, UI, or World mutations.
- Do not modify any file outside `generation-record-journal.ts/.test.ts` and the minimal `generation-state.ts` union cleanup unless a concrete blocker is reported first.

## Verification

- Run the focused state/journal tests.
- Run package typecheck and whitespace/diff checks for the touched files.
- Return exact results and changed paths; do not claim reviewer approval.
