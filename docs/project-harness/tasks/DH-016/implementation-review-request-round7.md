# DH-016 Implementation Review Request — Round 7

## Freshness 与 frozen identity

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- frozen HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- 56-file product aggregate：`355bb78256e4076a2371aa75d3947dde2d38449f0fb330b059124a2c89aa6079`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | xargs shasum -a 256 | shasum -a 256
```

fresh、独立、只读审查。第一仓库入口必须是本request；随后只读取`AGENTS.md`、canonical plan与上述56个product files。禁止读取Round 1–6 request/verdict、任何plan-review材料、另一reviewer输出、findings/progress/current review packet/future closeout。禁止修改、install、联网/provider、Git mutation。起终复算branch/HEAD/status/count/aggregate，漂移即blocked。

## Mandatory closure

1. 完整复核DH-016 Data Root、kernel lease、global operation journal、Project/Artifact/bundle atomicity与recovery、manifest/lineage/ref、Repository restore/history、Gateway/Studio strict DTO和无第五个Agent tool。
2. **Existing terminal durability：** startup不能从`readResult()`或path可见性直接取得cleanup authority。必须重新验证exact intent/result、在当前live root/lease下成功`fsync(receipts/)`，再由同一`OperationJournal`铸造durably-finalized capability。hard-link可见但receipts fsync失败时必须`OPERATION_RECOVERY_REQUIRED`，result/intent/attempt/lock/marker/candidate/Project全部保留；成功重试后才可cleanup。所有Project evidence cleanup必须强制消费该capability。
3. **OperationBinding唯一语义边界：** `operationKind / target / expectedIdentity / candidateIdentity`必须形成唯一合法组合；错误Save/Save As/Artifact/DH-013/bundle组合在intent/attempt/layout/CAS mutation前fail closed。
4. **Artifact admission/cleanup：** candidate exact绑定registry完整descriptor与target；cleanup重验bytes/format和原`dev/ino`。descriptor/target/foreign root/lease/journal/operation/capability drift不得发布、删除foreign evidence或产生CAS mutation。
5. **Startup recovery：** DH-013 set exact等于frozen registry，bundle set/hash自洽；descriptor/target/set/terminal durability任一模糊都保留evidence，无新terminal或cleanup。Project marker绑定operation digest与directory identity；unknown entry/marker/inode drift不得清理。
6. **Product control-plane：** canonical Save/Save As/Open/undo/redo routes、strict expected revision、bounded body abort/deadline、restart restore与bundle roundtrip保持；旧aliases 404，无authority半恢复。
7. 保持真实Marble × Hunyuan restart、损坏Artifact fail closed、三项registered asset加载与Chromium idle-rAF证据；不得调用provider。浏览器工具Worker containment与产品failure必须区分披露。

## Mandatory executable probes

- exact crash point：staged result file fsync → attempt directory fsync → result hard-link，停在receipts directory fsync前；注入本次startup receipts fsync failure，证明零cleanup；撤销故障后重试才cleanup。
- 可读result不得让普通`admit()` replay或裸binding/result调用取得cleanup capability。
- 五类合法OperationBinding与wrong kind/target/expected；Artifact descriptor/inode/foreign authority；ambiguous Project/marker/lock；never-ending Gateway body。

## Mandatory gates

```sh
bun test packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Build可核验producer evidence而不重跑；repo外probe必须bounded、cleanup且不得触碰既有5173/8787。

## Producer evidence（必须独立复核）

- focused：70 pass / 0 fail / 345 expect。
- full：593 pass / 0 fail / 4094 expect。
- typecheck、build、diff-check通过；validate 0 warnings；doctor 0 errors（optional misses允许）。
- 真实Chromium：Save As→Gateway restart→recent/Open；三项registered assets loaded、alignment PASS；canonical Save/undo/redo 200；无alert/page error；loaded 3DGS idle 1.2秒rAF delta=0。
- 未重新调用Marble/Hunyuan，未新增provider/deploy authority。

## Verdict

输出`decision`、`may_closeout`、P0/P1/P2、精确文件/行、可执行counterexample、executed commands与start/end frozen identity。只有P0=0且P1=0才approved；发现P1后完成必要gate与终点冻结即停止扩展。
