# 第三方与素材授权说明

## 项目自有内容

除文件内或所在目录另有声明外，Demiurges 维护者有权授权的代码和文档采用根目录的 [Apache License 2.0](LICENSE)。已有独立许可的内容保持原许可。

## 演示素材：CC0-1.0

下列程序化生成素材已由既有 fixture 元数据标注为 CC0-1.0；本次增加项目级许可证不改变该授权：

| 素材 | 生成脚本 | 许可 |
| --- | --- | --- |
| packages/world/assets/diagnostic-wedge-v1.glb | scripts/generate-diagnostic-wedge-glb.mjs | CC0-1.0 |
| packages/world/assets/diagnostic-wedge-3dgs-v1.ply | scripts/generate-diagnostic-wedge-ply.mjs | CC0-1.0 |
| packages/world/assets/smooth-vessel-v1.glb | scripts/generate-smooth-vessel-glb.mjs | CC0-1.0 |

许可全文见 [CC0-1.0](LICENSES/CC0-1.0.txt)。生成脚本本身遵循项目代码许可证。

## 主要运行依赖

| 组件 | 上游 | 许可 |
| --- | --- | --- |
| Three.js | https://github.com/mrdoob/three.js | MIT |
| Spark | https://github.com/sparkjs-dev/spark | MIT |
| SolidJS | https://github.com/solidjs/solid | MIT |
| Oh My Pi coding-agent SDK | https://github.com/can1357/oh-my-pi | MIT |
| MuJoCo / MuJoCo WASM | https://github.com/google-deepmind/mujoco | Apache-2.0 |

以上是主要依赖的索引，不是完整的传递依赖清单。精确版本以 package.json 和 bun.lock 为准；各组件及其内含内容以对应版本的许可声明为准。再分发依赖或包含依赖的构建产物时，应保留所需的版权、许可证及 NOTICE 等文件。

## 外部模型与生成结果

从外部服务导入的世界、模型、纹理、3DGS、图片、视频和其他产物，须分别核对其来源、服务条款和素材授权。项目代码的 Apache-2.0 许可不自动授予这些产物的使用权，也不更改 artifact metadata 中的许可声明。提供导入能力不等于随源码分发外部产物。凭据、任务私有 Data Root 和原始 provider 日志不属于本次源码发布内容。
