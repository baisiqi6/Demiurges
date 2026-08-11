# DH-007 Round 3 — Fresh Final Cross-review Request

## Role / Authority

Independent final reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-007`；严格只读。允许读取 base diff、Round 1/2 request/verdict、remediation code、本地锁定 OMP source，并运行不会修改 product source 的 tests/probes。禁止编辑或创建文件、读取 credential、发送真实 provider/model prompt、联网、build、commit、push、merge、reset、clean、deploy 或调用外部 coding agent。

Base：`a570064a7292821166fd65f074577a22b0390c14`。Round 1/2 verdict 永久保留。

## Frozen candidate

Product digest：`ea599a14af3cb1b1cae19cc5defb59329715b117853455af03090a26a73f402c`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：83 tests / 0 fail / 443 assertions；typecheck、build、diff-check 通过。scripted Chromium 再验：四次 world tool、76 samples、frame 75→74、PASS、current ref `snapshot:edit-1 / v2`、console 仅 Vite debug、page errors 为空。未运行 remediation 后普通 `smoke:sdk`，未读取 credential，未发送 provider/model prompt。

## Round 2 blockers to close

1. production selector admission 拒绝 `fireworks/*-fast`，使锁定 SDK 不可关闭的 `*-fast → base` intrinsic fallback 无法进入 runtime；测试必须覆盖。
2. production `getApiKey` seam 必须在每次 model-facing request 前核验授权 `provider/model`；首次 credential resolution 的 Promise 在 session 内固定复用，失败/undefined 也不得触发第二次解析或 sibling rotation。返回给 `pi-ai` 的是 resolved static key，而不是其可 rotation resolver。
3. model identity 漂移必须在 credential/model-call boundary fail closed；start/post-turn identity checks 继续作为检测纵深。
4. 同一 Request/Gateway absolute abort authority 必须覆盖 `start → tool surface → prompt → response → stop`。即使 fake port 完全忽略 signal 且 start/stop 永久悬挂，HTTP turn 也必须 bounded settle，ProductSession 最终 `running:false`。
5. 真实 Restricted client 的 partial-start cleanup 必须等待 in-flight start，并在 abort 后不得进入 prompt；owned AuthStorage 必须关闭。
6. 快速回归 Round 1 的 exact four tools/mounted empty、slash/`@file`、512/513、failure correction、terminal outcome、public redaction、run 不推进 authored ref、Studio shared deadline。

重点审查锁定 OMP/`pi-ai` 是否还有独立于上述 boundary 的第二 provider/model/credential 调用路径，以及 abort race 是否会产生 late world side effect。仅真实可执行 P0/P1 阻断 closeout；架构机会、已披露 preconnect 与既有 UI contrast debt 不在 scope。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；P0/P1/P2、精确行/可执行证据、digest before/after、命令结果、limitations。中文为主体，不输出 private chain-of-thought，不写 repo-local verdict。
