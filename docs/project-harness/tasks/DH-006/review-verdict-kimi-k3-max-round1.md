# DH-006 Round 1 — Kimi Code K3 Max Independent Static Review

- decision：`changes_requested`
- reviewer：Kimi Code `kimi-code/k3`
- thinking effort：`max`
- session：`session_3c289ef2-a0d4-463f-92b7-2f1d4e509401`
- effective tools：`Read`、`Grep`、`Glob`；无 Bash、write、MCP、web 或 subagent tool

## P1

1. HTTP 并发 admission 存在 TOCTOU。两个慢 body 可以同时越过 `running=false` 预检；第二个 `runTurn()` rejection 被 stream `.catch(() => undefined)` 吞掉，调用方得到 `200 application/x-ndjson` 空 body。Studio parser 又允许零事件 clean EOF，并在 resync 后把 turn 标为 completed。

## P2

- 断流/abort 后错误路径没有 resync，Studio partial cache 可与继续运行的 Gateway session 分叉；
- import boundary 主要依赖 source-string tests 且扫描文件不完整；
- HTTP admission 的 content-type/body-size/409 分支未被测试；
- `turn.failed` stream clean EOF 后 App 仍可能把 runtime badge 标为 completed；
- scripted canary 的第二 turn 会在再次 `world_write` 时失败，但 UI 当前允许重复运行。

## 通过项与限制

- 静态确认 `@demiurges/world` dependency direction、single Gateway Host、四工具真实性、run/ref separation、Agent surface 无 adopt、Three.js/Episode sample 驱动均成立；
- reviewer 无 shell，未独立复算 digest 或执行 tests/build/browser；结论只基于冻结工作树的逐文件静态阅读。provider-native log 确认 `modelAlias=kimi-code/k3`、`thinkingEffort=max`、`toolCount=3`。
