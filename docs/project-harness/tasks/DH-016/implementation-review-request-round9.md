# DH-016 Implementation Review Request — Round 9

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`7e58c02b4c2efd52e19dfcd5210489f46d1cdc7901033ad5e0befb240ba52d74`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本 request；随后只读 `AGENTS.md`、canonical plan 与上述命令得到的58个 product files。禁止读取 Round 1–8 request/verdict、plan-review、另一 reviewer、findings/progress/current review/closeout/future packet。全程只读，禁止修改、install、联网、provider 与 Git mutation。起终复算 cwd/branch/HEAD/status/count/aggregate，任何漂移即 blocked。

## Round 9 mandatory closure

1. **Data Root no-follow 与durability：** root/project intermediate directory、manifest、Artifact、receipt、staging均不可经symlink/path traversal逃逸；创建`artifacts/sha256`必须fsync直接parent；Artifact/Project首次publish、EEXIST exact、startup exact-success都必须在terminal receipt前修复business candidate parent-directory durability。
2. **全量startup preflight：** 所有durable bindings必须在任何cleanup/terminalization前闭合kind/target/expected/candidate、registry Artifact full descriptor/set/hash、Project lock与marker owner。较晚invalid binding不得发生较早Project cleanup；cross-Project/unknown evidence不得先铸terminal。
3. **同Project evidence ownership：** history terminal、pending Save、Save As marker-only、lock owner按durable binding唯一归属；non-owner跳过整组evidence，owner最终收束；receipt顺序不得抢删或阻断。
4. **Existing terminal authority与attempt closure：** readable result必须由当前live lease重新fsync receipts并验证intent/result；只接受由staged intent/result与durable receipt exact hard-link证明的attempt。任何attempt entry/candidate malformed、extra、wrong bytes/format/identity时，在Project lock/marker/directory cleanup前fail closed并保留全部evidence；成功retry才清exact candidates与attempt。
5. **Project Open/List isolation：** intermediate project directory symlink、manifest symlink/wrong type/malformed/identity drift都不得Open或进入recent list；不可读取Data Root外bytes。
6. **History stale CAS：** Undo/Redo使用strict bounded JSON DTO，携带expected Project revision与current Ref；服务端在mutation前CAS。第二个stale request必须409并保持world/ref/revision/history不变；never-ending/aborted body零mutation。
7. **Studio saved/dirty truth：** Project name或authoritative Ref变化后显示未保存并禁用export；save/open/import/create重置dirty；run-only未改变Ref时不误标dirty；不得把Presentation state写入Project。
8. **Stable public errors：** Gateway只返回冻结public code；`ELOOP`、本机路径、signed URL、secret marker与raw error message不进入response。
9. 保持Project manifest/lineage/ref、Repository restore/linear history、bundle deterministic roundtrip、Artifact corruption fail-closed、request deadlines、provider count=0、四Agent tools不增加第五个tool；不得更改Kernel/Episode/Evaluation/AdoptPolicy语义。

## Mandatory executable probes

- intermediate Project directory symlink逃逸；nested layout direct-parent fsync；Artifact EEXIST/recovery与Project exact recovery durability fault。
- 较早terminal Project + 较晚invalid Artifact binding，断言preflight前零cleanup。
- historical terminal + pending Save；historical aborted Save As + pending Save As marker-only/lock owner。
- cross-Project/unknown lock，断言result absent且evidence保留。
- visible result before receipts fsync failure/retry；existing terminal Project/Artifact/bundle attempt cleanup。
- corrupt/extra Artifact candidate与Project evidence共存，断言candidate validation失败前Project evidence byte/inode不变。
- stale Undo/Redo、never-ending history body、raw `ELOOP` public mapping、dirty/export state。

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

Producer evidence：focused startup/artifact 24/0/129；full 601/0/4133；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。fresh真实Chromium在专用5186/8796与临时Data Root证明registered Marble × Hunyuan Save As、dirty→export disabled、Save→export enabled、Gateway真实restart、recent/Open、Hunyuan visual loaded、proxy witness PASS、page error=0、idle rAF `68→68`；未调用provider，既有5173/8787未触碰，专用进程已停止，临时root已移入Trash。

输出结构化 `decision / may_closeout / P0/P1/P2 / executable counterexamples / commands / start-end identity`。仅P0=0且P1=0可approved；发现P1后只完成必要gate与终点冻结，不扩展P2机会扫描。
