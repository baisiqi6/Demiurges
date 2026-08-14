# DH-014 Implementation Cross-review — Round 2

## Decision

- Combined decision: `changes_requested`
- May closeout: `no`
- Sol Max: P0=0, P1=4, P2=0
- OMP DeepSeek V4 Pro Max: P0=0, P1=0, P2=2, `approved`
- The stricter executable counterexamples govern the combined gate.

## Blocking evidence adopted

1. event-level tap nudge left 0.02 m after `W+S`, `A+D`, or `Q+E` were admitted before a render frame.
2. an existing but mismatched witness, or swapping exact assets between Entity/representation slots, passed the asset-multiset check.
3. sparse `Array(3)` values bypassed `Array.every`, allowing non-finite registered bounds and camera poses.
4. resolver catches published only dataset state; the visible Observer UI did not consume the error, and the App inspector repeated resolver calls without a catch.

## Remediation

- Camera movement now occurs only in the scheduled update frame; modifier-only and all opposite-direction pairs have zero movement and zero continuation.
- registered admission now freezes exact kind/asset/calibration/witness tuples and exact Entity/slot ownership.
- Vec3 validation requires three own, finite indexed values; sparse arrays fall back before bounds/camera math.
- Observer failures publish a visible `role=alert`; App inspector resolution is fail-closed and renders an explicit integrity error instead of throwing.
- Added exact witness/entity swap, sparse Vec3, all cancelling-pair, and valid-path regressions.

Round 2 reviewed product aggregate `76faedbfa31b04efa9c2ddf9cb29110c46d751b5466f31d0a2311205af355a31`; a fresh Round 3 digest and review are required.
