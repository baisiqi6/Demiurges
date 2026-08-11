# DH-007 Findings

## Confirmed before activation

- `apps/agent-gateway/src/main.ts` 当前调用无参数 `createProductSessionApi()`。
- `createProductSessionApi` 当前默认参数是 `createScriptedAgentClientFactory()`，所以已发布产品仍是 scripted canary。
- `OmpWorldAgent` 已存在 `createDefaultOmpAgentClient` composition seam；DH-007 应复用它，不复制或 fork OMP。
- Product Session 已经通过 `OmpAgentClientFactory` 注入 client，tests 可以继续使用 scripted/fake client，不需要 runtime mode flag。
- DH-006 Round 4 的两项非阻断 P2 中，成功 path POST/final GET deadline 在真实 provider 接入后成为本 slice 的前置正确性边界；exact 512-char `runId` 正例也应一并落测。

## Authority boundary

- 当前未获授权读取 credential value、发送真实 prompt 或产生模型费用。
- 可以检查本地 package source、类型与配置字段；任何环境检查只允许记录配置名/存在性，不输出 secret value。

## Pending discovery

- 锁定 OMP SDK `17.2.12` 的 `CreateAgentSessionOptions` 原生支持 `model`、`modelPattern`、`thinkingLevel`、`getApiKey`、`authStorage`、`modelRegistry` 与 absolute `deadline`。
- SDK 文档示例允许用 `model` 直接注入精确 `Model`，或用 `modelPattern` 延迟解析；未显式指定时会从 settings/first available 选择，这种 ambient 行为不适合作为 Demiurges production contract。
- `AgentSession.model` 可在 session 创建后读取，因此可以 fail closed 核验实际 `provider/id` 与显式选择一致，而不读取 credential value。
- `ModelRegistry` 拥有 credential-aware catalog 与 resolver，但直接把它提升为 Demiurges 抽象会扩大范围。当前更小的 seam 是：Demiurges 接受一个严格 `provider/model` selector，传给 OMP，并在 session state 上核验实际 identity。
- credential 默认由 OMP `discoverAuthStorage(agentDir)` / registry resolver 管理；DH-007 不应复制 secret storage，也不应把 key 注入 Product Session contract。
- `modelPattern` 是 explicit model request；若无法解析，SDK 不会静默走 ordinary default-model fallback。Demiurges 仍需在 session 创建后比较 `session.model.provider/id`，避免模糊解析或 metadata refresh 产生 identity drift。
- Production entry 应要求 `DEMIURGES_OMP_MODEL=provider/model`；缺失或非法值在 `Bun.serve` 前 fail closed。第一版不增加 provider registry、model picker、fallback chain 或 credential env name。
- Baseline：71 tests / 0 fail / 403 assertions；typecheck 与 Gateway/Studio build 通过。Vite 只保留既有 MuJoCo browser externalization 与 `>500 kB` chunk warning。

## Search errors

- 一次只读 `rg` 使用了 zsh 未命中的 `model*` glob，产生 `no matches found`；随后改用精确 `src/config/model-registry.ts` 路径，没有重复该命令，也没有文件改动。

## RED evidence

- 旧 `ProductSessionClient` 的第二构造参数只约束 `settled resync`；POST stream 与成功后的 final GET 没有内部 wall-clock budget，且 fake port 忽略 signal 时会永久 pending。
- `Episode` 的原始 run identity 位于 `episode.explicitInputs.runId`；Episode、terminal Snapshot 与 Evaluation 的派生 ID 则编码该 identity，因此 512 正边界应同时从 producer 和 codec 验证。

## Implemented contract

- Product API 不再拥有默认 Agent 实现；composition root 必须显式提供 `OmpAgentClientFactory`。因此 production 与 test fixture 的区别存在于 composition，不进入产品 DTO、endpoint 或 runtime flag。
- production selector 只承载公开的 model identity，不承载 credential；Gateway 传入 OMP `modelPattern` 后核对实际 `provider/id`，从而避免 ambient default 或模糊匹配静默漂移。
- Studio turn deadline 是一次 `runTurn()` 创建的单一 absolute time；每个 POST/stream/GET/resync 阶段只消费剩余 budget，不会在 failure resync 时重新获得一段新 timeout。
- 浏览器 QA 需要独立端口以避免碰触仍由 DH-006 worktree 占用的 `5173/8787`；Vite dev proxy 因此接受 `DEMIURGES_GATEWAY_URL`，production build contract 不读取它。
