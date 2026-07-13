# 新建课程 Step 4：绘本资源生成优化方案

## 文档状态

- 状态：优化方案已确认，待开发
- 优化原因：当前实现存在画面质量低、人物不一致、镜头没有突出正文重点、不同图片可能覆盖重复正文，以及 4:3 图片与 16:9 课件不匹配的问题。
- 本文档替代旧版“直接按段落独立文生图”的方案，后续开发以本文为准。

## 模块目标

Step 4 将 Step 3 已确认的课文转换为可用于 PPT 式授课的连续绘本图片。

最终结果包括：

- 1 张经过用户确认的视觉基准封面。
- 每章固定 2 张正文插图。
- 每张正文插图与唯一的原文范围建立可追踪映射。
- 所有图片保持统一人物、环境和绘本风格。
- Step 5 按“图片页 -> 对应文本 / 练习页”顺序播放。

Step 4 不修改课文、知识点或习题，不生成 Closing Reading 图片，不生成 PDF。

## 根因与优化原则

旧实现的问题不只是 prompt 不够详细，而是生成链路缺少稳定输入：

1. Step 3 当前数据没有可靠的视觉风格和角色外貌结构，Step 4 实际只能使用通用绘本描述。
2. 按段落机械生成图片，没有先选择最值得表现的故事瞬间。
3. 每张图片独立文生图，没有共同参考图，人物一致性无法只靠文本保证。
4. 图片与正文缺少句子级覆盖关系，无法证明两张图没有重复表达同一片段。
5. 当前图片为 4:3，而课件画布为 16:9，只能留白或裁切。

因此本次优化不继续堆叠通用 prompt，而是建立以下最小闭环：

1. 从现有课文和人物档案中生成可编辑的视觉设定。
2. 将全部主要人物、主要背景和整体风格合成一张视觉基准封面。
3. 用户确认封面后，封面作为所有正文插图的共同参考图。
4. 先确定每张图覆盖的原文和主镜头，再生成图片。
5. 保存结构化来源、参考图和 prompt 版本，使失败可恢复、成功可复用。

## 用户流程

### 阶段一：视觉基准封面

页面首先由用户主动点击生成完整资源方案。该动作调用一次文本 AI，基于 Step 3 课文、Step 2 故事大纲、课程信息和人物档案一次性产出：

- 老师可感知和修改的整体视觉设定。
- 封面视觉描述。
- 每章固定 2 张图片的自动分镜规划。

老师只查看和修改：

- 整体绘本风格，默认以手绘漫画风格为基础。
- 色彩方案。
- 主要背景 / 世界观。
- 主要人物形象，包括外貌、发型、服装、配饰和标志色。

老师不编辑关键物件、封面构图、章节分镜、句子范围、连续性说明或最终 prompt。上述内容全部由资源方案自动生成并由后端校验。

用户不能在 Step 4 修改：

- 人物身份和角色别名
- 课文正文
- 故事情节
- 知识点和习题

用户点击“生成视觉封面”后创建封面任务。封面必须使用同一份资源方案里的封面视觉描述，是故事海报 / 主视觉图，而不是普通全员合照：必须有一个可记忆的中心视觉钩子，通常由主角、老师 / 学生、关键故事物件和代表性场景关系构成。

封面生成成功后，用户可以：

- 确认封面并进入正文插图生成。
- 修改整体视觉设定后重新生成完整资源方案，再重新生成封面。
- 在生成失败后重试。

未确认封面时，不允许生成章节图片。重新生成并确认新封面后，使用旧封面的章节图片全部标记为 `stale`，不自动消耗额度重生成。

### 阶段二：章节插图

每章固定生成 2 张图片，不按章节之外增加图片槽。

每个图片槽在资源方案中必须明确：

- `sourceParagraphId`：对应的正文段落。
- `sourceSentenceIds`：该图覆盖的连续正文句子。
- `heroMomentSentenceId`：最值得视觉化的核心句子。
- `sourceExcerpt`：供用户核对的原文片段。
- `focus`：画面要表达的单一核心动作或冲突。
- `characters`：镜头中出现的人物。
- `keyObjects`：推动情节的关键物件。
- `composition`：景别、主体位置和视线关系。
- `continuityNotes`：与上一张图必须延续的要素。

覆盖规则：

- 同一章两张图片的 `sourceSentenceIds` 不得重叠。
- 每张图片只对应一个连续原文范围，不拼接无关句子。
- 两张图按原文顺序排列。
- 优先覆盖发生动作、变化、发现、冲突或情绪转折的句子，避免把静态说明当作主镜头。
- 两张图不要求覆盖章节全部文字，但不得表现原文不存在的关键情节。
- 页面始终展示每张图对应的原文，用户可以直接判断重复或错配。

## 一致性策略

不单独生成角色设定图。已确认的视觉基准封面同时承担：

- 课程封面
- 角色外貌参考
- 主要背景参考
- 绘本风格和色彩参考

章节图片生成时使用：

- 必选参考图：已确认的视觉基准封面。
- 可选参考图：上一张已成功的章节图片，用于延续同一场景、服装和关键物件。
- 结构化文字约束：只补充当前镜头动作、构图和连续性要求，不重复发明人物外貌。

参考图只复用已持久化的成功图片。参考图失效或本地文件不存在时不得静默降级为独立文生图，应返回可重试错误，防止生成风格漂移的图片。

## 图片规格与画质

封面和全部章节图片使用同一规格：

- 比例：16:9 横版。
- 请求尺寸：QuickRouter GPT-image-2 使用横版 `1536x1024`，页面按 16:9 容器展示。
- 用途：PPT 式全幅图片页。
- 展示：全幅铺满，不拉伸、不裁切、不再使用 4:3 居中容器。
- 构图安全区：人物、动作和关键物件放在画面中间约 80% 区域。
- 生成目标：精美儿童绘本插画，主体清晰，背景有层次，细节丰富但不堆砌无关元素。
- 不请求 `1920x1080` 或更高尺寸；`1536x1024` 是 GPT-image-2 支持的横版规格，满足课堂投影，并控制生成、下载、存储和页面加载成本。

远端图片下载成功后：

- 本地保存为 WebP。
- 单张文件目标约 `300-700 KB`，这是性能目标，不作为生成成功的硬性校验。
- 不为达到体积目标牺牲明显画质，也不因轻微超出目标阻断课程生成。
- 本地持久化路径使用 `.webp`，Step 5 和 PDF 只读取本地 `publicUrl`。
- MVP 不额外长期保存供应商原图；若转码失败，任务保持失败并允许重试。

## 纯画面约束

封面和章节图片都必须是纯画面，不把课程名称绘制进图片。Prompt 必须明确禁止：

- 标题、正文、字幕
- 字母、数字和可读符号
- 对话框和气泡
- 标识牌、书本页面、屏幕 UI 等容易生成文字的区域
- Logo 和水印
- 资源方案命名角色之外的额外学生、同学、老师、家长、人群、背景路人或未命名人物

如情节必须出现书本、路牌或屏幕，使用无文字图形、色块或抽象符号代替。MVP 不增加 OCR 自动拦截；用户可在封面确认和图片预览中发现问题并重试。

## Prompt 编译

最终 prompt 由代码按固定顺序编译，不由页面拼接自由文本：

1. `EXACT CAST ONLY`：列出当前画面允许出现的命名角色，并禁止额外学生、同学、老师、家长、人群、背景路人和未命名人物。
2. `STYLE LOCK`：默认使用暖色日系手绘动画绘本质感，干净线稿、水彩 / 水粉肌理、柔和金色光线、自然儿童表情。
3. `VISUAL LOCK`：已确认的风格、色彩、背景和氛围。
4. `CHARACTER LOCK`：当前镜头人物的已确认外貌描述。
5. `REFERENCE RULE`：保持参考封面中的脸型、发型、服装、配色和世界观。
6. `TEXT ANCHOR`：该图唯一对应的原文片段。
7. `HERO MOMENT`：当前镜头的单一核心动作；封面则使用故事海报主视觉钩子。
8. `COMPOSITION`：景别、主体位置、视线和安全区。
9. `CONTINUITY`：与上一镜头保持一致的内容。
10. `NEGATIVE CONSTRAINTS`：禁止文字、水印、额外人物、重复肢体和与原文冲突的动作。

`sourceHash` 至少包含：

- 图片规格、供应商和 prompt 编译版本
- 当前视觉设定版本
- 已确认封面图片 id 和 `sourceHash`
- `sourceParagraphId`、`sourceSentenceIds`、`heroMomentSentenceId`
- `focus`、`characters`、`keyObjects`、`composition`、`continuityNotes`
- 使用的上一镜头参考图 id 和 `sourceHash`

输入未变化且图片状态为 `succeeded` 时直接复用，不重复消耗 AI 成本。

## 页面行为

入口：`/courses/:id/create/resources`

页面按以下顺序展示：

1. 线性步骤状态：资源方案 -> 视觉封面 -> 章节插图。
2. 只读视觉方向摘要：风格、色彩、世界观、氛围和主要人物形象。
3. 视觉基准封面及确认操作。
4. 按章节分组的图片结果。

每张章节图片显示：

- 章节标题和镜头顺序
- 对应正文片段
- 当前状态和失败原因
- 图片预览
- 内容或参考图已变化提示

页面不展示最终 prompt、关键物件、构图、连续性说明、source hash 或供应商 task id。这些属于后端恢复和调试信息，不进入老师主流程。

页面不在首次加载时自动创建图片任务，避免未经用户确认产生费用。有活动任务时每 2-3 秒轮询。

主要操作：

- 生成 / 重新生成资源方案
- 生成 / 重新生成视觉封面
- 确认视觉封面
- 生成全部缺失的章节图片
- 重试失败图片
- 对 `stale` 图片选择沿用旧图或重新生成

成功且未过期的图片不提供无条件重生成，避免误操作重复计费。若图片质量不合格但输入未变化，用户可主动选择“标记不满意并重新生成”，该操作必须二次确认并明确会再次产生 AI 费用。

## 数据结构

图片仍统一保存在 `course_images`，不得把图片 URL、prompt 或状态写回 `structured_lesson`。

建议扩展：

```ts
type CourseImageSlotType = "visual_cover" | "lesson_shot";

type CourseVisualProfile = {
  style: string;
  palette: string;
  mainSetting: string;
  keyObjects: string[];
  mood: string;
  coverComposition: string;
  characters: Array<{
    profileId: string;
    alias: string;
    appearance: string;
    hairstyle: string;
    clothing: string;
    accessories: string[];
    signatureColor: string;
  }>;
  version: number;
  confirmedCoverImageId: string | null;
};

type CourseResourceImage = {
  id: string;
  courseId: string;
  chapterId: string | null;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  sourceParagraphId: string | null;
  sourceSentenceIds: string[];
  heroMomentSentenceId: string | null;
  sourceExcerpt: string;
  focus: string | null;
  characters: string[];
  keyObjects: string[];
  composition: string | null;
  continuityNotes: string | null;
  prompt: string;
  promptVersion: string;
  referenceImageIds: string[];
  width: 1280;
  height: 720;
  format: "webp";
  sourceHash: string;
  currentSourceHash: string;
  stale: boolean;
  status: "missing" | "pending" | "submitting" | "generating" | "succeeded" | "failed";
  provider: "tencent_hunyuan"; // 数据库兼容旧 enum，实际生图供应商为 QuickRouter GPT-image-2
  providerTaskId: string | null;
  providerImageUrl: string | null;
  publicUrl: string | null;
  failureReason: string | null;
};
```

资源方案必须持久化为独立记录，不能放进 `structured_lesson`。MVP 使用 `CourseResourcePlan` 一课一条，保存老师可编辑的视觉设定、封面视觉描述、章节分镜、版本号和已确认封面图片 id。

`course_images` 继续保持：

- `@@unique([courseId, slotId])`
- `@@index([courseId, status])`
- 课程删除时级联删除记录
- 本地图片文件在删除记录后同步清理

MVP 不新增 Worker、MQ 或图片历史表。每个图片槽只保存当前任务和当前成功资产。

## API 与状态流

### `GET /api/courses/:id/resources`

返回视觉设定、封面确认状态、章节镜头规划、所有图片状态和总进度，并轻量推进已有远端任务。不得在 GET 中创建新的付费任务。

### `POST /api/courses/:id/resources/plan/generate`

主动调用文本 AI 生成或重新生成完整资源方案。首次进入页面不得自动调用。重新生成方案后：

- 当前已确认封面取消确认。
- 旧封面和章节图片标记为 `stale`。
- 不自动创建新的图片任务。

### `PUT /api/courses/:id/resources/visual-profile`

保存用户可编辑的整体视觉设定，并重新生成完整资源方案中的封面描述和章节分镜。视觉设定变化后：

- 当前已确认封面取消确认并标记 `stale`。
- 依赖该封面的章节图片标记 `stale`。
- 保留旧图片文件，等待用户决定，不自动重新生成。

### `POST /api/courses/:id/resources/cover/generate`

创建或重试视觉封面任务。已有未变化的成功封面时不重复提交；主动重生成需要费用确认。

### `POST /api/courses/:id/resources/cover/confirm`

只允许确认 `succeeded` 且未过期的封面。确认后记录 `confirmedCoverImageId`，随后才允许创建章节图片任务。

### `POST /api/courses/:id/resources/generate`

前置条件：

- 课文草稿存在。
- 资源方案存在。
- 封面已确认且未过期。
- 每章正好有 2 个合法且不重叠的镜头规划。

只为缺失图片创建 `pending` 记录，不覆盖成功图片，不自动重生成 `stale` 图片。

### `POST /api/courses/:id/resources/images/:imageId/retry`

仅重试 `failed` 图片，或经用户确认后重生成 `stale` / 不满意的成功图片。重试前重新编译 prompt、参考图和 `sourceHash`。

### `POST /api/courses/:id/resources/images/:imageId/keep`

允许用户沿用已有成功图片。沿用只更新当前 `sourceHash`，保留本地文件；页面必须提示该图片可能与新封面或新正文不完全一致。

## QuickRouter GPT-image-2 适配

供应商：QuickRouter GPT-image-2。

请求参数：

- Endpoint：`POST https://api.quickrouter.ai/v1/images/generations`
- `model: "gpt-image-2"`
- `size: "1536x1024"`，横版。
- `quality: "medium"`，作为 MVP 默认性价比档位；可用 `QUICKROUTER_IMAGE_QUALITY=low|medium|high` 临时覆盖。
- `format: "webp"`
- `n: 1`
- `prompt` 最大 1000 字符，代码必须压缩 prompt，不把完整章节正文塞入图片 prompt。

QuickRouter GPT-image-2 当前按同步创建接口处理。接口返回图片 URL 或 base64 后，服务端立即下载 / 写入部署代码目录之外的持久化路径，并使用本地 `publicUrl`。不得依赖供应商临时 URL 作为课程资产地址。

## 队列与失败恢复

MVP 保持 Next.js 单体内的轮询推进，不引入 Worker、MQ 或 WebSocket。

状态：

- `pending`：等待提交。
- `submitting`：正在创建远端任务。
- `generating`：保留兼容旧异步任务；QuickRouter GPT-image-2 成功返回后通常直接进入 `succeeded`。
- `succeeded`：本地 WebP 文件已保存。
- `failed`：提交、生成、下载或转码失败，可重试。
- `stale`：不是数据库任务状态，而是当前输入 hash 与成功图片 hash 不一致。

失败恢复要求：

- 远端生成成功但下载或写入失败时，保留 `providerImageUrl` 和失败原因，重试优先恢复下载，不重复提交生图任务。
- 页面刷新后根据数据库状态继续轮询，不丢失已提交任务。
- 单张图片失败不删除其他成功图片。
- 只有全部必需图片成功且无未处理 `stale` 图片时，课程才进入 `ready`。
- 存在活动任务时课程为 `building_resources`；没有活动任务但存在失败时为 `build_failed`。

## Step 5 联调边界

Step 5 每个镜头固定生成两页：

1. 16:9 全幅图片页。
2. 该图片对应的文本 / 练习页。

Step 5 必须按 `sourceSentenceIds` 读取对应文本，不再推断图片属于哪一段。旧的 4:3 图片框需替换为 16:9 全幅容器；课程标题由 Step 5 页面组件叠加，不写进封面图片。

## 验收标准

- Step 4 首次进入不自动产生图片费用。
- 用户能编辑视觉设定、生成并确认一张包含全部主要人物和主要背景的纯画面封面。
- 未确认封面时不能生成章节图片。
- 每章正好 2 张章节图片，且两张图片的来源句子不重叠、顺序与正文一致。
- 页面能看到每张图片对应的原文和核心镜头。
- 所有章节图片以已确认封面作为参考图；连续场景可追加上一张成功图片作为参考。
- 人物外貌、服装、主要背景和整体风格在同一课程中保持明显一致。
- 图片不出现标题、字幕、字母、数字、对话框、Logo 或水印。
- 封面和章节图片使用 GPT-image-2 横版规格，持久化为 WebP，Step 5 全幅展示无拉伸和裁切。
- 成功且输入未变化的图片可复用，不重复消耗 AI 成本。
- 修改视觉设定或确认新封面后，依赖的旧图片标记过期但不自动重生成。
- 提交、生成、下载和转码任一阶段失败后都能从数据库状态恢复并单张重试。

## 开发顺序

1. 增加视觉设定、封面槽、镜头来源映射和参考图字段，创建 Prisma migration。
2. 先写镜头不重叠、封面确认门禁、source hash、任务恢复和图片复用测试。
3. 实现视觉设定与镜头规划编译。
4. 切换 QuickRouter GPT-image-2，并将图片 prompt 改为适配 GPT-image-2 的短 prompt。
5. 实现 WebP 转码和持久化失败恢复。
6. 同步实现 Step 4 前端和 API。
7. 修改 Step 5 为 16:9 全幅图片页并按来源句子配对文本页。
8. 使用真实数据库和真实图片任务完成端到端验收。

## 实现记录

- 当前实现提交：`c42c059`，对应旧版独立文生图流程。
- 2026-07-12：已实现 MVP 资源方案流程：一次文本 AI 生成全局视觉设定、封面描述和章节分镜；新增视觉封面槽、封面确认门禁、16:9 图片 prompt、Step 4 资源方案 UI、Step 5 按 `sourceSentenceIds` 渲染文本页。
- 2026-07-13：生图供应商从腾讯混元切换为 QuickRouter GPT-image-2；prompt 上限收敛到 1000 字符，并默认使用暖色日系手绘动画绘本质感。
- Migration：`prisma/migrations/20260712160000_course_resource_plan/migration.sql`
- 验证命令：`pnpm prisma:generate`、`pnpm lint`、`pnpm test`、`pnpm build`
- 待真实生成验收：需要配置真实 `DEEPSEEK_API_KEY`、`QUICKROUTER_API_KEY` 和持久化 `STORAGE_DIR` 后，完成一次资源方案、封面确认和章节图片端到端生成。
