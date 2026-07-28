import { describe, expect, test } from "vitest";

import type { CourseBasicDetail, PersonProfile } from "@/lib/contracts/api";

import { buildLessonChatSystemPrompt } from "./lesson-chat-generator";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Mind Mirror",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "B1",
  durationMinutes: 45,
  grammar: ["Present Perfect", "Past Simple"],
  llmModel: "deepseek_chat",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "ZiXuan",
  englishName: "ZiXuan",
  gender: "female",
  interests: [],
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "Alex",
  englishName: "Alex",
  age: 10,
  gender: "male",
  interests: [],
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

describe("lesson chat prompt", () => {
  test("requires inline exercise placement and proportional question budgets", () => {
    const prompt = buildLessonChatSystemPrompt({
      course,
      teacher,
      students: [student],
    });

    expect(prompt).toContain("Question distribution by stage");
    expect(prompt).toContain("Grammar/choice questions");
    expect(prompt).toContain(
      "Use every vocabulary label and phrase label exactly once",
    );
    expect(prompt).toContain("rotate targets evenly");
    expect(prompt).toContain(
      "the exercise token must occupy the exact word position inside the sentence",
    );
    expect(prompt).toContain(
      "You (3) ________ (ask) (提示：现在完成时) a question",
    );
    expect(prompt).toContain(
      "Never append a blank, base word, hint, vocab token, or phrase token after the sentence punctuation",
    );
    expect(prompt).toContain(
      "Each stage Reading must contain 120-160 English words",
    );
    expect(prompt).toContain("Aim for 130-145 words");
  });
});
