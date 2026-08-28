import { describe, expect, it } from "vitest";

import { storyOutlineMessageSchema, storyOutlineSaveSchema, storyOutlineSettingsSchema } from "@/lib/server/validation/story-outline";

const settings = { chapterCount: 3, writingProvider: "quickrouter_gpt", storyComplexity: "clear_linear" } as const;

describe("story outline chapter bounds", () => {
  it("accepts only three to five chapters for new settings and messages", () => {
    expect(storyOutlineSettingsSchema.safeParse(settings).success).toBe(true);
    expect(storyOutlineSettingsSchema.safeParse({ ...settings, chapterCount: 5 }).success).toBe(true);
    expect(storyOutlineSettingsSchema.safeParse({ ...settings, chapterCount: 2 }).success).toBe(false);
    expect(storyOutlineSettingsSchema.safeParse({ ...settings, chapterCount: 6 }).success).toBe(false);
    expect(storyOutlineMessageSchema.safeParse({ message: "test", mode: "idea", chapterCount: 2 }).success).toBe(false);
  });

  it("requires a newly saved outline to contain exactly its declared three-to-five chapters", () => {
    const chapter = { order: 1, title: "一", storyGoal: "推进", keyEvents: ["行动"], characterIds: [], setting: "教室", endingHook: "继续" };
    const outline = {
      chapterCount: 3,
      title: "故事",
      summary: "概要",
      writingProvider: "quickrouter_gpt",
      sourceReferences: [],
      characters: [],
      chapters: [chapter, { ...chapter, order: 2 }, { ...chapter, order: 3 }],
    };
    expect(storyOutlineSaveSchema.safeParse({ outline }).success).toBe(true);
    expect(storyOutlineSaveSchema.safeParse({ outline: { ...outline, chapters: outline.chapters.slice(0, 2) } }).success).toBe(false);
  });
});
