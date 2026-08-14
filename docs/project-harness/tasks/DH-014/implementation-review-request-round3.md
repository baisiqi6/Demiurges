# DH-014 Implementation Review Request — Round 3

## Freshness and frozen identity

- Fresh independent read-only implementation review.
- Branch `agent/codex/DH-014`; HEAD/base `c655c544bb88010f42e0dd9e570f7f04923d9b6e`.
- Product aggregate `272717b7ea3c37e59744fb56416ec025ccb58af9609a1228189df028ac8b4012`, computed as SHA-256 of the exact ordered `sha256sum` text below.
- Do not read Round 1/2 request/verdict/remediation files, plan-review files, current review packet, or another reviewer output.
- No writes, Git mutation, provider call/download/generation, secret access, or process cleanup outside reviewer-owned processes.

```text
84170d08fe7f5ca226eb7db677ae4e361c3d0b769c0f5505ff27c7a368b760b8  apps/studio/src/App.tsx
286fc7249a42841ee05a0ce0614aa1a01d88e69223f0e5ec756ca53a3fb69fdc  apps/studio/src/presentation-model.ts
6ee1bdb889d684cecc4c4c070a4aefa0ff52dfb6f2ed3d0b7b58c7e85f140a47  apps/studio/src/presentation-model.test.ts
70a1fc0f7bcd9a25bb98b3f746f238a5fdda19520609109af7e7b26e6733fe50  apps/studio/src/presentation-three/ThreeViewport.tsx
c43abb6b62f02f5a011339042bc053e114d392d3b3681d357486cbabc82dbd60  apps/studio/src/presentation-three/registered-presentation.ts
f2cade353388b77f0ac27c61a0453022142583d5d0584ee7f18f6d35fe8e8472  apps/studio/src/presentation-three/registered-presentation.test.ts
5d99c17c51d2f72f4ef9fbf2d6719a37b719a6238106a97447540ee05b59d952  apps/studio/src/presentation-three/observer-camera.ts
9df6939b9e0d67135e8402c758eb0ce1707f9cf6cca764177b58aeb42e4673ce  apps/studio/src/presentation-three/observer-camera.test.ts
46fc837089bfba750da3210385be37d29d6d7a0299b2d8d2d0b4762b4280f77f  apps/studio/src/presentation-three/camera-rig.ts
14fe55f889547b1539e4c57644fdaf9c5a1b1021517168ae8e3a497ad44e9e5a  apps/studio/src/presentation-three/camera-rig.test.ts
3951dbcaed18777a2e6f9a3882f0677f04882a7f1da9f18f39002417fd5bb987  apps/studio/src/styles.css
```

Read `AGENTS.md`, the canonical scope/architecture/domain/observer design, `tasks/DH-014/plan.md`, the frozen files, and `tasks/DH-014/chromium-acceptance.md`. Existing tests/authority code may be read as needed.

## Mandatory closure

1. `Shift` only and every opposite pair (`W+S`, `A+D`, `Q+E`) leave pose byte-identical and do not continue frames; a real held direction moves on scheduled frames, Shift accelerates it, and keyup stops it. No event-level nudge may survive cancellation.
2. exact Marble admission binds kind + asset + calibration + witness + Entity + representation slot. Existing-but-wrong witnesses, entity/role swaps, duplicates, missing/extra registered representations, manifest/calibration/asset drift all fail closed scenario-wide.
3. sparse/holey, non-finite, inverted, or degenerate vectors/bounds never become registered provenance or non-finite camera state; finite fallback remains deterministic.
4. Observation/Visual resolver failures happen before fetch, cannot reject unhandled, produce finite fallback, and render a visible `role=alert`. App inspector must not repeat an unsafe resolver throw. A later valid refresh clears stale errors.
5. Re-run the complete Observer contract: three modes, registered entry/truth/provenance, Z-up Fly, Inspect focus, Overview fit, editable/lifecycle isolation, reduced motion, collision preference, authority invariance, cache-only provider boundary, and no idle rAF.
6. Confirm no `packages/world/**` or `apps/agent-gateway/**` product diff and global `git diff --check` passes.

Producer reports focused 29/0/139; full 486/0/3519; typecheck/build/diff-check/EXharness pass. Real Chromium valid path has all three assets loaded, exact entry, no integrity alert, Shift-only no continuous frames, and authority unchanged. Independently verify rather than trusting these claims.

Return `decision`, `may_closeout`, P0/P1/P2 with executable evidence and exact lines, commands/probes, and frozen branch/HEAD/hashes/aggregate/status at the end. Approval requires P0=0 and P1=0; stop after request scope.
