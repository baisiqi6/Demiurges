# DH-016 Implementation Review Request — Round 14

## Frozen fresh boundary

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- product files：58
- ordered aggregate：`249a175d11484d0d234c7f8bd422f4036aaa0d40bf8087b80d75b240e9956adc`

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | while IFS= read -r file; do shasum -a 256 "$file"; done | shasum -a 256
```

第一且唯一仓库入口必须是本request；随后只读`AGENTS.md`、canonical plan与上述命令得到的58个product files。禁止读取Round1–13 request/verdict、plan-review、另一reviewer、findings/progress/current review/closeout/future packet；禁止manifest外broad glob/rg/find。只读、无install/联网/provider/Git mutation。起终复算identity，漂移即blocked。

## Round 14 mandatory closure

1. **Parent-directory atomicity：** Project Save As与bundle import必须先在new child directory中发布、fsync exact ownership marker，再fsync `projects/` parent。若parent fsync失败，重启只能凭exact marker/binding/inode恢复；不得留下永久`PROJECT_ID_CONFLICT`或删除unknown directory。
2. **Removal durability：** Project directory或operation attempt的`rmdir`已经成功但`projects/`或`staging/` fsync失败时，重启必须先重新fsync对应parent，再确认terminal/cleanup；path absence本身不是durability proof。故障阶段保留所有仍存在的receipt/attempt evidence，成功重试后才完成收束。
3. **Complete exact-set：** canonical Project引用registered Artifact而bundle缺少任一exact ZIP/index entry必须在Phase A、Data Root零mutation时拒绝。`op:a-<token>`与`op:a-b-<token>`等prefix-confusable attempts必须被各自唯一binding完整覆盖并exact cleanup；orphan/unknown/malformed staging仍fail closed。
4. **Retained recovery authority：** 三阶段startup仍须先全局只读验证bindings/attempts/staging/evidence owners并分类所有pending destination；随后统一terminalize；重新全局preflight/confirm后才cleanup。later invalid input不得导致earlier partial cleanup或额外recovery attempt。
5. **No regression：** layout-chain no-follow、registered Artifact full descriptor、Project manifest/lineage/ref/restore/history、Undo/Redo CAS、Studio dirty/export、stable Gateway errors、deterministic bundle、provider count=0、四Agent tools与Kernel/Episode/Evaluation/AdoptPolicy authority保持。

## Mandatory executable probes/gates

- 注入Save As创建目录后`fsync(projects/)`失败；关闭root/lease模拟restart；确认marker/evidence存在，startup收束后同Project ID以新operation成功保存。
- 注入aborted Save As清理时`rmdir(project)`成功、随后`fsync(projects/)`失败；restart/retry补fsync并完成attempt cleanup。
- 注入terminal attempt清理时`rmdir(attempt)`成功、随后`fsync(staging/)`失败；restart/retry补fsync且不重写business authority。
- 构造`op:a`与`op:a-b`真实attempt并证明complete coverage/cleanup；构造canonical composite Project + missing bundle Artifact entry并证明Phase A fail closed。
- 复测projects/artifacts整层与child symlink、earlier terminal + later malformed Project/corrupt Artifact、receipts fsync retry、stale history/dirty/public error。

```sh
bun test packages/world-project/src/data-root-layout.test.ts packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/import-dh013.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/world-project-bundle.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/studio/src/product-session-client.test.ts apps/studio/src/world-project-ui-state.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Producer evidence：focused remediation 32/0/128；full 612/0/4180；typecheck/build/diff-check通过；validate 0 warnings；doctor 0 errors（仅optional misses）。既有fresh Chromium证明Save As、dirty/export、Gateway restart、recent/Open、Hunyuan visual、proxy witness PASS、page error=0、idle rAF `68→68`；本轮未调用provider、未触碰5173/8787。

输出`decision / may_closeout / P0/P1/P2 / counterexamples / commands / start-end identity`；仅P0/P1均0可approved。发现首个P1后停止扩展P2/opportunity scan，只完成request-scoped必要复核、mandatory gates与终点冻结。
