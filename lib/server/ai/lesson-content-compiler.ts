import type { LessonContentChapter, LessonContentDraft, LessonExercise, StoryOption } from "@/lib/contracts/api";

export type AiLessonContentPlan = {
  title: string;
  chapters: AiLessonChapter[];
  closingReading: AiClosingReading;
};

type AiLessonChapter = {
  title: string;
  paragraphs: [AiParagraph, AiParagraph];
  exercises: AiExerciseAnchor[];
};

type AiParagraph = {
  sentences: string[];
};

type AiExerciseAnchor = AiGivenWordBlankAnchor | AiChoiceBlankAnchor | AiVocabHintAnchor | AiPhraseHintAnchor;

type AiExerciseBase = {
  sentenceId: string;
  answer: string;
  target: string;
  occurrence?: number;
};

type AiGivenWordBlankAnchor = AiExerciseBase & {
  type: "given_word_blank";
  targetCategory: "grammar" | "modal" | "vocab";
  prompt: string;
  baseWord?: string;
};

type AiChoiceBlankAnchor = AiExerciseBase & {
  type: "choice_blank";
  targetCategory: "grammar" | "modal" | "vocab";
  choices: string[];
};

type AiVocabHintAnchor = AiExerciseBase & {
  type: "vocab_hint";
  targetCategory: "vocab";
  target: "Vocabulary";
  hint: string;
};

type AiPhraseHintAnchor = AiExerciseBase & {
  type: "phrase_hint";
  targetCategory: "verb_phrase";
  target: "Verb Phrases";
  hint: string;
};

type AiClosingReading = {
  title: string;
  sentences: string[];
};

type PositionedExercise = {
  anchor: AiExerciseAnchor;
  sentenceText: string;
  paragraphIndex: number;
  sentenceIndex: number;
  answerStart: number;
};

function sentenceId(chapterIndex: number, paragraphIndex: number, sentenceIndex: number) {
  return `c${chapterIndex + 1}p${paragraphIndex + 1}s${sentenceIndex + 1}`;
}

function exerciseId(chapterIndex: number, exerciseIndex: number) {
  return `chapter-${chapterIndex + 1}-exercise-${exerciseIndex + 1}`;
}

function parseSentenceId(value: string) {
  const match = /^c(\d+)p(\d+)s(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid sentenceId ${value}`);
  }

  return {
    chapterIndex: Number(match[1]) - 1,
    paragraphIndex: Number(match[2]) - 1,
    sentenceIndex: Number(match[3]) - 1,
  };
}

function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAnswerPositions(text: string, answer: string) {
  if (!answer) {
    return [];
  }

  if (/^[A-Za-z]+$/.test(answer)) {
    return Array.from(text.matchAll(new RegExp(`\\b${regexEscape(answer)}\\b`, "g"))).map((match) => match.index ?? -1).filter((index) => index >= 0);
  }

  const positions: number[] = [];
  let index = text.indexOf(answer);
  while (index >= 0) {
    positions.push(index);
    index = text.indexOf(answer, index + answer.length);
  }
  return positions;
}

function answerLetters(answer: string) {
  return answer.replace(/[^A-Za-z]/g, "");
}

function wordPattern(word: string) {
  const letters = Array.from(word.replace(/[^A-Za-z]/g, ""));

  if (letters.length === 0) {
    return word;
  }

  if (letters.length === 1) {
    return letters[0];
  }

  if (letters.length === 2) {
    return [letters[0], "_"].join(" ");
  }

  return [letters[0], ...Array.from({ length: letters.length - 2 }, () => "_"), letters[letters.length - 1]].join(" ");
}

function hintPattern(answer: string) {
  return answer
    .split(/\s+/)
    .filter(Boolean)
    .map(wordPattern)
    .join(" ");
}

function hintLetterCount(answer: string) {
  const counts = answer
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => answerLetters(word).length || word.length);

  if (counts.length <= 1) {
    return counts[0] ?? answer.trim().length;
  }

  return counts.join("+");
}

function overlapDetail(exercise: { item: LessonExercise }) {
  return `#${exercise.item.order} "${exercise.item.answer}" (${exercise.item.target})`;
}

function compileSentenceSegments(sentenceIdValue: string, text: string, exercises: Array<{ item: LessonExercise; answerStart: number }>) {
  if (!exercises.length) {
    return [{ type: "text" as const, text }];
  }

  const sorted = exercises.slice().sort((left, right) => left.answerStart - right.answerStart);
  const segments: Array<{ type: "text"; text: string } | { type: "exercise"; exerciseId: string }> = [];
  let cursor = 0;

  for (const exercise of sorted) {
    if (exercise.answerStart < cursor) {
      const previous = sorted[sorted.indexOf(exercise) - 1];
      const details = previous ? `${overlapDetail(previous)}; ${overlapDetail(exercise)}` : overlapDetail(exercise);
      throw new Error(`Exercise answers overlap in ${sentenceIdValue}. Sentence: "${text}" Overlapping answers: ${details}`);
    }

    if (exercise.answerStart > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, exercise.answerStart) });
    }
    segments.push({ type: "exercise", exerciseId: exercise.item.id });
    cursor = exercise.answerStart + exercise.item.answer.length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }

  return segments;
}

function validateAnchor(anchor: AiExerciseAnchor) {
  if (anchor.type === "choice_blank") {
    const uniqueChoices = new Set(anchor.choices);
    if (!Array.isArray(anchor.choices) || anchor.choices.length < 2 || anchor.choices.length > 4 || uniqueChoices.size !== anchor.choices.length) {
      throw new Error("choice_blank choices must contain 2-4 unique options");
    }
    if (!uniqueChoices.has(anchor.answer)) {
      throw new Error("choice_blank choices must include answer");
    }
  }

  if (anchor.type === "vocab_hint" && (anchor.targetCategory !== "vocab" || anchor.target !== "Vocabulary")) {
    throw new Error("vocab_hint must use targetCategory vocab and target Vocabulary");
  }

  if (anchor.type === "phrase_hint" && (anchor.targetCategory !== "verb_phrase" || anchor.target !== "Verb Phrases")) {
    throw new Error("phrase_hint must use targetCategory verb_phrase and target Verb Phrases");
  }
}

function compileExercise(positioned: PositionedExercise, chapterIndex: number, exerciseIndex: number): LessonExercise {
  const { anchor } = positioned;
  validateAnchor(anchor);

  const id = exerciseId(chapterIndex, exerciseIndex);
  const order = exerciseIndex + 1;

  if (anchor.type === "given_word_blank") {
    return {
      id,
      order,
      type: "given_word_blank",
      targetCategory: anchor.targetCategory,
      target: anchor.target,
      sentenceId: anchor.sentenceId,
      answer: anchor.answer,
      prompt: anchor.prompt,
      baseWord: anchor.baseWord,
    };
  }

  if (anchor.type === "choice_blank") {
    return {
      id,
      order,
      type: "choice_blank",
      targetCategory: anchor.targetCategory,
      target: anchor.target,
      sentenceId: anchor.sentenceId,
      answer: anchor.answer,
      choices: anchor.choices,
    };
  }

  if (anchor.type === "vocab_hint") {
    return {
      id,
      order,
      type: "vocab_hint",
      targetCategory: "vocab",
      target: "Vocabulary",
      sentenceId: anchor.sentenceId,
      answer: anchor.answer,
      hint: anchor.hint,
      pattern: hintPattern(anchor.answer),
      letterCount: Number(hintLetterCount(anchor.answer)),
    };
  }

  return {
    id,
    order,
    type: "phrase_hint",
    targetCategory: "verb_phrase",
    target: "Verb Phrases",
    sentenceId: anchor.sentenceId,
    answer: anchor.answer,
    hint: anchor.hint,
    pattern: hintPattern(anchor.answer),
    letterCount: String(hintLetterCount(anchor.answer)),
  };
}

function positionedExercises(chapter: AiLessonChapter, chapterIndex: number) {
  return chapter.exercises
    .map((anchor, anchorIndex): PositionedExercise => {
      const parsed = parseSentenceId(anchor.sentenceId);
      if (parsed.chapterIndex !== chapterIndex) {
        throw new Error(`Exercise ${anchorIndex + 1} references wrong chapter sentenceId ${anchor.sentenceId}`);
      }

      const sentenceText = chapter.paragraphs[parsed.paragraphIndex]?.sentences[parsed.sentenceIndex];
      if (!sentenceText) {
        throw new Error(`Exercise ${anchorIndex + 1} references missing sentenceId ${anchor.sentenceId}`);
      }

      const positions = findAnswerPositions(sentenceText, anchor.answer);
      if (positions.length === 0) {
        throw new Error(`Exercise ${anchorIndex + 1} answer "${anchor.answer}" found 0 times in ${anchor.sentenceId}. Sentence: "${sentenceText}"`);
      }

      if (positions.length > 1 && !anchor.occurrence) {
        throw new Error(
          `Exercise ${anchorIndex + 1} answer "${anchor.answer}" found ${positions.length} times in ${anchor.sentenceId}. Sentence: "${sentenceText}" If you intended one occurrence, set occurrence.`,
        );
      }

      const occurrence = anchor.occurrence ?? 1;
      if (occurrence < 1 || occurrence > positions.length) {
        throw new Error(`Exercise ${anchorIndex + 1} occurrence ${occurrence} is out of range for answer "${anchor.answer}" in ${anchor.sentenceId}. Sentence: "${sentenceText}"`);
      }

      return {
        anchor,
        sentenceText,
        paragraphIndex: parsed.paragraphIndex,
        sentenceIndex: parsed.sentenceIndex,
        answerStart: positions[occurrence - 1],
      };
    })
    .sort((left, right) => left.paragraphIndex - right.paragraphIndex || left.sentenceIndex - right.sentenceIndex || left.answerStart - right.answerStart);
}

function deriveClosingVocabularyTerms(chapters: LessonContentChapter[]) {
  return Array.from(
    new Set(
      chapters
        .flatMap((chapter) => chapter.exercises)
        .filter((exercise) => exercise.type === "vocab_hint" || exercise.type === "phrase_hint")
        .map((exercise) => exercise.answer.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function validateTargetCoverage(chapters: LessonContentChapter[], requiredTargets: string[]) {
  const coveredTargets = new Set(chapters.flatMap((chapter) => chapter.exercises.map((exercise) => exercise.target)));
  const missingTargets = requiredTargets.filter((target) => !coveredTargets.has(target));

  if (missingTargets.length) {
    throw new Error(`知识点未覆盖：${missingTargets.join(" / ")}`);
  }
}

export function compileLessonContentDraft(plan: AiLessonContentPlan, storyOption: StoryOption, requiredTargets: string[] = [], castAliases: LessonContentDraft["castAliases"] = []): LessonContentDraft {
  if (plan.chapters.length !== storyOption.chapters.length) {
    throw new Error("Lesson content chapter count does not match selected story outline");
  }

  const chapters = plan.chapters.map((chapter, chapterIndex): LessonContentChapter => {
    const sortedPositioned = positionedExercises(chapter, chapterIndex);
    const exercises = sortedPositioned.map((positioned, exerciseIndex) => compileExercise(positioned, chapterIndex, exerciseIndex));
    const exercisesBySentenceId = new Map<string, Array<{ item: LessonExercise; answerStart: number }>>();
    exercises.forEach((exercise, index) => {
      const positioned = sortedPositioned[index];
      const group = exercisesBySentenceId.get(exercise.sentenceId) ?? [];
      group.push({ item: exercise, answerStart: positioned.answerStart });
      exercisesBySentenceId.set(exercise.sentenceId, group);
    });

    for (const [id, group] of exercisesBySentenceId) {
      if (group.length > 2) {
        const sentenceText = sortedPositioned.find((positioned) => positioned.anchor.sentenceId === id)?.sentenceText ?? "";
        throw new Error(`${id} has ${group.length} exercises; max 2. Sentence: "${sentenceText}"`);
      }
    }

    return {
      id: `chapter-${chapterIndex + 1}`,
      sourceOutlineChapterIndex: chapterIndex + 1,
      title: chapter.title,
      paragraphs: chapter.paragraphs.map((paragraph, paragraphIndex) => ({
        id: `chapter-${chapterIndex + 1}-paragraph-${paragraphIndex + 1}`,
        order: (paragraphIndex + 1) as 1 | 2,
        sentences: paragraph.sentences.map((text, sentenceIndex) => {
          const id = sentenceId(chapterIndex, paragraphIndex, sentenceIndex);
          return {
            id,
            text,
            segments: compileSentenceSegments(id, text, exercisesBySentenceId.get(id) ?? []),
          };
        }),
      })),
      exercises,
    };
  });

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

function labelForExercise(exercise: LessonExercise, labelCounters: { vocab: number; phrase: number }) {
  if (exercise.type === "vocab_hint") {
    labelCounters.vocab += 1;
    return `V${labelCounters.vocab}`;
  }

  if (exercise.type === "phrase_hint") {
    labelCounters.phrase += 1;
    return `P${labelCounters.phrase}`;
  }

  return "";
}

function renderExercise(exercise: LessonExercise, labelCounters: { vocab: number; phrase: number }) {
  if (exercise.type === "given_word_blank") {
    return `(${exercise.order}) ________ (${exercise.prompt})`;
  }

  if (exercise.type === "choice_blank") {
    return `(${exercise.order}) ________ (${exercise.choices.join(" / ")})`;
  }

  const label = labelForExercise(exercise, labelCounters);
  const letterText = typeof exercise.letterCount === "number" ? `${exercise.letterCount}` : exercise.letterCount;
  return `(${exercise.order}) [${label}: ${exercise.pattern} (提示：${exercise.hint}，${letterText}个字母)]`;
}

export function renderChapterReadingText(chapter: LessonContentChapter) {
  const exerciseById = new Map(chapter.exercises.map((exercise) => [exercise.id, exercise]));
  const labelCounters = { vocab: 0, phrase: 0 };

  return chapter.paragraphs
    .map((paragraph) =>
      paragraph.sentences
        .map((sentence) =>
          sentence.segments
            .map((segment) => {
              if (segment.type === "text") {
                return segment.text;
              }

              const exercise = exerciseById.get(segment.exerciseId);
              return exercise ? renderExercise(exercise, labelCounters) : "";
            })
            .join(""),
        )
        .join(" "),
    )
    .join("\n\n");
}

export function renderChapterAnswerList(chapter: LessonContentChapter) {
  return chapter.exercises.map((exercise) => `${exercise.order}. ${exercise.answer}`);
}
