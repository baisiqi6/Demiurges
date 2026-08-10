# DH-006 Round 3 — Fresh Final Cross-review Request

## Role / Authority

Independent reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-006`；严格只读。允许读取 diff/history 并运行 executable tests/probes；禁止编辑、repo-local verdict、commit、push、merge、reset、clean、PR/Issue、SSH、deploy、真实产品 provider prompt、credential 读取或输出。

Base：`7304410`。Round 1/2 verdict 永久保留，不得以本轮覆盖历史。

## Frozen candidate

Product digest：`b476912e93c8417e00e79c930597c6aa2a8711c2e3aa4e2a847f3f530cb5bff8`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：68 tests / 0 fail / 395 assertions；typecheck/build/diff/checklist 通过；真实 Chromium 已复验 success、frame 7/75 → 75/75、sanitized failure+resync 与 fresh session success。

## Round 2 必须复测

1. **Settled resync**：stream/fetch/Abort failure 后不能只读一次中间 projection；必须 bounded follow-up 到 `running:false`。若 Gateway 始终不 settled，客户端必须 fail closed，不能让 App 永久停留 stale `running:true`。
2. **Producer-aligned identity**：当前合法最长 Agent-facing runId 及其派生 Episode/terminal Snapshot/Evaluation identity 必须能被 codec 接纳；不能以任意短 ID 上界误拒合法 evidence，同时仍须受整体 plain-data/transport budget 限制。
3. **Side-effect-safe plain-data admission**：decoder 在语义读取前复制为新 data graph；sparse/accessor/non-enumerable/symbol/extra-property/非有限数值 fail closed，accessor getter read count 必须为 0。检查 Proxy/descriptor 或高复杂度输入是否仍有明显副作用/DoS 通道。
4. **Edit evidence identity**：`stale_ref` 与 `updated` 都必须保持 `ref.snapshotId === snapshot.id`；Agent-facing `world_edit` 只允许 `advance`，不得把 `adopt` 带回模型面。
5. **Failed trace redaction**：失败 product trace/event 不得复制原始 tool input；synthetic OMP、Host、path、stack、credential-like markers 不得进入 HTTP/Studio，仅稳定 `[redacted]` 与 public error code 可见。
6. **Turn budget**：合法边界 `turn.started + 128 tool events + terminal` 可接纳；第 129 个 tool 或额外 event fail closed，不能靠单行 byte budget 形成无界生命周期。

同时回归 Round 1 的原子 admission、空流/缺 terminal、UTF-8 chunk/media type、完整 Snapshot/Episode/Evaluation DTO、run 不推进 ref、single Gateway Host 与 shared-world import boundary。重点寻找同错相消与合法证据误拒，不扩展到 UI 风格或未来协议机会。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；P0/P1/P2、精确文件行和 executable evidence、digest、命令结果、limitations。中文为主体，不输出 private chain-of-thought。
