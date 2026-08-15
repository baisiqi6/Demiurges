# DH-016 Implementation Cross-review Round 8 — Sol

- Decision：`changes_requested`
- May closeout：`no`
- P0：0
- P1：5

## Findings

1. Save As marker-only crash 会被更早的 terminal receipt 阻断。
2. existing terminal Artifact binding 未闭合 frozen registry descriptor。
3. `artifacts/sha256` 创建后 fsync 的不是其直接 parent。
4. Gateway 会把 raw filesystem code（如 `ELOOP`）暴露为 public error。
5. existing terminal 成功确认后不清理原 attempt/candidate。

## Evidence

- Focused：72 pass / 0 fail / 351 expect。
- Frozen product aggregate：`c2da0a1de0362b5608edaeef39a3efaf47ac5fbbce4dc35ea4f70ecae7990882`，起终无漂移。

