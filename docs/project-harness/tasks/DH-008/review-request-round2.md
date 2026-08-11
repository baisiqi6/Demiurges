# DH-008 Round 2 — Evidence-chain Remediation Review

## Role / Authority

Fresh independent reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；严格只读。允许读取 Round 1 request/verdict、current delta 与本地 source，并运行 no-network tests / in-memory executable probes。禁止编辑或创建文件、读取 credential、真实 provider prompt、联网、build、commit、push、merge、reset、clean、deploy 或调用其他 agent。不得读取另一 Round 2 reviewer 输出。

Base：`ac293318c8a6b2fe7433146df7417cc3c83e2726`。Round 1 verdict 永久保留。Frozen candidate digest：`f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910`。

```bash
{ printf '%s\0' package.json bun.lock; find apps packages scripts -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' -o -name '*.glb' -o -name '*.mjs' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

## Blockers to close

1. 每个 Episode sample 的 state keys 必须与 authored Snapshot EntityRef 集合精确一致；missing/extra/renamed ref 全部 fail closed。
2. terminal Snapshot 必须保持相同 EntityRef、label、frame/units、visual/collision representation 与 physics；terminal states 必须精确对应最后 sample。
3. projection `lastRun.baseRef` 必须精确绑定 current `world.ref/snapshot`；world null 时不得接纳 lastRun。
4. streamed `world_run` 在交给 Studio sink 前必须绑定本 turn 已接纳的 authored world（initial projection 或 read/write/edit evidence），不能只依赖 final resync。
5. ThreeViewport 与 Inspector 在 Episode state 缺失时不得回退 authored Snapshot 并继续标记 `episode-frame`。
6. 复测 Round 1 四类反例：spoofed sample key、renamed terminal ref、terminal representation drift、base-ref version drift；再探测 events、terminal-last-sample、world null、stream context 的邻近可执行绕过。

Operator gates：98 tests / 0 fail / 522 assertions；typecheck、production build、`git diff --check`、GLB digest 通过。真实 Chromium remediation acceptance：asset `loaded`/`entity:cube`，Episode 1.43 s → 2.50 s，PASS；reset 后 asset/ref/Episode/Evaluation 清空，console 仅 Vite debug。

未读取 credential、未发送 provider prompt、未 commit/push。只报告当前 remediation 范围内有可执行证据的 P0/P1/P2，不扩展 non-goal。

## Output

首行严格 `decision=approved|changes_requested|blocked`；报告 P0/P1/P2、精确文件/行号或 executable counterexample、digest before/after、命令与 limitations。中文为主体，不写 repo-local verdict。
