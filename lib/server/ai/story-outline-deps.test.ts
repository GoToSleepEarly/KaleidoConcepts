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
  test("converts response-only KP keys to knowledge point labels in the saved recommendation summary", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({
      title: { zh: "港口任务", en: "Harbor Mission" },
      summary: "团队完成任务。",
      characters: [],
      chapters: [{
        order: 1,
        title: { zh: "守卫出现", en: "The Guard Appears" },
        whatHappens: "守卫出现，团队开始行动。",
        characterKeys: [],
        recommendedKnowledgePointKeys: ["KP2", "KP3"],
        knowledgePointRecommendationSummary: "KP2 描述固定状态，KP3 描述正在发生的行动。",
      }],
    }) });

    const outline = await createStoryOutlineGenerationDeps().generateOutline({
      task: "生成大纲。",
      references: [],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
      englishLevel: "A1",
      durationMinutes: 30,
      selectedKnowledgePoints: [
        { id: "knowledge-1", label: "Past Simple", category: "时态" },
        { id: "knowledge-2", label: "Present Simple", category: "时态" },
        { id: "knowledge-3", label: "Present Continuous", category: "时态" },
      ],
    });

    expect(outline.chapters[0].recommendedKnowledgePointIds).toEqual(["knowledge-2", "knowledge-3"]);
    expect(outline.chapters[0].knowledgePointRecommendationSummary).toBe("Present Simple 描述固定状态，Present Continuous 描述正在发生的行动。");
    expect(generateOutlineMock.mock.calls.at(-1)?.[0].prompt).toContain("引用对应 KP 短键");
  });

  test("uses a soft chapter capacity and permits naturally empty recommendations", async () => {
    await createStoryOutlineGenerationDeps().generateOutline({
      task: "生成三章故事大纲。",
      references: [],
      chapterCount: 3,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
      englishLevel: "B2",
      durationMinutes: 30,
      selectedKnowledgePoints: Array.from({ length: 11 }, (_, index) => ({ id: `knowledge-${index + 1}`, label: `Grammar ${index + 1}`, category: "时态" })),
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("有自然语境的章节通常推荐 1–2 个知识点，每章最多 3 个");
    expect(prompt).toContain("某章没有自然语境时允许返回空数组");
    expect(prompt).toContain("知识点覆盖软基准：全课优先覆盖 6 个不同知识点");
    expect(prompt).toContain("不是必须凑满的硬校验");
  });

  test("aligns only the broad creative intent without researching or demanding a complete plot", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        storyMode: "new_story",
        classroomPresence: "participant",
        requiredNamedCharacters: ["暮光闪闪", "云宝黛西"],
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
    expect(result).toMatchObject({
      storyMode: "new_story",
      classroomPresence: "participant",
      requiredNamedCharacters: ["暮光闪闪", "云宝黛西"],
    });
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("资深儿童故事策划编辑");
    expect(prompt).toContain("不是帮助老师补完整个故事");
    expect(prompt).toContain("后续系统会生成 3 个候选故事方向");
    expect(prompt).toContain("不查找或整理背景资料");
    expect(prompt).toContain("Step 1 中的老师和所有学生默认全部参与故事");
    expect(prompt).toContain("课堂人物的具体进入方式由故事剧情决定");
    expect(prompt).toContain("通常不提问");
    expect(prompt).toContain("每个问题都必须给出 2-3 个可直接选择的选项");
    expect(prompt).toContain("recommendedOptionId");
    expect(prompt).not.toContain("researchPlan");
    expect(prompt).toContain("暮光闪闪和云宝黛西");
    expect(prompt).toContain("requiredNamedCharacters");
    expect(prompt).toContain("逐个保留老师明确点名且要求出场的角色原名");
    expect(prompt).toContain("不得归纳成“核心角色”“主要角色”");
    expect(prompt).toContain('"personId":"student-1"');
  });

  test("treats age-appropriate intimacy boundaries as presentation changes instead of a new plot", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "follow_defined_plot",
        storyMode: "faithful",
        classroomPresence: "observer",
        requiredNamedCharacters: [],
        assistantMessage: "请确认适龄讲述范围。",
        resolvedUnderstanding: ["忠实讲述原作主线并避开成人亲密内容"],
        unresolvedIssues: [],
        questions: [],
        summary: "保留原作情感发展，以适合课堂的方式表达。",
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "保留欣赏、心动、试探与离别，避开成人及亲密身体关系内容。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [
        { role: "teacher", content: "学生和老师进入电影《Call Me By Your Name》，见证主角之间的假期和情愫。" },
        { role: "assistant", content: "请选择情感内容的呈现边界。" },
        { role: "teacher", content: "保留欣赏、心动、试探与离别，避开成人及亲密身体关系内容。" },
      ],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result).toMatchObject({ planningMode: "follow_defined_plot", storyMode: "faithful", classroomPresence: "observer" });
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("适龄删减或弱化成熟、成人、亲密关系内容，只改变呈现尺度");
    expect(prompt).toContain("不得仅因老师回答了内容边界问题就改成 explore_options");
  });

  test("用参考资料短键确定性关联点名 IP 角色，不让 AI 复制数据库 ID", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: { zh: "风之训练", en: "The Wind Trial" },
        summary: "Jett 与 Sage 帮助学生完成合作训练。",
        characters: [
          { key: "C1", displayName: "捷特", englishName: "Jett", sourceType: "referenced", sourceReferenceKey: "R01", roleInStory: "使用风能力开辟路线。" },
          { key: "C2", displayName: "贤者", englishName: "Sage", sourceType: "referenced", sourceReferenceKey: "R01", roleInStory: "保护团队并稳定路线。" },
        ],
        chapters: [{ order: 1, title: { zh: "训练开始", en: "Training Begins" }, whatHappens: "两名角色带领学生开始训练。", characterKeys: ["C1", "C2"], recommendedKnowledgePointKeys: [], knowledgePointRecommendationSummary: "" }],
      }),
    });

    const outline = await createStoryOutlineGenerationDeps().generateOutline({
      task: "根据《瓦罗兰特》的 Jett 和 Sage，讲一个合作战斗故事。",
      references: [{ id: "database-reference-id", name: "Jett 与 Sage", type: "game_character", summary: "《VALORANT》中的两名特工。" }],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    });

    expect(outline.characters.map((character) => character.sourceReferenceId)).toEqual(["database-reference-id", "database-reference-id"]);
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain('"key":"R01"');
    expect(prompt).not.toContain("database-reference-id");
    expect(prompt).toContain("sourceReferenceKey");
  });

  test("引用角色缺少有效参考短键时明确失败，不静默降级为原创角色", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: { zh: "风之训练", en: "The Wind Trial" },
        summary: "Jett 帮助学生完成训练。",
        characters: [{ key: "C1", displayName: "捷特", englishName: "Jett", sourceType: "referenced", roleInStory: "使用风能力开辟路线。" }],
        chapters: [{ order: 1, title: { zh: "训练开始", en: "Training Begins" }, whatHappens: "Jett 开始训练。", characterKeys: ["C1"], recommendedKnowledgePointKeys: [], knowledgePointRecommendationSummary: "" }],
      }),
    });

    await expect(createStoryOutlineGenerationDeps().generateOutline({
      task: "使用 Jett 创作故事。",
      references: [{ id: "database-reference-id", name: "Jett", type: "game_character", summary: "《VALORANT》角色。" }],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    })).rejects.toThrow("引用角色 捷特 缺少有效 sourceReferenceKey");
  });

  test("参考资料唯一匹配时自动把误标的原创角色纠正为引用角色", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: { zh: "风之训练", en: "The Wind Trial" },
        summary: "Jett 帮助学生完成训练。",
        characters: [{ key: "C1", displayName: "捷特", englishName: "Jett", sourceType: "original", roleInStory: "使用风能力开辟路线。" }],
        chapters: [{ order: 1, title: { zh: "训练开始", en: "Training Begins" }, whatHappens: "Jett 开始训练。", characterKeys: ["C1"], recommendedKnowledgePointKeys: [], knowledgePointRecommendationSummary: "" }],
      }),
    });

    const outline = await createStoryOutlineGenerationDeps().generateOutline({
      task: "使用 Jett 创作故事。",
      references: [{ id: "database-reference-id", name: "Jett 与 Sage", type: "game_character", summary: "《VALORANT》中的 Jett 和 Sage。" }],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    });

    expect(outline.characters[0]).toMatchObject({
      displayName: "捷特",
      englishName: "Jett",
      sourceType: "referenced",
      sourceReferenceId: "database-reference-id",
      roleInStory: "使用风能力开辟路线。",
    });
  });

  test("误标原创角色同时匹配多份资料时不猜测关联", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: { zh: "风之训练", en: "The Wind Trial" },
        summary: "Jett 帮助学生完成训练。",
        characters: [{ key: "C1", displayName: "捷特", englishName: "Jett", sourceType: "original", roleInStory: "使用风能力开辟路线。" }],
        chapters: [{ order: 1, title: { zh: "训练开始", en: "Training Begins" }, whatHappens: "Jett 开始训练。", characterKeys: ["C1"], recommendedKnowledgePointKeys: [], knowledgePointRecommendationSummary: "" }],
      }),
    });

    await expect(createStoryOutlineGenerationDeps().generateOutline({
      task: "使用 Jett 创作故事。",
      references: [
        { id: "reference-1", name: "Jett", type: "game_character", summary: "《VALORANT》角色。" },
        { id: "reference-2", name: "Jett 与 Sage", type: "game_character", summary: "两名角色的关系资料。" },
      ],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    })).rejects.toThrow("角色 捷特 同时匹配多份参考资料，无法自动确定引用关系");
  });

  test("角色短键重复或章节引用未知角色时明确失败", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: { zh: "测试故事", en: "Test Story" },
        summary: "测试。",
        characters: [
          { key: "C1", displayName: "甲", englishName: "Alpha", sourceType: "original", roleInStory: "主角。" },
          { key: "C1", displayName: "乙", englishName: "Beta", sourceType: "original", roleInStory: "伙伴。" },
        ],
        chapters: [{ order: 1, title: { zh: "开始", en: "Start" }, whatHappens: "故事开始。", characterKeys: ["C1"], recommendedKnowledgePointKeys: [], knowledgePointRecommendationSummary: "" }],
      }),
    });

    await expect(createStoryOutlineGenerationDeps().generateOutline({
      task: "生成故事。",
      references: [],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    })).rejects.toThrow("故事大纲角色 key 缺失或重复");
  });

  test("normalizes value-based AI options and links the recommendation to a visible label", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "needs_clarification",
        planningMode: "explore_options",
        storyMode: "new_story",
        classroomPresence: "participant",
        assistantMessage: "请选择故事使用方式。",
        resolvedUnderstanding: [],
        unresolvedIssues: ["使用方式"],
        questions: [{
          id: "usage",
          label: "怎样使用原作？",
          required: true,
          answerMode: "single_choice",
          options: [
            { value: "follow_original", label: "忠实讲述原剧情" },
            { value: "new_story", label: "使用原作人物创作新剧情" },
            { value: "theme_only", label: "只借用主题重新创作" },
          ],
          allowCustom: true,
          recommendation: { value: "new_story", reason: "老师已经提出新的课堂冒险。" },
        }],
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "根据原作创作课堂故事。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result.questions[0]).toMatchObject({
      options: [
        { id: "new_story", label: "使用原作人物创作新剧情" },
        { id: "follow_original", label: "忠实讲述原剧情" },
        { id: "theme_only", label: "只借用主题重新创作" },
      ],
      recommendedOptionId: "new_story",
      recommendationReason: "老师已经提出新的课堂冒险。",
    });
  });

  test("keeps story fidelity separate from whether classroom people enter the story", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "follow_defined_plot",
        storyMode: "faithful",
        classroomPresence: "observer",
        assistantMessage: "请确认忠实讲述方式。",
        resolvedUnderstanding: ["忠实讲述原作，课堂人物进入场景旁观"],
        unresolvedIssues: [],
        questions: [],
        summary: "忠实讲述原作关键事件与结局，老师和学生进入场景旁观，但不影响原作因果。",
      }),
    });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "按原作讲《灰姑娘》，老师和学生也进入故事。",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(result).toMatchObject({ storyMode: "faithful", classroomPresence: "observer" });
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("storyMode");
    expect(prompt).toContain("faithful + observer");
    expect(prompt).toContain("人物传记");
    expect(prompt).toContain("只有老师明确要求课堂人物不进入");
  });

  test("repairs an invalid alignment response once without changing its meaning", async () => {
    generateOutlineMock.mockClear();
    const onFormatRepair = vi.fn(async () => undefined);
    generateOutlineMock
      .mockResolvedValueOnce({ text: "我先说明一下，然后给出结果" })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          status: "ready_for_confirmation",
          planningMode: "explore_options",
          storyMode: "new_story",
          classroomPresence: "participant",
          assistantMessage: "请确认。",
          resolvedUnderstanding: ["创作海底冒险"],
          unresolvedIssues: [],
          questions: [],
          summary: "创作一个由师生共同参与的海底冒险故事",
        }),
      });

    const result = await createStoryOutlineGenerationDeps().alignRequirements({
      task: "写一个海底冒险故事",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
      onFormatRepair,
    });

    expect(onFormatRepair).toHaveBeenCalledTimes(1);
    expect(generateOutlineMock).toHaveBeenCalledTimes(2);
    expect(generateOutlineMock.mock.calls[1]?.[0]).toMatchObject({ operation: "story_align_requirements_repair_format" });
    expect(generateOutlineMock.mock.calls[1]?.[0].prompt).toContain("只修复 JSON 或结构格式，不重新理解、补充或改写老师的需求");
    expect(result.status).toBe("ready_for_confirmation");
  });

  test("reports the concrete alignment format failure after automatic repair also fails", async () => {
    generateOutlineMock.mockClear();
    generateOutlineMock.mockResolvedValueOnce({ text: "不是 JSON" }).mockResolvedValueOnce({ text: "仍然不是 JSON" });

    await expect(createStoryOutlineGenerationDeps().alignRequirements({
      task: "写一个海底冒险故事",
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    })).rejects.toMatchObject({
      message: "AI 返回的需求对齐内容不是有效 JSON，自动修复后仍未通过。",
      code: "STORY_ALIGNMENT_INVALID_JSON",
    });
  });

  test("presents every ready creative brief as an understanding awaiting teacher confirmation", async () => {
    generateOutlineMock.mockResolvedValueOnce({
      text: JSON.stringify({
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        storyMode: "new_story",
        classroomPresence: "participant",
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
        storyMode: "new_story",
        classroomPresence: "participant",
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
        storyMode: "new_story",
        classroomPresence: "participant",
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
    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("忠实讲述中改变原作或史实的关键因果、转折或结局");
    expect(prompt).toContain("先向老师解释冲突并等待确认");
  });

  test("gives faithful outlines observer rules without causal classroom actions", async () => {
    await createStoryOutlineGenerationDeps().generateOutline({
      task: "忠实讲述《灰姑娘》。",
      references: [],
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      storyMode: "faithful",
      classroomPresence: "observer",
      coursePeople: [{ personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 10, gender: "female" }],
      conversationHistory: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
      selectedKnowledgePoints: [{ id: "kp-1", label: "一般过去时" }],
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("课堂人物只能作为旁观者");
    expect(prompt).toContain("不得提供关键物品、提醒、建议或帮助");
    expect(prompt).toContain("课堂人物只观察，不承担推动、解决或改变事件的贡献");
    expect(prompt).not.toContain("每个人至少有一次改变局面的有效行动");
    expect(prompt).not.toContain("每名学生都有高光时刻");
    expect(prompt).not.toContain("角色行动分散到完整大纲");
    expect(prompt).not.toContain("故事亮点必须贯穿并推动主要剧情");
  });

  test("treats faithful directions as alternative narrative lenses instead of alternative plots", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify(Array.from({ length: 3 }, (_, index) => ({
      title: `叙事视角 ${index + 1}`,
      hook: "Summer 跟随既定事件进行观察。",
      storyHighlight: "聚焦一个已确认的事实节点。",
      growthCore: "理解事件发生的背景。",
      mainCharacters: ["Summer"],
      whyFits: "保持史实不变。",
    }))) });

    await createStoryOutlineGenerationDeps().generateDirections({
      task: "讲述一段真实历史。",
      chapterCount: 4,
      coursePeople: [{ personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 10, gender: "female" }],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
      storyMode: "faithful",
      classroomPresence: "observer",
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("三个方向只能改变叙事视角、事实焦点或讲述范围");
    expect(prompt).toContain("课堂人物只观察");
    expect(prompt).not.toContain("选择差异最大的 3 个");
    expect(prompt).not.toContain("每名学生都有高光时刻");
  });

  test("keeps faithful direction and chapter revisions inside the observer boundary", async () => {
    generateOutlineMock
      .mockResolvedValueOnce({ text: JSON.stringify({
        title: "既定事件视角",
        hook: "Summer 观察既定事件。",
        storyHighlight: "聚焦已确认事实。",
        growthCore: "理解事件背景。",
        mainCharacters: ["Summer"],
        whyFits: "不改变原有因果。",
      }) })
      .mockResolvedValueOnce({ text: JSON.stringify({
        status: "ready",
        chapter: {
          order: 1,
          title: { zh: "既定事件", en: "The Established Event" },
          whatHappens: "Summer 观察事件发生。",
          characterIds: [],
          recommendedKnowledgePointKeys: [],
          knowledgePointRecommendationSummary: "",
        },
      }) });
    const context = {
      task: "让内容更清楚。",
      chapterCount: 1,
      coursePeople: [{ personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 10, gender: "female" }],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
      storyMode: "faithful" as const,
      classroomPresence: "observer" as const,
    };

    await createStoryOutlineGenerationDeps().reviseDirection({ ...context, direction: { title: "旧视角" } });
    const directionPrompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(directionPrompt).toContain("只调整叙事视角、事实焦点、讲述范围或表达清晰度");
    expect(directionPrompt).not.toContain("修改后让核心问题、主要行动和独特之处形成完整因果");

    await createStoryOutlineGenerationDeps().reviseChapter({ ...context, chapterOrder: 1 });
    const chapterPrompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(chapterPrompt).toContain("只按已确认资料讲清本章既定事件");
    expect(chapterPrompt).toContain("课堂人物只观察、记录、见证或彼此交流");
    expect(chapterPrompt).not.toContain("本章结果必须改变下一章成立时的局面");
  });

  test("keeps story outline prompt focused on necessary roles and concrete causal chapter summaries", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({
      title: { zh: "海底图书馆", en: "The Ocean Library" },
      summary: "学生合作完成任务。",
      characters: [{ key: "C1", displayName: "错误中文名", englishName: "Wrong Name", sourceType: "person", sourcePersonId: "student-1", roleInStory: "负责观察路线并验证线索的学生主角。" }],
      chapters: [{ order: 1, title: { zh: "发光地图", en: "The Glowing Map" }, whatHappens: "夏天发现地图。", characterKeys: ["C1"], recommendedKnowledgePointKeys: ["KP1"], knowledgePointRecommendationSummary: "用过去时描述发现地图的过程。" }],
    }) });
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
    expect(prompt).toContain("每个角色都必须服务核心叙事");
    expect(prompt).toContain("summary 使用 3–4 个自然短句");
    expect(prompt).toContain("内部检查连续状态");
    expect(prompt).toContain("本章结果必须改变下一章成立时的局面");
    expect(prompt).toContain("失踪角色在被找到前不能行动");
    expect(prompt).toContain("未取得的物品不能使用或交付");
    expect(prompt).toContain("最终结果必须回应开头建立的核心矛盾");
    expect(prompt).toContain("角色行动分散到完整大纲");
    expect(prompt).toContain("结局只能来自前文已经建立");
    expect(prompt).toContain("不能使用“理解友谊、勇气或合作”代替实际剧情");
    expect(prompt).not.toContain("约 50 字");
    expect(prompt).toContain("故事 title 和章节 title 返回中英文双语");
    expect(prompt).toContain("老师点名且要求出场的角色");
    expect(prompt).toContain("只保留已选故事方向实际使用的引用角色");
    expect(prompt).toContain("参考资料中的其他候选角色不得自动进入 characters");
    expect(prompt).toContain("这是新故事。课堂人物作为参与者进入故事");
    expect(prompt).toContain("可以由两三人共同完成一次关键行动");
    expect(prompt).toContain("不要求每个人单独制造一次状态变化");
    expect(prompt).toContain("characters 是后续视觉资产名单");
    expect(prompt).toContain("displayName, englishName");
    expect(prompt).toContain("sourcePersonId、displayName 和 englishName 必须逐字复制对应人物快照");
    expect(prompt).not.toContain("storyDescription");
    expect(prompt).not.toContain("narrativeType");
    expect(prompt).toContain("机构、公司、团队、部门、监管方和其他背景群体不得进入 characters");
    expect(prompt).toContain("外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced");
    expect(prompt).toContain("sourcePersonId、displayName 和 englishName 必须逐字复制对应人物快照");
    expect(prompt).toContain('"personId":"student-1"');
    expect(prompt).toContain("面向老师展示的说明使用中文");
    expect(prompt).toContain("课堂人物名称按下述规则使用人物快照英文名");
    expect(prompt).toContain("只负责生成可确认的故事大纲");
    expect(prompt).toContain("Jett 和 Sage");
    expect(prompt).toContain("夏天");
    expect(prompt).toContain("指定章节数：4");
    expect(prompt).toContain("英语难度：B1");
    expect(prompt).toContain("课程时长：45 分钟");
    expect(prompt).toContain('"key":"KP1"');
    expect(prompt).not.toContain('"id":"grammar-1"');
    expect(prompt).toContain("recommendedKnowledgePointKeys");
    expect(prompt).toContain("从全课视角统一规划知识点分布");
    expect(prompt).toContain("同章知识点能否在同一语境中自然共存");
    expect(prompt).toContain("不得为了平均分配强行组合");
    expect(prompt).toContain("逐个引用对应 KP 短键并说明使用语境");
    expect(prompt).toContain("不要生成词数、题型或题量");
    expect(outline.chapters[0].recommendedKnowledgePointIds).toEqual(["grammar-1"]);
    expect(outline.title).toBe("海底图书馆 / The Ocean Library");
    expect(outline.characters[0]).toMatchObject({
      displayName: "夏天",
      englishName: "Summer",
      roleInStory: "负责观察路线并验证线索的学生主角。",
      shortDescription: "负责观察路线并验证线索的学生主角。",
    });
    expect(outline.chapters[0].title).toBe("发光地图 / The Glowing Map");
    expect(prompt).not.toContain("课程：海底图书馆");
  });

  test("normalizes malformed direction character objects to canonical classroom English names without a duplicate team entity", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify(Array.from({ length: 3 }, (_, index) => ({
      title: `英雄方向 ${index + 1}`,
      hook: "孟雨带领 Ethan 和其他学生英雄合作迎战怪兽。",
      storyHighlight: "不同能力形成连锁行动。",
      growthCore: "从争抢功劳转向信任伙伴。",
      mainCharacters: [
        { displayName: "孟雨" },
        { englishName: "Ethan" },
        { name: "学生英雄队" },
      ],
      whyFits: "每名学生都有关键行动。",
    }))) });

    const directions = await createStoryOutlineGenerationDeps().generateDirections({
      task: "四个学生组成超级英雄战队，在老师带领下合力击败怪兽。要求每个学生都有高光时刻。",
      chapterCount: 5,
      durationMinutes: 45,
      coursePeople: [
        { personId: "teacher-1", role: "teacher", chineseName: "孟雨", englishName: "Ms. Meng", age: 30, gender: "female" },
        { personId: "student-1", role: "student", chineseName: "李世翊", englishName: "Ethan", age: 10, gender: "male" },
      ],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    expect(directions[0].mainCharacters).toEqual(["Ms. Meng", "Ethan"]);
    expect(directions[0].hook).toContain("Ms. Meng");
    expect(directions[0].hook).toContain("Ethan");
    expect(directions[0].hook).not.toContain("孟雨");
    expect(generateOutlineMock.mock.calls.at(-1)?.[0].prompt).toContain("课堂团队称呼不能作为额外角色重复放入 mainCharacters");
    expect(generateOutlineMock.mock.calls.at(-1)?.[0].prompt).toContain("每名学生都有高光时刻");
  });

  test("recovers a person character's sourcePersonId from one unique classroom name match", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({
      title: { zh: "英雄战队", en: "Hero Team" },
      summary: "师生合作击败怪兽。",
      characters: [{ key: "C1", displayName: "李世翊", englishName: "Ethan", sourceType: "person", roleInStory: "用地面震动定位怪兽。" }],
      chapters: [{ order: 1, title: { zh: "怪兽出现", en: "The Monster Appears" }, whatHappens: "李世翊发现怪兽的位置。", characterKeys: ["C1"], recommendedKnowledgePointKeys: [], knowledgePointRecommendationSummary: "" }],
    }) });

    const outline = await createStoryOutlineGenerationDeps().generateOutline({
      task: "生成超级英雄故事大纲。",
      references: [],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [{ personId: "student-1", role: "student", chineseName: "李世翊", englishName: "Ethan", age: 10, gender: "male" }],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    });

    expect(outline.characters[0]).toMatchObject({
      displayName: "李世翊",
      englishName: "Ethan",
      sourcePersonId: "student-1",
    });
    expect(outline.chapters[0].whatHappens).toContain("Ethan");
    expect(outline.chapters[0].whatHappens).not.toContain("李世翊");
  });

  test("normalizes array-valued chapter prose before it reaches String database fields", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({
      title: { zh: "回声巨兽", en: "The Echo Monster" },
      summary: "师生合作恢复城市声音。",
      characters: [],
      chapters: [{
        order: 1,
        title: { zh: "寂静广场", en: "The Silent Square" },
        whatHappens: ["怪兽吸走城市声音。", "学生在老师带领下开始追踪。"],
        characterKeys: [],
        recommendedKnowledgePointKeys: [],
        knowledgePointRecommendationSummary: "",
      }],
    }) });

    const outline = await createStoryOutlineGenerationDeps().generateOutline({
      task: "生成超级英雄故事大纲。",
      references: [],
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      selectedDirection: null,
      currentOutline: null,
    });

    expect(outline.chapters[0].storyGoal).toBe("怪兽吸走城市声音。 学生在老师带领下开始追踪。");
    expect(outline.chapters[0].whatHappens).toBe("怪兽吸走城市声音。 学生在老师带领下开始追踪。");
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
    for (const expected of ["student-9", "安安", "age\":9", "必须让暮光闪闪和云宝共同出场", "使用小马宝莉原作人物创作新剧情", '"key":"R01"', "情绪天气城", "情绪改变天气", "学会表达情绪", "当前大纲", "风暴来临", "指定章节数：4", "英语难度：A2", "课程时长：45", "KP1", "把第三章改得更紧张"]) {
      expect(prompt).toContain(expected);
    }
    expect(prompt).not.toContain("ref-1");
  });

  test("keeps direction generation focused on the latest story requirement without teaching or outline context", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify([
      { title: "情绪天气城", hook: "暮光闪闪和云宝黛西误入一座会把情绪变成天气的城市，必须在风暴吞没城市前帮助居民说出真实感受。", storyHighlight: "情绪会直接改变天气和道路。", growthCore: "暮光闪闪从试图控制情绪转向理解和表达情绪。", mainCharacters: ["暮光闪闪", "云宝黛西"], whyFits: "适合十岁学生理解情绪表达。" },
      { title: "倒着走的时间", hook: "暮光闪闪和云宝黛西发现小马谷的时间每天倒退一小时，必须找出是谁不愿面对明天。", storyHighlight: "时间会被逃避未来的愿望反向推动。", growthCore: "角色从回避不确定性转向主动选择未来。", mainCharacters: ["暮光闪闪", "云宝黛西"], whyFits: "兼顾想象力和选择意识。" },
      { title: "交换天赋日", hook: "暮光闪闪和云宝黛西的天赋突然交换，必须用陌生能力阻止整座城市继续错位。", storyHighlight: "角色必须使用对方的能力解决问题。", growthCore: "角色从坚持自己的方式转向理解不同能力的价值。", mainCharacters: ["暮光闪闪", "云宝黛西"], whyFits: "适合讨论差异和自我认识。" },
    ]) });

    const directions = await createStoryOutlineGenerationDeps().generateDirections({
      task: "请生成 3 个故事方向。",
      chapterCount: 4,
      coursePeople: [{ personId: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Ms. Lin", age: 32, gender: "female" }],
      conversationHistory: [
        { role: "teacher", content: "已经被替代的旧要求：海底调查" },
        { role: "assistant", content: "旧回复 1" },
        { role: "teacher", content: "旧回复 2" },
        { role: "assistant", content: "旧回复 3" },
        { role: "teacher", content: "旧回复 4" },
        { role: "assistant", content: "旧回复 5" },
        { role: "teacher", content: "主题：太空学校" },
      ],
      references: [{ id: "ref-1", name: "太空学校设定", summary: "学校位于空间站。", usableFacts: ["学生乘坐穿梭舱上课"], avoidTopics: ["无关资料"], adaptationBoundary: "保持适龄" }],
      selectedDirection: null,
      currentDirections: [{ title: "已经被替代的旧方向" }],
      currentOutline: { title: "已经被替代的旧大纲" },
      englishLevel: "A2",
      durationMinutes: 45,
      selectedKnowledgePoints: [{ id: "grammar-1", label: "Daily routines", category: "Grammar" }],
      confirmedRequirement: "创作发生在太空学校的新冒险。",
      requiredNamedCharacters: ["安娜", "艾莎"],
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("故事容量：4 章 / 45 分钟");
    expect(prompt).toContain('"personId":"teacher-1"');
    expect(prompt).toContain("林老师");
    expect(prompt).toContain("主题：太空学校");
    expect(prompt).toContain("创作发生在太空学校的新冒险");
    expect(prompt).toContain('必须出场的点名角色：["安娜","艾莎"]');
    expect(prompt).toContain("学校位于空间站");
    expect(prompt).not.toContain("已经被替代的旧要求");
    expect(prompt).not.toContain("旧回复 4");
    expect(prompt).not.toContain("已经被替代的旧方向");
    expect(prompt).not.toContain("已经被替代的旧大纲");
    expect(prompt).not.toContain("英语难度");
    expect(prompt).toContain("故事容量：4 章 / 45 分钟");
    expect(prompt).not.toContain("Daily routines");
    expect(prompt).not.toContain("grammar-1");
    expect(prompt).not.toContain("无关资料");
    expect(prompt).toContain("自然语言说明使用中文");
    expect(prompt).toContain("Step 1 课堂人物逐字使用快照中的 englishName");
    expect(prompt).toContain("外部角色使用老师输入或参考资料确认的名称");
    expect(prompt).toContain("富有想象力的儿童故事创意总监");
    expect(prompt).toContain("方向卡用于快速选择主线，不是压缩版大纲");
    expect(prompt).toContain("最高验收标准");
    expect(prompt).toContain("读一遍后就能用一句话讲清整个故事设计");
    expect(prompt).toContain("使用 2–4 个简短自然句，通常约 3 句");
    expect(prompt).toContain("按最自然的顺序组织");
    expect(prompt).toContain("每个 hook 只呈现一个决定性故事引擎");
    expect(prompt).toContain("辅助规则、逐人分工、阶段任务和具体解法由大纲展开");
    expect(prompt).toContain("mainCharacters 完整记录具体角色");
    expect(prompt).toContain("hook 使用自然的团队称呼表达课堂人物共同参与");
    expect(prompt).toContain("每个方向都应有一句只能描述自身的核心概括");
    expect(prompt).toContain("比较核心问题、主要行动和角色关系");
    expect(prompt).toContain("选择差异最大的 3 个");
    expect(prompt).not.toContain("最大的阻碍");
    expect(prompt).not.toContain("他们准备");
    expect(prompt).not.toContain("不要求每个人单独制造一次状态变化");
    expect(prompt).toContain("storyHighlight");
    expect(prompt).toContain("growthCore");
    expect(prompt).not.toContain("seedPrompt");
    expect(prompt).toContain("mainCharacters 完整记录具体角色和需要保持视觉一致性的具名群体");
    expect(prompt).toContain("默认最多 2 个");
    expect(prompt).toContain("老师明确点名的原作角色全部保留");
    expect(prompt).toContain("完整保留在每个方向的 mainCharacters");
    expect(prompt).toContain("点名角色较多时允许使用老师已确认的团队称呼");
    expect(prompt).toContain("默认最多 2 个");
    expect(prompt).toContain("老师和学生不计入该上限");
    expect(prompt).toContain("具名团队、不可分割的群像");
    expect(prompt).toContain("完整群体按整体保留");
    expect(prompt).toContain("hook 使用自然的团队称呼表达课堂人物共同参与");
    expect(prompt).toContain("mainCharacters 完整保留 Step 1 人物");
    expect(directions[0]).toMatchObject({ storyHighlight: expect.any(String), growthCore: expect.any(String), seedPrompt: directions[0].hook });
  });

  test("keeps causal clarity rules when revising one direction or chapter", async () => {
    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({
      title: "会移动的路牌",
      hook: "小马谷的路牌开始移动。大家必须在天亮前恢复道路。",
      storyHighlight: "道路会响应居民未完成的求助。",
      growthCore: "角色从只顾赶路转向观察行动造成的结果。",
      mainCharacters: ["暮光闪闪"],
      whyFits: "保留原作角色并形成具体冒险。",
    }) });

    const revised = await createStoryOutlineGenerationDeps().reviseDirection({
      task: "让故事更容易理解",
      direction: { title: "会移动的路牌" },
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    const directionPrompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(directionPrompt).toContain("方向卡用于快速选择主线，不是压缩版大纲");
    expect(directionPrompt).toContain("最高验收标准");
    expect(directionPrompt).toContain("读一遍后就能用一句话讲清整个故事设计");
    expect(directionPrompt).toContain("使用 2–4 个简短自然句，通常约 3 句");
    expect(directionPrompt).toContain("按最自然的顺序组织");
    expect(directionPrompt).toContain("每个 hook 只呈现一个决定性故事引擎");
    expect(directionPrompt).toContain("辅助规则、逐人分工、阶段任务和具体解法由大纲展开");
    expect(directionPrompt).not.toContain("最大的阻碍");
    expect(directionPrompt).not.toContain("他们准备");
    expect(directionPrompt).not.toContain("seedPrompt");
    expect(revised.seedPrompt).toBe(revised.hook);

    generateOutlineMock.mockResolvedValueOnce({ text: JSON.stringify({
      status: "ready",
      chapter: {
        order: 2,
        title: { zh: "错误的岔路", en: "The Wrong Turn" },
        whatHappens: "兰兰根据移动路牌寻找包裹，却把它送到错误地点；新的岔路因此出现，迫使团队改变路线。",
        characterIds: [],
        recommendedKnowledgePointKeys: [],
        knowledgePointRecommendationSummary: "",
      },
    }) });

    await createStoryOutlineGenerationDeps().reviseChapter({
      task: "让本章因果更清楚",
      chapterOrder: 2,
      chapterCount: 4,
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: null,
      currentDirections: [],
      currentOutline: null,
    });

    const chapterPrompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(chapterPrompt).toContain("使用 2–4 个自然短句");
    expect(chapterPrompt).toContain("语义完整优先于凑固定句数");
    expect(chapterPrompt).toContain("首次出现时说明它与当前任务的关系");
    expect(chapterPrompt).toContain("本章结果必须改变下一章成立时的局面");
    expect(chapterPrompt).toContain("人物位置、关键物品归属和已知线索");
    expect(chapterPrompt).toContain("最后一章不需要引出下一章");
  });

  test("keeps the outline readable while preserving ensemble and knowledge-point boundaries", async () => {
    await createStoryOutlineGenerationDeps().generateOutline({
      task: "根据已确认方向生成大纲。",
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      coursePeople: [],
      conversationHistory: [],
      references: [],
      selectedDirection: { title: "群像冒险", hook: "七兄弟和学生团队护送山心石。", storyHighlight: "能力各异的团队共同闯关。", growthCore: "从各自行动转向共同判断。" },
      currentDirections: [],
      currentOutline: null,
      englishLevel: "A2",
      durationMinutes: 45,
      selectedKnowledgePoints: [{ id: "grammar-1", label: "Daily routines", category: "Grammar" }],
    });

    const prompt = generateOutlineMock.mock.calls.at(-1)?.[0].prompt ?? "";
    expect(prompt).toContain("允许删除、合并或简化方向中不必要的道具、规则和解释");
    expect(prompt).toContain("自行选择最适合当前故事的叙事结构");
    expect(prompt).toContain("不要套用固定的“受挫—调整—成功”框架");
    expect(prompt).toContain("不预设行动路径数量、转折次数或计划改变次数");
    expect(prompt).toContain("保留会改变人物决定、升级冲突或影响结果的事件");
    expect(prompt).toContain("summary 使用 3–4 个自然短句");
    expect(prompt).toContain("首次出现时立刻说明它与当前任务的关系");
    expect(prompt).toContain("语义完整优先于凑固定句数");
    expect(prompt).toContain("同一种“发现信息—重新选择路线—继续前进”");
    expect(prompt).toContain("每句话只表达一个主要事件");
    expect(prompt).toContain("不预设魔法机制、地点、物品或新信息的数量");
    expect(prompt).toContain("具名团队或不可分割的群像");
    expect(prompt).toContain("不要求每名成员拥有独立支线");
    expect(prompt).toContain("先在不考虑知识点的情况下完成故事概括和全部章节剧情");
    expect(prompt).toContain("不得为使用某个知识点新增道具、规则、人物行为或支线");
    expect(prompt).toContain("summary 和 whatHappens 不得出现语法、知识点或教学安排说明");
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
