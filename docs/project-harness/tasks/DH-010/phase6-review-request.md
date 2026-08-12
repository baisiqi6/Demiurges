# DH-010 Phase 6 Fresh Independent Review Request

## 角色与冻结目标

- 角色：fresh independent reviewer；只读；不得修改任何仓库文件；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- frozen Phase 1–5 product digest：`5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750`；
- vessel generator digest：`0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693`；
- vessel GLB digest：`856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`。

只读取本 request、canonical `plan.md`、Phase 1–5 evidence、当前产品 source/tests、scope/architecture/domain model、checklist/current plan。不得读取任何历史 `*verdict*`、`*cross-review*`、earlier review request 或其他 reviewer 输出；不得让已有 verdict 影响独立判断。

## 权限边界

- 允许：`Read/Grep/Glob`、只读 Git、只读 test/typecheck/build/digest 命令、针对当前 public/internal seam 的临时 `bun -e` 反例；
- 禁止：Edit/Write/NotebookEdit、生成或修改 repo artifact、dependency install、网络、真实 provider、credential、commit/push/PR/merge/tag/deploy、reset/clean/stash/checkout；
- 如果测试或 build 会写 tracked/untracked repo 文件，必须停止并报告；已知 Bun/Vite cache 不应进入 Git status；
- 审查开始和结束都必须复算 digest、artifact digests 与 `git status --short`；若冻结目标漂移，直接 `blocked`。

## Digest 复算算法

在 worktree 根目录执行以下只读 pipeline；输出必须精确等于 frozen digest：

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

## 必须核验的 acceptance

逐项对照 `plan.md` 的 12 条 Acceptance，重点用可执行反例验证：

1. 一个 `entity:vessel` 对应 smooth GLB、17-part compound、semantic rim frame、MuJoCo owner map 与 Studio selection；不得泄漏 `partKey`/geom/body ID 为 EntityRef。
2. 开口 cavity 必须由真实 Runtime 与 stable-inside-vessel Evaluation 证明；closed lid proxy 必须先完成 Runtime Episode、再由 Evaluation FAIL。
3. `WORLD_TOOL_CONTRACT` 是 Host、Gateway pre-admission、OMP schema/execute 的唯一 closed JSON authority；active/enabled tools 恰好四个，ambient/mounted tools 为零；legacy `cubeHeight`/run-only shape 不可达。
4. `world_edit` 只产生 child Snapshot；`world_run` 只产生 Episode/Terminal/Evaluation，不推进 current Ref；只有受信 AdoptPolicy registry 可 adopt。
5. falling-rigid 与 ball-vessel 的 fixture/Program/entity set/sample/terminal/evaluation/Product codec 必须分别 exact closure，跨 scenario alias、第四 fixture、closed proxy projection 均拒绝。
6. ball-vessel Episode 必须 3.0s/30Hz/91 samples；stable window 必须 exact 0.5s/16 samples、16/16 world-up support、pair-attributed penetration；hover、bounce apex、sidewall-only、transient/gapped/duplicate samples 必须 FAIL。
7. MuJoCo compound 必须 exact base + 16 walls；wall-sensitive trajectory、contact normal orientation、geom-owner folding、penetration sign/finite/unit normal 均需核验。
8. Snapshot/Episode/Evaluation/Ref/fixture/contract/asset registry 必须 recursively immutable；sparse/accessor/prototype/symbol/non-finite/extra key/alias/duplicate ID 输入 fail closed。
9. Product Session API/NDJSON 必须保持 DH-006 authority：bounded admission、single active turn/session、identity/sequence/tool/evidence closure、resync on empty/partial/disconnect、credential/internal detail 不泄漏。
10. Studio 必须从 projection/registry 解析 scenario selection、Program/Profile、metrics 与 presentation；无 Observation 不得伪造 3DGS；late GLB、second Session、resize、overlay 与 diagnostic Spark/3DGS regression 不回退。
11. 不得存在 renderer-to-state fallback、parallel legacy surface、scenario-specific patch stack、通用 plugin/framework/第五工具或未服务两个真实 consumer 的新抽象。
12. full `bun test`、`bun run typecheck`、`bun run build`、artifact checks、`git diff --check`、EXharness validation 必须通过；浏览器证据需与 source/test contract 一致，不能只相信文字记录。

除上述清单外，reviewer 应主动寻找最小可执行 P0/P1 反例，尤其关注：跨引擎 exact equality、late async callback、session reset、same-ID/different-content、plain-data recursive freeze、contact orientation、closed registry reachability、JSON round-trip 与 model-facing actual execute path。

## 预期基线

```text
bun test              139 pass / 0 fail / 2,826 assertions
bun run typecheck     pass
bun run build         pass (Vite large chunk warning only)
git diff --check      pass
EXharness validation  0 warnings
```

## 输出契约

中文为主体，commands、paths、IDs、hashes 保留英文。输出必须包含：

1. Reviewer identity / requested model / observed model（能核验时）；
2. Digest verification（before/after）与实际执行的 gate 结果；
3. Findings：P0 / P1 / P2，精确 `file:line`、可执行反例、实际/预期；
4. Acceptance 1–12 coverage 摘要；
5. 未验证项与原因；
6. Verdict：`approved | changes_requested | blocked`；
7. `may_closeout: yes | no`。

只有 P0=0、P1=0、冻结目标未漂移且必要 gate 可复核时才可 `approved`。P2 不阻断，但必须具体且不得把未来平台机会包装成当前必修。
