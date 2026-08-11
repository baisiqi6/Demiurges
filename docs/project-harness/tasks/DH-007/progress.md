# DH-007 Progress

## 2026-08-10 — Phase 1 started

- 从已同步的 `main` commit `a570064a7292821166fd65f074577a22b0390c14` 创建 `agent/codex/DH-007` 与独立 worktree；
- 冻结本 slice 的 Goal、In scope、Non-goals、Acceptance 与 live-canary authority gate；
- 已通过 worktree-local EXharness runtime 登记并激活 DH-007：ASSIGN `evt-20260810T154518Z-345c463e`、ACCEPT `evt-20260810T154518Z-c2b85f27`；
- checklist validation 为 0 warning；下一步核对本地 OMP provider/model composition；
- 当前没有执行真实 provider prompt、credential 读取、模型调用、commit、push 或 merge。

## Test results

| Gate | Result |
|---|---|
| baseline `bun test` | 71 pass / 0 fail / 403 assertions |
| baseline typecheck | passed |
| baseline build | passed；仅既有 Vite MuJoCo externalization 与 chunk-size warning |

## 2026-08-10 — Phase 1 completed

- 本地锁定 OMP SDK `17.2.12` 原生支持 explicit `modelPattern`、session `deadline` 与 `AgentSession.model` identity；
- 选择最小 contract：production 只接受严格 `DEMIURGES_OMP_MODEL=provider/model`，OMP 继续拥有 credential storage/resolution，Demiurges 在 session start 后核验实际 model identity；
- 不增加 provider registry、model picker、fallback chain 或 credential UI；
- 进入 Phase 2 RED regressions。

## Errors

| Error | Resolution |
|---|---|
| 新 worktree 中 `.artifacts/harness/harnessctl` 不存在 | `.artifacts` 是 worktree-local ignored runtime；改从 DH-006 的已实例化 runtime 调用，cwd 仍为 DH-007，不复制协议事实 |
| 跨 worktree 调用 harnessctl 仍绑定 DH-006 root | 已恢复旧 worktree 的 derived timestamp；改为复制 ignored runtime 到 DH-007，使脚本 root 与当前 authority 对齐 |
| 首次 GREEN typecheck 把 abort-listener cleanup 推断成 `() => undefined` | 显式标注为 `() => void`；不改变 runtime 行为，随后重跑 typecheck/full tests |
| Round 1 remediation 的 abort-aware test 在 `await Promise<never>` 后缺少显式 return | 补充不可达 `return []` 以满足 TypeScript override return contract；runtime test 已先通过 |

## 2026-08-10 — Phase 2 RED confirmed

- production executable source 尚未引用 `DEMIURGES_OMP_MODEL` 或真实 OMP factory，RED 如预期失败；
- `requireOmpModelSelector` 尚不存在，严格 selector contract 的 RED 如预期失败；
- 忽略 `AbortSignal` 的悬挂 POST 与 terminal 后悬挂 final GET 均超过 120ms guard，证明旧实现只有 failure-resync 局部 timeout，没有统一 turn deadline；
- exact 512 producer fixture 已进入 codec 测试；首个断言误读为 `episode.runId`，已按真实 schema 修正为 `episode.explicitInputs.runId`，这属于测试路径修正，不是产品缺陷。

## 2026-08-10 — Phase 3 implementation completed

- production `main.ts` 在启动 `Bun.serve` 前强制解析 `DEMIURGES_OMP_MODEL=provider/model`，并显式注入真实 OMP factory；
- OMP session 使用显式 `modelPattern`，创建后核验 `session.model.provider/id`，缺失或漂移时 fail closed；credential storage/resolver 仍完全由 OMP 拥有；
- `createProductSessionApi` 不再提供 scripted default，所有 tests 显式注入 fixture；另设独立 `dev:scripted-fixture` 入口供离线浏览器验收，不增加 production runtime mode 或第二套 endpoint；
- Studio 单 turn 的 absolute deadline 现在覆盖 POST fetch、NDJSON stream、成功 final GET、失败 settled resync 与 caller abort；即使 fake port 忽略 `AbortSignal` 也会 wall-clock reject，stream reader 会被取消；
- exact 512-char `runId` producer/codec 正边界与 513-char tool admission 负边界均已落测；
- footer 改为事实性的 `restricted four-tool session`，不把 scripted fixture 冒充 live model。

## 2026-08-10 — Phase 4 offline evidence

- full `bun test`：76 pass / 0 fail / 419 assertions；
- `bun run typecheck`：passed；
- `bun run build`：passed，仅既有 MuJoCo browser externalization 与 `>500 kB` chunk warning；
- `git diff --check`：passed；
- 隔离端口 `18787/15173` 启动 scripted fixture + 当前 Studio，浏览器确认 `world_write → world_read → world_edit → world_run`、current `snapshot:edit-1 / v2`、76 samples、逐帧 replay、PASS；新建 `session:local-2` 后 ref/trace/Episode/Evaluation 清空；browser console 无应用 error；
- axe 额外发现既有 step-number/tool-ok 浅色文本 contrast violation；它不由本 slice 引入，记录为非阻断 UI debt，不在 DH-007 扩张修复范围；
- 关闭 Vite QA process 时 terminal 出现一次 `ResizeObserver loop completed with undelivered notifications`；浏览器 console/errors 在操作前后均为空，初步判断为关闭/resize 时 dev-client 诊断，未作为产品成功证据。
- no-prompt `bun --cwd apps/agent-gateway smoke:sdk`：OMP runtime `17.2.12`，tool names 恰好为 `world_read/world_write/world_edit/world_run`，session 启动后立即销毁；未发送 prompt、未产生 billed inference，输出不含 credential。后续 source review 证明 SDK construction 可能执行 model-host preconnect，因此本条不再作为“完全未触达 network/provider”的证据；
- frozen product digest：`dc90a2482be303718554c13dba6b2ec2d923684bcf3f8fca2f04cc8aaf2a8867`；进入只读 independent cross-review。

## 2026-08-10 — Reviewer authority correction

- 实时发现本机 Kimi Code CLI `0.32.0` 与 `kimi-code/k3`（支持 `max`）可用；
- 但调用本机 Kimi 会产生外部 provider 请求与费用，超出当前 DH-007 “不发送真实 provider/model prompt、不产生模型费用”的 authority；因此本轮不调用 Kimi，也不读取其 credential；
- 改用内置 Sol Max executable reviewer 与 Terra Max static reviewer，在同一 frozen digest 上交叉审查。若 Human 另行授权，可再补 Kimi K3 Max review，但它不是绕过 live-canary gate 的隐含权限。

## 2026-08-10 — Round 1 cross-review changes requested

- Sol Max 与 Terra Max 在 digest `dc90a248...` 上均给出 `changes_requested`，review 前后 digest/Git status 不变；
- P1：OMP ambient `retry.modelFallback` 可在初始 identity gate 后切换到未授权 provider/model；
- P1：Studio abort/deadline 没有贯穿 Gateway/ProductSession/OMP，客户端停止后 Agent 仍可能继续产生费用或世界副作用；
- P2：no-prompt smoke 可能执行 SDK model-host preconnect，不能宣称“完全未触达 network/provider”；确认它未发送 prompt/未证明真实模型成功，但此前过强表述已撤回；
- Round 1 证据永久保留；下一步新增 settings isolation 与 end-to-end cancellation RED regressions，在新 digest 上 fresh review。

## 2026-08-10 — Round 1 remediation completed

- `RestrictedOmpSdkClient` 改用 `Settings.isolated`，显式关闭 `retry.enabled`、`retry.modelFallback`、`retry.usageAwareFallback`；不再继承 user/project ambient retry chain，provider failure 直接结束，不自动切换 model 或 credential；
- explicit model identity 在 session start 后与 prompt 完成后各核验一次；前者是 admission，后者是检测纵深；
- `AbortSignal` 从 Gateway HTTP request/server absolute timeout 贯穿 `ProductSession → OmpWorldAgent → OmpAgentClientPort`；真实 OMP client 调用 `session.abort()` 并等待 idle；
- world tool wrapper 在进入 `WorldToolSurface` 前拒绝 aborted call，且 OmpWorldAgent 不把 abort 后的 tool observation 送入产品事件；
- Gateway timeout 与 HTTP request abort 两条 executable regressions 均证明 stream bounded settle、Agent 收到 aborted signal、无 `tool.completed` 后续事件、world/lastRun 为空且 authority 回到 `running:false`；
- remediation 后 full gates：80 pass / 0 fail / 429 assertions，typecheck/build/diff-check 通过；scripted Chromium 复验 frame 59/75、四工具、PASS、current ref v2、console/errors 为空；
- 最终一行补强已处理 pre-aborted Request signal；targeted tests/typecheck/diff-check 仍通过。Round 2 frozen product digest：`def0c72e9ccfc88066bcee572fd8b0e973afd6470c8c61888290a9d32f239480`。

## 2026-08-10 — Round 2 cross-review changes requested

- Sol Max 与 Terra Max 在 digest `def0c72e9...` 上均给出 `changes_requested`，review 前后 digest 不变；
- P1：锁定 OMP 的 Fireworks `*-fast → base` intrinsic fallback 独立于三项 retry settings，post-turn identity check 无法阻止第二 model 已收到推理；
- P1：锁定 `pi-ai` provider driver 仍能在 auth/usage failure 时旋转 sibling credential，必须通过 `getApiKey` seam 把本 turn 固定到初始 credential 并在 retry 时 fail closed；
- P1：Gateway deadline 尚未覆盖 OMP `start/stop` lifecycle，忽略 signal 的悬挂 phase 会阻止 bounded settle 与 `running:false` 恢复；
- Round 2 证据永久保留；下一步先写 model/credential authority 与 lifecycle hanging RED regressions，再做最小根修并进入新 digest 的 Round 3 review。

## 2026-08-10 — Round 2 remediation completed

- RED 先复现：当前 Gateway 对永久悬挂 `start/stop` 超过 150ms 仍未 settled；credential authority helper 尚不存在；
- selector admission 直接拒绝锁定 OMP 具有不可关闭 intrinsic fallback 的 `fireworks/*-fast`，不再依赖 turn 后检测；
- production 通过 `getApiKey` seam 在每次 model-facing request 前核验唯一授权 `provider/model`，首次 credential resolution Promise 固定复用并以 resolved static key 交给 `pi-ai`，auth/usage failure 不再进入其 sibling rotation resolver；
- OmpWorldAgent 用同一 AbortSignal 包围 `start → tool surface → prompt → response → stop`；新增 fake port 完全忽略 signal 且 start/stop 永久悬挂的 executable regressions，Gateway 均 bounded settle 并恢复 `running:false`；
- Restricted client 跟踪 in-flight start，partial startup 在 abort 后自行 dispose，并关闭 owned AuthStorage；不会在 late start 后进入 prompt；
- full gates：83 pass / 0 fail / 443 assertions，typecheck、build、diff-check 通过；build 仅既有 MuJoCo browser externalization 与 `>500 kB` chunk warning；
- scripted Chromium 再验：四次 world tool、76 samples、frame 75→74、PASS、current ref `snapshot:edit-1 / v2`，console 仅 Vite dev debug、page errors 为空；
- Round 3 frozen product digest：`ea599a14af3cb1b1cae19cc5defb59329715b117853455af03090a26a73f402c`。未读取 credential、未运行真实 provider/model prompt 或 remediation 后普通 SDK smoke。

## 2026-08-10 — Round 3 cross-review changes requested

- Sol Max 与 Terra Max 在 digest `ea599a14...` 上均给出 `changes_requested`；review 前后 digest 不变；
- 两位 reviewer 一致用 fake port 复现：turn abort/settled 后，client 可替换 SDK signal，以 fresh signal 迟到执行 `world_write`，污染真实 surface 且 ProductSession projection 仍为 null；
- Sol P1：OMP preflight 使用 session-affine credential，而 product pinned resolver 首次解析未传同一 sessionId；双 synthetic credential 可让同一 turn 触达两个 sibling credential；
- Sol P1：默认 compaction/snapcompact maintenance 直接使用 ModelRegistry 与独立 resolver，仍可能旁路调用第二 model/credential；
- Terra P1：`ProductSession.runTurn()` 在 `finally` 清 `running` 前已构造成功 projection，直接返回值错误地携带 `running:true`；
- 下一步把 owning turn capability 固化到四工具 closure、统一 provider session affinity、关闭 ancillary inference，并在新 digest 上进入 Round 4 review。

## 2026-08-10 — Round 3 remediation completed

- RED 先复现五项失败：成功 `runTurn()` 返回 `running:true`；abort 后 fake port 用 fresh signal 的 late write 成功；settings 仍启用 compaction；pinned resolver 没有 provider session identity；
- Restricted client 现在先创建唯一 in-memory SessionManager，以同一个 `providerSessionId=sessionManager.getSessionId()` 同时约束 OMP `createAgentSession` preflight 与 product pinned initial credential resolution；
- isolated settings 显式关闭 context promotion、auto/mid-turn compaction，并把 strategy 设为 `off`，本产品 session 不进入 context-maintenance ancillary inference；
- `createOmpWorldTools` closure 捕获 owning turn signal，并在 sequence/input/trace/WorldToolSurface 之前 fail closed；两层 regression 证明 fake port 即使用 fresh signal 迟到调用 `world_write`，也不能创建 Snapshot 或污染 ProductSession；
- `ProductSession` 在构造成功 projection 前恢复 `running:false`，直接返回值与随后 authority read 一致；
- targeted：27 pass / 0 fail / 141 assertions；full：85 pass / 0 fail / 452 assertions；typecheck、build、diff-check 通过；build 仍只有既有 MuJoCo externalization 与 chunk-size warning；
- Round 4 frozen product digest：`678d6811d35dfcac1bdacda922c792b8772d1df21cec5fe7728360d307c8f17c`。未读取 credential、未发送真实 provider/model prompt、未运行普通 SDK smoke。

## 2026-08-10 — Round 4 cross-review changes requested

- Sol Max 给出 `approved`，确认 provider session affinity、pinned credential、compaction/context shutdown、abort 后 late-call 与 returned projection 已关闭；
- Terra Max 给出新的 executable P1：外来 Request signal 在正常 completed path 不会 abort，retained fake tool closure 仍可在 `turn.completed` 后 fresh-signal 写世界并产生晚到 event；
- combined verdict 为 `changes_requested`；两份相异的真实 verdict 都永久保留；
- 下一步只引入 turn-owned terminal capability controller，在 success/failure/abort 全部关闭，并增加正常完成后的 late-call regression。

## 2026-08-10 — Round 4 remediation completed

- RED 复现：正常 `turn.completed` 后 retained `world_write` 以 fresh signal 成功，ProductSession 从 `world:null,lastSequence:2` 被污染成新的 world/event；
- `OmpWorldAgent.run()` 现在创建 turn-owned internal capability controller；外部 Request signal 只负责触发关闭，四工具 closure 只绑定这个不可替换的内部 lifetime；
- capability 在 factory failure、所有 lifecycle failure、external abort、正常 prompt completion 与 cleanup 后一律永久关闭；正常路径在 response/stop 前即关闭 world tool authority；
- Agent 与 ProductSession 两层回归都证明 normal completed/abort settled 后的 retained tool fresh-signal call 被拒绝，Snapshot、world/lastRun、sequence/event 均不变化；
- targeted：29 pass / 0 fail / 148 assertions；full：87 pass / 0 fail / 459 assertions；typecheck、build、diff-check 通过；
- Round 5 frozen product digest：`4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b`。未读取 credential、未发送真实 provider/model prompt、未运行普通 SDK smoke。

## 2026-08-10 — Round 5 final cross-review approved

- Sol Max 与 Terra Max 在同一 frozen product digest `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b` 上独立给出 `approved`，P0/P1/P2 均无；review 前后 digest 不变；
- 两位 reviewer 分别覆盖 factory/start/tool-surface/prompt/response/cleanup、normal completion 与 external abort lifecycle matrix；正常完成或失败 settled 后，retained tool 即使用 fresh signal 也不能创建 Snapshot、污染 world/lastRun 或追加 event/sequence；
- Sol targeted 为 21 pass / 0 fail / 111 assertions，full 为 87 pass / 0 fail / 459 assertions；Terra targeted 为 32 pass / 0 fail / 159 assertions；
- Round 1—4 的 changes-requested/approved 历史全部保留；offline reviewer gate 已通过，但真实 provider canary、credential 使用、费用、closeout、commit、push、merge、tag 与 deploy 仍未获授权。

## 2026-08-10 — Human authorized one bounded live canary

- Human 明确回复“我授权”，承接 Operator 上一条列明的唯一 canary contract：`kimi-code/k3`、一个 Product Session、一个用户 turn、120 秒 absolute deadline、最多 128 次 world tool call；
- 唯一 prompt：`创建一个方块，把高度改到 2.8 米，然后让它落到地面并检查结果。`；
- credential source 仅为本机 OMP AuthStorage；允许消耗该次 Agent tool loop 所需的 Kimi Code 订阅额度，但不授权读取/输出 secret，不授权第二个 turn、自动 retry/fallback/model switch、commit、push、merge、tag 或 deploy；
- 调用前实时核验 `omp/17.2.12` 与 model catalog 中 `kimi-code/k3` 存在；Gateway/SDK 仍必须在运行时核验实际 model identity 与 exact four-tool surface。

## 2026-08-10 — `kimi-code/k3` live canary passed

- production Gateway 使用 `DEMIURGES_OMP_MODEL=kimi-code/k3` 在 loopback 隔离端口启动；创建唯一 `session:local-1` 并提交唯一授权 prompt；
- 27,833 ms 内收到 5 个 ordered product events：`turn.started → world_write → world_edit → world_run → turn.completed`；三个 tool call 均 succeeded，未出现第五种工具、retry/fallback 或第二个 turn；
- 模型省略了非必要的 `world_read`，直接使用 `world_write` evidence 中的 ref 完成 `world_edit`，没有越过四工具 authority；
- settled projection 为 `running=false`、current `snapshot:edit-1 / v2`；Episode 有 76 samples，Evaluation `passed=true`，run 未 adopt terminal Snapshot；
- Gateway 已停止；receipt 写入 `docs/project-harness/tasks/DH-007/live-canary-receipt.md`。当前未 commit/push/merge/tag/deploy，也未 mark-done；下一步需要独立 Operator closeout / Git 发布 authority。

## 2026-08-10 — Human authorized closeout and branch publication

- Human 在看到 Round 5 双审批准、真实 canary 结果与 receipt 后，明确授权 `closeout`、`mark-done`、commit 和 push；
- 本授权允许 Human final acceptance 作为 closeout review authority，但不改写或冒充 Round 5 reviewer 历史；
- Git scope 仅为 `agent/codex/DH-007` 当前 worktree 的 DH-007 产品与 harness 变更；不包含 merge `main`、PR、tag 或 deploy。

## 2026-08-10 — Operator closeout completed

- closeout request：`evt-20260811T014025Z-f9f64fb3`；Human final acceptance：`evt-20260811T014025Z-7d048edc`；Operator CLOSE：`evt-20260811T014025Z-ee79bfc5`；
- `DH-007` 已为 `done/closed`，owner/session 清空，lease 于 `2026-08-11T01:40:25Z` 释放；整个转换未使用 `--force`；
- checklist validation 为 0 warning；Git 发布边界仍只包含 commit + push `agent/codex/DH-007`，不包含 merge `main`、PR、tag 或 deploy。
