# DH-015 Plan Review — Round 6

## Reviewers

1. `gpt-5.6-sol`，max reasoning：`/root/dh015_plan_review_sol_r6`
2. ZCode direct CLI `0.16.3`：session `sess_3f9470b8-a380-4e5d-8276-b7d3ff513286`
   - provider-native runtime event：`GLM-5.3` verified；provider `builtin:bigmodel-coding-plan`
   - 本机非敏感 config requested variant：`max`；runtime 未暴露 variant，故 actual `Max` 标记 `UNVERIFIED`
   - 这是 direct CLI evidence，不是 Coordinate managed receipt

ZCode approved；Sol 找到一个可执行 P1，combined gate 采用更严格结论。ZCode 的 `--allowed-tools` 与实时 parser 不兼容；本轮使用 plan mode + deny list，native tool events 仅见 Read/Grep 与一个未预先枚举的 read-oriented `Agent` 调用，Git/status 零漂移。下轮 deny list 将显式加入 `Agent`。

## Combined decision

- `decision: changes_requested`
- `may_implement: no`
- P0：0
- P1：1

## P1 — generic parser 与 composite domain classification 顺序矛盾

计划先调用完整 `requireWorldEditInput`，再 composite preflight，但 generic parser 已把 `-0` 与 out-of-envelope 拒绝；它们不可能到达计划要求的 `422 POSE_NOT_COMPOSABLE`。同时 preflight 的 tuple-based parsed result不能直接传给会再次期待 object wire shape 的 `WorldToolSurface.edit`。

计划修订为 package-owned single admission pipeline：复用 package-internal structural decoder/types，先把纯结构错误分类为 400，再把 structurally valid composite domain violation 分类为 422。accepted outcome同时携带 canonical object wire input 与 byte-equivalent parsed tuple input；Gateway 只把 wire input传给 existing surface，generic Agent parser semantics 不变，不新增 `editParsed`。

## Round 7 gate

先完成 workflow mutation，再冻结 manifest；fresh Sol + ZCode review P0/P1 为 0 才批准。
