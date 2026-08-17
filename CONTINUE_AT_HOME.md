# 声作 · 回家继续操作说明

交接日期：2026-08-01  
当前范围：声作 1.0.2 与 Phase 2 三模型本地闭环

## 先说清楚当前能力

当前 Electron 桌面版接入 VoxCPM2 与 Fun-CosyVoice3，可以使用本人或已获授权的 3–60 秒录音在本机克隆声音、生成配音、试听并导出 MP3。

第一次使用时进入“本地引擎”，不知道选哪个就安装 VoxCPM2。单款应用会按需下载约 13–14 GB 的隔离运行环境和模型权重；下载和校验完成后，正常本地生成不再依赖云端语音服务。录音、文本和结果不会上传。

## 快速打开

1. 完整便携包双击 `启动.cmd`。
2. 源码目录同样使用 `启动.cmd`，也可运行桌面快捷方式脚本。

启动器优先打开 `ShengZuo.exe`。系统策略拦截未签名程序时，会改用源码依赖中的 Electron，仍然运行真实本地引擎；浏览器 Mock 只在显式传入 `-PreviewOnly` 时打开。项目移动或解压后，需要重新创建桌面快捷方式。

## 压缩包内容

- 完整源码、锁文件及产品/架构/安全/许可/测试文档。
- Electron + React + TypeScript 桌面基础工程。
- 八个页面、统一 UI 组件、真实 LocalVoiceEngine 和测试用 Mock Engine。
- 三款正式模型 Worker 源码、运行时安装器、固定模型清单与许可摘要。
- 2 秒离线 MP3 测试提示音，只用于测试状态。
- UX 审计前后截图与视觉回归结果。
- `apps/desktop/release/win-unpacked` Windows x64 开发构建。

源码压缩包不直接包含模型权重或 Python；应用首次使用时下载到当前 Windows 用户的数据目录并校验 SHA-256。

## 受限环境说明

受限环境可能会在启动新生成、未签名的 `ShengZuo.exe` 前返回 `Access is denied`。这是端点安全策略问题，与“生成结果是纯音乐”无关。

- 纯音乐：旧版软件使用了测试音乐，属于软件实现问题。
- EXE 无法启动：可能是系统安全策略拦截未签名程序。
- 管理员权限不会让测试音乐自动变成人声。

## 回家后的操作

建议把 ZIP 解压到短且可写的路径，例如 `D:\ShengZuo`，不要直接在压缩包或网盘同步目录中运行。

1. 安装 Node.js 24 LTS（最低 Node.js 22）。
2. 在项目目录打开 PowerShell。
3. 启用 pnpm 10.14.0：

```powershell
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:audio
pnpm test:worker-security
pnpm build
pnpm package:win
pnpm visual:capture
```

开发预览：

```powershell
pnpm dev
```

Windows 开发构建：

```text
apps/desktop/release/win-unpacked/ShengZuo.exe
```

## GitHub 手动推送

如果 GitHub 连接器仍未授权，可在项目根目录运行：

```powershell
git init
git add .
git commit -m "feat: publish ShengZuo desktop foundation"
git branch -M main
git remote add origin https://github.com/soberbw-hash/clonevoice.git
git push -u origin main
```

如果已有 `origin`：

```powershell
git remote set-url origin https://github.com/soberbw-hash/clonevoice.git
git push -u origin main
```

## 下一阶段建议

在 Windows 10/11、无 NVIDIA 与 4–8 GB 显存机器上补齐发布矩阵，并完成代码签名、商标类别检索和正式升级流程。Python、模型文件、私有路径和令牌继续只由主进程与 Worker 管理。
