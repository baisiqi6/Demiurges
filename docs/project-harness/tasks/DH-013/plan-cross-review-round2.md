# DH-013 Plan Cross-review — Round 2

## 结论

- Sol：`changes_requested / may_implement=no`，P1=2；
- DeepSeek V4 Pro Max：`approved / may_implement=yes`，P1=0；
- Operator decision：**不进入实现**。交叉审查不是多数投票；只要一个 fresh reviewer 给出可执行 P1，plan gate 就不成立。

## 采用的修订

1. 把原本两条概念级 calibration 拆成三个逐资产、完整 literal `CalibrationRecord v1`；
2. 冻结 scenarioId 与三个 EntityRef；
3. 冻结 Marble pair、Hunyuan box、authored floor 三类 witness 的 exact data、metric、measured、tolerance 与 truth level；
4. 增加逐 witness 的 source/calibration/proxy/tolerance 独立 tamper matrix；
5. 采用 DeepSeek 的非阻断建议：Hunyuan auth header、composite identity 与双 digest witness 都在 Round 3 前闭合。

## Gate

Round 3 两名 fresh reviewer 都给出 `approved` 且 P0/P1=0 前，不得修改产品 source。
