# DH-011 Round 5 Fresh 独立实现交叉审查请求

你是 fresh independent implementation reviewer，严格只读。不得修改文件、commit/push/merge/reset/clean，不得网络、SSH、deploy、真实 provider prompt 或 credential 读取。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- base/HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- canonical plan：`docs/project-harness/tasks/DH-011/plan.md`
- product manifest：自行运行 `{ git diff --name-only 06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca -- apps packages scripts; git ls-files --others --exclude-standard -- apps packages scripts; } | LC_ALL=C sort -u`，必须恰好 36 个文件。
- aggregate：按 manifest 顺序逐文件 `/usr/bin/shasum -a 256`，对完整输出文本再 `/usr/bin/shasum -a 256`，必须为 `69aa8afc31ee5226aeee573e1227444d9bab76a30f6b751a026275fe32eb7866`。

禁止读取任何 DH-011 `*verdict*`、`*cross-review*`、Round 1–4 implementation request/reviewer transcript 和 `docs/project-harness/current/review-packet.md` reviewer summary。若起点 identity 不匹配，立即 `blocked`，不得审查移动目标。

## 实现目标

审查 `read/write/edit/run → one entity:arm → explicit actuator-sequence Program → private MuJoCo → action-conditioned Episode → trusted Evaluation → Product/Studio`。不要要求 DH-012/world model、IK、planner、grasp、robot SDK、arbitrary importer、第五工具或 UI redesign。

## Mandatory checks

1. 起止复算 branch/HEAD/status、36-file manifest 与 aggregate，确认冻结期间零漂移。
2. 运行 `bun test packages/world/src/dh011-articulated-contract.test.ts packages/world/src/product-session-codec.test.ts apps/studio/src/product-session-client.test.ts apps/agent-gateway/src/product-session.test.ts apps/agent-gateway/src/omp-world-agent.test.ts`、`bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、`.artifacts/harness/harnessctl validate`。
3. 四工具与 explicit Program：nested plain-data/sparse/accessor/extra/symbol/non-finite fail closed；无 legacy `programId`、机器人专用第五工具或 hidden control path。
4. Runtime：每 run 私有 fresh MuJoCo module/model/data；exact MJCF source digest + 可读 compiled-model digest；callback/global state、fresh-data、applied force、model ownership/causal drift、contact/constraint、semantic limits 在统一 boundary 闭合；canonical action clock 为 720 step / 721 forward / 91 samples / 16 settle。执行 duration `<0.5`、非 action/sample grid、terminal-time step、缺失/第三 command、callback、qfrc/xfrc/disableactuator、reused data、model mutation/replacement negatives。
5. Authority：run 不推进 Ref；primitive、diagnostic、ball-vessel、articulated 的 AdoptPolicy ID 全局唯一；各场景 PASS 后 explicit adopt 可用；adopt 后第二次 articulated run 的 sample 0 exact 使用 terminal qpos + 非零 qvel；Episode/Evaluation/Program/model digest/representation/ref 任一同步伪造都拒绝。
6. Fixture registry：primitive、diagnostic、ball-vessel、articulated 的 `scenarioId` 与 exact fixture identity 一一绑定；同步错标 scenario 也必须拒绝。
7. Product trusted verifier：articulated projection 只以独立 `expectedWorld` 重放，不能以 projection 自带 world 作为 authority；sync decoder 对 articulated fail closed。
8. Event authority state machine：successful `world_write` 只能在没有前序 authority 时初始化一次；successful `world_read` 必须 exact 读取既有 authority；`world_edit stale_ref` exact 保持，`updated` 必须是直接 child/version+1；`world_run` 绑定既有 authored world。foreign lineage 即使内部自洽也必须在 event admission 拒绝，Studio 只能在 codec 通过后升级规范 `{ref,snapshot}`。
9. 最终 GET/resync：只要传入 `expectedWorld`，无论 world/lastRun 是 rigid、ball-vessel、articulated 或 null，都必须 exact 比较 projection world authority；completed、failed、真实断流三条路径都不能替换已验证 world。
10. 执行正反例：合法 write/read/updated/stale_ref、foreign read/write/stale_ref；completed/failed/disconnected foreign projection；正常 scripted articulated four-tool turn；同步改写 projection world/base/terminal/Evaluation/causal digest/scenario。
11. DH-001–010.1 regression 全绿；build 既有 MuJoCo browser-external/chunk warning 不作为 blocker。真实 Chromium 已由 owner 验收：四工具、91 samples、frame 0→90、PASS、run 后 current ref 保持 authored `snapshot:edit-1 v2`。
12. bounded fresh scan 只寻找会让 accepted input 产生错误 world/evidence、让 forged evidence 被接受、破坏四工具/authority 或造成 accepted path 不可用的 P0/P1；完成即停止，不扩展 DH-012 或平台设计。

## 输出

中文为主，结构化给出 reviewer identity、commands、frozen identity before/after、P0/P1/P2（文件行号+可执行反例）、Acceptance 1–12、未验证项、`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`。只有 P0=0/P1=0 才能 approved。
