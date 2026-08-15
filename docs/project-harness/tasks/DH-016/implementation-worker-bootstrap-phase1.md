# DH-016 Phase 1 implementation worker bootstrap

你是 DH-016 的 implementation worker，不是 reviewer，也没有 commit、push、merge、deploy 或 closeout authority。

## 工作区与 authority

- 唯一工作区：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- base：`0efcef3a531c192410cdabcd62cf736e54404313`
- canonical plan：`docs/project-harness/tasks/DH-016/plan.md`
- 开工前按 `AGENTS.md` 的顺序完整读取稳定文档与 canonical plan。
- 已有 harness/doc dirty state 属于 Operator；不得修改 `docs/project-harness/**`、`AGENTS.md` 或任何 review/closeout 文件。
- 不修改 Git state，不安装依赖，不联网，不调用 provider，不读取或输出 credential。

## 本批次目标

只实现一个 package-first、可独立测试的底座：

1. 新建 `packages/world-project/` workspace package。
2. 实现显式 `DEMIURGES_DATA_ROOT` 配置解析、root bootstrap、root 打开与 identity 校验、固定目录 layout、writer lease identity/port 推导以及 Bun/Node 可用的 exclusive loopback lease。
3. 实现 `WorldProjectManifestV1` 的 package-owned exact codec、canonical revision、projectId/displayName/lineage/current Ref/registry/artifact completeness 校验。
4. 在 `@demiurges/world` 增加最小 package-owned Repository history export/restore/ref-control seam，并允许 `RuntimeMvpHost` 由已验证的候选 Repository 构建；不暴露成第五个 Agent tool。
5. 增加 focused unit/integration tests，覆盖正常 round-trip 与 canonical plan 中 Phase 1 相关的 fail-closed 反例。

## 严格范围

允许修改：

- `packages/world-project/**`
- `packages/world/src/repository/world-repository.ts`
- `packages/world/src/repository/*.test.ts`
- `packages/world/src/host/runtime-mvp-host.ts`
- `packages/world/src/index.ts`
- 上述 seam 必需的邻近 `packages/world/src/**` tests
- root `package.json` 仅当 workspace script/entry 必需；优先把 `data:init` CLI 放在新 package 内并通过 root script 调用。

禁止修改：

- `apps/**`
- `scripts/import-dh013-provider-assets.ts`
- MuJoCo runtime、Evaluator、AdoptPolicy、四工具 contract、OMP policy
- `docs/project-harness/**`
- lockfile 或依赖，除非现有平台 API 完全无法满足；若遇到此情况停止并报告，不自行安装。

本批次不要实现 Artifact publish/global durable operation、project atomic save/open store、bundle、Gateway route 或 Studio UI；可定义后续实现需要的最小稳定类型，但不要预建 framework。

## 实现原则

- 先写最小失败测试，再写实现；改动应直接、朴素、无类继承树或通用 plugin abstraction。
- 复用 `@demiurges/world` 已有 `canonicalJsonBytes`、`sha256Hex`、Snapshot/Ref 与 registered representation validators；不要复制规则。
- 外部输入必须 exact-key、dense-array、plain-data、finite、无 `-0`；未知字段拒绝。
- Data Root 不得 fallback 到 cwd、repo、`$HOME` 或旧 provider cache。
- bootstrap 只能在已存在 parent 下 non-recursive atomic 创建 0700 empty root；Gateway-style open 不创建 root。
- root 通过 no-follow directory fd 与 BigInt `fstat` 建立 identity；lease 公式和 handshake 必须与 plan exact。
- restore 必须先构建独立候选 Repository，失败不能触碰任何 live Repository；恢复 edit sequence 后首个合法 edit 不冲突、不跳号。
- Project v1 对 legacy `imported-rigid-mesh` / `gaussian-splat` external representation fail closed，不把它们误认成 Store-backed registered assets。
- 不让磁盘 JSON 或 bytes 因为“能解析”就自动成为 authority。

## 必须测试

- Data Root：empty/relative/NUL/missing/symlink/wrong mode/type；bootstrap 并发；dev/ino identity 与 deterministic port；第二 writer `EADDRINUSE`/reader fallback；release 后可 reacquire；bounded cleanup。
- Manifest：primitive round-trip；registered Marble × Hunyuan project round-trip；revision exact；unknown/extra/sparse/non-finite/`-0`；bad projectId/displayName；branch/cycle/orphan/duplicate/reordered lineage；forged cursor/currentRef/version；registry/artifact missing/extra/duplicate/order/drift；legacy unbacked external representation拒绝。
- Repository：history export/restore exact；current Ref version exact；restore failure leaves source/live untouched；restored first legal edit ID连续；工具集合仍 exact `read/write/edit/run`。

## 验证与交付

至少执行：

```text
bun test packages/world-project packages/world/src/repository
bun run typecheck
bun run build
git diff --check
```

若全量 typecheck/build 因本批次之外的既有问题失败，保留完整命令与错误，不掩盖。

最终报告：

1. 运行时实际 model identity 证据；若只能证明请求模型而不能证明 provider 实际模型，明确写 `UNVERIFIED`。
2. 改动文件。
3. 关键 invariants 如何落地。
4. 执行过的测试及精确结果。
5. 未完成/阻塞项与不确定性。

