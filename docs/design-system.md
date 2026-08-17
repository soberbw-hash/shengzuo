# 设计系统

## 1. 来源与边界

设计语言参考只读仓库 `soberbw-hash/shanghao` 的通用 Token、玻璃分层、窗口结构、按钮反馈、Toast 和设置项。没有复制其品牌、Logo、动物角色、办公室场景、聊天或开黑业务。

## 2. 核心 Token

| 类别 | Token                            | 值                                |
| ---- | -------------------------------- | --------------------------------- |
| 背景 | canvas-0 / canvas-1              | `#f3f7fc` / `#eaf1f8`             |
| 文字 | ink-0 / ink-1 / ink-2            | `#172235` / `#42536a` / `#78879a` |
| 品牌 | blue / blue-deep                 | `#4da3ff` / `#2f6fcc`             |
| 成功 | success                          | `#18b66a`                         |
| 危险 | danger                           | `#ef5555`                         |
| 玻璃 | blur                             | `16px`                            |
| 圆角 | sm / md / lg / xl                | `12 / 16 / 22 / 30px`             |
| 字号 | title / section / body / caption | `28 / 18 / 14 / 12px`             |
| 间距 | page / section / card            | `24 / 20 / 16px`                  |

代码真值位于 `packages/design-tokens/src/index.ts` 和 Renderer 的 CSS 变量。

## 3. 材质

玻璃只用于层级容器、标题栏、导航和浮层。正文信息卡优先使用高不透明白色，以保证文字可读和中低端显卡稳定。背景环境光使用低饱和蓝与薄荷绿径向光，不使用紫色大渐变和霓虹。

## 4. 组件

- `GlassCard`：容器材质，可选强度和内边距。
- `Button`：primary、secondary、ghost、danger。
- `IconButton`：标题栏与紧凑动作。
- `TextField` / `TextArea`：一致标签、说明、错误状态。
- `SelectField`：原生 select 的统一外观。
- `SliderField`：显示当前值与范围。
- `Modal`：焦点可见、遮罩、明确主次动作。
- `ToastRegion`：最多三个、自动消失、可手动关闭。
- `ProgressBar`：确定进度，带文字和 `aria-valuenow`。
- `EmptyState`：图标、标题、说明和单一首要动作。

## 5. 动效

- 控件：150–200ms。
- 页面/抽屉：280–360ms。
- Hover：最多上浮 1px 与轻微亮度变化。
- Active：最多缩小到 0.98。
- 使用 `prefers-reduced-motion` 时禁用空间位移、循环动画与平滑滚动。

## 6. 文案风格

标题说明“能做什么”，按钮说明“下一步做什么”。避免“推理、checkpoint、runtime、显存 OOM”等内部术语；改为“正在准备模型”“显存不足，已切换到更省资源的方式”等自然中文。
