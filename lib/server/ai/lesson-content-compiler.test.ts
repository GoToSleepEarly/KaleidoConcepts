import { describe, expect, test } from "vitest";

import type { StoryOption } from "@/lib/contracts/api";

import { compileLessonContentDraft, renderChapterAnswerList, renderChapterReadingText, type AiLessonContentPlan } from "./lesson-content-compiler";

const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "月光诗卷",
  storyline: "老师和学生在博物馆遇见李白，找回缺失诗句。",
  chapters: [{ title: "诗卷变暗", summary: "大家发现月光诗卷突然失去光亮。" }],
};

const aiPlan: AiLessonContentPlan = {
  title: "The Moonlight Scroll",
  chapters: [
    {
      title: "The Scroll Goes Dark",
      paragraphs: [
        {
          sentences: [
            "Ms. PAN and Jason visited the Tang Dynasty Poetry Museum.",
            "There was a faint silver line under the moon mark.",
            "Youyou saw a small clue on the glass case.",
          ],
        },
        {
          sentences: [
            "We must not ignore the dark poem.",
            "Ms. PAN was going to fulfill her destiny.",
            "Jason promised that he would not give up.",
          ],
        },
      ],
      exercises: [
        { type: "phrase_hint", targetCategory: "verb_phrase", target: "Verb Phrases", sentenceId: "c1p2s3", answer: "give up", hint: "放弃" },
        { type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "visited", prompt: "visit", baseWord: "visit" },
        { type: "given_word_blank", targetCategory: "grammar", target: "There be", sentenceId: "c1p1s2", answer: "There was", prompt: "there / be", baseWord: "be" },
        { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s3", answer: "clue", hint: "线索" },
        { type: "choice_blank", targetCategory: "modal", target: "Modals", sentenceId: "c1p2s1", answer: "must not", choices: ["must not", "should not"] },
        { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p2s2", answer: "destiny", hint: "天命/使命" },
      ],
    },
  ],
  closingReading: {
    title: "The Light Returns",
    sentences: ["The students remembered the moonlight clue.", "They helped the old scroll shine again."],
  },
};

describe("lesson content compiler", () => {
  test("sorts exercises by reading position and compiles all exercise types", () => {
    const draft = compileLessonContentDraft(aiPlan, storyOption, ["Past Simple", "There be", "Modals", "Verb Phrases"], [{ alias: "YouStudent", displayName: "You" }]);

    expect(draft.castAliases).toEqual([{ alias: "YouStudent", displayName: "You" }]);
    expect(draft.closingReading.vocabularyTerms).toEqual(["clue", "destiny", "give up"]);
    expect(draft.chapters[0].exercises).toEqual([
      { id: "chapter-1-exercise-1", order: 1, type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "visited", prompt: "visit", baseWord: "visit" },
      { id: "chapter-1-exercise-2", order: 2, type: "given_word_blank", targetCategory: "grammar", target: "There be", sentenceId: "c1p1s2", answer: "There was", prompt: "there / be", baseWord: "be" },
      { id: "chapter-1-exercise-3", order: 3, type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s3", answer: "clue", hint: "线索", pattern: "c _ _ e", letterCount: 4 },
      { id: "chapter-1-exercise-4", order: 4, type: "choice_blank", targetCategory: "modal", target: "Modals", sentenceId: "c1p2s1", answer: "must not", choices: ["must not", "should not"] },
      { id: "chapter-1-exercise-5", order: 5, type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p2s2", answer: "destiny", hint: "天命/使命", pattern: "d _ _ _ _ _ y", letterCount: 7 },
      { id: "chapter-1-exercise-6", order: 6, type: "phrase_hint", targetCategory: "verb_phrase", target: "Verb Phrases", sentenceId: "c1p2s3", answer: "give up", hint: "放弃", pattern: "g _ _ e u _", letterCount: "4+2" },
    ]);
  });

  test("renders inline blanks for all exercise types", () => {
    const draft = compileLessonContentDraft(aiPlan, storyOption, ["Past Simple", "There be", "Modals", "Verb Phrases"]);
    const readingText = renderChapterReadingText(draft.chapters[0]);

    expect(readingText).toContain("Ms. PAN and Jason (1) ________ (visit) the Tang Dynasty Poetry Museum.");
    expect(readingText).toContain("(2) ________ (there / be) a faint silver line under the moon mark.");
    expect(readingText).toContain("Youyou saw a small (3) [V1: c _ _ e (提示：线索，4个字母)] on the glass case.");
    expect(readingText).toContain("We (4) ________ (must not / should not) ignore the dark poem.");
    expect(readingText).toContain("Ms. PAN was going to fulfill her (5) [V2: d _ _ _ _ _ y (提示：天命/使命，7个字母)].");
    expect(readingText).toContain("Jason promised that he would not (6) [P1: g _ _ e u _ (提示：放弃，4+2个字母)].");
    expect(renderChapterAnswerList(draft.chapters[0])).toEqual(["1. visited", "2. There was", "3. clue", "4. must not", "5. destiny", "6. give up"]);
  });

  test("embeds up to two exercises in the same sentence in text order", () => {
    const multiExercisePlan: AiLessonContentPlan = {
      ...aiPlan,
      chapters: [
        {
          ...aiPlan.chapters[0],
          paragraphs: [{ sentences: ["Ms. PAN visited the moonlight museum."] }, { sentences: ["They smiled."] }],
          exercises: [
            { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s1", answer: "museum", hint: "博物馆" },
            { type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "visited", prompt: "visit", baseWord: "visit" },
          ],
        },
      ],
    };

    const draft = compileLessonContentDraft(multiExercisePlan, storyOption, ["Past Simple"]);

    expect(renderChapterReadingText(draft.chapters[0])).toContain("Ms. PAN (1) ________ (visit) the moonlight (2) [V1: m _ _ _ _ m (提示：博物馆，6个字母)].");
  });

  test("rejects more than two exercises in the same sentence with diagnostics", () => {
    const crowdedPlan: AiLessonContentPlan = {
      ...aiPlan,
      chapters: [
        {
          ...aiPlan.chapters[0],
          paragraphs: [{ sentences: ["Ms. PAN visited the moonlight museum today."] }, { sentences: ["They smiled."] }],
          exercises: [
            { type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "visited", prompt: "visit", baseWord: "visit" },
            { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s1", answer: "museum", hint: "博物馆" },
            { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s1", answer: "moonlight", hint: "月光" },
          ],
        },
      ],
    };

    expect(() => compileLessonContentDraft(crowdedPlan, storyOption, ["Past Simple"])).toThrow(
      'c1p1s1 has 3 exercises; max 2. Sentence: "Ms. PAN visited the moonlight museum today."',
    );
  });

  test("uses occurrence to locate repeated short answers", () => {
    const repeatedPlan: AiLessonContentPlan = {
      ...aiPlan,
      chapters: [
        {
          ...aiPlan.chapters[0],
          paragraphs: [{ sentences: ["There is a flower, and it is blue."] }, { sentences: ["They smiled."] }],
          exercises: [
            { type: "given_word_blank", targetCategory: "grammar", target: "Present Simple", sentenceId: "c1p1s1", answer: "is", occurrence: 2, prompt: "be", baseWord: "be" },
          ],
        },
      ],
    };

    const draft = compileLessonContentDraft(repeatedPlan, storyOption, ["Present Simple"]);

    expect(renderChapterReadingText(draft.chapters[0])).toContain("There is a flower, and it (1) ________ (be) blue.");
  });

  test("reports sentence text and occurrence guidance for ambiguous answers", () => {
    const repeatedPlan: AiLessonContentPlan = {
      ...aiPlan,
      chapters: [
        {
          ...aiPlan.chapters[0],
          paragraphs: [{ sentences: ["There is a flower, and it is blue."] }, { sentences: ["They smiled."] }],
          exercises: [
            { type: "given_word_blank", targetCategory: "grammar", target: "Present Simple", sentenceId: "c1p1s1", answer: "is", prompt: "be", baseWord: "be" },
          ],
        },
      ],
    };

    expect(() => compileLessonContentDraft(repeatedPlan, storyOption, ["Present Simple"])).toThrow(
      'answer "is" found 2 times in c1p1s1. Sentence: "There is a flower, and it is blue." If you intended one occurrence, set occurrence.',
    );
  });

  test("reports overlapping exercise answers with both exercise details", () => {
    const overlapPlan: AiLessonContentPlan = {
      ...aiPlan,
      chapters: [
        {
          ...aiPlan.chapters[0],
          paragraphs: [{ sentences: ["Some of them are blocking the way."] }, { sentences: ["They stopped."] }],
          exercises: [
            { type: "given_word_blank", targetCategory: "grammar", target: "Present Continuous", sentenceId: "c1p1s1", answer: "are blocking", prompt: "block", baseWord: "block" },
            { type: "phrase_hint", targetCategory: "verb_phrase", target: "Verb Phrases", sentenceId: "c1p1s1", answer: "blocking the way", hint: "挡路" },
          ],
        },
      ],
    };

    expect(() => compileLessonContentDraft(overlapPlan, storyOption, ["Present Continuous", "Verb Phrases"])).toThrow(
      'Exercise answers overlap in c1p1s1. Sentence: "Some of them are blocking the way." Overlapping answers: #1 "are blocking" (Present Continuous); #2 "blocking the way" (Verb Phrases)',
    );
  });

  test("rejects missing target coverage and invalid choice options", () => {
    expect(() => compileLessonContentDraft(aiPlan, storyOption, ["Present Perfect"])).toThrow("知识点未覆盖：Present Perfect");

    expect(() =>
      compileLessonContentDraft(
        {
          ...aiPlan,
          chapters: [
            {
              ...aiPlan.chapters[0],
              exercises: [{ type: "choice_blank", targetCategory: "modal", target: "Modals", sentenceId: "c1p2s1", answer: "must not", choices: ["should not", "may not"] }],
            },
          ],
        },
        storyOption,
        ["Modals"],
      ),
    ).toThrow("choice_blank choices must include answer");
  });
});
