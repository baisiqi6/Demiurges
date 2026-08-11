# DH-007 计划：真实 OMP Agent Canary

## 状态与 Authority

- Status：`active`；
- Branch：`agent/codex/DH-007`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-007`；
- Human 已授权创建并实现本 slice 的离线部分；
- 当前 authority 不包含读取或输出 credential、发送真实 provider/model prompt、产生模型费用、commit、push、merge、tag 或 deploy；
- 真实 canary 只在离线 gates 通过后，向 Human 单独确认唯一 provider/model、credential source、调用次数与费用边界。

## Goal

让 Studio 的产品启动路径使用真实 OMP SDK Agent Runtime composition，而不是 deterministic scripted Agent；用户自然语言必须沿 DH-006 已批准的 Product Session、四工具与权威证据链执行。scripted client 只保留为注入式 test fixture。

## First-principles boundary

真实模型不是新的世界 authority。它只决定下一次调用哪个既有 world tool：

```text
Studio prompt
  → Product Session
  → restricted OMP Agent
  → world_read / world_write / world_edit / world_run
  → Gateway-owned Host
  → Snapshot / Episode / Evaluation evidence
  → Studio Presentation
```

Provider latency、失败和不确定输出进入系统后，turn lifecycle 必须有统一 wall-clock deadline。credential 只属于 Gateway process/provider boundary，不能进入 Studio、product event、Snapshot、trace、assistant text、error 或 repo artifact。

## In scope

1. 把 production `createProductSessionApi` composition 显式接到 `createDefaultOmpAgentClient`；默认 product path 不再实例化 scripted client。
2. scripted client 继续作为 tests 注入的 deterministic fixture，不增加 runtime `mode` flag 或第二套 endpoint。
3. 核对并冻结当前 OMP SDK 对 provider/model selection 的最小 composition seam；只支持一个显式选择，不建设 provider registry、model picker 或通用 Adapter SDK。
4. 为 Studio turn POST、成功后的 final projection GET 与失败 settled resync 建立一个共享 wall-clock budget；调用方 abort 与内部 deadline 都必须生效。
5. 保持四工具 exact allowlist、mounted tools 为空、slash/control 与 `@file` preprocessing fail closed。
6. 增加 exact 512-char `runId` 正边界回归，保持 derived evidence identity、codec 与整体 data budget 一致。
7. 用 injected fake/provider port 完成 offline product regression：真实 production composition 被选择，模型可经历 failed tool → correction → `turn.completed` / PASS，所有 failure evidence 保持脱敏。
8. 完成 tests、typecheck、build、no-prompt OMP SDK smoke、diff/checklist 与本地 Chromium scripted fixture acceptance；不把这些证据误称为真实模型成功。

## Non-goals

- 未经单独授权发送任何真实 provider prompt 或读取 credential value；
- 多 provider、多 model UI、自动 fallback、router、计费系统或 credential 管理平台；
- 新增第五个 model-facing world tool，或把 `adopt` 交给 Agent；
- 修改 Kernel、Repository、Runtime 或 Evaluation 语义；
- imported mesh、Spark/3DGS、机器人、VLM 或 world model；
- 公网服务、鉴权、TLS、数据库、持久 session 或 deployment。

## Acceptance

1. Gateway executable entry 明确使用真实 OMP client factory；product source 中 scripted factory 只被 tests 或显式 test composition 引用。
2. no-prompt smoke 证明锁定 OMP runtime 能启动，active/enabled tools 恰好为四个且 mounted 为空；未发送 prompt。
3. Studio 的一个 turn 共享单一 deadline，覆盖 POST stream、成功 final GET 与失败 settled resync；悬挂且忽略 AbortSignal 的 port 也会 bounded reject，App fail closed。
4. exact 512-char `runId` 能产生并通过 codec 接纳的 Episode/TerminalSnapshot/Evaluation identity；513-char model input 在 world tool execution 前 fail closed。
5. injected provider regression 证明 failed tool 可以纠正后 completed/PASS；tool/input/provider/credential/internal failure 不泄露到 product transport。
6. scripted browser fixture 继续证明权威 Snapshot/Episode/Evaluation 驱动 Three.js 与逐帧 Episode；测试 UI 必须清楚标识 fixture，不伪称 live model。
7. 真实 canary 前生成明确的授权请求，包含唯一 provider/model、最大 turn/tool budget、deadline、credential source 与预期费用；未获 Human 明确授权时停止。

## Phases

### Phase 1 — Harness activation and contract discovery

Status: completed

- 创建 worktree、登记/激活 DH-007；
- 只读核对本地锁定 OMP SDK 的 provider/model composition；
- 记录 credential 与 live-call authority boundary。

### Phase 2 — RED regressions

Status: completed

- production entry 仍使用 scripted client 的失败测试；
- POST/final GET 悬挂 deadline 的失败测试；
- exact 512/513 runId 边界测试；
- provider/internal error transport redaction 回归。

### Phase 3 — Minimal implementation

Status: completed

- product entry 接真实 OMP client factory；
- 单一 turn deadline；
- 最小显式 provider/model composition；
- 保持 test fixture injection。

### Phase 4 — Offline verification

Status: completed

- targeted/full tests、typecheck、build、no-prompt smoke；
- Chromium scripted fixture acceptance；
- product digest、diff-check、checklist validation。

### Phase 5 — Independent review and live-canary gate

Status: completed

- 对 credential isolation、tool surface、deadline 与 evidence authority 的五轮 independent review 已完成；Round 5 双审在同一 frozen digest 上批准；
- Human 已单独授权并完成一次 `kimi-code/k3` bounded live provider canary：一个 session、一个 turn、27,833 ms、三次合法 world tool call、76 samples、Evaluation PASS；
- canary receipt 已脱敏落盘；任务现在停在 Operator closeout / Git 发布的独立 authority gate，不自行 close、commit 或 push。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 新 worktree 不包含 ignored `.artifacts/harness/harnessctl` | 1 | 不复制第二套 runtime；从同仓 DH-006 worktree 调用已实例化 harnessctl，并保持 cwd 为 DH-007 |
| harnessctl 的 project root 绑定脚本所在 worktree，跨 worktree 调用仍写 DH-006 | 2 | 恢复旧 worktree 唯一 timestamp 变化；把已批准 runtime 机械复制到 DH-007 ignored `.artifacts/`，保持每个 worktree 独立派生状态 |
| zsh 对未命中的 OMP `model*` source glob fail closed | 1 | 改用精确 `src/config/model-registry.ts` 与 `sdk.ts` 路径完成只读核对 |

## Exit condition

离线实现和独立审查只能证明真实 OMP product composition 已准备好。只有 Human 明确授权的真实 provider canary 产生四工具 trace、权威 Episode/Evaluation 与 bounded receipt 后，DH-007 才能宣称“真实模型 Agent 闭环成立”。
