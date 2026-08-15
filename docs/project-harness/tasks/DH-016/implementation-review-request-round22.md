# DH-016 Implementation Review Request — Round 22

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- plan SHA-256：`b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed`
- resolved decision：`docs/project-harness/tasks/DH-016/open-decision-cleanup-threat-model.md`
- decision SHA-256：`dd0d8777f1420250c047b7abe3c377c9d436b68e1c0e9bf1e34c544b6a62c002`
- product files：58
- ordered aggregate：`14062c117ff06465c141f11529115a32f99b566c109c7bf29f20484fb3986100`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan、resolved decision与上述命令得到的58个product files。禁止读取Round1–21 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算branch/HEAD/plan/decision/product aggregate/status，任一漂移即`blocked`。

## Human-frozen threat model

Human已明确选择**Option A — Cooperative single-writer boundary**，这是本轮必须服从的产品方向，不是reviewer待选方案：

- 所有受支持Demiurges writer必须持有同一live package-owned `DataRootWriterLease`；产品内并发与crash recovery仍服从strict journal、single-flight与exact evidence contract。
- 绕过package-owned入口直接修改Data Root的本机进程属于environment corruption，不是第二个受支持writer；Data Root不承诺成为针对同UID任意进程的安全沙箱。
- cleanup前与每个destructive operation前，当前可观察evidence必须exact；发现out-of-band drift后必须立即停止剩余cleanup、稳定`OPERATION_RECOVERY_REQUIRED`并保留durable receipts及所有尚未清理的evidence。
- 在该越权drift被观察前已经完成并fsync的cleanup不回滚。不得以“无法恢复此前已删除路径”为P1，因为transaction-grade rollback/filesystem daemon明确不属于DH-016。
- 若实现未检测当前/后续evidence drift、继续删除尚未处理对象、删除durable receipts，或守约single-writer路径无法收敛，仍是P1。

## Round 22 mandatory closure

1. **Cooperative success：** 至少两个pending Project在没有越权mutation时全部terminalize并完成exact Project/attempt cleanup；durable intent/result保留。
2. **Post-cleanup corruption：** 第一个Project已完成并fsync cleanup后，确定性注入第二个Project foreign entry；recovery必须在第二项destructive cleanup前返回`OPERATION_RECOVERY_REQUIRED`。第一项保持已完成；第二项Project/lock/marker/original attempt与两项durable intent/result保留。
3. **Pre-cleanup strictness retained：** Phase A/Phase B/Phase C全局gate与每项near-cleanup validator仍拒绝可观察的foreign entry、missing/replaced lock/marker、owner/inode drift；在cleanup尚未开始时不得产生partial cleanup。
4. **Round 21 clear fixes retained：** `bundle.json`与`project/project.json`各自1 MiB header gate必须位于entry copy/CRC/JSON parse前；live bundle Phase A的ownerless/foreign/malformed/symlink/wrong-type target保持零receipt/staging/Artifact mutation。
5. **Durability与authority retained：** startup terminal/pending publication、Artifact registry/CAS、candidate marker hard-link、directory fsync、Project manifest/lineage/ref/history、Undo/Redo CAS、Studio dirty/export、stable errors、provider=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy边界不回归。
6. **Test seam containment：** `STARTUP_RECOVERY_TEST_SEAMS`只能是module-local test seam，不得从`@demiurges/world-project` package root或Gateway/Studio产品API导出，不得改变正常执行语义。

## Mandatory probes/gates

- 独立执行cooperative multi-Project success与post-first-cleanup drift反例；确认异常是稳定`OPERATION_RECOVERY_REQUIRED`，不是普通filesystem error。
- 独立复测cleanup前全局drift零partial cleanup，以及bundle两个2 MiB JSON entry都在copy/parse前以`BUNDLE_BUDGET_EXCEEDED`拒绝。
- 检查58个product files内不存在transaction rollback、snapshot daemon、第二writer或第五Agent tool扩展。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `112 pass / 0 fail / 555 expect()`；full `630 pass / 0 fail / 4292 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；只有P0/P1均0可`approved`。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
