# DH-014 Implementation Review Request — Round 4

## Freshness and frozen identity

- Fresh independent read-only implementation review.
- Branch `agent/codex/DH-014`; HEAD/base `c655c544bb88010f42e0dd9e570f7f04923d9b6e`.
- Product aggregate `bf66aa8d6e9ac20ad0b465d9267109487c1cdf01264c4c0e1c9e327174f6664e`, SHA-256 of the exact ordered `sha256sum` text below.
- Do not read Round 1–3 requests/verdict/remediation files, plan reviews, current review packet, or another reviewer output.
- No writes, Git mutation, provider call/download/generation, secrets, or cleanup outside reviewer-owned processes.

```text
84170d08fe7f5ca226eb7db677ae4e361c3d0b769c0f5505ff27c7a368b760b8  apps/studio/src/App.tsx
286fc7249a42841ee05a0ce0614aa1a01d88e69223f0e5ec756ca53a3fb69fdc  apps/studio/src/presentation-model.ts
6ee1bdb889d684cecc4c4c070a4aefa0ff52dfb6f2ed3d0b7b58c7e85f140a47  apps/studio/src/presentation-model.test.ts
daa53252286c9989b4ff2317fcef493d3928fcc589b78fbf0136a42c87dec172  apps/studio/src/presentation-three/ThreeViewport.tsx
1a014d4307331c156b83a18e4d7b92ade03cd8f158f940910d68ddef1f144035  apps/studio/src/presentation-three/registered-presentation.ts
413bd421c25b07768e0dd6634d9ec6316bc129e8c78a900aabd846f5df797565  apps/studio/src/presentation-three/registered-presentation.test.ts
288a8d70b9a3afb50434f1b57a703a59dc05da9cf55cff83bf79f15101988a3c  apps/studio/src/presentation-three/observer-camera.ts
aea3e8942e1f453760bb3052267a5accf62bfe7b41bbef48b14c79ae4881767c  apps/studio/src/presentation-three/observer-camera.test.ts
4c7508d2f7511d6129395f36da16ca0cccc91d6170eecf0f68b29e7c41f7eed4  apps/studio/src/presentation-three/camera-rig.ts
781e0e34fce8b25845280eb053dc136ee79f4d79c15b1d3a6b2e19d133a4bcc2  apps/studio/src/presentation-three/camera-rig.test.ts
3951dbcaed18777a2e6f9a3882f0677f04882a7f1da9f18f39002417fd5bb987  apps/studio/src/styles.css
```

Read `AGENTS.md`, canonical scope/architecture/domain/observer design, `tasks/DH-014/plan.md`, the frozen files, and `tasks/DH-014/chromium-acceptance.md`; other tests/authority code only as needed.

## Mandatory closure

1. Keyboard input never synchronously snaps an active transition. Test pose immediately before/after key admission without advancing the scheduler. Separately, after the permitted mode transition settles, Shift-only and all opposite pairs leave pose byte-identical and have no continuous frames; a held direction moves on update frames and Shift accelerates it. Transition frames themselves are allowed by the product contract and must not be misclassified as key movement.
2. Runtime-value scanning catches either registered kind in either representation slot. Exact admission rejects wrong-slot extras, valid-but-wrong witness, Entity/slot swap, duplicate/missing/extra representations, and manifest/calibration/asset drift; only the three exact tuples pass.
3. Strict bounds provenance requires finite dense vectors and positive extent on all axes. Sparse, non-finite, inverted, flat, and point bounds fail registered provenance and deterministically fall back. Point pose transformation remains finite through a separate ordered transform path.
4. Resolver/load failures remain caught before fetch, visible as `role=alert`, finite, and free of unhandled rejection. Persistent load error survives unrelated refresh; a genuinely healthy reload clears it. App inspector cannot synchronously throw.
5. Re-run the complete Observer product contract and real Chromium valid path: modes, Marble entry/truth/provenance, Z-up Fly, Inspect focus, Overview fit, input/lifecycle isolation, reduced motion, collision preference, authority invariance, cache-only assets, no page error/NaN/blank view, and no idle rAF.
6. Confirm global diff-check and no world/gateway product diff.

Producer reports focused 31/0/148, full 488/0/3528, typecheck/build/diff-check/EXharness pass. Fresh Chromium after an isolated Gateway restart again loaded all three assets with PASS authority, registered entry, no integrity alert, and zero idle frames. Verify independently.

Return decision/may_closeout/P0/P1/P2, executable evidence with exact lines, commands/probes, and frozen start/end identity. Approval requires P0=0 and P1=0; stop after request scope.
