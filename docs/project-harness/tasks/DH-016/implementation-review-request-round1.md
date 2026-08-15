# DH-016 Implementation Review Request — Round 1

## Freshness 与边界

- 工作树：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- frozen HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- 54-file product aggregate：`47abaa4ad4e692fbe2aaa8d05be2c9d6a82c5ce8ba7e09825b793a15d88a24a2`
- aggregate算法：按下列命令产生fixed-order完整`shasum -a 256`文本，再对该文本做SHA-256：

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | xargs shasum -a 256 > /tmp/dh016-product-hashes.txt
shasum -a 256 /tmp/dh016-product-hashes.txt
```

只读、独立审查。不得修改、build/install、联网/provider、Git mutation或读取任何DH-016既有plan-review request/verdict、另一implementation reviewer输出、`docs/project-harness/current/review-packet.md`与future closeout packet。先复算branch/HEAD/status、54-file list与aggregate；终点再次复算，漂移则blocked。

## Review target

完整读取canonical plan、AGENTS.md与54个product files（即上述命令的结果），并以可执行反例优先审查P0/P1。重点不是代码风格，而是以下authority/atomicity closure：

1. Data Root只能由显式bootstrap诞生；root fd identity、0700 layout、package-owned live writer lease不可伪造；两个进程/paused owner排他，SIGKILL后bounded rebind。
2. 所有Save/Save As/Artifact publish/DH-013 import/bundle import在同一writer runtime共用一个`OperationSingleFlight`和durable global operation binding；跨kind/跨project same key不能越过business mutation。
3. intent、Artifact CAS、Project publish、result与lock cleanup的no-replace/fsync/atomicity；startup recovery对exact/absent/conflict/identity drift收敛正确，只删除exact lock，不删除foreign evidence，不恢复半个世界。
4. Artifact Store对三项真实DH-013 bytes做digest/length/format/decoded bounds与symlink/type/identity验证；Gateway不得fallback到worktree cache，credential/URL/provider transient不得落盘。
5. `WorldProjectManifestV1`严格闭合linear Snapshot lineage/current Ref/registry/calibration/ArtifactRef；legacy或unbacked external representation fail closed；恢复不注入Repository/evidence authority。
6. deterministic bundle Phase A在Data Root零mutation前闭合ZIP/budgets/Project/Artifact/destination matrix；Phase B只在admission后发布；空root roundtrip identity exact。
7. Gateway/Studio strict DTO、Save/Open/list/import/export/undo/redo；history transition必须settled、Ref+1且只移动相邻cursor；不持久化camera/selection/PoseDraft/lastRun；不新增第五个Agent tool。
8. 主验收：真实Marble × Hunyuan v1→edit v2→save→关闭/重开exact；GLB缺失Open失败且旧live session不被污染；空root import exact；真实Chromium无page error且idle rAF delta=0。

特别主动寻找：pre-admission/old staging orphan、Save As空目录、project `.write-lock`、concurrent same-binding follower、result publish失败后的poison、bundle中途Artifact conflict、response body/abort/deadline、symlink/path traversal、malformed sparse/accessor/non-finite、reader mode mutation、session running状态等反例。

## Mandatory gates

必须至少执行：

```sh
bun test packages/world-project/src apps/agent-gateway/src/world-project-api.test.ts apps/studio/src/product-session-client.test.ts packages/world/src/product-session-project-history.test.ts packages/world/src/repository/project-restoration.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Build会写derived output，reviewer可只读核验producer evidence，不要求重跑。真实provider generation禁止；真实DH-013 cache仅可只读用于现有tests。所有repo外probe必须bounded并cleanup。

## Producer evidence（需独立复核，不得仅采信）

- `578 pass / 0 fail / 3995 expect()`；typecheck/build/diff-check通过；validate 0 warnings，doctor 0 errors（optional misses允许）。
- 真实DH-013 integration与真实Chromium已通过，详见`docs/project-harness/tasks/DH-016/progress.md`末节。
- Chromium过程中发现并修复list DTO多余`modifiedTimeMs`与history projection `running=true`两项裂缝，均有focused regression。

## Verdict format

输出：`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`、P0/P1/P2、每项精确文件/行、可执行counterexample、executed commands、start/end identity。只有P0=0且P1=0才能approved；发现P1后完成必要复核即停止扩展。
