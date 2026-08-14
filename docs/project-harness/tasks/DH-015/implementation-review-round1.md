# DH-015 Implementation Review — Round 1

## Combined verdict

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 3

## Reviewer evidence

- Sol Max fresh subagent reviewer：独立复算 23-file aggregate `f117e7c5c0dcaa3bab1e4d0b4cfd5c6602dafd598872746da847c180e88e7dd9`，执行 full gates 与对抗 probes；发现 abnormal lost-capture 未释放 TransformControls、toolbar-focused Escape 不取消 draft、global diff-check 因 packet 尾部空行失败。
- ZCode direct CLI reviewer：actual model identity 为 `builtin:bigmodel-coding-plan/GLM-5.3`；运行时未暴露 `Max` variant，因此标记 `UNVERIFIED`。它给出 `approved / P0=0 / P1=0`，但 Read/Grep-only 配置无法独立执行 gates。该证据不是 Coordinate managed receipt。
- 按 reviewer 优先级与可执行反例，combined verdict 采用 Sol Max 的 `changes_requested`。

## Remediation

- `releaseTransformDrag()` 对 active TransformControls 调用 `pointerUp(null)`；所有 abnormal cancel/detach/unmount 路径使用这一 seam。
- `shouldReleaseDraftOnEscape()` 让 active draft 的 Escape 不受 editable toolbar focus 阻断，同时非 Escape 相机键仍服从 viewport ownership。
- 删除 review packet 尾部多余空行。
- 新增 lifecycle regression tests，并重跑 full gates 与真实 Chromium actual TransformControls probe。
