# DH-010 Root Authority / stale `lastRun` — Fresh Independent Review Request

## Role 与 frozen target

你是 fresh independent reviewer。只审查当前 remediation candidate，不读取任何 earlier review request、verdict、cross-review、remediation evidence、`progress.md`、`events.jsonl`、`harness-state.json`、`harness-checklist.json` 或另一 reviewer 的输出。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`
- branch：`agent/codex/DH-010`
- base / HEAD：`22e288690937834135584d023e4140e26696f761`
- expected product digest：`8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8`
- generator SHA-256：`0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693`
- vessel GLB SHA-256：`856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`

允许读取本 request、`docs/project-harness/tasks/DH-010/plan.md`、当前 product source/tests、workspace manifests 与必要 Git diff/history；允许运行只读 Git/inspection、临时 repo 外 `bun -e` probes、`bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、EXharness validate 与 artifact hashes。

禁止任何 repo 写入、Edit/Write、commit、push、merge、reset、clean、联网、SSH、安装依赖、真实 provider prompt、部署、closeout 或 `mark-done`。build/test 只能产生 gitignored derived output。开始与结束 product digest 和 `git status --short` 必须一致；漂移则 verdict=`blocked`。

## Digest algorithm

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

## Mandatory executable probes

除 bounded fresh P0/P1 scan 外，必须独立核验：

1. **Repository root authority**：registered ball-vessel floor collision extent、ball visual color，以及 falling-rigid floor representation/physics 任一漂移，必须在 `WorldRepository.write()` 建立/推进 canonical Ref 前 fail closed；写入失败必须 atomic，current Ref 不得初始化或改变。
2. **Runtime authority**：同类 falling-rigid floor drift 必须在 MJCF compile/run 前 fail closed；canonical primitive、diagnostic imported（含 Observation 与 observation=null）与 ball-vessel run 仍合法，动态 Entity state/pose 演进不被误冻结。
3. **Single-source parity**：Repository、Runtime 与 Product codec 必须消费同一个 repo-owned registered Snapshot identity validator；codec 不得持有第二份 canonical representation constants，transport 同步漂移不得绕过；imported GLB/alignment/collision/3DGS 专属 identity 仍 fail closed。
4. **Runtime-direct negative seam**：test-only closed proxy 必须可由 Runtime-direct seam 产生 completed Episode，但不能进入 Host/Repository/Product/Agent authority。
5. **stale `lastRun` lifecycle**：第一 turn 完成 `write → read → edit → run`，第二 turn 成功 `read → edit-only` 后，current world 必须前进、`lastRun` 必须为 `null`、最终 projection 可被 `decodeProductSessionProjection` 解码；`read-only` 不应清除 current valid `lastRun`，新 `run` 应写入新 evidence。
6. **Authority regression**：run 仍不推进 current Ref；Evaluation/adopt evidence closure、duplicate EntityRef、immutable projection、restricted four-tool surface 与 DH-001～009 regressions 不得回退。

至少运行：

```bash
bun test
bun run typecheck
bun run build
git diff --check
/tmp/dh010-harness-state.LE2ZrQ/harnessctl validate
shasum -a 256 scripts/generate-smooth-vessel-glb.mjs packages/world/assets/smooth-vessel-v1.glb
```

## Severity 与输出

- P0：可推进/污染 canonical world authority，或造成不可恢复 authority/evidence 错误；
- P1：可执行 correctness、identity、lifecycle、atomicity、security 或 acceptance blocker；
- P2：不阻断本 item 的局部风险或维护性问题。

任一 executable P0/P1 => `changes_requested`；必要事实无法独立核验或 target 漂移 => `blocked`；只有 full gates 完成且 P0/P1=0 才能 `approved`。

最终输出中文为主体，命令/路径/identifier/hash 保留英文，并包含：reviewer identity、requested/observed model；起止 digest/status；gates；mandatory probes 逐项结果；findings（精确文件/行号、反例、Expected/Actual、影响）；未验证项；`approved|changes_requested|blocked`；`may_closeout: yes|no`。不要写 repo 文件。
