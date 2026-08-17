# 测试策略

## 1. 测试层次

- 单元测试：协议守卫、Mock Engine 状态机、台词解析、TXT 标点/换行拆分、SRT 分块与时间码解析、用户错误映射。
- 组件/Store 测试：路由状态、项目原子保存、运行中任务重启恢复、生成取消、播放器状态。
- 构建测试：Renderer、main、preload、工作区依赖内联断言和 Windows unpacked 目录。
- Electron 自动交互：导入字幕、编辑、删除一句、保存项目、提交队列、停止、恢复数据和导出。
- 视觉回归：固定视口与状态截图保存到 `artifacts/visual-regression/baseline`。
- 手动验收：真实 Windows 标题栏、缩放、播放、保存对话框和中文路径。

## 2. 必须覆盖的环境

| 类别 | 场景                                    | 本轮方法                         |
| ---- | --------------------------------------- | -------------------------------- |
| 视口 | 1280×720、1280×800、1440×900、1920×1080 | 自动截图                         |
| 缩放 | Windows 150%                            | Electron 强制缩放截图 + 后续真机 |
| 路径 | 中文用户名、中文路径、深层目录、D 盘    | 单元/手动；真实磁盘后续          |
| 硬件 | RTX 4070 12GB                           | 真实 CUDA 推理；其他硬件待矩阵   |
| 下载 | 空间预检、中断、恢复、换源、离线导入    | 自动化逻辑 + HF 缓存与 SHA-256   |
| 引擎 | 握手、加载、真实克隆、生成、停止        | 环回 Worker 集成测试             |
| 项目 | 完整保存、逐句缓存、任务重启恢复        | 单元测试 + Electron 自动交互     |
| 文本 | 超长、空、特殊字符、中英混合            | 单元测试与 UI 校验               |

## 3. 视觉基线

至少保存：

1. 配音生成
2. 字幕配音
3. 多人对话
4. 音色库
5. 模型管理
6. 设置
7. 使用帮助
8. 下载中
9. 生成中
10. 错误状态
11. 空状态

项目页也额外保存。首次捕获建立 baseline；后续 CI 将 current 与 baseline 做像素差异阈值比较。本轮先保证固定环境可重现、文件存在且尺寸正确。

## 4. 自动化命令

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:interaction
pnpm test:audio
pnpm test:worker-security
pnpm build
pnpm package:win
pnpm visual:capture
```

## 5. 发布前仍需的真机矩阵

- Windows 10 x64 与 Windows 11 x64。
- 150% DPI。
- 中文 Windows 用户名。
- 模型目录位于 D 盘。
- 无 NVIDIA、4–6GB NVIDIA、8–12GB NVIDIA。
- C 盘空间不足、断网/限速/代理、应用升级与卸载保留数据。

单台 RTX 4070 的真实验证不能替代 Windows 10/11、无 NVIDIA 与低显存多电脑矩阵。

## 6. 本轮证据

- 18 个单元/协议测试通过；完整 Electron 点击式交互测试通过。
- 13 张视觉基线全部有内容、主容器 opacity 为 1、页面错误为空。
- 测试音频：2 秒、44.1 kHz、mono、128 kbps MP3。
- HTTP 静态资源：200、`audio/mpeg`。
- 浏览器导出：有效 MP3 帧同步与非空文件。
- Worker 安全测试通过：仅环回访问、拒绝 Origin、启动 token 只可使用一次、会话 token 鉴权有效。
- RTX 4070 上加载到 `cuda:0`，以真实参考音频生成 4.46 秒、24 kHz、mono MP3。
- Windows unpacked 包构建并检查通过；包内不含本机权重、运行时、声音或生成结果。
- 2026-08-15 在中文目录中通过最终分享包的真实 CMD 入口启动成功；Renderer 进程带 `--enable-sandbox`，重复启动保持单实例。
- 2026-08-15 复测确认未签名 `ShengZuo.exe` 可能被端点策略拦截，而便携包的 CMD 入口可以正常启动，因此保留两个 CMD 入口。

当前主机的端点策略会在 unsigned unpacked EXE 创建进程前返回 `Access is denied`。这不替代后续签名安装包在 Windows 10/11、150% DPI、中文用户名和多硬件环境中的真机验收。
