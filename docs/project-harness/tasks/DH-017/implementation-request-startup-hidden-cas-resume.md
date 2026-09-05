# DH-017 implementation request — startup hidden generated-set CAS resume

## Objective

Close the intentionally deferred startup state `publishing + exact generated-set intent + catalog/result absent`: reconstruct the publication plan from durable Generation/private candidate evidence, resume the existing hidden generated-set CAS protocol, then hand the resulting genuine hidden evidence into the already-approved visible commit and `verified` transition so one startup pass can converge to exact terminal visibility.

This slice is recovery composition, not a new writer. It must reuse the existing hidden-CAS, visible-commit, and Generation journal protocols. It must not add cleanup, list/serve, provider calls, multi-generation machinery, or a generic recovery framework.

## First principles / simplicity

- After restart, durable Generation intent/chain/private candidates and generated-set receipt are the authority; prior-process WeakMap objects do not survive.
- There must remain one hidden-CAS write algorithm. Refactor a small common core if needed; do not copy the bytes/content/by-bytes/provenance/set publication sequence into startup code.
- A startup-specific entry may bypass the live publishing-transition object's identity only after independently proving the exact same durable predicates that object represented.
- The shared core should mint the same real `GeneratedSetHiddenCasEvidenceV1` provenance used by `commitGeneratedSetVisible()`, so existing visible commit and verified transition remain unchanged whenever possible.
- Fail closed and preserve all partial/exact evidence. No unlink or cleanup in this slice.

## Authorized implementation surface

Expected:

- surgical refactor/addition in `generated-set-hidden-cas-writer.ts` and focused tests;
- minimal extension of `generated-set-startup-recovery.ts` and its focused startup tests;
- only if required, a narrow package-internal revalidation accessor in publishing/visible modules;
- no `index.ts` export.

Report `BLOCK` before touching provider/Gateway/Studio/World, public `OperationJournal`, list/serve, cleanup, or unrelated product files.

## Startup durable authority

The existing branded startup plan/action must be original, one-shot, same live root/lease and near-snapshot-equal. Before the first hidden-CAS mutation, prove again:

- exact Generation intent and fully validated chain with current head `publishing={operationId,artifactSetDigest}`;
- exact remote binding, validating candidate members, provider/job/request/role/order/cardinality and fresh inspector-derived records;
- exact generated-set Operation intent receipt and staged intent same inode/body;
- exact publication binding/operationId/bindingDigest/artifactSetDigest and origin-valid rederived plan;
- catalog and result absent;
- closed attempt staging grammar for the currently observed hidden-CAS phase;
- every private candidate path/name/file identity/bytes still matches the durable download record;
- storage preflight is one of the existing supported absent/exact partial shapes; foreign/conflicting/type/mode/symlink/body/inode drift fails closed;
- shared receipt capacity still classifies the matching intent as actual intent 1 + pending result 1 with Generation reservation 0.

No caller supplies a path, record body, storage observation, counter, descriptor, or output role.

## Required implementation shape

1. Extract or expose one package-internal hidden-CAS common core that preserves the approved order:
   - all bytes CAS;
   - all content records and by-bytes pointers;
   - all provenance records;
   - set record;
   - exact fsync/no-replace/idempotent semantics and existing stage hooks.
2. Keep the current live `writeGeneratedSetHiddenCas()` behavior and origin checks byte-compatible; its tests must continue unchanged.
3. Add a narrow startup resume entry owned by the hidden-CAS module. It receives only the rederived current-process intent/plan plus exact startup-bound durable context, reruns the full durable prechecks, calls the same core, and returns a genuine hidden evidence object registered in the existing private provenance map.
4. Change startup `follow-up` apply from read-only no-op to:
   - startup hidden-CAS resume → real hidden evidence;
   - existing `commitGeneratedSetVisible()` → real visible evidence;
   - existing `transitionGeneratedSetVisibleToVerified()` → exact terminal record.
5. After each durable phase, rely on the next existing module's complete revalidation. Do not carry a Phase-A observation across a mutation as unchecked truth.
6. Exact `publishing` sites whose hidden set is already complete must replay through the same core/evidence minting without rewriting target inodes, then continue visible/verified.

## Crash/replay rules

- Existing hidden-CAS fault stages and idempotent exact-target behavior remain the sole protocol; startup must not invent parallel filenames or cleanup.
- A crash anywhere in bytes/content/by-bytes/provenance/set resumes the same target/staged evidence and never creates a different body/digest.
- Once hidden evidence is complete, existing catalog/result/verified fault protocols take over.
- Restart after hidden complete but before catalog, catalog-only, result-complete, or verified uses the already-approved tail classifications; no duplicate Generation record.
- Any unsupported partial, foreign staging entry, missing/replaced private candidate, stale head, capacity/receipt drift or result/catalog appearing during hidden recovery stops and preserves evidence.

## Required counterexamples

- Marble and Hunyuan startup from publishing + all hidden targets absent converge through hidden CAS → catalog → result → one verified record.
- Representative restart residues at each hidden layer (bytes; content/by-bytes; provenance; set) converge using the same final target/staged inode where lineage is required; existing full live fault matrix remains green rather than duplicated wholesale.
- hidden set already complete with catalog/result absent continues without replacing bytes/record/pointer/provenance/set inodes.
- Phase-A→apply drift in private candidate inode/bytes, publishing head, receipt/capacity, attempt entries, or a partial hidden target fails before the next mutation.
- foreign/wrong body/mode/type/symlink/same-bytes replacement where the approved hidden protocol requires lineage fails closed and preserves evidence.
- crash at the handoff boundaries hidden evidence return → catalog stage, visible evidence return → verified append follows existing protocols and produces no duplicate public truth.
- forged/copied/replayed/cross-root/cross-lease startup plan or direct startup hidden-resume invocation fails before mutation.
- package root remains closed; no cleanup/list/serve/provider/network/credential/World action.

## Verification gates

Run focused tests first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped/global `git diff --check` without fixing unrelated shared dirt
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

No network, Keychain, provider call, real generation, cleanup, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact files, how the single hidden writer core is shared, startup authority revalidation, fault/resume evidence, exact gates, branch/HEAD/status, and remaining cleanup/list-serve boundaries. Worker RESULT is not reviewer approval.
