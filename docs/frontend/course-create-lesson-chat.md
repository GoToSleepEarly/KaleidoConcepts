# Course Create Step 2: AI Lesson Chat

## Goal

Step 2 is a unified AI co-writing chat workspace. It helps the teacher confirm the story direction before spending time generating the full lesson text.

The fixed flow is:

`start input -> simple story outline -> teacher confirms outline -> final lesson text -> structure into Step 3`

Step 2 only handles story direction and final lesson text. It does not manage image prompts, reference images, or character visual bibles.

## Product Flow

1. Step 1 saves hard classroom constraints only: title, teacher, students, level, duration, grammar targets, and model.
2. Step 2 opens with two entry points:
   - `Start from inspiration library`: the teacher selects one theme preset.
   - `I already have an idea`: the teacher can enter an original idea, vague direction, reference story, historical person, game character, IP, or existing plot notes.
3. The first AI response must be a simple story outline. AI must not generate the final lesson text before the teacher confirms the outline.
4. The outline assistant message carries contextual action buttons. The frontend does not infer the current stage from AI text; it only renders `message.actions` when present.
5. Clicking `Confirm and generate final text` sends the action message back to the same chat endpoint and generates the final lesson text into the right-side preview.
6. After the final lesson text is generated, no extra assistant action buttons are shown. The teacher uses the page-level `Confirm and enter Step 3` button.
7. Step 3 structures and edits only lesson content.
8. Step 4 handles image resources and lightweight external-person/IP visual approximation from the final text.

## Simple Outline Format

AI must use this user-facing outline shape:

```text
故事题目：
参考来源：
主要角色：
故事目标：
章节大纲：
1. ...
2. ...
3. ...
课堂适配：
需要确认：
```

Rules:

- Keep the outline short.
- Do not generate full reading paragraphs, exercises, answer keys, image prompts, story modes, or internal fields.
- If the teacher mentions a reference work, historical person, real person, game, IP, or fixed character, explain the adaptation boundary in normal language.

## Message Actions

`LessonChatMessage` may include:

```ts
type LessonChatAction = {
  id: string;
  label: string;
  message: string;
  intent?: "outline" | "draft" | "revise";
};
```

The outline response uses four actions:

- `Confirm and generate final text`
- `Revise outline`
- `Try another direction`
- `Add reference information`

The frontend renders these buttons under the assistant message. Buttons either send the action message directly or prefill the input for teacher edits.

## Final Text Format

The final lesson text must contain only lesson content:

```text
【Lesson Draft】
Story Title: English story title
Hello class! ...

【Lesson Meta】
...

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

The final text must not contain the confirmed outline, image URLs, image prompts, resource state, or non-lesson explanations.

Exercise placement rules:

- Blanks and hints must be embedded at the missing-word position inside the sentence.
- Correct: `ZiXuan smiled and said, "You (3) ________ (ask) (提示：现在完成时) a question that many psychologists study."`
- Incorrect: `ZiXuan smiled and said, "You ________ a question that many psychologists study." (3) ________ (ask) (提示：现在完成时)`
- Question distribution should follow the course duration budget: vocabulary labels, verb phrases, and grammar/choice blanks must be spread across stages instead of clustered.
- Each stage Reading should target 130-145 English words and stay within 120-160 words.

## Structuring Rules

Step 2 -> Step 3 only validates lesson content:

- final text exists
- stages are parseable and match the expected course duration
- each stage has reading text
- exercises have answers
- answer key covers the body question numbers
- closing reading exists
- no image resource data is stored in `CourseLessonDraft`

Step 2 no longer blocks on reference story metadata or third-party character appearance.

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
  intent?: "outline" | "draft" | "revise";
  llmModel?: LlmModel;
}
```

Events:

- `status`: generation status heartbeat.
- `assistant`: assistant chat reply; may include `actions`.
- `draft_reset`: clear preview before a new final-text stream.
- `draft_delta`: streamed final text chunk.
- `draft`: full current final text.
- `done`: saved chat state.
- `error`: failure message.

Refresh behavior:

- Step2 final-text generation is still request-bound SSE in the MVP; refreshing the page stops the active browser request.
- To avoid losing everything, the server saves a recoverable chat state before streaming and persists partial `draftText` during the stream.
- After refresh, the teacher sees the latest saved partial text and can continue revising or regenerate from the confirmed outline.

Side effect:

- Every AI call writes one `AiGenerationLog` row when the database is reachable.
- Logs are request-level, not message-level. One row records the resolved intent, model, input snapshot, output text, status, error message, and latency.
- Logging failure must not block the teacher's current generation flow; the server reports it to application logs and continues.
- `input` stores the course constraints, teacher/student profiles, prior Step2 messages, current draft snapshot, teacher message, requested intent, and resolved intent. This is enough to replay and compare future prompt/model changes without depending on mutable UI state.
- Failed calls record the same available input snapshot plus the error message and any partial output collected before failure.

### `POST /api/courses/:id/lesson-chat/structure`

Request:

```ts
{
  draftText: string;
}
```

Behavior:

1. Parse stages, sentence lines, embedded exercises, answer key, and closing reading.
2. Derive a synthetic `StoryOption` with id `chat-final` for existing Step3/Step4 pipeline compatibility.
3. Compile to `lesson_content_v1`.
4. Save `CourseStoryOption`, `Course.selectedStoryOptionId`, and `CourseLessonDraft`.
5. Do not store image URL, image prompt, resource state, or character visual bible in `CourseLessonDraft`.

## Implementation Status

- Status: implemented. 2026-07-28 updated right-side empty state into an outline workspace, added persistent AI generation logs, added partial stream persistence, moved Step3 entry to the page header, and tightened inline exercise placement / distribution prompt rules.
- Validation commands: `pnpm exec vitest run lib/server/ai/lesson-chat-structure.test.ts lib/server/ai/resource-plan-generator.test.ts`, `pnpm exec eslint ...`, `pnpm exec prisma validate`.
- Commit: pending.
