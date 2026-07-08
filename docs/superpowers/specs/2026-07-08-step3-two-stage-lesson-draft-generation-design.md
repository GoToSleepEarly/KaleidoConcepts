# Step 3 Two-Stage Lesson Draft Generation Design

Date: 2026-07-08

## Context

The current Step 3 generator asks DeepSeek to produce full marked lesson draft content in one pass. Repeated preview runs showed different hard failures: underfilled exercises, excess exercises, duplicate answers, short chapter text, and generic generation failures. Incrementally patching each failure mode is not sufficient and risks lowering lesson quality.

The root problem is task shape: one request asks the model to write the story, place inline exercise markers, satisfy word counts, avoid duplicate answers, generate image shot semantics, produce closing reading, and return strict JSON. This makes instruction following brittle.

## Goal

Improve generation success rate without weakening lesson quality by splitting generation into two focused LLM requests:

1. Generate pure story content and shot semantics.
2. Generate an exercise plan from the already-generated story text.

The backend then performs stable exact string replacement and final `LessonDraft` assembly.

## Decisions

- User still clicks one Generate button.
- Continue using DeepSeek.
- Use exactly two required LLM requests.
- Do not add an automatic third retry. If either stage fails validation, return a clear error.
- AI still owns semantic choices: story text, image semantics, and exercise selection.
- Code only performs deterministic formatting and exact replacement. Code must not choose exercise words, infer semantics, or backfill missing exercises.
- Existing public `LessonDraft` contract remains unchanged.
- Prompt changes are part of the implementation, not optional cleanup.

## Stage 1: Story Content Plan

### LLM request

Input:

- Course basic detail.
- Teacher and student profiles.
- Selected Step 2 `StoryOption`.
- Each chapter summary and knowledge hook.
- Course grammar targets.

Output internal type:

```ts
type AiStoryContentPlan = {
  title: string;
  visualStyle: Omit<LessonVisualStyle, "aspectRatio"> & { aspectRatio?: "4:3" };
  characters: LessonVisualCharacter[];
  chapters: Array<{
    title: string;
    paragraphs: [
      {
        text: string;
        shot: AiShotPlan;
      },
      {
        text: string;
        shot: AiShotPlan;
      }
    ];
  }>;
  closingReading: {
    title: string;
    text: string;
  };
};
```

### Stage 1 prompt requirements

The prompt must remove all inline marker instructions. It should emphasize:

- Generate pure English picture-book text only.
- Do not include `[verb:...]` or `[vocab:...]` markers.
- Preserve the selected Step 2 outline; do not redesign the story.
- Each chapter has exactly two paragraphs.
- Each paragraph should be long enough for later exercise insertion, around 45-70 words.
- Each chapter should render to a basic word-count target suitable for the existing final validator.
- Integrate grammar targets and `knowledgeHook` naturally into story actions.
- Produce exactly one shot semantic plan per paragraph.
- Return strict JSON only.

### Stage 1 hard validation

- Chapter count must match the selected story option.
- Each chapter must have exactly two paragraph objects.
- Paragraph `text` must be non-empty.
- Paragraph text must not contain legacy markers such as `[verb:` or `[vocab:`.
- Chapter rendered word count must meet the baseline needed for final draft validation.
- Each paragraph must include a shot plan with required fields.
- Character and visual style gaps may use existing deterministic fallbacks.

If Stage 1 fails, return a readable `LessonDraftValidationError`; do not call Stage 2.

## Stage 2: Exercise Plan

### LLM request

Input:

- Stage 1 generated chapter texts.
- Course grammar targets.
- Each chapter `knowledgeHook`.
- Exercise target rules.

Output internal type:

```ts
type AiExercisePlan = {
  chapters: Array<{
    chapterIndex: number; // 1-based
    exercises: Array<
      | {
          type: "verb_blank";
          paragraphIndex: 1 | 2;
          answer: string;
          occurrenceText: string;
          baseVerb: string;
        }
      | {
          type: "vocabulary_hint";
          paragraphIndex: 1 | 2;
          answer: string;
          occurrenceText: string;
          pattern: string;
        }
    >;
  }>;
};
```

### Stage 2 prompt requirements

The exercise prompt must be separate from the story prompt. It should emphasize:

- Select exercise points only from the provided text.
- Do not rewrite story text.
- Each chapter should have 7-10 exercises.
- Prefer 8-10 when possible.
- Use verb blanks for grammar practice and vocabulary hints for important story words.
- Do not repeat `answer` within the same chapter.
- `occurrenceText` must be copied exactly from the paragraph text.
- Choose `occurrenceText` values that appear exactly once in the specified paragraph.
- If a word appears multiple times, choose a longer unique phrase only if the full phrase should be blanked; otherwise choose a different answer.
- Return strict JSON only.

### Stage 2 hard validation

For each chapter:

- Exactly one plan entry must exist for each story chapter.
- `chapterIndex` must be in range and not duplicated.
- Exercises count must be 7-10.
- `paragraphIndex` must be 1 or 2.
- `answer` and `occurrenceText` must be non-empty.
- `occurrenceText` must appear exactly once in the target paragraph text.
- The occurrence must not overlap a previously selected occurrence in the same paragraph.
- `answer` must be contained within `occurrenceText`.
- Same-chapter answers must not repeat.
- Verb exercises must have non-empty `baseVerb`.
- Vocabulary exercises must have a displayable `pattern`; if pattern is empty but answer is present, code may generate a pattern mechanically from the answer.

If Stage 2 fails, return a readable `LessonDraftValidationError`; do not call a third LLM request.

## Stage 3: Deterministic Assembly

This stage uses no LLM calls.

For each chapter:

1. Start with the two pure paragraph texts from Stage 1.
2. Apply Stage 2 exercises using exact string replacement within each paragraph.
3. Split text into `LessonBlock` text blocks and exercise blocks.
4. Generate stable exercise ids and block ids.
5. Generate `LessonExercise` records from the AI exercise plan.
6. Assign paragraph 1 blocks to shot 1 and paragraph 2 blocks to shot 2.
7. Inject character consistency into shot prompt and continuity notes.
8. Generate `closingReading.vocabularyTerms` from vocabulary hint exercises.
9. Strip trailing `The End` from closing text.
10. Run final `validateLessonDraft`.

Code must not pick extra exercise words or infer semantic exercise quality.

## Error Handling

Return specific 400 errors for validation failures. Examples:

- `第 1 章正文过短：需要至少 90 词，当前 54 词。`
- `第 2 章练习数量不足：需要 7-10 个，当前 5 个。`
- `第 1 章练习计划无效：occurrenceText "walked" 在第 1 段中出现 2 次，无法稳定替换。`
- `第 3 章练习计划无效：answer "walked" 在同章重复。`
- `第 2 章练习计划无效：occurrenceText "glowing map" 不包含 answer "trail"。`

Unknown upstream failures from DeepSeek should include status/body details in server logs and, where safe, a readable message.

## Prompt Migration

Replace the current single prompt with at least two prompt builders:

- `buildStoryContentPrompt(context)`
- `buildExercisePlanPrompt(context, storyPlan)`

The old marked-text prompt should no longer be the main generation path. Existing helper functions can remain temporarily only if tests still need them during migration, but production `generateLessonDraft` should use the two-stage path.

## Testing Requirements

Add tests for:

- Story content plan without markers assembles with an exercise plan into a valid `LessonDraft`.
- Stage 1 rejects text containing legacy `[verb:` or `[vocab:` markers.
- Stage 1 rejects too-short chapter text.
- Stage 2 rejects fewer than 7 exercises.
- Stage 2 rejects duplicate answers.
- Stage 2 rejects missing occurrence text.
- Stage 2 rejects non-unique occurrence text.
- Stage 2 rejects `occurrenceText` that does not contain `answer`.
- Assembly creates stable exercise blocks and preserves surrounding text.
- Shots cover the expected paragraph block ids.
- `generateLessonDraft` makes exactly two LLM calls on success.
- `generateLessonDraft` does not make a third LLM call after Stage 2 validation failure.

## Rollout

This is a replacement of the generation architecture, not another tactical relaxation. The success criterion is that common model variance is caught at the correct stage with readable errors, while valid two-stage outputs reliably become editable `LessonDraft` records.
