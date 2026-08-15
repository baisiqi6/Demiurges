# DH-016 Implementation Review Request — Round 16

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`9068c7fde597eeefaac8af6d888f7eb7e5d12dd3677f1e60d54054270b2b371a`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–15 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 16 mandatory closure

1. **Marker evidence identity：** pending Save As/bundle final directory存在时，Phase A必须验证final marker存在、staged/final均为regular file、`dev/ino` exact hard-link、canonical bytes绑定final directory inode与OperationBinding。missing、byte-identical replacement、symlink、wrong inode/binding必须在任何result publish/cleanup前fail closed并保留全量evidence。
2. **Cleanup retry distinction：** 只有startup前已存在same-binding terminal result时，才允许final marker已被既有cleanup删除；staged marker仍须canonical绑定当前或已删除directory identity。pending operation的candidate/final/marker双缺失不得terminalize。cleanup前必须重新证明唯一marker-owning attempt；同Project历史terminal不得抢占较新owner。
3. **Global zero-partial-cleanup：** owner final Project只允许marker、exact lock、project.json。unknown entry、malformed Project、foreign lock/marker、later corrupt attempt/Artifact必须在Phase A阻断；不得先terminalize或清理earlier binding。
4. **Atomic candidate + durability retained：** staging candidate完整构造、hard-link marker、atomic rename、source/destination parent fsync、rmdir parent-fsync retry、prefix/orphan coverage继续闭合。
5. **Bundle/Project/product retained：** fixed ZIP timestamp及全部metadata、exact Artifact set/budgets、manifest/lineage/ref/restore/history、Undo/Redo CAS、Studio dirty/export、stable errors、provider count=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- Save As final marker missing；bundle final marker替换为byte-identical新inode；两者均断言result absent、Project/attempt/evidence不变。
- terminal已存在且marker cleanup已完成、Project directory仍在或已rmdir的两种retry必须收束；pending同形态必须fail closed。
- same Project historical terminal + newer marker/lock owner；final unknown entry；candidate missing marker/extra/symlink；later malformed/corrupt；receipts与attempt/projects/staging fsync faults。
- ZIP timestamps/missing Artifact；layout symlink；stale history/dirty/public errors。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused remediation 37/0/159；full 617/0/4208；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
