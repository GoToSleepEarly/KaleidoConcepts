# 新建课程 Step 5：HTML 预览与 PDF 预览模块说明

## 模块目标

本模块覆盖新建课程流程第五步：基于 Step 3 已确认的 `LessonDraft` 和 Step 4 已生成 / 处理中 / 失败的 `course_images`，提供用于课堂投屏的 HTML 预览和学生版 PDF 预览。

Step 5 是只读聚合与渲染，不生成 HTML 文件，不生成 PDF 文件，不修改课文草稿，不触发图片生成，不保存图片状态。

## 输入边界

必须读取：
- `Course` 基础信息
- 课程关联的 teacher / student 人物信息
- `CourseLessonDraft.content`
- `CourseImage` 当前记录

对齐规则：
- 文本内容只来自 `CourseLessonDraft.content`。
- 图片只来自 `course_images`，通过 `LessonShot.imageSlotId` 对齐。
- `structured_lesson` 不保存图片 URL、prompt 或状态。
- PDF 页面和 HTML Preview 共用课程内容组件，统一使用 16:9 PPT slide deck 版式。
- PDF 永远隐藏答案和操作区。

## 本期范围

生成：
- 课程 HTML 投屏预览页面
- 学生版 PDF 投屏预览页面
- 预览聚合 API
- 课程内容共用渲染组件
- 缺图 / 生成中 / 失败 / stale 图片占位展示
- HTML 老师答案查看区

不生成：
- HTML 静态文件
- PDF 文件
- 服务端 PDF 渲染
- 封面图
- 教师版 PDF
- 答案页 PDF
- 图片重试 / 沿用 stale 图片操作
- 正文编辑能力

恢复边界：
- 无课文草稿：回 Step 3 生成或编辑草稿。
- 图片未完成、失败或 stale：回 Step 4 处理资源。
- 预览加载失败：刷新重试，不会造成数据半完成状态。

## 页面入口

- HTML 预览：`/courses/:id`
- Step 5 创建流入口：`/courses/:id/create/preview`
- PDF 预览：`/courses/:id/pdf`

`/courses/:id/create/preview` 保留创建步骤导航，并直接复用 HTML 预览组件。Step 5 不使用 iframe，避免嵌入页再次触发登录守卫后跳转到课程列表。

## 内容分页规则

预览使用即时页面化结构，不持久化页面数据：

1. Cover slide
   - 课程标题
   - 老师
   - 学生
   - 英语等级
   - 主题
   - Grammar
   - 课时
2. Chapter divider slide
   - 每个 chapter 第一次出现前插入章节分隔页
   - 显示 Chapter N 和章节标题
3. 每个 `LessonShot` 固定拆成 2 张投屏 slide
   - Image slide：只承载该 shot 的图片主视觉，图片保持原始 4:3 比例，居中放入 16:9 投屏画布，不拉伸
   - Practice slide：承载该 shot 对应的正文和填空练习
4. Closing reading 单独一张或多张 slide
   - 标题
   - 正文
   - vocabulary terms

exercise block 学生视图只显示 `________` 和提示信息，不显示答案。

所有内容页都是 16:9 横屏 slide，服务于投屏展示，不采用 A4 讲义页或长文阅读页。

## 页面行为

### HTML 预览

页面布局：
- 中间投屏区域：
  - 一次只展示一张 16:9 slide
  - 左右按钮切换
  - 显示当前页码
  - 图片页和填空页分离展示
  - 点击填空可在教师 HTML 预览中切换显示答案
- 页面级操作：
  - 回到开头
  - 打开 PDF 预览
  - 返回资源生成编辑
- 创建流 Step 5：
  - 外层展示创建步骤导航
  - 下方直接复用独立 HTML 预览的 deck 组件
  - 不使用 iframe 或第二个受保护页面

图片状态展示：
- `missing`：显示未生成占位
- `pending` / `submitting` / `generating`：显示生成中占位
- `failed`：显示失败占位和失败原因
- `succeeded` 且 `stale=false`：显示图片
- `succeeded` 且 `stale=true`：显示旧图和内容已变化提示

操作边界：
- 不在预览页编辑正文。
- 不在预览页重试图片。
- 不在预览页沿用 stale 图片。
- 不自动触发图片生成。

### PDF 预览

PDF 预览是浏览器打印 slide deck：
- 顶部提供打印按钮，调用 `window.print()`。
- 内容使用 `CoursePreviewDocument mode="pdf" audience="student"`。
- 打印时隐藏顶部工具条。
- 每个 slide 使用 16:9 横屏比例。
- 打印页使用 landscape slide 尺寸。
- 每个预览 slide 使用 `break-after: page`。
- 图片和缺图占位都保持 slide 版式稳定，避免打印版式跳动。

PDF 隐藏：
- 答案
- 编辑按钮
- 图片操作按钮
- 顶部 / 侧边 / 浮层操作区

## API 合同

### `GET /api/courses/:id/preview`

行为：
- 读取课程、人物、课文草稿和图片记录。
- 按 `LessonDraft` 和 `course_images` 聚合预览数据。
- 按 cover / lesson shot / closing reading 生成即时页面数组。
- 不写入数据库。
- 不更新课程状态。
- 不推进图片队列。

响应：

```ts
type CoursePreviewResponse = {
  course: CoursePreviewCourse;
  resourceProgress: CoursePreviewResourceProgress;
  pages: CoursePreviewPage[];
};

type CoursePreviewCourse = {
  id: string;
  title: string;
  teacherName: string | null;
  studentNames: string[];
  englishLevel: EnglishLevel;
  durationMinutes: number;
  theme: string;
  grammar: string[];
};

type CoursePreviewResourceProgress = {
  total: number;
  succeeded: number;
  generating: number;
  failed: number;
  missing: number;
  stale: number;
};

type CoursePreviewPage =
  | {
      id: string;
      type: "cover";
      title: string;
    }
  | {
      id: string;
      type: "lesson_shot";
      chapterId: string;
      chapterTitle: string;
      chapterIndex: number;
      shotId: string;
      shotOrder: 1 | 2;
      title: string;
      image: CoursePreviewImage;
      blocks: CoursePreviewBlock[];
      exercises: CoursePreviewExercise[];
    }
  | {
      id: string;
      type: "closing_reading";
      title: string;
      text: string;
      vocabularyTerms: string[];
    };

type CoursePreviewImage = {
  status: "missing" | "pending" | "submitting" | "generating" | "succeeded" | "failed";
  publicUrl: string | null;
  stale: boolean;
  failureReason: string | null;
};

type CoursePreviewBlock =
  | {
      id: string;
      order: number;
      type: "text";
      text: string;
    }
  | {
      id: string;
      order: number;
      type: "exercise";
      exerciseId: string;
      display: LessonBlankDisplay;
    };

type CoursePreviewExercise = LessonExercise;
```

失败：
- `400 { message: "请先生成课文草稿" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课程预览加载失败" }`

## 前端组件边界

建议组件：

- `CourseHtmlPreview`
  - 拉取 `/api/courses/:id/preview`
  - 渲染 HTML 预览外壳
  - 管理当前页锚点 / 当前页答案展示
- `CoursePdfPreview`
  - 拉取 `/api/courses/:id/preview`
  - 渲染打印工具条
  - 调用 `window.print()`
- `CoursePreviewDocument`
  - 只渲染课程内容页
  - 被 HTML 和 PDF 共用
  - `mode="html" | "pdf"`
  - `audience="teacher" | "student"`
- `CoursePreviewPage`
  - 渲染 cover / lesson shot / closing reading
- `CoursePreviewImageFrame`
  - 渲染成功图和各类占位状态

## 数据结构边界

本期不新增 Prisma 表，不新增 migration。

需要在前端合同中新增：
- `CoursePreviewResponse`
- `CoursePreviewCourse`
- `CoursePreviewResourceProgress`
- `CoursePreviewPage`
- `CoursePreviewImage`
- `CoursePreviewBlock`
- `CoursePreviewExercise`

后端可新增只读 repository：
- `lib/server/repositories/course-preview.ts`

## 测试范围

后端单元测试：
- 能从 `LessonDraft + CourseImage` 生成 cover / shot / closing pages。
- shot page 只包含 `coveredBlockIds` 对应 blocks。
- blocks 顺序与 draft blocks 一致。
- 成功图绑定 `publicUrl`。
- missing / failed / stale 图片状态正确暴露。
- 无 lesson draft 返回前置条件错误。

前端组件测试：
- HTML 模式显示老师工具区和答案列表。
- PDF/student 模式不显示答案和操作区。
- exercise block 显示空格，不显示 answer。
- 缺图时显示占位状态和返回资源生成入口。

## 验收标准

- 从 `/courses/:id/create/resources` 能进入 Step 5。
- `/courses/:id` 显示真实草稿文字和真实图片，不使用 `mockCourse`。
- `/courses/:id/create/preview` 显示同一套 HTML 预览并保留 Step 5 导航。
- `/courses/:id/pdf` 与 HTML 内容顺序一致。
- `/courses/:id/pdf` 隐藏答案和操作区。
- 资源未完成时仍能预览。
- 资源异常时能回 Step 4 恢复。
- 不新增数据库表。
- 不新增 Prisma migration。
- 不生成 HTML 文件。
- 不生成 PDF 文件。

## 实现状态

- 2026-07-09：已实现 HTML 预览、学生版 PDF 预览、只读预览 API 和共用课程内容组件。
- 2026-07-09：根据用户反馈从 A4 讲义式页面改为 16:9 投屏 PPT slide deck 样式，HTML 一次展示一张 slide，PDF 按同一 slide 版式横向打印。
- 验证命令：`pnpm test`；`pnpm lint`；`pnpm build`
- 提交号：待实现后补充。
