# DH-014 Implementation Review Request — Round 1

## Freshness and authority

- Review type: fresh, independent, read-only implementation review.
- Branch: `agent/codex/DH-014`
- Base and current HEAD: `c655c544bb88010f42e0dd9e570f7f04923d9b6e`
- Product aggregate: `19a48dcf063eebb0c0e81eb5364dbe6865bc4f1bed321799c3f01cfe031bf23b`
- Aggregate algorithm: SHA-256 of the complete `sha256sum` output below, in exactly this order.
- Do not read earlier reviewer verdicts or another reviewer's output. Plan review evidence is out of scope.
- Do not edit files, commit, build provider assets, call providers, or perform Git mutations.

```text
6a6eaaa7a2527a107dbfabb77a51206d7e8261427b79fdd1a29571fcf4311b7a  apps/studio/src/App.tsx
286fc7249a42841ee05a0ce0614aa1a01d88e69223f0e5ec756ca53a3fb69fdc  apps/studio/src/presentation-model.ts
6ee1bdb889d684cecc4c4c070a4aefa0ff52dfb6f2ed3d0b7b58c7e85f140a47  apps/studio/src/presentation-model.test.ts
4b96a862384e52ee07b4228a75245ed03db77a2f1a4b12e0d5dee71b1f445c36  apps/studio/src/presentation-three/ThreeViewport.tsx
627a4d4d146000123f4375619771085b488046a304a1aad2f5311f6ca753892d  apps/studio/src/presentation-three/registered-presentation.ts
24b94a3fb6720db19ed7f24d8743d6109f6823efcee7ac23cef1940076d3717e  apps/studio/src/presentation-three/registered-presentation.test.ts
26ea8427263fba94f10ddc8b170059cd4f31fd9e98ca90b8de65cfdbadbda8ef  apps/studio/src/presentation-three/observer-camera.ts
81ca097f0148bc4494727337e73d94cd4c13804a693fb510f3b445c8f0ef17e9  apps/studio/src/presentation-three/observer-camera.test.ts
02d5b27922bf1f6c036b0281fe4ec6896e72a39d7746e0df30d33bb4eadfa6ae  apps/studio/src/presentation-three/camera-rig.ts
eb89558e2329e98ec7511a091b7150ef1b4405a7f345c6f379d2e6de678a8f47  apps/studio/src/presentation-three/camera-rig.test.ts
1291d1f757f051a00c4f1eb9d7a4e39c6aef751079d42d9db28db2bf73a85398  apps/studio/src/styles.css
```

## Canonical inputs

Read:

1. `AGENTS.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/observer-embodiment.md`
6. `docs/project-harness/tasks/DH-014/plan.md`
7. the eleven product files in the frozen manifest above
8. `docs/project-harness/tasks/DH-014/chromium-acceptance.md`

Tests and existing authority code may be read as needed. Do not read `plan-review-*.md`, old review requests, current review packets, or another reviewer's files.

## Required review

Find executable P0/P1 issues, with special attention to:

1. `CameraRig` remains Presentation-local; camera changes cannot mutate Snapshot, Ref, Episode, Evaluation, Repository, or AdoptPolicy.
2. registered entry pose, truth level, provenance, bounds, and fallback behavior cannot be confused with Kernel truth or written into Snapshot.
3. Overview world-bounds transforms and aspect-aware fit are finite and conservative for primitive, imported mesh, missing 3DGS, and Marble 3DGS.
4. Inspect selection/focus, Orbit ownership, Explore pointer/keyboard ownership, reset poses, and mode transitions do not conflict.
5. editable targets and agent input are isolated; blur, visibility change, mode change, pointer-lock exit/loss, and unmount clear held input.
6. Explore is Z-up Fly, including W/S, A/D, Q/E, Shift, wheel speed, mouse look, Esc, bounds/unknown-area indication, and reduced-motion behavior.
7. the renderer has no permanent idle `requestAnimationFrame`; continuation is limited to motion, transition, Episode playback, or dirty Spark rendering.
8. Explore hides collision proxy wireframes without destroying the user's explicit Overview debug-layer preference; grid, bounds, alignment, and collision remain independently controlled.
9. real Chromium evidence proves registered Marble entry, all modes, input isolation, Inspect focus, Overview bounds, finite pose, no stuck keys/page errors/blank viewport, and zero idle frames.
10. provider cache is reused read-only; no provider query/download/generation is introduced.
11. no Kernel/world authority semantics changed and no Lyaup source or Y-up movement math was copied.

Run bounded tests/probes needed to substantiate the verdict. The producer reports these gates passing:

- focused observer/model tests: pass
- `bun test`: 482 pass, 0 fail, 3493 assertions
- `bun run typecheck`: pass
- `bun run build`: pass with existing bundle-size warnings only
- `git diff --check`: pass
- EXharness validate/doctor: pass, 0 warnings

## Verdict contract

Return:

- `decision: approved | changes_requested | blocked`
- `may_closeout: yes | no`
- P0, P1, and P2 findings with executable evidence and exact file/line references
- commands and probes executed
- frozen branch, HEAD, per-file hashes, aggregate, and status checked again at the end

Approval requires P0=0 and P1=0. Stop after request-scoped evidence; do not expand into unrelated architecture or UI preferences.
