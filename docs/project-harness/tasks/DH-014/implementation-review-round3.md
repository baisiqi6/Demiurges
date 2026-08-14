# DH-014 Implementation Cross-review — Round 3

## Decision

- Combined decision: `changes_requested`
- May closeout: `no`
- Sol Max: P0=0, P1=3, P2=0
- OMP DeepSeek V4 Pro Max: P0=0, P1=0, P2=1, `approved`
- Executable P1 evidence from the stricter reviewer controls the combined gate.

## Blocking evidence adopted

1. non-moving key input synchronously completed an active camera transition because `keyDown` called `finishTransition` before evaluating net intent.
2. wrong-slot registered objects were ignored by a type-assuming scan, so extra registered representations could bypass exact scenario admission.
3. zero-thickness and point bounds were finite/non-inverted but still received `registered` provenance.

## Remediation

- Keyboard ownership and camera transition progress are separated; only the render scheduler advances transitions or movement.
- Runtime representation scanning recognizes either registered kind in either slot, then exact slot/entity binding rejects wrong placement and extras.
- `normalizeBounds` now requires positive extent on every axis; point transforms use a separate finite ordered path and cannot enter bounds provenance.
- Persistent asset/load integrity errors remain visible across unrelated refreshes and clear only after the underlying load state is healthy.
- Added active-transition, wrong-slot-extra, and degenerate-provenance regressions.

Round 3 reviewed product aggregate `272717b7ea3c37e59744fb56416ec025ccb58af9609a1228189df028ac8b4012`; remediation requires a fresh Round 4 digest and review.
