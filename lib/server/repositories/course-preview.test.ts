import { describe, expect, test } from "vitest";

import type {
  CoursePreviewImage,
  CoursePresentationConfig,
  CourseStatus,
  LessonDraft,
} from "@/lib/contracts/api";
import { toPreviewPages } from "./course-preview";

function makeSentence(id: string, text: string) {
  return { id, text, segments: [{ type: "text" as const, text }] };
}

function makeSentenceWithExercise(
  id: string,
  before: string,
  exerciseId: string,
  after: string,
) {
  return {
    id,
    text: `${before}${after}`,
    segments: [
      { type: "text" as const, text: before },
      { type: "exercise" as const, exerciseId },
      { type: "text" as const, text: after },
    ],
  };
}

function makeTextExercise(id: string, order: number, sentenceId: string, answer: string) {
  return {
    id,
    order,
    type: "given_word_blank" as const,
    targetCategory: "grammar" as const,
    target: answer,
    sentenceId,
    answer,
    prompt: `Fill in: ${answer}`,
  };
}

function makeChoiceExercise(id: string, order: number, sentenceId: string, answer: string, choices: string[]) {
  return {
    id,
    order,
    type: "choice_blank" as const,
    targetCategory: "vocab" as const,
    target: answer,
    sentenceId,
    answer,
    prompt: "Choose the right word",
    choices,
  };
}

function makeDraft(): LessonDraft {
  const s1 = makeSentenceWithExercise("s1", "The cat ", "e1", " on the mat.");
  const s2 = makeSentence("s2", "It is a sunny day.");
  const s3 = makeSentenceWithExercise("s3", "The dog ", "e2", " in the park.");
  const s4 = makeSentence("s4", "He plays with a ball.");
  return {
    schemaVersion: "lesson_content_v1",
    sourceStoryOptionId: "story-1",
    generationMode: "ai",
    title: "A Sunny Day",
    language: "en",
    castAliases: [{ alias: "SummerStudent", displayName: "Summer" }],
    chapters: [
      {
        id: "ch1",
        sourceOutlineChapterIndex: 1,
        title: "The Cat",
        paragraphs: [
          { id: "p1", order: 1, sentences: [s1, s2] },
          { id: "p2", order: 2, sentences: [s3, s4] },
        ],
        exercises: [
          makeTextExercise("e1", 1, "s1", "sits"),
          makeChoiceExercise("e2", 2, "s3", "runs", ["runs", "run"]),
        ],
      },
    ],
    closingReading: {
      title: "After the Story",
      sentences: ["The cat and dog are friends.", "They play together every day."],
      vocabularyTerms: [],
    },
  };
}

function makePlan() {
  return {
    schemaVersion: "course_resource_plan_v1" as const,
    coverBrief: {
      description: "A cat and dog in a sunny park",
      storyElements: ["sun", "ball"],
      imagePrompt: "GPT Image 2 prompt: Horizontal 16:9 ...",
    },
    shots: [
      {
        chapterId: "ch1",
        shotId: "ch1-shot-1",
        shotOrder: 1 as const,
        sourceParagraphId: "p1",
        focus: "cat sitting",
        keyObjects: ["mat"],
        imagePrompt: "GPT Image 2 prompt: Horizontal 16:9 ...",
      },
      {
        chapterId: "ch1",
        shotId: "ch1-shot-2",
        shotOrder: 2 as const,
        sourceParagraphId: "p2",
        focus: "dog running",
        keyObjects: ["ball"],
        imagePrompt: "GPT Image 2 prompt: Horizontal 16:9 ...",
      },
    ],
    version: 1,
  };
}

function succeededImage(publicUrl = "/images/test.webp"): CoursePreviewImage {
  return { status: "succeeded", publicUrl, stale: false, failureReason: null };
}

const defaultPresentation: CoursePresentationConfig = {
  coverTheme: "dark",
  coverTitleFontSize: 1.0,
  chapterTheme: "blue-purple",
  slideOverrides: {},
};

describe("toPreviewPages", () => {
  test("builds correct page sequence: cover_pure -> cover_title -> chapter_divider -> shot_image -> shot_text (x2) -> closing", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage("/cover.webp");
    const shot1Img = succeededImage("/shot1.webp");
    const shot2Img = succeededImage("/shot2.webp");
    const images = [
      { slotId: "visual-cover", ...coverImg },
      { slotId: "ch1-shot-1", ...shot1Img },
      { slotId: "ch1-shot-2", ...shot2Img },
    ] as Array<{ slotId: string } & CoursePreviewImage>;

    const pages = toPreviewPages(
      "course-1",
      draft,
      images,
      plan,
      defaultPresentation,
      "ready" as CourseStatus,
      coverImg,
    );

    expect(pages).toHaveLength(9);
    expect(pages[0].type).toBe("cover_pure");
    expect(pages[1].type).toBe("cover_title");
    expect(pages[2].type).toBe("chapter_divider");
    expect(pages[3].type).toBe("shot_image");
    expect(pages[4].type).toBe("shot_text");
    expect(pages[5].type).toBe("shot_image");
    expect(pages[6].type).toBe("shot_text");
    expect(pages[7].type).toBe("closing_image");
    expect(pages[8].type).toBe("closing_text");
  });

  test("cover_title contains title, teacherName, studentNames", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();
    const pages = toPreviewPages("course-1", draft, [], plan, defaultPresentation, "ready", coverImg, "Ms. Smith", ["Alice", "Bob"]);

    const coverTitle = pages.find((p) => p.type === "cover_title") as Extract<(typeof pages)[number], { type: "cover_title" }>;
    expect(coverTitle.title).toBe("A Sunny Day");
    expect(coverTitle.teacherName).toBe("Ms. Smith");
    expect(coverTitle.studentNames).toEqual(["Alice", "Bob"]);
  });

  test("chapter_divider carries chapterIndex and the English chapter title", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();
    const pages = toPreviewPages("course-1", draft, [], plan, defaultPresentation, "ready", coverImg);

    const divider = pages.find((p) => p.type === "chapter_divider") as Extract<(typeof pages)[number], { type: "chapter_divider" }>;
    expect(divider.chapterIndex).toBe(1);
    expect(divider.chapterTitleEn).toBe("The Cat");
  });

  test("shot_text pages contain paragraphs with sentences and inline exercise segments", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();
    const images = [
      { slotId: "visual-cover", ...coverImg },
      { slotId: "ch1-shot-1", ...succeededImage("/s1.webp") },
      { slotId: "ch1-shot-2", ...succeededImage("/s2.webp") },
    ] as Array<{ slotId: string } & CoursePreviewImage>;

    const pages = toPreviewPages("course-1", draft, images, plan, defaultPresentation, "ready", coverImg);

    const shotText1 = pages.find((p) => p.type === "shot_text" && "shotOrder" in p && p.shotOrder === 1) as Extract<(typeof pages)[number], { type: "shot_text" }>;
    expect(shotText1.paragraphs).toHaveLength(1);
    const paragraph = shotText1.paragraphs[0];
    expect(paragraph.sentences).toHaveLength(2);
    const s1Sentence = paragraph.sentences[0];
    const exerciseSegs = s1Sentence.segments.filter((s) => s.type === "exercise");
    expect(exerciseSegs).toHaveLength(1);
    expect(exerciseSegs[0]).toMatchObject({ type: "exercise" });
    if (exerciseSegs[0].type === "exercise") {
      expect(exerciseSegs[0].exercise.answer).toBe("sits");
      expect(exerciseSegs[0].exercise.colorClass).toBe("violet");
      expect(exerciseSegs[0].exercise.order).toBe(1);
    }
  });

  test("choice_blank exercises get blue colorClass and include choices", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();
    const images = [
      { slotId: "visual-cover", ...coverImg },
      { slotId: "ch1-shot-1", ...succeededImage() },
      { slotId: "ch1-shot-2", ...succeededImage("/s2.webp") },
    ] as Array<{ slotId: string } & CoursePreviewImage>;

    const pages = toPreviewPages("course-1", draft, images, plan, defaultPresentation, "ready", coverImg);
    const shotText2 = pages.find((p) => p.type === "shot_text" && "shotOrder" in p && p.shotOrder === 2) as Extract<(typeof pages)[number], { type: "shot_text" }>;
    const s3Sentence = shotText2.paragraphs[0].sentences[0];
    const ex = s3Sentence.segments.find((s) => s.type === "exercise") as { type: "exercise"; exercise: { colorClass: string; choices?: string[] } } | undefined;
    expect(ex).toBeDefined();
    expect(ex?.exercise.colorClass).toBe("blue");
    expect(ex?.exercise.choices).toEqual(["runs", "run"]);
  });

  test("closing pages reuse cover image; closing_text has title and plain text (no exercises)", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage("/cover.webp");
    const pages = toPreviewPages("course-1", draft, [], plan, defaultPresentation, "ready", coverImg);

    const closingImg = pages.find((p) => p.type === "closing_image") as Extract<(typeof pages)[number], { type: "closing_image" }>;
    const closingText = pages.find((p) => p.type === "closing_text") as Extract<(typeof pages)[number], { type: "closing_text" }>;

    expect(closingImg.image.publicUrl).toBe("/cover.webp");
    expect(closingText.title).toBe("After the Story");
    const hasExercise = closingText.paragraphs.some((p) =>
      p.sentences.some((s) => s.segments.some((seg) => seg.type === "exercise")),
    );
    expect(hasExercise).toBe(false);
  });

  test("castAliases are applied in text segments (Student/Teacher suffix removed via displayName)", () => {
    const draft: LessonDraft = {
      ...makeDraft(),
      castAliases: [{ alias: "SummerStudent", displayName: "Summer" }],
      chapters: [
        {
          id: "ch1",
          sourceOutlineChapterIndex: 1,
          title: "Ch1",
          paragraphs: [
            {
              id: "p1",
              order: 1,
              sentences: [makeSentence("s1", "SummerStudent walked into the forest.")],
            },
          ],
          exercises: [],
        },
      ],
    };
    const plan = {
      ...makePlan(),
      shots: [
        {
          ...makePlan().shots[0],
          sourceParagraphId: "p1",
          chapterId: "ch1",
          shotId: "c1-s1",
        },
      ],
    };
    const coverImg = succeededImage();
    const pages = toPreviewPages("c1", draft, [{ slotId: "visual-cover", ...coverImg }, { slotId: "c1-s1", ...succeededImage() }], plan, defaultPresentation, "ready", coverImg);
    const shotText = pages.find((p) => p.type === "shot_text") as Extract<(typeof pages)[number], { type: "shot_text" }>;
    const textSegs = shotText.paragraphs[0].sentences[0].segments.filter((s) => s.type === "text") as Array<{ type: "text"; text: string }>;
    expect(textSegs[0].text).not.toContain("SummerStudent");
    expect(textSegs[0].text).toContain("Summer");
  });

  test("editable is true for draft/ready/build_failed, false for published", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();

    const draftPages = toPreviewPages("c1", draft, [], plan, defaultPresentation, "draft", coverImg);
    expect(draftPages.every((p) => p.editable)).toBe(true);

    const pubPages = toPreviewPages("c2", draft, [], plan, defaultPresentation, "published", coverImg);
    expect(pubPages.every((p) => !p.editable)).toBe(true);
  });

  test("returns default textBox style (opacity + fontSize) and merges slideOverrides", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();
    const pages = toPreviewPages("c1", draft, [], plan, defaultPresentation, "ready", coverImg);

    const shotText = pages.find((p) => p.type === "shot_text") as Extract<(typeof pages)[number], { type: "shot_text" }>;
    expect(shotText.textBox).toMatchObject({
      opacity: expect.any(Number),
      fontSize: expect.any(Number),
    });
    expect(shotText.textBox.fontSize).toBeCloseTo(1.0, 2);
  });

  test("applies textBox overrides from presentation (opacity and fontSize)", () => {
    const draft = makeDraft();
    const plan = makePlan();
    const coverImg = succeededImage();
    const pages = toPreviewPages("c1", draft, [], plan, {
      ...defaultPresentation,
      slideOverrides: {
        "ch1-shot-1-text": { textBox: { opacity: 0.6, fontSize: 1.2 } },
      },
    }, "ready", coverImg);
    const shotText = pages.find((p) => p.id === "ch1-shot-1-text") as Extract<(typeof pages)[number], { type: "shot_text" }>;
    expect(shotText.textBox.opacity).toBeCloseTo(0.6, 2);
    expect(shotText.textBox.fontSize).toBeCloseTo(1.2, 2);
  });
});
