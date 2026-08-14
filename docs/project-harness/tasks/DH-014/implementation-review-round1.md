# DH-014 Implementation Cross-review — Round 1

## Decision

- Combined decision: `changes_requested`
- May closeout: `no`
- Sol Max: P0=0, P1=3, P2=1
- OMP DeepSeek V4 Pro Max: P0=0, P1=0, P2=5, `approved`
- Cross-review rule: an executable P1 from either independent reviewer blocks approval; disagreement is resolved by the stricter acceptance contract, not by vote.

## Blocking evidence adopted

1. `CameraRig` used `pressed.size` rather than non-zero movement intent, so modifier-only and cancelling directions kept scheduling rAF without camera motion.
2. a corrupt registered visual in the Marble scenario could be rejected locally while the registered Observer entry remained accepted, creating partial registry admission.
3. registered resolver calls occurred before loader `try` boundaries, so binding drift could become an unhandled rejected Promise rather than a visible finite fallback.

## Non-blocking evidence retained

- Default Inspect raycast can prefer the environment shell from some angles; a high-angle click selects the generated Entity. This remains a documented UX limitation, not an authority or first-slice acceptance failure.
- favicon 404 is outside this slice and is not a page exception.
- the harness-generated review packet had one blank EOF line; corrected before Round 2 gates.
- stale `observerRepresentationError` is cleared at the start of every refreshed Observer context in the remediation.

## Remediation

- Continuous rendering now depends on non-zero net movement intent.
- Marble registered representations are admitted as one exact scenario set; entry, bounds, observation load, and visual load all fail closed together.
- loader resolver failures are caught before any fetch and publish explicit error/fallback state.
- Added focused regression tests and repeated full gates plus real Chromium Shift-held probe.

Round 1 was reviewed against product aggregate `19a48dcf063eebb0c0e81eb5364dbe6865bc4f1bed321799c3f01cfe031bf23b`; remediation requires a fresh Round 2 digest and independent review.
