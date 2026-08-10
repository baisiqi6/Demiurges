# Review Packet

## Subject

- Checklist item: `DH-006`
- Reviewer: `round4-kimi-k3-max-sol-max`
- Updated at: `2026-08-10`
- Canonical plan path: `docs/project-harness/tasks/DH-006/plan.md`

## Item Snapshot

- Title: 本地 Agent—Studio 单一事实面闭环
- Status: doing
- Workflow status: changes_requested
- Priority: p0
- Owner: codex
- Session: codex-dh006-20260810-1
- Dependencies: DH-005

## Acceptance

一个本地 Product Session 的 Repository、Runtime 与 current ref 只由 Gateway Host 持有；Studio 通过 bounded、ordered、JSON-safe 的产品 transport 提交自然语言任务并呈现 world_write→world_read→world_edit→world_run trace，权威 Snapshot/Episode/EvaluationRecord 驱动 Three.js、EpisodePlayer 与 PASS/FAIL；run 不推进 ref、adopt 保持独立 control authority；Gateway 不再反向 import apps/studio/src；scripted Agent、tests/typecheck/build/Chromium/diff/checklist gates 通过，真实 provider prompt 不在本项范围。

## Verification

Round 1 remediation candidate: 62 tests / 0 fail / 375 assertions; typecheck/build/diff-check/checklist passed; real Chromium verified success frame 7→75/PASS/ref v2, sanitized second-turn failure with resync, then fresh session success; product digest af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db. Fresh focused cross-review pending.

## Handoff

Round 1 changes_requested evidence is preserved. Root remediation for atomic admission, strict product codec/lifecycle, failure resync, UTF-8 byte/media-type bounds, and public error codes is complete on agent/codex/DH-006. Fresh focused Kimi K3 Max + Sol Max review is required before mark-done/commit/push.

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-006 计划：本地 Agent—Studio 单一事实面闭环

## 状态与当前 Authority

- Status：`active`；
- 用户已授权按本计划开始产品代码实现；
- 当前 authority 不包含真实 provider prompt、credential 使用、commit、push、merge、tag 或 deploy；
- 本任务依赖已关闭且已推送的 `DH-005`，工作分支从 `agent/codex/DH-005` 建立，不隐式 merge `main`。

## 目标

把 `DH-005` 已验证的 restricted Agent Runtime 接成 Demiurges 第一个真实可见的本地产品闭环：用户在 Studio 提交自然语言任务，Agent Gateway 在一个 Product Session 中调用四个 world tools，Studio 根据权威 `Snapshot`、`Episode` 与 `EvaluationRecord` 更新 3D Observation、工具轨迹和 Episode 回放。

本切片最重要的结构结果不是“多一个聊天框”，而是确立单一世界事实面：每个连接中的 Product Session 只允许 Gateway 内的 Host 持有 Repository 与 Runtime authority；Studio 是输入、观察、回放与显式 Harness control 的客户端，不再在同一连接中维护第二个可写 Host。

## 根部结构调整

当前 Gateway 通过相对路径复用 `apps/studio/src` 内的 Kernel、Host 与 world tools。这在 `DH-005` 的隔离验证中可接受，但在 Studio 与 Gateway 同时成为真实调用方后会把应用目录误当成领域 authority。

本切片应把已经出现第二个真实调用方的世界能力提升为一个最小内部 workspace module：

- Kernel records 与 immutable helpers；
- Repository / Authoring；
- MuJoCo Evolution Runtime；
- deterministic Evaluation；
- `RuntimeMvpHost` 与 `WorldToolSurface`；
- Product Session 所需的 JSON-data transport evidence contract。

Three.js、SolidJS、Episode 播放时钟和聊天界面继续只属于 Studio Presentation。OMP SDK 与其 event/message shape 继续只属于 Agent Gateway。内部 module 不成为通用 Adapter SDK，也不预建 provider ecosystem。

## 产品拓扑

```text
Studio
  ├── natural-language input
  ├── tool/evidence timeline
  └── Three.js + EpisodePlayer
             │
             │ product-owned HTTP streaming / resync
             ▼
Agent Gateway / Product Session
  ├── restricted OMP Agent Runtime 或 scripted Agent client
  ├── world_read / world_write / world_edit / world_run
  └── sole RuntimeMvpHost
        ├── Repository / Authoring
        ├── MuJoCo Evolution Runtime
        └── Evaluation
```

## Invariants

- 一个 Product Session 只有一个可写 `RuntimeMvpHost` 与 current `Ref` authority；
- connected Studio 不实例化或推进第二个 Repository，不从 render state 反推 world state；
- Agent 仍只拥有 `world_read`、`world_write`、`world_edit`、`world_run`；
- `run` 产生 Episode 与 Evaluation evidence，但不推进 current ref；
- `adopt` 继续是独立 Harness control operation，不进入 Agent tool surface；
- Studio 的场景变化、Episode 动画和 PASS/FAIL 只由结构化权威证据驱动，不以 assistant narration 为准；
- transport 使用 Demiurges 自有、JSON-safe、bounded、ordered 的 event envelope，不把 OMP message/event shape 暴露给 Studio；
- 连接中断或丢失增量事件后，以 Gateway 的 session snapshot/resync 结果恢复，不让前端缓存成为第二事实面；
- Product Session 与 transport error 不泄露 Host、Repository、credential、stack 或 OMP internal object。

## 首个 Transport Slice

优先使用 HTTP streaming NDJSON，而不是提前引入 WebSocket：

- 一个 turn request 携带 session id 与自然语言 prompt；
- response stream 只发产品拥有的有序 event，例如 turn lifecycle、world tool trace 与 evidence update；
- 一个只读 resync endpoint 返回该 session 当前可呈现的 authority/evidence projection；
- 浏览器通过 `AbortSignal` 取消当前请求；只有实际出现服务端主动 steering、多用户协同或持续双向控制需求时才重新评估 WebSocket。

具体 URL、event 名和 DTO 以 contract test 驱动的最小实现为准；计划不预先冻结未被调用方证明需要的通用协议。

## 实现范围

1. 提取最小内部 world module，消除 Gateway 对 `apps/studio/src` 的反向应用依赖。
2. 在 Agent Gateway 建立进程内、显式生命周期的 Product Session registry；每个 session 私有持有一个 Host。
3. 建立 bounded HTTP turn stream 与只读 resync；transport projection 递归冻结并可 JSON round-trip。
4. 先注入 deterministic scripted/fake Agent client，执行自然语言任务的 `write → read → edit → run`，不调用真实 provider。
5. Studio 增加最小聊天输入、运行状态、tool trace 与 failure evidence；connected mode 的世界与 Episode 只来自 Gateway evidence。
6. Three.js 与 EpisodePlayer 继续呈现真实 sample；完成 turn 后能够看到 falling-cube Episode 逐帧回放。
7. 保留 control-side explicit adopt 边界；如果本切片暴露 adopt UI，它必须使用独立 control endpoint、expected ref/version 与既有 policy，且不得由 Agent 自动触发。

## Non-goals

- 真实 provider/model prompt、credential 读取或模型费用；
- 多用户、持久 session、数据库、鉴权、TLS、云部署或远程公网服务；
- WebSocket、通用 event bus、workflow engine 或可靠消息系统；
- 新增第五个 Agent-facing world tool，或让 Agent 获得 `adopt`；
- 通用 AgentRuntime SDK、同时支持 OpenCode/Claude/Codex，或复制 OMP 源码；
- imported mesh、Spark/3DGS、机器人、VLM、world model 或第二 Evolution Runtime；
- 以兼容 mode 长期保留 connected Studio 内的第二个可写 Host。

## 验收标准

1. 一个本地 Product Session 的 Repository、Runtime 与 current ref 只由 Gateway Host 持有；connected Studio 不创建或推进第二个 Host。
2. Studio 提交一个自然语言 falling-cube task 后，scripted Agent 经 product transport 实际执行 `world_write → world_read → world_edit → world_run`，UI 按 sequence 展示 trace。
3. Gateway 返回的 authoritative `Snapshot`、`Episode` 与 `EvaluationRecord` 驱动 Three.js Observation、EpisodePlayer 和 PASS/FAIL；Episode 使用真实 samples 回放而非终态跳变。
4. `world_run` 前后 current ref 不变；Agent surface 不含 `adopt`。若执行 control-side adopt，只有显式、policy-gated 且 expected-ref 匹配时才推进。
5. transport event 与 resync projection 是 bounded、JSON-safe、ordered data；断流、取消、非法 prompt、非法 session 与内部失败均 fail closed，并保留可呈现的有限失败证据。
6. Gateway 不再从 `apps/studio/src` import Kernel、Host、Repository、Runtime 或 world tools；Studio Presentation 不进入共享 world module。
7. contract/unit/integration tests、`bun run typecheck`、`bun run build`、真实 Chromium product acceptance、`git diff --check` 与 checklist validation 通过。

## 实现阶段

### Phase 1 — Boundary extraction 与 RED

Status: completed

- 记录当前 full gate 基线；
- 先建立 import-boundary、single-authority、transport ordering 与 ref invariants 的失败测试；
- 提取最小内部 world module，不改变已有世界语义与测试证据。

Evidence：baseline 安装 workspace dependency 后为 48 tests / 0 fail / 304 assertions；import-boundary RED 先失败，再由内部 `@demiurges/world` package 转绿，Gateway 已无 `apps/studio/src` import。

### Phase 2 — Product Session 与 Transport

Status: completed

- 实现 Gateway-owned Product Session 生命周期；
- 实现最小 turn streaming 与 resync；
- scripted Agent client 跑通四工具并生成产品事件。

Evidence：Product Session、real Bun HTTP API 与 resync contract tests 通过；四工具 event sequence、single Host authority、run/ref separation、deep freeze、JSON round-trip、非法 route/session 与并发 turn invariants 均有 executable coverage。

### Phase 3 — Studio Connected Presentation

Status: completed

- 接入自然语言输入、turn status、tool/evidence timeline；
- 由 Gateway evidence 驱动 Three.js、inspector 与 EpisodePlayer；
- 删除同一 connected path 中的浏览器写 authority。

Evidence：Studio source boundary test 禁止 `RuntimeMvpHost`/`createInitialSnapshot`；真实 Chromium 中四工具 trace、Three.js Observation、75-frame Episode 回放与 PASS evidence 均由 Gateway projection 驱动，新 Session 能恢复为空 projection。

### Phase 4 — Verification 与 Independent Review

Status: in_progress

- 完成 tests/typecheck/build/browser/diff/checklist gates；
- 对 single authority、transport admission、断流恢复、run/adopt separation 做 executable review；
- Coding agent 不自行批准 closeout、`mark-done`、commit 或 push。

Current evidence：56 tests / 0 fail / 340 assertions，typecheck、build、real Chromium acceptance、diff-check 与 checklist validation 已通过；等待冻结 digest 上的 independent cross-review verdict。

Round 1 cross-review：`changes_requested`。Kimi K3 Max 与 Sol Max 均确认并发 admission 可产生空 `200 NDJSON`；Sol executable probes 还证明空流被客户端当成功、断流不 resync、event/projection admission 过浅、UTF-8 byte/content-type bound 可绕过、internal error 泄露。Phase 4 保持 `in_progress`，按 `cross-review-verdict-round1.md` 的五项 root-fix direction 修复后再做 fresh review。

Round 1 remediation 已完成：ProductSession 增加同步原子 `tryRunTurn` admission，竞争者在构造 stream 前得到 409；HTTP body 逐 chunk 按 UTF-8 bytes 限额并精确解析 media type；共享 product codec 深验 event lifecycle、identity、tool/evidence 与完整 world evidence DTO；空流、断流、parse、fetch/abort error 触发只读 resync，并以 `ProductSessionTurnError.projection` 替换 App partial cache；Gateway 只输出 `agent_turn_failed`/`world_tool_failed` 等 public code。新增 adversarial regressions 后 full gate 为 62/0/375。真实 Chromium 复验成功 turn 的 75-frame Episode/PASS/ref-v2，也验证同 session 第二 turn 只显示脱敏 failure、权威证据经 resync 保留；新 session 再次成功，console 无 warning/error。当前 candidate digest 为 `af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db`，等待 fresh focused cross-review。

Round 2 cross-review：`changes_requested`。Kimi 静态 review 虽为 approved，但指出 producer/codec identity 上界不一致；Sol executable review 证明合法长 runId 会让 projection decode 失败，并复现 Abort 后单次 resync 永久停留 `running:true`、stale_ref identity 漂移、sparse/accessor codec 绕过与 failed trace input 泄露。按 `cross-review-verdict-round2.md` 从 settled recovery、descriptor-safe plain-data projection 与 producer-aligned identity/redaction 三个根部修复，再进入 fresh Round 3 review。

Round 2 remediation 已完成：失败后最多 100 次、20ms 间隔读取 authoritative projection，直到 `running:false`，超限则 fail closed；product codec 先通过 own descriptor 投影为全新 plain-data graph，再做世界语义 validation，拒绝 sparse/accessor/non-enumerable/symbol/超预算数据；派生 identity 由整体 2M char/100k node budget 约束，不再使用错误的 256 字符局部上界；edit evidence 对 updated/stale_ref 都绑定 ref/snapshot，模型面只允许 advance；failed trace input 固定为 `[redacted]`。新增 regressions 后 full gate 为 68/0/395，真实 Chromium 再次验证 frame 7/75 → 75/75、sanitized failure+settled resync 与 fresh session success。Candidate digest 为 `b476912e93c8417e00e79c930597c6aa2a8711c2e3aa4e2a847f3f530cb5bff8`，等待 Round 3 fresh cross-review。

Round 3 cross-review：`changes_requested`。Kimi K3 Max 静态 review approved，但把 recoverable failed tool 后 completed 当作未来 P2；Sol executable review 用当前 pinned OMP agent-core 与真实 API 证明 Gateway 已能合法产生 `failed → corrected → completed/PASS`，Studio 的 `sawFailedTool` 规则会误拒。同时，attempt-bounded resync 无法约束单次悬挂 GET。按 `cross-review-verdict-round3.md` 统一 terminal outcome authority，并改为包含每次 GET 的 wall-clock deadline。

Round 3 remediation 已完成：Studio settled resync 使用单一 wall-clock deadline，每个 GET 共享剩余预算并接收 AbortSignal，同时由 Promise deadline 保证即使 fetch port 忽略 signal 也会拒绝；client 删除 `sawFailedTool` 派生 outcome，只有 terminal event 决定 turn 结果。新增当前 OMP producer 的 failure→correction→completed/PASS regression、悬挂 GET deadline 与 130-event 正边界测试。Full gate 为 71/0/403；Chromium 再验 frame 9/75 → 75/75、PASS/ref-v2、sanitized failure/resync 与空 console。Final candidate digest 为 `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`，等待 Round 4 final review。

## 退出条件

只有当用户能在本地 Studio 中通过自然语言触发一个可观察、可回放、可评测的真实世界历程，并且 executable evidence 证明 Gateway 是该 Product Session 的唯一世界事实面时，`DH-006` 才可进入 closeout review。
```

## Review Focus

1. 当前计划或结果是否覆盖 acceptance
2. 是否越过 scope non-goals
3. 是否越过 architecture 模块边界
4. 是否偷偷吸收了未来 checklist item 的工作
5. 当前验证方式是否足以支持结束本轮
