# DH-008 Progress

## 2026-08-10 — Planning initialized

- 从已 fast-forward 并推送的 `main` commit `ac293318c8a6b2fe7433146df7417cc3c83e2726` 创建 `agent/codex/DH-008` 与独立 worktree；
- 当前代码事实：Kernel visual/collision 都只能是 `BoxRepresentation`；World Tool Surface 只接受 `cubeHeight`；MuJoCo Runtime 固定 `entity:floor + entity:cube`；Three.js Presentation 同步创建 `BoxGeometry`；
- canonical plan 将下一 slice 限定为一个 repo-owned imported rigid GLB fixture、独立 box collision proxy 与跨 Snapshot/Presentation/Runtime/Episode/Evaluation 的 EntityRef alignment；
- 当前没有开始产品实现，没有下载资产、调用真实模型、commit、push、merge、tag 或 deploy。

## 2026-08-10 — Harness activated

- `DH-008` 已通过 repo-local harness 登记并激活：ASSIGN `evt-20260811T015218Z-debb1144`、ACCEPT `evt-20260811T015218Z-acc5ffed`；
- checklist 为 `doing/running`，owner/session 为 `codex / codex-dh008-20260810-1`，120 分钟 lease 已取得；
- checklist validation 为 0 warning；当前只完成规划与 authority 建立，产品实现仍等待 Human 明确授权。

## 2026-08-10 — Imported rigid vertical slice implemented

- Human 明确授权继续实现后，Kernel 将 visual representation 扩展为 primitive box / imported rigid mesh 的最小 union，同时把 collision 固定为独立受验 box proxy；Snapshot、Episode 与 Evaluation 继续使用稳定 `EntityRef`，renderer/runtime object 不进入 product contract；
- 新增 repo-owned 非对称 `diagnostic-wedge-v1.glb` 与代码拥有的只读 registry：固定 `assetId`、SHA-256 `26e032d8ae8f4d3bea41e446a36087fba90afee58f583080830d2e70ee94590e`、`frame:gltf-y-up`、meters scale、local alignment、bounds、provenance 与 `CC0-1.0`；生成脚本重复执行得到相同 bytes/digest；
- MuJoCo MJCF 只消费 collision proxy、physics 与 state，不读取 visual asset/path；landing Success Contract 从 terminal collision evidence 推导 center height。现有 primitive scenario 与同一 Runtime/Host 保留；
- `world_write` 仅新增封闭 `fixtureId` 选择，仍恰好暴露 `read/write/edit/run` 四工具；任意 URL/path/file-like fixture、未知 artifact、digest/frame/units/transform/collision 漂移均 fail closed；
- Three.js Presentation 通过 `GLTFLoader` 异步加载登记资产，以 Entity root 绑定 selection/playback，处理 late load、recursive disposal 与 session reset；Inspector 显示 asset identity、frame、units、alignment tolerance、provenance/license、collision proxy 和 physics state；
- scripted Product Session 已经同一四工具完成 imported fixture 的 write/read/edit/run，产生 76-sample Episode 与确定性 Evaluation PASS；`run` 不推进 current ref，Agent 仍无 adopt authority；
- 完整门禁：`bun test` 为 96 pass / 0 fail / 516 assertions，`bun run typecheck`、`bun run build`、`git diff --check` 全部通过；production build 仅保留既有 MuJoCo/WASM chunk-size warning；
- 真实 Chromium 验收：GLB 为 `loaded` 并绑定 `entity:cube`，Episode 从 1.60 s 继续推进至 2.50 s，Inspector 呈现 digest/alignment/proxy，Evaluation PASS；新建 Session 后 asset status/ref/current ref/Episode/Evaluation 全部清空，canvas lifecycle 正常；
- 当前未调用真实 provider、未读取 credential、未 commit/push/merge。实现进入 frozen-digest independent review gate，批准前不 closeout 或 `mark-done`。

## 2026-08-10 — Round 1 cross-review 阻断并完成根部修复

- Sol Max 与 Terra Max 在 digest `66305bb2b078bb20f9181b63d263f35d0277ba61a20600cae94fada0a6a28281` 上独立给出 `changes_requested`：forged Episode sample/terminal EntityRef 或 terminal representation 可被 Product codec 接纳，Studio 的 authored-state fallback 会把坏 Episode 呈现为仍在播放且 PASS；
- Kimi K3 Max 通道因本地 CC Switch 连续 8 次连接 retry、93.8 秒无 token/tool event 而停止，cost 0；历史映射不作为本轮模型身份或 verdict 证据；
- remediation 从证据 contract 修复：samples、events、terminal 与 authored Snapshot 共享精确 EntityRef 集合；terminal representation/physics/frame/units 不变且 terminal state 绑定最后 sample；lastRun base ref 绑定 current world；stream event 在呈现前使用 turn-local authored world 校验；Presentation/Inspector 删除缺失 sample 的静默回退；
- 新增五类 forged regression；修复后 98 tests / 0 fail / 522 assertions，typecheck/build/diff-check/GLB digest 与 Chromium 1.43 s → 2.50 s playback、PASS、reset 清理均通过；新 candidate digest `f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910`，等待 fresh Round 2 review。

## 2026-08-10 — Round 2 lineage blocker 已修复

- Sol Max 批准 Round 1 remediation；Terra Max 复现 terminal Snapshot ID 可等于 base Snapshot ID 的邻近 P1，因此 combined verdict 仍为 `changes_requested`；
- codec 现明确要求 terminal 与 base 使用不同 immutable Snapshot identity；Studio source label 也只在 selected Entity 确有 Episode state 时标记 `episode-frame`；
- 新 full gate 为 98 tests / 0 fail / 523 assertions，typecheck/build/diff-check 通过；candidate digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7`，进入 final focused Round 3 review。

## 2026-08-10 — Round 3 final cross-review approved

- Sol Max 与 Terra Max 在 frozen digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 上独立批准，P0/P1/P2 均无；terminal/base identity、stream event 与 Round 1 closure executable probes 全部通过；
- final operator Chromium 重新绑定同一 candidate：asset `loaded`、`entity:cube`、`episode-frame`、1.43 s → 2.50 s、PASS；reset 后 authority/evidence/asset 清空，console 仅 Vite debug；
- DH-008 已满足 review gate，当前停在 Human closeout authority 前；未 commit/push/merge，未发送真实 provider prompt。

## 2026-08-10 — Operator close 完成

- Human 明确授权 closeout、`mark-done`、commit 与 push；closeout request 为 `evt-20260811T045713Z-9438f143`；
- closeout packet 初审发现 generator EOF 空行并阻断，清理后 fresh closeout reviewer 以 `evt-20260811T050106Z-b655d583` 批准，P0/P1/P2 无；
- Operator CLOSE 为 `evt-20260811T050106Z-c2088c45`；DH-008 已为 `done/closed`，owner/session 清空，lease 于 `2026-08-11T05:01:06Z` 释放；
- 发布边界只包含 commit 与 push `agent/codex/DH-008`；不包含 merge `main`、PR、tag、deploy 或真实 provider prompt。
