# 新建课程 Step 5：课件预览、编辑与发布模块说明

## 模块目标

本模块覆盖新建课程流程第五步以及发布后的授课预览：基于 Step 3 已确认的 `LessonDraft` 和 Step 4 已生成的 `course_images`，提供课件样式编辑、课件预览、PDF打印预览，以及发布后用于课堂投屏的纯净HTML授课页。

Step 5 在创建流中支持编辑课件展示层配置（不修改原文和图片），确认后发布课程；发布后的授课页是完全只读的投屏模式。

不生成HTML静态文件，不生成PDF文件，不触发图片生成（图片问题必须回Step4处理）。

## 输入边界

必须读取：
- `Course` 基础信息（含 `status: draft | published`）
- 课程关联的 teacher / student 人物信息
- `CourseLessonDraft.content`（原文，Step3只读真相源）
- `CourseImage` 当前记录
- `CoursePresentation` 课件展示配置（样式、文本覆盖）

对齐规则：
- 原始文本内容只来自 `CourseLessonDraft.content`，Step5只修改课件展示层的覆盖文本，不回写Step3原文。
- 图片只来自 `course_images`，通过 `sourceParagraphId` 对齐。
- `structured_lesson` 不保存图片 URL、prompt、状态或课件样式。
- PDF预览、创建流预览、发布后授课页共用课程slide渲染组件，统一使用16:9 PPT slide deck版式。
- PDF永远隐藏答案和操作区。
- 课后阅读（Closing Reading）复用封面图片，不额外生成图片。
- Step5不能重试或替换图片，图片问题必须回Step4处理。

## 本期范围

生成：
- 创建流Step5预览编辑页 `/courses/:id/create/preview`（带右侧属性编辑面板）
- 发布后纯净授课投屏页 `/courses/:id`（只读）
- PDF打印预览页（在Step5内标签切换）
- 预览聚合API
- 课件样式/覆盖文本保存API
- 课程发布API
- 课件slide共用渲染组件
- 缺图/生成中/失败/stale图片占位展示
- 创建流Step5中的课件编辑功能：
  - 封面标题样式调整（字体大小、蒙版主题）
  - 章节分隔页配色选择（预设主题）
  - 文本框样式/位置调整
  - 正文/习题展示层文本编辑（不影响Step3原文）
- HTML授课页老师点击填空切换答案显示

不生成：
- HTML静态文件
- PDF文件
- 服务端PDF渲染
- 额外的课后阅读图片
- 教师版PDF
- 答案页PDF
- 图片重试/替换/重新生成
- Step3原文编辑（如需改原文必须回Step3）
- Step4资源生成页面UI调整（保持现有逻辑不变）

恢复边界：
- 无课文草稿：回Step3生成或编辑草稿。
- 图片未完成、失败或stale：回Step4处理资源。
- 课件编辑未保存离开：提示用户有未保存更改。
- 预览加载失败：刷新重试，不会造成数据半完成状态。

## 页面入口

三个独立页面/视图，职责严格分离：

1. **创建流Step5预览编辑页**：`/courses/:id/create/preview`
   - 仅课程状态为 `draft` 时可访问
   - 顶部保留创建步骤导航（Step1-Step5）
   - 支持HTML预览/PDF预览标签切换
   - 右侧属性面板可编辑课件样式和展示文本
   - 有「保存草稿」和「发布课程」按钮

2. **发布后授课投屏页**：`/courses/:id`
   - 仅课程状态为 `published` 时可访问
   - 完全只读，没有任何编辑入口
   - 沉浸式深色背景投屏模式
   - 用于课堂上课展示

3. **PDF打印预览**：在创建流Step5内通过标签切换，不单独路由
   - 无交互，所有填空只显示横线
   - 顶部有「打印」按钮调用 `window.print()`

`/courses/:id/create/preview` 不使用iframe。

## 课件视觉规范

### 封面样式
1. **纯封面页 (`cover_pure`)**：AI生成16:9纯画面绘本封面，全幅铺满，无任何文字。
2. **标题封面页 (`cover_title`)**：
   - 背景：与纯封面同一张图
   - 蒙版：可选预设主题（MVP默认深色渐变半透明蒙版，0.3-0.4透明度黑色渐变）
   - 文字：白色无衬线系统字体
   - 布局：课程标题大号响应式字体居中，下方小号字体显示老师和学生姓名
   - 可编辑：标题字号、蒙版主题

### 章节分隔页样式
- **章节标题页 (`chapter_divider`)**：
  - 背景：渐变色背景（MVP提供3-5套预设渐变主题供选择，所有章节默认共用同一套）
  - 文字：白色无衬线系统字体，居中显示。上方小字 eyebrow 展示章节序号 "Chapter N"，下方大字展示该章英文课题名（`chapterTitleEn` = 草稿章节英文标题）
  - 不显示中文章节标题，不显示额外信息
  - 可编辑：选择预设渐变配色主题

### 绘本正文页样式
每个段落（shot）固定拆成2张slide：

1. **纯图片页 (`shot_image`)**：
   - 16:9 AI生成绘本图片全幅铺满，无文字、无蒙版
   - 图片填满整个slide容器，居中展示，不拉伸不变形

2. **文本练习页 (`shot_text`)**：
   - 背景：与上一页同一张绘本图片（不做高斯模糊）
   - 蒙版：图片上加一层深色半透明蒙版保证文字可读
   - 文本框：居中放置半透明白色磨砂玻璃效果的圆角文本框
   - 内容：文本框内显示**带挖空填空的完整正文**（正文与习题是一体的，不是分开两块）
   - HTML授课页：老师点击填空区域切换该空答案显示/隐藏
   - PDF打印预览：只显示填空横线 `________`，永远隐藏答案
   - 可编辑：文本框位置/大小/透明度、展示层文字内容修改（不影响原文）

### 课后阅读页样式
课后阅读不单独生成图片，复用封面图，固定2张slide：

1. **课后阅读纯图页 (`closing_image`)**：复用封面图全幅铺满
2. **课后阅读文本页 (`closing_text`)**：
   - 背景：封面图 + 深色蒙版
   - 文本框：同款半透明白色磨砂玻璃圆角文本框
   - 内容：纯阅读正文文本，**无填空习题、无词汇表**
   - 无单独的"Closing Reading"标题分隔页

## 内容分页规则

预览使用即时页面化结构，课件页面顺序严格按以下顺序：

| 序号 | 页面类型 | 说明 |
|------|----------|------|
| 1 | `cover_pure` | AI纯画面封面，无文字 |
| 2 | `cover_title` | 封面背景+课程标题+师生姓名 |
| 3 | `chapter_divider` | 第1章标题页："Chapter 1: XXX" |
| 4 | `shot_image` | 第1章第1段纯绘本图片 |
| 5 | `shot_text` | 第1章第1段：图片背景+挖空文本 |
| 6 | `shot_image` | 第1章第2段纯绘本图片 |
| 7 | `shot_text` | 第1章第2段：图片背景+挖空文本 |
| 8 | `chapter_divider` | 第2章标题页 |
| 9 | `shot_image` | 第2章第1段纯图 |
| 10 | `shot_text` | 第2章第1段文本 |
| ... | ... | 按章节重复上述模式 |
| 最后-1 | `closing_image` | 课后阅读纯图页（复用封面） |
| 最后 | `closing_text` | 课后阅读纯文本页（无填空、无词汇） |

所有slide都是16:9横屏，服务于课堂投屏展示，不采用A4讲义页或长文阅读页。

## 全局排版约束

- **字体自适应**：所有文本框内的文字必须根据文本长度自动缩放字号，确保文字不溢出文本框边界；标题封面的课程标题也需要响应式缩放，避免长标题折行溢出或超出画面。
- **文本框边距**：磨砂玻璃文本框内边距不小于2rem，保证文字不贴边。
- **行高与字间距**：正文行高不小于1.6，保证长文本可读性；填空横线长度统一。
- **选中状态**：创建流Step5中点击slide上的元素选中后，元素显示轻微蓝色边框高亮标识。

## 页面行为

### 创建流 Step5 预览编辑页 `/courses/:id/create/preview`

页面布局（三栏结构）：
- **顶部区域**：
  - 左侧：创建步骤导航条（Step1-Step5）
  - 中间：标签切换「课件预览」/「打印预览」，默认停在课件预览
  - 右侧：「返回Step4」按钮、「保存草稿」按钮、「发布课程」主按钮
- **中间主区域**：
  - 浅色/白色背景，16:9 slide预览区域居中展示
  - 预览区域底部悬浮半透明控制栏：「回到开头」、上一页箭头、页码 `X/Y`、下一页箭头
  - 点击slide上的可编辑元素（标题、文本框、正文区域），元素高亮选中
- **右侧属性编辑面板**：
  - 默认收起或显示全局课件设置
  - 选中元素后滑出/展开对应属性编辑项
  - 可编辑项：封面标题字号/蒙版主题、章节配色主题、文本框位置/大小/透明度、正文展示文本
  - 编辑后实时更新预览效果
  - 未保存更改有红点提示

课件预览标签：HTML交互模式，点击填空可以临时切换答案显示（编辑态不持久化答案显示状态，授课页才是老师上课用的交互）

打印预览标签：
- 切换后预览区域显示PDF打印效果
- 所有填空只显示横线，答案隐藏
- 无点击交互
- 顶部显示「打印」按钮，调用 `window.print()`

操作边界：
- 修改图片必须回Step4，本页没有图片生成/重试入口
- 修改正文原文必须回Step3，本页只改课件展示层覆盖文本
- 离开页面前有未保存更改时弹出确认提示
- 发布课程前自动保存所有配置
- 发布成功后在新标签页打开 `/courses/:id` 授课页，当前标签返回 `/courses` 课程列表
- 顶部常驻「返回课程列表」入口（有未保存更改时二次确认），解决改完无法回首页的问题
- 已发布课程仍可回本页继续编辑版式并再次保存（幂等发布），保存不会改变已发布状态

图片状态展示：
- `missing`：显示未生成占位
- `pending`/`submitting`/`generating`：显示生成中占位
- `failed`：显示失败占位和「回Step4处理」按钮
- `succeeded`且`stale=false`：显示图片
- `succeeded`且`stale=true`：显示旧图和内容已变化提示

### 发布后授课投屏页 `/courses/:id`

- **全屏沉浸模式**：整个页面深色近黑背景，无网站顶部导航、无侧边栏、无编辑按钮
- 16:9 slide 垂直水平居中在页面中间
- 底部悬浮半透明磨砂黑控制栏：
  - 默认半透明显示
  - 鼠标静止3秒后自动淡出隐藏，鼠标移动再淡入显示
  - 按钮从左到右：「回到开头」、上一页箭头、页码 `X / Y`、下一页箭头、「全屏」按钮（浏览器全屏API）
- **翻页**：点击控制栏箭头按钮，支持键盘左右方向键翻页
- **答案交互**：点击文本框内的填空横线，独立切换该空的答案显示/隐藏；填空默认显示横线，点击后显示答案文字
- **完全只读**：没有任何编辑、保存、返回按钮，纯净投屏体验
- 缺图/失败图片显示占位符，但不显示编辑入口
- 打印通过浏览器自带功能（Ctrl/CMD+P），打印样式同PDF预览

### PDF打印

PDF打印通过浏览器 `window.print()` 实现：
- 每个slide使用16:9横屏比例
- 打印使用landscape横向尺寸
- 每个slide使用 `break-after: page` 强制分页
- 图片和缺图占位都保持slide版式稳定，避免打印版式跳动
- 打印时隐藏所有控制栏、按钮、编辑面板、操作区

PDF打印永远隐藏：
- 答案
- 所有交互按钮和操作区
- 属性面板
- 选中高亮状态

## API 合同

### `GET /api/courses/:id/preview`

行为：
- 读取课程（含status）、人物、课文草稿、图片记录、CoursePresentation配置。
- 按规则聚合生成即时页面数组，展示层文本覆盖优先使用CoursePresentation中保存的覆盖文本。
- 不写入数据库。
- 不更新课程状态。
- 不推进图片队列。

### `PUT /api/courses/:id/presentation`

行为：
- 保存课件样式配置和展示层文本覆盖到CoursePresentation。
- 任意状态（含 `published`）均可调用；保存不改变课程发布状态（2026-07-16 起放开，原「仅 draft 可调用」限制及 409 护栏已移除）。
- 幂等保存，全量覆盖更新。

请求体：
```ts
type CoursePresentationUpdate = {
  coverTheme: string; // 封面蒙版主题ID
  coverTitleFontSize: number; // 标题字号比例
  chapterTheme: string; // 章节分隔页渐变主题ID
  slideTextOverrides: Record<string, {
    textBlocks?: Array<{ id: string; overriddenText: string }>;
    textBox?: { x?: number; y?: number; width?: number; opacity?: number };
  }>;
};
```

失败：
- `404 { message: "课程不存在" }`
- `500 { message: "课件配置保存失败" }`

### `POST /api/courses/:id/publish`

行为：
- 自动保存当前配置（同PUT /presentation）。
- 将课程status从draft改为published；若已是published则为幂等操作（不重复写状态，仅保存配置并返回授课页URL）。
- 返回发布后的授课页URL `/courses/:id`。
- 已发布课程仍可回 Step5 继续编辑版式并再次保存/发布（2026-07-16 起放开，原「课程已发布」409 护栏已移除）。

失败：
- `400 { message: "请先生成课文草稿" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课程发布失败" }`

### 数据模型

```ts
type CoursePreviewResponse = {
  course: CoursePreviewCourse;
  presentation: CoursePresentationConfig;
  resourceProgress: CoursePreviewResourceProgress;
  canEdit: boolean; // draft=true, published=false
  pages: CoursePreviewPage[];
};

type CoursePreviewCourse = {
  id: string;
  title: string;
  status: "draft" | "published";
  teacherName: string | null;
  studentNames: string[];
};

type CoursePresentationConfig = {
  coverTheme: string;
  coverTitleFontSize: number;
  chapterTheme: string;
  slideTextOverrides: Record<string, SlideTextOverride>;
};

type SlideTextOverride = {
  textBlocks?: Array<{ blockId: string; overriddenText: string }>;
  textBox?: { x?: number; y?: number; width?: number; opacity?: number };
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
      type: "cover_pure";
      image: CoursePreviewImage;
    }
  | {
      id: string;
      type: "cover_title";
      image: CoursePreviewImage;
      title: string;
      teacherName: string | null;
      studentNames: string[];
      editable: boolean;
    }
  | {
      id: string;
      type: "chapter_divider";
      chapterIndex: number;
      chapterTitleEn: string;
      editable: boolean;
    }
  | {
      id: string;
      type: "shot_image";
      chapterId: string;
      chapterIndex: number;
      shotOrder: 1 | 2;
      image: CoursePreviewImage;
    }
  | {
      id: string;
      type: "shot_text";
      chapterId: string;
      chapterIndex: number;
      shotOrder: 1 | 2;
      image: CoursePreviewImage;
      blocks: CoursePreviewBlock[];
      textBox: TextBoxStyle;
      editable: boolean;
    }
  | {
      id: string;
      type: "closing_image";
      image: CoursePreviewImage;
    }
  | {
      id: string;
      type: "closing_text";
      image: CoursePreviewImage;
      blocks: CoursePreviewBlock[];
      textBox: TextBoxStyle;
      editable: boolean;
    };

type TextBoxStyle = {
  x: number;
  y: number;
  width: number;
  opacity: number;
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
      overriddenText?: string;
    }
  | {
      id: string;
      order: number;
      type: "exercise";
      exerciseId: string;
      answer: string;
      display: LessonBlankDisplay;
    };
```

## 数据库变更

需要新增Prisma migration：

1. `Course`表新增字段：
   - `status String @default("draft")` 取值 `"draft" | "published"`

2. 新增 `CoursePresentation`表：
   - `id String @id @default(cuid())`
   - `courseId String @unique`
   - `coverTheme String @default("dark")`
   - `coverTitleFontSize Float @default(1.0)`
   - `chapterTheme String @default("blue-purple")`
   - `slideOverrides Json @default("{}")` 存储每个slide的文本覆盖和文本框样式
   - `createdAt DateTime @default(now())`
   - `updatedAt DateTime @updatedAt`
   - 外键关联Course，级联删除

## 前端组件边界

建议组件：

**页面级组件：**
- `CourseCreatePreviewPage`：创建流Step5编辑页，三栏布局+标签切换
- `CoursePresenterPage`：发布后沉浸式授课投屏页
- `CoursePdfPrintView`：PDF打印预览视图，无交互

**编辑相关组件：**
- `PreviewEditorLayout`：三栏布局容器（顶栏+预览区+右侧属性面板）
- `PropertyPanel`：右侧属性编辑面板容器
- `CoverTitleProperties`：封面标题属性编辑（字号、蒙版主题）
- `ChapterDividerProperties`：章节分隔页属性编辑（配色主题选择）
- `SlideTextProperties`：文本页属性编辑（文本框位置/大小/透明度、文本编辑）
- `PublishButton`：发布课程按钮，带二次确认

**Slide渲染组件（共用）：**
- `CourseSlideDeck`：slide deck容器，管理当前页
- `SlideCoverPure`：纯封面页
- `SlideCoverTitle`：带文字封面页
- `SlideChapterDivider`：章节标题页
- `SlideShotImage`：绘本纯图片页
- `SlideShotText`：文本练习页，HTML模式支持点击填空切换答案
- `SlideClosingImage`：课后阅读纯图页
- `SlideClosingText`：课后阅读文本页
- `CoursePreviewImageFrame`：图片和各类占位状态渲染
- `PresentationControls`：底部悬浮翻页控制栏

## 测试范围

后端单元测试：
- 能正确生成页面序列：cover_pure -> cover_title -> chapter_divider -> shot_image -> shot_text（循环）-> closing_image -> closing_text
- CoursePresentation存在时，正确应用覆盖文本和样式配置
- cover_title正确返回课程标题、师生姓名
- chapter_divider正确返回章节序号和英文标题
- shot_text页面包含对应段落blocks，有覆盖文本时优先用覆盖文本
- blocks顺序与draft blocks一致
- closing页面复用封面图片，文本页无填空无词汇
- 成功图绑定publicUrl，缺图状态正确暴露
- PUT /presentation：draft状态可保存，published状态返回409
- POST /publish：发布成功后course.status变为published，已发布课程重复发布返回409
- 无lesson draft返回前置条件错误

前端组件测试：
- 创建流Step5三栏布局正确渲染，标签切换正常
- 点击slide元素选中后右侧属性面板显示对应编辑项
- 编辑属性后预览实时更新
- 未保存更改离开页面有确认提示
- 发布按钮点击后二次确认，发布成功跳转授课页
- 授课页 `/courses/:id` 全屏深色背景无导航，无编辑按钮
- 授课页底部控制栏鼠标静止自动隐藏
- 授课页点击填空切换答案显隐，支持键盘左右键翻页
- PDF打印预览所有填空只显示横线，答案隐藏，无交互
- cover_pure全幅无文字，cover_title正确渲染蒙版和文字
- chapter_divider使用选中的渐变主题
- shot_text磨砂玻璃文本框样式正确，文字不溢出
- closing页面复用封面图
- 缺图/失败显示占位符，draft状态下显示「回Step4处理」按钮，published状态只显示占位

## 验收标准

- 从 `/courses/:id/create/resources` 能进入Step5。
- Step5（draft状态）有三栏布局：顶栏（导航+标签+发布按钮）、居中预览区、右侧属性面板。
- Step5支持「课件预览」和「打印预览」标签切换。
- 点击slide上元素可选中，右侧面板出现对应编辑项。
- 可编辑封面标题字号/蒙版主题、章节渐变主题、文本框位置大小透明度、展示层正文文本。
- 编辑后预览实时更新，保存后刷新不丢失。
- Step5不能修改图片，图片问题有入口回Step4处理。
- Step5不能修改Step3原文，只能改展示层覆盖文本。
- 点击「发布课程」有二次确认，发布成功后跳转到 `/courses/:id`。
- `/courses/:id`（published状态）是纯净沉浸式投屏页，深色背景，无导航无编辑按钮。
- 授课页支持点击填空独立切换答案、键盘左右键翻页、全屏按钮。
- 授课页底部控制栏鼠标静止自动隐藏。
- 所有slide按正确顺序渲染：纯封面->标题封面->章节标题->纯图->文本（循环）->课后阅读图->课后阅读文本。
- 所有文本自动适配字号，不溢出文本框。
- PDF/打印预览所有填空只显示横线，答案和交互全部隐藏，16:9横版分页正确。
- 课后阅读复用封面图，不额外生成图片，文本页无填空无词汇。
- 未保存更改离开页面有提示。
- 资源未完成（有缺失/失败图片）时仍能预览和发布，缺图位置显示占位符。
- 发布后API拒绝编辑配置请求（409）。
- 新增Course表status字段和CoursePresentation表，有对应Prisma migration。
- Step4资源生成页面UI保持现有逻辑不变。

## 实现状态

- 2026-07-09：已实现基础HTML预览、学生版PDF预览、只读预览API和共用课程内容组件。
- 2026-07-09：从A4讲义改为16:9投屏PPT slide deck样式。
- 2026-07-13：Step5 课件预览编辑与发布模块完整实现：
  - **数据库**：`CourseStatus` 新增 `published`，新增 `CoursePresentation` 表（封面主题、字号、章节主题、slide文本覆盖和文本框样式），migration 已应用。
  - **后端**：重写 `course-preview` repository，支持 7 种 slide 类型顺序构建（cover_pure→cover_title→chapter_divider→shot_image/shot_text循环→closing_image→closing_text），正确应用覆盖文本；新增 `course-presentation` repository 处理配置保存和发布状态守卫；新增 3 个 API：`GET /preview`、`PUT /presentation`、`POST /publish`。
  - **前端 slide 组件**：7 个 slide 组件、`CoursePreviewImageFrame`（含缺图/生成中/失败/stale 占位）、`SlideBlocksRenderer`（点击填空切换答案，PDF只显示横线）。
  - **Deck 容器**：`CourseSlideDeck` 支持键盘左右/Home/End翻页、全屏、单页/全部渲染、editor/presenter 两种样式；`PresentationControls` 悬浮控制栏；`PresenterDeckClient` 实现鼠标静止 3 秒自动隐藏控制栏与鼠标。
  - **编辑面板**：`PropertyPanel` 集成封面蒙版/字号、章节配色主题、文本框位置/大小/透明度、展示层文本覆盖编辑与重置。
  - **页面**：`/courses/[id]/create/preview` 三栏编辑页（步骤导航+HTML/PDF标签+预览区+属性面板+保存草稿+发布确认）；`/courses/[id]` 发布后深色沉浸授课页（服务端状态校验，未发布重定向）。
  - **样式**：`globals.css` 新增 frosted-glass 磨砂玻璃、5 套章节渐变主题、字体自适应 clamp、打印分页 CSS。
  - **课程列表**：新增「已发布」状态（绿色），「待发布」状态（琥珀色），「预览」按钮自动跳转到对应页面。
- 验证结果：
  - `pnpm prisma:generate` ✓
  - `pnpm test`：95 passed（1 个预先存在的大base64超时测试无关）
  - `pnpm build` ✓ 构建成功，所有页面路由正确生成
- 待后续优化项：
  - 控制栏鼠标静止自动隐藏的过渡效果（presenter模式）
  - 更多封面/章节主题
  - 文本框位置拖拽调整
  - seed 脚本自动创建默认 presentation 记录
- 2026-07-16：发布流程与导航优化：
  - **问题1（改完回不了首页）**：Step5 顶栏在「返回资源生成」旁常驻「返回课程列表」按钮，`router.push("/courses")`，有未保存更改时 `window.confirm` 二次确认。
  - **问题2（进课程要先预览再发布）**：课程列表按状态区分操作——published 显示「授课」直达 `/courses/:id`，未发布显示「预览」直达 Step5；「编辑」始终保留（published→Step5，未发布→`nextEditPath`）；无课文草稿时「预览」置灰。`/courses/:id` 授课页职责不变。
  - **发布跳转**：发布成功后新标签打开授课页、当前标签返回 `/courses`（原为仅新标签打开、当前页停留）。
  - **已发布可编辑（后端放开护栏）**：删除 `CoursePublishStatusError` 与 `assertEditable`；`upsertPresentation` 不再拒绝 published；`publishCourse` 对已发布幂等（不重复写状态）；`toPreviewPages` 的 `editable` 恒为 true。发布确认弹窗文案更新为“发布后仍可回本页继续编辑版式”。
  - 验证：`pnpm vitest run` 126 passed；改动文件 `pnpm eslint` 无报错；`pnpm tsc` 错误数 11→10（均为预先存在的测试 mock 类型问题，非本次引入）。
