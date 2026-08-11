# DH-008 Round 3 — Final Terminal Identity Review

## Role / Authority

Fresh final reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；严格只读。允许读取 prior request/verdict/current delta 并运行 no-network targeted tests/probes；禁止写文件、build、联网、credential、真实 prompt、commit/push/reset/clean/deploy/其他 agent。不得读取另一 Round 3 reviewer 输出。

Base `ac293318c8a6b2fe7433146df7417cc3c83e2726`；frozen digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7`。

Focused close：

1. JSON round-trip 后伪造 `terminalSnapshot.id = baseSnapshot.id` 必须 fail closed；合法 producer terminal ID 必须仍通过。
2. 回归 Round 1 exact EntityRef/representation/state/baseRef closure，确认新增 terminal identity 检查未产生旁路或 alias-only 行为。
3. Studio 只有 selected Entity 的 active sample state 存在时才标记 `episode-frame`；缺失时不得回退 authored state或误标 source。
4. 复算 digest before/after；只报告 current focused scope 内的 executable P0/P1/P2，不再扩展 non-goal。

Operator gate：98 tests / 0 fail / 523 assertions；typecheck、production build、`git diff --check` 通过。未 credential、真实 prompt、commit/push。

输出首行严格 `decision=approved|changes_requested|blocked`，随后 P0/P1/P2、证据、命令、digest、limitations；不写 repo verdict。
