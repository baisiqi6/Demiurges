# DH-015 Implementation Review — Round 2

## Combined verdict

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 3

## Evidence

- Sol Max：25-file aggregate `c30aae678b8ca6fd209f12503fbdee4e8a45e463ca18e1080b43583d819b6fdb` 匹配；focused/full/typecheck/build/diff/EXharness 与 actual Three.js probes通过。三个 executable P1 分别是 request abort mutation、nested joint structural misclassification、running prior transition acceptance。
- Sol reviewer 在 P1 形成后的一次 broad cache-path search 意外显示 forbidden closeout packet 三条匹配行，故该会话不得作为 clean approval；本轮 verdict 本就是 changes_requested，不依赖其 fresh approval authority。
- ZCode direct CLI：`approved / P0=0 / P1=0`；actual model `builtin:bigmodel-coding-plan/GLM-5.3`，`Max` variant `UNVERIFIED`；无法独立跑 shell gates，不是 Coordinate managed receipt。
- combined verdict 采用可执行 P1，拒绝 closeout。

## Remediation

- authoring request abort 在 body 前后、reservation 前双重 fail closed。
- raw-message mapper 改为 closed typed request/domain failures。
- nested joint structural decode闭合 exact records 与 primitive types。
- transition decoder 增加 prior settled invariant。
- 回归覆盖 pre-aborted write/edit、stream body read期间 abort、malformed nested joint、随后 child ID无 gap、running prior。
