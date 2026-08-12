# DH-010 Phase 5 工作记录

## Authority

- Human 已授权进入 Phase 5 Studio visible slice；不进入 Phase 6 independent review，不 commit/push/PR/merge/tag/deploy，不 close/mark-done。
- 当前 owner/session：`codex` / `dh010-phase1-20260811`；branch：`agent/codex/DH-010`；lease 截止 `2026-08-11T15:14:47Z`。

## Boundary

- 只消费 Phase 1–4 已冻结的 exact floor/cube 与 floor/vessel/ball Product projection，不修改 Kernel/Runtime/Evaluation contract。
- selection、Program/Runtime、metrics、artifact identity 与 rim frame 都从受信 Snapshot/WorldRunResult 解析；Three.js object 只承载 Presentation，不成为状态 authority。
- 继续保留 diagnostic GLB + 3DGS/Spark 路径；ball-vessel 场景新增 smooth GLB、sphere/compound overlay 与 semantic rim-center frame，不伪造 3DGS observation。

## RED targets

- default selection 依据 Snapshot dynamic role，second Session 不保留 stale EntityRef；无 Observation 时 `3dgs` 自动退回 `mesh`。
- stable-on-floor 与 stable-inside-vessel 两个 closed Evaluation variant 均输出结构化 metrics；Program/Runtime 标签来自 lastRun evidence。
- sphere/compound overlay 的每个 node 解析回唯一 EntityRef；rim helper 使用 semantic local pose；imported URL 只由 repo-owned asset identity registry 解析。
- scripted local Product Session 通过同一四工具执行 ball-vessel，供真实 Chromium visible acceptance 使用。

## RED baseline

- `bun test apps/studio/src/presentation-model.test.ts apps/studio/src/presentation-three/entity-presentation.test.ts apps/studio/src/connected-authority.test.ts apps/agent-gateway/src/product-session.test.ts`：7 pass / 4 fail / 2 module errors。
- failures 精确命中：缺少 trusted presentation projection、缺少 Entity overlay/asset registry、App 仍硬编码 `CUBE_REF/FALLING_CUBE_PROGRAM/DIAGNOSTIC_RIGID_ASSET`、scripted Product Session 仍把 ball-vessel edit target 固定为 `entity:cube`。

## Browser integration finding

- 首次真实 Chromium turn 报 `compound collision 与 fixture registry 漂移`。ball-vessel `JSON.stringify → JSON.parse → decode` regression 与直接 HTTP NDJSON 在 Bun 内通过，证明不是 transport 丢字段，也不是 renderer。
- 根因是 fixture 用运行时 `Math.sin/cos` 计算 16 个 wall pose：Gateway 的 JavaScriptCore 与 Chromium 的 V8 在三角函数末位产生不同数值，而 codec 必须保持 registry exact identity。修复没有放宽 comparator tolerance，而是将 16 个 canonical pose 固化为 plain-data literals；Gateway、Studio、MuJoCo 与 codec 现在消费同一事实。
- 新增 source regression 禁止 fixture registry 在运行时重算三角函数；ball-vessel JSON round-trip regression 同时保留。

## Studio / lifecycle progress

- `presentation-model.ts` 从 Snapshot role 解析默认 selection，从 Evaluation closed union 解析 landing/containment metrics，从 lastRun 解析 Program/Profile；App 不再引用 `CUBE_REF`、`FALLING_CUBE_PROGRAM` 或 `DIAGNOSTIC_RIGID_ASSET`。
- Presentation asset registry 只登记 diagnostic wedge 与 smooth vessel 两个 repo-owned GLB identity；sphere、box、compound overlay 与 semantic rim helper 都将所有 Three node 映射回单一 EntityRef。
- diagnostic Entity 默认使用 3DGS；无 Observation 的 ball/vessel 默认使用 mesh，且 3DGS button fail-closed disabled，不伪造 observation。
- `createSession()` 在发起网络请求前立即清空 projection/world/lastRun/selection，避免连接阶段短暂显示旧 Session；late GLB callback 继续由 `active + objects.get(ref) === record` guard 丢弃。

## Errors encountered

- 首选 `agent-browser` CLI 不存在（`command not found`）；按 skill fallback 使用 Codex in-app Browser 完成同一 Chromium acceptance。
- 首次聚合 digest 命令在 zsh `while read path` 中误用了特殊 `path` 变量，导致循环内 `PATH` 被覆盖；未产生产品修改。已清理限定前缀临时文件，改用 `file_name` 与绝对 `/usr/bin/shasum` 后成功，不重复该写法。
