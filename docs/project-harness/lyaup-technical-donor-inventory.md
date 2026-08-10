# Lyaup 技术捐赠清单

## 审计边界

- 只读来源：`/Users/Admin/projects/Lyaup`
- 检查 revision：`cd2223df`
- 检查日期：2026-08-09
- 观察到的无关用户状态：`bun.lock` 已修改；本任务没有把它当作 authority，也没有修改、stage 或 revert。
- 本文只记录独立 requirement 与工程经验，不构成复制 Lyaup 代码或 contract 的授权。

## 已验证的技术事实

Lyaup 当前证明了以下技术可以在一个本地产品中共同工作：

- Bun workspace 与 TypeScript；
- 使用 SolidJS 与 Vite 的 Web interface；
- 使用 Three.js 的 3D scene rendering；
- 使用 `@sparkjsdev/spark` 的 3DGS-oriented Presentation；
- 通过 Emscripten filesystem 在浏览器加载 MuJoCo WASM；
- 从编译后的 MuJoCo body/geom 同步到 Three.js visual；
- GLB/OBJ/STL 类 asset handling 与 collision physicalization；
- robot import normalization 与多种 robot-specific controller；
- Episode capture 与 structured predicate evaluation；
- 使用 MuJoCo/Mink 和可选 OMPL planning 的 Python FastAPI sidecar；
- 连接 Agent tool 与浏览器仿真的 robot bridge。

## 值得带入新项目的经验

1. Browser MuJoCo WASM 足以支持第一条 closed-virtual vertical slice。
2. MuJoCo 与 Three.js 的 coordinate frame 需要一份显式、可测试的 mapping。
3. Visual mesh 与 collision mesh 必须分离。
4. WASM model/data 生命周期与重复 recompile 需要显式 disposal 和 telemetry。
5. Stable Entity identity 不能从 transient render node 或 numeric MuJoCo ID 推导。
6. Structured predicate 与 Episode evidence 比单独的视觉叙述更适合作为完成信号。
7. Robot-specific controller、planning service、3DGS 与 desktop packaging 在出现第一个真实任务前，不应进入 Demiurges。

## 不继承的结构

- OpenCode fork history 与 provider internals；
- Lyaup 当前 directory/package layout；
- 大型 session panel 及其 UI ownership boundary；
- 同时拥有 physics、Three.js visual、robot controller、grasp logic、dispatch 与 recording 的单一 Runtime object；
- 现有 robot command schema 或 prompt；
- external contract repository 与 legacy protocol precedence；
- 被包装为 universal world action 的 robot-specific capability；
- 在 planning task 出现前引入 Python planning infrastructure。

## 未来允许的复用流程

当 Lyaup 暴露出有价值的能力时：

1. 描述问题本身，不复制其 implementation shape；
2. 检查 Demiurges 是否已有真实任务需要它；
3. 识别被违反或缺失的 invariant；
4. 独立设计最小 contract；
5. 同时用 Demiurges Golden Scenario 与 Lyaup scenario 验证；
6. 只有第二个真实实现证明共同边界后，才提升为稳定抽象。
