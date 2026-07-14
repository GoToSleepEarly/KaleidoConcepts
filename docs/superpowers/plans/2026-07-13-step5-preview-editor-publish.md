# Step5 课件预览/编辑/发布 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全重写Step5模块，实现课件预览编辑、样式调整、发布流程，以及发布后的纯净授课投屏页。删除旧的预览实现，不做兼容。

**Architecture:** 
- 数据层：Course表新增`published`状态，新增CoursePresentation表存储课件样式和文本覆盖。
- 后端：重写preview聚合API，新增presentation保存API和publish发布API；页面生成逻辑按新的7种slide类型顺序构建。
- 前端：拆分slide渲染组件（7种），创建流页用三栏布局（顶栏+预览区+右侧属性面板），发布后是独立的只读投屏深色沉浸页。
- 样式：16:9 PPT slide deck，封面蒙版、渐变章节页、磨砂玻璃文本框、字体自适应不溢出。

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, Tailwind CSS, Vitest

---

## 需要删除的旧文件/旧代码

- [ ] 删除 `lib/server/repositories/course-preview.ts` （完全重写）
- [ ] 删除 `features/courses/components/course-preview.tsx` （完全重写，拆成多个组件）
- [ ] 删除 `app/courses/[id]/pdf/page.tsx` （PDF合并到Step5标签切换，不单独路由）
- [ ] 删除 `docs/superpowers/plans/2026-07-09-course-preview-and-pdf.md` （旧计划）

---

### Task 1: 数据库 Schema 更新与 Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_course_presentation/migration.sql`

- [ ] **Step 1: 修改 Prisma schema**

在 `CourseStatus` enum 中添加 `published`：

```prisma
enum CourseStatus {
  draft
  building_resources
  ready
  build_failed
  published
}
```

在 `Course` model 后新增 `CoursePresentation` model：

```prisma
model CoursePresentation {
  courseId          String  @id
  coverTheme        String  @default("dark")
  coverTitleFontSize Float  @default(1.0)
  chapterTheme      String  @default("blue-purple")
  slideOverrides    Json    @default("{}")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  course            Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
}
```

在 `Course` model 中添加关系：

```prisma
presentation   CoursePresentation?
```

- [ ] **Step 2: 生成 migration**

Run: `pnpm prisma:migrate --name add_course_presentation`

Expected: 生成新的migration文件，包含新增enum值和新表。

- [ ] **Step 3: 生成 Prisma Client**

Run: `pnpm prisma:generate`

Expected: 无报错。

- [ ] **Step 4: 运行现有测试确认无破坏**

Run: `pnpm test`

Expected: 现有测试通过。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(step5): add CoursePresentation model and published status"
```

---

### Task 2: 更新类型合同

**Files:**
- Modify: `lib/contracts/api.ts`

- [ ] **Step 1: 更新 CourseStatus 类型**

在 `lib/contracts/api.ts` 中更新：

```ts
export type CourseStatus = "draft" | "building_resources" | "ready" | "build_failed" | "published";
```

- [ ] **Step 2: 替换旧的预览类型**

删除旧的 `CoursePreviewCourse`、`CoursePreviewPage`、`CoursePreviewResponse`、`CoursePreviewImage`、`CoursePreviewExercise`、`CoursePreviewBlock`（在 `lib/contracts/api.ts` 中从183行开始的旧定义），替换为新类型：

```ts
export type CoursePreviewImage = {
  status: ResourceImageStatus;
  publicUrl: string | null;
  stale: boolean;
  failureReason: string | null;
};

export type CoursePreviewCourse = {
  id: string;
  title: string;
  status: CourseStatus;
  teacherName: string | null;
  studentNames: string[];
};

export type CoursePresentationConfig = {
  coverTheme: string;
  coverTitleFontSize: number;
  chapterTheme: string;
  slideOverrides: Record<string, SlideTextOverride>;
};

export type SlideTextOverride = {
  textBlocks?: Array<{ blockId: string; overriddenText: string }>;
  textBox?: { x?: number; y?: number; width?: number; opacity?: number };
};

export type TextBoxStyle = {
  x: number;
  y: number;
  width: number;
  opacity: number;
};

export type CoursePreviewBlock =
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

export type CoursePreviewPage =
  | {
      id: string;
      type: "cover_pure";
      image: CoursePreviewImage;
      editable: boolean;
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
      editable: boolean;
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
      editable: boolean;
    }
  | {
      id: string;
      type: "closing_text";
      image: CoursePreviewImage;
      blocks: CoursePreviewBlock[];
      textBox: TextBoxStyle;
      editable: boolean;
    };

export type CoursePreviewResponse = {
  course: CoursePreviewCourse;
  presentation: CoursePresentationConfig;
  resourceProgress: CoursePreviewResourceProgress;
  canEdit: boolean;
  pages: CoursePreviewPage[];
};

export type CoursePresentationUpdate = {
  coverTheme: string;
  coverTitleFontSize: number;
  chapterTheme: string;
  slideOverrides: Record<string, SlideTextOverride>;
};
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm tsc --noEmit`

Expected: 会有类型错误因为旧代码还引用旧类型，继续下一个任务删除旧代码后解决。

- [ ] **Step 4: Commit**

```bash
git add lib/contracts/api.ts
git commit -m "feat(step5): update API contract types for new slide model"
```

---

### Task 3: 删除旧预览实现代码

**Files:**
- Delete: `lib/server/repositories/course-preview.ts`
- Delete: `features/courses/components/course-preview.tsx`
- Delete: `app/courses/[id]/pdf/page.tsx`

- [ ] **Step 1: 删除旧文件**

```bash
rm lib/server/repositories/course-preview.ts
rm features/courses/components/course-preview.tsx
rm app/courses/[id]/pdf/page.tsx
```

- [ ] **Step 2: 清理引用**

搜索并删除/注释对 `course-preview.ts` 和 `course-preview.tsx` 的旧引用。

检查并更新以下文件：
- `app/api/courses/[id]/preview/route.ts` - 暂时清空内容，下个任务重写
- `app/courses/[id]/page.tsx` - 暂时清空内容，后续重写
- `app/courses/[id]/create/preview/page.tsx` - 暂时清空内容，后续重写

这些文件在后续任务中会重写，暂时可以先放一个简单的"建设中"占位：

`app/courses/[id]/page.tsx`:
```tsx
export default function CoursePresenterPage() {
  return <div className="flex min-h-screen items-center justify-center">正在建设中...</div>;
}
```

同样处理其他两个页面。

- [ ] **Step 3: 运行类型检查确认只有预期的错误**

Run: `pnpm tsc --noEmit`

Expected: 页面/API文件暂时是占位，但不应有其他模块的类型错误。

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor(step5): remove old preview implementation"
```

---

### Task 4: 实现后端 Preview Repository（带单元测试）

**Files:**
- Create: `lib/server/repositories/course-preview.test.ts`
- Create: `lib/server/repositories/course-preview.ts`

- [ ] **Step 1: 写失败的单元测试**

创建 `lib/server/repositories/course-preview.test.ts`，测试覆盖：

```ts
import { describe, expect, test } from "vitest";
import { toPreviewPages } from "./course-preview";
// 辅助函数构造最小mock draft
```

测试用例：
1. 纯封面+标题封面：返回pages[0]是cover_pure，pages[1]是cover_title，正确绑定图片
2. 章节分隔页：正确生成chapter_divider，chapterIndex和chapterTitleEn正确
3. 每章2shot：每个shot生成shot_image和shot_text两页，顺序正确
4. shot_text页面包含blocks：text和exercise块顺序正确，exercise块带answer
5. 课后阅读：最后两页是closing_image和closing_text，复用封面图，closing_text无exercise块
6. presentation覆盖文本：当slideOverrides有覆盖时，blocks中overriddenText优先
7. textbox默认样式：shot_text和closing_text返回默认TextBoxStyle
8. 图片状态：missing/pending/succeeded/failed正确映射
9. editable字段：当course status是draft/ready/build_failed时canEdit=true，published时canEdit=false

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test lib/server/repositories/course-preview.test.ts`

Expected: FAIL，因为toPreviewPages还没实现。

- [ ] **Step 3: 实现 course-preview repository**

创建 `lib/server/repositories/course-preview.ts`：

```ts
// 类型导入
// 错误类：CoursePreviewNotFoundError, CoursePreviewPrerequisiteError

// 辅助函数：
// - teacherDisplayName, studentDisplayName
// - paragraphForShot: 根据sourceParagraphId找paragraph
// - blocksForParagraph: 将paragraph的sentences展开为text/exercise blocks
// - chapterTitleEn: 生成英文标题 "Chapter 1: xxx"（简单从chapter.title生成或返回chapter.title）

// 核心函数：
export function toPreviewPages(
  courseId: string,
  draft: LessonDraft,
  imageRecords: CourseImageRecord[],
  plan: CourseResourcePlan | null,
  presentation: CoursePresentationConfig | null,
  courseStatus: CourseStatus,
  coverImage: CoursePreviewImage
): CoursePreviewPage[]

// 主函数：
export async function getCoursePreview(db: CoursePreviewDb, courseId: string): Promise<CoursePreviewResponse>
```

页面构建顺序严格按照：
1. cover_pure
2. cover_title（带title, teacherName, studentNames）
3. 按chapter顺序遍历，每个chapter先出chapter_divider，再遍历2个shot，每个shot出shot_image+shot_text
4. closing_image（复用coverImage）
5. closing_text（blocks来自closingReading的sentences转text blocks）

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test lib/server/repositories/course-preview.test.ts`

Expected: 所有测试PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/server/repositories/course-preview.ts lib/server/repositories/course-preview.test.ts
git commit -m "feat(step5): implement new course-preview repository with 7 slide types"
```

---

### Task 5: 实现 Presentation Repository 和 API 路由

**Files:**
- Create: `lib/server/repositories/course-presentation.ts`
- Create: `lib/server/repositories/course-presentation.test.ts`
- Modify: `app/api/courses/[id]/preview/route.ts`
- Create: `app/api/courses/[id]/presentation/route.ts`
- Create: `app/api/courses/[id]/publish/route.ts`

- [ ] **Step 1: 写失败的单元测试**

测试：
1. upsertPresentation：draft课程能保存presentation配置
2. upsertPresentation：published课程保存返回409错误
3. publishCourse：draft/ready课程发布后状态变为published，并自动保存presentation
4. publishCourse：已published课程发布返回409
5. publishCourse：无lessonDraft返回前置条件错误

- [ ] **Step 2: 实现 course-presentation repository**

```ts
// getPresentation(courseId): CoursePresentationConfig
// upsertPresentation(courseId, data): CoursePresentationConfig（draft/ready/build_failed时允许）
// publishCourse(courseId): 自动保存presentation并更新status为published
```

- [ ] **Step 3: 实现 GET /api/courses/[id]/preview/route.ts**

使用新的 `getCoursePreview`，返回CoursePreviewResponse。

- [ ] **Step 4: 实现 PUT /api/courses/[id]/presentation/route.ts**

接收CoursePresentationUpdate请求体，调用upsertPresentation。

- [ ] **Step 5: 实现 POST /api/courses/[id]/publish/route.ts**

调用publishCourse，成功返回 `{ redirectUrl: `/courses/${id}` }`。

- [ ] **Step 6: 运行所有后端测试**

Run: `pnpm test`

Expected: 所有测试PASS。

- [ ] **Step 7: Commit**

```bash
git add lib/server/repositories/course-presentation.ts lib/server/repositories/course-presentation.test.ts app/api/
git commit -m "feat(step5): add presentation save and publish APIs"
```

---

### Task 6: 实现共用 Slide 渲染组件

**Files:**
- Create: `features/courses/components/slides/slide-types.ts`
- Create: `features/courses/components/slides/slide-cover-pure.tsx`
- Create: `features/courses/components/slides/slide-cover-title.tsx`
- Create: `features/courses/components/slides/slide-chapter-divider.tsx`
- Create: `features/courses/components/slides/slide-shot-image.tsx`
- Create: `features/courses/components/slides/slide-shot-text.tsx`
- Create: `features/courses/components/slides/slide-closing-image.tsx`
- Create: `features/courses/components/slides/slide-closing-text.tsx`
- Create: `features/courses/components/slides/course-preview-image-frame.tsx`
- Create: `features/courses/components/slides/index.ts`

- [ ] **Step 1: 创建slide基础类型和ImageFrame组件**

`course-preview-image-frame.tsx`：
- succeeded且有publicUrl：用next/image全幅铺满（fill, object-cover）
- missing/pending/submitting/generating：显示生成中占位
- failed：显示失败占位，draft/canEdit时显示"回Step4处理"链接
- stale：成功图上加"内容已变化"角标

- [ ] **Step 2: 实现 SlideCoverPure**

全幅图片铺满，无任何文字，`aspect-video w-full h-full relative`。

- [ ] **Step 3: 实现 SlideCoverTitle**

- 背景：同一张封面图全幅铺满
- 蒙版：深色渐变（从顶部透明到底部深色，或整体bg-black/40）
- 文字：白色系统字体，标题响应式居中，下方小字老师/学生姓名
- 根据presentation.coverTheme和coverTitleFontSize应用样式

- [ ] **Step 4: 实现 SlideChapterDivider**

- 背景：根据presentation.chapterTheme应用渐变（预设3-5套：blue-purple, green-teal, orange-red, purple-pink, blue-indigo）
- 文字：白色无衬线字体，居中显示 "Chapter N: {chapterTitleEn}"
- 提供默认blue-purple渐变

- [ ] **Step 5: 实现 SlideShotImage**

全幅图片铺满，无文字无蒙版。

- [ ] **Step 6: 实现 SlideShotText**

- 背景：同一张shot图全幅铺满，不模糊
- 蒙版：`bg-black/40` 或 `bg-gradient-to-b from-black/20 to-black/50`
- 文本框：居中半透明白色磨砂玻璃（backdrop-blur-md bg-white/80 rounded-2xl），大padding
- 文本框位置：根据textBox配置定位，默认居中
- 文本内容：渲染blocks，text块显示普通文本，exercise块显示填空横线
- HTML模式（canEdit或授课页）：点击exercise块切换显示答案/横线
- PDF模式：只显示填空横线 `________`，不显示答案
- 字体自适应：使用CSS `clamp()` 或JS根据文本长度调整字号，保证不溢出文本框（行高≥1.6）

- [ ] **Step 7: 实现 SlideClosingImage**

复用封面图全幅铺满，和SlideCoverPure类似。

- [ ] **Step 8: 实现 SlideClosingText**

背景封面图+蒙版，磨砂玻璃文本框，只有text blocks（无exercise），纯阅读文本。

- [ ] **Step 9: 创建index导出**

统一导出所有slide组件和类型。

- [ ] **Step 10: 运行类型检查**

Run: `pnpm tsc --noEmit`

Expected: slide组件无类型错误。

- [ ] **Step 11: Commit**

```bash
git add features/courses/components/slides/
git commit -m "feat(step5): implement all 7 slide rendering components"
```

---

### Task 7: 实现 Slide Deck 容器和控制栏

**Files:**
- Create: `features/courses/components/course-slide-deck.tsx`
- Create: `features/courses/components/presentation-controls.tsx`

- [ ] **Step 1: 实现 PresentationControls**

底部悬浮半透明控制栏props：
- `currentSlide: number`
- `totalSlides: number`
- `onPrevious: () => void`
- `onNext: () => void`
- `onReset: () => void`
- `onFullscreen?: () => void`
- `showFullscreenButton?: boolean`
- `variant?: "editor" | "presenter"`（editor是浅色背景下的深色控制栏，presenter是深色背景下的半透明黑控制栏）
- 鼠标静止3秒自动淡出（仅presenter模式）

支持键盘左右方向键翻页（在deck组件里处理，控制栏只渲染UI）。

- [ ] **Step 2: 实现 CourseSlideDeck**

props：
- `pages: CoursePreviewPage[]`
- `mode: "html" | "pdf"`
- `canEdit: boolean`
- `selectedPageId?: string`（编辑模式下选中的页面id）
- `onSelectPage?: (pageId: string) => void`（编辑模式下点击页面选中）
- `showAllPages?: boolean`（pdf模式一次性渲染所有页，html模式只渲染当前页）

功能：
- 管理currentSlide状态
- 键盘事件监听左右方向键翻页
- 渲染当前页（或所有页）
- 渲染PresentationControls
- 编辑模式下点击slide触发onSelectPage

- [ ] **Step 3: 运行类型检查**

Run: `pnpm tsc --noEmit`

Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add features/courses/components/course-slide-deck.tsx features/courses/components/presentation-controls.tsx
git commit -m "feat(step5): add slide deck container and presentation controls"
```

---

### Task 8: 实现右侧属性编辑面板

**Files:**
- Create: `features/courses/components/preview-editor/property-panel.tsx`
- Create: `features/courses/components/preview-editor/cover-title-properties.tsx`
- Create: `features/courses/components/preview-editor/chapter-divider-properties.tsx`
- Create: `features/courses/components/preview-editor/slide-text-properties.tsx`
- Create: `features/courses/components/preview-editor/index.ts`

- [ ] **Step 1: 定义属性面板props**

PropertyPanel接收：
- `selectedPage: CoursePreviewPage | null`
- `presentation: CoursePresentationConfig`
- `onChange: (config: Partial<CoursePresentationConfig>) => void`
- `onTextOverrideChange: (pageId: string, blockId: string, text: string) => void`

根据选中页面类型渲染不同的属性编辑器。

- [ ] **Step 2: 实现 CoverTitleProperties**

- 封面蒙版主题选择：预设3-4个选项（dark/light/warm/gradient），点击预览切换
- 标题字号：滑块调整 0.8x ~ 1.5x

- [ ] **Step 3: 实现 ChapterDividerProperties**

- 章节配色主题选择：3-5套预设渐变（blue-purple/green-teal/orange-red/purple-pink/blue-indigo），点击预览色块切换

- [ ] **Step 4: 实现 SlideTextProperties**

- 文本框透明度：滑块调整
- 文本框宽度：滑块调整（60% ~ 90%）
- 文本编辑：显示可编辑的文本块列表，支持修改覆盖文本
- 恢复默认按钮：重置该slide的覆盖文本

- [ ] **Step 5: 组合 PropertyPanel**

未选中页面时显示全局设置（默认封面主题、默认章节主题）；选中页面时显示对应属性编辑器。

- [ ] **Step 6: 运行类型检查**

Run: `pnpm tsc --noEmit`

Expected: 无类型错误。

- [ ] **Step 7: Commit**

```bash
git add features/courses/components/preview-editor/
git commit -m "feat(step5): implement right-side property editor panel"
```

---

### Task 9: 实现创建流 Step5 预览编辑页

**Files:**
- Rewrite: `app/courses/[id]/create/preview/page.tsx`

- [ ] **Step 1: 创建页面组件结构**

三栏布局：
- **TopBar** (fixed顶部)：
  - 左侧：CourseCreateSteps currentStep={5}
  - 中间：Tab切换「课件预览」/「打印预览」
  - 右侧：「返回Step4」Link（次要按钮）、「保存草稿」Button、「发布课程」主按钮（带二次确认）
- **Main area**（顶部留出topbar高度）：
  - 浅色/白色背景（bg-gray-50）
  - 居中放置16:9预览容器（max-w-7xl，居中，shadow-lg）
  - 预览区域底部悬浮PresentationControls（variant="editor"）
  - 点击预览中的slide元素时选中该页面，右侧面板显示对应属性
- **Right Panel**：
  - 固定右侧宽度（w-80），白色背景，border-l
  - 渲染PropertyPanel
  - 有未保存更改时显示红点提示

- [ ] **Step 2: 实现数据加载和保存逻辑**

- 使用SWR或useEffect+fetch加载preview数据
- 本地state保存presentation配置，编辑时更新本地状态
- 「保存草稿」按钮：PUT /presentation，乐观更新
- 「发布课程」按钮：二次确认modal -> POST /publish -> 成功后router.push(`/courses/${id}`)
- 离开页面前（beforeunload）有未保存更改时提示

- [ ] **Step 3: 实现HTML/PDF标签切换**

- 课件预览（默认）：mode="html"，canEdit=true，一次显示一页slide deck
- 打印预览：mode="pdf"，一次性渲染所有slide，填空只显示横线，顶部显示「打印」按钮

- [ ] **Step 4: 运行类型检查和构建**

Run: `pnpm tsc --noEmit && pnpm build`

Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add app/courses/[id]/create/preview/page.tsx
git commit -m "feat(step5): implement create-flow preview editor page with 3-column layout"
```

---

### Task 10: 实现发布后授课投屏页

**Files:**
- Rewrite: `app/courses/[id]/page.tsx`

- [ ] **Step 1: 实现授课页（只读沉浸模式）**

- 只有course.status==="published"可访问，否则重定向到create/preview或courses列表
- 全屏深色近黑背景（bg-slate-950），无导航无侧边栏
- 16:9 slide垂直水平居中
- 使用CourseSlideDeck，variant="presenter"
- PresentationControls：
  - 鼠标静止3秒自动淡出隐藏
  - 按钮：回到开头、上一页、页码、下一页、全屏按钮
- 支持键盘左右键翻页
- 点击填空独立切换答案显隐（默认隐藏答案，只显示横线）
- 完全只读，无任何编辑/保存/返回按钮
- 浏览器打印（Ctrl/CMD+P）时自动应用PDF打印样式

- [ ] **Step 2: 添加路由守卫**

在页面中：先fetch preview数据，如果course.status不是published，redirect到 `/courses/${id}/create/preview`。

- [ ] **Step 3: 运行类型检查和构建**

Run: `pnpm tsc --noEmit && pnpm build`

Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add app/courses/[id]/page.tsx
git commit -m "feat(step5): implement published presenter mode page"
```

---

### Task 11: 添加全局样式与字体自适应CSS

**Files:**
- Modify: `app/globals.css` (或对应的全局样式文件)

- [ ] **Step 1: 添加slide基础样式**

```css
.preview-slide {
  aspect-ratio: 16 / 9;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}

.preview-deck-pdf .preview-slide {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
}

/* 打印样式 */
@media print {
  body * { visibility: hidden; }
  .preview-deck-pdf, .preview-deck-pdf * { visibility: visible; }
  .preview-deck-pdf { position: absolute; left: 0; top: 0; }
  .preview-slide { break-after: page; page-break-after: always; }
  .print-hidden { display: none !important; }
}

/* 磨砂玻璃 */
.frosted-glass {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
```

- [ ] **Step 2: 实现字体自适应逻辑**

在SlideShotText和SlideCoverTitle、SlideClosingText中：
- 使用CSS `clamp()` 设置响应式字号
- 文本内容使用 `text-wrap: balance` 或 `text-wrap: pretty`
- 文本框设置 `overflow: hidden` 防止溢出
- 可以使用一个简单的JS hook根据内容长度动态调整font-size（作为保底）

- [ ] **Step 3: 预设章节渐变主题**

定义一组CSS类：
```css
.theme-blue-purple { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.theme-green-teal { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
.theme-orange-red { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.theme-purple-pink { background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%); }
.theme-blue-indigo { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
```

封面蒙版主题：
```css
.cover-theme-dark { background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 100%); }
.cover-theme-warm { background: linear-gradient(to bottom, rgba(255,140,0,0.2) 0%, rgba(0,0,0,0.6) 100%); }
```

- [ ] **Step 4: 运行构建验证**

Run: `pnpm build`

Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(step5): add global slide styles, print CSS, theme gradients"
```

---

### Task 12: 更新seed脚本、课程列表状态文案、全面测试

**Files:**
- Modify: `prisma/seed.ts`（确保seed的课程有CoursePresentation）
- Modify: `features/courses/components/courses-manager.tsx`（添加published状态文案和跳转）
- Modify: `lib/server/repositories/courses.ts`（查询课程时include presentation）

- [ ] **Step 1: 更新seed脚本**

seed课程时同步创建CoursePresentation记录（可以在seed.ts中upsert）。

- [ ] **Step 2: 更新课程列表**

- 状态文案添加 `published: "已发布"`
- 状态样式添加 `published: "bg-green-50 text-green-700"` 或蓝色
- 已发布课程的「进入」按钮跳转到 `/courses/:id`（授课页）而不是create/preview

- [ ] **Step 3: 更新courses repository查询**

查询课程列表和课程详情时include presentation关系。

- [ ] **Step 4: 运行全部测试**

Run: `pnpm test`

Expected: 所有测试PASS。

- [ ] **Step 5: 运行lint**

Run: `pnpm lint`

Expected: 无lint错误。

- [ ] **Step 6: 运行build**

Run: `pnpm build`

Expected: 构建成功。

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat(step5): complete rewrite with editor, publish flow, and presenter mode"
```

---

### Task 13: 更新模块文档实现状态

**Files:**
- Modify: `docs/frontend/course-preview-and-pdf.md`

- [ ] **Step 1: 更新实现记录**

在文档末尾记录本次实现的提交号、验证命令完成情况。

- [ ] **Step 2: 最终Commit**

```bash
git add docs/frontend/course-preview-and-pdf.md
git commit -m "docs(step5): update implementation status"
```
