# DH-010 Phase 4 工作记录

## Authority

- Human 已授权进入 Phase 4 headless implementation；不进入 Phase 5 UI，不 commit/push/PR/merge/tag/deploy，不 close/mark-done。
- 当前 owner/session：`codex` / `dh010-phase1-20260811`；branch：`agent/codex/DH-010`。

## RED baseline

- `bun test packages/world/src/dh010-ball-vessel-contract.test.ts`：6 pass / 6 fail。
- 六个 RED 分别覆盖 stable-inside happy path、hover/sidewall/transient negatives、timestamp/penetration、closed proxy Evaluation、closed policy registry、Product codec/contact evidence。

## Evaluation / policy progress

- `EvaluationRecord` 与 `SuccessContract` 已提升为两个真实 scenario 的 exact closed union。
- stable-inside evaluator 使用 exact 0.5s/16-sample 30Hz tail、每帧状态、world-up semantic support 与 pair-attributed penetration；结构 drift fail closed，合法未达标 evidence 返回 `passed=false`。
- Host 使用冻结的两-entry AdoptPolicy registry；Repository 不再接纳 caller-supplied single policy，并验证 Episode Program 与 policy entry 一致。
- canonical Runtime 最初在尾窗出现 `0.062m/s` 最大线速度，高于冻结的 `0.02m/s` contract。第一次将 `<freejoint>` 改为带 `align` 的 `<joint type="free">` 被 MuJoCo schema 拒绝；删除 joint 不支持的 `align` 后，以 `damping="0.05"` 让真实 ball-vessel Runtime 达到 PASS，同时保持 contract 不放宽。

## Remaining

- Product Session codec 仍固定 floor/cube carrier，尚未接纳 exact floor/vessel/ball、sample contacts 与 stable-inside Evaluation。
- 完成 codec 后补 adversarial closure probes、full test/typecheck/build/diff/harness evidence。

## Codec 与 full-gate 进展

- Product codec 现以 exact 两-scenario closed union 验证 floor/cube 与 floor/vessel/ball；ball-vessel 分支闭合 registered visual/compound/semantic、91-sample/30Hz grid、semantic contact pair、terminal lineage、Program/Profile/Evaluation identity。
- 新增对 internal `partKey` leakage、错误 EntityRef pair、非单位/稀疏 normal、负 penetration、timestamp drift 与 Program/Evaluation alias 的 executable rejection。
- 首轮 full gate：`130 pass / 0 fail / 2778 assertions`，但 Studio typecheck/build 因 `EvaluationRecord` 成为 closed union 后仍直接读取 landing-only metrics 而失败。最小修复只在现有 UI 中对 `success:stable-on-floor` 做 type narrowing；不增加 vessel UI 或进入 Phase 5。
- 首次实例化临时 harness runtime 时，通配 `cp` 遇到 template `__pycache__` 目录并报告未复制；实际脚本、`update-item`、state 与 validation 均成功。随后改用 `find -type f` 复制，避免重复该错误。
- 最终 diff 复核移除了第二个 scenario 已出现后仍存在的 `evaluateLanding` 偶然命名：module/test/public API 统一机械改为 `evaluateEpisode`，不保留 compatibility alias。全量 gate 重跑仍为 130/0/2,778；最终 product digest 因该根部命名收敛更新为 `c893c0641d075f9080b1e977a582c0eb5ee5270fcb7129ccf3cb739680b42374`。
