# 许可审计

最后更新：2026-08-21。

声作本体源码公开可查看，但保留全部权利，不使用允许自由复制、修改或再分发的开源许可证。具体见仓库根目录 `LICENSE`。

## 正式便携包

正式打包脚本现在执行以下发布闸门：

- 把根 `LICENSE` 和 `PRIVACY.md` 分别复制到包根目录；
- 从锁定的 pnpm 安装中复制 Electron、浏览器前端运行依赖以及 Vite/Tailwind 的原始许可文本；版本不符或缺少许可时直接失败；
- 保留 Electron 自带的 `LICENSES.chromium.html`；
- 剔除 sourcemap、Python 缓存、引擎 `test/tests` 和 Electron 的 pnpm `.bin` 命令脚本；
- 拒绝携带常见模型权重扩展名，并扫描文本文件中的 API Key 形态、Windows 用户私有路径和工作区路径；
- 顶层 `预置声音` 默认只放使用说明，不把本机声音、生成结果或模型库自动带入正式包。

## 模型与权重

| 插件                     | 官方代码                      | 官方权重                   | 固定版本                                                             | 结论                     |
| ------------------------ | ----------------------------- | -------------------------- | -------------------------------------------------------------------- | ------------------------ |
| VoxCPM2                  | Apache-2.0                    | Apache-2.0                 | `voxcpm==2.0.3`；revision `bffb3df5a29440629464e5e839f4d214c8714c3d` | 允许按固定源安装         |
| Fun-CosyVoice3 0.5B 2512 | Apache-2.0；Matcha-TTS 为 MIT | Apache-2.0                 | CosyVoice `074ca6d…`；权重 `29e01c4…`；Matcha `dd9105b…`             | 允许按固定源安装         |
| IndexTTS-2.5             | bilibili Model Use License    | bilibili Model Use License | source `4f8792f…`；model `c39ce5b…`                                  | 受专用协议与辅助权重限制 |

IndexTTS-2.5 的固定清单还下载四组第三方辅助权重：W2v-BERT 2.0（MIT）、MaskGCT semantic codec（CC BY-NC 4.0）、CAM++（Apache-2.0）和 NVIDIA BigVGAN（MIT）。其中 MaskGCT 的非商业限制覆盖当前组合的商业使用判断；在获得额外授权或替换该组件前，IndexTTS-2.5 只能按非商业能力提供，不能宣称整套方案可直接商用。

IndexTTS 中文协议为冲突时的优先版本，固定 source revision 的中文第 2.2 条使用“月活超过 1 亿或年营收超过人民币 1 亿元”的门槛。完整中文文本随仓库及便携包保存在 `licenses/IndexTTS-2.5-MODEL-LICENSE-ZH.txt`。

## 按需安装的运行环境

Python、PyTorch、torchaudio、Transformers、imageio-ffmpeg/FFmpeg 及模型依赖不在基础便携包中，而是安装模型时由 pip 或固定官方来源写入独立模型库。正常安装会保留 wheel 的 `*.dist-info` 许可元数据和上游源码许可；如果发布“预装模型/预装运行环境”版本，必须另做完整依赖清单和实际 FFmpeg 构建许可审计，不能直接沿用本次轻量包结论。

## 仍需产品层处理的风险

1. IndexTTS-2.5 当前依赖 CC BY-NC 4.0 的 MaskGCT 权重，是商业使用的实质限制；模型卡、许可弹窗和下载确认现已明确标注“仅限非商业”。发布商用方案前仍须替换该组件或取得相应授权。
2. 基础包不分发 Python/FFmpeg，因此本次只验证下载器和随包材料；预装模型库属于另一套分发物，必须单独审计。
3. 本审计基于当前锁定 revision。任何模型、权重、Python 包或 Electron 版本升级都要重新生成许可材料并复核条款。

项目不附带第三方人物声音。使用者必须确认声音属于本人或已获明确授权；录音与生成结果默认只保存在本机。本文件是工程审计记录，不构成法律意见。
