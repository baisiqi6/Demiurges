# DH-016 Implementation Review Request — Round 20

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`480036b44f0e5b2e5e064d535579bf74a86333ff8a2618861b472981fb6b7bd8`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–19 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 20 mandatory closure

1. **Live bundle target closure：** Phase A必须以stable no-follow directory identity闭合existing final target，entry set恰好`project.json`且前后不漂移；ownerless empty/foreign entry/lock/marker residue/malformed/symlink/wrong type均零new receipt/staging/Artifact mutation拒绝。exact canonical revision才允许进入replay。
2. **Startup evidence immutability：** startup-entry terminal、marker owner与lock owner均冻结。本轮Phase B后marker/lock/candidate/entry drift不得借用cleanup例外；Phase C必须保留Project、attempt与全部evidence并recovery-required。
3. **Pending creation：** final只能absent或由当前binding exact拥有，且恰好一个marker-owning attempt。intent-only、staged missing/duplicate、wrong inode/binding、foreign owner均在任何result/cleanup前拒绝。
4. **Global retained closure：** 全部bindings/attempts/Artifacts/destinations/owner entry sets/orphan staging在Phase A闭合；historical terminal与later corrupt evidence不产生partial mutation。
5. **Product retained：** atomic candidate/fsync、fixed ZIP/exact Artifact set、manifest/lineage/ref/history、Undo/Redo CAS、Studio dirty/export、stable errors、provider=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- bundle Phase A：ownerless empty/foreign；exact project + foreign/marker/lock；malformed/symlink/wrong-type；assert完整tree/inode/Artifact unchanged且无new receipt/staging。
- exact existing replay、empty target import保持成功；Phase A前后entry/identity drift fail closed。
- Phase B receipt fsync seam分别删除startup exact marker、lock，或加入foreign entry：recovery-required并保留Project/attempt/evidence；startup-existing terminal cleanup retry仍收敛。
- pending evidence、historical/newer owner、later corrupt attempt/Artifact、orphan staging、fsync fault矩阵保持。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `108 pass / 0 fail / 510 expect()`；full `626 pass / 0 fail / 4247 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
