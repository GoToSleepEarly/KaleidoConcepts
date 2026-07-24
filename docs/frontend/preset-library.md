# 预设库：主题灵感 / 语法点

## 模块目标

预设库维护两类可复用选项：

- 主题灵感：供 Step2 “从灵感库开始”选择，用来让 AI 生成 3 个故事方向。
- 语法点：供 Step1 选择课程硬约束。

主题灵感不是课程最终主题。最终主题来自 Step2 确认文本里的 `Content Intent.Theme`。

## 页面

| 页面 | 路由 | 用途 |
| --- | --- | --- |
| 主题灵感库 | `/themes` | 维护 Step2 可选主题灵感 |
| 语法点库 | `/grammar` | 维护 Step1 可选语法点 |

## API

### `GET /api/presets?kind=theme|grammar`

返回：

```ts
{ presets: PresetOption[] }
```

排序：`category` 升序 -> `sortOrder` 升序 -> `label` 升序。

### `POST /api/presets`

创建主题灵感或语法点。

### `PUT /api/presets/:id`

更新名称和分类。`kind` 不可改变。

### `DELETE /api/presets/:id`

软删除，写入 `archivedAt`。

## 使用边界

- Step1 只读取 `grammar`。
- Step2 启动表单只读取 `theme`。
- 预设删除不影响已经保存的课程或已生成的教案文本。
- 当前不做拖拽排序、批量导入导出、主题分类。

## 实现记录

- 状态：已实现。
- 当前归档：主题库文案已改为主题灵感库，入口从 Step1 移到 Step2。
- 验证命令：`pnpm lint`、`pnpm test`、`pnpm build`。
