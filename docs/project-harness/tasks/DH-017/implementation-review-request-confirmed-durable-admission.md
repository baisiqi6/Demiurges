# DH-017 Review Request — Confirmed Durable Admission

Review the implementation against the product intent, canonical DH-017 plan, and actual code—not only against the worker's checklist.

Start from first principles:

- a paid side effect must remain impossible in this slice;
- session identity is server authority, not caller metadata;
- durable truth outranks ephemeral confirmation;
- exact replay must work after response loss/restart while conflict never consumes a valid token;
- the smallest understandable coordinator is preferred over defensive framework code.

Read:

- `docs/project-harness/tasks/DH-017/implementation-request-confirmed-durable-admission.md`
- relevant confirmation/admission sections of `docs/project-harness/tasks/DH-017/plan.md`
- all changed source/tests and the existing confirmation, ProductSession, first-generation capacity/coordinator/birth code they rely on.

Independently verify:

1. exact active ProductSession route authority and strict bounded request decoding;
2. private prepared request is not exposed and public confirmation schema remains frozen;
3. durable inspect/replay/conflict happens before ephemeral token consumption;
4. single-flight permits one durable birth and follower abort cannot cancel the leader;
5. contract profile/digest comes only from injected trusted config and drift is zero-mutation/zero-consume;
6. Gateway cannot reach provider services, credentials, network, later lifecycle states, raw lease/journal/filesystem authority;
7. namespace/birth/capacity crash safety is reused, not weakened or reimplemented;
8. tests include adverse route, token, replay, conflict, concurrency, capacity and fault cases—not merely happy-path DTO tests.

Run focused tests, typecheck, and proportionate full gates. Report P0/P1/P2 with concrete counterexamples. `approved` requires P0=P1=0 and no material acceptance gap. Do not modify files, credentials, provider state, Git history, or deployments.
