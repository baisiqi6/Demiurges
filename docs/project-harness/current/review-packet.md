# Review Packet

## Subject

- Checklist item: `DH-023`
- Reviewer: `dh023-independent-reviewer`
- Updated at: `2026-10-01`
- Canonical plan path: `docs/project-harness/tasks/DH-023/plan.md`

## Item Snapshot

- Title: Studio 可交互离线 Ball-Vessel 任务
- Status: doing
- Workflow status: running
- Priority: p1
- Owner: codex-operator
- Session: dh023-20261001
- Dependencies: DH-022

## Acceptance

三组变化初态完成 FAIL→preview→edit→run PASS；Gateway 单一authority和reservation；候选 stale_ref；Studio前后Episode回放比较；无模型调用；tests/browser/review闭环。

## Verification



## Handoff



## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-023：可交互离线 Ball-Vessel 任务

## 用户目标

Studio 内完成“把球稳定放进容器里”：设置初态 → MuJoCo 运行 → 查看失败和回放 → 预览修复坐标 → 用户显式应用 → 重跑并比较。全程使用 Gateway-owned 同一 Host，不消耗模型/provider quota。

## 支持边界

- 只针对 registered ball-vessel fixture；容器/floor/geometry/physics 保持注册值，球 rotation/velocity 需符合该任务；用户可改 x/y∈[-2,2]、z∈[0.7,2]。
- 当前 Host 持有的 read 和 lastRun 是 Gateway 推导输入；HTTP preview 不接受用户自带 Episode。共享 DTO codec 校验 Ref/scenario/Program/Evaluation 和 sample 证据链，hash 不被当作调用来源凭证。
- Ball repair 移除 golden runId/content hash gate；依据当前注册 semantic 与失败 metrics 生成 candidate，保留 current Ref。already_passed/no_failure/outside_supported_world 不猜测。
- HTTP 提供该人类任务的 create/edit/run/repair 命令；沿用 ProductSessionRegistry 与 execution reservation，Agent model-facing 四工具不变。已有 composite authoring routes 的旧边界不扩大。
- 一个显式 offline Gateway 启动入口；不会静默将生产 OMP 配置降级为 scripted Agent。离线入口的 Agent factory 一旦调用即拒绝，只有任务命令可运行。
- Studio 只持有验证后的 projection 和候选；预览不编辑世界，应用需原 expected Ref，run 不 adopt。提供成功/失败的两份内存 Episode 回放与指标比较。
- WorldProject v1 不扩 schema，ball task 不宣称可导出恢复；本任务只验证内存会话体验。

## 验收

1. 三组不同失败初态（不同 x/y/z 和 runId）均能 FAIL→预览→显式 edit→run PASS；正常输入 PASS 不生成修复。
2. preview 保持 Ref/Snapshot；更改初态后旧 candidate stale_ref，不能覆盖新世界。支持范围外、foreign scenario、tampered Evaluation/Ref/geometry 拒绝。
3. create/edit/run/preview 共享 session 的单一 reserve；与 Agent turn 不能交叉写，请求 abort 后不得污染后续 world。
4. client transition 验证 world lineage、lastRun、sequence、running、预览坐标与 source identity；失败恢复 settled projection，迟到响应不替换新会话。
5. 真实浏览器完成两组初态闭环、前后回放、输入错误/过期预览提示；记录桌面和窄屏可用性。
6. focused tests、typecheck/build、全量 gate、Harness 校验；独立 reviewer 提供 verdict，Operator closeout 并衔接既有 Git 交付授权。

## 顺序

1. 核对并冻结 task/admission/transition 边界。
2. 扩展 ball repair，Gateway 人类命令，client codec。
3. 添加离线入口与 Studio panel；复用已有 ThreeViewport/Episode Player。
4. 回归与 browser 验收，独立审查，正式交付。
```

## Review Focus

1. 当前计划或结果是否覆盖 acceptance
2. 是否越过 scope non-goals
3. 是否越过 architecture 模块边界
4. 是否偷偷吸收了未来 checklist item 的工作
5. 当前验证方式是否足以支持结束本轮
