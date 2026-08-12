import { describe, expect, test } from "vitest";

import { buildCourseVisualPlanPrompt, compileCourseImagePrompt, parseCourseVisualPlan } from "./course-visual-plan-deps";

const input = {
  course: { title: "The Clockwork Garden", englishLevel: "A2" },
  outline: {
    title: "The Clockwork Garden",
    summary: "Mia and Ms Lin repair a garden clock before sunset.",
    chapters: [{ id: "chapter-1", order: 1, title: "The Broken Clock", setting: "a brass garden at sunset" }],
  },
  characters: [
    { id: "mia", displayName: "Mia", sourceType: "person", roleInStory: "student explorer", shortDescription: "curious and careful", visualDescription: "eight-year-old girl" },
    { id: "lin", displayName: "Ms Lin", sourceType: "referenced", roleInStory: "teacher guide", shortDescription: "calm mentor", visualDescription: "adult teacher" },
  ],
  paragraphs: [{ id: "paragraph-1", chapterId: "chapter-1", text: "Mia holds the loose brass gear while Ms Lin points to the clock." }],
};

describe("Step 5 视觉资源方案", () => {
  test("要求模型只把参考图用于身份外形，并统一生成故事服装设定", () => {
    const prompt = buildCourseVisualPlanPrompt(input);
    expect(prompt).toContain("Return all creative fields in English");
    expect(prompt).toContain("identity appearance only");
    expect(prompt).toContain("Do not copy clothing, accessories, pose, background, photography style, or composition");
    expect(prompt).toContain("one stable storyVisualDesign per character");
  });

  test("把同一份角色造型锁定文本原样注入封面和插图 Prompt", () => {
    const plan = parseCourseVisualPlan({
      visualStyle: "Warm hand-drawn watercolor picture-book art with expressive ink lines.",
      storyWorld: "A coherent brass garden world at golden-hour sunset.",
      characterDesigns: [
        { characterId: "mia", storyVisualDesign: "Mia wears a navy explorer jacket, coral scarf, tan shorts, and brown boots in every scene." },
        { characterId: "lin", storyVisualDesign: "Ms Lin wears a moss-green field coat, cream shirt, and practical dark trousers in every scene." },
      ],
      cover: { focus: "Mia raises the repaired gear before the glowing clock.", characterIds: ["mia", "lin"], scenePrompt: "Wide story-poster composition in the garden." },
      shots: [{ paragraphId: "paragraph-1", focus: "Repairing the clock", characterIds: ["mia", "lin"], scenePrompt: "Mia holds the gear while Ms Lin points to the mechanism." }],
    }, input);

    const coverPrompt = compileCourseImagePrompt(plan, plan.cover);
    const shotPrompt = compileCourseImagePrompt(plan, plan.shots[0]);
    for (const prompt of [coverPrompt, shotPrompt]) {
      expect(prompt).toContain("Mia wears a navy explorer jacket, coral scarf, tan shorts, and brown boots in every scene.");
      expect(prompt).toContain("Ms Lin wears a moss-green field coat, cream shirt, and practical dark trousers in every scene.");
      expect(prompt).toContain("Horizontal 16:9");
      expect(prompt).toContain("Ignore all clothing, pose, background, photography style, and composition from attached identity references");
      expect(prompt).toContain("not a portrait, profile photo, character sheet, or full-body lineup");
    }
  });

  test("拒绝遗漏正文段落或使用未知角色的资源方案", () => {
    expect(() => parseCourseVisualPlan({
      visualStyle: "watercolor",
      storyWorld: "garden",
      characterDesigns: [{ characterId: "mia", storyVisualDesign: "navy jacket" }],
      cover: { focus: "clock", characterIds: ["unknown"], scenePrompt: "wide garden" },
      shots: [],
    }, input)).toThrow();
  });
});
