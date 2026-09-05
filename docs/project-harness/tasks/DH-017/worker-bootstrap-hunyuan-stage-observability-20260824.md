# DH-017 Worker Bootstrap — Hunyuan diagnostic stage observability

## 角色与目标

你是 Coding Worker。把一次性 Hunyuan terminal diagnostic 从单一 `STOPPED` 改为一个闭集的脱敏 stopped stage，使下一次获批 query 能定位最小失败层，同时保持零敏感输出和最多一次 fetch。

## cwd / authority

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- canonical plan: `docs/project-harness/tasks/DH-017/plan.md` 中 `terminal diagnostic stage-observability 修正`
- 允许修改：
  - `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/operator-diagnostic.ts`
  - `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/worker-result-stage-observability.md`
- 其他文件全部只读。

## 必须满足

1. stopped stage 只取 `input | credential | http | response | status | error-code`。
2. 不输出或持久化 exception/error message、HTTP body、URL/status number、JobId、RequestId、ErrorMessage、prompt、credential 或任何 provider scalar。
3. 全脚本仍只有一处 query `fetch`，无 submit、retry、loop、logger、framework、provider abstraction 或 product-code change。
4. `FAIL + stable ErrorCode` 的既有成功返回不变。
5. 用 injected fake credential/fetch 离线覆盖至少：credential failure、HTTP non-200/fetch reject、malformed response、WAIT/DONE、FAIL missing/invalid ErrorCode、valid FAIL、pre-abort；同时证明 fetch 最多一次。

## 禁止

- 禁止 Keychain、network、provider call、真实 Job、paid submit。
- 禁止 commit/push/merge/deploy、Git reset/clean、修改 Harness authority 或产品文件。
- 需要扩大 allowlist 或调用外部系统时立即停止并输出 BLOCKED。

## RESULT

中文为主报告：实际修改、准确命令/结果、实际 model/provider/session evidence、是否存在未验证项。不要自批、不要宣称 DH-017 完成。
