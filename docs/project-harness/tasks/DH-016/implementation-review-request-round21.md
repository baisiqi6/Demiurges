# DH-016 Implementation Review Request — Round 21

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`a43333f6fb205f601812e5777e3d59ee7e9a44e8f963e5f5dc41696b837ebc63`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–20 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 21 mandatory closure

1. **Global Phase C evidence gate：** terminal confirmations后、任何cleanup前，全部Project effective owner/lock owner/marker owner必须与startup frozen inspection exact相等，owned directory entry set再次完整验证。任一Project漂移不得让同一或更早operation产生partial cleanup。
2. **Near-cleanup validation：** 每个Project在lock/marker/directory unlink前仍须重新验证owning evidence与entry set；unknown/foreign entry、missing/replaced lock/marker统一稳定`OPERATION_RECOVERY_REQUIRED`并保留全部evidence。
3. **Live bundle Phase A retained：** existing target stable no-follow identity与唯一`project.json` entry前后exact；ownerless/foreign/malformed/symlink/wrong type零receipt/staging/Artifact mutation。
4. **Pending/global retained：** pending publication唯一、startup terminal例外冻结、historical/newer owner、later corrupt attempt/Artifact、orphan staging与fsync faults保持闭合。
5. **Product retained：** atomic candidate/fsync、fixed ZIP/exact Artifact set、manifest/lineage/ref/history、Undo/Redo CAS、Studio dirty/export、stable errors、provider=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- 两个以上pending Project：Phase B后在最后一个Project分别加入foreign entry、删除/替换lock、删除/替换marker；断言所有Project/locks/markers/original attempts保留，无partial cleanup。
- 单Project同形态返回稳定`OPERATION_RECOVERY_REQUIRED`；startup-existing terminal cleanup retry仍收敛。
- Phase C confirmations期间注入drift同样被cleanup前全局gate捕获。
- bundle Phase A target matrix、pending evidence、historical/newer owner、later corrupt evidence、orphan staging、fsync fault保持。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `109 pass / 0 fail / 521 expect()`；full `627 pass / 0 fail / 4258 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
