# DH-016 Implementation Review Request — Round 8

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：56
- ordered aggregate：`c2da0a1de0362b5608edaeef39a3efaf47ac5fbbce4dc35ea4f70ecae7990882`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | xargs shasum -a 256 | shasum -a 256
```

第一且唯一仓库入口必须是本request；然后只读`AGENTS.md`、canonical plan与上述56个product files。禁止读取Round 1–7 request/verdict、plan-review、另一reviewer、findings/progress/current packet/future closeout。全程只读，禁止修改/install/联网/provider/Git mutation。起终复算branch/HEAD/status/count/aggregate，漂移即blocked。

## Mandatory closure

1. 完整复核Data Root/lease、global operation journal、Project/Artifact/bundle atomicity与startup recovery、manifest/lineage/ref、Repository restore/history、Gateway/Studio strict DTO和无第五个Agent tool。
2. **Cross-operation Project evidence ownership：** startup在任何mutation前完整验证全部durable bindings。历史terminal、较早pending或non-owner operation遇到同一Project另一exact durable intent拥有的lock时，必须保留并跳过整组lock/marker/directory evidence，交给owner；不得因receipt排序阻断或抢删。无法归属、跨Project或malformed lock仍fail closed。必须覆盖历史success + pending Save，以及历史aborted Save As + pending Save As marker/directory。
3. **Existing terminal durability：** readable result必须重新验证intent/result并在当前live lease成功fsync receipts后，才由同一Journal铸造cleanup capability。失败保留result/intent/attempt/lock/marker/candidate/Project；成功重试后才cleanup。所有Project cleanup强制消费capability。
4. **OperationBinding / Artifact closure：** kind-target-expected-candidate唯一组合；Artifact完整descriptor/target/bytes/format/dev/ino与root/lease/journal/capability exact。漂移在mutation前拒绝且不删foreign evidence。
5. **Recovery/product closure：** DH-013 registry set、bundle set/hash、Project marker/directory identity、strict routes、body abort/deadline、restart restore、bundle roundtrip、损坏Artifact fail-closed保持。不得调用provider。

## Mandatory executable probes

- historical terminal operation id排序在pending owner之前；existing Project Save与new Project Save As marker两类均由owner最终收束。
- lock hard-link到同Project另一binding可归属并保留；跨Project/未知inode仍recovery-required且保留。
- exact visible-result-before-receipts-fsync failure/retry；五类OperationBinding；Artifact descriptor/inode/foreign authority；never-ending Gateway body。

## Gates

```sh
bun test packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused 72/0/351；full 595/0/4100；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（optional misses允许）。既有真实Chromium已证明Save As→restart→Open、三项assets loaded、alignment PASS、canonical Save/undo/redo、无page error、idle rAF delta=0；无需重跑且不得调用provider。

输出结构化`decision / may_closeout / P0/P1/P2 / executable counterexamples / commands / start-end identity`。仅P0=0且P1=0可approved；P1后只完成必要gate和终点冻结。
