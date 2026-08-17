# 第三方许可说明

声作本体适用仓库根目录的 [专有软件许可](../LICENSE)。本目录只记录声作引用、安装或在构建阶段使用的第三方内容；这些内容不因声作的许可而改变其原始条款。

## 本地模型

| 项目                       | 代码许可           | 权重/模型许可              | 说明                         |
| -------------------------- | ------------------ | -------------------------- | ---------------------------- |
| VoxCPM2                    | Apache License 2.0 | Apache License 2.0         | 软件按固定官方版本下载并校验 |
| Fun-CosyVoice3 / CosyVoice | Apache License 2.0 | Apache License 2.0         | Matcha-TTS 部分为 MIT        |
| IndexTTS-2.5               | 以官方仓库声明为准 | bilibili Model Use License | 使用前必须遵守模型用途限制   |

每款模型的固定 revision、下载文件、SHA-256 与许可摘要位于 `engines/<模型>/model-manifest.json` 和对应 `licenses/README.md`。

## 桌面与构建组件

- Electron、React、Vite、Tailwind CSS：分别遵循其上游开源许可证。
- Lucide：ISC License。
- `@breezystack/lamejs` 1.2.7：LGPL-3.0，仅在构建阶段生成测试 MP3，不进入桌面运行时代码；本项目未修改其源码。
- Python、PyTorch、torchaudio、Transformers、FFmpeg/imageio-ffmpeg 及模型依赖：分别遵循随上游发行内容提供的许可证。

正式分发时应保留适用的第三方许可、版权和模型使用条款。第三方名称与商标归各自权利人所有，不表示其对声作提供认可或担保。
