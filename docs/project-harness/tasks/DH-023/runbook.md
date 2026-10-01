# DH-023 离线任务运行手册

## 启动

在仓库根目录执行（使用已有依赖）：

```sh
bun run dev:offline
```

在另一个终端启动 Studio：

```sh
bun run dev
```

Gateway 默认监听 `127.0.0.1:8787`，Studio 使用现有 Vite `/api` proxy。若需独立端口，分别设置 `DEMIURGES_GATEWAY_PORT` 与 `DEMIURGES_GATEWAY_URL`。production 的 `dev:gateway` 仍使用显式 OMP 配置；离线入口不会替它选择模型。

## 完成任务

1. 点击“开始球与容器任务”。初态来自 registered fixture，容器/floor/geometry/physics 不可在本任务中更改。
2. 把球的位置设为 `(1, 0, 1)` m，点击“应用初态”。允许 x/y∈[-2,2]、z∈[0.7,2]。
3. 点击“运行并评估”，查看 FAIL、指标与 Episode 回放。运行不会把 terminal Snapshot 变成当前世界。
4. 点击“预览修复”，核对建议 `(0, 0, 0.7)` m。此时 Ref 和 Snapshot 保持不变。
5. 点击“应用修复坐标”，再点击“运行并评估”。成功由 stable-inside Evaluation 的 PASS 判定。
6. 使用“最近两次运行”分别回放 FAIL/PASS，比较指标。历史回放显示自己的初态版本，当前 world Ref 仍显示最新版本；“返回当前世界”退出历史回放。

## 错误与恢复

- 越界或空数值会提示合法范围，不发出 edit。
- 应用新初态或产生新运行后，旧预览被清除。不得把旧候选的 expected Ref 改写为最新 Ref；Gateway 会拒绝 stale_ref。
- 评估已通过时不会生成修复；初态刚更新但未运行时需先运行。
- 断线后先取得 settled projection。若恢复查询也失败，Studio 清除旧 authority 和候选；点击“新建 Session 重新开始”。
- request abort 不代表 MuJoCo 已停：session 在 Runtime settle 前保持 busy。

当前为内存 Session。刷新、重启 Gateway 或新建 Session 会丢失这份浏览器任务记录；本任务不支持 WorldProject v1 保存/导入。

## 验证命令

```sh
bun test apps/agent-gateway/src/ball-vessel-task.test.ts scripts/dh021-ball-vessel-pose-repair.test.ts packages/world/src/dh010-ball-vessel-contract.test.ts
bun run typecheck
bun run build
.artifacts/harness/harnessctl validate
```

验收详情见同目录 `result.md`、`browser-acceptance.json`、`implementation-review.md`。这些材料描述本任务的离线边界，不授予 live provider 或 production deploy authority。
