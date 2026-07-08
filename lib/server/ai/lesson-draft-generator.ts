import type {
  CourseBasicDetail,
  LessonDraft,
  LessonExercise,
  LessonShot,
  LessonVisualCharacter,
  LessonVisualStyle,
  PersonProfile,
  StoryOption,
} from "@/lib/contracts/api";
import { LessonDraftValidationError, validateLessonDraft } from "@/lib/server/repositories/lesson-drafts";

type LessonDraftGenerationContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
  storyOption: StoryOption;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type DeepSeekThinkingMode = "enabled" | "disabled";

type DeepSeekRequestBody = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: DeepSeekThinkingMode };
  reasoning_effort?: "high" | "max";
  temperature?: number;
};

const chapterWordTarget = { min: 110, max: 130 };
const minExercisesPerChapter = 7;
const maxExercisesPerChapter = 10;

type AiShotPlan = Omit<LessonShot, "id" | "order" | "imageSlotId" | "coveredBlockIds">;

type AiStoryParagraphPlan = {
  text?: string;
  sentences?: string[];
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
      sentenceId?: string;
      answer: string;
      occurrenceText: string;
      occurrenceIndex?: number;
      sentence?: string;
      baseVerb: string;
    }
  | {
      type: "vocabulary_hint";
      paragraphIndex: 1 | 2;
      sentenceId?: string;
      answer: string;
      occurrenceText: string;
      occurrenceIndex?: number;
      sentence?: string;
      pattern: string;
    };

function personName(person: PersonProfile) {
  return person.englishName || person.chineseName || person.name;
}

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
    context.storyOption.chapters
      .map((chapter, index) => `  ${index + 1}. ${chapter.title}\n     story summary: ${chapter.summary}\n     grammar hook: ${chapter.knowledgeHook}`)
      .join("\n"),
    "",
    "Characters:",
    `- teacher: id=${context.teacher.id}; name=${personName(context.teacher)}; appearance=${context.teacher.appearance ?? "not provided"}; notes=${context.teacher.notes ?? "none"}`,
    context.students
      .map(
        (student) =>
          `- student: id=${student.id}; name=${personName(student)}; age=${student.age ?? "unknown"}; appearance=${student.appearance ?? "not provided"}; interests=${student.interests.join(", ") || "not provided"}; learning goal=${student.learningGoal ?? "not provided"}; notes=${student.notes ?? "none"}`,
      )
      .join("\n"),
    "",
    "Output requirements:",
    "- Return strict minified JSON only. No Markdown. No explanation. No comments. No extra keys.",
    "- Return a story content plan, not the final database LessonDraft.",
    "- Do not include exercise markers. Do not include [verb:...] or [vocab:...].",
    "- Each chapter must have exactly two paragraphs.",
    "- Each paragraph.sentences must be an array of pure English story sentences, about 3-5 sentences per paragraph.",
    "- The chapter story must visibly use the grammar targets and chapter grammar hook in natural story actions.",
    "- Each paragraph has its own image shot semantics.",
    "- shot.characterIds must reference global character ids only.",
    "- closingReading.text must be English only, 80-120 words, no blanks, no exercises, no image prompt, and no final The End sentence.",
    "",
    "Required JSON shape:",
    `{"title":"string","visualStyle":{"artStyle":"string","colorPalette":"string","aspectRatio":"4:3","consistencyPrompt":"string"},"characters":[{"id":"${context.teacher.id}","name":"string","role":"teacher","appearance":"string","outfit":"string","consistencyPrompt":"string"}],"chapters":[{"title":"string","paragraphs":[{"sentences":["pure story sentence with no exercise markers","another pure story sentence"],"shot":{"characterIds":["${context.teacher.id}"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}},{"sentences":["pure story sentence with no exercise markers","another pure story sentence"],"shot":{"characterIds":["${context.teacher.id}"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}}]}],"closingReading":{"title":"string","text":"80-120 English words"}}`,
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
    "- sentenceId must reference one of the provided sentence ids, such as c1p1s2.",
    "- occurrenceText must be copied exactly from that sentence.",
    "- occurrenceIndex selects which occurrence inside the sentence to replace; use 1 for the first occurrence, 2 for the second, and so on.",
    "- Do not copy full sentences back into the exercise plan.",
    "- answer must be contained inside occurrenceText.",
    "- Code will do exact string replacement only, so do not rely on semantic matching.",
    "",
    "Story text by chapter:",
    storyPlan.chapters
      .map((chapter, chapterIndex) => {
        const outline = context.storyOption.chapters[chapterIndex];
        return [
          `Chapter ${chapterIndex + 1}: ${chapter.title}`,
          `Knowledge hook: ${outline?.knowledgeHook ?? "not provided"}`,
          ...chapter.paragraphs.flatMap((paragraph, paragraphIndex) =>
            paragraphSentences(paragraph, "").map((sentence, sentenceIndex) => `${sentenceId(chapterIndex, paragraphIndex + 1, sentenceIndex)}: ${sentence}`),
          ),
        ].join("\n");
      })
      .join("\n\n"),
    "",
    "Required JSON shape:",
    '{"chapters":[{"chapterIndex":1,"exercises":[{"type":"verb_blank","paragraphIndex":1,"sentenceId":"c1p1s1","answer":"walked","occurrenceText":"walked","occurrenceIndex":1,"baseVerb":"walk"},{"type":"vocabulary_hint","paragraphIndex":1,"sentenceId":"c1p1s2","answer":"gate","occurrenceText":"gate","occurrenceIndex":1,"pattern":"g _ _ e"}]}]}',
  ].join("\n");
}

function mockLessonDraft(context: LessonDraftGenerationContext): LessonDraft {
  const characters = [
    {
      id: context.teacher.id,
      name: personName(context.teacher),
      role: "teacher" as const,
      appearance: context.teacher.appearance ?? "kind English teacher",
      outfit: "blue cardigan, white shirt, simple classroom-friendly outfit",
      consistencyPrompt: `${personName(context.teacher)} always has the same appearance and blue cardigan.`,
    },
    ...context.students.map((student) => ({
      id: student.id,
      name: personName(student),
      role: "student" as const,
      appearance: student.appearance ?? "young student",
      outfit: student.gender === "male" ? "green hoodie and dark pants" : "yellow hoodie and jeans",
      consistencyPrompt: `${personName(student)} always keeps the same hairstyle, outfit, and face shape.`,
    })),
  ];

  return {
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: context.storyOption.id,
    generationMode: "ai",
    title: context.storyOption.title,
    language: "en",
    visualStyle: {
      artStyle: "warm children's storybook watercolor",
      colorPalette: "soft blues, greens, and warm golden light",
      aspectRatio: "4:3",
      consistencyPrompt: "Use one consistent children's watercolor picture-book style across all images.",
    },
    characters,
    closingReading: {
      title: `After ${context.storyOption.title}`,
      text: "After the adventure, the teacher and students remembered how they moved through the story world together. They noticed clues, made choices, and used English to describe what happened. Each chapter helped them practice the target grammar inside real actions, not separate drills. The students became more confident because they solved problems as a team and listened to the teacher's guidance. When the journey ended, they could retell the important moments, name the useful words, and explain how small decisions changed the story step by step.",
      vocabularyTerms: ["clue", "path", "brave"],
    },
    chapters: context.storyOption.chapters.map((chapter, chapterIndex) => {
      const prefix = `chapter-${chapterIndex + 1}`;
      const textParts = [
        "Yesterday afternoon, the teacher and students ",
        ` into ${context.course.theme} and noticed the first bright signal. The teacher `,
        " calm questions while the students watched the road carefully. Everyone ",
        " close because the strange air made each sound important. Summer ",
        " a small mark near the gate, and Ethan ",
        " the group toward a safer path. The students ",
        " their ideas in English, and the teacher ",
        " them to describe what happened before choosing the next step. A hidden ",
        " glowed under a stone, so the group followed the narrow ",
        ". The moment felt ",
        ", but the teacher and students stayed together and finished the chapter challenge.",
      ];
      const blockItems: LessonDraft["chapters"][number]["blocks"] = [];
      const verbPrompts = ["step", "ask", "stay", "notice", "guide", "share", "help"];
      const vocabularyHints = [
        { pattern: "c _ _ e", letterCount: 4 },
        { pattern: "p _ _ h", letterCount: 4 },
        { pattern: "b _ _ _ e", letterCount: 5 },
      ];

      textParts.forEach((part, index) => {
        blockItems.push({ id: `${prefix}-block-${blockItems.length + 1}`, order: blockItems.length + 1, type: "text" as const, text: part });

        if (index < 7) {
          blockItems.push({
            id: `${prefix}-block-${blockItems.length + 1}`,
            order: blockItems.length + 1,
            type: "exercise" as const,
            exerciseId: `${prefix}-exercise-${index + 1}`,
            display: { kind: "verb_blank" as const, placeholder: "________" as const, prompt: verbPrompts[index] },
          });
        } else if (index < 10) {
          const hint = vocabularyHints[index - 7];
          blockItems.push({
            id: `${prefix}-block-${blockItems.length + 1}`,
            order: blockItems.length + 1,
            type: "exercise" as const,
            exerciseId: `${prefix}-exercise-${index + 1}`,
            display: { kind: "vocabulary_hint" as const, placeholder: "________" as const, pattern: hint.pattern, letterCount: hint.letterCount },
          });
        }
      });
      const blocks = blockItems;

      return {
        id: prefix,
        sourceOutlineChapterIndex: chapterIndex + 1,
        title: chapter.title,
        wordTarget: { min: chapterWordTarget.min, max: chapterWordTarget.max },
        exerciseTarget: { verbBlankCount: 7 as const, vocabularyHintCount: 3 as const },
        blocks,
        exercises: [
          { id: `${prefix}-exercise-1`, type: "verb_blank" as const, answer: "stepped", baseVerb: "step" },
          { id: `${prefix}-exercise-2`, type: "verb_blank" as const, answer: "asked", baseVerb: "ask" },
          { id: `${prefix}-exercise-3`, type: "verb_blank" as const, answer: "stayed", baseVerb: "stay" },
          { id: `${prefix}-exercise-4`, type: "verb_blank" as const, answer: "noticed", baseVerb: "notice" },
          { id: `${prefix}-exercise-5`, type: "verb_blank" as const, answer: "guided", baseVerb: "guide" },
          { id: `${prefix}-exercise-6`, type: "verb_blank" as const, answer: "shared", baseVerb: "share" },
          { id: `${prefix}-exercise-7`, type: "verb_blank" as const, answer: "helped", baseVerb: "help" },
          { id: `${prefix}-exercise-8`, type: "vocabulary_hint" as const, answer: "clue", pattern: "c _ _ e", letterCount: 4 },
          { id: `${prefix}-exercise-9`, type: "vocabulary_hint" as const, answer: "path", pattern: "p _ _ h", letterCount: 4 },
          { id: `${prefix}-exercise-10`, type: "vocabulary_hint" as const, answer: "brave", pattern: "b _ _ _ e", letterCount: 5 },
        ],
        shots: [
          {
            id: `${prefix}-shot-1`,
            order: 1 as const,
            imageSlotId: `${prefix}-image-1`,
            coveredBlockIds: blocks.slice(0, 6).map((block) => block.id),
            characterIds: characters.map((character) => character.id),
            location: context.course.theme,
            action: `The group begins: ${chapter.summary}`,
            mood: "curious and warm",
            scenePrompt: `A children's storybook scene in ${context.course.theme}, showing the teacher guiding the students as the chapter begins.`,
            composition: "Wide 4:3 storybook illustration, characters grouped clearly in the foreground.",
            continuityNotes: "Use the same visualStyle and global character appearances.",
          },
          {
            id: `${prefix}-shot-2`,
            order: 2 as const,
            imageSlotId: `${prefix}-image-2`,
            coveredBlockIds: blocks.slice(6).map((block) => block.id),
            characterIds: characters.map((character) => character.id),
            location: context.course.theme,
            action: `The group resolves the chapter challenge: ${chapter.summary}`,
            mood: "hopeful and adventurous",
            scenePrompt: `A children's storybook scene in ${context.course.theme}, showing the teacher and students solving the chapter challenge together.`,
            composition: "Medium 4:3 storybook illustration with expressive faces and clear action.",
            continuityNotes: "Use the same visualStyle and global character appearances.",
          },
        ],
      };
    }),
  };
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonText = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    return JSON.parse(jsonText.replace(/,\s*([}\]])/g, "$1")) as unknown;
  }
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stableCharacterPlans(plan: { characters?: LessonVisualCharacter[] }, context: LessonDraftGenerationContext): LessonVisualCharacter[] {
  const sourceCharacters = [
    {
      id: context.teacher.id,
      role: "teacher" as const,
      name: personName(context.teacher),
      appearance: context.teacher.appearance ?? "kind English teacher",
      outfit: "simple classroom-friendly outfit",
      consistencyPrompt: `${personName(context.teacher)} keeps the same appearance in every image.`,
    },
    ...context.students.map((student) => ({
      id: student.id,
      role: "student" as const,
      name: personName(student),
      appearance: student.appearance ?? "young student",
      outfit: student.gender === "male" ? "comfortable hoodie and pants" : "comfortable colorful outfit",
      consistencyPrompt: `${personName(student)} keeps the same hairstyle, face, and outfit in every image.`,
    })),
  ];

  const plannedById = new Map((Array.isArray(plan.characters) ? plan.characters : []).map((character) => [character.id, character]));

  return sourceCharacters.map((fallback) => {
    const planned = plannedById.get(fallback.id);

    return {
      id: fallback.id,
      role: fallback.role,
      name: nonEmptyString(planned?.name, fallback.name),
      appearance: nonEmptyString(planned?.appearance, fallback.appearance),
      outfit: nonEmptyString(planned?.outfit, fallback.outfit),
      consistencyPrompt: nonEmptyString(planned?.consistencyPrompt, fallback.consistencyPrompt),
    };
  });
}

function vocabularyPattern(answer: string) {
  const clean = answer.trim();

  if (clean.length <= 2) {
    return clean;
  }

  return `${clean[0]} ${Array.from({ length: Math.max(1, clean.length - 2) }, () => "_").join(" ")} ${clean[clean.length - 1]}`;
}

function vocabularyLetterCount(answer: string) {
  return answer.replace(/[^A-Za-z]/g, "").length || answer.trim().length;
}

function sanitizeShotPlan(
  shot: AiShotPlan | undefined,
  context: LessonDraftGenerationContext,
  characters: LessonVisualCharacter[],
  chapterTitle: string,
  paragraphText: string,
) {
  const validCharacterIds = new Set(characters.map((character) => character.id));
  const plannedCharacterIds = Array.isArray(shot?.characterIds) ? shot.characterIds.filter((id) => validCharacterIds.has(id)) : [];
  const fallbackCharacterIds = characters.map((character) => character.id);

  return {
    characterIds: plannedCharacterIds.length ? plannedCharacterIds : fallbackCharacterIds,
    location: nonEmptyString(shot?.location, context.course.theme),
    action: nonEmptyString(shot?.action, `Characters act out ${chapterTitle}.`),
    mood: nonEmptyString(shot?.mood, "curious and warm"),
    scenePrompt: nonEmptyString(shot?.scenePrompt, `A children's picture-book scene for ${chapterTitle}: ${paragraphText.slice(0, 180)}`),
    composition: nonEmptyString(shot?.composition, "4:3 picture-book composition with clear characters and story action."),
    continuityNotes: nonEmptyString(shot?.continuityNotes, "Use the global visual style and character consistency prompts."),
  };
}

function characterConsistencyText(characters: LessonVisualCharacter[], characterIds: string[]) {
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return characterIds
    .map((id) => characterById.get(id))
    .filter((character): character is LessonVisualCharacter => Boolean(character))
    .map((character) => `${character.name}: ${character.appearance}; outfit: ${character.outfit}.`)
    .join(" ");
}

function withCharacterConsistency(shot: AiShotPlan, characters: LessonVisualCharacter[]) {
  const consistency = characterConsistencyText(characters, shot.characterIds);

  if (!consistency) {
    return shot;
  }

  return {
    ...shot,
    scenePrompt: `${shot.scenePrompt} Character consistency: ${consistency}`,
    continuityNotes: `${shot.continuityNotes} Keep character consistency: ${consistency}`,
  };
}

function stripTheEnd(text: string) {
  return text.replace(/\s*(?:the\s+end|the\s+end\.)\s*$/i, "").trim();
}

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

function assertNoLegacyMarkers(text: string, chapterIndex: number) {
  if (/\[(?:verb|vocab):/.test(text)) {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章正文包含旧 marker，请重新生成纯正文`);
  }
}

function sentenceId(chapterIndex: number, paragraphIndex: number, sentenceIndex: number) {
  return `c${chapterIndex + 1}p${paragraphIndex}s${sentenceIndex + 1}`;
}

function paragraphSentences(paragraph: AiStoryParagraphPlan, fallback: string) {
  if (Array.isArray(paragraph.sentences) && paragraph.sentences.length) {
    return paragraph.sentences.map((sentence) => sentence.trim()).filter(Boolean);
  }

  return [nonEmptyString(paragraph.text, fallback)];
}

function findNthOccurrence(text: string, searchText: string, occurrenceIndex: number) {
  let cursor = 0;
  let found = -1;

  for (let count = 1; count <= occurrenceIndex; count += 1) {
    found = text.indexOf(searchText, cursor);
    if (found < 0) {
      return -1;
    }
    cursor = found + searchText.length;
  }

  return found;
}

function findUniqueText(text: string, searchText: string, missingMessage: string, duplicateMessage: string) {
  const first = text.indexOf(searchText);
  if (first < 0) {
    throw new LessonDraftValidationError(missingMessage);
  }

  const second = text.indexOf(searchText, first + searchText.length);
  if (second >= 0) {
    throw new LessonDraftValidationError(duplicateMessage);
  }

  return first;
}

function findExerciseOccurrence(text: string, sentences: string[], exercise: AiExercisePlanItem, chapterIndex: number, paragraphIndex: number) {
  if (exercise.sentenceId) {
    const expectedPrefix = `c${chapterIndex + 1}p${paragraphIndex}s`;
    if (!exercise.sentenceId.startsWith(expectedPrefix)) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：sentenceId "${exercise.sentenceId}" 不属于第 ${paragraphIndex} 段`);
    }

    const sentenceNumber = Number(exercise.sentenceId.slice(expectedPrefix.length));
    const sentence = sentences[sentenceNumber - 1];
    if (!sentence) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：sentenceId "${exercise.sentenceId}" 不存在`);
    }

    const occurrenceIndex = exercise.occurrenceIndex ?? 1;
    if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 1) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：occurrenceIndex 必须是正整数`);
    }

    const occurrenceInSentence = findNthOccurrence(sentence, exercise.occurrenceText, occurrenceIndex);
    if (occurrenceInSentence < 0) {
      throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${exercise.occurrenceText}" 在 sentenceId "${exercise.sentenceId}" 中不存在第 ${occurrenceIndex} 次`);
    }

    const sentenceStart = findUniqueText(
      text,
      sentence,
      `第 ${chapterIndex + 1} 章练习计划无效：sentenceId "${exercise.sentenceId}" 对应句子在第 ${paragraphIndex} 段中不存在`,
      `第 ${chapterIndex + 1} 章练习计划无效：sentenceId "${exercise.sentenceId}" 对应句子在第 ${paragraphIndex} 段中出现多次`,
    );

    return sentenceStart + occurrenceInSentence;
  }

  if (!exercise.sentence) {
    return findUniqueText(
      text,
      exercise.occurrenceText,
      `第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${exercise.occurrenceText}" 在第 ${paragraphIndex} 段中不存在`,
      `第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${exercise.occurrenceText}" 在第 ${paragraphIndex} 段中出现多次，无法稳定替换`,
    );
  }

  const sentenceStart = findUniqueText(
    text,
    exercise.sentence,
    `第 ${chapterIndex + 1} 章练习计划无效：sentence "${exercise.sentence}" 在第 ${paragraphIndex} 段中不存在`,
    `第 ${chapterIndex + 1} 章练习计划无效：sentence "${exercise.sentence}" 在第 ${paragraphIndex} 段中出现多次，无法稳定替换`,
  );
  const occurrenceInSentence = findUniqueText(
    exercise.sentence,
    exercise.occurrenceText,
    `第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${exercise.occurrenceText}" 在 sentence 中不存在`,
    `第 ${chapterIndex + 1} 章练习计划无效：occurrenceText "${exercise.occurrenceText}" 在 sentence 中出现多次，无法稳定替换`,
  );

  return sentenceStart + occurrenceInSentence;
}

function validateExercisePlanItem(item: AiExercisePlanItem, chapterIndex: number) {
  if (item.type !== "verb_blank" && item.type !== "vocabulary_hint") {
    throw new LessonDraftValidationError(`第 ${chapterIndex + 1} 章练习计划无效：练习类型不支持`);
  }

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

function assembleParagraphBlocks({
  paragraphText,
  sentences,
  exercises,
  chapterIndex,
  paragraphIndex,
  prefix,
  blocks,
  lessonExercises,
}: {
  paragraphText: string;
  sentences: string[];
  exercises: AiExercisePlanItem[];
  chapterIndex: number;
  paragraphIndex: 1 | 2;
  prefix: string;
  blocks: LessonDraft["chapters"][number]["blocks"];
  lessonExercises: LessonExercise[];
}) {
  const sorted = exercises
    .map((exercise) => {
      validateExercisePlanItem(exercise, chapterIndex);
      return { exercise, start: findExerciseOccurrence(paragraphText, sentences, exercise, chapterIndex, paragraphIndex) };
    })
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  const paragraphBlockIds: string[] = [];

  for (const { exercise, start } of sorted) {
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
      const paragraph = rawParagraphs[paragraphIndex] ?? { text: outlineChapter.summary, shot: undefined };
      const sentences = paragraphSentences(paragraph, outlineChapter.summary);
      const text = sentences.join(" ");
      assertNoLegacyMarkers(text, chapterIndex);
      return {
        text,
        sentences,
        shot: sanitizeShotPlan(paragraph?.shot, context, characters, chapterPlan?.title ?? outlineChapter.title, text),
      };
    }) as Array<AiStoryParagraphPlan & { text: string; sentences: string[] }> as [AiStoryParagraphPlan & { text: string; sentences: string[] }, AiStoryParagraphPlan & { text: string; sentences: string[] }];

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
        sentences: paragraph.sentences,
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
      text: stripTheEnd(nonEmptyString(storyPlan.closingReading?.text, "")),
      vocabularyTerms: uniqueNonEmpty(
        chapters.flatMap((chapter) => chapter.exercises.filter((exercise) => exercise.type === "vocabulary_hint").map((exercise) => exercise.answer)),
      ).slice(0, 12),
    },
  };

  return draft;
}

async function callDeepSeek(messages: ChatMessage[], thinkingOverride?: DeepSeekThinkingMode) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  if (!apiKey) {
    throw new Error("AI 服务未配置");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDeepSeekRequestBody(messages, thinkingOverride)),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`DeepSeek 请求失败: status=${response.status}, body=${errorText.slice(0, 500)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string | null; reasoning_content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`DeepSeek returned empty content: ${JSON.stringify(data).slice(0, 1000)}`);
  }

  return content;
}

export function buildDeepSeekRequestBody(messages: ChatMessage[], thinkingOverride?: DeepSeekThinkingMode): DeepSeekRequestBody {
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const thinkingMode = thinkingOverride ?? (process.env.DEEPSEEK_THINKING === "enabled" ? "enabled" : "disabled");

  if (thinkingMode === "disabled") {
    return {
      model,
      messages,
      max_tokens: 32000,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.2,
    };
  }

  return {
    model,
    messages,
    max_tokens: 64000,
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: "high",
  };
}

export async function generateLessonDraft(context: LessonDraftGenerationContext) {
  if (process.env.DEEPSEEK_API_KEY === "mock") {
    return validateLessonDraft(mockLessonDraft(context), context.storyOption);
  }

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
}
