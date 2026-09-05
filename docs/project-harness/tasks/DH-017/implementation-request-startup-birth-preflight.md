# DH-017 Phase 1 implementation request：startup Generation birth preflight / apply

## 角色与目标

你是本轮有写权限的 `Terra high` coding Worker。工作目录固定为：

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

只关闭一个 startup correctness 缺口：`recoverPendingOperations()` 必须在任何既有 Project/Artifact durability repair、terminalization 或 cleanup mutation 前，以只读方式看见并验证当前 first-generation 的 `data/catalog/birth-staging` durable evidence；合法的 pending birth 只能在全局 preflight 全部通过后，用同一 evidence 生成的一次性 package-private recovery authority 收敛。

这不是完整 Generation lifecycle，也不是通用 recovery framework。底层目的只有两个：

1. Generation birth drift 不能在旧 Project/Artifact recovery 已 mutation 后才暴露；
2. 受支持的 birth crash 不能因为 mutation routes 尚未开放而永久卡死。

## 第一性原理与最小机制

- 复用 `GenerationBirthJournal`、`GenerationRecordJournal`、`inspectGenerationNamespace` 与现有 startup Phase A/B/C；不要复制 intent/head/pointer/inode/body validators。
- 优先给 `GenerationBirthJournal` 增加一个只读 inspection/recovery plan + one-shot apply seam，或等价的最小 package-private结构；不要创建第二套 journal、transaction/workflow engine、generic recovery registry、DI/strategy/config framework。
- 当前只支持 first-generation closed world：namespace terminal 时 `data/` 与 `catalog/` 最多各一条 exact binding；任何 foreign/second generation evidence fail closed。未来合法 concurrent multi-generation lineage另立切片。
- read-only preflight 与 apply authority必须分离；apply必须绑定同一 root、live lease、intent、目录/文件 identity、bytes/digest与 entry set，并在第一处 birth mutation 前近端重验。
- 只修改本链条真正触达的无界读取；不借机重写全仓 filesystem helpers。

## 必须实现的行为

1. `recoverPendingOperations()` 在 `repairRecoveryControlDirectoryDurability()`、`journal.beginRecovery()`、`finalize*()`、Project/Artifact repair/cleanup及 namespace apply 之前，完成 Generation birth 全局只读 preflight。
2. namespace `absent-no-intent`、`install-intent-pending`、`directory-published-result-pending` 时，只接受三个 Generation child directory尚不存在或exact empty的现有合法形态；任何 birth evidence都在 namespace result/Project recovery mutation 前 fail closed。
3. namespace `terminal-installed` 时，bounded枚举并唯一分类：
   - empty：无 birth plan；
   - exact born/replay：完整 data + catalog、无待cleanup staging时只验证；
   - 受支持 pending：完整 data/admitted/head/downloads + absent catalog，或同 intent exact staging；catalog 已 durable且同 inode staging 尚待cleanup也可生成 recovery plan；
   - catalog-only、staging-only、foreign/second name、wrong type/mode、symlink、body/binding/head/pointer/inode drift、extra entry一律保留 evidence并 `GENERATION_RECOVERY_REQUIRED`。
4. 所有 Project/Artifact/namespace/birth plans 在 Phase A 全部形成且验证成功后才允许任何 mutation。birth apply可放在既有 Operation recovery与 namespace apply之后，但必须在 apply 前重新验证其完整 snapshot；任何 drift使后续 mutation停止并保留 evidence。
5. 合法 pending birth apply只调用/复用现有 Journal的 durable收敛路径：不得创建第二 generation、第二 catalog pointer或猜测cleanup；same intent restart必须收敛到唯一 born/replay。
6. 把本链条的无界目录读取改成 directory-handle `limit+1`：至少 `GenerationBirthJournal` 的 generation exact-entry检查、empty downloads检查，以及 startup 对 `data/catalog/birth-staging` 的枚举；不得先用 `readdirSync()`物化任意大array。first-generation实际允许0/1，但 physical safety仍遵循计划中的 catalog 256、birth-staging 16 与逐目录 exact small caps。
7. 新 recovery authority、raw Journal、test seams不得从 `packages/world-project/src/index.ts` 导出；不得增加 provider/CAS/World/Gateway/Studio authority。

## 聚焦反例与验收

至少覆盖：

- crash 在 generation data durable、birth-staging durable、catalog fsync、staging cleanup fsync 四个既有 milestone；关闭/re开 root、重新 acquire lease 后，startup只在全局preflight通过后收敛同一 birth；
- 一个较早 terminal Project/Artifact operation + 较晚 malformed/foreign Generation birth evidence：startup必须在第一处 Project/Artifact repair/finalize/cleanup mutation前失败，二者 evidence均保持；
- valid pending birth 在 preflight 后发生 data/catalog/staging entry-set、inode或bytes drift：apply前拒绝，不清理/不补写；
- namespace result pending却出现任意 birth evidence：namespace result与其他 operation均零mutation；
- data/catalog/staging `limit+1`、unknown、wrong type、symlink；generation目录 extra entry与 downloads non-empty/overflow；
- exact born restart只验证、不创建第二catalog/staging；empty namespace restart为no-op；
- forged/replayed/cross-root recovery plan零mutation；package-root negative export。

测试必须断言真实 mutation boundary，而不只比较返回 code。必要时复用既有 fault hook；新增 hook只能位于本切片必须证明的 startup/birth apply边界。

## 允许修改

- `packages/world-project/src/generation-birth-journal.ts`及测试；
- `packages/world-project/src/startup-recovery.ts`及测试；
- 如只读分类确有需要，可新增一个小的 package-internal birth recovery/inspection模块及测试；
- 如 bounded scan需要，可最小修改本模块现有私有 helper；不做全仓迁移。

## 禁止事项

- 不修改 provider、Gateway、Studio、Artifact public CAS、World Project/Snapshot/Ref/Episode/Evaluation；
- 不读取 Keychain/credential，不联网，不调用 Marble/Hunyuan，不运行真实 generation；
- 不实现合法 concurrent multi-generation recovery、generation GC/archive、full lifecycle polling/download/publication；
- 不commit/push/merge/rebase/reset/clean/deploy，不修改 Coordinate/MultiNexus生产配置或 Discord；
- 不重写用户 dirty worktree中的无关变更；若必须扩大范围或发现 canonical plan 与当前代码矛盾，停止并输出 blocker。

## 验证与 RESULT

先跑focused startup/birth tests，再运行：

```text
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

最终中文输出结构化 `RESULT`：修改文件、最小authority/ordering、反例、精确gate数字、未完成/未授权边界、branch/HEAD/status。Worker结果不等于批准；后续仍由Reviewer与Codex Operator验收。
