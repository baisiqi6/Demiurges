# DH-017 Independent Review Request — Provider-specific Fake Submit Orchestration

Review the implementation against `implementation-request-provider-submit-orchestration.md` and the canonical DH-017 plan from the product intent outward. Apply first principles and Occam's razor: verify that the implementation creates the smallest safe one-submit boundary, not merely that named tests pass.

## Mandatory questions

1. Can any replay, restart, concurrent follower, exception or journal fault make a second submit fetch after `submit_started` is durable?
2. Is local zero-fetch contract drift separated from post-checkpoint/post-fetch ambiguity without trusting caller claims?
3. Is the World Labs documented no-creation rejection matrix kept strictly provider-specific, with Hunyuan non-success always ambiguous unless a trustworthy identity exists?
4. Does every durable disposition revalidate the exact intent/provider/binding/current chain/capacity/birth/publication absence before its first mutation and reuse the existing journal protocol?
5. Are remote identities codec-produced and state-codec validated, with no URL, raw body, key or provider error persisted or returned?
6. Is the solution still two narrow seams, with no lifecycle/retry/repository/transaction/provider-adapter framework and no production route/composition?

## Required evidence

- Read the implementation request first, then only the files it lists or directly imports for the reviewed path.
- Inspect actual source and focused tests; run focused tests, typecheck and scoped diff. Full tests/build may be credited only with explicit exit evidence.
- Report `approved` or `changes_requested`, P0/P1/P2, concrete counterexample evidence, gates and boundary attestation.
- Read-only only: no Worker RESULT/session, current review packet, prior reviewer output, network, credentials, provider calls, writes or Git mutation.
