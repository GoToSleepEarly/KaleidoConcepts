# 新建课程 Step 3：绘本内容草稿模块说明

## 模块目标

本模块覆盖新建课程流程第三步：基于 Step 2 已选择的故事方案，一次性生成可编辑、可生图、可预览的英文绘本内容草稿。

Step 3 是内容填充，不重新构思故事。

## 输入边界

必须读取：
- Step 1 课程基础信息
- 老师和学生人物画像
- Step 2 已选择的 `StoryOption`

对齐规则：
- `sourceStoryOptionId` 必须等于课程已选择的故事方案 id
- 章节数量必须等于 Step 2 选中方案的章节数量
- 每章必须对应 Step 2 的同序号章节
- 每章正文扩写 Step 2 的 `summary`
- 每章练习服务 Step 2 的 `knowledgeHook`
- 不重新设计主线，不新增主要角色

## 本期产物

生成：
- 英文绘本标题
- 每章英文标题
- 每章 120-180 词英文学生正文
- 每章 10 个练习点
  - 7 个 `verb_blank`
  - 3 个 `vocabulary_hint`
- 每章 2 个图片分镜 / image shot
- 全局视觉风格 `visualStyle`
- 全局人物视觉一致性 `characters`

不生成：
- 教师教案
- 课堂流程
- 图片文件
- HTML / PDF 文件
- 新增 / 删除练习点
- 新增 / 删除分镜

## JSON 结构

```ts
type LessonDraft = {
  schemaVersion: "lesson_draft_v1";
  sourceStoryOptionId: string;
  generationMode: "ai";
  title: string;
  language: "en";
  visualStyle: VisualStyle;
  characters: VisualCharacter[];
  chapters: LessonChapter[];
};

type LessonChapter = {
  id: string;
  sourceOutlineChapterIndex: number;
  title: string;
  wordTarget: {
    min: 120;
    max: 180;
  };
  exerciseTarget: {
    verbBlankCount: 7;
    vocabularyHintCount: 3;
  };
  blocks: LessonBlock[];
  exercises: LessonExercise[];
  shots: LessonShot[];
};

type LessonBlock =
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
      display: BlankDisplay;
    };

type BlankDisplay =
  | {
      kind: "verb_blank";
      placeholder: "________";
      prompt: string;
    }
  | {
      kind: "vocabulary_hint";
      placeholder: "________";
      pattern: string;
      letterCount: number;
    };

type LessonExercise =
  | {
      id: string;
      type: "verb_blank";
      answer: string;
      baseVerb: string;
    }
  | {
      id: string;
      type: "vocabulary_hint";
      answer: string;
      pattern: string;
      letterCount: number;
    };

type LessonShot = {
  id: string;
  order: 1 | 2;
  imageSlotId: string;
  coveredBlockIds: string[];
  characterIds: string[];
  location: string;
  action: string;
  mood: string;
  scenePrompt: string;
  composition: string;
  continuityNotes: string;
};
```

## 页面行为

入口：
- `/courses/:id/create/lesson-draft`

未生成：
- 显示生成按钮
- 点击后调用 `POST /api/courses/:id/lesson-draft/generate`
- 生成中显示 loading 进度

已生成：
- 加载并展示草稿
- 顶部按章节 Tab 切换
- 老师可编辑：
  - 绘本标题
  - 章节标题
  - 文本 block
  - 练习答案 / 提示 / base verb
  - 每章 2 个 image shot prompt
- 本期不支持新增 / 删除 block、exercise、shot
- 点击保存调用 `PUT /api/courses/:id/lesson-draft`

## API 合同

### `GET /api/courses/:id/lesson-draft`

响应：

```ts
{
  draft: LessonDraft | null;
}
```

失败：
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿加载失败" }`

### `POST /api/courses/:id/lesson-draft/generate`

行为：
- 读取课程、人物画像、已选择故事方案
- 如果已有草稿，直接返回已有草稿
- 调用 DeepSeek 或本地 mock
- 校验并保存 `lesson_draft_v1`

响应：

```ts
201 {
  draft: LessonDraft;
}
```

失败：
- `400 { message: "请先选择故事方案" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿生成失败" }`

### `PUT /api/courses/:id/lesson-draft`

请求：

```ts
{
  draft: LessonDraft;
}
```

响应：

```ts
{
  draft: LessonDraft;
}
```

失败：
- `400 { message: "课文草稿信息不完整" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿保存失败" }`

## 校验规则

- `schemaVersion` 必须是 `lesson_draft_v1`
- `language` 必须是 `en`
- `sourceStoryOptionId` 必须匹配课程选中的故事方案
- 章节数必须匹配 Step 2
- 每章必须有 10 个 exercises
- 每章必须有 7 个 `verb_blank`
- 每章必须有 3 个 `vocabulary_hint`
- 每章必须有 10 个 exercise blocks
- 每个 exercise block 必须引用本章存在的 exercise
- 每个 exercise 必须被且只被一个 exercise block 引用
- 每章必须有 2 个 shots
- shot 的 `coveredBlockIds` 必须引用本章 block
- 两个 shots 合起来必须覆盖本章所有 blocks
- 两个 shots 的 covered blocks 不重叠
- `characterIds` 必须引用全局 characters
- exercise 答案只存储在 `exercises` 中，不能出现在 exercise display 字段中

## 实现状态

- 状态：已实现，待用户验收
- 实现提交：待记录
- 验证命令：`pnpm prisma:generate`、`pnpm prisma:deploy`、`pnpm test`、`pnpm lint`、`pnpm build`
- 验证结果：通过。真实 DeepSeek 验证已为测试课程 `cmr6h7zqm0000tcvove7d1720` 生成草稿，结果为 3 章、首章 10 个练习、首章 2 个图片分镜。
