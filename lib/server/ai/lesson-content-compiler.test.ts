import { describe, expect, test } from "vitest";

import type { StoryOption } from "@/lib/contracts/api";
import {
  compileLessonContentDraft,
  renderChapterAnswerList,
  renderChapterReadingText,
  type AiLessonContentPlan,
} from "./lesson-content-compiler";

const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "月光诗卷",
  storyline: "找回缺失诗句。",
  chapters: [{ title: "诗卷变暗", summary: "诗卷失去光亮。" }],
};

const plan: AiLessonContentPlan = {
  title: "The Moonlight Scroll",
  chapters: [
    {
      title: "The Scroll Goes Dark",
      paragraphs: [
        {
          sentences: [
            {
              parts: [
                { type: "text", text: "MsPANTeacher and YouStudent " },
                {
                  type: "given_word_blank",
                  answer: "visited",
                  target: "Past Simple",
                  prompt: "visit",
                  baseWord: "visit",
                },
                { type: "text", text: " the museum." },
              ],
            },
            {
              parts: [
                {
                  type: "given_word_blank",
                  answer: "There was",
                  target: "There be",
                  prompt: "there / be",
                  baseWord: "be",
                },
                { type: "text", text: " a silver line." },
              ],
            },
            {
              parts: [
                { type: "text", text: "YouStudent saw a " },
                {
                  type: "vocab_hint",
                  answer: "clue",
                  target: "Vocabulary",
                  hint: "线索",
                },
                { type: "text", text: "." },
              ],
            },
          ],
        },
        {
          sentences: [
            {
              parts: [
                { type: "text", text: "We " },
                {
                  type: "choice_blank",
                  answer: "must not",
                  target: "Modals",
                  choices: ["must not", "should not"],
                },
                { type: "text", text: " ignore it." },
              ],
            },
            {
              parts: [
                { type: "text", text: "Jason would not " },
                {
                  type: "phrase_hint",
                  answer: "give up",
                  target: "Verb Phrases",
                  hint: "放弃",
                },
                { type: "text", text: "." },
              ],
            },
            { parts: [{ type: "text", text: "The scroll shone again." }] },
          ],
        },
      ],
    },
  ],
  closingReading: {
    title: "The Light Returns",
    sentences: ["The class remembered the clue."],
  },
};

describe("lesson content compiler", () => {
  test("derives clean sentence text and exercise segments from one part structure", () => {
    const draft = compileLessonContentDraft(plan, storyOption, [
      "Past Simple",
      "There be",
      "Modals",
      "Verb Phrases",
    ]);
    expect(draft.chapters[0].paragraphs[0].sentences[0].text).toBe(
      "MsPANTeacher and YouStudent visited the museum.",
    );
    expect(draft.chapters[0].paragraphs[0].sentences[0].segments).toEqual([
      { type: "text", text: "MsPANTeacher and YouStudent " },
      { type: "exercise", exerciseId: "chapter-1-exercise-1" },
      { type: "text", text: " the museum." },
    ]);
    expect(renderChapterAnswerList(draft.chapters[0])).toEqual([
      "1. visited",
      "2. There was",
      "3. clue",
      "4. must not",
      "5. give up",
    ]);
  });

  test("renders every exercise type without changing clean text", () => {
    const draft = compileLessonContentDraft(plan, storyOption);
    const reading = renderChapterReadingText(draft.chapters[0]);
    expect(reading).toContain("(1) ________ (visit)");
    expect(reading).toContain("(2) ________ (there / be) a silver line.");
    expect(reading).toContain("[V1: c _ _ e (提示：线索，4个字母)]");
    expect(reading).toContain("(must not / should not)");
    expect(reading).toContain("[P1: g _ _ e u _ (提示：放弃，4+2个字母)]");
  });

  test("rejects two exercise parts in one sentence", () => {
    const invalid = structuredClone(plan);
    invalid.chapters[0].paragraphs[0].sentences[0].parts.splice(2, 0, {
      type: "vocab_hint",
      answer: "museum",
      target: "Vocabulary",
      hint: "博物馆",
    });
    expect(() => compileLessonContentDraft(invalid, storyOption)).toThrow(
      "c1p1s1 has 2 exercise parts; max 1",
    );
  });

  test("rejects repeated answers in a chapter ignoring case", () => {
    const invalid = structuredClone(plan);
    invalid.chapters[0].paragraphs[1].sentences[2] = {
      parts: [
        { type: "text", text: "They " },
        {
          type: "given_word_blank",
          answer: "VISITED",
          target: "Past Simple",
          prompt: "visit",
        },
        { type: "text", text: " again." },
      ],
    };
    expect(() => compileLessonContentDraft(invalid, storyOption)).toThrow(
      'Chapter 1 repeats exercise answer "VISITED"',
    );
  });

  test("uses the explicit exercise part even when the answer appears elsewhere in the sentence", () => {
    const repeated = structuredClone(plan);
    repeated.chapters[0].paragraphs[0].sentences[0].parts.push({
      type: "text",
      text: " They visited twice.",
    });
    const draft = compileLessonContentDraft(repeated, storyOption);
    expect(draft.chapters[0].paragraphs[0].sentences[0].text).toContain(
      "visited twice",
    );
    expect(
      draft.chapters[0].paragraphs[0].sentences[0].segments.filter(
        (segment) => segment.type === "exercise",
      ),
    ).toHaveLength(1);
  });

  test("rejects missing target coverage and invalid choice options", () => {
    expect(() =>
      compileLessonContentDraft(plan, storyOption, ["Present Perfect"]),
    ).toThrow("知识点未覆盖：Present Perfect");
    const invalid = structuredClone(plan);
    const choice = invalid.chapters[0].paragraphs[1].sentences[0].parts[1];
    if (choice.type === "choice_blank")
      choice.choices = ["should not", "may not"];
    expect(() => compileLessonContentDraft(invalid, storyOption)).toThrow(
      "choice_blank choices must include answer",
    );
  });
});
