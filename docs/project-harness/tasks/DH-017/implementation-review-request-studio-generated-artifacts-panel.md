# DH-017 implementation review request — Studio 只读 Generated Artifact 面板

## Reviewer posture

从产品发心独立只读审查：用户应能看见并下载完整 verified generated set，同时清楚知道它仍然缺少 World calibration，绝不能被 UI 暗示或操作为已进入 Snapshot/Entity/viewport。以第一性原理和奥卡姆剃刀为准，优先发现真实 authority/状态/可访问性问题，不要求通用前端框架或复制上游 durable join 测试矩阵。

不要读取 Worker RESULT/session/messages、current review packet、历史 reviewer output 或 review notes。先读本 request、implementation request、canonical DH-017 plan relevant sections、实际 Studio client/component/tests、Gateway safe DTO 与现有 App/CSS。保持只读；无网络/provider/credential/Git mutation。

## Product question

这个面板是否仅消费 safe list API，在 loading/empty/error/list/refresh 中保持 bounded、无 stale overwrite，并把 `VERIFIED` 与 `CALIBRATION MISSING` 同时准确呈现，而没有引入 generation、World、viewport 或 Agent authority？

## Mandatory checks

1. Client runtime decode 是 closed safe DTO，不接受 raw path/URL/provider body，malformed response 不产生 partial UI truth。
2. Mount 单次 fetch + explicit refresh；abort/stale response ordering正确，无 timer/retry/background poller。
3. Download href 只从 exact encoded `generationId + assetId` 构造；渲染 list 不下载 member bytes。
4. Marble/Hunyuan provider、role、format、member order/cardinality与 list cap一致，unknown/drift fail closed。
5. UI完整覆盖 loading/empty/error/list；error不显示 raw server/stack/provider/filesystem message。
6. `VERIFIED` 与 `CALIBRATION MISSING` 同时可见且非仅靠颜色；文案不暗示 alignment/physics/world-ready。
7. 无 auto-place、ThreeViewport injection、Snapshot/Entity/World Project mutation、generation trigger或第五个 Agent tool。
8. 语义 heading/list/button/link、focus、disabled/loading、aria-live/alert满足现有组件尺度；没有不必要动画、新依赖或设计系统漂移。
9. 实现保持直接：无 cache/store/repository/hook framework/generic API client；复用现有 Studio CSS/token。
10. focused tests覆盖 legal list、malformed response、stable error、abort/stale ordering、encoded href和zero-world/zero-member-fetch边界；相邻 Studio/Gateway regressions保持。

## Verification/verdict

运行 focused tests、Studio/root typecheck 与 proportionate full/build gates。返回 `decision`、`may_advance`、P0/P1/P2、最小修复、实际命令/结果和边界 attestation。发现 P0/P1 立即报告，再完成 bounded closure；如果 clean，明确 P0/P1/P2=0。
