# Step 3 Lesson Draft Stability Redesign

Date: 2026-07-07

## Context

Step 3 generates an editable English picture-book lesson draft from the selected Step 2 `StoryOption`. The current implementation already uses the right broad pattern: AI generates a content plan, while backend code assembles the final `lesson_draft_v1` structure.

The current instability is caused mainly by making the AI satisfy too many exact structural constraints at once: strict JSON, natural English story writing, inline exercise markers, exact marker counts, exact verb/vocabulary ratios, exact paragraph distributions, image shot semantics, and closing reading. The most frequent failure mode is validation failure, while content quality, exercise quality, and image prompt quality also vary.

## Decisions Confirmed

- Continue using DeepSeek. Do not introduce model switching or fallback in this redesign.
- Keep one user-facing generate action. The backend may be internally staged, but the UI should remain simple.
- Keep the rule that exercise blanks are AI-authored in the story text. Backend code must not invent, choose, backfill, or insert exercises.
- Keep exactly 2 image shots per chapter as a hard requirement.
- Relax exercise constraints: each chapter should target 10 exercises, but 8-10 exercises is acceptable.
- Do not require exact 7 verb blanks + 3 vocabulary hints.
- Do not require exact paragraph exercise distribution.
- Do not run complex automatic retries. Fail fast with a clear message when core requirements are not met.
- Core structure failures block saving. Quality issues that do not break editability or rendering should not block saving.
- Default DeepSeek thinking should be disabled for faster normal generation. Thinking remains available via configuration, but not as the primary stability mechanism.

## Goals

1. Reduce Step 3 generation failures caused by overly strict validation.
2. Preserve the product boundary that AI owns teaching content and inline exercise choices.
3. Keep generated drafts structurally safe for editing, previewing, and later image generation.
4. Improve error messages so users and developers can understand why generation failed.
5. Keep common-case generation latency lower by avoiding default max-effort thinking.

## Non-goals

- Do not add another model provider.
- Do not implement model fallback.
- Do not let code generate missing exercise content.
- Do not add a complex frontend warning panel in this pass.
- Do not save partial drafts.
- Do not redesign Step 2 story generation.

## Architecture

The architecture remains AI content plan plus code assembly.

### AI responsibilities

DeepSeek produces a content plan containing:

- Picture-book title.
- Visual style.
- Character visual descriptions.
- For each Step 2 chapter:
  - Chapter title.
  - Exactly 2 story paragraphs as `markedText`.
  - Inline exercise markers embedded naturally in the text.
  - Exactly 2 image shot semantic plans, one per paragraph.
- Closing reading title and text.

### Backend responsibilities

Backend code:

- Parses JSON and validates the plan shape.
- Parses inline markers.
- Creates stable chapter, block, exercise, shot, image slot, and coverage ids.
- Creates exercise blocks from parsed markers.
- Creates `coveredBlockIds` by paragraph.
- Ensures each chapter has exactly 2 shots.
- Normalizes safe structural fields, including `visualStyle.aspectRatio = "4:3"`.
- Fills missing character visual descriptions from Step 1 people data when AI omits them.
- Extracts `closingReading.vocabularyTerms` from vocabulary hint exercises.
- Removes trailing `The End` from closing reading.
- Performs hard validation for structural safety.

Backend code must not invent missing exercises, insert new blanks, or choose target words from plain text.

## Hard Validation Rules

Hard validation failures prevent saving and should return a readable error.

### Course and draft identity

- `schemaVersion` must be `lesson_draft_v1`.
- `generationMode` must be `ai`.
- `language` must be `en`.
- `sourceStoryOptionId` must match the selected Step 2 story option.
- Chapter count must match the selected story option.
- Each chapter must map to the same-order Step 2 chapter.

### Chapter content

- Each chapter must have non-empty title and text blocks.
- Each chapter must contain 8-10 exercise blocks.
- `chapter.exercises.length` must equal the number of exercise blocks.
- Every exercise block must reference an existing exercise.
- Every exercise must be referenced exactly once.
- Every exercise answer must be non-empty.
- Exercise display data must not reveal the answer.
- Chapter rendered text should not be extremely short or extremely long. Use a wider hard range than today, such as 60-190 words.

### Marker parsing

- Markers must be parseable as `[verb:baseVerb|answer]` or `[vocab:pattern|answer]`.
- Verb marker `baseVerb` and `answer` must be non-empty.
- Vocabulary marker `answer` must be non-empty.
- Vocabulary marker `pattern` may be empty only if backend generates a display pattern from the answer.
- Residual malformed marker fragments should fail with a specific marker syntax error.

### Shots

- Each chapter must have exactly 2 shots.
- Each shot must have non-empty `scenePrompt`, `location`, `action`, `mood`, and `composition`.
- Shot `characterIds` must reference global characters.
- Two shots together must cover every block in the chapter.
- Shot coverage must not overlap.

### Characters and visual style

- Draft must include at least one teacher and all selected students.
- Exactly one character should have role `teacher`.
- Character id, name, appearance, outfit, and consistency prompt must be non-empty after fallback.
- `visualStyle.aspectRatio` must be `4:3`.

## Soft Quality Checks

Soft checks should not block saving in this pass. They can become internal warnings later.

- Exercise count is exactly 10.
- Verb/vocabulary ratio is close to 7/3.
- Each chapter has at least one vocabulary hint.
- Paragraph exercise distribution is balanced.
- Chapter rendered word count is near 110-130 words.
- Closing reading is near 80-120 words.
- Grammar hook is visibly integrated into the story.
- Shot prompt is specific and closely reflects the paragraph action.

## Prompt Changes

The prompt should stop asking the model to satisfy exact paragraph distributions. Replace exact-count constraints with simpler content-plan instructions:

- Use the selected Step 2 story outline as the fixed skeleton.
- Do not invent a new plot or add major new characters.
- Generate exactly one chapter plan per selected chapter, in order.
- Each chapter has exactly 2 `markedText` paragraphs.
- Each chapter targets 8-10 inline exercise markers total.
- Include both verb blank and vocabulary hint markers when natural.
- Put markers in natural story sentences.
- Marker answers must be the exact words that belong in the rendered sentence.
- Do not repeat obvious exercise answers within a chapter when avoidable.
- Each paragraph has one image shot plan matching its visible action.
- Return strict JSON only.

Keep AI output as a plan, not final `LessonDraft`. AI should not output block ids, exercise ids, shot ids, `coveredBlockIds`, word targets, exercise targets, schema version, generation mode, language, or source option id.

## DeepSeek Request Policy

Normal generation should prefer speed and predictable user experience.

Default request:

- `thinking: { type: "disabled" }`
- `temperature: 0.2`
- `response_format: { type: "json_object" }`
- `max_tokens` in the existing practical range, likely 32000 unless tests show it can be reduced.

Configurable deep mode:

- Enabled only when `DEEPSEEK_THINKING=enabled`.
- Use `thinking: { type: "enabled" }`.
- Use `reasoning_effort: "high"` by default, not `max`.
- Do not include `temperature` in thinking mode.

## Error Feedback

Generation should fail fast with specific messages when hard requirements fail.

Examples:

- `AI 返回格式不完整，请重试生成。`
- `第 2 章练习数量不足：需要 8-10 个，当前 6 个。`
- `第 1 章练习标记格式错误：发现残缺 marker。`
- `第 3 章图片分镜不完整：需要 2 个。`
- `第 1 章图片分镜缺少 scenePrompt。`

The frontend can continue displaying the backend message without a new warning UI.

## Implementation Scope

Expected files:

- `lib/server/ai/lesson-draft-generator.ts`
- `lib/server/ai/lesson-draft-generator.test.ts`
- `lib/server/repositories/lesson-drafts.ts`
- `lib/server/repositories/lesson-drafts.test.ts` if existing repository validation tests need updates
- `docs/frontend/course-create-lesson-draft.md`

Frontend changes should be minimal unless needed to display backend errors more clearly. The existing generate button and progress phases can remain.

## Test Plan

Add or update tests for:

1. A chapter with 8 markers validates successfully.
2. A chapter with 10 markers validates successfully.
3. A chapter with fewer than 8 markers fails with a chapter-specific error.
4. Verb/vocabulary ratio different from 7/3 validates if total count is 8-10 and structure is safe.
5. Paragraph distribution is no longer hard validated.
6. Malformed marker syntax fails with a specific marker error.
7. Empty vocabulary pattern can be repaired from answer if answer is present.
8. Empty marker answer still fails.
9. Exactly 2 shots remains required.
10. DeepSeek request defaults to thinking disabled with temperature.
11. `DEEPSEEK_THINKING=enabled` enables thinking with `reasoning_effort=high` and no temperature.
12. Validator accepts wider word-count range and rejects extreme short/long content.

## Rollout Notes

This redesign prioritizes reliable draft creation over perfect generated lesson quality. Teachers can edit imperfect but structurally safe drafts. Later iterations may add non-blocking warnings or a manual deep-retry mode, but those are intentionally outside this pass.
