# DH-010 Phase 6 Remediation — Fresh Independent Review Request

## Reviewer role

你是 fresh independent reviewer。严格只读、中文为主体；不得修改仓库或外部状态。你的职责是独立判断当前 remediation candidate 是否消除了 authority/evidence P1，不能替 operator 实现修复，也不能授权 commit、push、closeout 或 `mark-done`。

## Frozen target

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`
- branch：`agent/codex/DH-010`
- base / HEAD：`22e288690937834135584d023e4140e26696f761`
- expected product digest：`8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e`
- generator digest：`0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693`
- vessel GLB digest：`856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`

开始与结束都必须复算三项 digest、`git status --short` 与 `git diff --check`。若 product digest 或 status 在审查期间漂移，立即给出 `blocked`，不要继续扩大范围。

## Isolation

允许读取：

- 本 request；
- `docs/project-harness/tasks/DH-010/plan.md`；
- 当前 product source、tests、`package.json`、workspace manifests；
- 必要的 Git diff/history；
- harness validator 的命令输出。

禁止读取：

- 任何 earlier `*review-request*`、`*review-verdict*`、`*cross-review*`、`*remediation-evidence*`；
- `docs/project-harness/progress.md`、`events.jsonl`、`harness-state.json`；
- 另一 reviewer 的 prompt、transcript、消息或最终结论。

禁止：任何 Edit/Write/Notebook、Git mutation、commit/push/merge/reset/clean、联网、SSH、安装依赖、真实 provider prompt、部署、生产操作。只允许 read-only shell、临时 `bun -e` 反例、tests/typecheck/build/digest；不得把临时文件写入仓库。

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

## Mandatory executable checks

先独立重放并变异以下四类 boundary probe；不要只相信现有测试名称：

1. 对合法 ball-vessel projection 伪造相同 Evaluation ID 下的 `passed`、support、penetration 或其他 metric；transport 必须拒绝任何与受信 evaluator 重算结果不相同的内容。
2. 修改 authored/terminal Snapshot 的 mass、friction、body role，或把 current/base Ref 同时改成另一 `world:*` alias；codec 必须只接受 registered scenario physics 与 exact `world:current`。
3. 通过 `RuntimeMvpHost.write()` / Repository admission 输入 duplicate `EntityRef`；必须在初始化 authority Ref 前拒绝，且不得留下可读 current world。
4. 连续调用 imported visual resolver，尝试修改 entry、nested provenance 或 URL；不得污染下一次 resolve，返回记录必须递归不可变。

随后做 bounded fresh P0/P1 scan，至少覆盖：

- null-prototype plain-data projection 与 evaluator 是否真实可组合，同时 accessor/class/sparse/non-finite 仍 fail closed；
- trusted Evaluation 重算是否错误冻结/改变后续 evidence chain，或允许跨 Program/contract alias；
- canonical physics registry 是否覆盖 falling-rigid 与 ball-vessel 的 world + terminal carrier，而不会拒绝合法 pose edit；
- Snapshot uniqueness 是否覆盖 root、edit、terminal/record 的公共 admission seam；
- Studio registry immutability 是否只是 TypeScript `readonly`，还是运行时递归冻结；
- DH-001～009 的四工具、Ref/adopt、Product Session、3DGS/Spark regressions。

必要 gates：

```text
bun test
bun run typecheck
bun run build
git diff --check
EXharness validate
```

## Output contract

只在最终答复中输出，不写文件：

- reviewer identity、requested/observed model（无法核验则直说）；
- digest/status before/after；
- gates；
- findings 按 P0/P1/P2，必须含精确文件/行号、可执行反例、expected/actual；
- 四类 mandatory probe 的逐项结果；
- 未验证项；
- verdict：`approved | changes_requested | blocked`；
- `may_closeout: yes | no`。

任一可执行 P0/P1 必须 `changes_requested`；digest/status 漂移或必要事实无法独立核验才 `blocked`；只有 P0/P1 为 0 且必要 gates 完成才能 `approved`。
