<p align="center">
  <img src="apps/desktop/public/brand/app-icon.png" alt="声作" width="108" />
</p>

<h1 align="center">声作</h1>

<p align="center"><strong>让自己的声音，成为作品。</strong></p>

<p align="center">
  Windows 本地声音克隆与配音工作台<br />
  无账号、无会员、无遥测，录音与文稿默认留在本机
</p>

<p align="center">
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-3b82f6" />
  <img alt="版本 1.0.2" src="https://img.shields.io/badge/version-1.0.2-22a67a" />
  <img alt="本地运行" src="https://img.shields.io/badge/voice-local--first-60a5fa" />
  <img alt="保留全部权利" src="https://img.shields.io/badge/license-All%20Rights%20Reserved-64748b" />
</p>

![声作界面预览](docs/images/声作-界面预览.png)

## 下载

前往 [Releases 下载最新 Windows 便携版](https://github.com/soberbw-hash/shengzuo/releases/latest)。

下载后完整解压，双击 `启动.cmd`。不要在压缩包预览窗口中直接运行，也不要只复制其中一个 EXE。首次使用时在“本地引擎”选择并下载模型；Python、FFmpeg、运行依赖和官方权重均由软件准备。

> Windows 程序目前没有商业代码签名。系统策略拦截 EXE 时，仍可使用包内唯一入口 `启动.cmd`。

## 它能做什么

| 功能       | 用途                                                     |
| ---------- | -------------------------------------------------------- |
| 单段配音   | 选择克隆声音，输入口播、旁白或台词，生成并导出 MP3       |
| 字幕配音   | 导入 SRT/TXT，按句编辑、逐句缓存，最终合成一条完整音轨   |
| 多人对话   | 给不同角色分配不同声音，按顺序合成长音频                 |
| 项目与记录 | 保存稿件、模型、声音和参数；按日期试听、收藏、导出或删除 |
| 本地引擎   | 下载、暂停、续传、换源、离线导入和迁移模型               |
| 检查与修复 | 检查 Worker、模型、FFmpeg、权限和硬件，导出脱敏诊断包    |

长字幕和多人对话按句缓存。中途失败、取消或重新打开软件后，只需要重做失败、缺失或修改过的句子。任务可以连续提交，在后台按顺序生成。

## 一分钟开始

1. 打开“本地引擎”，不知道选哪个就下载 **VoxCPM2**。
2. 打开“我的声音”，选择或直接拖入 3–60 秒清晰录音，填写录音中实际说出的原文。
3. 回到“开始创作”，选择声音、模型与语言，输入文字并点击“生成配音”。
4. 在“项目与记录”试听、收藏或导出 MP3。

只能克隆本人声音，或已经获得声音所有者明确授权的声音。

## 三款模型怎么选

| 模型                    | 推荐度 | 突出特点                                        | 建议显存 | 典型用途                       |
| ----------------------- | -----: | ----------------------------------------------- | -------: | ------------------------------ |
| **VoxCPM2**             |  ★★★★★ | 综合最推荐；真实克隆、情绪、声音设计、30 种语言 |     8GB+ | 大多数口播、旁白和多语言创作   |
| **Fun-CosyVoice3 0.5B** |  ★★★★☆ | 19 种中文方言/口音，中文方言选择更多            |     8GB+ | 粤语、东北话、四川话等方言内容 |
| **IndexTTS-2.5**        |  ★★★★★ | 情绪演绎、五种语言与发音控制                    |    12GB+ | 细腻语气、多语言和指定发音     |

语言菜单会列出当前软件中的全部选项。模型不支持的语言会显示锁标志，并提示需要切换到哪款模型。默认只加载一个大模型，切换时会释放上一款。

## 电脑要求

- Windows 10/11 x64。
- 推荐 16GB 以上系统内存。
- NVIDIA 显卡不是必需；满足显存要求时自动使用 CUDA，没有合适显卡时自动切换 CPU。
- CPU 可以使用，但首次准备和生成速度明显更慢。
- 每款模型完整占用约 15–18GB；三款全部安装建议预留 55GB。
- 无需预装 Node.js、Python、FFmpeg 或 CUDA Toolkit。

## 模型与个人文件放在哪里

模型默认保存在：

```text
%LOCALAPPDATA%\声作模型库
├── voxcpm2
├── fun-cosyvoice3
└── indextts2-5
```

首次下载前可以选择其他位置，之后可在“设置 → 模型文件夹 → 迁移位置”整体移动已下载模型和未完成断点。程序升级不会删除独立模型库。

含模型便携包会直接使用与 `启动.cmd` 同级的 `模型库` 文件夹，不会额外复制几十 GB。旧的“安装到本机模型库”脚本已经删除；需要固定位置时统一使用设置页迁移，步骤更清楚，也会在切换前核对文件。

声音档案、项目、队列和生成记录位于当前 Windows 用户的应用数据目录，不会写进 Git 仓库或分享包。

## 更新

打开“设置 → 检查更新”。软件会读取本仓库最新正式 Release，并显示当前版本与最新版本；发现更新后可以打开下载页。便携版不会在后台静默覆盖文件。

升级时下载新的便携包并完整解压。独立模型库不需要重新下载；含模型便携包仍应保持 `app`、`模型库` 和 `启动.cmd` 在同一个总文件夹中。

## 隐私与安全

- 不提供账号、会员、支付、分析或遥测。
- 录音、文稿、声音档案和生成结果默认保存在本机。
- 模型安装只下载固定官方版本，关键文件经 SHA-256 校验后才启用。
- 本地 Worker 只监听 `127.0.0.1`，每次启动使用短期一次性令牌。
- Electron Renderer 开启沙箱和上下文隔离，禁用 Node 集成。
- 诊断包不包含文稿、录音、生成音频、访问令牌或完整私人路径。

详见 [隐私说明](PRIVACY.md)、[安全设计](docs/security-and-privacy.md) 与 [架构说明](docs/architecture.md)。

## 从源码运行

需要 Node.js 22+、pnpm 10.14+。模型运行环境仍由声作单独管理。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

提交前的完整检查：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:win
pnpm visual:capture
```

生成不含模型权重的便携包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-share-package.ps1
```

本机三款模型完整安装后，生成含模型文件夹：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-complete-package-with-models.ps1
```

## 项目结构

```text
apps/desktop/        Electron 主进程、预加载层和 React 界面
engines/             三款隔离模型插件与本地 Worker
packages/            共享类型、UI、下载、模型和硬件组件
scripts/             启动、验证、截图与打包脚本
tests/               桌面交互与视觉自动化测试
docs/                架构、产品、设计、安全和进度文档
```

完整开发状态见 [docs/progress.md](docs/progress.md)，用户可见更新见 [CHANGELOG.md](CHANGELOG.md)。问题反馈前请先阅读 [SUPPORT.md](SUPPORT.md)；贡献规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可与版权

本仓库公开是为了展示、审阅和发布声作，**不代表声作本体是开源软件**。除各自声明的第三方组件外，声作的源代码、界面、品牌、文档和构建脚本均保留全部权利。未经版权所有者书面许可，不得复制、修改、分发、再许可、销售、部署为服务或用于商业产品。

完整条款见 [LICENSE](LICENSE)。VoxCPM2、Fun-CosyVoice3、IndexTTS-2.5、Electron、React 等第三方项目仍适用各自许可，详见 [第三方许可说明](licenses/README.md) 与 [模型许可审计](docs/license-audit.md)。
