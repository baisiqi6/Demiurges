# DH-004 Round 1 交叉审查结论

## Decision

`changes_requested`

## Reviewer 与证据

- Kimi Code K3 Max：Claude Code request model `claude-opus-4-8`，CC Switch 当前请求实际 route 为 `k3`，session `e79eded5-cbb3-4054-9cef-b12b4ca500e4`；
- GPT-5.6 Sol Max reviewer 因 shared worktree 在 Kimi finding 后进入修复而被 Operator 标记 superseded 并中止，不在混合 digest 上产生 verdict；
- Kimi reviewer 全程只读，plan-mode 阻止其执行 `bun` 与复现 probe；Operator 随后独立运行反例并确认 finding。

## P1 — stale edit 留下 orphan Snapshot

Round 1 的 `WorldToolSurface.edit()` 先调用 `host.editCubeHeight()` 插入 authored child，再调用 `host.advance()` 做 CAS。stale expected ref 会正确返回 `stale_ref`，但新的 `snapshot:edit-N` 已写入 Repository 并消耗 sequence。

Operator 可执行复现：第一次 edit 把 current 推到 v2；再次使用 v1 expected edit 返回 `stale_ref`，但 `host.readSnapshot("snapshot:edit-2")` 成功，证明被拒绝的 model operation 留下 partial side effect。

## 底层修复方向

不在 tool surface 增加 pre-read guard。Repository 新增单一同步 `editCurrentCubeHeight(expected, height)` authority operation：先验证 expected current/version，stale 时直接返回且不创建 Snapshot；fresh 时才创建 child 并推进 ref。Host 只转发该 operation，model tool 不再组合两个独立 mutation。

回归要求：stale edit 后 current 不变，且 `snapshot:edit-2` 不存在。修复后必须在新的 digest 上重新执行 fresh cross-review。
