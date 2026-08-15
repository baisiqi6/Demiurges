# DH-016 Implementation Review Request — Round 19

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`916f20adf57d52b24483eeb76f2c8da51413cb1070e79c4714c97b4e3ce8ffb8`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–18 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 19 mandatory closure

1. **Frozen startup authority：** startup-entry `initiallyTerminal`是唯一terminal-retry authority。本轮Phase B新result不得改变Phase C marker/candidate provenance。Phase A后marker/candidate/lock drift必须保留Project、attempt与全部evidence并fail closed。
2. **Live Phase A zero-write：** bundle import在任何single-flight/admit/Artifact publish前直接验证final target path existence/type/no-follow identity。ownerless empty/foreign/malformed/symlink/wrong-type target必须零receipt、零staging、零Artifact mutation拒绝；exact existing revision才可进入replay路径。
3. **Pending ownership/publication：** pending Save As/bundle final只能absent或由当前binding exact拥有；必须恰好一个marker-owning attempt。intent-only、staged missing、duplicate、wrong inode/binding、foreign owner均在任何result/cleanup前拒绝。
4. **Global recovery retained：** 所有bindings/attempts/Artifacts/Project destinations/owner entry sets/orphan staging先闭合；historical terminal与later corrupt evidence不能造成partial terminalization/cleanup。
5. **Product closure retained：** atomic candidate与directory fsync、fixed ZIP/exact Artifact set、manifest/lineage/ref/history、Undo/Redo CAS、Studio dirty/export、stable errors、provider count=0、四Agent tools和Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- receipts fsync seam在Phase B首次result publish时删除final marker：startup必须recovery-required，Project/attempt/evidence保留；startup-existing terminal同形态仍可retry cleanup。
- bundle Phase A：ownerless empty/foreign directory、markerless exact/malformed project、symlink/wrong-type；assert root tree与Artifact destinations byte/inode unchanged且无receipt/staging。
- exact existing bundle replay、empty target正常import、staged candidate interrupted、published candidate success。
- duplicate/wrong marker、historical/newer owner、later corrupt evidence、orphan staging、fsync faults保持闭合。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `106 pass / 0 fail / 500 expect()`；full `624 pass / 0 fail / 4237 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
