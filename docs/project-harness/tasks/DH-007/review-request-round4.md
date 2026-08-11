# DH-007 Round 4 — Fresh Closure Cross-review Request

## Role / Authority

Independent closure reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-007`；严格只读。允许读取 base diff、Round 1-3 request/verdict/remediation、本地锁定 OMP source，并运行不修改 product source 的 tests/probes。禁止编辑/创建文件、读取 credential、真实 provider/model prompt、联网、build、commit、push、merge、reset、clean、deploy 或外部 coding agent。

Base：`a570064a7292821166fd65f074577a22b0390c14`。历史 verdict 永久保留。

## Frozen candidate

Product digest：`678d6811d35dfcac1bdacda922c792b8772d1df21cec5fe7728360d307c8f17c`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：85 tests / 0 fail / 452 assertions；typecheck、build、diff-check 通过。Round 3 scripted Chromium 已验证 4 tools、76 samples、frame 75→74、PASS、current ref v2、page errors 为空；本轮无 presentation change，不重复浏览器。未读取 credential、未发送 provider/model prompt、未运行普通 SDK smoke。

## Round 3 blockers to close

1. Restricted client 必须先创建唯一 in-memory SessionManager，并把同一个 `providerSessionId=sessionManager.getSessionId()` 同时传给 `createAgentSession` 与 pinned credential initial resolution；证明 OMP preflight/main request 使用同一 session-affine credential。
2. product pinned `getApiKey` 每次请求仍需先检查授权 provider/model，且 credential Promise 只解析一次；拒绝 Fireworks fast 与 model drift。
3. `Settings.isolated` 必须显式关闭 `contextPromotion.enabled`、`compaction.enabled`、`compaction.midTurnEnabled`，并把 `compaction.strategy=off`，使 context maintenance 不进入旁路 model/credential resolver。
4. 四个 world tool closure 必须捕获不可替换的 owning turn signal，并在 sequence、input admission、trace 或 `WorldToolSurface` 前拒绝 aborted turn；fake port 即使用 fresh signal late-call 也不得产生 Snapshot、world/lastRun、observer event 或后续 authority 污染。
5. `ProductSession.runTurn()` 成功返回 projection 必须是最终 settled `running:false`；abort/failure 后 `readProjection()` 同样 false。
6. 快速回归 full lifecycle deadline、exact four/mounted empty、slash/`@file`、512/513、failure correction、terminal outcome、public redaction、run 不推进 ref、Studio shared deadline。

只报告有本地可执行证据的 P0/P1。不得把已披露 preconnect、既有 UI contrast、架构机会或未执行的真实 canary 作为本轮 code closeout blocker。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；P0/P1/P2、精确行/可执行证据、digest before/after、命令结果、limitations。中文为主体，不输出 private chain-of-thought，不写 repo-local verdict，不读取另一 Round 4 reviewer 输出。
