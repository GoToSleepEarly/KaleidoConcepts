# 新建课程 Step 4：绘本资源生成优化方案

## 文档状态

- 状态：优化方案已确认，待开发
- 优化原因：当前实现存在画面质量低、人物不一致、镜头没有突出正文重点、不同图片可能覆盖重复正文，以及 4:3 图片与 16:9 课件不匹配的问题。
- 本文档替代旧版“直接按段落独立文生图”的方案，后续开发以本文为准。

## 模块目标

Step 4 将 Step 3 已确认的课文转换为可用于 PPT 式授课的连续绘本图片。

最终结果包括：

- 1 张视觉封面。
- 每章固定 2 张正文插图。
- 每张正文插图与唯一的 Step 3 段落建立可追踪映射。
- 所有图片保持统一人物、环境和绘本风格。
- Step 5 按“图片页 -> 对应文本 / 练习页”顺序播放。

Step 4 不修改课文、知识点或习题，不生成 Closing Reading 图片，不生成 PDF。

## 根因与优化原则

旧实现的问题不只是 prompt 不够详细，而是生成链路缺少稳定输入：

1. Step 3 当前数据没有可靠的视觉风格和角色外貌结构，Step 4 实际只能使用通用绘本描述。
2. 按段落机械生成图片，没有先选择最值得表现的故事瞬间。
3. 每张图片独立文生图，没有共同参考图，人物一致性无法只靠文本保证。
4. 图片与正文缺少稳定段落绑定，Step 5 难以证明图片、正文和练习来自同一段。
5. 当前图片为 4:3，而课件画布为 16:9，只能留白或裁切。

因此本次优化不继续堆叠通用 prompt，而是建立以下最小闭环：

1. 从 Step 3 原文、人物档案和故事大纲直接生成封面 prompt 与每段插画 prompt。
2. 按“封面 -> 章节”的顺序展示图片槽，但不把封面确认作为章节图生成门禁。
3. 每章固定 2 段正文，每段对应 1 张插画 prompt 和 1 个图片槽。
4. 保存段落来源、prompt 和 prompt 版本，使失败可恢复、成功可复用。

## 用户流程

### 阶段一：视觉基准封面

页面首先由用户主动点击生成完整资源方案。该动作调用一次文本 AI，基于 Step 3 课文、Step 2 故事大纲、课程信息和人物档案一次性产出：

- 封面视觉描述和可直接交给 GPT-image-2 的自包含 `imagePrompt`。
- 每章 2 张图片的段落绑定和每张图的自包含 `imagePrompt`。

老师不编辑关键物件、封面构图、章节分镜、句子范围、连续性说明或最终 prompt。上述内容全部由资源方案自动生成并由后端校验。

用户不能在 Step 4 修改：

- 人物身份和角色别名
- 课文正文
- 故事情节
- 知识点和习题

用户点击“生成视觉封面”后创建封面任务。封面必须使用同一份资源方案里的 `coverBrief.imagePrompt`，是故事海报 / 主视觉图，而不是普通全员合照：必须有一个可记忆的中心视觉钩子，通常由主角、老师 / 学生、关键故事物件和代表性场景关系构成。

封面生成成功后，用户可以：

- 继续按章节生成正文插图。
- 重新生成完整资源方案后重新生成封面。
- 在生成失败后重试。

章节图不依赖封面确认，也不传封面作为参考图。重新生成资源方案后，输入 hash 变化的旧图标记为 `stale`，不自动消耗额度重生成。

### 阶段二：章节插图

每章固定生成 2 张图片，不按章节之外增加图片槽。Step 3 已保证每章正好 2 段正文，因此 Step 4 固定采用“第 1 段 -> 第 1 张图、第 2 段 -> 第 2 张图”。用户可单张、单章或一次性创建全部缺失图片任务；测试阶段优先使用单张或单章生成，避免一次性消耗全部图片费用。

每个图片槽在资源方案中必须明确：

- `sourceParagraphId`：对应的正文段落。
- `focus`：画面要表达的单一核心动作或冲突。
- `keyObjects`：推动情节的关键物件。
- `imagePrompt`：Responses 基于全文直接生成的自包含 GPT-image-2 prompt，必须包含当前画面人物、外貌 / 服装 / 道具、背景、动作、构图、画风和纯画面限制。

> 段落正文由服务端在 `deriveResourceImageSlots` 阶段按 `sourceParagraphId` 从 Step 3 草稿回填（`sourceExcerpt` / `sourceText`），不再要求 Responses 复述原文，避免冗余输出和逐字校验失败。`characters` / `setting` / `composition` / `continuityNotes` 等辅助字段已从资源方案中移除，人物与场景一致性完全依赖自包含 `imagePrompt`。

覆盖规则：

- 第 1 张图必须绑定第 1 段，第 2 张图必须绑定第 2 段。
- 两张图按原文顺序排列，不拼接无关句子。
- 图片不得表现原文不存在的关键情节。
- 页面始终展示每张图对应的原文（由服务端回填），用户可以直接判断重复或错配。

## 一致性策略

MVP 不传参考图，避免增加图片输入成本。人物和场景一致性主要依赖资源方案阶段生成的自包含 prompt：

- `plan/generate` 通过 QuickRouter Responses 读取 Step 3 全文、Step 2 故事大纲、课程信息和人物档案。
- Responses 必须先理解完整故事，再为封面和每张插图直接生成自包含 `imagePrompt`。
- 每张 `imagePrompt` 都要重复足够具体的人物外貌、当前服装 / 道具、主要背景、关键物件、画风和纯画面限制。
- 不要求跨图完全一致，但必须避免一眼异常：突然换脸、年龄漂移、无剧情依据换衣服、故事背景从森林变城市、关键物件外形大幅改变、凭空出现额外人物。
- 如果剧情推进导致服装、道具或环境变化，`imagePrompt` 应直接描述当前画面的合理变化，而不是用代码强行锁死全书同一套衣服。

## 图片规格与画质

封面和全部章节图片使用同一规格：

- 比例：16:9 横版。
- 请求尺寸：QuickRouter GPT-image-2 使用横版 `1536x864`（16:9），页面按 16:9 容器展示。
- 用途：PPT 式全幅图片页。
- 展示：全幅铺满，不拉伸、不裁切、不再使用 4:3 居中容器。
- 构图安全区：人物、动作和关键物件放在画面中间约 80% 区域。
- 生成目标：精美儿童绘本插画，主体清晰，背景有层次，细节丰富但不堆砌无关元素。
- 不请求 `1920x1080` 或更高尺寸；`1536x864` 是 GPT-image-2 支持的 16:9 横版规格，满足课堂投影，并控制生成、下载、存储和页面加载成本。

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

最终图片 prompt 不再由代码从 `focus` / `composition` 等结构化字段重新拼接。资源方案必须直接提供自包含 prompt：

- 封面使用 `coverBrief.imagePrompt`。
- 章节图片使用 `shots[].imagePrompt`。
- 代码只负责归一化空白、追加统一安全后缀，并截断到 `maxImagePromptLength=1200`。
- 页面在生成图片前默认展示对应 prompt；图片生成成功后默认折叠 prompt，只展示图片和状态。用户仍可展开查看 prompt。

`sourceHash` 至少包含：

- 图片规格、供应商和 prompt 编译版本
- `slotId`、`slotType`、`chapterId`、`shotId`
- `sourceParagraphId`、`sourceExcerpt`
- 最终用于生图的 `prompt`
- `referenceSlotIds`

输入未变化且图片状态为 `succeeded` 时直接复用，不重复消耗 AI 成本。

## 页面行为

入口：`/courses/:id/create/resources`

页面按以下顺序展示：

1. 线性步骤状态：资源方案 -> 视觉封面 -> 章节插图。
2. 资源方案摘要：封面 prompt、章节数和段落插画 prompt 数。
3. 视觉封面及其 prompt / 图片状态。
4. 按章节分组的图片结果。

每张章节图片显示：

- 章节标题和镜头顺序
- 对应正文片段
- 当前状态和失败原因
- 图片预览
- 内容或 prompt 已变化提示

页面展示每张图片的 prompt，并在图片成功后默认折叠。关键物件、构图、连续性说明、source hash 或供应商 task id 仍属于后端恢复和调试信息，不进入老师主流程。

页面不在首次加载时自动创建图片任务，避免未经用户确认产生费用。有活动任务时每 2-3 秒轮询。

主要操作：

- 生成 / 重新生成资源方案
- 生成 / 重新生成视觉封面
- 生成单张图片
- 生成本章缺失图片
- 生成全部缺失图片
- 重试失败图片
- 对 `stale` 图片选择沿用旧图或重新生成

成功且未过期的图片不提供无条件重生成，避免误操作重复计费。若图片质量不合格但输入未变化，用户可主动选择“标记不满意并重新生成”，该操作必须二次确认并明确会再次产生 AI 费用。

## 数据结构

图片仍统一保存在 `course_images`，不得把图片 URL、prompt 或状态写回 `structured_lesson`。

建议扩展：

```ts
type CourseImageSlotType = "visual_cover" | "lesson_shot";

type CourseResourceImage = {
  id: string;
  courseId: string;
  chapterId: string | null;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  sourceParagraphId: string | null;
  sourceExcerpt: string;
  focus: string | null;
  keyObjects: string[];
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

资源方案必须持久化为独立记录，不能放进 `structured_lesson`。MVP 使用 `CourseResourcePlan` 一课一条，保存封面视觉描述、段落插画 prompt 和版本号。

`course_images` 继续保持：

- `@@unique([courseId, slotId])`
- `@@index([courseId, status])`
- 课程删除时级联删除记录
- 本地图片文件在删除记录后同步清理

MVP 不新增 Worker、MQ 或图片历史表。每个图片槽只保存当前任务和当前成功资产。

## API 与状态流

### `GET /api/courses/:id/resources`

返回资源方案、章节镜头规划、所有图片状态和总进度，并轻量推进已有远端任务。不得在 GET 中创建新的付费任务。

### `POST /api/courses/:id/resources/plan/generate`

主动调用 QuickRouter Responses 生成或重新生成完整资源方案。首次进入页面不得自动调用。Responses 直接读取 Step 3 原文、Step 2 故事大纲、课程信息和人物档案，并返回 `course_resource_plan_v1` JSON，其中封面和每张章节图都必须包含自包含 `imagePrompt`。重新生成方案后：

- 旧封面和章节图片标记为 `stale`。
- 不自动创建新的图片任务。

### `POST /api/courses/:id/resources/cover/generate`

创建或重试视觉封面任务。已有未变化的成功封面时不重复提交；封面已处于 `pending` / `submitting` / `generating` 时返回 400（"封面正在生成中，请稍候"），不重置记录、不重复提交，避免刷新或误触二次点击造成重复付费与状态竞态；前端在封面生成中同步置灰"重新生成封面"按钮。主动重生成需要费用确认。

### `POST /api/courses/:id/resources/generate`

请求体：

```json
{ "scope": "slot", "slotId": "chapter-1-shot-1" }
```

或：

```json
{ "scope": "chapter", "chapterId": "chapter-1" }
```

或：

```json
{ "scope": "all" }
```

前置条件：

- 课文草稿存在。
- 资源方案存在。
- 每章正好有 2 个合法且按段落绑定的镜头规划。

只为指定范围内的缺失图片创建 `pending` 记录，不覆盖成功图片，不自动重生成 `stale` 图片。请求范围无效返回 400。

### `POST /api/courses/:id/resources/images/:imageId/retry`

仅重试 `failed` 图片，或经用户确认后重生成 `stale` / 不满意的成功图片。重试前重新编译 prompt 和 `sourceHash`。

### `POST /api/courses/:id/resources/images/:imageId/keep`

允许用户沿用已有成功图片。沿用只更新当前 `sourceHash`，保留本地文件；页面必须提示该图片可能与新封面或新正文不完全一致。

## QuickRouter GPT-image-2 适配

资源方案供应商：QuickRouter Responses。

- Endpoint：`POST https://api.quickrouter.ai/v1/responses`
- 默认模型：`QUICKROUTER_RESPONSES_MODEL`，未配置时使用 `gpt-5.5`
- 输入：Step 3 完整课文、Step 2 故事大纲、课程信息和人物档案
- 输出：严格 JSON `course_resource_plan_v1`，包含 `coverBrief.imagePrompt` 和每个 `shot.imagePrompt`

图片供应商：QuickRouter GPT-image-2。

请求参数：

- Endpoint：`POST https://api.quickrouter.ai/v1/images/generations`
- `model: "gpt-image-2"`
- `size: "1536x864"`，16:9 横版。
- `quality: "low"`，作为 MVP 默认成本档位；手绘绘本风对细节要求低于写实图，`low` 通常够用，可用 `QUICKROUTER_IMAGE_QUALITY=low|medium|high` 临时覆盖。
- `format: "webp"`
- `n: 1`
- `prompt` 最大 1200 字符，来自资源方案中的自包含 `imagePrompt`；代码只追加统一安全后缀和长度截断，不再重新拼接旧版 prompt。

QuickRouter GPT-image-2 当前按同步创建接口处理。接口返回图片 URL 或 base64 后，服务端立即下载 / 写入部署代码目录之外的持久化路径，并使用本地 `publicUrl`。不得依赖供应商临时 URL 作为课程资产地址。

## 队列与失败恢复

MVP 保持 Next.js 单体内的轮询推进，不引入 Worker、MQ 或 WebSocket。

状态：

- `pending`：等待提交。
- `submitting`：正在创建远端任务。同步接口在请求存活期间保持此状态；GPT-image-2 正常生成可能耗时 1-3 分钟或更久，请求中断（刷新、热重载、进程重启）会遗留孤儿记录，由 `advanceCourseImageQueue` 在 `IMAGE_SUBMITTING_TIMEOUT_MS`（默认 900s）后回收为 `failed` 可重试，不会永久卡死。
- `generating`：保留兼容旧异步任务；QuickRouter GPT-image-2 成功返回后通常直接进入 `succeeded`。
- `succeeded`：本地 WebP 文件已保存。
- `failed`：提交、生成、下载或转码失败，可重试。
- `stale`：不是数据库任务状态，而是当前输入 hash 与成功图片 hash 不一致。

失败恢复要求：

- 远端生成成功但下载或写入失败时，保留 `providerImageUrl` 和失败原因，重试优先恢复下载，不重复提交生图任务。同步接口下载失败也遵循此规则：记录标为 `failed` 但保留远端 URL，`retry`（输入未变时）与队列推进会直接下载已生成图片。
- 读状态接口（GET）永不因图片供应商配置缺失或异常而 500：队列客户端惰性构造，推进失败降级为记录日志后仍返回数据库真实状态。
- 页面刷新后根据数据库状态继续轮询，不丢失已提交任务。
- 单张图片失败不删除其他成功图片。
- 只有全部必需图片成功且无未处理 `stale` 图片时，课程才进入 `ready`。
- 存在活动任务时课程为 `building_resources`；没有活动任务但存在失败时为 `build_failed`。

## Step 5 联调边界

Step 5 每个镜头固定生成两页：

1. 16:9 全幅图片页。
2. 该图片对应的文本 / 练习页。

Step 5 必须按 `chapterId + sourceParagraphId` 回到 Step 3 读取对应段落文本和该段落句子关联的练习，不从 Step 4 的 `sourceExcerpt` 派生正文。旧的 4:3 图片框需替换为 16:9 全幅容器；课程标题由 Step 5 页面组件叠加，不写进封面图片。

## 验收标准

- Step 4 首次进入不自动产生图片费用。
- 用户能生成一张包含主要人物、主要背景和故事钩子的纯画面封面。
- 用户能单张、单章或一次性创建全部缺失图片任务。
- 每章正好 2 张章节图片，第 1 张绑定第 1 段全文，第 2 张绑定第 2 段全文。
- 即使没有全部图片成功，也能进入 Step 5 提前预览。
- 页面能看到每张图片对应的原文和核心镜头。
- 每张图片 prompt 都是 GPT Image 2 专用自包含 prompt，包含当前画面人物、场景、动作、构图、画风和纯画面限制。
- 人物外貌、服装、主要背景和整体风格不出现一眼可见的异常漂移。
- 图片不出现标题、字幕、字母、数字、对话框、Logo 或水印。
- 封面和章节图片使用 GPT-image-2 横版规格，持久化为 WebP，Step 5 全幅展示无拉伸和裁切。
- 成功且输入未变化的图片可复用，不重复消耗 AI 成本。
- 重新生成方案后，输入变化的旧图片标记过期但不自动重生成。
- 提交、生成、下载和转码任一阶段失败后都能从数据库状态恢复并单张重试。

## 开发顺序

1. 增加资源方案、封面槽、段落来源映射和 prompt 字段，创建 Prisma migration。
2. 先写段落绑定、source hash、任务恢复和图片复用测试。
3. 实现 QuickRouter Responses 资源方案生成和每段 prompt 规划。
4. 切换 QuickRouter GPT-image-2，并将图片 prompt 改为适配 GPT-image-2 的短 prompt。
5. 实现 WebP 转码和持久化失败恢复。
6. 同步实现 Step 4 前端和 API。
7. 修改 Step 5 为 16:9 全幅图片页并按来源段落配对文本页。
8. 使用真实数据库和真实图片任务完成端到端验收。

## 实现记录

- 当前实现提交：`c42c059`，对应旧版独立文生图流程。
- 2026-07-14：Step 4 资源方案生成提速（减少 Responses 输出 token）。
  - 移除 `sourceExcerpt` 复述：不再要求 Responses 逐字输出段落原文，段落正文改由服务端 `deriveResourceImageSlots` 按 `sourceParagraphId` 从 Step 3 草稿回填，同时删除“逐字覆盖段落全文”的校验（消除一类重生成失败）。
  - 删除下游未消费的辅助字段 `characters` / `setting` / `composition` / `continuityNotes`，减少模型多余输出；一致性仍完全依赖自包含 `imagePrompt`。
  - 统一 `imagePrompt` 长度约束：zod 上限与软指令从 1600 收敛到 1200，与 `capImagePrompt` 的 `maxImagePromptLength=1200` 对齐，避免生成后被截断的浪费 token。
  - 验证命令：`pnpm vitest run lib/server/ai/resource-plan-generator.test.ts lib/server/repositories/course-images.test.ts lib/server/repositories/course-preview.test.ts`（33 passed）。
- 2026-07-12：已实现 MVP 资源方案流程：一次文本 AI 生成封面描述和章节分镜；新增视觉封面槽、16:9 图片 prompt、Step 4 资源方案 UI。
- 2026-07-13：生图供应商从腾讯混元切换为 QuickRouter GPT-image-2；prompt 默认使用暖色日系手绘动画绘本质感。
- 2026-07-13：Step 4 状态机稳定性修复 + 生图成本优化。
  - 状态机（Bug1）：`submitting` 记录在 `IMAGE_SUBMITTING_TIMEOUT_MS`（默认 900s）后回收为可重试 `failed`，刷新 / 热重载遗留的孤儿任务不再永久卡死；远端已生成但下载 / 转码失败时保留 `providerImageUrl`，`retry`（输入未变）与队列推进优先恢复下载，不重复付费；`GET /resources` 惰性构造供应商客户端，推进失败降级为记录日志，读状态永不 500。
  - 成本（Bug2）：默认 `quality=low`（可用 `QUICKROUTER_IMAGE_QUALITY` 覆盖）；prompt 上限从 1000 收敛到 700，style lock 只在开头出现一次，人物描述只带当前镜头出场角色，各段字数上限收紧。
  - 封面重复生成幂等：`cover/generate` 在封面处于 active（`pending`/`submitting`/`generating`）时返回 400 而非重置记录，前端同步置灰"重新生成封面"按钮，杜绝生成中刷新 / 误点造成的重复提交与状态竞态。
- 2026-07-13：Step 4 prompt 质量方案调整：不传参考图，资源方案生成从 DeepSeek 切换为 QuickRouter Responses；Responses 直接读取 Step 3 全文并输出 `coverBrief.imagePrompt` 和每个 `shot.imagePrompt`，代码不再旧式拼接 `EXACT CAST ONLY` / `STYLE LOCK` 等片段，只做安全后缀和 1200 字符截断；章节图创建支持单张、单章和全部缺失图片任务。
- 2026-07-13：修复同步生图超时误判：`IMAGE_SUBMITTING_TIMEOUT_MS` 默认从 180s 提高到 900s，避免 QuickRouter 后台已完成但本地轮询把长耗时 `submitting` 任务提前标为失败。
- 2026-07-13：删除旧句子级图片绑定字段，资源方案和 Step 5 均改为 `sourceParagraphId` 段落绑定；Step 4 预览入口放宽为资源方案存在即可进入。
- Migration：`prisma/migrations/20260713170000_remove_course_image_sentence_fields/migration.sql`
- 验证命令：`pnpm prisma:generate`、`pnpm lint`、`pnpm test`、`pnpm build`
- 待真实生成验收：需要配置真实 `QUICKROUTER_API_KEY`、可选 `QUICKROUTER_RESPONSES_MODEL` 和持久化 `STORAGE_DIR` 后，完成一次资源方案、封面和单章节图片端到端生成。
