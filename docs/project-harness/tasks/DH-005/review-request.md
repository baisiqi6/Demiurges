# DH-005 Final Fresh Independent Cross-review Request — Round 4

## Frozen boundary

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-005`
- Branch：`agent/codex/DH-005`
- Base：`main@f24b2d7f9df59fdda01b7197bee11a6a3e5d463e`
- Product source digest：`1b3b6496f1f27fe7bd89f0db105f60745e027108922507eb3301f7f1ca594dae`
- Prior combined verdicts：Round 1/2/3 均为 `changes_requested`

只审查上述 digest；严格只读，不发送产品模型 prompt，不执行发布动作。

## Final P1 remediation

1. `requireBoundedToolInput()` 是否使用 `Reflect.ownKeys` 与 own data/enumerable descriptors，且在读 value 前拒绝 symbol、accessor、non-enumerable、array、non-plain object 与 `__proto__`？
2. hidden accessor regression 是否证明 getter reads=0、surface calls=0？超长 key regression 是否证明 surface calls=0？
3. trace object key 是否先被 budget 截断再作为 own property 写入 null-prototype object；1 MiB key 的 serialized trace 是否小于 8 KiB、含 truncation marker、不含原 key？
4. trace node/char budget 是否整个 turn 共享；128-call limit、normal falling-cube trace、failure trace、JSON-safe/deep-freeze 与 cleanup separation 是否仍成立？

## Authority regression

- pre-client admission；SDK restricted session；active/enabled exact four、mounted empty；MCP/extensions/skills/rules/IRC/LSP/session persistence 关闭；
- installed OMP manifest `17.2.12`；四工具只委托 `WorldToolSurface`；无 Host/Repository/evidence writer/advance/adopt；run 不推进 ref；
- 文档不宣称 Studio 已连接或 live provider 已验证。

## Bounded commands

```bash
find apps/studio/src apps/agent-gateway/src -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256
bun test
bun run typecheck
bun run build
bun --cwd apps/agent-gateway smoke:sdk
git diff --check
.artifacts/harness/harnessctl validate
```

预期：48 tests / 0 fail / 304 assertions；所有 gate 通过；digest 精确匹配。只输出 P0/P1/P2 与 `approved|changes_requested`，不扩展 UI/未来架构。
