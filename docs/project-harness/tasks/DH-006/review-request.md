# DH-006 Independent Cross-review Request

## 角色与 Authority

你是 independent reviewer，只读审查当前未提交的 `agent/codex/DH-006` candidate。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-006`
- base：`agent/codex/DH-005` / commit `7304410`
- 允许：读取 repo、Git diff/history、运行只读检查与 executable tests；build/typecheck 只允许产生既有 ignored `dist`/`*.tsbuildinfo`。
- 禁止：编辑产品或 harness 文件、创建 repo-local review artifact、commit、push、merge、reset、clean、PR/Issue、SSH、deploy、真实 provider/model prompt、credential 读取或任何生产 mutation。
- 需要新增 authority 或 product digest 不匹配时立即停止并报告。

## 冻结基线

Product digest：`20ed24ff354f9ac178d8aef2560f959f44ef12bc984dcfc64f20503af28c755a`

精确复算命令：

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

任务计划与 acceptance 见 `docs/project-harness/tasks/DH-006/plan.md`；当前 review packet 见 `docs/project-harness/current/review-packet.md`。

## 必审边界

1. `@demiurges/world` 是否是因第二个真实调用方才提取的最小内部 package；Gateway 是否彻底消除对 `apps/studio/src` 的反向 import，Presentation/OMP 是否未穿透共享边界。
2. 每个 connected Product Session 是否只有 Gateway 内一个可写 `RuntimeMvpHost`；Studio 是否完全没有第二 Repository/Host authority，也没有从 render state 反推 world state。
3. OMP observer 到 product contract 的转换是否保持 OMP internals 在 Gateway 内；`ProductSessionEvent`/projection 是否 bounded、ordered、JSON-safe、deep-frozen，异常 observer 是否不能改变 tool outcome。
4. HTTP API admission、NDJSON streaming、取消/断流/resync、并发 turn、unknown session/route、error redaction 是否 fail closed；尤其寻找空 200 stream、sequence drift、partial authoritative mutation、unbounded body/event/error 或 session confusion 的可执行反例。
5. `world_write → world_read → world_edit → world_run` 是否来自真实 `WorldToolSurface`，而非 UI 伪造；`run` 后 ref 是否仍为 authored edit version 2；Agent-facing surface/route 是否没有 `adopt`。
6. Studio parser 是否能处理任意 chunk 边界并拒绝 content-type、sequence、session identity、tool name 与 oversized input/output drift；resync 是否重新建立权威 projection而非让前端缓存成为事实面。
7. Three.js 与 EpisodePlayer 是否由 authoritative Snapshot/Episode samples 驱动，是否存在终态闪现、stale-session 交叉污染、资源泄漏或 presentation mutation 反向影响 authority。
8. tests 是否只是 source-string/同错相消，是否缺少足以阻断首个 product loop 的真实 integration/adversarial coverage。

## 已有 Operator Evidence（需独立核验）

- `bun test`：56 pass / 0 fail / 340 assertions；
- `bun run typecheck`、`bun run build`、`git diff --check`、checklist validation 通过；
- 真实 Chromium 两个 session 均展示四工具 trace、75-frame Episode、PASS；run 后 ref 保持 `snapshot:edit-1` version 2；浏览器无 warning/error；
- 未调用真实 OMP/provider prompt。

## 输出

中文为主体，第一行严格为 `decision=approved|changes_requested|blocked`；随后列 P0/P1/P2（无则写“无”）、每条可执行证据/精确文件行、独立运行的命令与结果、digest 复核、任何 evidence limitation。不要输出 private chain-of-thought。
