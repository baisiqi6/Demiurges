# DH-016 Implementation Review Request — Round 24

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- plan SHA-256：`b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed`
- resolved decision：`docs/project-harness/tasks/DH-016/open-decision-cleanup-threat-model.md`
- decision SHA-256：`dd0d8777f1420250c047b7abe3c377c9d436b68e1c0e9bf1e34c544b6a62c002`
- product files：58
- ordered aggregate：`c6258ef25061ff886fbd9ed1aa4902637a1e49460b809f5f28f88fc6831c45e2`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan、resolved decision与上述命令得到的58个product files。禁止读取Round1–23 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算branch/HEAD/plan/decision/product aggregate/status，任一漂移即`blocked`。

## Human-frozen Option A

受支持边界是同一live lease下的cooperative single writer。cleanup开始后的直接filesystem mutation属于environment corruption：观察后停止剩余cleanup并保留尚未清理evidence，不回滚此前已完成并fsync的cleanup。当前项Project/lock/marker/attempt/candidate/receipt在destructive mutation前已经可观察的drift必须fail closed；transaction rollback/daemon不是DH-016范围。

## Round 24 mandatory closure

1. **Round 23 P1：** 每项cleanup前必须把当前Project的startup/current effective owner、lock owner与marker owner逐项比较。`wasTerminalAtStartup`只能允许startup时已经缺失的historical cleanup residue；不能放行startup时存在、在前一项cleanup后才丢失的evidence。
2. **Terminal-at-startup matrix：** 两个startup-existing terminal Project在第一项完成后，第二项分别发生marker missing/replaced inode、lock missing/replaced inode、Project directory missing/replaced identity、foreign entry；全部必须在第二项destructive cleanup前`OPERATION_RECOVERY_REQUIRED`。第一项保持完成；攻击者未直接删除的第二项evidence与durable receipts保留。
3. **Pending/attempt retained：** cooperative success、pending Project foreign drift、attempt foreign entry/new-inode/missing/extra attempt set与pre-cleanup global drift保持通过。
4. **Historical retry retained：** marker/lock/Project在startup前已经由合法先前cleanup删除时，same-binding terminal retry仍能收敛；不得因scoped compare误把前一项已完成cleanup当作当前项drift。
5. **Full product retained：** Artifact registry/CAS、directory fsync、bundle 1 MiB pre-copy gates、Phase A target matrix、manifest/lineage/ref/history、Undo/Redo、Studio dirty/export、stable errors、provider=0、四Agent tools与Kernel/Episode/Evaluation/AdoptPolicy不回归；test seam不从package root或产品API导出。

## Mandatory commands

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `114 pass / 0 fail / 593 expect()`；full `632 pass / 0 fail / 4330 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；只有P0/P1均0可`approved`。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
