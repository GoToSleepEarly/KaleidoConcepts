import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CourseBasicDetail,
  PersonProfile,
  StoryOption,
} from "@/lib/contracts/api";
import {
  buildLessonContentPrompt,
  countEnglishWords,
  generateLessonDraft,
  parseLessonContentPlan,
} from "./lesson-draft-generator";
import type { AiLessonContentPlan } from "./lesson-content-compiler";
import { renderChapterReadingText } from "./lesson-content-compiler";

const baseCourse = {
  id: "course-1",
  title: "Moonlight",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "A1" as const,
  durationMinutes: 45 as const,
  theme: "唐代诗歌博物馆",
  grammar: ["Past Simple", "There be", "Modals"],
  storyIdeaMode: "manual" as const,
  storyIdea: "找回诗卷",
  status: "draft" as const,
};
const deepseekCourse: CourseBasicDetail = { ...baseCourse, llmModel: "deepseek_chat" };
const gpt55Course: CourseBasicDetail = { ...baseCourse, llmModel: "gpt_5_5" };
const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "Ms. PAN",
  appearance: "warm teacher",
  interests: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};
const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "You",
  englishName: "You",
  interests: ["poetry"],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};
const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "月光诗卷",
  storyline: "老师和学生找回诗卷。",
  chapters: [{ title: "诗卷变暗", summary: "诗卷失去光亮。" }],
};
const deepseekContext = { course: deepseekCourse, teacher, students: [student], storyOption };
const gpt55Context = { course: gpt55Course, teacher, students: [student], storyOption };
const chapterExpansion = Array.from({ length: 75 }, () => "carefully").join(
  " ",
);

const aiPlan: AiLessonContentPlan = {
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
                { type: "text", text: "YouStudent found a " },
                {
                  type: "vocab_hint",
                  answer: "clue",
                  hint: "线索",
                },
                { type: "text", text: "." },
              ],
            },
            {
              parts: [
                { type: "text", text: "The old map " },
                {
                  type: "given_word_blank",
                  answer: "glowed",
                  target: "Past Simple",
                  prompt: "glow",
                  baseWord: "glow",
                },
                { type: "text", text: " softly." },
              ],
            },
            { parts: [{ type: "text", text: "A quiet bell rang nearby." }] },
          ],
        },
        {
          sentences: [
            {
              parts: [
                { type: "text", text: "They " },
                {
                  type: "given_word_blank",
                  answer: "must",
                  target: "Modals",
                  prompt: "must",
                  baseWord: "must",
                },
                { type: "text", text: " follow the light." },
              ],
            },
            {
              parts: [
                { type: "text", text: "They did not " },
                {
                  type: "phrase_hint",
                  answer: "give up",
                  hint: "放弃",
                },
                { type: "text", text: "." },
              ],
            },
            {
              parts: [
                { type: "text", text: "The moon " },
                {
                  type: "given_word_blank",
                  answer: "returned",
                  target: "Past Simple",
                  prompt: "return",
                  baseWord: "return",
                },
                { type: "text", text: "." },
              ],
            },
            {
              parts: [
                { type: "text", text: "The children smiled at the scroll." },
              ],
            },
            {
              parts: [
                {
                  type: "text",
                  text: `Warm light filled the room while everyone worked ${chapterExpansion}.`,
                },
              ],
            },
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

function quickRouterResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      output: [
        {
          content: [
            {
              text: JSON.stringify(content),
              type: "output_text",
            },
          ],
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function deepSeekResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(content) },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lesson content prompt", () => {
  test("defines one exercise part as the source of clean text and forbids anchors", () => {
    const prompt = buildLessonContentPrompt(deepseekContext);
    expect(prompt).toContain("Level: A1");
    expect(prompt).toContain(
      "Code will concatenate text.text and exercise.answer",
    );
    expect(prompt).toContain("Use at most one exercise part in each sentence");
    expect(prompt).toContain("CRITICAL WORD COUNT: Each chapter MUST contain 120-160 English words");
    expect(prompt).toContain("CRITICAL TARGET COVERAGE: You MUST use every required learning target");
    expect(prompt).toContain(
      "exactly 6 given_word_blank, exactly 1 vocab_hint, and exactly 1 phrase_hint",
    );
    expect(prompt).toContain(
      "Closing Reading must be a coherent concluding reading of about 150 English words",
    );
    expect(prompt).toContain("Choose one dominant narrative tense");
    expect(prompt).toContain(
      "Never switch narrative tense only to create an exercise",
    );
    expect(prompt).toContain("Do not output sentenceId");
    expect(prompt).not.toContain('"sentenceId"');
    expect(prompt).not.toContain("visualStyle");
  });
});

describe("lesson content schema", () => {
  test("returns a precise path for invalid sentence parts", () => {
    const invalid = structuredClone(aiPlan) as unknown as {
      chapters: Array<{
        paragraphs: Array<{ sentences: Array<{ parts: unknown[] }> }>;
      }>;
    };
    invalid.chapters[0].paragraphs[0].sentences[0].parts[1] = {
      type: "given_word_blank",
      answer: "opened",
    };
    expect(() => parseLessonContentPlan(invalid)).toThrow(
      "chapters.0.paragraphs.0.sentences.0.parts.1.target",
    );
  });
});

describe("lesson draft generation", () => {
  test("generates clean text and embedded exercises via DeepSeek (default)", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => deepSeekResponse(aiPlan)),
    );
    const draft = await generateLessonDraft(deepseekContext);
    expect(draft.chapters[0].paragraphs[0].sentences[0].text).toBe(
      "MsPANTeacher and YouStudent visited the museum.",
    );
    expect(renderChapterReadingText(draft.chapters[0])).toContain(
      "(1) ________ (visit)",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("uses GPT-5.5 via QuickRouter when selected", async () => {
    vi.stubEnv("QUICKROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => quickRouterResponse(aiPlan)),
    );
    const draft = await generateLessonDraft(gpt55Context);
    expect(draft.chapters[0].paragraphs[0].sentences[0].text).toBe(
      "MsPANTeacher and YouStudent visited the museum.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("enables DeepSeek thinking by default for stability", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => deepSeekResponse(aiPlan));
    vi.stubGlobal("fetch", fetchMock);
    await generateLessonDraft(deepseekContext);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(init.body);
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.max_tokens).toBe(48000);
  });

  test("enables GPT-5.5 reasoning by default for stability", async () => {
    vi.stubEnv("QUICKROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => quickRouterResponse(aiPlan));
    vi.stubGlobal("fetch", fetchMock);
    await generateLessonDraft(gpt55Context);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const body = JSON.parse(init.body);
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.max_output_tokens).toBe(32000);
  });

  test("logs raw output when compiler validation fails", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const invalid = structuredClone(aiPlan);
    invalid.chapters[0].paragraphs[0].sentences[0].parts.splice(2, 0, {
      type: "vocab_hint",
      answer: "museum",
      hint: "博物馆",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => deepSeekResponse(invalid)),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(generateLessonDraft(deepseekContext)).rejects.toThrow(
      "has 2 exercise parts; max 1",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Lesson draft AI output failed validation",
      expect.objectContaining({ rawContent: JSON.stringify(invalid) }),
    );
  });

  test("rejects only a chapter that is extremely outside the 120-160 word target", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const shortPlan = structuredClone(aiPlan);
    shortPlan.chapters[0].paragraphs[1].sentences[4] = {
      parts: [{ type: "text", text: "Warm light filled the room." }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => deepSeekResponse(shortPlan)),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(generateLessonDraft(deepseekContext)).rejects.toThrow(
      "课文明显偏离 120-160 词目标",
    );
  });

  test("accepts a near-target 117-word chapter", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const nearTarget = structuredClone(aiPlan);
    const chapter = nearTarget.chapters[0];
    const currentText = chapter.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .flatMap((sentence) => sentence.parts)
      .map((part) => (part.type === "text" ? part.text : part.answer))
      .join(" ");
    const excess = countEnglishWords(currentText) - 117;
    const finalPart = chapter.paragraphs[1].sentences[4].parts[0];
    if (finalPart.type !== "text" || excess < 1)
      throw new Error("test fixture must exceed 117 words");
    finalPart.text = finalPart.text
      .split(/\s+/)
      .slice(0, Math.max(1, finalPart.text.split(/\s+/).length - excess))
      .join(" ");
    const adjustedText = chapter.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .flatMap((sentence) => sentence.parts)
      .map((part) => (part.type === "text" ? part.text : part.answer))
      .join(" ");
    expect(countEnglishWords(adjustedText)).toBe(117);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => deepSeekResponse(nearTarget)),
    );
    await expect(generateLessonDraft(deepseekContext)).resolves.toMatchObject({
      schemaVersion: "lesson_content_v1",
    });
  });

  test("reports malformed JSON as a retryable validation error", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ finish_reason: "stop", message: { content: "{bad json" } }],
            }),
            { status: 200 },
          ),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(generateLessonDraft(deepseekContext)).rejects.toThrow(
      "AI 返回的 JSON 无法解析，请重试生成",
    );
  });
});
