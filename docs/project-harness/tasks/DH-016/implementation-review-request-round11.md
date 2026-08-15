# DH-016 Implementation Review Request — Round 11

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`eaebb0e45c9856aa092438c72a1425e220c3367c1bc76294efa68ce02a5daf15`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本 request；随后只读 `AGENTS.md`、canonical plan 与上述命令得到的58个 product files。禁止读取 Round 1–10 request/verdict、plan-review、另一 reviewer、findings/progress/current review/closeout/future packet。全程只读，禁止修改、install、联网、provider 与 Git mutation。不要使用读取manifest外文件的broad glob/rg/find。起终复算 cwd/branch/HEAD/status/count/aggregate，任何漂移即 blocked。

## Round 11 mandatory closure

1. **Global two-phase recovery：** 在任何receipts fsync、candidate durability repair、terminalization、Project/Artifact/attempt cleanup前，必须对所有durable bindings与所有existing attempts完成全量只读preflight；operationId排序不得让较早clean binding在较晚invalid binding发现前发生任何cleanup。
2. **Complete staging coverage：** staging每个entry必须由唯一durable binding覆盖；attempt owner解析不得受operationId前缀/`-`影响。orphan、unknown、wrong-type、symlink、malformed token、无exact staged intent/result hard-link的attempt一律在全局mutation前fail closed并保留全部evidence。
3. **Attempt exactness：** staged intent/result分别exact hard-link durable receipt；`project.json` canonical且projectId/revision exact；`project-directory.json` canonical binding+live directory identity；registered Artifact candidate full descriptor/bytes/format；裸`artifact`、unknown/extra均拒绝。任何失败时所有Project lock/marker/directory/candidate/attempt/receipts保持。
4. **Data Root isolation/durability：** root/project intermediate directory、manifest、Artifact、receipt、staging无symlink/path traversal；nested layout fsync直接parent；Artifact/Project首次publish、EEXIST exact与startup exact-success在terminal前补business parent-directory fsync。
5. **Binding与evidence ownership：** 全部kind/target/expected/candidate、registry descriptor/set/hash及Project lock/marker owner先闭合；cross-Project/unknown evidence不得先铸terminal。historical terminal + pending Save、historical aborted Save As + marker-only/lock owner均由owner收束，non-owner跳过整组evidence。
6. **Product controls：** Project Open/List中间目录symlink fail closed；Undo/Redo strict bounded revision+Ref CAS，stale/never-ending/abort零mutation；Studio dirty/export truth正确；Gateway public code allowlist不泄露raw syscall/path/secret。
7. 保持Project manifest/lineage/ref、Repository restore/linear history、deterministic bundle、Artifact corruption fail-closed、provider count=0、四Agent tools不增加第五个tool；不改变Kernel/Episode/Evaluation/AdoptPolicy语义。

## Mandatory executable probes

- `op:a-terminal-project`可cleanup，`op:z-terminal-artifact`含corrupt candidate：整体recovery必须在`op:a`任何cleanup前失败。
- clean terminal Project + orphan staging entry；两个有前缀关系的合法operationId attempts；malformed token/wrong-type/symlink attempt。
- malformed/wrong revision/foreign project candidate、wrong marker、copied-not-linked receipts、corrupt Artifact、unknown extra；逐项断言全局零cleanup。
- Project intermediate symlink、direct-parent fsync faults、same/cross Project lock/marker ownership、visible-result receipts-fsync retry。
- stale Undo/Redo、never-ending history body、raw `ELOOP` mapping、dirty/export state。

## Gates

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused operation-journal/startup/artifact 34/0/185；full 604/0/4149；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；未调用provider、未触碰5173/8787。

输出结构化 `decision / may_closeout / P0/P1/P2 / executable counterexamples / commands / start-end identity`。仅P0=0且P1=0可approved；发现P1后只完成必要gate与终点冻结，不扩展P2机会扫描。
