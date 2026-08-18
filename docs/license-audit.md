# 许可审计

最后更新：2026-08-18。

声作本体源码公开可查看，但保留全部权利，不使用允许自由复制、修改或再分发的开源许可证。具体见仓库根目录 `LICENSE`。下表只审计第三方模型与运行依赖。

| 插件                     | 官方代码                      | 官方权重                   | 固定版本                                                             | 结论         |
| ------------------------ | ----------------------------- | -------------------------- | -------------------------------------------------------------------- | ------------ |
| VoxCPM2                  | Apache-2.0                    | Apache-2.0                 | `voxcpm==2.0.3`；revision `bffb3df5a29440629464e5e839f4d214c8714c3d` | 允许一键安装 |
| Fun-CosyVoice3 0.5B 2512 | Apache-2.0；Matcha-TTS 为 MIT | Apache-2.0                 | CosyVoice `074ca6d…`；权重 `29e01c4…`；Matcha `dd9105b…`             | 允许一键安装 |
| IndexTTS-2.5             | 以官方仓库声明为准            | bilibili Model Use License | 固定官方 revision 与四组辅助权重 SHA-256                             | 按条款安装   |

完整来源、revision、允许下载文件与关键 SHA-256 位于各插件 `model-manifest.json`；许可摘要位于各插件 `licenses/README.md`。安装器只下载固定官方版本，关键文件校验通过后才写入安装收据。

运行组件包括 Python 3.10/3.12、PyTorch、torchaudio、Transformers、imageio-ffmpeg/FFmpeg、Electron、React、Vite、Tailwind CSS 与 Lucide。界面随包内置华为官方未修改的 `HarmonyOS_Sans_SC.ttf`，设置页作显著使用声明，完整字体许可保存在 `licenses/HarmonyOS-Sans-LICENSE.txt`。正式公开分发前仍需随产品提供完整第三方许可文本和适用的 FFmpeg 构建许可说明。

项目不附带第三方人物声音。用户必须确认声音属于本人或已获明确授权；录音与生成结果只保存在本机。
