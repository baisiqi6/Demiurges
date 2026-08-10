# DH-006 Round 1 — Independent Cross-review Combined Verdict

## Decision

`changes_requested`

Kimi Code K3 Max static review 与 GPT-5.6 Sol Max executable review 在同一冻结 candidate 上一致认为并发 turn admission 的空 `200 NDJSON` 为阻断问题。Sol 进一步复现断流不 resync、DTO/lifecycle admission 过浅、UTF-8 byte bound 与 content-type 绕过、internal error 泄露。任一 P1 都阻断 closeout，因此不得 `mark-done`、commit 或 push。

## Root-fix direction

本轮不逐点叠加 UI patch，而是补齐一个完整 transport boundary：

1. Product Session 在构造 200 stream 前完成原子 turn reservation；
2. 产品 contract 对 event lifecycle、turn/session identity、tool/evidence association、projection DTO 与总预算做 fail-closed admission；
3. clean EOF 必须包含 terminal event，任何断流/parse/abort failure 都执行权威 resync，并让 App 用 resync projection 替换 partial cache；
4. HTTP body 按真实 UTF-8 bytes 流式限额，media type 精确解析；
5. transport 只输出稳定 public error code，不转发 OMP、Host、path、credential 或 stack message。

修复后重新计算 product digest并发起 fresh focused cross-review；Round 1 verdict 永久保留，不被后续批准覆盖。
