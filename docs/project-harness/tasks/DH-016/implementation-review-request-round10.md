# DH-016 Implementation Review Request — Round 10

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`93d58f533258ab9a6c1325d99a33409959b23fefec3526d8ddae88e82c08db6a`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本 request；随后只读 `AGENTS.md`、canonical plan 与上述命令得到的58个 product files。禁止读取 Round 1–9 request/verdict、plan-review、另一 reviewer、findings/progress/current review/closeout/future packet。全程只读，禁止修改、install、联网、provider 与 Git mutation。起终复算 cwd/branch/HEAD/status/count/aggregate，任何漂移即 blocked。

## Round 10 mandatory closure

1. **Attempt全量preflight：** `confirmExistingTerminal`只接受由staged intent/result与durable receipt exact hard-link证明的attempt；attempt中存在的两个receipt文件必须分别exact。`project.json`必须canonical解码且projectId/revision exact绑定operation target/candidate；`project-directory.json`必须canonical绑定OperationBinding，并在target directory存在时exact绑定stable directory identity；registered Artifact candidate必须完整descriptor/bytes/format；裸`artifact`、unknown/extra/wrong-type/symlink/sparse/malformed entry全部fail closed。
2. **Preflight-before-cleanup：** 所有confirmed attempts必须先整体只读验证Project/generic/Artifact entries，任何一项失败时Project lock、marker、directory、candidate、attempt、intent/result均保持；不得因Project与Artifact validator顺序产生partial cleanup。
3. **Data Root no-follow 与durability：** root/project intermediate directory、manifest、Artifact、receipt、staging不可symlink/path traversal逃逸；nested layout fsync直接parent；Artifact/Project首次publish、EEXIST exact、startup exact-success在terminal前修复business candidate parent-directory durability。
4. **全量startup binding/evidence ownership：** 所有durable bindings在任何mutation前闭合kind/target/expected/candidate、registry descriptor/set/hash及Project lock/marker owner；较晚invalid binding不能导致较早cleanup；cross-Project/unknown evidence不能先铸terminal。
5. **同Project排序：** historical terminal + pending Save、historical aborted Save As + marker-only/lock owner均由owner最终收束，non-owner跳过整组evidence。
6. **Project Open/List isolation：** intermediate directory symlink、manifest symlink/wrong type/malformed/identity drift均不Open、不进入recent list、不读取Data Root外bytes。
7. **History与Studio truth：** Undo/Redo strict bounded expected Project revision + Ref CAS；stale/never-ending/abort零mutation。Project name或authoritative Ref变化标dirty并禁export，save/open/import/create清dirty，run-only不误标。
8. **Stable public errors：** Gateway只返回冻结public code；raw syscall、本机路径、signed URL、secret marker/message不泄露。
9. 保持Project manifest/lineage/ref、Repository restore/linear history、deterministic bundle、Artifact corruption fail-closed、provider count=0、四Agent tools不增加第五个tool；不得改变Kernel/Episode/Evaluation/AdoptPolicy语义。

## Mandatory executable probes

- terminal Save As attempt中的malformed、wrong-revision、foreign-project `project.json`；corrupt Artifact candidate；malformed/wrong-binding `project-directory.json`；copied-but-not-hardlinked intent/result；裸`artifact`与unknown extra。每项均断言Project/evidence零cleanup。
- Project intermediate symlink；nested direct-parent fsync；Artifact EEXIST/recovery与Project exact-recovery durability fault。
- earlier terminal Project + later invalid Artifact；same/cross Project lock/marker ownership；visible result receipts-fsync failure/retry。
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

Producer evidence：focused operation-journal/startup/artifact 32/0/174；full 602/0/4138；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。Round 8 fresh真实Chromium在专用5186/8796与临时Data Root证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；未调用provider，既有5173/8787未触碰，专用进程已停止，临时root已移入Trash。

输出结构化 `decision / may_closeout / P0/P1/P2 / executable counterexamples / commands / start-end identity`。仅P0=0且P1=0可approved；发现P1后只完成必要gate与终点冻结，不扩展P2机会扫描。
