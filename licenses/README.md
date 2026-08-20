# 第三方许可说明

声作本体适用仓库根目录的 `LICENSE`；正式便携包会把同一文本复制为包根目录的 `LICENSE.txt`。本目录只说明第三方组件，声作不会用自己的专有许可覆盖第三方条款。

## 随正式便携包分发的组件

`scripts/create-share-package.ps1` 会从锁定依赖的实际安装目录复制原始许可文本到 `app/source/licenses/runtime/`，并在缺失文本或版本不一致时终止打包。

| 组件                            | 锁定版本 | 许可                                                                                                       |
| ------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------- |
| Electron                        |   35.7.5 | MIT；Chromium 及其第三方通知见 `app/source/apps/desktop/node_modules/electron/dist/LICENSES.chromium.html` |
| React / React DOM               |   18.3.1 | MIT                                                                                                        |
| Scheduler                       |   0.23.2 | MIT                                                                                                        |
| Framer Motion                   |  11.18.2 | MIT                                                                                                        |
| motion-dom / motion-utils       |  11.18.1 | MIT                                                                                                        |
| Lucide React                    |  0.511.0 | ISC                                                                                                        |
| React Router DOM / React Router |    7.7.1 | MIT                                                                                                        |
| Zustand                         |    5.0.6 | MIT                                                                                                        |
| cookie                          |    1.1.1 | MIT                                                                                                        |
| set-cookie-parser               |    2.7.2 | MIT                                                                                                        |
| loose-envify                    |    1.4.0 | MIT                                                                                                        |
| js-tokens                       |    4.0.0 | MIT                                                                                                        |
| tslib                           |    2.8.1 | 0BSD                                                                                                       |
| Vite                            |    6.3.5 | MIT；上游文件同时包含被捆绑依赖的完整通知                                                                  |
| Tailwind CSS                    |   3.4.17 | MIT                                                                                                        |

界面内置未修改的 `HarmonyOS_Sans_SC.ttf`，版权归 Huawei Device Co., Ltd. 所有，依据 HarmonyOS Sans Fonts License Agreement 使用；完整条款见 `HarmonyOS-Sans-LICENSE.txt`。

## 按需下载的本地模型

基础便携包不含模型权重、Python、PyTorch 或 FFmpeg。软件只在使用者选择安装模型后下载固定版本；若把已经下载好的模型库再次分发，必须连同模型源码、Python wheel 的许可元数据和实际 FFmpeg 构建附带的许可一起重新审计。

| 模型或辅助权重           | 固定来源                                                   | 许可与限制                                                                               |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| VoxCPM2                  | `openbmb/VoxCPM2` revision `bffb3df…`；`voxcpm==2.0.3`     | Apache-2.0                                                                               |
| Fun-CosyVoice3 0.5B 2512 | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` revision `29e01c4…` | Apache-2.0                                                                               |
| CosyVoice / Matcha-TTS   | CosyVoice commit `074ca6d…`；Matcha-TTS commit `dd9105b…`  | Apache-2.0 / MIT                                                                         |
| IndexTTS-2.5             | source commit `4f8792f…`；model revision `c39ce5b…`        | bilibili Model Use License Agreement；完整中文条款见 `IndexTTS-2.5-MODEL-LICENSE-ZH.txt` |
| W2v-BERT 2.0             | `facebook/w2v-bert-2.0` revision `da985ba…`                | MIT                                                                                      |
| MaskGCT semantic codec   | `amphion/MaskGCT` revision `265c6ce…`                      | CC BY-NC 4.0，仅限非商业使用                                                             |
| CAM++ speaker model      | `funasr/campplus` revision `e4b6ede…`                      | Apache-2.0                                                                               |
| NVIDIA BigVGAN           | revision `633ff70…`                                        | MIT                                                                                      |

Apache License 2.0 完整文本见 `Apache-2.0.txt`。模型清单、允许下载文件和关键 SHA-256 位于 `engines/<模型>/model-manifest.json`。

### IndexTTS-2.5 的重要限制

- IndexTTS-2.5 的中文协议是发生冲突时的优先版本。其固定版本条款规定：前一自然月月活超过 1 亿，或上一自然年营收超过人民币 1 亿元时，需要另行申请商业许可。
- 当前安装方案还会下载采用 CC BY-NC 4.0 的 MaskGCT semantic codec 权重。该辅助权重只允许非商业使用，因此不能把当前 IndexTTS-2.5 方案表述为“可直接用于商业场景”。商业使用前必须取得额外授权，或换成许可兼容的辅助组件并重新验证。
- 不得删除模型副本中的原始版权与许可文本，不得把 IndexTTS-2.5 或其衍生品用于改进协议禁止的其他 AI 模型。

第三方名称与商标归各自权利人所有，不表示其对声作提供认可或担保。本说明是发布审计记录，不构成法律意见。
