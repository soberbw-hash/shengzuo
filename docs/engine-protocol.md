# Engine Protocol

## 1. 目标

协议隔离 Renderer 与具体模型实现。React 只理解类型化命令、状态快照、进度和结果，不理解 Python 进程、模型目录或 HTTP 端口。

## 2. 命令

| 命令                     | 必要字段            | 结果              |
| ------------------------ | ------------------- | ----------------- |
| `engine:get-snapshot`    | 无                  | 当前 Engine 快照  |
| `engine:install`         | `modelId`           | 进入下载/安装流程 |
| `engine:pause-download`  | `modelId`           | 进入暂停          |
| `engine:resume-download` | `modelId`           | 继续断点流程      |
| `engine:retry`           | `modelId`           | 从可恢复故障重试  |
| `engine:prepare`         | `modelId`           | 加载并进入 ready  |
| `engine:generate`        | `GenerationRequest` | 返回 `jobId`      |
| `engine:cancel`          | `jobId`             | 请求停止          |
| `engine:set-mock-state`  | `EngineStatus`      | 仅开发/测试       |

## 3. GenerationRequest

- `requestId`: UUID。
- `modelId`: 受支持模型 ID。
- `voiceId`: 音色 ID。
- `text`: 1–20,000 字符；IPC 前后都验证。
- `language`：使用共享语言目录；发送前必须属于当前模型的支持列表。
- `emotion`: 受限枚举。
- `speed`: 0.5–2.0。
- `volume`: 0–150。
- `format`: 当前固定为 `mp3`。
- `expression`: 最多 500 字符。

禁止将完整 `text` 写入日志。日志只记录长度、语言、模型 ID、任务 ID 和耗时。

## 4. 事件

- `engine:snapshot`：完整状态。
- `engine:progress`：阶段、0–100 进度与用户文案。
- `engine:result`：音频资源 ID、时长、格式和创建时间。
- `engine:error`：用户信息、内部错误码、是否可重试。

Preload 对订阅返回取消函数；窗口销毁时移除监听。

## 5. 真实 Worker 传输

三款真实模型插件共用同一套环回 HTTP 安全协议；每个插件拥有独立运行环境、源码、权重与缓存目录，输出单独保存在个人数据目录：

- 只绑定 `127.0.0.1` 或 `::1`。
- 主进程选择随机空闲端口。
- 256-bit 一次性令牌，首次握手后立即失效并换为内存会话 token。
- Host/Origin/token 三重校验。
- 128 KiB 请求体上限、分阶段超时、停止时终止进程和进程退出检测。
- 不在局域网地址监听，不允许配置为 `0.0.0.0`。

## 6. 兼容性

`protocolVersion` 使用 `major.minor`。major 不同拒绝启动并提示修复；minor 不同采用 capability 协商。插件声明 `minAppVersion`、`maxAppVersion` 和功能列表。
