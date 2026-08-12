# DH-010 Phase 6 Root Authority / stale `lastRun` Remediation Evidence

## Authority 与边界

- Human 于 2026-08-11 授权 bounded root-authority representation closure 与 stale-`lastRun` lifecycle remediation；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- 本轮未获得 fresh reviewer、commit、push、PR、merge、tag、deploy、closeout 或 `mark-done` authority。

历史 `changes_requested` verdict 与 cross-review evidence append-only 保留；本文件只证明 bounded remediation candidate，不覆盖 reviewer authority。

## RED

先将两项 executable blocker 固化为真实边界测试，修复前定向结果为：

```text
38 pass / 4 fail / 266 assertions
```

新增反例覆盖：

1. `WorldRepository.write()` 在建立 `world:current` 前拒绝 registered ball-vessel floor collision extent 漂移，以及 falling-rigid floor collision extent 漂移；
2. MuJoCo compiler 在执行前拒绝 registered falling-rigid floor collision extent 漂移；
3. ball-vessel fixture 根校验拒绝 floor visual/collision extent 与 ball visual color 漂移；
4. 第一 turn 完成 `write → read → edit → run` 后，第二 turn 成功 `read → edit-only` 必须清除旧 `lastRun`，最终 Product projection 仍可解码。

## Root fix

### 单一 registered-world authority

新增唯一 repo-owned `requireRegisteredSnapshotIdentity(snapshot)`，由三个实际 authority consumer 共同调用：

- `WorldRepository.#insert()`：任何 Snapshot 进入 canonical Repository/ref authority 前闭合 registered static representation/physics identity；
- MuJoCo Runtime：falling-rigid 在 MJCF compile 前复用同一根校验；ball-vessel 继续通过同一 canonical fixture validator；
- Product codec：transport carrier 不再维护第二份 canonical entity constants，解析后复用同一根校验。

该校验只冻结已登记的静态身份，不冻结 `state/pose` 演进；diagnostic imported fixture 继续允许缺少 optional 3DGS Observation，并保留 GLB、alignment、collision proxy 与 3DGS artifact 的专属错误语义。test-only closed proxy 仍只能走 Runtime-direct seam，不能进入 Repository/Product/Agent authority。

### stale `lastRun` lifecycle

ProductSession 在成功 `world_write` 或 `world_edit` 后立即失效旧 `lastRun`；`world_read` 保留当前 run evidence，成功 `world_run` 写入新 evidence。这样静态 authored Snapshot 前进后不会继续宣称旧 Episode 属于当前 world，也没有把 edit 伪装成动态历程。

## GREEN 与完整门禁

最终定向校验：

```text
52 pass / 0 fail / 304 assertions
```

完整门禁：

```text
bun test            149 pass / 0 fail / 2,849 assertions
bun run typecheck   pass
bun run build       pass; Vite browser externalization / large chunk warning only
git diff --check    pass
EXharness validate  pass; 0 warnings
```

Deterministic artifact identity 未漂移：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

本轮 product digest（base 为 `22e288690937834135584d023e4140e26696f761`，排除 `docs/project-harness/**`，包含排序后的 untracked product manifest）：

```text
8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8
```

## 当前结论

cross-review 的 root-authority P0 与 stale-`lastRun` P1 都已有 executable regression，operator full gate 通过。历史 verdict 不被本轮实现自行改写；DH-010 继续 `doing / changes_requested`。下一步须由 Human 另行授权 fresh independent re-review；批准前不得 closeout、`mark-done`、commit 或 push。
