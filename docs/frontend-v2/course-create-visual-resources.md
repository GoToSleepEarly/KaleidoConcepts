# 课程创建 V2 阶段五：视觉资源

## 模块目标

阶段五负责基于已确认的故事大纲、角色卡和 clean reading 生成课程视觉资源。

本阶段重点复用 V1 Step4 已验证的资源方案、图片状态、失败恢复和成功图片复用机制，同时适配 V2 的角色卡、动态段落数和角色参考图。

## 设计原则

- 图片仍统一由 `course_images` 管理。
- 不把图片 URL、prompt、状态写入课程正文。
- 不读取学生版挖空文本或练习题作为图片语义来源。
- 视觉资源读取 clean reading、段落结构、故事大纲、角色卡和人物档案。
- 页面不自动产生图片费用，所有付费生成必须由老师主动触发。
- 成功图片可复用，不重复消耗 AI 成本。
- 失败图片可单张重试。
- prompt 默认不展示给老师，只放在高级信息中。

## 用户流程

```text
确认角色视觉来源 -> 生成角色基准图 -> 生成封面 -> 生成段落插图 -> 确认进入预览发布
```

角色基准图用于提升后续封面和段落插图的人物一致性。

## 输入边界

必须读取：

- 阶段一授课对象。
- 阶段二故事大纲。
- 阶段二角色卡。
- 阶段四 clean reading。
- 阶段四段落结构。
- 老师和学生人物档案。

不得读取：

- 学生版挖空文本作为图片语义。
- 章节练习题。
- 课后练习题。
- 答案区。

## 图片槽

V2 不再假设每章固定 2 张正文图。

默认图片槽：

- 每课 1 张封面。
- 每个阅读段落 1 张段落插图。
- 主要角色可有 1 张角色基准图。

不生成：

- 章节练习图片。
- 课后练习图片。
- 答案页图片。

如果后续需要降低成本，可扩展为“每章选择关键段落生成图片”，但 MVP 默认每段一图，保证正文和图片绑定清晰。

## 角色视觉来源建议

系统自动为每个角色给出视觉来源建议，老师不需要理解底层判断规则。

老师只看到三种状态：

- 可直接生成
- 建议上传参考图
- 将生成原创形象

### 可直接生成

适合：

- 高知名度真实人物。
- 历史人物。
- 公众人物。

示例：

- 贝多芬
- 特朗普
- 马斯克
- 爱因斯坦

处理：

- 不要求老师上传图片。
- 系统基于来源摘要、角色描述和通用视觉常识生成绘本化形象。
- 如故事跨年龄阶段，系统内部根据段落阶段处理，不要求老师配置阶段图。
- 不承诺真实照片级还原。

### 建议上传参考图

适合：

- IP 角色。
- 游戏角色。
- 小众动漫或影视角色。
- 老师希望高度还原的固定形象。

示例：

- 瓦罗兰特 Jett。
- 小马宝莉具体角色。

处理：

- 角色卡提示“建议上传参考图”。
- 老师上传后，后续生成优先使用该参考图。
- 不上传也允许继续，系统生成课堂化近似形象，并标记为不保证还原。

### 将生成原创形象

适合：

- 学生。
- 老师。
- AI 创建的原创角色。
- 普通怪物、机器人、海底图书管理员等原创设定。

处理：

- 系统根据人物档案或角色描述生成固定形象。
- 老师和学生可选上传照片提升相似度。
- 不上传也可继续。

## 判断规则

系统使用规则优先、AI 辅助的方式判断视觉来源建议。

规则优先：

- `Person` 老师 / 学生：默认 `originalize`。
- 原创角色：默认 `originalize`。
- 引用角色进入类型判断。
- `real_person` / `historical_person` / `public_figure`：默认 `model_generatable`。
- `ip` / `game_character` / `fictional_character`：默认 `upload_recommended`。
- `unknown`：默认 `upload_recommended`。

AI 辅助：

- 可根据故事大纲阶段的背景识别和检索结果补充判断。
- AI 可输出建议原因，但老师主流程只展示短状态。

冲突处理：

- 上传图优先级最高。
- 游戏角色、IP 角色默认仍提示上传，即使 AI 判断可生成。
- 真实人物默认可直接生成。
- 老师可以选择不上传继续生成近似形象。

结构示意：

```ts
type CharacterVisualStrategy = {
  characterId: string;
  strategy: "model_generatable" | "upload_recommended" | "originalize";
  referenceImageId?: string;
  teacherOverride?: boolean;
};
```

## 角色视觉卡

每个需要出现在图片中的角色展示一张视觉卡。

展示：

- 角色名称。
- 来源类型。
- 视觉来源建议。
- 当前参考图或基准图状态。
- 上传参考图入口。
- 生成基准图按钮。

状态：

```ts
type CharacterAssetStatus =
  | "missing"
  | "uploaded"
  | "generating"
  | "generated"
  | "failed"
  | "stale";
```

说明：

- `missing`：没有上传图，也没有基准图。
- `uploaded`：老师上传了参考图。
- `generating`：正在生成基准图。
- `generated`：系统生成了基准图。
- `failed`：生成失败，可重试。
- `stale`：角色描述或来源变化，当前图可能过期。

MVP 不强制所有角色都有基准图，但主要角色需要先生成或上传视觉基准后，再生成封面和段落插图。

## 上传参考图

上传图用于角色视觉基准，不进入课程正文。

规则：

- 上传图绑定角色。
- 上传图优先于系统生成形象。
- 老师可替换上传图。
- 替换后相关角色基准图和下游插图标记为过期。
- 上传失败保留页面状态，允许重试。

## 资源方案

生成封面和段落插图前，先生成视觉资源方案。

资源方案读取：

- clean reading。
- 每段正文。
- 角色卡。
- 角色视觉策略。
- 可用角色基准图。
- 故事大纲。

资源方案输出：

- 封面图槽。
- 每个阅读段落的图片槽。
- 每个图片槽的画面重点。
- 每个图片槽的出场角色。
- 每个图片槽绑定的段落 id。
- 每个图片槽的自包含 image prompt。

资源方案不修改正文、练习、答案或角色卡。

## 段落插图

每个阅读段落默认生成 1 个图片槽。

每个段落图片槽展示：

- 所属章节。
- 段落顺序。
- 段落正文。
- 出场角色。
- 画面重点。
- 图片状态。
- 图片预览。
- 重试入口。

段落插图绑定 `paragraphId`，不绑定题目或学生版挖空文本。

## 封面图

每课生成 1 张封面图。

封面图读取：

- 故事标题。
- 故事大纲。
- 主要角色。
- 角色基准图。
- 代表性场景。

封面图是纯画面，不把课程名称、故事标题或文字画进图片。

## 图片生成顺序

推荐顺序：

1. 老师确认角色视觉卡。
2. 为主要角色上传参考图或生成基准图。
3. 生成视觉资源方案。
4. 生成封面图。
5. 生成段落插图。

页面允许单张、单章或全部生成缺失图片。

## 页面行为

页面分区：

- 角色视觉设定。
- 视觉资源方案。
- 封面图。
- 按章节和段落展示图片槽。

主要操作：

- 上传角色参考图。
- 生成 / 重试角色基准图。
- 生成 / 重新生成资源方案。
- 生成封面图。
- 生成单张段落图。
- 生成本章缺失图片。
- 生成全部缺失图片。
- 重试失败图片。
- 沿用过期图片。

prompt 默认折叠到高级信息，不作为老师主流程内容。

## 失败恢复

沿用 V1 图片状态机和恢复原则：

- 远端生成成功但下载或写入失败时，保留远端 URL，重试优先恢复下载，不重复提交生图。
- 页面刷新后根据数据库状态继续显示。
- 单张图片失败不影响其他成功图片。
- 成功且输入未变化的图片直接复用。
- 输入变化导致旧图过期时，不自动重生成。
- 老师可选择沿用旧图或重新生成。

## 下游重置策略

如果阶段四 clean reading 变化：

- 视觉资源标记过期。
- 不自动删除成功图片。
- 老师可选择沿用旧图或重新生成。

如果角色卡或角色视觉策略变化：

- 相关角色基准图标记过期。
- 引用该角色的封面和段落插图标记过期。

如果只修改练习题，不修改 clean reading：

- 不影响视觉资源。

## API 边界

V2 API 使用 `/api/v2/...`。

### `GET /api/v2/courses/:id/visual-resources`

读取角色视觉卡、资源方案、图片槽和图片状态。

### `POST /api/v2/courses/:id/visual-resources/characters/:characterId/reference`

上传角色参考图。

行为：

- 保存上传图片。
- 绑定角色。
- 标记相关基准图和下游插图过期。

### `POST /api/v2/courses/:id/visual-resources/characters/:characterId/generate`

生成或重试角色基准图。

行为：

- 读取角色视觉策略和参考图。
- 生成角色基准图。
- 保存到图片资产。

### `POST /api/v2/courses/:id/visual-resources/plan/generate`

生成或重新生成视觉资源方案。

### `POST /api/v2/courses/:id/visual-resources/images/generate`

生成图片。

请求示例：

```ts
{
  scope: "cover" | "slot" | "chapter" | "all";
  slotId?: string;
  chapterId?: string;
}
```

### `POST /api/v2/courses/:id/visual-resources/images/:imageId/retry`

重试失败图片。

### `POST /api/v2/courses/:id/visual-resources/images/:imageId/keep`

沿用过期图片。

## 数据结构

图片仍统一进入 `course_images`，建议扩展 slot type：

```ts
type CourseImageSlotType =
  | "character_reference"
  | "visual_cover"
  | "lesson_shot";
```

角色基准图通过 `characterId` 或稳定 `slotId` 绑定：

```ts
slotId = `character-${characterId}-reference`
```

建议新增稳定领域表：

- `CourseCharacterVisual`
- `CourseVisualResourcePlan`

结构示意：

```ts
type CourseCharacterVisual = {
  id: string;
  courseId: string;
  characterId: string;
  strategy: "model_generatable" | "upload_recommended" | "originalize";
  referenceImageId?: string;
  generatedImageId?: string;
  status: CharacterAssetStatus;
  teacherOverride: boolean;
  createdAt: string;
  updatedAt: string;
};

type VisualImageSlot = {
  id: string;
  courseId: string;
  slotType: "visual_cover" | "lesson_shot";
  chapterId?: string;
  paragraphId?: string;
  sourceText: string;
  characterIds: string[];
  focus: string;
  prompt: string;
};
```

## 与预览发布的边界

阶段五不生成课件页面，不生成 PDF，不修改正文和练习。

阶段六预览发布读取：

- clean reading。
- 练习结构。
- 视觉资源图片。
- 图片状态。

缺失或失败图片在预览阶段显示占位，并提示返回视觉资源处理。

## 验收标准

- 图片仍由 `course_images` 管理。
- 视觉资源不读取学生版挖空文本作为图片语义来源。
- 每个主要角色展示视觉来源建议。
- 真实/历史/公众人物默认可直接生成。
- IP/游戏/虚拟角色默认建议上传参考图。
- 老师/学生/原创角色默认生成原创形象，可选上传。
- 上传图优先于系统生成形象。
- 不上传参考图也能继续生成近似形象。
- 每个阅读段落默认有一个图片槽。
- 封面图和段落图默认不绘制任何文字。
- prompt 默认不展示给老师。
- 成功图片输入未变化时可复用。
- 输入变化时旧图标记过期，但不自动删除或重生成。
- 图片失败可单张重试。

## 实现状态

- 状态：产品设计已讨论，待用户确认文档。
- 验证命令：待实现后记录。
- 提交号：待实现后记录。

