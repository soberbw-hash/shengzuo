# 模型插件规范

## 项目内结构

```text
engines/<plugin-id>/
├── engine.json
├── model-manifest.json
├── licenses/README.md
└── worker/server.py
```

多个插件可以复用 `engines/common` 的安装器与 Worker 协议，但每个插件必须有独立 ID、入口、许可摘要、固定源码 revision、固定权重 revision 和关键 SHA-256。

## 用户数据结构

```text
%LOCALAPPDATA%/声作模型库/<plugin-id>/
├── runtime/   # 独立 Python 和依赖
├── sources/   # 固定官方源码
├── weights/   # 固定官方权重
├── cache/     # 可续用下载缓存
└── outputs/   # MP3 与结果元数据
```

不同插件不得共享可写 `site-packages`、权重目录或 Worker。应用安装包只包含插件描述与安装代码，不包含本机下载的权重、声音、输出和缓存。

## 安装事务

1. 在 `<name>.installing` 目录准备隔离运行时或权重。
2. 下载 Python 官方嵌入包、get-pip、固定源码归档和固定 Hugging Face revision。
3. 对 Python 包、源码归档和清单列出的关键权重进行 SHA-256 校验。
4. 写入临时收据并原子替换为 `install-receipt.json`。
5. 将完成的 staging 目录原子移动为正式目录；已有不完整目录改名隔离，不覆盖可用版本。
6. 中断后保留安全缓存，用户再次点下载即可续装。

安装状态以 runtime 收据和插件声明的全部资源收据为准。用户手动删除任一必需模型目录后，下一次状态刷新必须显示“未安装”。

## Worker 契约

- 只监听 `127.0.0.1` 随机端口。
- 启动参数必须包含带固定安全前缀的 256 位一次性令牌。
- 握手后一次性令牌失效，后续请求必须使用内存会话令牌。
- 验证远端地址、Host、Origin、请求大小、任务 ID 和输出目录边界。
- 支持 `load`、`generate`、`shutdown`；主进程负责取消时关闭 Worker。
- Worker 返回自然错误码；中文用户文案由主进程映射，技术回溯只在显式调试环境输出。

## 资源策略

- 默认一次只加载一个模型，CPU 模型同样受资源锁约束。
- 切换模型前关闭上一个 Worker，释放显存和内存。
- 生成输出统一为 MP3；模型先产生无损临时 WAV，再由通用本地 FFmpeg 处理语速、音量和编码。
- 字幕配音和多人对话串行生成片段后合并，避免并发加载多个模型。

## 许可门槛

开放一键安装前必须分别确认代码、权重、Tokenizer、音频组件和运行依赖许可，并在 `docs/license-audit.md` 与插件 `licenses/README.md` 留下结论。用户录音不属于插件资产，不得随项目分发。
