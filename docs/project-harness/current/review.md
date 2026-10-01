# DH-023 独立实现审查

## 首轮：CHANGES_REQUESTED

- Reviewer：`/root/dh022_independent_review`，只读，与实现者分离。
- 基线：`be0d609` 加 DH-023 当时未提交差异，包含新文件。
- P1=1 / P2=0：POST edit 已执行但响应丢失、随后 recovery GET 不可用时，client 抛普通 Error；Panel 保留旧 projection/preview 并解除 busy。Reviewer 使用真实 `ProductSession + ProductSessionClient` 复现 `before=1 / actual=2 / recovered=false`。
- 亲跑：DH-023 + DH-021 focused 10 pass / 0 fail / 89 assertions；`typecheck:authoring`、`git diff --check` 通过。
- 原意：实现需要修改，本轮不批准实现或 closeout。

## 修复与复查输入

- recovery 也失败时返回 `ProductSessionAuthorityUnavailableError`，不附带 projection。Panel/App 清除 world/projection/lastRun、旧候选和历史 replay，任务写入禁用，提示新建 Session。
- 本地输入 admission 拒绝保留原 authority；只有无法核实命令结果时断开。
- 已增加真实 ProductSession/client 回归；Operator focused 21 pass / 0 fail / 142 assertions、root typecheck 通过。
- 浏览器 fault：POST 实际将 v2 改为 v3，丢失响应/GET 后 currentRef/session=`—`、候选与 records 清空；新 Session 可恢复。完整摘要见 `browser-acceptance.json`。

## 最终：APPROVED / may_closeout=yes

- Reviewer：`/root/dh022_independent_review`；P0=0 / P1=0 / P2=0，原 P1 已关闭。
- 冻结输入：base `be0d609`；19 个产品/测试/config 文件及 4 个文档全部匹配。manifest SHA-256=`28c562251d1a4b193d5ddb7d378a12fbbcee2e6c83ec5302f9db4a9b75fb3515`。
- Reviewer 确认：client 专用无 projection 错误与 Panel/App 清除分支闭合；preview getter 未被执行；DH-010 仍拒绝 foreign pair 与 floor 假 PASS；persistence 修改只收敛测试资源生命周期，没有修改 production lease/publication 或删减原断言。
- 亲跑：DH-023/DH-021/DH-010 focused 25 pass / 0 fail / 159 assertions（1.77s）；persistence 文件 34 pass / 0 fail / 767 assertions（41.56s）；authoring typecheck、diff-check 通过。
- 只读核对：最终 full 1187/0/9383、root typecheck/build 日志、浏览器 fault receipt/断线截图、四份 raw projection SHA。Reviewer 未重新运行全量或操作浏览器，未修改文件/Git、未运行 live provider。
- 原意：批准 Operator 记录独立 verdict 并执行正式 closeout；不扩大 Git 发布或 live-provider authority。

本文件由 Operator 原意记录独立返回的结论；实现者自测不构成审查批准。
