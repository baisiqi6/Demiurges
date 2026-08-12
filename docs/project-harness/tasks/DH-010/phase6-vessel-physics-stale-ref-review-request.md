# DH-010 Vessel Physics / stale-ref — Fresh Independent Review Request

## 角色、隔离与 frozen target

你是 fresh independent read-only reviewer，只审查本文件所定义的当前 remediation candidate。不得读取任何 earlier request、verdict、cross-review、review packet、remediation evidence、working notes、`progress.md`、`events.jsonl`、`harness-state.json`、`harness-checklist.json`、`current/**` 或另一 reviewer 的输出。

为避免通过搜索结果意外看到历史 verdict：不要对 `docs/project-harness/**` 执行 `rg`、`grep`、`find`、`Glob` 或目录遍历；该目录中只允许读取本文件的精确绝对路径。不要读取 canonical plan；本 request 已自包含本轮验收边界。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`
- branch：`agent/codex/DH-010`
- base / HEAD：`22e288690937834135584d023e4140e26696f761`
- expected product digest：`85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`
- generator SHA-256：`0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693`
- vessel GLB SHA-256：`856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`

允许读取：本 request 的精确路径；`apps/**`、`packages/**`、`scripts/**` 中的当前 product source/tests；workspace manifests；必要的 Git diff/history。允许运行只读 Git/inspection、repo 外临时 `bun -e` probes、tests/typecheck/build/digest 与 artifact hashes。

禁止：任何 repo 写入、Edit/Write/Notebook、commit、push、merge、reset、clean、联网、SSH、安装依赖、真实 provider prompt、部署、closeout 或 `mark-done`。build/test 只可产生 gitignored derived output。审查开始与结束的 product digest、HEAD 与 `git status --short --untracked-files=all` 必须一致；漂移则 verdict=`blocked`。

## Product digest algorithm

在 worktree root 原样执行：

```bash
{
  git diff --binary --full-index --no-ext-diff \
    22e288690937834135584d023e4140e26696f761 -- . \
    ':(exclude)docs/project-harness/**'
  git ls-files --others --exclude-standard \
    | /usr/bin/grep -v '^docs/project-harness/' \
    | LC_ALL=C /usr/bin/sort \
    | while IFS= read -r file_name; do
        /usr/bin/shasum -a 256 "$file_name"
      done
} | /usr/bin/shasum -a 256
```

## 本轮 acceptance boundary

DH-010 的产品目标是：一个 repo-owned smooth curved vessel 以单一 `EntityRef` 对齐 deterministic visual artifact、rim-center local frame、保留开放腔体的 bounded compound collision proxy 与 MuJoCo state；dynamic sphere 经唯一、受限的 `read/write/edit/run` surface 产生 multi-entity `Episode`，由 `stable-inside-vessel` Success Contract 评测；closed-proxy 对照必须 FAIL。不得回退 DH-001～009 authority/regressions、四工具、immutable evidence、Product Session 与 Studio projection closure。

本轮补丁只应从根部闭合两项：

1. registered vessel physics 是 canonical Snapshot identity 的组成部分，Repository、Runtime 与 Product codec 共同消费 repo-owned root validator，不允许第二套 transport constants；
2. `world_edit` 只有在 `update.status="updated"` 时才使旧 `lastRun` 失效；`stale_ref` 没有改变 authored world，必须保留仍匹配 current Ref 的 evidence。

不要把可选重构、样式问题或未来平台能力升级为 blocker；但任何可执行 authority、identity、causal evidence、atomicity、immutability 或生命周期错误都属于 P0/P1。

## Mandatory executable probes

除 bounded fresh P0/P1 scan 外，必须独立核验以下六组。可以新建 repo 外临时脚本，但不得把测试或日志写入仓库。

1. **Vessel physics root authority**
   - 对 registered ball-vessel authored Snapshot 将 vessel `friction: 0.8 → 0.01`，必须在 `WorldRepository.write()` 初始化/推进 `world:current` 前 fail closed，失败 atomic；
   - 同一 drift 必须在 Runtime MJCF compile/run 前 fail closed；
   - Product projection 中 authored 与 terminal vessel physics 同步漂移也必须被 codec 拒绝；
   - `bodyType` 与 `massKg` 漂移同样拒绝；canonical ball-vessel run 仍合法。

2. **stale-ref `lastRun` lifecycle**
   - 先产生一个 codec-valid current world + `lastRun`；随后使用旧 `expected` 执行 edit，返回 `update.status="stale_ref"`；current Ref 不变、`lastRun` 必须保留且最终 projection 可 decode；
   - 随后使用 fresh `expected` 成功 edit，current Ref 前进且 `lastRun === null`；
   - read-only 保留当前有效 evidence；新 run 写入新 evidence；成功 `world_write` 清除旧 evidence。

3. **Shared registered identity authority**
   - Repository、Runtime 与 Product codec 必须进入同一个 root registered Snapshot identity validator；
   - codec/Gateway 不得另存一份 vessel physics canonical values；
   - duplicate `EntityRef`、non-canonical `world:current` Ref alias、registered scenario representation/physics drift 继续 fail closed。

4. **既有 representation / evidence closure**
   - falling floor representation/physics、ball-vessel floor extent、ball visual color/physics、imported GLB/alignment/collision/3DGS provenance drift 均拒绝；
   - forged same-ID/different-content Evaluation 拒绝；plain-data projection 与 presentation asset entry/nested provenance 不可污染；
   - diagnostic imported fixture 同时支持 Observation 与 `observation=null`，不会被误冻结。

5. **Runtime/adopt/four-tool regressions**
   - `run` 不推进 current Ref；合法 PASS evidence 只有经 explicit adopt policy 才推进；
   - Runtime-direct test-only closed proxy 可产生 completed Episode，但 Evaluation 必须 FAIL，且该 proxy 不能进入 Host/Repository/Product/Agent authority；
   - restricted agent active tools 必须恰好 `world_read/world_write/world_edit/world_run`，无 ambient/mounted extras。

6. **Full gates 与冻结性**
   - full tests、typecheck、build、`git diff --check`、EXharness checklist validator、generator/GLB hashes 均通过；
   - 起止 product digest、HEAD、status 完全一致。

至少运行：

```bash
bun test
bun run typecheck
bun run build
git diff --check
/tmp/dh010-harness-state.LE2ZrQ/harnessctl validate
shasum -a 256 scripts/generate-smooth-vessel-glb.mjs packages/world/assets/smooth-vessel-v1.glb
```

## Severity、hard stop 与输出

- P0：可建立、推进或污染 canonical world authority，或造成不可恢复的 authority/evidence 错误；
- P1：可执行 correctness、identity、causal evidence、lifecycle、atomicity、immutability、security 或 acceptance blocker；
- P2：不阻断 DH-010 的局部维护性风险或超出本轮范围的机会。

任一 executable P0/P1 => `changes_requested`；必要事实无法独立核验、隔离被污染或 target 漂移 => `blocked`；只有 full gates 完成且 P0/P1=0 才能 `approved`。

最终输出中文为主体，命令、路径、identifier、hash 保留英文，并包含：

1. reviewer identity、requested/observed model；
2. 起止 digest/HEAD/status；
3. full gates；
4. mandatory probes 逐组结果；
5. findings（精确文件/行号、可执行反例、Expected/Actual、影响）；
6. 未验证项与 isolation 声明；
7. `verdict: approved|changes_requested|blocked`；
8. `may_closeout: yes|no`。

不要写 repo 文件；完成最终 verdict 后立即停止，不扩展到 UI 风格、future architecture 或其他 checklist item。
