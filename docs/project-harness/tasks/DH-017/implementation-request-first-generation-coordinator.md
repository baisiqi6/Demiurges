# DH-017 Phase 1 implementation request：first-generation namespace + birth coordinator

## 角色与目标

你是本轮有写权限的 `Terra high` coding Worker。工作目录固定为：

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

只实现首个 Generation admission 的最小 coordinator，把已经存在且各自通过测试的三块能力串成一个不可绕过的 package-internal 入口：

```text
FirstGenerationCapacityCapability
→ GenerationNamespaceInstaller
→ GenerationBirthJournal
```

底层目的不是增加一套 transaction framework，而是关闭当前唯一真实缺口：同一次 first-generation admission 必须在任何 provider side effect 前，先用真实磁盘 capacity authority 安装/恢复 Generation namespace，再完成 durable generation birth；crash/replay 只能收敛到同一 namespace 与同一 generation。

## 第一性原理与最小机制

- 复用现有 `authorizeFirstGenerationCapacity`、`GenerationNamespaceInstaller`、`GenerationBirthJournal`；不要复制它们的验证逻辑。
- coordinator 只负责固定顺序、一次性 authority 的消费边界和结果组合。
- 不创建通用 transaction、workflow engine、strategy、registry、DI container、第二套 lock/single-flight 或可配置步骤表。
- 不为本轮不存在的 provider、Artifact、Gateway 或 Studio 场景预留抽象。
- 若现有三个 API 已足够，优先新增一个小的 package-internal coordinator 与聚焦测试；只有被真实测试反例证明必要时才修改相邻模块。

## 必须实现的行为

1. 从同一 live `OpenedDataRoot + DataRootWriterLease` 调用真实 `authorizeFirstGenerationCapacity`。
2. `capacity-reached` 必须在任何新 receipt、staging、namespace、generation data/catalog mutation 前返回稳定结果。
3. authorized 路径必须在一个同步、有界的 coordinator 调用中：
   - 调用 `GenerationNamespaceInstaller.install(capability)`，由它在 first filesystem mutation 前消费 capability；
   - namespace 达到 `terminal-installed` 后才构造/调用 `GenerationBirthJournal.admit(intent)`；
   - 返回 namespace status、birth status 与 exact admitted current state，调用方不能获得 raw capability、raw writer 或 internal Operation authority。
4. namespace 已安装时仍使用真实 capacity authority，且只申请/消费剩余 first-generation birth 所需的2-slot含义；不得重新创建 namespace Operation。
5. crash 在 namespace success 后、birth catalog 前：provider call始终为0；same intent 重试继续/复用同一 generation，不能创建第二 namespace 或第二 visible catalog pointer。
6. same binding replay 返回 replay；binding/generation drift、forged/replayed capability、foreign namespace/birth evidence继续复用现有模块的 fail-closed结果，不新增另一套判定。
7. coordinator、raw capability和相关test seam都不得从 `packages/world-project/src/index.ts` 导出。

## 聚焦测试

至少覆盖：

- empty root：一次调用完成namespace + birth；最终只有一个terminal namespace和一个exact catalog pointer；
- exact replay：第二次调用不产生第二attempt、第二namespace或第二catalog pointer；
- namespace已安装但generation未birth：重新authorization后只完成birth；
- capacity-reached：receipt/staging/namespace entry set byte-for-byte不变；
- namespace install各既有crash milestone之后，通过coordinator重试最终born且无duplicate；
- generation birth data/birth-staging/catalog各既有crash milestone之后，通过coordinator重试唯一收敛；
- intent/binding drift或foreign evidence保留现场并fail closed；
- package-root export negative check。

不要为了“覆盖更多”制造额外状态机；优先复用两个现有模块的fault hooks，只验证coordinator新增的顺序与authority边界。

## 允许修改

- 新增最小 coordinator源码与测试，建议位于`packages/world-project/src/`；
- 如聚焦反例证明必要，可最小修改：
  - `first-generation-capacity.ts`及其测试；
  - `generation-namespace-installer.ts`及其测试；
  - `generation-birth-journal.ts`及其测试；
- 不修改package-root export；不修改provider/Gateway/Studio/Artifact代码。

## 禁止事项

- 不读取Keychain、credential或ambient provider config；
- 不联网、不调用Marble/Hunyuan、不运行真实generation；
- 不commit/push/merge/rebase/reset/clean/deploy；
- 不修改Coordinate/MultiNexus生产配置或Discord；
- 不重写用户现有dirty worktree中的无关变更；
- 需要扩大范围、发现canonical plan与当前代码矛盾、或无法在上述allowlist内完成时立即停止并输出blocker。

## 验收与输出

先运行聚焦测试，再运行：

```text
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

最终以中文输出结构化 `RESULT`：

- 修改文件与核心行为；
- 为什么这是最小实现；
- focused/full gate精确数字；
- 未完成与未授权事项；
- 当前branch/HEAD/status，明确未做Git mutation。

Worker结果不是最终批准；后续由Reviewer与Codex Operator独立验收。
