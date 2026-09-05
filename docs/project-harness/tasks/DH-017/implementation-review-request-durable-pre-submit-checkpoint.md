# DH-017 Review Request — Durable Pre-submit Checkpoint

Review the implementation independently against the product intent and canonical DH-017 plan, not merely the Worker checklist.

Start from first principles:

- no provider side effect is possible before `submit_started` is durable;
- `admitted` is durable authority, not caller memory;
- local failure should become one understandable durable `pre_submit_blocked` fact, not a defensive state machine;
- reuse the existing Generation journal/capacity/birth truth instead of creating parallel authority;
- exact replay is read-only and conflicting requests never create two successors.

Read the implementation request, relevant `plan.md` sections, all changed files/tests, and the existing state/journal/capacity/birth modules they rely on. Do not read Worker RESULT/session logs, current review packet, prior reviewer output, or unrelated harness state.

Independently verify:

1. durable admitted/binding/birth/capacity truth is revalidated immediately before the first mutation;
2. only exact `submit_started` or the four closed pre-submit-blocked codes can be appended;
3. existing pending-record/witness/head recovery is reused without a second transaction protocol;
4. replay/concurrency/fault paths cannot create a second successor or new recordedAt/digest;
5. no caller-controlled path/record/counter/raw error/credential/provider response crosses the safe facade;
6. package/runtime boundaries make provider service, network, credential, Gateway, Studio, World and Agent authority unreachable in this slice;
7. tests exercise real durable counterexamples, not only DTO constructors.

Run focused tests, typecheck, and proportionate full gates. Report P0/P1/P2 with concrete evidence. `approved` requires P0=P1=0. Keep the review read-only: no file/Git mutation, credentials, provider/network action, real generation, or deployment.
