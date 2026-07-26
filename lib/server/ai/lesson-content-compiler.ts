import type {
  LessonContentChapter,
  LessonContentDraft,
  LessonExercise,
  StoryOption,
} from "@/lib/contracts/api";

export type AiLessonContentPlan = {
  title: string;
  chapters: AiLessonChapter[];
  closingReading: AiClosingReading;
};

export type AiLessonChapter = {
  title: string;
  paragraphs: [AiParagraph, AiParagraph];
};

export type AiParagraph = {
  sentences: AiSentence[];
};

export type AiSentence = {
  parts: AiSentencePart[];
};

type AiExerciseBase = {
  answer: string;
  target: string;
};

export type AiSentencePart =
  | { type: "text"; text: string }
  | (AiExerciseBase & {
      type: "given_word_blank";
      prompt: string;
      baseWord?: string;
    })
  | (AiExerciseBase & {
      type: "choice_blank";
      choices: string[];
    })
  | {
      type: "vocab_hint";
      answer: string;
      hint: string;
    }
  | {
      type: "phrase_hint";
      answer: string;
      hint: string;
    };

export type AiClosingReading = {
  title: string;
  sentences: string[];
};

function sentenceId(
  chapterIndex: number,
  paragraphIndex: number,
  sentenceIndex: number,
) {
  return `c${chapterIndex + 1}p${paragraphIndex + 1}s${sentenceIndex + 1}`;
}

function exerciseId(chapterIndex: number, exerciseIndex: number) {
  return `chapter-${chapterIndex + 1}-exercise-${exerciseIndex + 1}`;
}

function answerLetters(answer: string) {
  return answer.replace(/[^A-Za-z]/g, "");
}

function wordPattern(word: string) {
  const letters = Array.from(word.replace(/[^A-Za-z]/g, ""));
  if (letters.length <= 1) return letters[0] ?? word;
  if (letters.length === 2) return `${letters[0]} _`;
  return [
    letters[0],
    ...Array.from({ length: letters.length - 2 }, () => "_"),
    letters.at(-1),
  ].join(" ");
}

export function hintPattern(answer: string) {
  return answer.split(/\s+/).filter(Boolean).map(wordPattern).join(" ");
}

export function hintLetterCount(answer: string) {
  const counts = answer
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => answerLetters(word).length || word.length);
  return counts.length <= 1
    ? (counts[0] ?? answer.trim().length)
    : counts.join("+");
}

export function normalizeAnswer(answer: string) {
  return answer.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function exercisePart(sentence: AiSentence, id: string) {
  const exercises = sentence.parts.filter(
    (part): part is Exclude<AiSentencePart, { type: "text" }> =>
      part.type !== "text",
  );
  if (exercises.length > 1) {
    throw new Error(`${id} has ${exercises.length} exercise parts; max 1`);
  }
  return exercises[0];
}

function sentenceText(sentence: AiSentence) {
  return sentence.parts
    .map((part) => (part.type === "text" ? part.text : part.answer))
    .join("");
}

function validateExercisePart(
  part: Exclude<AiSentencePart, { type: "text" }>,
  id: string,
) {
  if (!part.answer || part.answer !== part.answer.trim()) {
    throw new Error(
      `${id} exercise answer must be non-empty without surrounding whitespace`,
    );
  }

  if (part.type === "choice_blank") {
    const choices = new Set(part.choices);
    if (
      part.choices.length < 2 ||
      part.choices.length > 4 ||
      choices.size !== part.choices.length
    ) {
      throw new Error("choice_blank choices must contain 2-4 unique options");
    }
    if (!choices.has(part.answer))
      throw new Error("choice_blank choices must include answer");
  }
}

function targetCategory(target: string): "grammar" | "modal" | "vocab" {
  if (target === "Modals") return "modal";
  if (target === "Vocabulary") return "vocab";
  return "grammar";
}

function compileExercise(
  part: Exclude<AiSentencePart, { type: "text" }>,
  chapterIndex: number,
  sentenceIdValue: string,
  order: number,
): LessonExercise {
  const common = {
    id: exerciseId(chapterIndex, order - 1),
    order,
    sentenceId: sentenceIdValue,
    answer: part.answer,
  };
  if (part.type === "given_word_blank")
    return {
      ...common,
      type: part.type,
      targetCategory: targetCategory(part.target),
      target: part.target,
      prompt: part.prompt,
      baseWord: part.baseWord,
    };
  if (part.type === "choice_blank")
    return {
      ...common,
      type: part.type,
      targetCategory: targetCategory(part.target),
      target: part.target,
      choices: part.choices,
    };
  if (part.type === "vocab_hint")
    return {
      ...common,
      type: part.type,
      targetCategory: "vocab",
      target: "Vocabulary",
      hint: part.hint,
      pattern: hintPattern(part.answer),
      letterCount: Number(hintLetterCount(part.answer)),
    };
  return {
    ...common,
    type: part.type,
    targetCategory: "verb_phrase",
    target: "Verb Phrases",
    hint: part.hint,
    pattern: hintPattern(part.answer),
    letterCount: String(hintLetterCount(part.answer)),
  };
}

function validateTargetCoverage(
  chapters: LessonContentChapter[],
  requiredTargets: string[],
) {
  const coveredTargets = new Set(
    chapters.flatMap((chapter) =>
      chapter.exercises.map((exercise) => exercise.target),
    ),
  );
  const missingTargets = requiredTargets.filter(
    (target) => !coveredTargets.has(target),
  );
  if (missingTargets.length)
    throw new Error(`知识点未覆盖：${missingTargets.join(" / ")}`);
}

export function deriveClosingVocabularyTerms(chapters: LessonContentChapter[]) {
  return Array.from(
    new Set(
      chapters
        .flatMap((chapter) => chapter.exercises)
        .filter(
          (exercise) =>
            exercise.type === "vocab_hint" || exercise.type === "phrase_hint",
        )
        .map((exercise) => exercise.answer.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

export function compileLessonContentDraft(
  plan: AiLessonContentPlan,
  storyOption: StoryOption,
  requiredTargets: string[] = [],
  castAliases: LessonContentDraft["castAliases"] = [],
): LessonContentDraft {
  if (plan.chapters.length !== storyOption.chapters.length)
    throw new Error(
      "Lesson content chapter count does not match selected story outline",
    );

  const chapters = plan.chapters.map(
    (chapter, chapterIndex): LessonContentChapter => {
      const exerciseParts = chapter.paragraphs.flatMap(
        (paragraph, paragraphIndex) =>
          paragraph.sentences.flatMap((sentence, sentenceIndex) => {
            const id = sentenceId(chapterIndex, paragraphIndex, sentenceIndex);
            const part = exercisePart(sentence, id);
            if (!part) return [];
            validateExercisePart(part, id);
            return [{ id, part }];
          }),
      );

      const exercises = exerciseParts.map(({ id, part }, index) =>
        compileExercise(part, chapterIndex, id, index + 1),
      );
      const exerciseBySentence = new Map(
        exercises.map((exercise) => [exercise.sentenceId, exercise]),
      );

      return {
        id: `chapter-${chapterIndex + 1}`,
        sourceOutlineChapterIndex: chapterIndex + 1,
        title: chapter.title,
        paragraphs: chapter.paragraphs.map((paragraph, paragraphIndex) => ({
          id: `chapter-${chapterIndex + 1}-paragraph-${paragraphIndex + 1}`,
          order: (paragraphIndex + 1) as 1 | 2,
          sentences: paragraph.sentences.map((sentence, sentenceIndex) => {
            const id = sentenceId(chapterIndex, paragraphIndex, sentenceIndex);
            const exercise = exerciseBySentence.get(id);
            return {
              id,
              text: sentenceText(sentence),
              segments: sentence.parts.map((part) =>
                part.type === "text"
                  ? { type: "text" as const, text: part.text }
                  : { type: "exercise" as const, exerciseId: exercise!.id },
              ),
            };
          }),
        })),
        exercises,
      };
    },
  );

  validateTargetCoverage(chapters, requiredTargets);
  return {
    schemaVersion: "lesson_content_v1",
    sourceStoryOptionId: storyOption.id,
    generationMode: "ai",
    title: plan.title,
    language: "en",
    castAliases,
    chapters,
    closingReading: {
      title: plan.closingReading.title,
      sentences: plan.closingReading.sentences,
      vocabularyTerms: deriveClosingVocabularyTerms(chapters),
    },
  };
}

function labelForExercise(
  exercise: LessonExercise,
  counters: { vocab: number; phrase: number },
) {
  if (exercise.type === "vocab_hint") return `V${++counters.vocab}`;
  if (exercise.type === "phrase_hint") return `P${++counters.phrase}`;
  return "";
}

function renderExercise(
  exercise: LessonExercise,
  counters: { vocab: number; phrase: number },
) {
  if (exercise.type === "given_word_blank")
    return `(${exercise.order}) ________ (${exercise.prompt})`;
  if (exercise.type === "choice_blank")
    return `(${exercise.order}) ________ (${exercise.choices.join(" / ")})`;
  const label = labelForExercise(exercise, counters);
  return `(${exercise.order}) [${label}: ${exercise.pattern} (提示：${exercise.hint}，${exercise.letterCount}个字母)]`;
}

export function renderChapterReadingText(chapter: LessonContentChapter) {
  const exerciseById = new Map(
    chapter.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const counters = { vocab: 0, phrase: 0 };
  return chapter.paragraphs
    .map((paragraph) =>
      paragraph.sentences
        .map((sentence) =>
          sentence.segments
            .map((segment) =>
              segment.type === "text"
                ? segment.text
                : renderExercise(
                    exerciseById.get(segment.exerciseId)!,
                    counters,
                  ),
            )
            .join(""),
        )
        .join(" "),
    )
    .join("\n\n");
}

export function renderChapterAnswerList(chapter: LessonContentChapter) {
  return chapter.exercises.map(
    (exercise) => `${exercise.order}. ${exercise.answer}`,
  );
}
