# DH-007 Round 1 — GPT-5.6 Sol Max Executable Review

decision=changes_requested

## P0

无。

## P1

唯一 model identity 只在 OMP session 启动时核验，turn 内仍可依据 ambient retry 配置切换 model/provider。候选在 `omp-world-agent.ts` 传入 `modelPattern` 并只核验一次；锁定 OMP `17.2.12` 默认加载 ambient `Settings`，其中 `retry.modelFallback=true`，retry fallback chain 可把获授权的 `provider/model` 切换到另一 provider/model 与 credential source。事后核验不能撤销已经发生的错误 provider 调用。

要求：production composition 显式隔离 settings 并关闭 model fallback/model-switch 路径；增加 ambient fallback 反例回归，并在 prompt 完成后补 identity assertion 作为检测层。

## P2

无。

## Evidence

- `bun test --timeout 10000`：76 pass / 0 fail / 419 assertions；
- executable local-source probe 证明 `chosen/model-a` 可从 ambient fallback chain 得到 `other/model-b`；
- product digest before/after 均为 `dc90a2482be303718554c13dba6b2ec2d923684bcf3f8fca2f04cc8aaf2a8867`；
- `git diff --check` 通过，Git status 前后相同；
- 未编辑文件、未读 credential、未联网、未发送 provider prompt、未 build/commit/push/merge/deploy。

## Limitations

未运行 `smoke:sdk`、真实 provider canary 或浏览器；审查只绑定冻结源码、tests 与无网络 executable probes。
