import { afterEach, describe, expect, test, vi } from "vitest";

import type { CourseBasicDetail, PersonProfile, StoryOption } from "@/lib/contracts/api";

import { buildDeepSeekRequestBody, buildLessonContentPrompt, generateLessonDraft } from "./lesson-draft-generator";
import type { AiLessonContentPlan } from "./lesson-content-compiler";
import { renderChapterAnswerList, renderChapterReadingText } from "./lesson-content-compiler";
import { validateLessonDraft } from "../repositories/lesson-drafts";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Moonlight Scroll Lesson",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "A1",
  durationMinutes: 45,
  theme: "唐代诗歌博物馆",
  grammar: ["Past Simple", "There be"],
  storyIdeaMode: "manual",
  storyIdea: "老师和学生在博物馆遇见李白，一起找回月光诗卷。",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "Ms. PAN",
  appearance: "warm teacher with a secret mission connected to an old poem",
  interests: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "You",
  chineseName: "尤",
  englishName: "You",
  age: 8,
  gender: "female",
  appearance: "thoughtful student who notices small visual clues",
  interests: ["poetry", "drawing", "moon stories"],
  learningGoal: "practice describing what happened in a story",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "月光诗卷",
  storyline: "老师和学生在唐代诗歌博物馆遇见李白，沿着月光线索找回缺失诗句，让诗卷重新亮起。",
  chapters: [
    { title: "诗卷变暗", summary: "大家发现博物馆里的月光诗卷突然失去光亮。" },
  ],
};

const context = { course, teacher, students: [student], storyOption };

const aiPlan: AiLessonContentPlan = {
  title: "The Moonlight Scroll",
  chapters: [
    {
      title: "The Scroll Goes Dark",
      paragraphs: [
        {
          sentences: [
            "MsPANTeacher and YouStudent visited the Tang Dynasty Poetry Museum.",
            "There was a faint silver line under the moon mark.",
            "YouStudent saw a small clue on the glass case.",
          ],
        },
        {
          sentences: [
            "Ms. PAN felt that an exciting adventure was waiting for them.",
            "The Moonlight Scroll stayed dark on the wall.",
            "YouStudent followed the silver line with Ms. PAN.",
          ],
        },
      ],
      exercises: [
        { type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "visited", prompt: "visit", baseWord: "visit" },
        { type: "given_word_blank", targetCategory: "grammar", target: "There be", sentenceId: "c1p1s2", answer: "There was", prompt: "there / be", baseWord: "be" },
        { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s3", answer: "clue", hint: "线索" },
        { type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p2s1", answer: "felt", prompt: "feel", baseWord: "feel" },
      ],
    },
  ],
  closingReading: {
    title: "The Light Returns",
    sentences: ["YouStudent remembered the moonlight clue.", "She helped the old scroll shine again."],
  },
};

function deepSeekResponse(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lesson content prompt", () => {
  test("asks for clean sentences and exercise anchors without image fields", () => {
    const prompt = buildLessonContentPrompt(context);

    expect(prompt).toContain("Level: A1 (CEFR / Cambridge English)");
    expect(prompt).toContain("Storyline: 老师和学生在唐代诗歌博物馆遇见李白");
    expect(prompt).toContain("Teacher: MsPANTeacher");
    expect(prompt).toContain("nameToUseInStory: YouStudent");
    expect(prompt).not.toContain("nameToUseInStory: You\n");
    expect(prompt).toContain("Do not write \"(1)\", \"________\", \"[V1]\"");
    expect(prompt).toContain("exercise anchors");
    expect(prompt).toContain("answers must be text-disjoint");
    expect(prompt).toContain('"are invading" + "invading"');
    expect(prompt).toContain("Do not use vocab_hint for a word that is inside a given_word_blank, choice_blank, or phrase_hint answer in the same sentence");
    expect(prompt).toContain("Use choice_blank sparingly, mainly for Modals or clear meaning-based choices");
    expect(prompt).toContain("Do not use choice_blank for ordinary verb tense changes if given_word_blank works better");
    expect(prompt).toContain("Before final output, check every choice_blank");
    expect(prompt).toContain("No image or lesson-plan fields");
    expect(prompt).not.toContain("visualStyle");
    expect(prompt).not.toContain("shots");
    expect(prompt).not.toContain("scenePrompt");
  });
});

describe("lesson draft DeepSeek request", () => {
  test("uses thinking mode with bounded output for content generation", () => {
    const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate content." }], 45);

    expect(body).toMatchObject({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      max_tokens: 16000,
    });
  });

  test("raises max_tokens for 60-minute content", () => {
    const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate content." }], 60);

    expect(body.max_tokens).toBe(20000);
  });
});

describe("lesson draft generation", () => {
  test("generates lesson_content_v1 and renders embedded exercise text", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => deepSeekResponse(aiPlan));
    vi.stubGlobal("fetch", fetchMock);

    const draft = await generateLessonDraft(context);

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.schemaVersion).toBe("lesson_content_v1");
    expect(draft.castAliases).toEqual([
      { alias: "MsPANTeacher", displayName: "Ms. PAN" },
      { alias: "YouStudent", displayName: "You" },
    ]);
    expect(draft.chapters[0].paragraphs[0].sentences[0].segments).toContainEqual({ type: "exercise", exerciseId: "chapter-1-exercise-1" });
    expect(renderChapterReadingText(draft.chapters[0])).toContain("MsPANTeacher and YouStudent (1) ________ (visit) the Tang Dynasty Poetry Museum.");
    expect(renderChapterAnswerList(draft.chapters[0])).toEqual(["1. visited", "2. There was", "3. clue", "4. felt"]);
  });

  test("logs raw AI output on validation failure without exposing raw output in the thrown message", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const badPlan = {
      ...aiPlan,
      chapters: [
        {
          ...aiPlan.chapters[0],
          exercises: [{ type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "missing", prompt: "miss", baseWord: "miss" }],
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => deepSeekResponse(badPlan)));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(generateLessonDraft(context)).rejects.toThrow('answer "missing" found 0 times');
    expect(errorSpy).toHaveBeenCalledWith(
      "Lesson draft AI output failed validation",
      expect.objectContaining({ rawContent: JSON.stringify(badPlan) }),
    );
  });
});
