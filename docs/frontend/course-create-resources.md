# 新建课程 Step 4：资源生成模块说明

## 模块目标

本模块覆盖新建课程流程第四步：基于 Step 3 已确认的 `LessonDraft` 图片分镜，为每个 chapter shot 生成课程图片资产，并持久化图片状态和本地文件。

Step 4 是图片资源生成，不修改课文草稿内容，不生成预览页或 PDF。

## 输入边界

必须读取：
- Step 3 `LessonDraft`
- `LessonDraft.visualStyle`
- `LessonDraft.characters`
- `LessonDraft.chapters[].shots[]`
- 已存在的 `course_images`

对齐规则：
- 每个 `LessonShot.imageSlotId` 对应一个图片槽。
- 每个 chapter 仍固定 2 个 shot 图片。
- 图片生成 prompt 来自 shot 语义、全局视觉风格和人物一致性描述。
- `sourceHash` 由当前图片输入内容生成，包括 shot prompt、composition、continuityNotes、visualStyle 和相关 characters。
- `sourceHash` 一致且状态为 `succeeded` 的图片可直接复用。
- `sourceHash` 变化但已有成功图时，页面提示内容已变化，由用户选择沿用旧图或重新生成。

## 本期范围

生成：
- 每章 2 张 shot 图片
- 图片任务状态
- 腾讯混元远端任务 id
- 图片本地持久化文件
- 图片公开访问路径
- 失败原因

不生成：
- 封面图
- closing reading 图
- HTML / PDF
- 预览页
- 用户手动新增图片槽
- 成功图片的任意重生成
- 多版本图片历史

TODO：
- 封面图 prompt 应由 Step 3 AI 生成，并在后续模块中接入封面图生成。

## 页面行为

入口：
- `/courses/:id/create/resources`

加载时：
- 调用 `GET /api/courses/:id/resources`
- 展示所有 chapter shot 图片槽
- 不自动创建生成任务，不自动消耗腾讯额度
- 若有 `generating` / `pending` / `submitting` 图片，页面每 2-3 秒轮询

页面展示：
- 总进度：成功数 / 总数、生成中数、失败数、内容已变化数
- 按章节分组的图片列表
- 每张图片显示：
  - 章节标题
  - shot order
  - shot action / scenePrompt
  - 当前状态
  - 图片预览或占位
  - 失败原因
  - 内容已变化提示

主要操作：
- 点击“生成全部缺失图片”调用 `POST /api/courses/:id/resources/generate`
- 失败图片可点击重试
- 内容已变化图片可选择：
  - 沿用旧图
  - 重新生成
- 成功且未过期图片只展示，不提供任意重生成

状态文案：
- `missing`：未生成
- `pending`：排队中
- `submitting`：提交中
- `generating`：生成中
- `succeeded`：已完成
- `failed`：生成失败
- `stale`：草稿内容已变化

## API 合同

### `GET /api/courses/:id/resources`

行为：
- 读取课程、LessonDraft 和 `course_images`
- 计算当前所有 shot 图片槽
- 标记缺失图片和内容已变化图片
- 推进图片队列：
  - 查询 `generating` 图片的腾讯任务状态
  - 成功后下载图片到本地持久化目录
  - 失败后记录失败原因
  - 有空位时提交下一个 `pending` 图片任务
- 返回最新图片状态和进度

响应：

```ts
{
  progress: {
    total: number;
    succeeded: number;
    generating: number;
    failed: number;
    missing: number;
    stale: number;
  };
  images: CourseResourceImage[];
}
```

失败：
- `400 { message: "请先生成课文草稿" }`
- `404 { message: "课程不存在" }`
- `500 { message: "资源状态加载失败" }`

### `POST /api/courses/:id/resources/generate`

行为：
- 读取 LessonDraft 中所有 shot 图片槽
- 为缺失图片创建 `pending` 记录
- 不覆盖已成功图片
- 不自动重生成 stale 图片
- 将课程状态更新为 `building_resources`

响应：

```ts
{
  progress: ResourceProgress;
  images: CourseResourceImage[];
}
```

失败：
- `400 { message: "请先生成课文草稿" }`
- `400 { message: "没有需要生成的图片" }`
- `404 { message: "课程不存在" }`
- `500 { message: "资源生成任务创建失败" }`

### `POST /api/courses/:id/resources/images/:imageId/retry`

行为：
- 仅允许 `failed` 图片，或 `sourceHash` 已过期的成功图片
- 重新写入当前 prompt 和 `sourceHash`
- 清空旧的远端任务字段、失败原因和本地路径
- 状态置为 `pending`
- 将课程状态更新为 `building_resources`

响应：

```ts
{
  image: CourseResourceImage;
}
```

失败：
- `400 { message: "当前图片状态不能重试" }`
- `404 { message: "图片不存在" }`
- `500 { message: "图片重试失败" }`

### `POST /api/courses/:id/resources/images/:imageId/keep`

行为：
- 仅允许已有成功图片且当前 `sourceHash` 已变化
- 将图片 `sourceHash` 更新为当前 hash
- 保留原本地图片文件

响应：

```ts
{
  image: CourseResourceImage;
}
```

失败：
- `400 { message: "当前图片不能沿用旧图" }`
- `404 { message: "图片不存在" }`
- `500 { message: "沿用旧图失败" }`

## 数据结构

新增 Prisma 表 `CourseImage`。

```ts
type CourseImageStatus = "pending" | "submitting" | "generating" | "succeeded" | "failed";
type CourseImageSlotType = "lesson_shot";
type CourseImageProvider = "tencent_hunyuan";

type CourseResourceImage = {
  id: string;
  courseId: string;
  chapterId: string;
  shotId: string;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  prompt: string;
  sourceHash: string;
  currentSourceHash: string;
  stale: boolean;
  status: CourseImageStatus | "missing";
  provider: CourseImageProvider;
  providerTaskId: string | null;
  providerImageUrl: string | null;
  publicUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Prisma 字段：
- `id`
- `courseId`
- `chapterId`
- `shotId`
- `slotId`
- `slotType`
- `slotIndex`
- `prompt`
- `sourceHash`
- `status`
- `provider`
- `providerTaskId`
- `providerImageUrl`
- `storagePath`
- `publicUrl`
- `failureReason`
- `createdAt`
- `updatedAt`

约束：
- `@@unique([courseId, slotId])`
- `@@index([courseId, status])`
- `CourseImage.courseId` 级联删除

本期不新增 `course_image_jobs`。每张图片就是一个当前任务；后续如果需要保留多版本和历史任务，再拆 job 表。

## 腾讯混元适配

供应商：
- 腾讯混元生图 3.0 API

调用方式：
- 提交文生图任务，保存腾讯远端 task id
- 轮询查询任务状态
- 成功后下载腾讯返回的图片 URL
- 图片保存到 `STORAGE_DIR/course-images/:courseId/:imageId.png`
- 课程页面使用本地 `publicUrl`，不依赖腾讯远端 URL

默认规格：
- 4:3
- 1024x768

环境变量：
- `TENCENTCLOUD_SECRET_ID`
- `TENCENTCLOUD_SECRET_KEY`
- `TENCENTCLOUD_REGION`
- `TENCENT_HUNYUAN_IMAGE_MODEL`
- `STORAGE_DIR`

实现模块建议：
- `lib/server/ai/tencent-hunyuan-image.ts`
- `lib/server/storage/course-images.ts`
- `lib/server/repositories/course-images.ts`

## 队列推进策略

MVP 不引入 Worker、MQ、WebSocket 或定时任务。

`GET /api/courses/:id/resources` 负责轻量推进队列：
1. 查询当前课程所有 `generating` 图片。
2. 对每个 `generating` 图片查询腾讯任务状态。
3. 成功则下载本地图片并标记 `succeeded`。
4. 失败则标记 `failed` 并记录 `failureReason`。
5. 如果没有活跃提交，选择一个 `pending` 图片提交腾讯任务。
6. 根据最新图片状态更新课程状态。

由于腾讯默认并发较低，本期按单课程单活跃任务推进。页面轮询时可以持续生成，刷新页面后仍可恢复。

## 失败恢复

图片状态恢复：
- `pending`：等待轮询提交
- `submitting`：提交腾讯任务中；提交失败转 `failed`
- `generating`：已有腾讯 task id；轮询查询结果
- `succeeded`：已有本地图片，可用于后续预览和 PDF
- `failed`：展示失败原因，可重试

下载失败：
- 不标记成功
- 保留 `providerImageUrl`
- 记录 `failureReason`
- 允许重试

内容变化：
- 不自动生成新图
- 页面展示 `stale`
- 用户可选择沿用旧图或重新生成

课程状态：
- 开始创建图片任务后更新为 `building_resources`
- 全部图片成功后更新为 `ready`
- 存在失败且没有活跃任务时更新为 `build_failed`
- 存在 pending / submitting / generating 时保持 `building_resources`

## 校验规则

- 课程必须存在。
- 课程必须已有 `LessonDraft`。
- 每个 LessonDraft chapter 必须有 2 个 shots。
- 每个 shot 必须有非空 `imageSlotId`、`scenePrompt`、`composition`、`continuityNotes`。
- 只能为 `lesson_shot` 槽创建图片。
- 不允许在成功且未过期图片上随意重生成。
- 不允许把腾讯远端 URL 当作长期课程图片地址。
- `structured_lesson` 和 `lesson_draft` 不保存图片 URL、prompt 或状态。

## 实现状态

- 状态：已确认，待开发
- 实现提交：待记录
- 验证命令：待开发后记录
- 验证结果：待开发后记录
