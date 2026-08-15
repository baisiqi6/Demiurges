# DH-016 Implementation Review Request — Round 2

## Freshness 与 frozen identity

- worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- frozen HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- 55-file product aggregate：`bee9b468bf4d0c191167ee3fffdf82307045495ee976a29ac22d339acdd74a9e`

aggregate算法：

```sh
PRODUCT_FILES=$( { git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u | grep -v '^docs/' )
printf '%s\n' "$PRODUCT_FILES" | xargs shasum -a 256 | shasum -a 256
```

这是fresh、独立、只读的implementation review。首先读取本request，再读取`AGENTS.md`、canonical plan与上述命令得到的55个product files。不得读取Round 1 request/verdict、任何plan-review材料、另一implementation reviewer输出、`findings.md`、`progress.md`、`docs/project-harness/current/review-packet.md`或future closeout packet。不得修改、install、联网/provider、Git mutation。起终复算branch/HEAD/status/55-file list/aggregate；漂移则blocked。

## Round 2 mandatory closure

除完整DH-016 authority/atomicity审查外，必须独立执行下列反例；任一失败均为P1：

1. **operation-owned project directory cleanup**
   - Save As在mkdir与exact `.write-lock`后abort，必须形成durable `REQUEST_ABORTED`，删除exact lock与同identity空目录，fsync parent；Project/staging不可残留。
   - 若目录出现unknown entry、path/inode/mode/uid/gid drift，必须保留现场并返回`OPERATION_RECOVERY_REQUIRED`，不得删除foreign state。
   - 对bundle import的同构Project publish路径做同样静态与可执行检查。
2. **Artifact durable admission**
   - package root不得暴露raw CAS publish或raw attempt cleanup。
   - forged structural `AdmittedOperation`、来自另一root/lease/journal的operation、Project operation或candidate不覆盖目标Artifact时，必须在layout/staging/CAS mutation前fail closed。
   - 所有产品可达Artifact publish只能来自shared `OperationSingleFlight` + durable global intent；recovery仍可按candidate matrix唯一收敛。
3. **bounded Gateway request body**
   - Open、Save、bundle import的never-ending stream分别验证request abort与有限总deadline；每次read必须被边界约束，reader会cancel/release，返回稳定`REQUEST_ABORTED`/`REQUEST_BODY_TIMEOUT`。
   - 断言Session projection、projects/receipts/staging/Artifact Store零变化；raw stream error不得泄漏。
4. **startup evidence preservation**
   - exact intent hard-link + malformed/identity-drift Project使classification不唯一时，必须返回`OPERATION_RECOVERY_REQUIRED`并保留lock、intent、staging、corrupt target，且result不存在。
   - 只有durable terminal形成后才能清理exact lock/staging；foreign lock始终保留。

同时复核：Data Root显式bootstrap/0700/fd identity与独占lease；global operation binding/single-flight；manifest/lineage/ref/Artifact exactness；bundle Phase A zero mutation与determinism；Repository restore/undo/redo authority；Gateway/Studio strict DTO；无第五个Agent tool；真实Marble × Hunyuan restart/损坏/空root import product acceptance不退化。

## Mandatory gates

```sh
bun test packages/world-project/src/operation-journal.test.ts packages/world-project/src/artifact-store.test.ts packages/world-project/src/project-store.test.ts packages/world-project/src/bundle-store.test.ts packages/world-project/src/startup-recovery.test.ts apps/agent-gateway/src/world-project-api.test.ts apps/agent-gateway/src/product-session-api.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

Build会写derived output，可只读核验producer evidence，不要求重跑。真实provider generation禁止；现有DH-013 cache只读。repo外probe必须bounded、cleanup且不得触碰既有5173/8787进程。

## Producer evidence（必须独立复核）

- focused remediation suite：25 pass / 0 fail；另有unknown-entry回归通过。
- full：`583 pass / 0 fail / 4025 expect()`。
- typecheck、build、`git diff --check`通过；EXharness validate 0 warnings、doctor 0 errors（optional misses允许）。
- Round 1 remediation没有重新调用Marble/Hunyuan，也没有新增provider authority。

## Verdict

输出`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`、P0/P1/P2、精确文件/行、可执行counterexample、executed commands、start/end frozen identity。只有P0=0且P1=0才可approved；一旦确认P1，完成必要证据与终点冻结后停止扩展。
