# DH-016 Implementation Review Request — Round 12

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`315d2ea43a31cbced3ad3f8df8fe7b0fb1b699a0ba49d1205aa6c1f7ac0eb3d2`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与命令得到的58个product files。禁止读取Round1–11 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。全程只读，禁止修改/install/联网/provider/Git mutation。起终复算cwd/branch/HEAD/status/count/aggregate，漂移即blocked。

## Mandatory closure

1. **Three-phase startup recovery：** Phase A在任何fsync repair、beginRecovery、terminalization或cleanup前，全局只读验证全部bindings、existing attempts、complete staging coverage、Project evidence owners，并分类全部pending Artifact/Project/bundle destinations与唯一action。Phase B在零cleanup下为全部operation形成durable terminal。Phase C重新覆盖新attempt，全体confirm/validate成功后才cleanup。
2. `op:a` clean terminal + `op:z` pending malformed Project/Artifact/corrupt destination必须在`op:a` cleanup与`op:z` beginRecovery前失败；staging不得新增attempt。terminalization/confirm后任一later failure也不得先cleanup earlier evidence。
3. bundle Project exact但required Artifact absent不得success；Project absent时partial exact Artifact只作为safe orphan收束aborted。Artifact/Project success前补business parent-directory fsync。
4. staging每项必须被唯一binding覆盖；operationId前缀、orphan、malformed token、wrong-type/symlink、copied-not-linked receipt、malformed Project/marker、corrupt Artifact、unknown/裸`artifact`全部全局fail closed且零cleanup。
5. Data Root/project intermediate no-follow、manifest/Artifact/receipt strict identity；same/cross Project lock-marker owner与history ordering；existing terminal receipts fsync retry与attempt cleanup闭合。
6. Open/List symlink isolation、Undo/Redo bounded revision+Ref CAS、Studio dirty/export truth、Gateway stable public errors保持。
7. manifest/lineage/ref、Repository restore/history、deterministic bundle、provider count=0、四Agent tools与Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- 必跑较早terminal + 较晚pending malformed Project（断言无cleanup且无new attempt）、较早terminal + 较晚terminal corrupt Artifact、bundle exact Project + missing Artifact、orphan/prefix attempts、receipts fsync failure/retry、symlink/stale/dirty/public-error probes。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused startup 15/0/62；full 605/0/4154；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / executable counterexamples / commands / start-end identity`。仅P0=0且P1=0可approved；P1后停止扩展。
