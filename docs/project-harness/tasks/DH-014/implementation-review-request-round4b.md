# DH-014 Implementation Review Request — Round 4B Replacement

## Purpose and boundary

This is a fresh, independent, source-and-evidence replacement approval review. A prior external reviewer did not find a P0/P1 but exhausted its browser runtime before end identity; do not read that session or any earlier review files.

- Branch `agent/codex/DH-014`; HEAD/base `c655c544bb88010f42e0dd9e570f7f04923d9b6e`.
- Product aggregate `bf66aa8d6e9ac20ad0b465d9267109487c1cdf01264c4c0e1c9e327174f6664e`.
- Do not start Studio/Gateway/browser services. Do not perform new Chromium automation. Real Chromium acceptance is already a frozen producer artifact in `tasks/DH-014/chromium-acceptance.md` and was independently covered by the other cross-review leg; this replacement leg audits its consistency with source and tests.
- No repo writes, Git mutation, provider/cache operations, secrets, or process cleanup.
- Do not read Round 1–4 review requests/verdicts/remediations, plan reviews, current packet, or other reviewer output.

## Frozen product manifest

Recompute every hash, then hash the complete ordered `sha256sum` text:

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

## Allowed inputs

Read `AGENTS.md`, canonical scope/architecture/domain/observer design, `tasks/DH-014/plan.md`, the eleven product files, `tasks/DH-014/chromium-acceptance.md`, and existing source tests/authority code as needed.

## Mandatory source/test review

1. Run focused tests, full `bun test`, typecheck, global diff-check, EXharness validate/doctor. Build is optional because it writes derived output and was already run by the producer and other reviewer.
2. Independently probe keyboard admission/update: no synchronous transition snap; neutral pairs and Shift-only do not move or continue after a settled transition; real movement is update-frame-owned and Shift is 3×.
3. Independently probe exact registered tuples for assetId drift, valid-but-wrong witness, wrong-slot rigid and splat, duplicate, missing, extra, entity/role swap, manifest/calibration drift.
4. Independently probe dense finite positive-extent bounds and finite point transforms.
5. Audit resolver-before-fetch, visible alerts, persistent-error gate, healthy-clear path, and App memo catches. Verify frozen Chromium claims are consistent with these code paths; do not recreate Chromium.
6. Confirm complete Observer behavior has no source-level P0/P1 and changes no world/gateway authority semantics.
7. Recompute branch/HEAD/per-file hashes/aggregate/status at the end. This is mandatory.

Return immediately after these checks with `decision`, `may_closeout`, P0/P1/P2, executable evidence/lines/commands, and end frozen identity. P0/P1=0 is necessary for approval; if evidence is insufficient, return blocked. Do not expand scope.
