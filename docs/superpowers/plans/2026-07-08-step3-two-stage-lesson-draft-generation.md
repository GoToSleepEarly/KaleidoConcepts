# Step 3 Two-Stage Lesson Draft Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle one-shot `markedText` lesson draft generator with a two-stage generator: first pure story content, then AI-authored exercise plans applied by deterministic exact replacement.

**Architecture:** `generateLessonDraft` will make exactly two DeepSeek calls on the success path: one for `AiStoryContentPlan`, one for `AiExercisePlan`. The backend will assemble the existing public `LessonDraft` contract by exact string replacement only; it will not choose exercise words, infer semantics, backfill exercises, or perform a third LLM retry. Old tactical markedText repair/cap/dedup production logic will be removed from the main path.

**Tech Stack:** TypeScript, Next.js route handlers, DeepSeek chat completions API, Vitest.

---

## File Structure

- Modify `lib/server/ai/lesson-draft-generator.ts`
  - Replace old `AiParagraphPlan.markedText` path with `AiStoryContentPlan` and `AiExercisePlan`.
  - Add `buildStoryContentPrompt(context)` and `buildExercisePlanPrompt(context, storyPlan)`.
  - Add deterministic exact replacement assembly helpers.
  - Remove old production helpers for `parseMarkedText`, `capChapterMarkers`, `validateChapterMarkers`, `buildChapterRepairPrompt`, `parseChapterPlan`, and failed chapter repair.

- Modify `lib/server/ai/lesson-draft-generator.test.ts`
  - Replace markedText-focused tests with two-stage tests.
  - Keep DeepSeek request body tests.
  - Add tests for story validation, exercise plan validation, exact replacement, and two-call generation behavior.

- Modify `lib/server/repositories/lesson-drafts.ts`
  - Keep final public `LessonDraft` validation strict enough for saved drafts.
  - Ensure hard exercise range remains 7-10 and word range remains 60-190.

- Modify `lib/server/repositories/lesson-drafts.test.ts`
  - Ensure 5 exercises fails and 7 exercises passes.

- Modify `docs/frontend/course-create-lesson-draft.md`
  - Update generation strategy from inline markedText to two-stage story/exercise plan.
  - Remove references to old tactical retry/marker cap/dedup as the main generation strategy.

---

### Task 1: Restore final validator quality floor

**Files:**
- Modify: `lib/server/repositories/lesson-drafts.ts`
- Modify: `lib/server/repositories/lesson-drafts.test.ts`

- [ ] **Step 1: Confirm validator tests express the intended floor**

Ensure `lib/server/repositories/lesson-drafts.test.ts` contains these tests inside `describe("lesson draft validation", ...)`:

```ts
  test("accepts a draft with 7 exercises in one chapter", () => {
    const sevenExerciseDraft = removeExercises(draft, ["c1-e8", "c1-e9", "c1-e10"]);

    expect(validateLessonDraft(sevenExerciseDraft, storyOption)).toEqual(sevenExerciseDraft);
  });

  test("rejects a draft with fewer than 7 exercises in one chapter", () => {
    const fiveExerciseDraft = removeExercises(draft, ["c1-e6", "c1-e7", "c1-e8", "c1-e9", "c1-e10"]);

    expect(() => validateLessonDraft(fiveExerciseDraft, storyOption)).toThrow("第 1 章练习数量不足：需要 7-10 个，当前 5 个");
  });
```

- [ ] **Step 2: Run validator tests**

Run:

```bash
pnpm test lib/server/repositories/lesson-drafts.test.ts
```

Expected: PASS. If it fails because the minimum is still 5, update `lib/server/repositories/lesson-drafts.ts`:

```ts
const minExercisesPerChapter = 7;
const maxExercisesPerChapter = 10;
```

and ensure error messages say `需要 7-10 个`.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add lib/server/repositories/lesson-drafts.ts lib/server/repositories/lesson-drafts.test.ts
git commit -m "Restore lesson draft validation floor"
```

If no files changed, skip the commit.

---

### Task 2: Replace markedText tests with two-stage assembly tests

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.test.ts`

- [ ] **Step 1: Rewrite imports for new public test surface**

At the top of `lib/server/ai/lesson-draft-generator.test.ts`, use:

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CourseBasicDetail, PersonProfile, StoryOption } from "@/lib/contracts/api";

import {
  assembleLessonDraftFromPlans,
  buildDeepSeekRequestBody,
  generateLessonDraft,
} from "./lesson-draft-generator";
import { validateLessonDraft } from "../repositories/lesson-drafts";
```

- [ ] **Step 2: Replace old markedText assembly tests with story/exercise fixtures**

Delete tests that call `assembleLessonDraftFromPlan` with `markedText`. Add these helpers after `const context = ...`:

```ts
function deepSeekResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function shotPlan(action: string) {
  return {
    characterIds: ["teacher-1", "student-1"],
    location: "quiet forest gate",
    action,
    mood: "curious and safe",
    scenePrompt: `${action} in a warm watercolor forest scene.`,
    composition: "Wide 4:3 picture-book scene with both characters clearly visible.",
    continuityNotes: "Keep character consistency.",
  };
}

const storyPlan = {
  title: "The Forest Gate",
  visualStyle: {
    artStyle: "warm watercolor picture book",
    colorPalette: "soft greens and gold light",
    consistencyPrompt: "Use a consistent watercolor picture-book style.",
  },
  characters: [
    {
      id: "teacher-1",
      name: "Ms. Lin",
      role: "teacher" as const,
      appearance: "kind teacher with black hair and round glasses",
      outfit: "blue cardigan and white shirt",
      consistencyPrompt: "Ms. Lin keeps the same glasses, hair, and cardigan.",
    },
    {
      id: "student-1",
      name: "Summer",
      role: "student" as const,
      appearance: "girl with black hair and a green dress",
      outfit: "green dress and yellow backpack",
      consistencyPrompt: "Summer keeps the same hair, dress, and backpack.",
    },
  ],
  chapters: [
    {
      title: "The Gate Opens",
      paragraphs: [
        {
          text: "Yesterday morning, Ms. Lin walked toward the quiet forest gate with Summer beside her. Summer carried her sketchbook and looked at the silver leaves. Ms. Lin asked one calm question about the strange path, and Summer noticed a small arrow on the stone. They opened the gate together and stepped into warm green light.",
          shot: shotPlan("Ms. Lin and Summer discover the first arrow beside the gate."),
        },
        {
          text: "Inside the forest, the glowing map shone under a blue flower. Summer touched the page and found a hidden trail. Ms. Lin helped her read the marks, and they followed the trail across a tiny bridge. The clue pointed to a bright tree, so Summer shared her idea with a proud smile.",
          shot: shotPlan("Summer studies the glowing map while Ms. Lin helps her choose the trail."),
        },
      ],
    },
  ],
  closingReading: {
    title: "After the Forest Gate",
    text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
  },
};

const exercisePlan = {
  chapters: [
    {
      chapterIndex: 1,
      exercises: [
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "walked", occurrenceText: "walked", baseVerb: "walk" },
        { type: "vocabulary_hint" as const, paragraphIndex: 1 as const, answer: "gate", occurrenceText: "gate", pattern: "g _ _ e" },
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "carried", occurrenceText: "carried", baseVerb: "carry" },
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "looked", occurrenceText: "looked", baseVerb: "look" },
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "asked", occurrenceText: "asked", baseVerb: "ask" },
        { type: "vocabulary_hint" as const, paragraphIndex: 2 as const, answer: "map", occurrenceText: "map", pattern: "m _ p" },
        { type: "verb_blank" as const, paragraphIndex: 2 as const, answer: "touched", occurrenceText: "touched", baseVerb: "touch" },
        { type: "vocabulary_hint" as const, paragraphIndex: 2 as const, answer: "trail", occurrenceText: "trail", pattern: "t _ _ _ l" },
        { type: "verb_blank" as const, paragraphIndex: 2 as const, answer: "helped", occurrenceText: "helped", baseVerb: "help" },
        { type: "verb_blank" as const, paragraphIndex: 2 as const, answer: "followed", occurrenceText: "followed", baseVerb: "follow" },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```

- [ ] **Step 3: Add two-stage success test**

Add:

```ts
describe("lesson draft two-stage assembly", () => {
  test("assembles pure story text and exercise plan into a valid lesson draft", () => {
    const draft = assembleLessonDraftFromPlans(storyPlan, exercisePlan, context);

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises).toHaveLength(10);
    expect(draft.chapters[0].shots).toHaveLength(2);
    expect(draft.closingReading.vocabularyTerms).toEqual(["gate", "map", "trail"]);

    const rendered = draft.chapters[0].blocks
      .map((block) => (block.type === "text" ? block.text : `[${draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.answer}]`))
      .join("");
    expect(rendered).toContain("Ms. Lin [walked] toward the quiet forest [gate]");
    expect(rendered).toContain("the glowing [map] shone");
  });
});
```

- [ ] **Step 4: Run test and verify RED**

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "two-stage assembly"
```

Expected: FAIL because `assembleLessonDraftFromPlans` is not exported yet.

---

### Task 3: Implement two-stage internal types and assembly

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.ts`

- [ ] **Step 1: Add new internal types**

Replace old markedText-specific types with:

```ts
type AiShotPlan = Omit<LessonShot, "id" | "order" | "imageSlotId" | "coveredBlockIds">;

type AiStoryParagraphPlan = {
  text: string;
  shot: AiShotPlan;
};

type AiStoryChapterPlan = {
  title: string;
  paragraphs: [AiStoryParagraphPlan, AiStoryParagraphPlan];
};

type AiStoryContentPlan = {
  title: string;
  visualStyle: Omit<LessonVisualStyle, "aspectRatio"> & { aspectRatio?: "4:3" };
  characters: LessonVisualCharacter[];
  chapters: AiStoryChapterPlan[];
  closingReading: {
    title: string;
    text: string;
  };
};

type AiExercisePlan = {
  chapters: AiExerciseChapterPlan[];
};

type AiExerciseChapterPlan = {
  chapterIndex: number;
  exercises: AiExercisePlanItem[];
};

type AiExercisePlanItem =
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
    };
```

- [ ] **Step 2: Add exact replacement helpers**

Add these helpers near `stripTheEnd`:

```ts
function assertNoLegacyMarkers(text: string, chapterIndex: number) {
  if (/\[(?:verb|vocab):/.test(text)) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章正文包含旧 marker，请重新生成纯正文`);
  }
}

function findUniqueOccurrence(text: string, occurrenceText: string, chapterIndex: number, paragraphIndex: number) {
  const first = text.indexOf(occurrenceText);
  if (first < 0) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${occurrenceText}" 在第 ${paragraphIndex} 段中不存在`);
  }

  const second = text.indexOf(occurrenceText, first + occurrenceText.length);
  if (second >= 0) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${occurrenceText}" 在第 ${paragraphIndex} 段中出现多次，无法稳定替换`);
  }

  return first;
}

function validateExercisePlanItem(item: AiExercisePlanItem, chapterIndex: number) {
  if (!Number.isInteger(item.paragraphIndex) || (item.paragraphIndex !== 1 && item.paragraphIndex !== 2)) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：paragraphIndex 必须是 1 或 2`);
  }

  if (!nonEmptyString(item.answer, "") || !nonEmptyString(item.occurrenceText, "")) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：answer 和 occurrenceText 不能为空`);
  }

  if (!item.occurrenceText.includes(item.answer)) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${item.occurrenceText}" 不包含 answer "${item.answer}"`);
  }

  if (item.type === "verb_blank" && !nonEmptyString(item.baseVerb, "")) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：verb_blank 缺少 baseVerb`);
  }
}
```

- [ ] **Step 3: Add `assembleParagraphBlocks` helper**

Add:

```ts
function assembleParagraphBlocks({
  paragraphText,
  exercises,
  chapterIndex,
  paragraphIndex,
  prefix,
  blocks,
  lessonExercises,
}: {
  paragraphText: string;
  exercises: AiExercisePlanItem[];
  chapterIndex: number;
  paragraphIndex: 1 | 2;
  prefix: string;
  blocks: LessonDraft["chapters"][number]["blocks"];
  lessonExercises: LessonExercise[];
}) {
  const sorted = exercises
    .map((exercise) => ({ exercise, start: findUniqueOccurrence(paragraphText, exercise.occurrenceText, chapterIndex, paragraphIndex) }))
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  const paragraphBlockIds: string[] = [];

  for (const { exercise, start } of sorted) {
    validateExercisePlanItem(exercise, chapterIndex);

    if (start < cursor) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：第 ${paragraphIndex} 段练习位置重叠`);
    }

    if (start > cursor) {
      const textBlock = { id: `${prefix}-block-${blocks.length + 1}`, order: blocks.length + 1, type: "text" as const, text: paragraphText.slice(cursor, start) };
      blocks.push(textBlock);
      paragraphBlockIds.push(textBlock.id);
    }

    const exerciseId = `${prefix}-exercise-${lessonExercises.length + 1}`;
    const lessonExercise: LessonExercise =
      exercise.type === "verb_blank"
        ? { id: exerciseId, type: "verb_blank", answer: exercise.answer, baseVerb: exercise.baseVerb }
        : { id: exerciseId, type: "vocabulary_hint", answer: exercise.answer, pattern: exercise.pattern || vocabularyPattern(exercise.answer), letterCount: vocabularyLetterCount(exercise.answer) };
    lessonExercises.push(lessonExercise);

    const exerciseBlock = {
      id: `${prefix}-block-${blocks.length + 1}`,
      order: blocks.length + 1,
      type: "exercise" as const,
      exerciseId,
      display:
        lessonExercise.type === "verb_blank"
          ? { kind: "verb_blank" as const, placeholder: "________" as const, prompt: lessonExercise.baseVerb }
          : { kind: "vocabulary_hint" as const, placeholder: "________" as const, pattern: lessonExercise.pattern, letterCount: lessonExercise.letterCount },
    };
    blocks.push(exerciseBlock);
    paragraphBlockIds.push(exerciseBlock.id);

    cursor = start + exercise.occurrenceText.length;
  }

  if (cursor < paragraphText.length) {
    const textBlock = { id: `${prefix}-block-${blocks.length + 1}`, order: blocks.length + 1, type: "text" as const, text: paragraphText.slice(cursor) };
    blocks.push(textBlock);
    paragraphBlockIds.push(textBlock.id);
  }

  return paragraphBlockIds;
}
```

- [ ] **Step 4: Export `assembleLessonDraftFromPlans`**

Implement:

```ts
export function assembleLessonDraftFromPlans(storyPlanInput: AiStoryContentPlan, exercisePlanInput: AiExercisePlan, context: LessonDraftGenerationContext): LessonDraft {
  const storyPlan = parseStoryContentPlan(storyPlanInput);
  const exercisePlan = parseExercisePlan(exercisePlanInput);
  const characters = stableCharacterPlans(storyPlan, context);
  const visualStyle = (isObject(storyPlan.visualStyle) ? storyPlan.visualStyle : {}) as Partial<AiStoryContentPlan["visualStyle"]>;
  const exercisePlanByChapter = new Map(exercisePlan.chapters.map((chapter) => [chapter.chapterIndex, chapter]));

  const chapters = context.storyOption.chapters.map((outlineChapter, chapterIndex) => {
    const chapterPlan = storyPlan.chapters[chapterIndex];
    const exerciseChapter = exercisePlanByChapter.get(chapterIndex + 1);
    const prefix = `chapter-${chapterIndex + 1}`;
    const rawParagraphs = Array.isArray(chapterPlan?.paragraphs) ? chapterPlan.paragraphs.slice(0, 2) : [];
    const paragraphs = [0, 1].map((paragraphIndex) => {
      const paragraph = rawParagraphs[paragraphIndex];
      const text = ensureParagraphLength(nonEmptyString(paragraph?.text, outlineChapter.summary), context, chapterIndex, paragraphIndex);
      assertNoLegacyMarkers(text, chapterIndex);
      return {
        text,
        shot: sanitizeShotPlan(paragraph?.shot, context, characters, chapterPlan?.title ?? outlineChapter.title, text),
      };
    }) as [AiStoryParagraphPlan, AiStoryParagraphPlan];

    if (!exerciseChapter) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划缺失`);
    }

    const answers = exerciseChapter.exercises.map((exercise) => exercise.answer.trim().toLowerCase());
    if (new Set(answers).size !== answers.length) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：answer 在同章重复`);
    }

    if (exerciseChapter.exercises.length < minExercisesPerChapter || exerciseChapter.exercises.length > maxExercisesPerChapter) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习数量${exerciseChapter.exercises.length < minExercisesPerChapter ? "不足" : "过多"}：需要 7-10 个，当前 ${exerciseChapter.exercises.length} 个`);
    }

    const blocks: LessonDraft["chapters"][number]["blocks"] = [];
    const lessonExercises: LessonExercise[] = [];
    const paragraphBlockIds = paragraphs.map((paragraph, paragraphIndex) =>
      assembleParagraphBlocks({
        paragraphText: paragraph.text,
        exercises: exerciseChapter.exercises.filter((exercise) => exercise.paragraphIndex === paragraphIndex + 1),
        chapterIndex,
        paragraphIndex: (paragraphIndex + 1) as 1 | 2,
        prefix,
        blocks,
        lessonExercises,
      }),
    );

    return {
      id: prefix,
      sourceOutlineChapterIndex: chapterIndex + 1,
      title: nonEmptyString(chapterPlan?.title, outlineChapter.title),
      wordTarget: { min: chapterWordTarget.min, max: chapterWordTarget.max },
      exerciseTarget: { verbBlankCount: 7 as const, vocabularyHintCount: 3 as const },
      blocks,
      exercises: lessonExercises,
      shots: paragraphs.map((paragraph, paragraphIndex) => ({
        id: `${prefix}-shot-${paragraphIndex + 1}`,
        order: (paragraphIndex + 1) as 1 | 2,
        imageSlotId: `${prefix}-image-${paragraphIndex + 1}`,
        coveredBlockIds: paragraphBlockIds[paragraphIndex],
        ...withCharacterConsistency(paragraph.shot, characters),
      })),
    };
  });

  const draft: LessonDraft = {
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: context.storyOption.id,
    generationMode: "ai",
    title: nonEmptyString(storyPlan.title, context.storyOption.title),
    language: "en",
    visualStyle: {
      artStyle: nonEmptyString(visualStyle.artStyle, "warm children's storybook watercolor"),
      colorPalette: nonEmptyString(visualStyle.colorPalette, "soft greens, blues, and warm light"),
      aspectRatio: "4:3",
      consistencyPrompt: nonEmptyString(visualStyle.consistencyPrompt, "Use a consistent picture-book style across all images."),
    },
    characters,
    chapters,
    closingReading: {
      title: nonEmptyString(storyPlan.closingReading?.title, `After ${context.storyOption.title}`),
      text: stripTheEnd(ensureParagraphLength(nonEmptyString(storyPlan.closingReading?.text, ""), context, 0, 1)),
      vocabularyTerms: uniqueNonEmpty(
        chapters.flatMap((chapter) => chapter.exercises.filter((exercise) => exercise.type === "vocabulary_hint").map((exercise) => exercise.answer)),
      ).slice(0, 12),
    },
  };

  return draft;
}
```

- [ ] **Step 5: Add simple parse functions**

Add:

```ts
function parseStoryContentPlan(value: unknown): AiStoryContentPlan {
  if (!isObject(value) || !Array.isArray(value.chapters)) {
    throw new LessonDraftValidationError("AI story content plan is incomplete");
  }

  return value as AiStoryContentPlan;
}

function parseExercisePlan(value: unknown): AiExercisePlan {
  if (!isObject(value) || !Array.isArray(value.chapters)) {
    throw new LessonDraftValidationError("AI exercise plan is incomplete");
  }

  return value as AiExercisePlan;
}
```

- [ ] **Step 6: Run two-stage assembly tests**

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "two-stage assembly"
```

Expected: PASS.

- [ ] **Step 7: Commit assembly implementation**

```bash
git add lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
git commit -m "Assemble lesson drafts from story and exercise plans"
```

---

### Task 4: Add exercise plan validation tests

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.test.ts`
- Modify: `lib/server/ai/lesson-draft-generator.ts`

- [ ] **Step 1: Add missing occurrence test**

Add inside `describe("lesson draft two-stage assembly", ...)`:

```ts
  test("rejects exercise occurrence text that is missing from the paragraph", () => {
    const invalidPlan = structuredClone(exercisePlan);
    invalidPlan.chapters[0].exercises[0].occurrenceText = "danced";
    invalidPlan.chapters[0].exercises[0].answer = "danced";

    expect(() => assembleLessonDraftFromPlans(storyPlan, invalidPlan, context)).toThrow('occurrenceText "danced" 在第 1 段中不存在');
  });
```

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "missing from the paragraph"
```

Expected: PASS after Task 3 helper implementation.

- [ ] **Step 2: Add duplicate occurrence test**

Add:

```ts
  test("rejects exercise occurrence text that appears multiple times", () => {
    const repeatedStory = structuredClone(storyPlan);
    repeatedStory.chapters[0].paragraphs[0].text = `${repeatedStory.chapters[0].paragraphs[0].text} Ms. Lin walked again.`;

    expect(() => assembleLessonDraftFromPlans(repeatedStory, exercisePlan, context)).toThrow('occurrenceText "walked" 在第 1 段中出现多次');
  });
```

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "appears multiple times"
```

Expected: PASS after Task 3 helper implementation.

- [ ] **Step 3: Add duplicate answer test**

Add:

```ts
  test("rejects duplicate exercise answers in one chapter", () => {
    const invalidPlan = structuredClone(exercisePlan);
    invalidPlan.chapters[0].exercises[1] = { ...invalidPlan.chapters[0].exercises[1], answer: "walked", occurrenceText: "walked" };

    expect(() => assembleLessonDraftFromPlans(storyPlan, invalidPlan, context)).toThrow("第 1 章练习计划无效：answer 在同章重复");
  });
```

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "duplicate exercise answers"
```

Expected: PASS after Task 3 duplicate answer validation.

- [ ] **Step 4: Add insufficient exercises test**

Add:

```ts
  test("rejects fewer than 7 exercise plan items", () => {
    const invalidPlan = structuredClone(exercisePlan);
    invalidPlan.chapters[0].exercises = invalidPlan.chapters[0].exercises.slice(0, 6);

    expect(() => assembleLessonDraftFromPlans(storyPlan, invalidPlan, context)).toThrow("第 1 章练习数量不足：需要 7-10 个，当前 6 个");
  });
```

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "fewer than 7"
```

Expected: PASS after Task 3 count validation.

- [ ] **Step 5: Commit validation tests**

```bash
git add lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
git commit -m "Validate lesson draft exercise plans"
```

---

### Task 5: Replace generation prompts and production flow

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.ts`
- Modify: `lib/server/ai/lesson-draft-generator.test.ts`

- [ ] **Step 1: Add prompt builders**

Replace old `buildPrompt` with two functions:

```ts
function buildStoryContentPrompt(context: LessonDraftGenerationContext) {
  return [
    "Use the selected story outline as the fixed skeleton. Write pure student-facing English picture-book content and image shot semantics. Do not redesign the story.",
    "",
    "Course:",
    `- Title: ${context.course.title}`,
    `- English level: ${context.course.englishLevel}`,
    `- Duration: ${context.course.durationMinutes} minutes`,
    `- Theme/world setting: ${context.course.theme}`,
    `- Grammar targets: ${context.course.grammar.join(", ")}`,
    "",
    "Selected story outline:",
    `- id: ${context.storyOption.id}`,
    `- title: ${context.storyOption.title}`,
    `- logline: ${context.storyOption.logline}`,
    "- chapters:",
    context.storyOption.chapters.map((chapter, index) => `  ${index + 1}. ${chapter.title}\n     story summary: ${chapter.summary}\n     grammar hook: ${chapter.knowledgeHook}`).join("\n"),
    "",
    "Characters:",
    `- teacher: id=${context.teacher.id}; name=${personName(context.teacher)}; appearance=${context.teacher.appearance ?? "not provided"}; notes=${context.teacher.notes ?? "none"}`,
    context.students.map((student) => `- student: id=${student.id}; name=${personName(student)}; age=${student.age ?? "unknown"}; appearance=${student.appearance ?? "not provided"}; interests=${student.interests.join(", ") || "not provided"}; learning goal=${student.learningGoal ?? "not provided"}; notes=${student.notes ?? "none"}`).join("\n"),
    "",
    "Output requirements:",
    "- Return strict minified JSON only. No Markdown. No explanation. No comments. No extra keys.",
    "- Return a story content plan, not the final database LessonDraft.",
    "- Do not include exercise markers. Do not include [verb:...] or [vocab:...].",
    "- Each chapter must have exactly two paragraphs.",
    "- Each paragraph.text must be pure English story text, about 45-70 words.",
    "- The chapter story must visibly use the grammar targets and chapter grammar hook in natural story actions.",
    "- Each paragraph has its own image shot semantics.",
    "- shot.characterIds must reference global character ids only.",
    "- closingReading.text must be English only, 80-120 words, no blanks, no exercises, no image prompt, and no final The End sentence.",
    "",
    "Required JSON shape:",
    `{"title":"string","visualStyle":{"artStyle":"string","colorPalette":"string","aspectRatio":"4:3","consistencyPrompt":"string"},"characters":[{"id":"${context.teacher.id}","name":"string","role":"teacher","appearance":"string","outfit":"string","consistencyPrompt":"string"}],"chapters":[{"title":"string","paragraphs":[{"text":"pure story paragraph with no exercise markers","shot":{"characterIds":["${context.teacher.id}"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}},{"text":"pure story paragraph with no exercise markers","shot":{"characterIds":["${context.teacher.id}"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}}]}],"closingReading":{"title":"string","text":"80-120 English words"}}`,
  ].join("\n");
}

function buildExercisePlanPrompt(context: LessonDraftGenerationContext, storyPlan: AiStoryContentPlan) {
  return [
    "Create an exercise plan from the provided story text. Do not rewrite story text. Return strict minified JSON only.",
    "",
    "Course grammar targets:",
    context.course.grammar.join(", "),
    "",
    "Exercise rules:",
    "- Each chapter must have 7-10 exercises; prefer 8-10 when possible.",
    "- Use verb_blank for grammar practice and vocabulary_hint for important story words.",
    "- Do not repeat answer within the same chapter.",
    "- occurrenceText must be copied exactly from the specified paragraph text.",
    "- occurrenceText must appear exactly once in that paragraph.",
    "- answer must be contained inside occurrenceText.",
    "- Code will do exact string replacement only, so do not rely on semantic matching.",
    "",
    "Story text by chapter:",
    storyPlan.chapters.map((chapter, chapterIndex) => {
      const outline = context.storyOption.chapters[chapterIndex];
      return [`Chapter ${chapterIndex + 1}: ${chapter.title}`, `Knowledge hook: ${outline?.knowledgeHook ?? "not provided"}`, `Paragraph 1: ${chapter.paragraphs[0]?.text ?? ""}`, `Paragraph 2: ${chapter.paragraphs[1]?.text ?? ""}`].join("\n");
    }).join("\n\n"),
    "",
    "Required JSON shape:",
    '{"chapters":[{"chapterIndex":1,"exercises":[{"type":"verb_blank","paragraphIndex":1,"answer":"walked","occurrenceText":"walked","baseVerb":"walk"},{"type":"vocabulary_hint","paragraphIndex":1,"answer":"gate","occurrenceText":"gate","pattern":"g _ _ e"}]}]}',
  ].join("\n");
}
```

- [ ] **Step 2: Replace `generateLessonDraft` production path**

Replace the current `generateLessonDraft` non-mock path with:

```ts
  const storyMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert English picture-book content designer and structured JSON formatter. Return pure story content with no exercise markers. Return strict JSON only.",
    },
    {
      role: "user",
      content: buildStoryContentPrompt(context),
    },
  ];
  const storyPlan = parseStoryContentPlan(parseJsonObject(await callDeepSeek(storyMessages)));

  const exerciseMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You create precise exercise plans from existing text. Copy occurrenceText exactly and return strict JSON only.",
    },
    {
      role: "user",
      content: buildExercisePlanPrompt(context, storyPlan),
    },
  ];
  const exercisePlan = parseExercisePlan(parseJsonObject(await callDeepSeek(exerciseMessages)));

  return validateLessonDraft(assembleLessonDraftFromPlans(storyPlan, exercisePlan, context), context.storyOption);
```

- [ ] **Step 3: Add two-call generation test**

Add:

```ts
describe("lesson draft generation", () => {
  test("uses exactly two LLM calls on a valid generation", async () => {
    const originalApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValueOnce(deepSeekResponse(storyPlan)).mockResolvedValueOnce(deepSeekResponse(exercisePlan));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const draft = await generateLessonDraft(context);

      expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const storyBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const exerciseBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(storyBody.messages[1].content).toContain("Do not include exercise markers");
      expect(exerciseBody.messages[1].content).toContain("occurrenceText must be copied exactly");
    } finally {
      if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalApiKey;
    }
  });
});
```

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "exactly two LLM calls"
```

Expected: PASS.

- [ ] **Step 4: Add no-third-call failure test**

Add:

```ts
  test("does not make a third LLM call after invalid exercise plan", async () => {
    const originalApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    const invalidExercisePlan = structuredClone(exercisePlan);
    invalidExercisePlan.chapters[0].exercises = invalidExercisePlan.chapters[0].exercises.slice(0, 6);
    const fetchMock = vi.fn().mockResolvedValueOnce(deepSeekResponse(storyPlan)).mockResolvedValueOnce(deepSeekResponse(invalidExercisePlan));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(generateLessonDraft(context)).rejects.toThrow("第 1 章练习数量不足：需要 7-10 个，当前 6 个");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalApiKey;
    }
  });
```

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "does not make a third"
```

Expected: PASS.

- [ ] **Step 5: Commit prompt and generation path**

```bash
git add lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
git commit -m "Generate lesson drafts in two LLM stages"
```

---

### Task 6: Delete obsolete markedText production helpers and tests

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.ts`
- Modify: `lib/server/ai/lesson-draft-generator.test.ts`

- [ ] **Step 1: Delete obsolete helpers**

Remove these from `lib/server/ai/lesson-draft-generator.ts` if they are no longer referenced:

```ts
type AiParagraphPlan
function parseMarkedText
function capChapterMarkers
function validateChapterMarkers
function parsePlan
function parseChapterPlan
function failedChapterIndex
function buildChapterRepairPrompt
```

Run:

```bash
rg -n "markedText|parseMarkedText|capChapterMarkers|validateChapterMarkers|buildChapterRepairPrompt|parseChapterPlan|failedChapterIndex|assembleLessonDraftFromPlan" lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
```

Expected: no production references to the old path. If tests still reference `assembleLessonDraftFromPlan`, delete those tests or rewrite them to use `assembleLessonDraftFromPlans`.

- [ ] **Step 2: Delete obsolete markedText tests**

Remove test cases with these names from `lib/server/ai/lesson-draft-generator.test.ts`:

```ts
code parses AI inline exercise markers into ids, exercise blocks, and shot coverage
accepts 8 AI markers without exact 7 to 3 ratio
accepts 7 AI markers as the hard minimum
rejects 5 AI markers before generation repair
renders duplicate answer markers as text after the first occurrence
caps excess AI markers at 10 exercises and renders overflow as text
generates vocabulary pattern from answer when AI leaves pattern empty
rejects AI markers with empty answers
rejects invalid AI marker counts instead of code backfilling exercises
accepts the formerly brittle 8 verb and 2 vocabulary split
does not search paragraph text for AI targets like library
keeps AI exercise distribution exactly five per paragraph with vocabulary in both shots
repairs an underfilled chapter once and returns a valid draft
```

These tests validate old implementation tactics, not the new two-stage product behavior.

- [ ] **Step 3: Run generator tests**

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit cleanup**

```bash
git add lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
git commit -m "Remove obsolete marked lesson draft generation"
```

---

### Task 7: Update Step 3 documentation

**Files:**
- Modify: `docs/frontend/course-create-lesson-draft.md`

- [ ] **Step 1: Replace generation stability section**

In `docs/frontend/course-create-lesson-draft.md`, update `## 生成稳定性策略` to describe:

```md
- AI 不再直接输出带 marker 的最终正文。
- 第一次 LLM 请求生成纯正文内容计划：每章 2 段纯英文正文、每段 1 个图片分镜语义、closing reading、人物和视觉风格。
- 第二次 LLM 请求基于纯正文生成练习计划：每章 7-10 个练习，包含 `type`、`paragraphIndex`、`answer`、`occurrenceText`，以及 `baseVerb` 或 `pattern`。
- 后端代码只做 exact string replacement，将 `occurrenceText` 稳定替换为 exercise block。
- 后端不从正文中猜词、不补题、不做语义判断。
- 若练习计划中的 `occurrenceText` 找不到、出现多次、与 answer 不匹配、数量不足或 answer 重复，接口返回可读错误，不做第三次 LLM 重试。
- 分镜覆盖范围仍由代码按 paragraph 绑定：paragraph 1 → shot 1，paragraph 2 → shot 2。
```

- [ ] **Step 2: Append implementation history note**

Append:

```md
- 2026-07-08 重构记录：Step 3 生成改为两阶段 LLM。第一阶段生成纯正文、分镜和 closing；第二阶段基于正文生成练习计划。代码只做 exact string replacement 和最终 `LessonDraft` 装配，不再让 AI 直接输出带 marker 的正文，也不再保留旧的 marker 修复/截断/去重主路径。
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/frontend/course-create-lesson-draft.md
git commit -m "Document two-stage lesson draft workflow"
```

---

### Task 8: Final verification and preview

**Files:**
- No source edits expected.

- [ ] **Step 1: Run targeted tests**

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts lib/server/repositories/lesson-drafts.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Expected: PASS. The existing Next.js ESLint plugin warning is acceptable if the build exits successfully.

- [ ] **Step 5: Restart preview**

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs -r kill
rm -rf .next
pnpm dev
```

Expected: dev server starts at `http://localhost:3000`.

- [ ] **Step 6: Commit any missed verification-only docs if needed**

If no files changed after verification, do not commit.

---

## Self-Review

- Spec coverage: This plan implements two required LLM requests, deletes the obsolete markedText production path, updates both prompts, uses exact string replacement only, preserves the public `LessonDraft` contract, validates occurrenceText mechanically, and removes automatic third LLM retry.
- Placeholder scan: No placeholders or TODO-style instructions remain. Each task includes exact file paths, test names, code snippets, commands, and expected outcomes.
- Type consistency: The plan consistently uses `AiStoryContentPlan`, `AiExercisePlan`, `assembleLessonDraftFromPlans`, `buildStoryContentPrompt`, and `buildExercisePlanPrompt`.
