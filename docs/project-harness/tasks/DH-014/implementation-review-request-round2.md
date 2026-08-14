# DH-014 Implementation Review Request — Round 2

## Freshness and authority

- Review type: fresh, independent, read-only implementation review.
- Branch: `agent/codex/DH-014`
- Base and current HEAD: `c655c544bb88010f42e0dd9e570f7f04923d9b6e`
- Product aggregate: `76faedbfa31b04efa9c2ddf9cb29110c46d751b5466f31d0a2311205af355a31`
- Aggregate algorithm: SHA-256 of the complete `sha256sum` output below, in exactly this order.
- Do not read Round 1 requests/verdicts, `implementation-review-round1.md`, plan-review files, current review packet, or another reviewer's output.
- Do not edit files, commit, call providers, download/generate assets, or perform Git mutations.

```text
6a6eaaa7a2527a107dbfabb77a51206d7e8261427b79fdd1a29571fcf4311b7a  apps/studio/src/App.tsx
286fc7249a42841ee05a0ce0614aa1a01d88e69223f0e5ec756ca53a3fb69fdc  apps/studio/src/presentation-model.ts
6ee1bdb889d684cecc4c4c070a4aefa0ff52dfb6f2ed3d0b7b58c7e85f140a47  apps/studio/src/presentation-model.test.ts
2090df2005f3534048fdd3c6c8866fd9eb94efc9c3f7da6843579e5906f11176  apps/studio/src/presentation-three/ThreeViewport.tsx
fdc9f64c0572fc94bb674c07968501c86b3d31c13d259fc183272f193f3e292f  apps/studio/src/presentation-three/registered-presentation.ts
4aee34da900b83fe7565f0a4a0e86c36a80406738ac66ba09053d0443c2385e9  apps/studio/src/presentation-three/registered-presentation.test.ts
26ea8427263fba94f10ddc8b170059cd4f31fd9e98ca90b8de65cfdbadbda8ef  apps/studio/src/presentation-three/observer-camera.ts
81ca097f0148bc4494727337e73d94cd4c13804a693fb510f3b445c8f0ef17e9  apps/studio/src/presentation-three/observer-camera.test.ts
eb1efccc49d6b828ca92cae900ec4bcc564a1add03bae0aa626f931a90666dfc  apps/studio/src/presentation-three/camera-rig.ts
467219fdc4a63b646da3c9b8ab64ccdabbc3794dbf9313b20860db019e0a6a4c  apps/studio/src/presentation-three/camera-rig.test.ts
1291d1f757f051a00c4f1eb9d7a4e39c6aef751079d42d9db28db2bf73a85398  apps/studio/src/styles.css
```

## Canonical inputs

Read `AGENTS.md`, `scope.md`, `architecture.md`, `domain-model.md`, `observer-embodiment.md`, `tasks/DH-014/plan.md`, the eleven frozen product files, and `tasks/DH-014/chromium-acceptance.md`. Existing tests and authority code may be read as needed. Observe the exclusions above.

## Mandatory closure probes

In addition to the full Round 2 product contract, independently prove:

1. modifier-only (`ShiftLeft` or `ShiftRight`) and cancelling directions (`W+S`, `A+D`, `Q+E`) have zero net intent, do not move the camera, and do not keep `needsNextFrame` or a continuous rAF alive; real movement still schedules frames and Shift still accelerates it.
2. the exact Marble scenario is admitted only when all three registered representations resolve to the exact expected asset set with no duplicate, missing, foreign manifest, calibration, witness, or asset binding.
3. corrupting any one registered visual or observation causes entry and registered bounds to fail closed as a scenario, not partial adoption; finite primitive/loaded/fallback bounds remain available with visible fallback truth/provenance.
4. registered Observation and Visual resolver failures are caught before fetch, publish visible error state, schedule a finite fallback render, and cannot create an unhandled Promise rejection; valid exact assets and ordinary imported assets still load.
5. a later valid Observer refresh clears stale `observerRepresentationError`.
6. all original acceptance remains intact: modes, Z-up Fly, Inspect focus, Overview fit, editable isolation, lifecycle cleanup, reduced motion, collision preference, authority invariance, cache-only provider boundary, real Chromium, and zero idle rAF.
7. `git diff --check` passes globally, not only on product files.

Producer gates after remediation:

- focused: 27 pass, 0 fail, 120 assertions
- full: 484 pass, 0 fail, 3500 assertions
- typecheck: pass
- build: pass with existing bundle-size warnings only
- `git diff --check`: pass
- EXharness validate/doctor: pass, 0 warnings
- real Chromium Shift held 700 ms: only two event-driven frames, pose unchanged, then 500 ms frame delta zero

## Verdict contract

Return `decision`, `may_closeout`, P0/P1/P2 with executable evidence and exact lines, commands/probes, and frozen branch/HEAD/per-file hashes/aggregate/status at the end. Approval requires P0=0 and P1=0. Stop after request-scoped evidence.
