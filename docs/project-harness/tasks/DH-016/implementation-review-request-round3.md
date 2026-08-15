# DH-016 Implementation Review Request — Round 3

## Freshness 与 frozen identity

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- frozen HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- 55-file product aggregate：`b04c6bbceb5d902fc29e8daf594a67e4872f3c55f35410538b01865af4896ca2`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | xargs shasum -a 256 | shasum -a 256
```

fresh、独立、只读审查。第一入口为本request；随后读取`AGENTS.md`、canonical plan与上述55个product files。禁止读取Round 1/2 request/verdict、plan-review材料、另一reviewer、findings/progress/current review packet/future closeout。禁止修改、install、联网/provider、Git mutation。起终复算branch/HEAD/status/count/aggregate，漂移即blocked。

## Mandatory closure

1. 完整复核DH-016 Data Root、lease、durable global operation、Project/Artifact/bundle atomicity、startup recovery、manifest/lineage/ref、Repository restore/history、Gateway/Studio strict DTO与无第五个Agent tool。
2. Artifact raw CAS不得位于package root；只有真实journal-issued、same root/lease/journal、尚未terminalized的operation可调用。`artifact.publish`、`artifact.import-dh013`、`bundle.import`分别验证合法target。
3. admitted Artifact descriptor必须对registry-derived `assetId/digest/byteLength/format/elementCount/sourceBounds`做canonical full equality。逐字段漂移、wrong target、foreign root/lease/journal、Project operation、terminalized capability必须在新增candidate/CAS mutation前fail closed。
4. DH-013 import、Project save与bundle import只有在read-back证明durable success/aborted result存在后才能清理exact candidate/attempt/lock；foreign/malformed result、result link/fsync ambiguity或identity drift必须保留intent、staging与candidate evidence并返回recovery-required。
5. 重放Save As mkdir+lock后abort/unknown-entry、startup malformed Project exact lock、Gateway Open/Save/import never-ending stream abort/deadline/stream-error反例；断言无半世界、无authority drift、稳定public code。
6. 保持真实Marble × Hunyuan restart、损坏fail-closed、空root bundle roundtrip与Chromium产品证据，不调用provider。

## Mandatory gates

```sh
bun test packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Build可只读核验producer evidence，不要求重跑；repo外probe必须bounded、cleanup且不得触碰既有5173/8787。

## Producer evidence（必须独立复核）

- focused：42 pass / 0 fail / 253 expect。
- full：586 pass / 0 fail / 4052 expect。
- typecheck、build、diff-check通过；validate 0 warnings；doctor 0 errors（optional misses允许）。
- 未重新调用Marble/Hunyuan，未新增provider或deployment authority。

## Verdict

输出`decision`、`may_closeout`、P0/P1/P2、精确文件/行、可执行counterexample、executed commands与start/end frozen identity。只有P0=0且P1=0才approved；发现P1后完成必要gate与终点冻结即停止扩展。
