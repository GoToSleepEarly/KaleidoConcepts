# 新建课程 Step 1：基础信息

## 模块目标

Step 1 只收集后续 AI 生成必须遵守的课堂硬约束，并创建可恢复的 `draft` 课程。内容主题、故事想法、参考剧情和角色外观统一进入 Step 2 处理。

## 当前流程

1. `/courses/new` 打开未保存表单，不创建数据库记录。
2. 用户填写课程标题、老师、学生、英语等级、课程时长和语法点。
3. 提交 `POST /api/courses` 创建课程，成功后跳转 `/courses/:id/create/story-options`。
4. 从后续步骤返回 `/courses/:id/create/basic` 时，提交 `PUT /api/courses/:id/basic` 更新原课程。

## 字段

- 课程标题：必填文本。
- 老师：必填，单选，来自 `GET /api/people?role=teacher`。
- 学生：必填，至少 1 个，多选，来自 `GET /api/people?role=student`。
- 英语等级：`A1` / `A2` / `B1` / `B2` / `C1` / `C2`。
- 课程时长：`30` / `45` / `60` 分钟。
- 语法点：必填，至少 1 个，来自 `GET /api/presets?kind=grammar`，按分类展开选择。

不在 Step 1 收集：

- 内容主题
- 故事想法
- 参考剧情
- 第三方角色外观

主题灵感库 `/themes` 只在 Step 2 的“从灵感库开始”入口使用。

## API

### `POST /api/courses`

```ts
type CourseBasicInput = {
  title: string;
  teacherId: string;
  studentIds: string[];
  englishLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  durationMinutes: 30 | 45 | 60;
  grammar: string[];
  llmModel?: "deepseek_chat" | "gpt_5_5";
};
```

响应：

```ts
{
  course: {
    id: string;
    status: "draft";
  };
}
```

### `PUT /api/courses/:id/basic`

请求同 `CourseBasicInput`。更新失败不创建新课程，用户可重试。

## 数据

`Course` 当前仍保存 `theme` 字段，创建 Step1 时写入占位值 `待在 Step2 确定`；最终内容主题以后续 Step2 的 `Content Intent.Theme` 为准。

`CoursePerson` 保存一个老师和一个或多个学生。

## 验收标准

- `/courses/new` 可打开基础信息表单。
- 未填写标题、未选择老师、未选择学生、未选择语法点时不能提交。
- 保存成功后进入 `/courses/:id/create/story-options`。
- `/courses/:id/create/basic` 保存时更新原课程，不重复创建。
- Step 1 不出现主题或故事想法输入。
- `pnpm lint`、`pnpm test`、`pnpm build` 通过。

## 实现记录

- 状态：已实现。
- 当前归档：Step1 已从内容策划表单收敛为硬约束表单；主题灵感和已有想法入口迁移到 Step2。
- 验证命令：`pnpm lint`、`pnpm test`、`pnpm build`。
