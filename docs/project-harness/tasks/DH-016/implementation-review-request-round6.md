# DH-016 Implementation Review Request — Round 6

## Freshness 与 frozen identity

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- frozen HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- 56-file product aggregate：`e619ab7d190e2a1b427b1a4450ae94916d95c4a07635751e15f1fc64d86fe5a1`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | xargs shasum -a 256 | shasum -a 256
```

fresh、独立、只读审查。第一仓库入口必须是本request；随后只读取`AGENTS.md`、canonical plan与上述56个product files。禁止读取Round 1–5 request/verdict、任何plan-review材料、另一reviewer输出、findings/progress/current review packet/future closeout。禁止修改、install、联网/provider、Git mutation。起终复算branch/HEAD/status/count/aggregate，漂移即blocked。

## Mandatory closure

1. 完整复核DH-016 Data Root、kernel lease、durable global operation、Project/Artifact/bundle atomicity、startup recovery、manifest/lineage/ref、Repository restore/history、Gateway/Studio strict DTO与无第五个Agent tool。
2. **OperationBinding唯一语义边界：** package-owned codec必须将`operationKind / target kind+id / expectedIdentity / candidateIdentity`闭合为唯一合法组合：Save=`project + non-null exact revision`；Save As=`project + null`；Artifact publish=`artifact target exact candidate assetId + null`；DH-013 import=`registry:marble-hunyuan-v1 + null`；bundle import=`project + null`。错误组合必须在intent/attempt/layout/CAS mutation前fail closed。必须执行合法五类binding及wrong kind/target/expected的zero-mutation反例。
3. **Durable terminal authority：** live cleanup只能由同一`OperationJournal`铸造且在当前进程完成result file fsync、attempt directory fsync、no-replace publish与receipts directory fsync的operation object触发。仅“result path可读”不得删除lock/staging/candidate。visible-result retry与EEXIST winner也必须在本次调用重新成功fsync receipts directory后才能取得cleanup authority；失败继续保留evidence并recovery-required。
4. **Artifact admission/cleanup identity：** durable candidate必须与registry-derived完整`assetId/digest/byteLength/format/elementCount/sourceBounds`exact；target exact绑定assetId。candidate cleanup重新验证完整bytes/format与原`dev/ino`。descriptor、target、foreign root/lease/journal、Project operation或terminalized capability不得产生candidate/CAS mutation或删除foreign evidence。
5. **Startup recovery：** 每个durable Artifact candidate在任何新result前与frozen registry完整descriptor及operation target重新绑定；DH-013 set必须exact等于完整registry，bundle set/hash仍自洽。descriptor/target/set drift与result directory-fsync ambiguity必须保留intent/attempt/lock/candidate，无新terminal或cleanup。
6. **Project directory ownership：** canonical marker绑定operation digest与directory `dev/ino/mode/uid/gid`。live/startup只有durable terminal、exact lock/marker与允许entry集合成立时才能删除marker/aborted空目录；unknown entry、marker/inode drift或ambiguous result保留现场。Save As/bundle不得接管预存空目录。
7. **Strict product routes：** 唯一写入面为`POST /api/sessions/:sessionId/project/save-as`与`/project/save`，history为`/project/undo|redo`，Open为`POST /api/projects/:projectId/open`且empty body。旧Open/history aliases必须404；body abort/deadline零authority mutation。
8. 保持真实Marble × Hunyuan restart、损坏Artifact fail-closed、空root bundle roundtrip、三项registered asset加载与Chromium idle-rAF证据；不得调用provider。浏览器工具Worker containment必须与产品failure区分并披露。

## Mandatory gates

```sh
bun test packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Build可只读核验producer evidence，不要求重跑；repo外probe必须bounded、cleanup且不得触碰既有5173/8787。

## Producer evidence（必须独立复核）

- focused：69 pass / 0 fail / 338 expect。
- full：592 pass / 0 fail / 4087 expect。
- typecheck、build、diff-check通过；validate 0 warnings；doctor 0 errors（optional misses允许）。
- 真实Chromium：Save As→Gateway restart→recent/Open；三项registered assets loaded、alignment PASS；canonical Save/undo/redo实际200；无alert/page error；loaded 3DGS idle 1.2秒rAF delta=0。
- 未重新调用Marble/Hunyuan，未新增provider/deploy authority。

## Verdict

输出`decision`、`may_closeout`、P0/P1/P2、精确文件/行、可执行counterexample、executed commands与start/end frozen identity。只有P0=0且P1=0才approved；发现P1后完成必要gate与终点冻结即停止扩展。
