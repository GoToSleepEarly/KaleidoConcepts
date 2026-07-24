# Course Create Step 2: AI Lesson Chat

## Goal

Step 2 is an AI co-writing chat workspace. It starts from either the theme inspiration library or a teacher-provided story idea, collects story intent, generates a text lesson preview, and handles missing third-party character appearance through chat. Formal lesson editing happens in Step 3.

Step 1 keeps only course constraints: teacher, students, level, duration, grammar targets, and model.

## Product Flow

1. Step 1 saves hard classroom constraints only: title, teacher, students, level, duration, grammar targets, and model. It no longer asks for the content theme.
2. Step 2 opens with a lightweight start form:
   - `Start from inspiration library`: the teacher selects one theme preset, then the frontend sends a `story_options` message asking AI to generate three story directions.
   - `I already have an idea`: the teacher enters a story idea, reference plot, or character notes, then the frontend sends a `draft` message asking AI to generate the full text lesson.
3. The start form is frontend-only orchestration. It does not add API, database, or SSE event types; it only composes the first chat message and reuses `POST /lesson-chat/message`.
4. Step 2 internally judges story mode:
   - `original_story`: no third-party work/IP/person. AI can use the Step1 teacher and students as the story action cast. No character visual bible is required in Step2.
   - `reference_story`: user specifies a third-party plot, web novel, game character, network personality, real person, or existing IP role. The referenced characters are story protagonists; Step1 teacher/students remain classroom guides/readers/observers.
5. For `reference_story` and `hybrid_adaptation`, third-party character appearance is a hard checkpoint:
   - If verified web search is available and enabled, AI may use searched material to draft stable visual anchors.
   - If web search is unavailable or disabled, Step2 asks the user in chat to provide appearance anchors.
   - The draft cannot be confirmed while any third-party main character is still marked incomplete or has "待补充" stable features.
6. Step2 right side defaults to preview and can switch to edit mode for small fixes. Editing the text marks the Step3 structured lesson as stale.
7. Clicking "Confirm and Structure" converts the current text draft into `lesson_content_v1`; if the structured lesson is already synced, it directly opens Step3.
8. Step 3 displays the structured lesson and provides formal editing, including character visual bible editing.
9. Step 4 reads the final structured draft and uses the character visual bible for image prompts.

## Draft Format

The chat draft is text, not JSON. It follows a stable classroom format:

```text
Hello class! ...

【角色视觉设定 / Character Visual Bible】
说明：以下设定会用于后续图片生成，可在 Step3 编辑。
Role Name:
身份：故事主角
形象状态：已补全 / 待补充
稳定特征：...
可变状态：...
避免变化：...

【Lesson Meta】
Level: B1
Question Count: 50
Vocabulary: V1-V20
Phrases: P1-P5

【Stage 1】
Title: ...
English Title: ...
Teacher Tip: ...
【Reading】
S1: ...

【Closing Reading】
S1: ...

【教师答案区 / Answer Key】
1. answer
```

`【Character Visual Bible】` appears only for reference or hybrid stories and must be complete before confirmation.

## Stability Strategy

Chat is flexible. Final structuring is deterministic.

Warnings during Step 2 do not block chat:

- Chapter text is short or long.
- Exercise count is below the ideal count.
- A grammar target looks underused.
- Closing reading is shorter than expected.
- Third-party character appearance is incomplete. This is a blocker for reference/hybrid stories.

Hard blockers only apply when confirming structure:

- The text can be converted into a valid intermediate lesson plan.
- Chapter count matches duration.
- Each chapter has two paragraphs after structuring.
- Each chapter has at least one exercise.
- Each exercise has a clear answer and one embedded sentence anchor.
- Closing reading is present.
- Answer key covers the body question numbers.
- `Content Intent` exists.
- Reference/hybrid story character visual bible exists and all third-party character stable features are complete.
- No image URL, image prompt, or resource state is stored in `CourseLessonDraft`.

## Data

`LessonChatDraft` stores the flexible working state:

```prisma
model LessonChatDraft {
  courseId  String   @id
  messages  Json
  draftText String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

`CourseStoryOption` is now an internal bridge record for the final confirmed Step2 text. Structuring creates or updates the synthetic option `chat-final` and sets `Course.selectedStoryOptionId = "chat-final"` so Step3/Step4 can reuse the existing lesson draft and resource pipeline.

`CourseLessonDraft.content` stores `lesson_content_v1`. It may include optional `characterVisualBible`, which Step4 uses as the highest-priority character appearance source.

## API

### `GET /api/courses/:id/lesson-chat`

Returns:

```ts
{
  messages: LessonChatMessage[];
  draftText: string;
  llmModel: LlmModel;
  lessonDraftExists: boolean;
}
```

### `POST /api/courses/:id/lesson-chat/message`

SSE endpoint. Request:

```ts
{
  message: string;
  draftText?: string;
  llmModel?: LlmModel;
  webSearchEnabled?: boolean;
}
```

Events:

- `status`: generation status heartbeat.
- `notice`: non-blocking notices, such as web search unavailable.
- `assistant`: assistant chat reply.
- `story_options`: three selectable directions.
- `draft_reset`: clear preview before a new draft stream.
- `draft_delta`: streamed text lesson chunk.
- `draft`: full current text lesson.
- `done`: saved chat state.
- `error`: failure message.

### `POST /api/courses/:id/lesson-chat/structure`

Request:

```ts
{
  draftText: string;
}
```

Behavior:

1. Parse stages, sentence lines, embedded exercises, answer key, closing reading, and optional character visual bible.
2. Derive a synthetic `StoryOption` with id `chat-final`.
3. Compile to `lesson_content_v1`.
4. Save `CourseStoryOption`, `Course.selectedStoryOptionId`, and `CourseLessonDraft`.
5. Do not delete resource plans or image tasks; Step4 data is overwritten only by explicit regeneration actions.

Returns:

```ts
{
  draft: LessonDraft;
}
```

## Implementation Status

- Status: implemented.
- Current archive: Step2 starts with a frontend-only start form. The old fixed quick prompts and old `/api/courses/:id/story-options` generation APIs have been removed. Theme presets are used only as Step2 inspiration.
- Validation commands: `pnpm lint`, `pnpm build`, `pnpm test`.
- Commit: pending.
