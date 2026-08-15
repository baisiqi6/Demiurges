# DH-016 Implementation Review Request — Round 15

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`df494060274d07f57e37bdac2188f771832e5cd992f8737f2eded8a0700c994c`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–14 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 15 mandatory closure

1. **Atomic Project directory publication：** Save As与bundle import不得在final namespace执行`mkdir → marker`。必须在operation attempt内构造0700 candidate，staged/published marker为exact hard-link并绑定binding digest + candidate inode，candidate仅含marker；candidate与attempt完成fsync后才可atomic rename到final Project path。rename后必须验证same inode/marker，并fsync source attempt与destination `projects/`。
2. **All crash states converge：** publish前中断只能留下完整staged candidate且final path absent；rename后任一parent fsync失败，只能由final exact marker恢复。startup Phase A完整验证candidate/marker/attempt coverage，Phase B补fsync attempt/projects/staging，Phase C在durable terminal后才删除candidate/marker/attempt。candidate缺marker、marker非hard-link、extra entry、symlink/wrong inode/binding必须保留并fail closed。
3. **Deterministic bundle subset：** decoder必须exact校验local与central ZIP header的time=`0`、date=`0x21`；local-only、central-only、两者同步漂移均拒绝。既有flags/method/mode/order/gap/trailing/CRC/index/exact Artifact set/budgets继续闭合。
4. **Parent removal durability：** Project/attempt/candidate rmdir后parent fsync失败，restart不得把path absence当proof；必须先补fsync对应attempt/projects/staging parent，再terminal/cleanup。
5. **No regression：** 三阶段global recovery、prefix/orphan coverage、layout-chain no-follow、registered Artifact full descriptor、manifest/lineage/ref/restore/history、Undo/Redo CAS、Studio dirty/export、stable public errors、provider count=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory executable probes/gates

- Save As与bundle import各自注入candidate完整构造后、atomic publish前中断；关闭root/lease模拟restart，确认final path始终不存在、candidate exact；startup收束后以新operation同ID成功。
- 注入rename成功后的attempt/projects fsync失败；restart只能采纳exact final marker并收束。candidate marker缺失、额外entry、staged/published marker非同inode必须零partial cleanup。
- ZIP local-only、central-only与同步timestamp漂移；canonical composite Project缺Artifact ZIP entry。
- Project/attempt rmdir parent-fsync retry、`op:a`/`op:a-b`、earlier terminal + later malformed/corrupt、receipts retry、symlink layers、stale history/dirty/public error。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused remediation 48/0/237；full 614/0/4196；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
