import type { CourseBasicDetail, LessonDraft, PersonProfile, StoryOption } from "@/lib/contracts/api";
import { validateLessonDraft } from "@/lib/server/repositories/lesson-drafts";

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
    "- Return strict JSON only. No Markdown. No explanation. No comments. No extra keys.",
    "- schemaVersion must be \"lesson_draft_v1\".",
    `- sourceStoryOptionId must be "${context.storyOption.id}".`,
    "- generationMode must be \"ai\".",
    "- language must be \"en\".",
    "- visualStyle.aspectRatio must be \"4:3\".",
    "- characters must include exactly one teacher and all selected students. Character ids must match the input ids.",
    "- Generate exactly one lesson chapter for each selected outline chapter, in the same order.",
    "- sourceOutlineChapterIndex starts at 1 and matches the outline order.",
    "- Each chapter must preserve the corresponding outline chapter's story intent and grammar hook.",
    "- Each chapter must render to 120-180 English words when text blocks and exercise blanks are read in order.",
    "- Each chapter must contain exactly 10 exercise blocks and exactly 10 exercises.",
    "- Each chapter must contain exactly 7 verb_blank exercises and exactly 3 vocabulary_hint exercises.",
    "- A verb_blank display must be: {\"kind\":\"verb_blank\",\"placeholder\":\"________\",\"prompt\":\"baseVerb\"}.",
    "- A vocabulary_hint display must be: {\"kind\":\"vocabulary_hint\",\"placeholder\":\"________\",\"pattern\":\"d _ _ _ m\",\"letterCount\":5}.",
    "- Do not show exercise numbers.",
    "- Do not put answers in text blocks or display fields. Answers must only appear in exercises.",
    "- Text blocks must contain plain English story text only, not grammar explanations.",
    "- Exercise blocks are rendered inline between text blocks.",
    "- Every block must have a stable id and sequential order starting at 1 within the chapter.",
    "- Every exercise block must reference one existing exercise id.",
    "- Every exercise must be referenced by exactly one exercise block.",
    "- Each chapter must contain exactly 2 image shots.",
    "- Shot 1 should cover the first half of the chapter blocks. Shot 2 should cover the second half.",
    "- The two shots together must cover all blocks in the chapter.",
    "- The two shots must not overlap in coveredBlockIds.",
    "- Image shots must reference global character ids only.",
    "- scenePrompt, composition, location, action, mood, and continuityNotes must be English.",
    "- Image prompts must preserve character consistency and must not redesign character appearances.",
    "",
    "Required JSON shape:",
    `{"schemaVersion":"lesson_draft_v1","sourceStoryOptionId":"${context.storyOption.id}","generationMode":"ai","title":"string","language":"en","visualStyle":{"artStyle":"string","colorPalette":"string","aspectRatio":"4:3","consistencyPrompt":"string"},"characters":[{"id":"string","name":"string","role":"teacher","appearance":"string","outfit":"string","consistencyPrompt":"string"}],"chapters":[{"id":"chapter-1","sourceOutlineChapterIndex":1,"title":"string","wordTarget":{"min":120,"max":180},"exerciseTarget":{"verbBlankCount":7,"vocabularyHintCount":3},"blocks":[{"id":"chapter-1-block-1","order":1,"type":"text","text":"string"},{"id":"chapter-1-block-2","order":2,"type":"exercise","exerciseId":"chapter-1-exercise-1","display":{"kind":"verb_blank","placeholder":"________","prompt":"sleep"}}],"exercises":[{"id":"chapter-1-exercise-1","type":"verb_blank","answer":"slept","baseVerb":"sleep"},{"id":"chapter-1-exercise-8","type":"vocabulary_hint","answer":"dream","pattern":"d _ _ _ m","letterCount":5}],"shots":[{"id":"chapter-1-shot-1","order":1,"imageSlotId":"chapter-1-image-1","coveredBlockIds":["chapter-1-block-1"],"characterIds":["string"],"location":"string","action":"string","mood":"string","scenePrompt":"string","composition":"string","continuityNotes":"string"}]}]}`,
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
    chapters: context.storyOption.chapters.map((chapter, chapterIndex) => {
      const prefix = `chapter-${chapterIndex + 1}`;
      const text =
        "Yesterday afternoon, the teacher and students enter the story world together. The air seems bright and strange, and every corner hides a new signal. They keep close, watch carefully, and move along the road from the outline. The teacher asks calm questions while the students explore, guess, and make strong choices. A small problem appears near the middle of the journey, so everyone has to think before moving on. The students notice details, share ideas, and use English to describe what happens. By the end of the scene, the challenge becomes clear, the next step appears, and the group feels ready for the following part of the adventure. The teacher smiles, the students look around, and the story world waits quietly for their next decision.";
      const blocks = [
        { id: `${prefix}-block-1`, order: 1, type: "text" as const, text },
        ...Array.from({ length: 7 }, (_, index) => ({
          id: `${prefix}-block-${index + 2}`,
          order: index + 2,
          type: "exercise" as const,
          exerciseId: `${prefix}-exercise-${index + 1}`,
          display: { kind: "verb_blank" as const, placeholder: "________" as const, prompt: ["step", "feel", "stay", "listen", "follow", "guide", "solve"][index] },
        })),
        ...[
          { answer: "clue", pattern: "c _ _ e", letterCount: 4 },
          { answer: "path", pattern: "p _ _ h", letterCount: 4 },
          { answer: "brave", pattern: "b _ _ _ e", letterCount: 5 },
        ].map((item, index) => ({
          id: `${prefix}-block-${index + 9}`,
          order: index + 9,
          type: "exercise" as const,
          exerciseId: `${prefix}-exercise-${index + 8}`,
          display: { kind: "vocabulary_hint" as const, placeholder: "________" as const, pattern: item.pattern, letterCount: item.letterCount },
        })),
      ];

      return {
        id: prefix,
        sourceOutlineChapterIndex: chapterIndex + 1,
        title: chapter.title,
        wordTarget: { min: 120 as const, max: 180 as const },
        exerciseTarget: { verbBlankCount: 7 as const, vocabularyHintCount: 3 as const },
        blocks,
        exercises: [
          { id: `${prefix}-exercise-1`, type: "verb_blank" as const, answer: "stepped", baseVerb: "step" },
          { id: `${prefix}-exercise-2`, type: "verb_blank" as const, answer: "felt", baseVerb: "feel" },
          { id: `${prefix}-exercise-3`, type: "verb_blank" as const, answer: "stayed", baseVerb: "stay" },
          { id: `${prefix}-exercise-4`, type: "verb_blank" as const, answer: "listened", baseVerb: "listen" },
          { id: `${prefix}-exercise-5`, type: "verb_blank" as const, answer: "followed", baseVerb: "follow" },
          { id: `${prefix}-exercise-6`, type: "verb_blank" as const, answer: "guided", baseVerb: "guide" },
          { id: `${prefix}-exercise-7`, type: "verb_blank" as const, answer: "solved", baseVerb: "solve" },
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
  return JSON.parse(fenced ? fenced[1] : trimmed) as LessonDraft;
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
      const midpoint = Math.ceil(normalizedBlocks.length / 2);
      const firstBlockIds = normalizedBlocks.slice(0, midpoint).map((block) => block.id);
      const secondBlockIds = normalizedBlocks.slice(midpoint).map((block) => block.id);
      const fallbackCharacterIds = draft.characters.map((character) => character.id);

      return {
        ...chapter,
        id: chapter.id || `chapter-${chapterIndex + 1}`,
        sourceOutlineChapterIndex: chapterIndex + 1,
        wordTarget: { min: 120, max: 180 },
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
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error("DeepSeek 请求失败");
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;

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
        "You are an expert English picture-book content designer and structured JSON formatter. You fill a fixed story outline with student-facing English text, inline exercises, and image-generation-ready shots. Return strict JSON only.",
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
      if (attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error("课文草稿生成失败");
}
