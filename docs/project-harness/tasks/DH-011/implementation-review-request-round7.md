# DH-011 Round 7 Fresh Closure Review

严格只读、fresh、bounded。不得读取任何旧 verdict/cross-review/Round 1–6 request 或 current review packet；不得修改、commit、push、merge、联网或调用 provider。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- HEAD/base：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- product manifest：`git diff --name-only HEAD -- apps packages scripts` 与 `git ls-files --others --exclude-standard -- apps packages scripts` 合并后按 `LC_ALL=C sort -u`，必须为 36 files
- aggregate：逐文件运行完整路径 `shasum -a 256`，再对固定顺序输出二次 SHA-256，必须为 `440188d28046b661602a7bd129b6b104b3497a9d6fbb781e48c5e02e9026312c`

本轮只复核 Round 6 唯一 blocker 的 closure，不再扩展扫描：

1. `requireBallVesselSnapshot()` 必须把 ball-vessel fixture 精确绑定到 `scenario:ball-vessel-free-fall-v1`；不能只凭 EntityRef、representation 或 physics 识别。
2. 合法 ball-vessel Snapshot / Product projection / streamed event 必须继续接受；把其 `scenarioId` 同步改写为 primitive 或 diagnostic 时，以下边界必须 fail closed：fixture validator / Repository 或 Host admission、`world_write` streamed event、完整 authored + Episode + terminal Product projection admission。
3. primitive、diagnostic、articulated 三个合法 registry 路径不得回归；primitive ↔ diagnostic 双向错标仍拒绝。
4. 运行 targeted `product-session-codec.test.ts`、`dh011-articulated-contract.test.ts`、`product-session-client.test.ts`，再运行 `bun test`、typecheck、build、diff-check、EXharness validate。
5. 复算起止 branch/HEAD/status/manifest/aggregate，无漂移。

发现 P0/P1 才阻断；不要扩展 DH-012、UI、平台设计或新的 opportunity scan。中文结构化输出 P0/P1/P2、反例与命令证据、起止 identity、`decision`、`may_closeout`。仅 P0=0/P1=0 可 approved。
