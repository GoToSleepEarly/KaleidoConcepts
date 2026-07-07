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

type DeepSeekRequestBody = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: "enabled" | "disabled" };
  reasoning_effort?: "high" | "max";
  temperature?: number;
};

const chapterWordTarget = { min: 110, max: 130 };
const minExercisesPerChapter = 5;
const maxExercisesPerChapter = 10;

type AiShotPlan = Omit<LessonShot, "id" | "order" | "imageSlotId" | "coveredBlockIds">;

type AiParagraphPlan = {
  markedText: string;
  shot: AiShotPlan;
};

type AiChapterPlan = {
  title: string;
  paragraphs: [AiParagraphPlan, AiParagraphPlan];
};

type AiLessonDraftPlan = {
  title: string;
  visualStyle: Omit<LessonVisualStyle, "aspectRatio"> & { aspectRatio?: "4:3" };
  characters: LessonVisualCharacter[];
  chapters: AiChapterPlan[];
  closingReading: {
    title: string;
    text: string;
  };
};

function personName(person: PersonProfile) {
  return person.englishName || person.chineseName || person.name;
}

function buildPrompt(context: LessonDraftGenerationContext) {
  return [
    "Use the selected story outline as the fixed skeleton. Your task is to write student-facing English picture-book content and image shot semantics. Do not redesign the story.",
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
      .map(
        (chapter, index) =>
          `  ${index + 1}. ${chapter.title}\n     story summary: ${chapter.summary}\n     grammar hook: ${chapter.knowledgeHook}`,
      )
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
    "- Return strict minified JSON only, preferably on one line. No Markdown. No explanation. No comments. No extra keys.",
    "- Return a content plan, not the final database LessonDraft.",
    "- The backend will create ids, block order, exercise block references, imageSlotId, shot order, and coveredBlockIds.",
    "- Do not include block ids, exercise ids, shot ids, sourceOutlineChapterIndex, wordTarget, exerciseTarget, schemaVersion, generationMode, language, or sourceStoryOptionId.",
    "- visualStyle must describe the illustration style and consistency. aspectRatio is optional and must be \"4:3\" if present.",
    "- characters must include exactly one teacher and all selected students. Character ids must match the input ids.",
    "- Generate exactly one chapter plan for each selected outline chapter, in the same order.",
    "- Each chapter must preserve the corresponding outline chapter's story intent and grammar hook.",
    "- The chapter story must visibly use the grammar targets from the course and the chapter grammar hook. Do not treat grammar as a separate note.",
    "- Each chapter must have exactly two paragraphs.",
    "- Each paragraph must use markedText, not plain text.",
    "- markedText is the final student story paragraph with inline exercise markers embedded in natural sentence context.",
    "- markedText should contain about 55-80 rendered English words after markers are replaced by their answers.",
    "- Use exactly this marker format for exercises: [verb:baseVerb|answer] and [vocab:pattern|answer].",
    "- Example verb marker: [verb:walk|walked]. The answer must be the exact word that belongs in the sentence.",
    "- Example vocabulary marker: [vocab:t _ _ _ l|trail]. The pattern should reveal useful letters, usually first and last letters.",
    "- Do not put spaces around the marker pipes. Do not nest markers. Do not use Markdown.",
    "- Each chapter should contain 8-10 markers total across its two markedText paragraphs.",
    "- Include both verb blank and vocabulary hint markers when natural, but do not force an exact ratio.",
    "- Spread markers across both paragraphs so each paragraph has at least one exercise marker.",
    "- Avoid repeating the same exercise answer inside one chapter.",
    "- Each paragraph has its own image shot semantics. Shot semantics are used for picture-book image generation, so make them specific to the paragraph's story action.",
    "- Choose verb markers that directly practice the target grammar when possible. For example, past tense targets require past-tense answers.",
    "- Vocabulary markers must be important words or phrases from the chapter story, not random words.",
    "- shot.characterIds must reference global character ids only.",
    "- shot.scenePrompt, composition, location, action, mood, and continuityNotes must be English.",
    "- Image prompts must preserve character consistency and must not redesign character appearances.",
    "- Keep shot fields concise but concrete. Each should be one short sentence or phrase.",
    "- closingReading.text must be English only, 80-120 words, summarize the whole story after reading, contain no blanks, no exercises, no answers, no image prompt, and no final \"The End\" sentence.",
    "",
    "Required JSON shape:",
    `{"title":"string","visualStyle":{"artStyle":"string","colorPalette":"string","aspectRatio":"4:3","consistencyPrompt":"string"},"characters":[{"id":"${context.teacher.id}","name":"string","role":"teacher","appearance":"string","outfit":"string","consistencyPrompt":"string"}],"chapters":[{"title":"string","paragraphs":[{"markedText":"Yesterday, Ms. Lin [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate].","shot":{"characterIds":["${context.teacher.id}"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}},{"markedText":"The students [verb:find|found] a bright [vocab:m _ p|map].","shot":{"characterIds":["${context.teacher.id}"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}}]}],"closingReading":{"title":"string","text":"80-120 English words"}}`,
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

function countTextWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stableCharacterPlans(plan: AiLessonDraftPlan, context: LessonDraftGenerationContext): LessonVisualCharacter[] {
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

function paragraphFiller(context: LessonDraftGenerationContext, chapterIndex: number, paragraphIndex: number) {
  const outline = context.storyOption.chapters[chapterIndex];
  const teacher = personName(context.teacher);
  const students = context.students.map(personName).join(" and ") || "the students";

  return [
    `${teacher} and ${students} stayed inside the ${context.course.theme} story world.`,
    `They used English to describe the clue, remember what happened, and choose the next careful action.`,
    `This moment connected to ${outline?.title ?? "the chapter"} and kept the adventure moving forward.`,
    paragraphIndex === 0
      ? "The first scene opened the problem clearly so every student could follow the story."
      : "The second scene helped the group solve the challenge and prepare for the next chapter.",
  ].join(" ");
}

function ensureParagraphLength(text: string, context: LessonDraftGenerationContext, chapterIndex: number, paragraphIndex: number) {
  let result = text.trim();

  while (countTextWords(result) < 45) {
    result = `${result} ${paragraphFiller(context, chapterIndex, paragraphIndex)}`.trim();
  }

  return result;
}

type ParsedMarker =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "verb_blank";
      baseVerb: string;
      answer: string;
    }
  | {
      type: "vocabulary_hint";
      pattern: string;
      answer: string;
      letterCount: number;
    };

function vocabularyLetterCount(answer: string) {
  return answer.replace(/[^A-Za-z]/g, "").length || answer.trim().length;
}

function parseMarkedText(markedText: string) {
  const items: ParsedMarker[] = [];
  const markerPattern = /\[(verb|vocab):([^\]|]*)\|([^\]]*)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(markedText)) !== null) {
    if (match.index > cursor) {
      items.push({ type: "text", text: markedText.slice(cursor, match.index) });
    }

    const markerKind = match[1];
    const meta = match[2].trim();
    const answer = match[3].trim();

    if (!answer || (markerKind === "verb" && !meta)) {
      throw new LessonDraftValidationError("AI marked exercise is incomplete");
    }

    if (markerKind === "verb") {
      items.push({ type: "verb_blank", baseVerb: meta, answer });
    } else {
      const pattern = meta || vocabularyPattern(answer);
      items.push({ type: "vocabulary_hint", pattern, answer, letterCount: vocabularyLetterCount(answer) });
    }

    cursor = markerPattern.lastIndex;
  }

  if (cursor < markedText.length) {
    items.push({ type: "text", text: markedText.slice(cursor) });
  }

  if (items.some((item) => item.type === "text" && /\[(?:verb|vocab):/.test(item.text))) {
    throw new LessonDraftValidationError("AI marked exercise syntax is invalid");
  }

  return items;
}

function validateChapterMarkers(chapterTitle: string, parsedParagraphs: ParsedMarker[][], chapterIndex = 0) {
  const paragraphExerciseCounts = parsedParagraphs.map((items) => items.filter((item) => item.type !== "text").length);
  const exercises = parsedParagraphs.flatMap((items) => items.filter((item) => item.type !== "text"));
  const answers = exercises.map((item) => item.answer.trim().toLowerCase());
  const chapterLabel = `第 ${chapterIndex + 1} 章`;

  if (exercises.length < minExercisesPerChapter) {
    throw new LessonDraftValidationError(`${chapterLabel}练习数量不足：需要 5-10 个，当前 ${exercises.length} 个`);
  }

  if (exercises.length > maxExercisesPerChapter) {
    throw new LessonDraftValidationError(`${chapterLabel}练习数量过多：需要 5-10 个，当前 ${exercises.length} 个`);
  }

  if (new Set(answers).size !== answers.length) {
    throw new LessonDraftValidationError(`AI marked exercises invalid: chapter=${chapterTitle}, duplicate answers found`);
  }

  if (paragraphExerciseCounts.some((count) => count < 1)) {
    throw new LessonDraftValidationError(`AI marked exercises invalid: chapter=${chapterTitle}, each paragraph needs at least one marker`);
  }
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

function parsePlan(value: unknown): AiLessonDraftPlan {
  if (!isObject(value) || !Array.isArray(value.chapters)) {
    throw new LessonDraftValidationError("AI content plan is incomplete");
  }

  return value as AiLessonDraftPlan;
}

export function assembleLessonDraftFromPlan(planInput: AiLessonDraftPlan, context: LessonDraftGenerationContext): LessonDraft {
  const plan = parsePlan(planInput);
  const characters = stableCharacterPlans(plan, context);
  const visualStyle = (isObject(plan.visualStyle) ? plan.visualStyle : {}) as Partial<AiLessonDraftPlan["visualStyle"]>;
  const chapters = context.storyOption.chapters.map((outlineChapter, chapterIndex) => {
    const chapterPlan = plan.chapters[chapterIndex];
    const prefix = `chapter-${chapterIndex + 1}`;
    const rawParagraphs = Array.isArray(chapterPlan?.paragraphs) ? chapterPlan.paragraphs.slice(0, 2) : [];
    const paragraphs: [AiParagraphPlan, AiParagraphPlan] = [0, 1].map((paragraphIndex) => {
      const paragraph = rawParagraphs[paragraphIndex];
      const fallbackMarkedText = ensureParagraphLength(outlineChapter.summary, context, chapterIndex, paragraphIndex);
      return {
        markedText: nonEmptyString(paragraph?.markedText, fallbackMarkedText),
        shot: sanitizeShotPlan(paragraph?.shot, context, characters, chapterPlan?.title ?? outlineChapter.title, paragraph?.markedText ?? outlineChapter.summary),
      };
    }) as [AiParagraphPlan, AiParagraphPlan];
    const parsedParagraphs = paragraphs.map((paragraph) => parseMarkedText(paragraph.markedText)) as [ParsedMarker[], ParsedMarker[]];
    validateChapterMarkers(chapterPlan?.title ?? outlineChapter.title, parsedParagraphs, chapterIndex);

    const exercises: LessonExercise[] = [];
    const blocks: LessonDraft["chapters"][number]["blocks"] = [];
    const paragraphBlockIds: string[][] = [];

    parsedParagraphs.forEach((items) => {
      const currentParagraphBlockIds: string[] = [];

      items.forEach((item) => {
        if (item.type === "text") {
          if (!item.text) {
            return;
          }

          const textBlock = { id: `${prefix}-block-${blocks.length + 1}`, order: blocks.length + 1, type: "text" as const, text: item.text };
          blocks.push(textBlock);
          currentParagraphBlockIds.push(textBlock.id);
          return;
        }

        const exerciseId = `${prefix}-exercise-${exercises.length + 1}`;
        const exercise: LessonExercise =
          item.type === "verb_blank"
            ? {
                id: exerciseId,
                type: "verb_blank",
                answer: item.answer,
                baseVerb: item.baseVerb,
              }
            : {
                id: exerciseId,
                type: "vocabulary_hint",
                answer: item.answer,
                pattern: item.pattern || vocabularyPattern(item.answer),
                letterCount: item.letterCount,
              };
        exercises.push(exercise);

        const exerciseBlock = {
          id: `${prefix}-block-${blocks.length + 1}`,
          order: blocks.length + 1,
          type: "exercise" as const,
          exerciseId: exercise.id,
          display:
            exercise.type === "verb_blank"
              ? { kind: "verb_blank" as const, placeholder: "________" as const, prompt: exercise.baseVerb }
              : {
                  kind: "vocabulary_hint" as const,
                  placeholder: "________" as const,
                  pattern: exercise.pattern,
                  letterCount: exercise.letterCount,
                },
        };
        blocks.push(exerciseBlock);
        currentParagraphBlockIds.push(exerciseBlock.id);
      });

      paragraphBlockIds.push(currentParagraphBlockIds);
    });

    return {
      id: prefix,
      sourceOutlineChapterIndex: chapterIndex + 1,
      title: nonEmptyString(chapterPlan?.title, outlineChapter.title),
      wordTarget: { min: chapterWordTarget.min, max: chapterWordTarget.max },
      exerciseTarget: { verbBlankCount: 7 as const, vocabularyHintCount: 3 as const },
      blocks,
      exercises,
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
    title: nonEmptyString(plan.title, context.storyOption.title),
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
      title: nonEmptyString(plan.closingReading?.title, `After ${context.storyOption.title}`),
      text: stripTheEnd(ensureParagraphLength(nonEmptyString(plan.closingReading?.text, ""), context, 0, 1)),
      vocabularyTerms: uniqueNonEmpty(
        chapters.flatMap((chapter) =>
          chapter.exercises.filter((exercise) => exercise.type === "vocabulary_hint").map((exercise) => exercise.answer),
        ),
      ).slice(0, 12),
    },
  };

  return draft;
}

async function callDeepSeek(messages: ChatMessage[]) {
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
    body: JSON.stringify(buildDeepSeekRequestBody(messages)),
  });

  if (!response.ok) {
    throw new Error("DeepSeek 请求失败");
  }

  const data = (await response.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string | null; reasoning_content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`DeepSeek returned empty content: ${JSON.stringify(data).slice(0, 1000)}`);
  }

  if (!content) {
    throw new Error("DeepSeek 返回为空");
  }

  return content;
}

export function buildDeepSeekRequestBody(messages: ChatMessage[]): DeepSeekRequestBody {
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const thinkingMode = process.env.DEEPSEEK_THINKING === "enabled" ? "enabled" : "disabled";

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
    // TODO: Restrict this deterministic branch to local development after the real DeepSeek key is configured.
    return validateLessonDraft(mockLessonDraft(context), context.storyOption);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert English picture-book content designer and structured JSON formatter. Carefully check all marker counts and paragraph distributions before answering. Do not include reasoning in the visible response. Return strict JSON only.",
    },
    {
      role: "user",
      content: buildPrompt(context),
    },
  ];

  const parsed = parsePlan(parseJsonObject(await callDeepSeek(messages)));
  return validateLessonDraft(assembleLessonDraftFromPlan(parsed, context), context.storyOption);
}
