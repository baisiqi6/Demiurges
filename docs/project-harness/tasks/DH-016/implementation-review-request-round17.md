# DH-016 Implementation Review Request — Round 17

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`6b9ac3c7f2ac034504585432d27c0d78fd1810be5b695308a50ed77ef7fca2b9`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–16 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 17 mandatory closure

1. **Pending publication evidence：** 尚无terminal result的`project.save-as`/`bundle.import`必须在Phase A证明恰好一个marker-owning attempt。只有intent、candidate/final/marker全缺失，或final存在但staged marker缺失，必须在任何fsync repair、beginRecovery、result publish或cleanup前fail closed并保留全量evidence。
2. **Marker identity：** staged candidate存在时验证candidate目录、marker、binding与entry set；final存在时验证staged/final marker均为regular file、canonical bytes绑定final directory identity且`dev/ino` exact hard-link。missing、replacement、symlink、wrong inode/binding、duplicate marker attempts均零partial mutation拒绝。
3. **Terminal retry distinction：** 只有startup前已经存在same-binding terminal result，才允许既有cleanup已删除final marker或Project directory；cleanup前仍须证明可用evidence的唯一owner。pending不得借用terminal retry例外，同Project历史terminal不得抢占较新owner。
4. **Global recovery retained：** 所有bindings/attempts/Artifact descriptors/Project destinations/evidence owners在Phase A全量闭合；unknown entry、foreign lock、later corrupt evidence、orphan staging均不得在较早operation已terminalize或cleanup后才暴露。
5. **Product closure retained：** atomic candidate publication与parent fsync、fixed ZIP metadata、exact bundle Artifact set、manifest/lineage/ref/restore/history、Undo/Redo CAS、Studio dirty/export、stable public errors、provider count=0、四Agent tools及Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- Save As与bundle import在admit后、marker创建前crash：result absent、intent/attempt保留、Project absent。
- final Project/marker已发布后删除staged marker：result absent，final Project/marker与attempt保留。
- staged candidate未发布但完整：可收敛`OPERATION_INTERRUPTED`；existing terminal + completed marker/directory cleanup：可重试收敛。
- final marker missing/new inode/symlink/wrong binding、duplicate marker attempts、same Project历史terminal + newer owner、foreign entry/corrupt later attempt均在Phase A fail closed。
- receipts/attempt/projects/staging fsync faults、ZIP timestamp/missing Artifact、layout symlink、stale history/dirty/public errors保持闭合。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused `102 pass / 0 fail / 484 expect()`；full `620 pass / 0 fail / 4221 expect()`；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
