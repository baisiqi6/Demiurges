# DH-006 Round 1 — GPT-5.6 Sol Max Independent Executable Review

- decision：`changes_requested`
- reviewer：`gpt-5.6-sol`
- reasoning effort：`max`
- product digest：`20ed24ff354f9ac178d8aef2560f959f44ef12bc984dcfc64f20503af28c755a`（review 前后精确匹配）

## P1

1. 并发 HTTP admission TOCTOU：两个受控 streaming body 同时释放时，结果为一个 `200/6 lines` 与一个 `200/0 lines`，竞争失败没有 409 或 failure event。
2. Studio 把空 200 NDJSON 当作成功；收到部分 events 后断流时不执行 resync，probe 为 `calls=1`，partial presentation cache 保留。
3. Studio transport admission 过浅：接受跨 session turnId、负 trace sequence、outer tool 与 evidence tool 错配，以及 malformed/2.5M projection；伪造 content-type substring 也被接受。
4. HTTP byte/content-type bound 可绕过：chunked 6013 characters / 18013 UTF-8 bytes 在 16384-byte limit 下仍返回 200；`application/jsonp` 同样被接纳。
5. internal/provider error 只截断不脱敏；synthetic error 中的 `RuntimeMvpHost`、private path 与 synthetic apiKey 原样进入 `turn.failed`。

## 独立证据

- `bun test`：56 pass / 0 fail / 340 assertions；
- typecheck、build、`git diff --check 7304410 --`、checklist validation 通过；
- exhaustive 141 个 UTF-8 NDJSON single-byte split 均通过；
- 未运行真实产品 provider prompt、未读取 credential、未编辑或执行 Git mutation。

## 已确认通过

`@demiurges/world` import 方向、Gateway 私有单 Host、四工具真实委托、run 不推进 ref、Agent 无 adopt、Three.js cleanup 与 Episode 从 sample 0 播放均未发现阻断反例。
