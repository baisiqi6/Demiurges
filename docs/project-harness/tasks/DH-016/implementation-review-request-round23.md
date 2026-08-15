# DH-016 Implementation Review Request — Round 23

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- plan SHA-256：`b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed`
- resolved decision：`docs/project-harness/tasks/DH-016/open-decision-cleanup-threat-model.md`
- decision SHA-256：`dd0d8777f1420250c047b7abe3c377c9d436b68e1c0e9bf1e34c544b6a62c002`
- product files：58
- ordered aggregate：`685aa0de6a2a066aa5b9c2c932b320727dec384daec7fc1f86869bc730ce09b6`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan、resolved decision与上述命令得到的58个product files。禁止读取Round1–22 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算branch/HEAD/plan/decision/product aggregate/status，任一漂移即`blocked`。

## Human-frozen threat model

Human已选择**Option A — Cooperative single-writer boundary**：守约Demiurges writer必须持同一live lease；直接filesystem mutation是environment corruption。系统观察到drift后停止剩余cleanup并保留尚未清理evidence，但不回滚此前已经完成并fsync的cleanup。transaction rollback/filesystem daemon不是DH-016范围。不得因“不回滚已完成cleanup”提出P1；但当前项任何destructive mutation前可观察到的Project/lock/marker/attempt/candidate/receipt drift若未先fail closed，仍是P1。

## Round 23 mandatory closure

1. **Round 22 P1根因：** cleanup loop每一项必须在`cleanupProjectEvidence`前重新从durable receipts取得current confirmation，比较frozen/current attempt path、token、binding set，并重验allowed attempt entry set、receipt hard-link/inode、Project marker/candidate与Artifact candidate。不能只在loop前检查一次。
2. **Post-first-cleanup attempt drift：** 第一项完整cleanup后，第二项original attempt分别新增foreign entry、把`operation-intent.json`替换为byte-identical新inode；两者都必须在第二项Project/lock/marker删除前稳定`OPERATION_RECOVERY_REQUIRED`。第一项保持完成，第二项全部evidence及两项durable receipts保留。
3. **Project drift与cooperative success：** 无越权mutation时两个pending Project全部收敛；第一项完成后第二项Project出现foreign entry时停止并保留第二项，不回滚第一项。
4. **Pre-cleanup/global retained：** Phase A/B/C global gates、pending publication、historical/newer owner、orphan staging、Artifact/Project marker与fsync crash matrix保持；cleanup前可观察drift零partial cleanup。
5. **Bundle retained：** `bundle.json`与`project/project.json`各1 MiB pre-copy gate；ownerless/foreign/malformed/symlink/wrong-type target Phase A零receipt/staging/Artifact mutation；fixed ZIP metadata与exact Artifact set不回归。
6. **Product/authority retained：** manifest/lineage/ref/history、Undo/Redo CAS、Studio dirty/export、stable public errors、provider=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy不回归。`STARTUP_RECOVERY_TEST_SEAMS`不得从package root或Gateway/Studio产品API导出。

## Mandatory probes/gates

- 独立执行post-first-cleanup attempt foreign-entry与byte-identical new-inode receipt probes，并检查第二项Project/lock/marker/original attempt确实存在。
- 独立执行attempt missing/new-extra-attempt set drift；两者必须在当前Project cleanup前fail closed。若测试工具制造的extra attempt不能通过durable receipt provenance，应仍得到稳定`OPERATION_RECOVERY_REQUIRED`。
- 独立复测cooperative multi-Project success、post-first-cleanup Project foreign drift、pre-cleanup global drift与两个2 MiB JSON gate。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `113 pass / 0 fail / 581 expect()`；full `631 pass / 0 fail / 4318 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；只有P0/P1均0可`approved`。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
