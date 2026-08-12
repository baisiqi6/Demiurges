# DH-010 Phase 6 Canonical Representation Remediation — Fresh Independent Review Request

## 角色与 authority

你是 fresh independent reviewer，不是 worker。只读审查当前 frozen candidate，不修改文件，不修复问题，不 commit、push、merge、reset、clean、deploy、SSH、联网、安装 dependency、调用真实 provider 或读取 credential。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`
- branch：`agent/codex/DH-010`
- base / HEAD：`22e288690937834135584d023e4140e26696f761`
- expected product digest：`88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150`
- generator SHA-256：`0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693`
- vessel GLB SHA-256：`856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`

允许运行只读 Git/inspection 命令与 `bun test`、`bun run typecheck`、`bun run build`、`git diff --check`、EXharness validate。测试/build 只可产生 gitignored derived output；开始与结束的 tracked/untracked status 必须一致。

## Fresh isolation

不得读取：

- 任意 `*verdict*`、`*cross-review*` 文件；
- `phase6-review-request.md`、`phase6-remediation-review-request.md` 或其他 earlier review request；
- `phase6-cross-review-evidence.md`、`phase6-remediation-evidence.md`、`phase6-remediation-cross-review-evidence.md`、`phase6-representation-remediation-evidence.md`；
- `docs/project-harness/progress.md`、`events.jsonl`、`harness-state.json`；
- 另一 reviewer 的 prompt、transcript、输出或 verdict。

允许读取本文件、`tasks/DH-010/plan.md`、当前 product source/tests、`harness-checklist.json` 中 DH-010 acceptance，以及验证实现所必需的 repo-owned配置。不要把历史审查结论当作提示或证据。

## 冻结摘要算法

在审查开始与结束各复算一次：

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

摘要或 Git status 在审查期间漂移则停止并报告 `blocked`，不要审查移动目标。

## Mandatory executable probes

先独立理解实现，再设计反例；不得只复述测试名。

1. **Canonical representation closure**
   - authored world 与 terminal Snapshot 同步漂移 ball-vessel floor visual/collision extent，必须拒绝；
   - 同步漂移 ball visual color，必须拒绝；
   - 同步漂移 falling-rigid floor extent，必须拒绝；
   - 合法 ball pose/state 演进必须仍可 `edit → run → decode`；
   - diagnostic imported cube 必须仍由自身 artifact/collision/3DGS authority 接纳，不能被 primitive cube registry 错拒。
2. **Evaluation / physics / Ref closure**
   - same-ID/different-content Evaluation、canonical mass/friction/bodyType 漂移、`world:attacker` Ref alias 必须拒绝。
3. **Entity identity / admission atomicity**
   - duplicate EntityRef 在 root、record、recordEpisode terminal 路径均须 fail closed，且失败不得污染 current Ref 或存储。
4. **Presentation registry immutability**
   - entry 与 nested provenance mutation 不能污染后续 resolve。
5. **Bounded fresh P0/P1 scan**
   - 围绕 Product evidence、registered fixture identity、Snapshot/Episode immutability、four-tool authority、Runtime/Evaluation causal closure 与 Studio presentation alignment，寻找新增 executable P0/P1；
   - 不把孤立、无 authority mutation 的 `world_read.ref.version` 问题升级为本轮 blocker，除非能给出新的端到端 executable impact。

## Required gates

```text
bun test
bun run typecheck
bun run build
git diff --check
/tmp/dh010-harness-state.LE2ZrQ/harnessctl validate
shasum -a 256 scripts/generate-smooth-vessel-glb.mjs packages/world/assets/smooth-vessel-v1.glb
```

不得在 repo 内重跑会覆盖 GLB 的生成器；如要验证 byte identity，只能输出到 repo 外临时目录。

## 输出契约

中文为主体，命令、路径、identifier、hash 保留英文。输出：

1. reviewer identity、requested/observed model（无法核验就明确说无法核验）；
2. 起止 digest、Git status 是否一致；
3. gates 与 mandatory probes 的实际结果；
4. findings，按 P0/P1/P2 分级，每项包含文件/行号、可执行反例、Expected/Actual、影响；
5. 未验证项；
6. 最终 `approved | changes_requested | blocked` 与 `may_closeout: yes | no`。

只有 `P0=0`、`P1=0`、摘要未漂移且 required gates 通过时才能 `approved`。不要因为测试通过而跳过 fresh counterexample scan，也不要因非阻断 P2 拒绝批准。
