# DH-012 实施结果

## 结论

DH-012 的 bootstrap 已完成，Demiurges Operator 已具备独立、最小的 Coordinate Remote MCP 权限。
本任务没有创建 Discord channel；频道创建与绑定仍交还 Demiurges 项目自己的 Operator。

## 已完成

- 从当前 EXharness template 实例化 ignored、可重建的 `.artifacts/harness/`，并通过
  `validate`、`doctor` 与 `state`。
- production Coordinate 注册：
  - workspace：`demiurges`
  - coding host：`macbook-local`
  - principal：`demiurges-codex-operator`
- principal exact grants：
  - tool：`coordinate.channel_create`
  - workspace：`demiurges`
  - platform：`discord`
- 独立 token 明文只存于 macOS Keychain；production policy 只保存 SHA-256 digest。
- 本机使用 `codex mcp add coordinate_demiurges ...` 注册 Remote MCP，并由
  `/Users/Admin/.local/bin/codex-demiurges` 从 Keychain 注入环境变量。
- authenticated Remote `tools/list` 返回 HTTP 200，工具集合精确为
  `['coordinate.channel_create']`。

## 生产 mutation receipt

- zero-inflight：running=0、pending=0、active leases=0、established 8766=0
- MCP service：`active`
- mutation lock 收尾：`free`
- policy backup：`/etc/coordinate/mcp-http-clients.json.bak.demiurges.20260813T091725Z`
- DB backup：`/var/lib/coordinate/coord.sqlite3.bak.demiurges.20260813T091725Z`
- policy SHA-256：`6b893a79f7b64d9d72c779dbd5d35d5f29a2f6e627aab61215dcbf81ce4733db`
- token fingerprint：`f8f234bdb088`

完整脱敏 receipt 位于 myharness：
`projects/demiurges/tasks/DH-012-coordinate-bootstrap/`。

## 关键验证

- workspace / host profile / principal exact read-back：通过
- Remote `tools/list`：HTTP 200，精确 1 tool
- `channel_bindings WHERE workspace_id='demiurges'`：0
- `harnessctl validate`：0 warnings
- `harnessctl doctor`：通过；`init.sh` 与 `harness-config.json` 为既有 optional miss
- `bash -n` / Python compile / `git diff --check`：通过

## 配置事实修正

计划最初拟使用 project-local `.codex/config.toml`。本机 Codex CLI 0.145.0 实测只读取
`~/.codex/config.toml`，没有加载该 worktree 配置，因此已删除无效 project-local 副本，改由官方
`codex mcp add` 管理本机 entry。此修正没有新增第二套 credential 或 runtime。

## 交还给 Demiurges Operator

启动新的受控 Codex task 后，调用：

```json
{
  "input": {
    "workspace_id": "demiurges",
    "channel_name": "demiurges",
    "idempotency_key": "demiurges-channel-create-v1"
  }
}
```

若返回 `pending`，只可用完全相同输入重放；不得换 key 或使用 SSH/Discord 旁路。
