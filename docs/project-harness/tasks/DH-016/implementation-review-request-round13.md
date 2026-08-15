# DH-016 Implementation Review Request — Round 13

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`b9a39e2252ae5e94ec72e6ad928fe4268af2fdb95b4e93f3e6ceb50e5acc976e`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与58个product files。禁止读取Round1–12 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Mandatory closure

1. **Layout chain no-follow：** Open/List同时验证`projects`与`projects/<id>`目录前后stable identity；Artifact read/inspect同时验证`artifacts`与`artifacts/sha256`。整层或child symlink、wrong type、identity drift均不可采纳Data Root外bytes或进入recent list；public error稳定。
2. **Three-phase recovery：** Phase A全局只读验证bindings/attempts/staging/evidence owners并分类全部pending destinations；Phase B零cleanup形成全部terminal；Phase C重新全局覆盖新attempt、全体confirm后才cleanup。较早terminal + 较晚pending malformed destination/terminal corrupt candidate均零partial cleanup与零额外attempt。
3. bundle Project exact + missing required Artifact不得success；parent-directory fsync、receipts retry、attempt exact cleanup闭合。
4. staging complete coverage、operationId prefix、orphan/malformed/symlink/wrong receipt/Project/marker/Artifact/unknown entry全局fail closed。
5. same/cross Project evidence owner、manifest/lineage/ref、Repository restore/history、Open/List、Undo/Redo CAS、Studio dirty/export、stable Gateway errors、deterministic bundle、provider count=0、四tools与Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory probes/gates

- 整个`projects` symlink到外部canonical Project；`projects/<id>` symlink；整个`artifacts`或`artifacts/sha256` symlink到外部exact registered bytes。
- earlier terminal + later pending malformed Project；earlier terminal + later corrupt Artifact；bundle exact Project + missing Artifact；orphan/prefix attempts；receipts fsync failure/retry；stale history/dirty/public errors。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused project/artifact/startup 36/0/184；full 607/0/4159；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。
