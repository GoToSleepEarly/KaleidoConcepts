import { describe, expect, test } from "vitest";

import type { CourseBasicDetail, PersonProfile } from "@/lib/contracts/api";

import {
  collectLessonChatDraftFormatIssues,
  structureLessonChatDraft,
} from "./lesson-chat-structure";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Mask Lesson",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "B1",
  durationMinutes: 30,
  grammar: ["Past Simple"],
  llmModel: "deepseek_chat",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "Teacher Zixuan",
  gender: "female",
  appearance: "warm teacher with round glasses",
  interests: [],
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "Sophia",
  englishName: "Sophia",
  age: 10,
  gender: "female",
  appearance: "curious student with short black hair",
  interests: [],
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

const draftText = `【Lesson Draft】
Story Title: Boys Behind Masks
Hello class! Teacher Zixuan brings Sophia into a story about courage and honest choices.

【Lesson Meta】
Level: B1
Question Count: 6
Vocabulary: V1-V3
Phrases: P1-P1

【Stage 1】
Title: 面具下的少年
English Title: Boys Behind Masks
Teacher Tip: 过去式。
【Reading】
S1: He Zhao wore a clever (1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)].
S2: Xie Yu looked (2) [V2: d _ _ _ _ _ t (提示：疏离的，7个字母)].

【Stage 2】
Title: 匿名对手
English Title: Anonymous Rivals
Teacher Tip: 定语从句。
【Reading】
S1: Sophia saw a boy (3) ________ (who / which) solved problems quickly.
S2: They learned to (4) [P1: s _ _ _ d b _ (提示：支持，5+2个字母)] each other.

【Stage 3】
Title: 并肩发光
English Title: Standing Together
Teacher Tip: 过去式。
【Reading】
S1: Teacher Zixuan said the truth was (5) [V3: r _ _ _ _ _ _ d (提示：揭露，8个字母)].
S2: Sophia realized that courage (6) ________ (grow) slowly.

【Closing Reading】
S1: He Zhao and Xie Yu hid their talents, but friendship helped them become honest.
S2: Sophia learned that real courage means becoming yourself.

【教师答案区 / Answer Key】
1. disguise
2. distant
3. who
4. stand by
5. revealed
6. grew
V1 = disguise
V2 = distant
V3 = revealed
P1 = stand by`;

describe("lesson chat structure", () => {
  test("structures clean final lesson text without intent or visual bible fields", async () => {
    const { storyOption, draft } = await structureLessonChatDraft(
      { course, teacher, students: [student] },
      draftText,
    );

    expect(storyOption.title).toBe("Boys Behind Masks");
    expect(draft.title).toBe("Boys Behind Masks");
    expect(draft.chapters).toHaveLength(3);
    expect(draft.chapters[0].exercises).toHaveLength(2);
    expect(
      draft.castAliases.some((alias) => alias.displayName === "Sophia"),
    ).toBe(true);
  });

  test("blocks final text that has no answer key", async () => {
    await expect(
      structureLessonChatDraft(
        { course, teacher, students: [student] },
        draftText.replace(/【教师答案区 \/ Answer Key】[\s\S]+$/, ""),
      ),
    ).rejects.toThrow("缺少【教师答案区 / Answer Key】");
  });

  test("collects one S line that contains multiple embedded questions", () => {
    const multiQuestionLineText = draftText.replace(
      "S1: He Zhao wore a clever (1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)].\nS2: Xie Yu looked (2) [V2: d _ _ _ _ _ t (提示：疏离的，7个字母)].",
      "S1: He Zhao wore a clever (1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)], and Xie Yu looked (2) [V2: d _ _ _ _ _ t (提示：疏离的，7个字母)].",
    );

    const issues = collectLessonChatDraftFormatIssues(multiQuestionLineText);

    expect(issues).toEqual([
      expect.objectContaining({
        code: "multiple_questions_in_s_line",
        lineNumber: 16,
        questionNumbers: [1, 2],
      }),
    ]);
  });

  test("collects an answer that appears twice in its sentence", async () => {
    const repeatedAnswerText = draftText.replace(
      "S1: He Zhao wore a clever (1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)].",
      "S1: He Zhao wore a clever (1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)] disguise.",
    );

    const issues = collectLessonChatDraftFormatIssues(repeatedAnswerText);

    expect(issues).toEqual([
      expect.objectContaining({
        code: "answer_occurs_multiple_times",
        lineNumber: 16,
        questionNumbers: [1],
      }),
    ]);
    await expect(
      structureLessonChatDraft(
        { course, teacher, students: [student] },
        repeatedAnswerText,
      ),
    ).rejects.toThrow("答案“disguise”在所在句子中出现 2 次");
  });
});
