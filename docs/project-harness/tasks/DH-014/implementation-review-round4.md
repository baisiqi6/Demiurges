# DH-014 Implementation Cross-review — Round 4 Final

## Decision

- Combined decision: `approved`
- May closeout: `yes`
- Sol Max: P0=0, P1=0, P2=0
- OMP DeepSeek V4 Pro Max replacement: P0=0, P1=0, P2=3
- Frozen product aggregate: `bf66aa8d6e9ac20ad0b465d9267109487c1cdf01264c4c0e1c9e327174f6664e`

## Approved evidence

- Keyboard admission never changes pose synchronously; transitions and movement advance only through the single scheduler. Settled neutral inputs have byte-identical pose and no continuation; held movement is frame-owned and Shift is exactly 3×.
- Marble admission is exact across runtime kind, asset, calibration, witness, Entity, and representation slot; missing, duplicate, extra, wrong-slot, swapped, foreign, and drifted values fail closed.
- bounds provenance requires dense finite positive extent on every axis; sparse/non-finite/inverted/flat/point candidates deterministically fall back, while finite point pose transforms remain supported.
- registered resolver failures are caught before fetch, publish a visible alert and finite fallback, survive unrelated refreshes, and clear after a healthy reload. App inspector memo resolution is also fail closed.
- Real Chromium independently proved the valid Marble path and the corrupt→alert→healthy recovery path; all modes, Z-up Fly, Inspect focus, Overview fit, input isolation, collision preference, reduced motion, authority invariance, and idle-rAF behavior passed.
- Full gates: 488 tests, 0 failures, 3528 assertions; typecheck/build/diff-check/EXharness passed. `packages/world/**` and `apps/agent-gateway/**` have no product diff.

## Non-blocking P2 retained

1. NaN `deltaSeconds` is not explicitly rejected inside camera math, although browser rAF timestamps are finite and the path is not runtime-reachable.
2. boundary warning has ordinary floating-point epsilon sensitivity at the exact face.
3. Orbit input during an Overview/Inspect transition can be overwritten by the following transition frame.

These do not affect authority, deterministic world evidence, required Observer behavior, or closeout eligibility.
