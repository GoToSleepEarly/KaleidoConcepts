import { describe, expect, test } from "vitest";

import type { CourseBasicDetail, PersonProfile } from "@/lib/contracts/api";

import { parseCharacterVisualBible, parseContentIntent, structureLessonChatDraft } from "./lesson-chat-structure";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Mask Lesson",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "B1",
  durationMinutes: 30,
  theme: "待在 Step2 确定",
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

const draftText = `【Content Intent】
Theme: 校园成长与自我认同
Story Mode: reference_story
Reference: 伪装学霸
Protagonists: 贺朝, 谢俞
Classroom Cast: Teacher Zixuan, Sophia

【Character Visual Bible】
贺朝：
身份：故事主角
形象状态：已补全
稳定特征：高中男生，外向明亮，清爽短发，常带笑意
可变状态：校服、后排座位、线上答题、考场
避免变化：不要变成成年人或阴郁气质

谢俞：
身份：故事主角
形象状态：已补全
稳定特征：高中男生，冷静疏离，干净短发，眼神锐利
可变状态：后排睡觉、冷静答题、被理解
避免变化：不要变成长发或热闹外向气质

【Lesson Draft】
Hello class! Teacher Zixuan 带着 Sophia 进入课堂。

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
Teacher Tip: 过去完成时。
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
  test("parses content intent and character visual bible from the text draft", () => {
    expect(parseContentIntent(draftText)).toMatchObject({
      theme: "校园成长与自我认同",
      storyMode: "reference_story",
      reference: "伪装学霸",
    });

    const profiles = parseCharacterVisualBible(draftText);
    expect(profiles).toHaveLength(2);
    expect(profiles[0]).toMatchObject({
      name: "贺朝",
      status: "complete",
      stableFeatures: "高中男生，外向明亮，清爽短发，常带笑意",
    });
  });

  test("stores character visual bible on the structured lesson draft", async () => {
    const { storyOption, draft } = await structureLessonChatDraft({ course, teacher, students: [student] }, draftText);

    expect(storyOption.title).toBe("校园成长与自我认同");
    expect(draft.characterVisualBible).toHaveLength(2);
    expect(draft.characterVisualBible?.[0].name).toBe("贺朝");
    expect(draft.castAliases.some((alias) => alias.displayName === "贺朝")).toBe(true);
  });

  test("blocks reference stories when third-party appearance is incomplete", async () => {
    await expect(
      structureLessonChatDraft(
        { course, teacher, students: [student] },
        draftText.replace("形象状态：已补全\n稳定特征：高中男生，冷静疏离，干净短发，眼神锐利", "形象状态：待补充\n稳定特征：待补充"),
      ),
    ).rejects.toThrow("第三方角色外观未补全");
  });
});
