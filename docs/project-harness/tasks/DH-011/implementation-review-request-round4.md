# DH-011 Round 4 Fresh 独立实现交叉审查请求

你是 fresh independent implementation reviewer，严格只读。不得修改文件、commit/push/merge/reset/clean，不得网络、SSH、deploy、真实 provider prompt 或 credential 读取。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- base/HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- canonical plan：`docs/project-harness/tasks/DH-011/plan.md`
- product manifest：自行运行 `{ git diff --name-only 06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca -- apps packages scripts; git ls-files --others --exclude-standard -- apps packages scripts; } | LC_ALL=C sort -u`，必须恰好 36 个文件。
- aggregate：按 manifest 顺序逐文件 `shasum -a 256`，对完整输出文本再 `shasum -a 256`，必须为 `eacf23e529f8c48c021406b023ba2a42b6642706de754bea44ad707cabe3c78e`。

禁止读取任何 DH-011 `*verdict*`、`*cross-review*`、Round 1–3 implementation request/reviewer transcript 和 `docs/project-harness/current/review-packet.md` reviewer summary。若起点 identity 不匹配，立即 `blocked`，不得审查移动目标。

## 实现目标

审查 `read/write/edit/run → one entity:arm → explicit actuator-sequence Program → private MuJoCo → action-conditioned Episode → trusted Evaluation → Product/Studio`。不要要求 DH-012/world model、IK、planner、grasp、robot SDK、arbitrary importer、第五工具或 UI redesign。

## Mandatory checks

1. 起止复算 branch/HEAD/status、36-file manifest 与 aggregate，确认冻结期间零漂移。
2. 运行 `bun test packages/world/src/dh011-articulated-contract.test.ts packages/world/src/product-session-codec.test.ts apps/studio/src/product-session-client.test.ts apps/agent-gateway/src/product-session.test.ts apps/agent-gateway/src/omp-world-agent.test.ts`、`bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、`.artifacts/harness/harnessctl validate`。
3. 四工具与 explicit Program：nested plain-data/sparse/accessor/extra/symbol/non-finite fail closed；无 legacy `programId`、机器人专用第五工具或 hidden control path。
4. Runtime：每 run 私有 fresh MuJoCo module/model/data；exact MJCF source digest + 可读 compiled-model digest；callback/global state、force/contact/constraint、semantic limits 每 tick 闭合；canonical action clock 为 720 step / 721 forward / 91 samples / 16 settle。
5. Authority：run 不推进 Ref；PASS 后 explicit adopt；adopt 后第二次 run 的 sample 0 exact 使用 qpos + 非零 qvel；Episode/Evaluation/Program/model digest/representation/ref 任一同步伪造都拒绝。
6. Product trusted verifier：articulated projection 只以独立 `expectedWorld` 重放，不能以 projection 自带 world 作为 authority；sync decoder 对 articulated fail closed。
7. `world_edit` continuity：
   - `stale_ref` 的 `{ref,snapshot}` 必须 exact 等于前序 expected authority；
   - `updated` 必须是 `source=edit`、parent=expected Snapshot、scenario 不变、ref name 不变、version 恰好 +1；
   - 只比较 authority 的规范字段 `{ref,snapshot}`，不能因 `read/write/edit` transport 附带 `tool/status/operation` 而误拒合法流；
   - foreign lineage 即使内部自洽也必须在 event admission 拒绝。
8. 最终 GET/resync：只要传入 `expectedWorld`，无论 world/lastRun 是 rigid、ball-vessel、articulated 或 null，都必须 exact 比较 projection world authority；completed、failed、真实断流三条路径都不能用 response 自带另一条 lineage 替换已验证 world。
9. 执行正反例：合法 updated、合法 stale_ref、foreign stale_ref；completed/failed/disconnected foreign projection；正常 scripted articulated four-tool turn；同步改写 projection world/base/terminal/Evaluation/causal digest。
10. Studio 只把已通过 codec 的 read/write/edit 归一化为 `{ref,snapshot}` 后升级；正常/失败/断流 bounded，不能产生未验证 projection。
11. DH-001–010.1 regression 全绿；build 既有 MuJoCo browser-external/chunk warning 不作为 blocker。
12. bounded fresh scan 只寻找会让 accepted input 产生错误 world/evidence、让 forged evidence 被接受、破坏四工具/authority 或造成 accepted path 不可用的 P0/P1；完成即停止，不扩展 DH-012 或平台设计。

## 输出

中文为主，结构化给出 reviewer identity、commands、frozen identity before/after、P0/P1/P2（文件行号+可执行反例）、Acceptance 1–12、未验证项、`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`。只有 P0=0/P1=0 才能 approved。
