# DH-010.1 Independent Review Round 1

- Decision：`changes_requested`
- `P0=0`、`P1=1`、`P2=0`
- `may_closeout=no`
- Frozen aggregate before/after：`6bc13dfec1c33927105bfa29fbc47ac2f95dc3d47a60732ecb1ccc98ebb20465`
- Gates：focused `12/0/38`、full `151/0/2,863`、typecheck/build/diff/EXharness 均通过；branch/HEAD/status 未漂移。

## P1：跨引擎 probe lifecycle 无 wall-clock bound

`decodeWithNodeV8` 启动 Node child 后直接等待 `child.exited` 与 stdout/stderr；probe 无界读取 stdin，且 `createServer`、`ssrLoadModule`、`vite.close` 没有 deadline。若 Node/Vite SSR 卡住，focused/full gate 可永久悬挂；正常路径的 `finally close` 不能覆盖永不 settle 的 await。

要求：

1. 给 parent child 建立固定 deadline，超时后终止并等待回收；
2. 限制 stdin UTF-8 bytes；
3. 给 probe 的 stdin、Vite create/load/close 建立 bounded lifecycle；
4. 增加模拟 hung child/server 的 regression；
5. remediation 后使用新 digest 和 fresh reviewer，不覆盖本轮历史。

其余检查通过：Bun→JSON→V8 路径真实；canonicalization 位于共享 evaluator；两个 evaluator 的 `passed` 使用 canonical continuous values；threshold-near、`-0`、non-finite 与 transport/identity/discrete/physics/ref/representation drift 均符合预期。
