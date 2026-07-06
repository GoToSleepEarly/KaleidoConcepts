import type { CourseBasicDetail, LessonDraft, PersonProfile, StoryOption } from "@/lib/contracts/api";
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

const chapterWordTarget = { min: 110, max: 130 };

function personName(person: PersonProfile) {
  return person.englishName || person.chineseName || person.name;
}

function buildPrompt(context: LessonDraftGenerationContext) {
  return [
    "Use the selected story outline as the fixed skeleton. Your task is to fill it with student-facing English picture-book text, inline exercises, and image shots. Do not redesign the story.",
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
    "- schemaVersion must be \"lesson_draft_v1\".",
    `- sourceStoryOptionId must be "${context.storyOption.id}".`,
    "- generationMode must be \"ai\".",
    "- language must be \"en\".",
    "- visualStyle.aspectRatio must be \"4:3\".",
    "- characters must include exactly one teacher and all selected students. Character ids must match the input ids.",
    "- Generate exactly one lesson chapter for each selected outline chapter, in the same order.",
    "- sourceOutlineChapterIndex starts at 1 and matches the outline order.",
    "- Each chapter must preserve the corresponding outline chapter's story intent and grammar hook.",
    "- The chapter story must visibly use the grammar targets from the course and the chapter grammar hook. Do not treat grammar as a separate note.",
    "- Choose verb_blank items that directly practice the target grammar when possible. For example, past tense targets require past-tense answers; modal targets should appear clearly in nearby dialogue or sentence context even though the blank stores the verb form.",
    "- Vocabulary hints must be important words or phrases from the chapter story, not random words.",
    "- Each chapter must contain 100-120 English story words in text blocks, excluding blanks. Aim for about 120 total rendered words including blanks.",
    "- Each chapter must be two complete story paragraphs. Each shot paragraph should contain about 50-60 story words plus its blanks.",
    "- Each chapter must contain exactly 10 exercise blocks and exactly 10 exercises.",
    "- Each chapter must contain exactly 7 verb_blank exercises and exactly 3 vocabulary_hint exercises.",
    "- A verb_blank display must be: {\"kind\":\"verb_blank\",\"placeholder\":\"________\",\"prompt\":\"baseVerb\"}.",
    "- A vocabulary_hint display must be: {\"kind\":\"vocabulary_hint\",\"placeholder\":\"________\",\"pattern\":\"d _ _ _ m\",\"letterCount\":5}.",
    "- Do not show exercise numbers.",
    "- Do not put answers in text blocks or display fields. Answers must only appear in exercises.",
    "- Text blocks must contain plain English story text only, not grammar explanations.",
    "- Exercise blocks must be interleaved inline inside the story sequence between short text blocks.",
    "- Do not put a full chapter in one text block followed by all exercise blocks. That is invalid.",
    "- Each chapter should usually alternate short text fragments and exercise blocks so the rendered student text already reads as a fill-in story.",
    "- Vocabulary hint blanks must have meaningful text before and after the blank. Never place vocabulary_hint blocks without sentence context.",
    "- Every block must have a stable id and sequential order starting at 1 within the chapter.",
    "- Every exercise block must reference one existing exercise id.",
    "- Every exercise must be referenced by exactly one exercise block.",
    "- Each chapter must contain exactly 2 image shots.",
    "- Shot 1 must cover the complete first story paragraph. Shot 2 must cover the complete second story paragraph.",
    "- Never split a sentence between shots. Each shot's coveredBlockIds must begin and end at a natural sentence or paragraph boundary.",
    "- The two shots together must cover all blocks in the chapter.",
    "- The two shots must not overlap in coveredBlockIds.",
    "- Image shots must reference global character ids only.",
    "- scenePrompt, composition, location, action, mood, and continuityNotes must be English.",
    "- Image prompts must preserve character consistency and must not redesign character appearances.",
    "- Keep location, action, mood, scenePrompt, composition, and continuityNotes concise. Each should be one short sentence or phrase.",
    "- After all chapters, include closingReading. It must be English only, about 100 words, summarize the whole story after reading, contain no blanks, no exercises, no answers, and no image prompt.",
    "- closingReading.vocabularyTerms must list all vocabulary_hint answers from all chapters, English original words or phrases only. No Chinese, no definitions.",
    "",
    "Required JSON shape:",
    `{"schemaVersion":"lesson_draft_v1","sourceStoryOptionId":"${context.storyOption.id}","generationMode":"ai","title":"string","language":"en","visualStyle":{"artStyle":"string","colorPalette":"string","aspectRatio":"4:3","consistencyPrompt":"string"},"characters":[{"id":"string","name":"string","role":"teacher","appearance":"string","outfit":"string","consistencyPrompt":"string"}],"chapters":[{"id":"chapter-1","sourceOutlineChapterIndex":1,"title":"string","wordTarget":{"min":110,"max":130},"exerciseTarget":{"verbBlankCount":7,"vocabularyHintCount":3},"blocks":[{"id":"chapter-1-block-1","order":1,"type":"text","text":"Yesterday, the teacher and students "},{"id":"chapter-1-block-2","order":2,"type":"exercise","exerciseId":"chapter-1-exercise-1","display":{"kind":"verb_blank","placeholder":"________","prompt":"sleep"}},{"id":"chapter-1-block-3","order":3,"type":"text","text":" beside the library door."}],"exercises":[{"id":"chapter-1-exercise-1","type":"verb_blank","answer":"slept","baseVerb":"sleep"},{"id":"chapter-1-exercise-8","type":"vocabulary_hint","answer":"dream","pattern":"d _ _ _ m","letterCount":5}],"shots":[{"id":"chapter-1-shot-1","order":1,"imageSlotId":"chapter-1-image-1","coveredBlockIds":["chapter-1-block-1","chapter-1-block-2","chapter-1-block-3"],"characterIds":["string"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}]}],"closingReading":{"title":"string","text":"about 100 English words","vocabularyTerms":["dream"]}}`,
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
    return JSON.parse(jsonText) as LessonDraft;
  } catch {
    return JSON.parse(jsonText.replace(/,\s*([}\]])/g, "$1")) as LessonDraft;
  }
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function collectVocabularyTerms(draft: LessonDraft) {
  return uniqueNonEmpty(
    draft.chapters.flatMap((chapter) =>
      chapter.exercises.filter((exercise) => exercise.type === "vocabulary_hint").map((exercise) => exercise.answer),
    ),
  );
}

function isSentenceBoundary(block: LessonDraft["chapters"][number]["blocks"][number]) {
  return block.type === "text" && /[.!?]["')\]]?\s*$/.test(block.text.trim());
}

function findShotSplitIndex(blocks: LessonDraft["chapters"][number]["blocks"]) {
  const target = Math.floor(blocks.length / 2);
  const candidates = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block, index }) => index > 0 && index < blocks.length - 1 && isSentenceBoundary(block));

  if (candidates.length < 1) {
    return Math.max(0, Math.ceil(blocks.length / 2) - 1);
  }

  return candidates.reduce((best, current) => (Math.abs(current.index - target) < Math.abs(best.index - target) ? current : best)).index;
}

function normalizeGeneratedDraft(draft: LessonDraft, context: LessonDraftGenerationContext): LessonDraft {
  const characterIds = new Set(draft.characters.map((character) => character.id));

  return {
    ...draft,
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: context.storyOption.id,
    generationMode: "ai",
    language: "en",
    visualStyle: {
      ...draft.visualStyle,
      aspectRatio: "4:3",
    },
    chapters: draft.chapters.map((chapter, chapterIndex) => {
      const sortedBlocks = chapter.blocks
        .map((block, blockIndex) => ({ ...block, order: blockIndex + 1 }))
        .sort((a, b) => a.order - b.order);
      const normalizedBlocks = sortedBlocks.map((block) => {
        if (block.type !== "exercise") {
          return block;
        }

        const exercise = chapter.exercises.find((item) => item.id === block.exerciseId);

        if (!exercise) {
          return block;
        }

        if (exercise.type === "verb_blank") {
          return {
            ...block,
            display: {
              kind: "verb_blank" as const,
              placeholder: "________" as const,
              prompt: exercise.baseVerb,
            },
          };
        }

        return {
          ...block,
          display: {
            kind: "vocabulary_hint" as const,
            placeholder: "________" as const,
            pattern: exercise.pattern,
            letterCount: exercise.letterCount,
          },
        };
      });
      const splitIndex = findShotSplitIndex(normalizedBlocks);
      const firstBlockIds = normalizedBlocks.slice(0, splitIndex + 1).map((block) => block.id);
      const secondBlockIds = normalizedBlocks.slice(splitIndex + 1).map((block) => block.id);
      const fallbackCharacterIds = draft.characters.map((character) => character.id);

      return {
        ...chapter,
        id: chapter.id || `chapter-${chapterIndex + 1}`,
        sourceOutlineChapterIndex: chapterIndex + 1,
        wordTarget: { min: chapterWordTarget.min, max: chapterWordTarget.max },
        exerciseTarget: { verbBlankCount: 7, vocabularyHintCount: 3 },
        blocks: normalizedBlocks,
        shots: [0, 1].map((shotIndex) => {
          const shot = chapter.shots[shotIndex];
          const coveredBlockIds = shotIndex === 0 ? firstBlockIds : secondBlockIds;
          const validCharacterIds = shot?.characterIds.filter((id) => characterIds.has(id)) ?? [];

          return {
            id: shot?.id || `chapter-${chapterIndex + 1}-shot-${shotIndex + 1}`,
            order: (shotIndex + 1) as 1 | 2,
            imageSlotId: shot?.imageSlotId || `chapter-${chapterIndex + 1}-image-${shotIndex + 1}`,
            coveredBlockIds,
            characterIds: validCharacterIds.length > 0 ? validCharacterIds : fallbackCharacterIds,
            location: shot?.location || context.course.theme,
            action: shot?.action || context.storyOption.chapters[chapterIndex]?.summary || chapter.title,
            mood: shot?.mood || "storybook adventure",
            scenePrompt: shot?.scenePrompt || `A children's storybook illustration for ${chapter.title}.`,
            composition: shot?.composition || "4:3 picture-book composition with clear characters and setting.",
            continuityNotes: shot?.continuityNotes || "Use the global visual style and character consistency prompts.",
          };
        }),
      };
    }),
    closingReading: {
      title: draft.closingReading?.title || `After ${context.storyOption.title}`,
      text:
        draft.closingReading?.text ||
        "After the adventure, the teacher and students remembered how they moved through the story world together. They noticed clues, made choices, and used English to describe what happened. Each chapter helped them practice the target grammar inside real actions, not separate drills. The students became more confident because they solved problems as a team and listened to the teacher's guidance. When the journey ended, they could retell the important moments, name the useful words, and explain how small decisions changed the story step by step.",
      vocabularyTerms: uniqueNonEmpty(draft.closingReading?.vocabularyTerms ?? []).length
        ? uniqueNonEmpty(draft.closingReading.vocabularyTerms)
        : collectVocabularyTerms(draft),
    },
  };
}

async function callDeepSeek(messages: ChatMessage[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

  if (!apiKey) {
    throw new Error("AI 服务未配置");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 32000,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.35,
    }),
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

export async function generateLessonDraft(context: LessonDraftGenerationContext) {
  if (process.env.DEEPSEEK_API_KEY === "mock") {
    // TODO: Restrict this deterministic branch to local development after the real DeepSeek key is configured.
    return validateLessonDraft(mockLessonDraft(context), context.storyOption);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert English picture-book content designer and structured JSON formatter. Output the final JSON immediately. Do not think step by step. Do not include reasoning. Return strict JSON only.",
    },
    {
      role: "user",
      content: buildPrompt(context),
    },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = parseJsonObject(await callDeepSeek(messages));
      return validateLessonDraft(normalizeGeneratedDraft(parsed, context), context.storyOption);
    } catch (error) {
      if (attempt === 0) {
        messages.push({
          role: "user",
          content:
            error instanceof LessonDraftValidationError
              ? `The previous JSON failed validation: ${error.message}. Regenerate the full JSON. Keep every chapter at 100-120 story words in text blocks, exactly 10 exercises, and two complete paragraph-based shots. Return strict minified JSON only.`
              : `The previous response could not be parsed as valid JSON: ${error instanceof Error ? error.message : "unknown error"}. Regenerate the full JSON as strict minified JSON only.`,
        });
        continue;
      }

      if (attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error("课文草稿生成失败");
}
