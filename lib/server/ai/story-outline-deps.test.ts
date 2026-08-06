import { describe, expect, test, vi } from "vitest";

import { createStoryOutlineGenerationDeps } from "./story-outline-deps";

const generateOutlineMock = vi.fn<({ prompt }: { prompt: string }) => Promise<{ text: string }>>(async () => ({
  text: JSON.stringify({
    title: { zh: "海底图书馆", en: "The Ocean Library" },
    summary: { zh: "学生合作完成任务。", en: "Students work together." },
    narrativeType: "原创课堂冒险",
    characters: [],
    chapters: [
      {
        order: 1,
        title: { zh: "发光地图", en: "The Glowing Map" },
        whatHappens: "夏天发现发光地图，林老师引导大家确认任务，团队决定寻找失落书页。",
        characterActions: "",
        mainlineProgress: "",
        characterIds: [],
      },
    ],
  }),
}));

vi.mock("./story-outline-provider", () => ({
  createStoryOutlineProvider: () => ({
    generateOutline: generateOutlineMock,
    searchReference: vi.fn(),
  }),
}));

describe("createStoryOutlineGenerationDeps", () => {
  test("keeps story outline prompt focused on necessary roles and short Chinese chapter summaries", async () => {
    await createStoryOutlineGenerationDeps().generateOutline({
      course: { title: "海底图书馆", durationMinutes: 45 },
      message: "写一个冒险故事",
      references: [],
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      currentOutline: null,
    });

    const input = generateOutlineMock.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    const prompt = input!.prompt;
    expect(prompt).toContain("非必要不要引入新的原创角色");
    expect(prompt).toContain("避免增加会进入后续生图流程但不推动剧情的角色");
    expect(prompt).toContain("每章只保留一个中文剧情概述");
    expect(prompt).toContain("50字左右");
    expect(prompt).toContain("不要返回英文标题、英文概括或英文章节名");
  });
});
