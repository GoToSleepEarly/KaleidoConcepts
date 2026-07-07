# Step 3 Lesson Draft Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Step 3 lesson draft generation failures by relaxing brittle exercise-count validation, simplifying DeepSeek prompt requirements, and making hard failures return clear messages.

**Architecture:** Keep the current AI-content-plan plus code-assembly architecture. DeepSeek still authors story text, inline exercise markers, and shot semantics; backend code parses markers, assembles stable `LessonDraft` structure, performs hard structural validation, and avoids code-generated exercise backfill. Validation changes from exact `10 / 7 / 3 / per-paragraph` rules to core structural rules: 8-10 exercises per chapter, exactly 2 shots, parseable markers, valid references, and safe word-count bounds.

**Tech Stack:** Next.js 15, TypeScript, Vitest, Prisma repository pattern, DeepSeek chat completions API.

---

## File Structure

- Modify `lib/server/repositories/lesson-drafts.ts`
  - Owns persisted draft hard validation.
  - Relax exact exercise counts and add chapter-specific validation errors.
  - Keep shot coverage and reference safety strict.

- Modify `lib/server/repositories/lesson-drafts.test.ts`
  - Covers repository-level hard validation for 8-10 exercise drafts, relaxed verb/vocab ratio, and extreme word-count rejection.

- Modify `lib/server/ai/lesson-draft-generator.ts`
  - Owns prompt construction, DeepSeek request body, JSON parsing, marker parsing, plan assembly, and generation orchestration.
  - Simplify prompt count requirements.
  - Make marker parser permit empty vocabulary pattern when answer exists.
  - Make chapter marker validation require 8-10 total markers instead of exact paragraph distribution.
  - Default DeepSeek thinking to disabled; enable only with `DEEPSEEK_THINKING=enabled`.
  - Remove AI retry loop.

- Modify `lib/server/ai/lesson-draft-generator.test.ts`
  - Covers 8-marker success, 10-marker success, relaxed ratio/distribution, malformed marker failure, empty vocab pattern repair, empty answer failure, exactly 2 shots, and DeepSeek request body defaults.

- Modify `docs/frontend/course-create-lesson-draft.md`
  - Sync product rules: 2 shots fixed, 8-10 exercise markers per chapter, exact 7/3 and paragraph distribution are soft targets, DeepSeek thinking disabled by default.

No frontend component change is required unless backend messages are not displayed. `features/courses/components/lesson-draft-manager.tsx` already displays backend error messages from `POST /lesson-draft/generate`.

---

### Task 1: Relax repository validator hard rules

**Files:**
- Modify: `lib/server/repositories/lesson-drafts.ts:139-212`
- Test: `lib/server/repositories/lesson-drafts.test.ts:145-156`

- [ ] **Step 1: Add failing repository validation tests**

Add these helper functions and tests inside `describe("lesson draft validation", ...)` in `lib/server/repositories/lesson-drafts.test.ts`, after the existing stable draft test and before the existing missing exercise test.

```ts
  function removeExercises(source: LessonDraft, exerciseIds: string[]) {
    const next = structuredClone(source);
    const removeSet = new Set(exerciseIds);
    next.chapters[0].exercises = next.chapters[0].exercises.filter((exercise) => !removeSet.has(exercise.id));
    next.chapters[0].blocks = next.chapters[0].blocks.filter((block) => block.type === "text" || !removeSet.has(block.exerciseId));
    next.chapters[0].blocks = next.chapters[0].blocks.map((block, index) => ({ ...block, order: index + 1 }));
    next.chapters[0].shots[0].coveredBlockIds = next.chapters[0].blocks.slice(0, 5).map((block) => block.id);
    next.chapters[0].shots[1].coveredBlockIds = next.chapters[0].blocks.slice(5).map((block) => block.id);
    return next;
  }

  test("accepts a draft with 8 exercises in one chapter", () => {
    const eightExerciseDraft = removeExercises(draft, ["c1-e9", "c1-e10"]);

    expect(validateLessonDraft(eightExerciseDraft, storyOption)).toEqual(eightExerciseDraft);
  });

  test("accepts a draft when verb and vocabulary ratio is not 7 to 3", () => {
    const nineExerciseDraft = removeExercises(draft, ["c1-e10"]);
    nineExerciseDraft.chapters[0].exercises[7] = { id: "c1-e8", type: "verb_blank", answer: "searched", baseVerb: "search" };
    nineExerciseDraft.chapters[0].blocks[8] = {
      id: "c1-b9",
      order: 9,
      type: "exercise",
      exerciseId: "c1-e8",
      display: { kind: "verb_blank", placeholder: "________", prompt: "search" },
    };

    expect(validateLessonDraft(nineExerciseDraft, storyOption)).toEqual(nineExerciseDraft);
  });

  test("rejects a draft with fewer than 8 exercises in one chapter", () => {
    const sevenExerciseDraft = removeExercises(draft, ["c1-e8", "c1-e9", "c1-e10"]);

    expect(() => validateLessonDraft(sevenExerciseDraft, storyOption)).toThrow("第 1 章练习数量不足：需要 8-10 个，当前 7 个");
  });

  test("rejects a draft with extremely short chapter text", () => {
    const shortDraft = structuredClone(draft);
    shortDraft.chapters[0].blocks[0] = { id: "c1-b1", order: 1, type: "text", text: "Short text." };

    expect(() => validateLessonDraft(shortDraft, storyOption)).toThrow("第 1 章正文词数异常：需要 60-190 词");
  });
```

- [ ] **Step 2: Run repository validation tests and verify they fail**

Run:

```bash
pnpm test lib/server/repositories/lesson-drafts.test.ts
```

Expected: the new 8-exercise and ratio tests fail because `validateLessonDraft` still requires exactly 10 exercises, 7 verbs, and 3 vocabulary hints.

- [ ] **Step 3: Update validator constants and count logic**

In `lib/server/repositories/lesson-drafts.ts`, add constants after `LessonDraftPrerequisiteError`:

```ts
const minExercisesPerChapter = 8;
const maxExercisesPerChapter = 10;
const minChapterWords = 60;
const maxChapterWords = 190;
```

Replace `hasValidWordTarget` with:

```ts
function hasValidWordTarget(draft: LessonDraft["chapters"][number]) {
  return draft.wordTarget.min >= 100 && draft.wordTarget.min <= 120 && draft.wordTarget.max >= 120 && draft.wordTarget.max <= 150;
}

function chapterLabel(index: number) {
  return `第 ${index + 1} 章`;
}
```

Inside `validateLessonDraft`, replace this early chapter condition:

```ts
      chapter.exerciseTarget.verbBlankCount !== 7 ||
      chapter.exerciseTarget.vocabularyHintCount !== 3 ||
      chapter.exercises.length !== 10
```

with:

```ts
      chapter.exerciseTarget.verbBlankCount !== 7 ||
      chapter.exerciseTarget.vocabularyHintCount !== 3
```

Then replace the hard-count block:

```ts
    if (
      blockIds.size !== chapter.blocks.length ||
      exerciseIds.size !== chapter.exercises.length ||
      exerciseBlocks.length !== 10 ||
      verbCount !== 7 ||
      vocabCount !== 3 ||
      countWords(chapter.blocks) < 90 ||
      countWords(chapter.blocks) > 150
    ) {
      throw new LessonDraftValidationError(
        `课文草稿章节结构不完整: chapter=${chapter.id}, blocks=${chapter.blocks.length}, exerciseBlocks=${exerciseBlocks.length}, exercises=${chapter.exercises.length}, verb=${verbCount}, vocab=${vocabCount}, words=${countWords(chapter.blocks)}`,
      );
    }
```

with:

```ts
    if (blockIds.size !== chapter.blocks.length || exerciseIds.size !== chapter.exercises.length) {
      throw new LessonDraftValidationError(`课文草稿章节结构不完整：${chapterLabel(index)}存在重复的 block 或 exercise id`);
    }

    if (exerciseBlocks.length !== chapter.exercises.length) {
      throw new LessonDraftValidationError(
        `课文草稿章节结构不完整：${chapterLabel(index)}练习 block 数量 ${exerciseBlocks.length} 与 exercises 数量 ${chapter.exercises.length} 不一致`,
      );
    }

    if (exerciseBlocks.length < minExercisesPerChapter) {
      throw new LessonDraftValidationError(`${chapterLabel(index)}练习数量不足：需要 8-10 个，当前 ${exerciseBlocks.length} 个`);
    }

    if (exerciseBlocks.length > maxExercisesPerChapter) {
      throw new LessonDraftValidationError(`${chapterLabel(index)}练习数量过多：需要 8-10 个，当前 ${exerciseBlocks.length} 个`);
    }

    const wordCount = countWords(chapter.blocks);
    if (wordCount < minChapterWords || wordCount > maxChapterWords) {
      throw new LessonDraftValidationError(`${chapterLabel(index)}正文词数异常：需要 60-190 词，当前 ${wordCount} 词`);
    }
```

Keep `verbCount` and `vocabCount` declarations only if they are still used. If TypeScript reports unused variables, delete these lines:

```ts
    const verbCount = chapter.exercises.filter((exercise) => exercise.type === "verb_blank").length;
    const vocabCount = chapter.exercises.filter((exercise) => exercise.type === "vocabulary_hint").length;
```

- [ ] **Step 4: Run repository tests and verify they pass**

Run:

```bash
pnpm test lib/server/repositories/lesson-drafts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit validator changes**

```bash
git add lib/server/repositories/lesson-drafts.ts lib/server/repositories/lesson-drafts.test.ts
git commit -m "Relax lesson draft validation rules"
```

---

### Task 2: Relax AI marker assembly rules

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.ts:334-453,513-635`
- Test: `lib/server/ai/lesson-draft-generator.test.ts:70-387`

- [ ] **Step 1: Add failing AI assembly tests**

In `lib/server/ai/lesson-draft-generator.test.ts`, add these tests inside `describe("lesson draft AI plan assembly", ...)`, after the existing success test.

```ts
  test("accepts 8 AI markers without exact 7 to 3 ratio", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, Summer touched the page and found a hidden trail. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The gate became a useful story word. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises).toHaveLength(8);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "verb_blank")).toHaveLength(7);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "vocabulary_hint")).toHaveLength(1);
  });

  test("rejects AI plans with fewer than 8 markers", () => {
    expect(() =>
      assembleLessonDraftFromPlan(
        {
          title: "The Forest Gate",
          visualStyle: {
            artStyle: "warm watercolor picture book",
            colorPalette: "soft greens and gold light",
            consistencyPrompt: "Use a consistent watercolor picture-book style.",
          },
          characters: [],
          chapters: [
            {
              title: "The Gate Opens",
              paragraphs: [
                {
                  markedText:
                    "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "quiet forest gate",
                    action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                    mood: "curious and safe",
                    scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                    composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                    continuityNotes: "Keep character consistency.",
                  },
                },
                {
                  markedText:
                    "Inside the forest, Ms. Lin [verb:help|helped] Summer read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and shared her idea.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "tiny forest bridge",
                    action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                    mood: "hopeful and focused",
                    scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                    composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                    continuityNotes: "Use the same forest light.",
                  },
                },
              ],
            },
          ],
          closingReading: {
            title: "After the Forest Gate",
            text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The gate became a useful story word. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
          },
        },
        context,
      ),
    ).toThrow("第 1 章练习数量不足：需要 8-10 个，当前 7 个");
  });

  test("generates vocabulary pattern from answer when AI leaves pattern empty", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    const gate = draft.chapters[0].exercises.find((exercise) => exercise.type === "vocabulary_hint" && exercise.answer === "gate");
    expect(gate).toMatchObject({ pattern: "g _ _ e", letterCount: 4 });
  });

  test("rejects AI markers with empty answers", () => {
    expect(() =>
      assembleLessonDraftFromPlan(
        {
          title: "The Forest Gate",
          visualStyle: {
            artStyle: "warm watercolor picture book",
            colorPalette: "soft greens and gold light",
            consistencyPrompt: "Use a consistent watercolor picture-book style.",
          },
          characters: [],
          chapters: [
            {
              title: "The Gate Opens",
              paragraphs: [
                {
                  markedText:
                    "Yesterday morning, Ms. Lin and Summer [verb:walk|] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "quiet forest gate",
                    action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                    mood: "curious and safe",
                    scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                    composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                    continuityNotes: "Keep character consistency.",
                  },
                },
                {
                  markedText:
                    "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "tiny forest bridge",
                    action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                    mood: "hopeful and focused",
                    scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                    composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                    continuityNotes: "Use the same forest light.",
                  },
                },
              ],
            },
          ],
          closingReading: {
            title: "After the Forest Gate",
            text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
          },
        },
        context,
      ),
    ).toThrow("AI marked exercise is incomplete");
  });
```

- [ ] **Step 2: Run AI generator tests and verify they fail**

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts
```

Expected: new 8-marker and empty-pattern tests fail because `validateChapterMarkers` requires exact counts and `parseMarkedText` does not accept `[vocab:|gate]`.

- [ ] **Step 3: Add marker count constants**

In `lib/server/ai/lesson-draft-generator.ts`, add these constants after `chapterWordTarget`:

```ts
const minExercisesPerChapter = 8;
const maxExercisesPerChapter = 10;
```

- [ ] **Step 4: Allow empty vocabulary marker pattern with non-empty answer**

Replace the marker regex in `parseMarkedText`:

```ts
  const markerPattern = /\[(verb|vocab):([^\]|]+)\|([^\]]+)\]/g;
```

with:

```ts
  const markerPattern = /\[(verb|vocab):([^\]|]*)\|([^\]]*)\]/g;
```

Replace the marker validation block:

```ts
    if (!meta || !answer) {
      throw new LessonDraftValidationError("AI marked exercise is incomplete");
    }

    if (markerKind === "verb") {
      items.push({ type: "verb_blank", baseVerb: meta, answer });
    } else {
      items.push({ type: "vocabulary_hint", pattern: meta, answer, letterCount: vocabularyLetterCount(answer) });
    }
```

with:

```ts
    if (!answer || (markerKind === "verb" && !meta)) {
      throw new LessonDraftValidationError("AI marked exercise is incomplete");
    }

    if (markerKind === "verb") {
      items.push({ type: "verb_blank", baseVerb: meta, answer });
    } else {
      const pattern = meta || vocabularyPattern(answer);
      items.push({ type: "vocabulary_hint", pattern, answer, letterCount: vocabularyLetterCount(answer) });
    }
```

- [ ] **Step 5: Relax chapter marker validation**

Replace `validateChapterMarkers` with:

```ts
function validateChapterMarkers(chapterTitle: string, parsedParagraphs: ParsedMarker[][], chapterIndex = 0) {
  const paragraphExerciseCounts = parsedParagraphs.map((items) => items.filter((item) => item.type !== "text").length);
  const exercises = parsedParagraphs.flatMap((items) => items.filter((item) => item.type !== "text"));
  const answers = exercises.map((item) => item.answer.trim().toLowerCase());
  const chapterLabel = `第 ${chapterIndex + 1} 章`;

  if (exercises.length < minExercisesPerChapter) {
    throw new LessonDraftValidationError(`${chapterLabel}练习数量不足：需要 8-10 个，当前 ${exercises.length} 个`);
  }

  if (exercises.length > maxExercisesPerChapter) {
    throw new LessonDraftValidationError(`${chapterLabel}练习数量过多：需要 8-10 个，当前 ${exercises.length} 个`);
  }

  if (new Set(answers).size !== answers.length) {
    throw new LessonDraftValidationError(`AI marked exercises invalid: chapter=${chapterTitle}, duplicate answers found`);
  }

  if (paragraphExerciseCounts.some((count) => count < 1)) {
    throw new LessonDraftValidationError(`AI marked exercises invalid: chapter=${chapterTitle}, each paragraph needs at least one marker`);
  }
}
```

Then update the call in `assembleLessonDraftFromPlan` from:

```ts
    validateChapterMarkers(chapterPlan?.title ?? outlineChapter.title, parsedParagraphs);
```

to:

```ts
    validateChapterMarkers(chapterPlan?.title ?? outlineChapter.title, parsedParagraphs, chapterIndex);
```

- [ ] **Step 6: Run AI generator tests and verify they pass or expose only expected old-test failures**

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts
```

Expected: new tests pass. Old tests that explicitly expect the common 8/2 split to be rejected now fail because that behavior is no longer desired.

- [ ] **Step 7: Update obsolete AI assembly tests**

In `lib/server/ai/lesson-draft-generator.test.ts`, delete or rewrite the old test named:

```ts
test("rejects the common 8 verb and 2 vocabulary split with paragraph-level details", () => {
```

Replace it with this passing test:

```ts
  test("accepts the formerly brittle 8 verb and 2 vocabulary split", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Map Clue",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer [verb:touch|touched] the page and found a hidden trail. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "verb_blank")).toHaveLength(8);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "vocabulary_hint")).toHaveLength(2);
  });
```

- [ ] **Step 8: Commit AI assembly changes**

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts
git add lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
git commit -m "Relax lesson draft AI marker assembly"
```

Expected: tests pass before commit.

---

### Task 3: Simplify DeepSeek prompt and request policy

**Files:**
- Modify: `lib/server/ai/lesson-draft-generator.ts:64-130,672-695,703-737`
- Test: `lib/server/ai/lesson-draft-generator.test.ts:389-424`

- [ ] **Step 1: Update failing DeepSeek request tests**

In `lib/server/ai/lesson-draft-generator.test.ts`, replace the two tests in `describe("lesson draft DeepSeek request", ...)` with:

```ts
  test("uses non-thinking mode by default for faster normal generation", () => {
    const original = process.env.DEEPSEEK_THINKING;
    delete process.env.DEEPSEEK_THINKING;

    try {
      const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate a lesson draft." }]);

      expect(body).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 32000,
      });
      expect(body).not.toHaveProperty("reasoning_effort");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_THINKING;
      } else {
        process.env.DEEPSEEK_THINKING = original;
      }
    }
  });

  test("enables thinking mode only through environment configuration", () => {
    const original = process.env.DEEPSEEK_THINKING;
    process.env.DEEPSEEK_THINKING = "enabled";

    try {
      const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate a lesson draft." }]);

      expect(body).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        response_format: { type: "json_object" },
        max_tokens: 64000,
      });
      expect(body).not.toHaveProperty("temperature");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_THINKING;
      } else {
        process.env.DEEPSEEK_THINKING = original;
      }
    }
  });
```

- [ ] **Step 2: Run request tests and verify they fail**

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts -t "lesson draft DeepSeek request"
```

Expected: default thinking test fails because current default is enabled with `reasoning_effort=max`.

- [ ] **Step 3: Update DeepSeek request body policy**

In `buildDeepSeekRequestBody`, replace:

```ts
  const thinkingMode = process.env.DEEPSEEK_THINKING === "disabled" ? "disabled" : "enabled";
```

with:

```ts
  const thinkingMode = process.env.DEEPSEEK_THINKING === "enabled" ? "enabled" : "disabled";
```

Replace the thinking-enabled return block:

```ts
  return {
    model,
    messages,
    max_tokens: 64000,
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: "max",
  };
```

with:

```ts
  return {
    model,
    messages,
    max_tokens: 64000,
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: "high",
  };
```

- [ ] **Step 4: Simplify prompt count constraints**

In `buildPrompt`, replace the exact-count requirement lines:

```ts
    "- markedText must contain 55-70 rendered English words after markers are replaced by their answers.",
    "- Use exactly this marker format for exercises: [verb:baseVerb|answer] and [vocab:pattern|answer].",
    "- Example verb marker: [verb:walk|walked]. The answer must be the exact word that belongs in the sentence.",
    "- Example vocabulary marker: [vocab:t _ _ _ l|trail]. The pattern should reveal useful letters, usually first and last letters.",
    "- Do not put spaces around the marker pipes. Do not nest markers. Do not use Markdown.",
    "- Each chapter must contain exactly 10 markers across its two markedText paragraphs: exactly 7 verb markers and exactly 3 vocab markers.",
    "- Paragraph 1 must contain exactly 5 markers: exactly 4 verb markers and exactly 1 vocab marker.",
    "- Paragraph 2 must contain exactly 5 markers: exactly 3 verb markers and exactly 2 vocab markers.",
    "- Do not use a 4 verb + 1 vocab split in both paragraphs; that creates 8 verb markers and 2 vocab markers, which is invalid.",
    "- Do not repeat the same exercise answer inside one chapter.",
```

with:

```ts
    "- markedText should contain about 55-80 rendered English words after markers are replaced by their answers.",
    "- Use exactly this marker format for exercises: [verb:baseVerb|answer] and [vocab:pattern|answer].",
    "- Example verb marker: [verb:walk|walked]. The answer must be the exact word that belongs in the sentence.",
    "- Example vocabulary marker: [vocab:t _ _ _ l|trail]. The pattern should reveal useful letters, usually first and last letters.",
    "- Do not put spaces around the marker pipes. Do not nest markers. Do not use Markdown.",
    "- Each chapter should contain 8-10 markers total across its two markedText paragraphs.",
    "- Include both verb blank and vocabulary hint markers when natural, but do not force an exact ratio.",
    "- Spread markers across both paragraphs so each paragraph has at least one exercise marker.",
    "- Avoid repeating the same exercise answer inside one chapter.",
```

- [ ] **Step 5: Remove AI retry loop**

Replace `generateLessonDraft` attempt loop:

```ts
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = parsePlan(parseJsonObject(await callDeepSeek(messages)));
      return validateLessonDraft(assembleLessonDraftFromPlan(parsed, context), context.storyOption);
    } catch (error) {
      if (attempt === 0) {
        messages.push({
          role: "user",
          content:
            error instanceof LessonDraftValidationError
              ? `The previous content plan failed validation: ${error.message}. Regenerate the full content plan. Each chapter needs two markedText paragraphs of 55-70 rendered English words. Paragraph 1 must have exactly 5 inline markers: 4 [verb:baseVerb|answer] markers and 1 [vocab:pattern|answer] marker. Paragraph 2 must have exactly 5 inline markers: 3 [verb:baseVerb|answer] markers and 2 [vocab:pattern|answer] markers. Whole chapter total must be exactly 7 verb markers and 3 vocab markers. Do not use 4 verb + 1 vocab in both paragraphs. Return strict minified JSON only.`
              : `The previous response could not be parsed as a valid content plan: ${error instanceof Error ? error.message : "unknown error"}. Regenerate strict minified JSON only using the required content-plan shape.`,
        });
        continue;
      }

      if (attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error("课文草稿生成失败");
```

with:

```ts
  const parsed = parsePlan(parseJsonObject(await callDeepSeek(messages)));
  return validateLessonDraft(assembleLessonDraftFromPlan(parsed, context), context.storyOption);
```

This keeps failure fast and clear. The route already maps `LessonDraftValidationError` to HTTP 400.

- [ ] **Step 6: Run AI generator tests**

Run:

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit prompt and request changes**

```bash
git add lib/server/ai/lesson-draft-generator.ts lib/server/ai/lesson-draft-generator.test.ts
git commit -m "Simplify lesson draft DeepSeek generation"
```

---

### Task 4: Sync product documentation

**Files:**
- Modify: `docs/frontend/course-create-lesson-draft.md:24-41,246-268,279-284`

- [ ] **Step 1: Update product output requirements**

In `docs/frontend/course-create-lesson-draft.md`, replace the list under `## 本期产物` that currently says every chapter has 10 exercises with 7 verb and 3 vocabulary hints:

```md
- 每章 10 个练习点
  - 7 个 `verb_blank`
  - 3 个 `vocabulary_hint`
```

with:

```md
- 每章目标 8-10 个练习点
  - 以 `verb_blank` 为主
  - 搭配 `vocabulary_hint`
  - 不硬性要求固定 7/3 比例
```

- [ ] **Step 2: Update validation rules section**

In the `## 校验规则` section, replace:

```md
- 每章必须有 10 个 exercises
- 每章必须有 7 个 `verb_blank`
- 每章必须有 3 个 `vocabulary_hint`
- 每章必须有 10 个 exercise blocks
```

with:

```md
- 每章必须有 8-10 个 exercises
- 每章必须有相同数量的 exercise blocks
- 不硬性校验 `verb_blank` / `vocabulary_hint` 的固定比例
```

- [ ] **Step 3: Update stability strategy section**

In `## 生成稳定性策略`, replace lines describing exact paragraph counts:

```md
  - 固定每章 7 个 `verb_blank` 和 3 个 `vocabulary_hint`
  - 校验第 1 段恰好 4 个动词题 + 1 个词汇题
  - 校验第 2 段恰好 3 个动词题 + 2 个词汇题，避免全章变成 8 个动词题 + 2 个词汇题
```

with:

```md
  - 每章目标 8-10 个练习 marker
  - 不再硬性校验每段练习数量或 `verb_blank` / `vocabulary_hint` 精确比例
  - 校验每章至少 8 个、最多 10 个可解析练习 marker
```

Also replace the retry sentence:

```md
- 若 AI 标记数量、段落类型分布或重复答案不合法，第一次请求会携带具体错误要求 AI 重生成；最终仍失败则接口返回可读错误，不保存不合格草稿。
```

with:

```md
- 若 AI 生成结果未满足核心硬校验，接口返回可读错误，不保存不合格草稿；本轮不做复杂自动重试。
```

- [ ] **Step 4: Add 2026-07-07 update note**

Append this bullet at the end of the implementation history section:

```md
- 2026-07-07 稳定性重设计记录：Step 3 不再把每章 10 题、7/3 比例、每段 5 题作为硬校验；每章固定 2 个分镜，练习数量放宽为 8-10 个，练习仍必须由 AI 在正文中以内联 marker 生成，代码不补题。DeepSeek 默认关闭 thinking 以降低常规生成耗时，可通过 `DEEPSEEK_THINKING=enabled` 开启深度模式。
```

- [ ] **Step 5: Commit docs update**

```bash
git add docs/frontend/course-create-lesson-draft.md
git commit -m "Update Step 3 lesson draft stability docs"
```

---

### Task 5: Run full verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run targeted tests**

```bash
pnpm test lib/server/ai/lesson-draft-generator.test.ts lib/server/repositories/lesson-drafts.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: PASS with zero warnings.

- [ ] **Step 4: Run production build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Inspect working tree**

```bash
git status --short
```

Expected: only intentionally untracked local files remain, or clean if everything was committed. Do not commit `.claude/` unless the user explicitly asks.

---

## Self-Review

- Spec coverage: The plan implements relaxed 8-10 exercise validation, exact 2-shot validation, marker parser behavior, DeepSeek thinking default change, prompt simplification, no AI retry loop, specific errors, and documentation updates.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: Function and property names match the current code: `validateLessonDraft`, `assembleLessonDraftFromPlan`, `buildDeepSeekRequestBody`, `LessonDraftValidationError`, `markedText`, `shot`, `exerciseTarget`, and `closingReading`.
