# DH-023：可交互离线 Ball-Vessel 任务结果

## 用户能完成的事

Studio 已支持设置球的初态 → MuJoCo 运行 → 查看 FAIL、指标与 Episode → 预览修复 → 显式应用 → 重跑 PASS，并保留最近两次运行各自的已验证 base world 作比较回放。

预览不修改 Ref/Snapshot；应用保留原 expected Ref。切换历史回放不替换 current projection。任务只支持 registered Ball-Vessel 的固定容器/floor/geometry/physics，球 x/y∈[-2,2]、z∈[0.7,2]，velocity/rotation 保持 canonical 值。

## 实现边界

- Gateway 的 scoped create/edit/run/repair HTTP 命令共用同一 Host/reservation；Agent 四工具及旧 composite authoring admission 保持原边界。
- repair 以本 session 的 world/lastRun 推导，移除单一样本的 golden runId/hash gate；共享 codec 验证 registered identity、base Ref/scenario/Program、Evaluation 重算及 Episode 内容关联。DTO 一致性校验不替代来源认证。
- 容器外落球的 registered floor 接触是合法 FAIL 证据，不能冒充 vessel 支撑。free-fall ExplicitInputs/baseSnapshot 与 Episode/terminal identity 必须一致。
- Runtime 没有取消能力，request abort 后 reserve 保持至 Runtime settle；迟到结果不会更新 lastRun。client 的恢复查询失败会清除 Studio authority、旧候选和 replay，禁用任务写入，提供新建 Session 恢复入口。
- 独立 `dev:offline` 入口的 Agent factory 一旦调用就拒绝；没有读取模型 credential、调用 provider 或把 production OMP 静默降级为 scripted Agent。
- 桌面工作区限定高度，侧栏内部滚动；窄屏按单列排列，画布保持 390px 高且隐藏会遮挡世界的 observer debug readout。

## 验证

- 三组 backend/client 初态 `(1,0,1)`、`(-1.2,0.35,1.6)`、`(0.8,-1,0.9)` 均 FAIL→preview→edit `(0,0,0.7)`→PASS；正常 PASS 不生成 candidate。
- scoped focused：21 pass / 0 fail / 142 assertions；覆盖 stale_ref、tampered Evaluation/geometry/Ref、foreign scenario、preview accessor 不执行、abort/reservation 与失联恢复。
- 最终 fresh 全量：`1187 pass / 0 fail / 9383 assertions`，104 files，151.90s；root typecheck/build 与 `git diff --check` 通过。日志保存在 `.artifacts/dh023/`。
- 浏览器：Ego Lite Chromium，同一 TaskSpace `2`。两组闭环 `(1,0,1)`、`(-1.1,0.2,1.4)` 成功；额外验证越界初态不改 Ref、更改初态使旧预览过期、前后 replay 的 current Ref 保持 v4。
- 浏览器 fault：真实 POST 把 v2 改为 v3，故意丢弃响应并拒绝 recovery GET；Studio Ref/session 显示 `—`，candidate/records 清空，任务创建按钮禁用。新建 Session 后可重新开始。故障注入已移除。
- 390px 窄屏：document width=390，无横向溢出，任务/回放按钮可操作。验收摘要及原始 projection 的 SHA-256 见 `browser-acceptance.json`；截图和完整 projection 为本地 `.artifacts/dh023/browser/` evidence。

## 门禁中实际处理的失败

1. 初次全量的 DH-010 用“floor 接触必须非法”作为旧断言。现在分别证明 foreign EntityRef pair 拒绝、floor 不能保留假 PASS Evaluation；没有削弱 evaluator。
2. 后续复核在既有 persistent visible-commit 测试的临时 fixture acquire 阶段失败。只修改测试的 per-case lease 生命周期及失败清理；该文件单独 34 pass / 0 fail / 767 assertions，随后完整全量重新通过。生产 lease/port/publication 代码没有修改。
3. 独立首轮 P1 指出 recovery GET 失败仍保留旧 authority；已通过明确的 authority-unavailable 分支修复，并完成真实浏览器故障验收。

## 审查与交付状态

首轮 `CHANGES_REQUESTED` 后已修复 P1；独立最终复查返回 `APPROVED / may_closeout=yes / P0=P1=P2=0`，输入 manifest 全部匹配。详见 `implementation-review.md`。Operator 已依据本 verdict 完成正式 Harness closeout：item=done / workflow=closed / owner/session 清空 / lease released / current.active_item=null。自测不替代批准。

WorldProject v1 未扩展，此任务的比较记录只保存在内存。没有 live OMP/Marble/Hunyuan/Keychain、自动 adopt、package publish 或 production deploy。离线验证不宣称 predictive world model 或通用规划能力。
