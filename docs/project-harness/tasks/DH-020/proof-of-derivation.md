# DH-020 推导证明

状态：`offline-derived`；整体 checkpoint 仍为 `offline-proven`。

- 输入：DH-019 golden `world_read` 与 `world_run` first-fail bytes。
- read canonical digest：`0595999e413f1c85fc7ae7c162581d96d60b4aa92db3a44b524a01ad98e55acb`。
- first run canonical digest：`0cff4c8b8948864357a717d16ba86eea0761578884747bde68f936f0d8fa05a2`。
- 推导 policy：registered two-link fixture，固定 elbow-down branch，15 位 angle canonicalization；输出 canonical Program digest：`46fa1ae3381ae8cd45d894b0478dd9a24ca6e2328924e657b0a675594b06813a`。
- 几何检查：candidate FK residual 在 `1e-9 m` 内；planner 只返回 candidate，不生成 PASS Evaluation，也不把 candidate 当成功。candidate 经既有 `WorldToolSurface.run` 重放后，Evaluation 才为 `PASS`；Ref 仍为 `snapshot:edit-1` / version `2`。
- provider calls：`0`。planner 不调用 OMP、provider、Keychain 或 network。

这些 digest 只证明当前输入与 DH-019 golden bytes 相等，不证明摘要来源是真实工具调用；候选本身不被视为成功，成功只来自第二次 Runtime/Evaluation。
