# DH-017 implementation review request — generated Artifact read-only Gateway API

## Reviewer posture

Independent read-only review from the product intent: the Gateway may expose only complete package-verified generated sets and exact member bytes, while remaining a thin HTTP adapter. Apply first principles and Occam's razor; flag actual visibility/routing/error leaks, not hypothetical platform frameworks.

Do not read Worker RESULT/session/messages, current review packet, historical reviewer output, or review notes. Read this request, its implementation request, relevant canonical plan sections, actual code/tests, package reader/runtime, static asset API and composition. Preserve dirty worktree; no writes/network/provider/credentials/Git mutation.

## Product question

Does the Gateway delegate all dynamic visibility/membership truth to `GeneratedArtifactReader`, strictly parse the two read-only routes, return stable bounded responses without leaking raw state, and avoid widening mutation/World/Agent authority?

## Mandatory checks

1. Exact list/read routes and strict method/path/query/range/percent-decoding behavior.
2. No raw path/digest/static-registry fallback; `generationId + assetId` membership comes from the safe package reader.
3. Media type/length/identity headers come from the same verified member summary, not caller input or a second mutable map.
4. Reader recovery/not-found/Data Root unavailable/abort map to stable 409/404/503/408 bodies without exception messages.
5. Empty list is normal; partial/pre-verified/cross-set truth cannot be surfaced by HTTP composition.
6. Reader and writer runtime modes can read without acquiring a new writer lease or causing repair; absent Data Root does not bootstrap.
7. Composition preserves static asset API, ProductSession routes, World Project v1 and exactly four Agent tools.
8. Tests directly exercise malformed encoded paths, extra segments, query/range/method, cross-set reads, recovery redaction, media headers and runtime-unavailable behavior.
9. Implementation is thin and direct: no cache/registry/repository/background loop/generic router framework.

## Verification/verdict

Run focused tests and typecheck; full tests if proportionate. Return `decision`, `may_advance`, P0/P1/P2 with minimal fixes, checks, commands/results and boundary attestation. Report P0/P1 immediately, then finish bounded closure. If clean, state P0/P1/P2=0.
