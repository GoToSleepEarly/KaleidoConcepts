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
        recommendedKnowledgePointKeys: ["KP1"],
        knowledgePointRecommendationSummary: "用过去时描述发现地图的过程。",
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
  test("aligns only the broad creative intent without researching or demanding a complete plot", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        assistantMessage: "我已经理解你的大体需求，请确认。",
        resolvedUnderstanding: ["使用《小马宝莉：友谊就是魔法》的原作人物创作新故事"],
        unresolvedIssues: [],
        questions: [],
        summary: "使用暮光闪闪和云宝黛西创作新故事，具体主线将从 3 个候选方向中选择。",
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "参考《小马宝莉：友谊就是魔法》，使用暮光闪闪和云宝黛西创作。",
      chapterCount: 4,
      coursePeople: [{ personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 10, gender: "female" }],
      conversationHistory: [{ role: "teacher", content: "参考《小马宝莉：友谊就是魔法》，使用暮光闪闪和云宝黛西创作。" }],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result.status).toBe("ready_for_confirmation");
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("资深儿童故事策划编辑");
    expect(prompt).toContain("不是帮助老师补完整个故事");
    expect(prompt).toContain("后续系统会生成 3 个候选故事方向");
    expect(prompt).toContain("不查找或整理背景资料");
    expect(prompt).toContain("Step 1 中的老师和所有学生默认全部参与故事");
    expect(prompt).toContain("课堂人物的具体进入方式由故事剧情决定");
    expect(prompt).toContain("通常不提问");
    expect(prompt).toContain("每个问题都必须给出 2-3 个可直接选择的选项");
    expect(prompt).toContain("必须同时给出一项具体推荐及简短理由");
    expect(prompt).not.toContain("researchPlan");
    expect(prompt).toContain("暮光闪闪和云宝黛西");
    expect(prompt).toContain('"personId":"student-1"');
  });

  test("presents every ready creative brief as an understanding awaiting teacher confirmation", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        assistantMessage: "已整理完成。",
        resolvedUnderstanding: ["使用指定作品创作新故事"],
        unresolvedIssues: [],
        questions: [],
        summary: "已确认基于指定作品创作新的奇幻探险；老师和所有学生都会参与。当前不继续追问细节，下一步先提供3个候选故事方向供您选择。",
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "根据一部指定作品，创造一个奇幻探险故事。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result.summary).toBe("我理解你的创作需求是：基于指定作品创作新的奇幻探险；老师和所有学生都会参与。确认后，我会准备 3 个不同的故事方向；如需背景资料，会先整理必要内容。");
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("不使用“建议”“已确认”“已确定”等措辞");
    expect(prompt).toContain("明确说明该来源在故事中如何使用");
    expect(prompt).toContain("不得向老师播报“不继续追问”");
    expect(prompt).toContain("如需背景资料，会先整理必要内容");
    expect(prompt).toContain("follow_defined_plot");
  });

  test("does not append the normalized next step when the model already returned it", async () => {
    const nextStep = "确认后，我会准备 3 个不同的故事方向；如需背景资料，会先整理必要内容。";
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        assistantMessage: "请确认创作理解。",
        resolvedUnderstanding: ["使用《冰雪奇缘》创作新剧情"],
        unresolvedIssues: [],
        questions: [],
        summary: `建议按这个方向创作：使用《冰雪奇缘》的原作世界和核心角色创作全新奇幻探险。${nextStep}`,
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "根据《冰雪奇缘》，创造一个奇幻探险故事。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result.summary?.split(nextStep)).toHaveLength(2);
  });

  test("prepares background once from built-in knowledge before requesting external material", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready",
        references: [{
          name: "暮光闪闪与云宝黛西",
          type: "ip",
          sourceStatus: "confirmed",
          summary: "两位角色的核心特点和关系。",
          usableFacts: ["暮光闪闪重视知识", "云宝黛西行动果断"],
          avoidTopics: [],
          adaptationBoundary: "保留核心人物特点。",
        }],
      }),
    });

    const result = await createStoryOutlineGenerationDeps().prepareBackgroundKnowledge({
      task: "使用确认后的需求准备背景知识。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
      confirmedRequirement: "使用暮光闪闪和云宝黛西创作新故事。",
    });

    expect(result.status).toBe("ready");
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("儿童故事背景资料编辑");
    expect(prompt).toContain("优先使用你已有且有把握的知识");
    expect(prompt).toContain("只有当已有知识不足");
    expect(prompt).toContain("不实际执行联网搜索");
    expect(prompt).toContain("reason 会直接展示给老师");
    expect(prompt).toContain("最多整理 4 个原作候选角色");
    expect(prompt).toContain("候选角色不代表都会进入最终故事");
  });

  test("treats plot, antagonist, magic and classroom participation changes as local revisions", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({ scope: "within_target" }) });

    const result = await createStoryOutlineGenerationDeps().checkChangeBoundary({
      task: "老师和学生一起和主角用魔法打败邪恶怪兽",
      targetScope: "direction",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [{ id: "ref-frozen", name: "《冰雪奇缘》核心设定" }],
      selectedDirection: { title: "冰雪王国的新冒险" },
      currentDirections: [],
      currentOutline: null,
    });

    expect(result).toEqual({ scope: "within_target", needsBackgroundRefresh: false });
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("needsBackgroundRefresh");
    expect(prompt).toContain("反派、能力用法、地点、结局或师生参与方式");
  });

  test("labels a rerouted edit as a requirement change and explains background reuse", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        assistantMessage: "请确认修改后的创作理解。",
        resolvedUnderstanding: ["改为合作战斗故事"],
        unresolvedIssues: [],
        questions: [],
        summary: "老师和学生与当前主角合作，用魔法打败怪兽",
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "修改当前创作需求",
      replyContext: "requirement_change",
      needsBackgroundRefresh: false,
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [{ id: "ref-frozen", name: "《冰雪奇缘》核心设定" }],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result.summary).toBe("我理解你想将创作需求调整为：老师和学生与当前主角合作，用魔法打败怪兽。确认后，我会按新的创作需求继续，并沿用现有背景资料。");
    expect(result.summary).not.toContain("建议");
  });

  test("returns the background refresh decision with a changed requirement", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({ scope: "new_requirement", reason: "改为二战故事", needsBackgroundRefresh: true }),
    });

    const result = await createStoryOutlineGenerationDeps().checkChangeBoundary({
      task: "改成二战故事",
      targetScope: "outline",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result).toEqual({ scope: "new_requirement", reason: "改为二战故事", needsBackgroundRefresh: true });
  });

  test("keeps story outline prompt focused on necessary roles and short Chinese chapter summaries", async () => {
    const outline = await createStoryOutlineGenerationDeps().generateOutline({
      task: "根据当前要求生成故事大纲。",
      references: [],
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      coursePeople: [{ personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 10, gender: "female" }],
      conversationHistory: [
        { role: "teacher", content: "我的故事想法：参考《瓦罗兰特》的 Jett 和 Sage，结合学生生成一个冒险故事。" },
        { role: "assistant", content: "我们先确认故事主线。" },
      ],
      selectedDirection: null,
      currentOutline: null,
      englishLevel: "B1",
      durationMinutes: 45,
      selectedKnowledgePoints: [{ id: "grammar-1", label: "Past Simple", category: "时态" }],
    });

    const input = generateOutlineMock.mock.calls.at(-1)?.[0];
    expect(input).toBeDefined();
    const prompt = input!.prompt;
    expect(prompt).toContain("AI 自行新增的原创角色最多 1 个");
    expect(prompt).toContain("每个角色都必须服务核心冲突");
    expect(prompt).toContain("每章只在 whatHappens 中写");
    expect(prompt).toContain("约 50 字");
    expect(prompt).toContain("故事 title 和章节 title 返回中英文双语");
    expect(prompt).toContain("老师点名且要求出场的每个角色");
    expect(prompt).toContain("只保留已选故事方向实际使用的引用角色");
    expect(prompt).toContain("参考资料中的其他候选角色不得自动进入 characters");
    expect(prompt).toContain("老师和所有学生必须进入 characters 和正文");
    expect(prompt).toContain("观察者、采访者、讲述者或不改变因果的同行者");
    expect(prompt).toContain("characters 是后续视觉资产名单");
    expect(prompt).toContain("机构、公司、团队、部门、监管方和其他背景群体不得进入 characters");
    expect(prompt).toContain("外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced");
    expect(prompt).toContain("sourcePersonId 必须逐字复制对应人物快照的 personId");
    expect(prompt).toContain('"personId":"student-1"');
    expect(prompt).toContain("其余面向老师展示的自然语言字段只返回中文");
    expect(prompt).toContain("只负责生成可确认的故事大纲");
    expect(prompt).toContain("Jett 和 Sage");
    expect(prompt).toContain("夏天");
    expect(prompt).toContain("指定章节数：4");
    expect(prompt).toContain("英语难度：B1");
    expect(prompt).toContain("课程时长：45 分钟");
    expect(prompt).toContain('"key":"KP1"');
    expect(prompt).not.toContain('"id":"grammar-1"');
    expect(prompt).toContain("recommendedKnowledgePointKeys");
    expect(prompt).toContain("不要生成词数、题型或题量");
    expect(outline.chapters[0].recommendedKnowledgePointIds).toEqual(["grammar-1"]);
    expect(outline.title).toBe("海底图书馆 / The Ocean Library");
    expect(outline.chapters[0].title).toBe("发光地图 / The Glowing Map");
    expect(prompt).not.toContain("课程：海底图书馆");
  });

  test("keeps every confirmed upstream input in the outline prompt", async () => {
    await createStoryOutlineGenerationDeps().generateOutline({
      task: "把第三章改得更紧张。",
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      coursePeople: [{ personId: "student-9", role: "student", chineseName: "安安", englishName: "Ann", age: 9, gender: "female" }],
      conversationHistory: [{ role: "teacher", content: "必须让暮光闪闪和云宝共同出场" }],
      confirmedRequirement: "使用小马宝莉原作人物创作新剧情，不照搬原作主线。",
      references: [{ id: "ref-1", name: "暮光闪闪与云宝", confirmedAt: "2026-08-12" }],
      selectedDirection: { id: "direction-1", title: "情绪天气城", storyHighlight: "情绪改变天气", growthCore: "学会表达情绪" },
      currentDirections: [{ id: "direction-2", title: "未选择方向" }],
      currentOutline: { id: "outline-1", title: "当前大纲", chapters: [{ order: 3, title: "风暴来临" }] },
      englishLevel: "A2",
      durationMinutes: 45,
      selectedKnowledgePoints: [{ id: "kp-past", label: "Past Simple", category: "Grammar" }],
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    for (const expected of ["student-9", "安安", "age\":9", "必须让暮光闪闪和云宝共同出场", "使用小马宝莉原作人物创作新剧情", "ref-1", "情绪天气城", "情绪改变天气", "学会表达情绪", "当前大纲", "风暴来临", "指定章节数：4", "英语难度：A2", "课程时长：45", "KP1", "把第三章改得更紧张"]) {
      expect(prompt).toContain(expected);
    }
  });

  test("passes people, chapter count and conversation history into random direction generation", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify([
      { title: "情绪天气城", hook: "暮光闪闪和云宝黛西误入一座会把情绪变成天气的城市，必须在风暴吞没城市前帮助居民说出真实感受。", storyHighlight: "情绪会直接改变天气和道路。", growthCore: "暮光闪闪从试图控制情绪转向理解和表达情绪。", mainCharacters: ["暮光闪闪", "云宝黛西"], whyFits: "适合十岁学生理解情绪表达。", seedPrompt: "完整方向" },
      { title: "倒着走的时间", hook: "暮光闪闪和云宝黛西发现小马谷的时间每天倒退一小时，必须找出是谁不愿面对明天。", storyHighlight: "时间会被逃避未来的愿望反向推动。", growthCore: "角色从回避不确定性转向主动选择未来。", mainCharacters: ["暮光闪闪", "云宝黛西"], whyFits: "兼顾想象力和选择意识。", seedPrompt: "完整方向" },
      { title: "交换天赋日", hook: "暮光闪闪和云宝黛西的天赋突然交换，必须用陌生能力阻止整座城市继续错位。", storyHighlight: "角色必须使用对方的能力解决问题。", growthCore: "角色从坚持自己的方式转向理解不同能力的价值。", mainCharacters: ["暮光闪闪", "云宝黛西"], whyFits: "适合讨论差异和自我认识。", seedPrompt: "完整方向" },
    ]) });

    const directions = await createStoryOutlineGenerationDeps().generateDirections({
      task: "请生成 3 个故事方向。",
      chapterCount: 4,
      coursePeople: [{ personId: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Ms. Lin", age: 32, gender: "female" }],
      conversationHistory: [{ role: "teacher", content: "主题：太空学校" }],
      references: [],
      selectedDirection: null,
      currentOutline: null,
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("指定章节数：4");
    expect(prompt).toContain('"personId":"teacher-1"');
    expect(prompt).toContain("林老师");
    expect(prompt).toContain("主题：太空学校");
    expect(prompt).toContain("所有内容使用中文");
    expect(prompt).toContain("富有想象力的儿童故事创意总监");
    expect(prompt).toContain("老师只阅读 hook，也应该能大致理解这个故事会怎样展开");
    expect(prompt).toContain("storyHighlight");
    expect(prompt).toContain("growthCore");
    expect(prompt).toContain("mainCharacters 只列具体且需要保持视觉一致性的角色");
    expect(prompt).toContain("默认最多选择 2 个原作角色");
    expect(prompt).toContain("老师明确点名的原作角色全部保留");
    expect(prompt).toContain("老师和学生不计入这个原作角色上限");
    expect(prompt).toContain("机构、团队和背景群体只能写进 hook 或 seedPrompt");
    expect(prompt).toContain("Step 1 中的老师和所有学生默认全部参与故事");
    expect(directions[0]).toMatchObject({ storyHighlight: expect.any(String), growthCore: expect.any(String) });
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

});
