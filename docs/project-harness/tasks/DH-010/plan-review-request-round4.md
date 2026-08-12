# DH-010 Plan-only Independent Cross-review Request — Round 4

## Frozen target

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- Branch：`agent/codex/DH-010`；
- Base/HEAD：`22e288690937834135584d023e4140e26696f761`；
- Canonical plan：`docs/project-harness/tasks/DH-010/plan.md`；
- Plan SHA-256：`2738b3135434507dd5b53aea74bb87e45af21912fa72789a7b1096ca33ffa21a`；
- Context aggregate SHA-256：`c52a8ddb38ee15692a828fce9fd3dacb9e9710915691f8822612286ce7769e0d`。

Context aggregate 必须独立按以下精确算法复算：在 worktree root 依次对下列 7 个文件运行 `shasum -a 256`，保留标准输出的完整 7 行（digest、两个空格、relative path、newline），把该 stdout 直接 pipe 给第二次 `shasum -a 256`：

1. `docs/project-harness/tasks/DH-010/plan.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/geometry-roadmap.md`
6. `docs/project-harness/technical-foundation.md`
7. `docs/project-harness/harness-checklist.json`

等价命令：

```sh
for f in \
  docs/project-harness/tasks/DH-010/plan.md \
  docs/project-harness/scope.md \
  docs/project-harness/architecture.md \
  docs/project-harness/domain-model.md \
  docs/project-harness/geometry-roadmap.md \
  docs/project-harness/technical-foundation.md \
  docs/project-harness/harness-checklist.json
do
  shasum -a 256 "$f"
done | shasum -a 256
```

任一 digest 不匹配则 `blocked`，不要审查移动目标。

## Authority and independence

- fresh independent、只读 plan reviewer；
- 不读取任何 earlier review request、`plan-review-verdict-*` 或 `plan-cross-review-verdict-*`；
- 可读 canonical plan、上述 7-file context、`AGENTS.md` 与必要 current source/tests，可运行只读 hash/Git/validator/source probes；
- 禁止文件修改、build/install、Git mutation、联网/provider/credential/deploy；
- 不继承任何 earlier approval/changes_requested/blocked 结论。

## Required review

对当前 plan 做完整 P0/P1 scan，重点反证：

1. `expected.name="world:current"` 是否与 read/Repository/OMP/codec 闭合，三个 fixture 的 read→JSON round-trip→edit 是否可达；
2. model pose 改为 exact nested objects 后是否通过 current Gateway pre-admission；`WORLD_TOOL_CONTRACT` 是否同时约束 Gateway gate、Host parser、OMP Schema 与真实 `tool.execute` 的 const/pattern/nested/additionalProperties/budget；
3. quaternion `1e-9` 是否与 current codec/Runtime/Presentation authority 一致，是否存在 silent normalization 或 sample-0 drift；
4. `frame:vessel-rim-center` 的 exact semantic carrier、composed matrix/off-axis probe是否有界且不变成通用 frame graph；
5. Runtime-direct closed-proxy trusted seam 是否完成物理 negative control，又不可达 Product/Repository/Agent authority；
6. 两个 Program duration/sample grid、exact 0.5s/16-sample stability、support/penetration、16-wall cavity、AdoptPolicy registry、2/3-entity codec closure 与 headless gate是否一致、可实现、可证伪；
7. primitive/imported GLB+3DGS、OMP four-tool、Repository/ref/adopt、Spark/transport/session lifecycle 与 scope/non-goals 是否仍有遗漏或 scope explosion。

## Output contract

- 中文为主体；包含 Reviewer、Digest verification、Findings（P0/P1/P2）、至少 5 个 Counterexamples、Verdict、`may_enter_implementation: yes|no`；
- 无 P0/P1 才 `approved`；可执行 P0/P1 则 `changes_requested`；authority 内缺事实才 `blocked`；
- 不输出 private chain-of-thought，只给可复核证据与简要推理。
