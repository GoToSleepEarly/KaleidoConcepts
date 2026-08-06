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
const searchReferenceMock = vi.fn<({ prompt }: { prompt: string }) => Promise<{ text: string }>>();

vi.mock("./story-outline-provider", () => ({
  createStoryOutlineProvider: () => ({
    generateOutline: generateOutlineMock,
    searchReference: searchReferenceMock,
  }),
}));

describe("createStoryOutlineGenerationDeps", () => {
  test("keeps story outline prompt focused on necessary roles and short Chinese chapter summaries", async () => {
    await createStoryOutlineGenerationDeps().generateOutline({
      task: "根据当前要求生成故事大纲。",
      references: [],
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      coursePeople: [{ role: "student", chineseName: "夏天", englishName: "Summer", age: 10, gender: "female" }],
      conversationHistory: [
        { role: "teacher", content: "我的故事想法：参考《瓦罗兰特》的 Jett 和 Sage，结合学生生成一个冒险故事。" },
        { role: "assistant", content: "我们先确认故事主线。" },
      ],
      selectedDirection: null,
      currentOutline: null,
    });

    const input = generateOutlineMock.mock.calls.at(-1)?.[0];
    expect(input).toBeDefined();
    const prompt = input!.prompt;
    expect(prompt).toContain("AI 自行新增的原创角色最多 1 个");
    expect(prompt).toContain("每个角色都必须服务核心冲突");
    expect(prompt).toContain("每章只在 whatHappens 中写");
    expect(prompt).toContain("约 50 字");
    expect(prompt).toContain("不要返回英文或中英双语");
    expect(prompt).toContain("老师点名且要求出场的每个角色");
    expect(prompt).toContain("学生与老师不得自动进入 characters 或正文");
    expect(prompt).toContain("characters 是后续视觉资产名单");
    expect(prompt).toContain("机构、公司、团队、部门、监管方和其他背景群体不得进入 characters");
    expect(prompt).toContain("外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced");
    expect(prompt).toContain("所有面向老师展示的自然语言字段都只返回中文");
    expect(prompt).toContain("只负责生成可确认的故事大纲");
    expect(prompt).toContain("Jett 和 Sage");
    expect(prompt).toContain("夏天");
    expect(prompt).toContain("指定章节数：4");
    expect(prompt).not.toContain("课程：海底图书馆");
    expect(prompt).not.toContain("时长：45");
  });

  test("passes people, chapter count and conversation history into random direction generation", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: "[]" });

    await createStoryOutlineGenerationDeps().generateDirections({
      task: "请生成 3 个故事方向。",
      chapterCount: 4,
      coursePeople: [{ role: "teacher", chineseName: "林老师", englishName: "Ms. Lin", age: 32, gender: "female" }],
      conversationHistory: [{ role: "teacher", content: "主题：太空学校" }],
      references: [],
      selectedDirection: null,
      currentOutline: null,
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("指定章节数：4");
    expect(prompt).toContain("林老师");
    expect(prompt).toContain("主题：太空学校");
    expect(prompt).toContain("所有字段内容都只返回中文");
    expect(prompt.match(/所有字段内容都只返回中文/g)).toHaveLength(1);
    expect(prompt).toContain("只设计可供老师选择的故事走向");
    expect(prompt).toContain("mainCharacters 只列具体且需要保持视觉一致性的角色");
    expect(prompt).toContain("机构、团队和背景群体只能写进 hook 或 seedPrompt");
    expect(prompt).toContain("Step 1 人物快照描述的是课程参与者，不等于故事角色");
  });

  test("parses a fenced reference response and fills safe array defaults", async () => {
    searchReferenceMock.mockResolvedValueOnce({
      text: "以下是整理结果：\n```json\n[{\"name\":\"Jett\",\"type\":\"game_character\",\"sourceStatus\":\"confirmed\",\"summary\":\"来自《瓦罗兰特》的角色。\",\"adaptationBoundary\":\"保留核心能力设定。\"}]\n```",
    });

    const references = await createStoryOutlineGenerationDeps().searchReference({
      task: "整理参考资料",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [{ role: "teacher", content: "参考 Jett 生成冒险故事" }],
      references: [],
      selectedDirection: null,
      currentOutline: null,
      researchPlan: {
        researchGoal: "补足角色设定",
        packets: [{ title: "Jett", subjects: [{ name: "Jett" }], researchQuestions: ["能力和动机是什么？"], storyUseGoals: ["让角色参与冒险"] }],
      },
    });

    expect(references[0]).toMatchObject({
      name: "Jett",
      usableFacts: [],
      avoidTopics: [],
    });
    const prompt = searchReferenceMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("不要只做对象简介");
    expect(prompt).toContain("能力和动机是什么？");
    expect(prompt).toContain("让角色参与冒险");
    expect(prompt).toContain("只做资料研究");
    expect(prompt).toContain("无法确认完整且准确的核心信息、来源相互冲突");
    expect(prompt).toContain("必须返回 insufficient");
    expect(prompt).toContain("多个独立可靠来源相互印证");
  });

  test("does not treat a search result with no explicit status as confirmed", async () => {
    searchReferenceMock.mockResolvedValueOnce({
      text: JSON.stringify([{ name: "冷门作品", type: "ip", summary: "只有零散信息。", usableFacts: [] }]),
    });

    const references = await createStoryOutlineGenerationDeps().searchReference({
      task: "整理参考资料",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentOutline: null,
      researchPlan: {
        researchGoal: "确认完整剧情",
        packets: [{ title: "冷门作品", subjects: [{ name: "冷门作品" }], researchQuestions: ["完整主线是什么？"], storyUseGoals: ["忠实讲述原剧情"] }],
      },
    });

    expect(references[0].sourceStatus).toBe("insufficient");
  });

  test("routes known background knowledge to reference preparation without requesting internet", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: "prepare_reference_material",
        assistantMessage: "我会先整理可用于故事的角色设定。",
        referenceName: "Jett 与 Sage",
        researchPlan: {
          researchGoal: "设计两人共同参与的冒险",
          packets: [{
            title: "Jett 与 Sage 的共同设定",
            subjects: [{ name: "Jett", context: "《瓦罗兰特》" }, { name: "Sage", context: "《瓦罗兰特》" }],
            researchQuestions: ["两人的能力如何互补？"],
            storyUseGoals: ["形成合作冲突与解决方式"],
          }],
        },
      }),
    });

    const decision = await createStoryOutlineGenerationDeps().decideFreeInput({
      task: "判断下一步。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [{ role: "teacher", content: "参考 Jett 和 Sage 生成冒险故事" }],
      references: [],
      selectedDirection: null,
      currentOutline: null,
    });

    expect(decision.researchPlan?.packets[0]).toMatchObject({
      title: "Jett 与 Sage 的共同设定",
      subjects: [{ name: "Jett", context: "《瓦罗兰特》" }, { name: "Sage", context: "《瓦罗兰特》" }],
    });
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("不要套用固定知识分类");
    expect(prompt).toContain("同一作品且需要共同参与故事");
    expect(prompt).toContain("只判断流程下一步");
    expect(prompt).not.toContain("任务、旅程、挑战");
    expect(prompt).toContain("只有老师已经明确给出主角目标、核心冲突和关键推进方式");
    expect(prompt).toContain("展示参考资料与是否联网是两个独立判断");
    expect(prompt).toContain("自身已有可靠、稳定知识时返回 prepare_reference_material");
    expect(prompt).toContain("自身知识不足时才返回 request_reference_material");
    expect(prompt).toContain("现有资料已经覆盖本轮所需背景时");
    expect(prompt).toContain("只有确认参考资料后");
    expect(prompt).toContain("ask_story_usage");
  });

  test("recognizes a complete source story only after references are available", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: "ask_story_usage",
        assistantMessage: "资料中包含完整原剧情。你希望怎么讲这个故事？",
      }),
    });

    const decision = await createStoryOutlineGenerationDeps().decideFreeInput({
      task: "确认资料后判断下一步。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [{ role: "teacher", content: "我确认参考资料，请继续。" }],
      references: [{ name: "某网络小说", summary: "包含开端、转折、高潮和结局。" }],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(decision.decision).toBe("ask_story_usage");
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("按原剧情讲");
    expect(prompt).toContain("学生默认只是课程学习者");
  });

  test("generates teacher-facing reference cards from reliable model knowledge", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify([{
        name: "Jett 与 Sage 的共同设定",
        type: "game_character",
        sourceStatus: "confirmed",
        summary: "两位特工分别擅长机动突袭和防护支援。",
        usableFacts: ["Jett 擅长快速移动", "Sage 能保护和支援队友"],
        avoidTopics: [],
        adaptationBoundary: "保留标志性能力，但改编为适合课堂的非暴力冒险。",
      }]),
    });

    const references = await createStoryOutlineGenerationDeps().generateReferenceFromKnowledge({
      task: "整理模型已有知识。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [{ role: "teacher", content: "参考《瓦罗兰特》的 Jett 和 Sage 生成冒险故事" }],
      references: [],
      selectedDirection: null,
      currentOutline: null,
      researchPlan: {
        researchGoal: "整理两名角色可用于故事的共同设定",
        packets: [{
          title: "Jett 与 Sage 的共同设定",
          subjects: [{ name: "Jett", context: "《瓦罗兰特》" }, { name: "Sage", context: "《瓦罗兰特》" }],
          researchQuestions: ["两人的能力和合作关系是什么？"],
          storyUseGoals: ["设计合作冒险"],
        }],
      },
    });

    expect(references[0]).toMatchObject({
      name: "Jett 与 Sage 的共同设定",
      usableFacts: ["Jett 擅长快速移动", "Sage 能保护和支援队友"],
    });
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("只使用你自身已有且有把握的稳定知识");
    expect(prompt).toContain("不得联网");
    expect(prompt).toContain("不确定的细节不要编造");
    expect(prompt).toContain("两人的能力和合作关系是什么？");
  });

  test("normalizes an incomplete teacher supplied reference before persistence", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: "generate_outline",
        assistantMessage: "资料足够。",
        referenceName: "Sage",
        teacherReference: {
          type: "game_character",
          summary: "老师补充了 Sage 的治疗能力。",
        },
      }),
    });

    const decision = await createStoryOutlineGenerationDeps().decideFreeInput({
      task: "判断下一步。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [{ role: "teacher", content: "我补充资料：Sage 可以治疗队友。" }],
      references: [],
      selectedDirection: null,
      currentOutline: null,
    });

    expect(decision.teacherReference).toMatchObject({
      name: "Sage",
      usableFacts: [],
      avoidTopics: [],
    });
  });
});
