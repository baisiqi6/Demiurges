# DH-007 — Frozen Independent Cross-review Request

## Role / Authority

Independent reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-007`；严格只读。允许读取目标 diff、本 slice canonical docs、本地锁定 OMP package source，并运行不会修改 product source 的 executable tests/probes。禁止编辑或创建文件、读取 credential、发送真实 provider/model prompt、联网、build、commit、push、merge、reset、clean、deploy 或调用外部 coding agent。

Base：`a570064a7292821166fd65f074577a22b0390c14`。

## Frozen candidate

Product digest：`dc90a2482be303718554c13dba6b2ec2d923684bcf3f8fca2f04cc8aaf2a8867`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：76 tests / 0 fail / 419 assertions；typecheck、build、diff-check 通过；no-prompt SDK smoke 为 OMP `17.2.12` + exact four tools；真实 Chromium scripted fixture 为 `world_write → world_read → world_edit → world_run`、76 samples、中间 replay frame、PASS、current ref `snapshot:edit-1 / v2`，fresh session 清空，browser console/errors 为空。

## Focused blockers

1. Production composition 必须在 `Bun.serve` 前强制唯一 `DEMIURGES_OMP_MODEL=provider/model`，不得 ambient fallback；OMP 创建后必须核验实际 `session.model.provider/id`。scripted client 只能由 tests/显式 test fixture composition 引用。
2. Demiurges 不得接收、复制、记录或传输 credential；provider/internal/path/Host 错误只允许变成 bounded public product code。审查不得读取真实 credential。
3. Model-facing surface 仍必须恰好四工具，mounted 为空，无 `adopt`、MCP、slash/control、`@file`、filesystem/bash/coding tools。
4. 一个 Studio `runTurn()` 必须只有一个 absolute wall-clock deadline，覆盖 POST fetch、NDJSON body、成功 final GET、失败 settled resync 与 caller abort；每阶段只能消费剩余 budget。忽略 `AbortSignal` 的 port/stream 也必须 bounded reject，超时后不得继续向 sink 投递 event。
5. exact 512-char runId 必须被 producer、派生 identity 与 product codec 接纳；513-char model input 必须在 `WorldToolSurface.run` 前 fail closed。
6. 中间 failed tool 可以被 Agent 修正并最终 `turn.completed/PASS`；terminal event 才是 turn outcome authority。current ref 仍属于 authored Snapshot，run 不推进 ref。
7. 禁止把 no-prompt smoke、scripted fixture 或 injected fake 误称为真实模型成功。真实 canary 仍需 Human 对唯一 model、credential source、一次调用、deadline 与费用单独授权。

既有 axe contrast debt 与关闭 Vite 时一次 ResizeObserver dev diagnostic 不属于本 slice；除非能证明由当前 diff 引入或破坏 Agent/evidence correctness，否则不得扩张为 UI 重构。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；随后列 P0/P1/P2（无则写“无”）、精确文件行与 executable evidence、digest before/after、命令结果、limitations。中文为主体，不输出 private chain-of-thought，不写 repo-local verdict。
