# DH-016 Implementation Review Request — Round 18

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`50c28ed035072a5f85c915fb41e9cd0ea0934ee931f58ed675a7ba5464355d68`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–17 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 18 mandatory closure

1. **Pending destination ownership：** pending `project.save-as`/`bundle.import`的final path只能absent或由当前binding的canonical marker/lock exact拥有。ownerless empty/foreign-entry目录、wrong-binding owner、markerless exact `project.json`、symlink/wrong type必须在任何repair/beginRecovery/result/cleanup前fail closed并保留全量evidence。
2. **Publication evidence：** pending creation必须恰好一个marker-owning attempt；只有intent、staged marker missing、duplicate attempts、candidate/final marker missing或identity drift均零partial mutation拒绝。完整未发布candidate才可收敛`OPERATION_INTERRUPTED`。
3. **Terminal retry distinction：** 只有startup前已有same-binding terminal result才可使用marker/Project已被既有cleanup删除的retry例外；pending不得借用。cleanup前重新证明唯一owner，同Project历史terminal不得抢占较新owner。
4. **Global Phase A：** 全部bindings、attempts、Artifact descriptors、Project destinations、owner/entry sets及orphan staging先闭合；later corrupt/foreign evidence不得在earlier operation已terminalize或cleanup后暴露。
5. **Retained product closure：** atomic candidate + parent fsync、fixed ZIP metadata/exact Artifact set、manifest/lineage/ref/history、Undo/Redo CAS、Studio dirty/export、stable errors、provider count=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- Save As与bundle：完整staged candidate + ownerless empty final；ownerless foreign-entry final；wrong-binding marker/lock final。均result absent、Project/attempt/evidence byte-identical。
- intent-only、final存在但staged marker缺失、final marker missing/new inode/symlink、duplicate marker attempts全部Phase A fail closed。
- exact未发布candidate收敛interrupted；pending exact published candidate收敛success；existing terminal completed cleanup retry收敛。
- historical terminal + newer owner、later corrupt attempt/Artifact、orphan staging、directory fsync faults保持闭合。
- ZIP、bundle、layout symlink、stale history、dirty/export、public error gates保持。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `104 pass / 0 fail / 492 expect()`；full `622 pass / 0 fail / 4229 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
