# DH-015 Implementation Review — Round 5

## Combined decision

- decision: `changes_requested`
- may_closeout: `no`
- P0: 0
- P1: 1
- P2: 0

## Reviewer evidence

- 第一顺位 Sol Max：`changes_requested`。可达 P1 为 authoring command pending期间 gizmo仍可接收输入并改变本地 PoseDraft，导致已发送 pose与界面 readout分叉。
- 第二顺位 ZCode direct CLI：`approved`。provider-native rollout证明 actual model为 `GLM-5.3`；`Max` variant无法由runtime独立证明，标记 `UNVERIFIED`。本地 direct CLI结果不冒充 Coordinate managed receipt。
- 两者均复算 frozen 25-file aggregate `451aec4da905f93456a62dae9d3fba72ef08ad00fa4d1c8df0607d614c96a947` 且起终无漂移；full gate为 `508 pass / 0 fail / 3630 expect()`。

## Remediation

- 新增 `poseDraftInputEnabled` 边界，把 authoring busy传入 viewport。
- busy时统一 release active drag、disable/detach gizmo并隐藏 draft wrapper；settled后才允许重新 attach。
- gizmo `objectChange` 与 App draft mutation双重拒绝 busy期间的迟到输入。
- 新增 pending authoring ownership regression；完成 full gates后进入 fresh Round 6。
