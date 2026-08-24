import { describe, expect, test, vi } from "vitest";

import {
  CourseStoryOutlineConflictError,
  CourseStoryOutlineOperationConflictError,
  confirmStoryOutline,
  getStoryOutlineState,
  handleStoryOutlineMessage,
  resetStoryOutline,
  saveStoryOutline,
  type StoryOutlineDb,
  type StoryOutlineGenerationDeps,
} from "./story-outline";

function record(data: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date("2026-08-06T08:00:00.000Z"),
    updatedAt: new Date("2026-08-06T08:00:00.000Z"),
    ...data,
  };
}

function createDb(overrides: Partial<StoryOutlineDb> = {}) {
  const state: {
    course: Record<string, unknown>;
    messages: Record<string, unknown>[];
    directions: Record<string, unknown>[];
    references: Record<string, unknown>[];
    outline: Record<string, unknown> | null;
    setting: Record<string, unknown> | null;
    chapters: Record<string, unknown>[];
    characters: Record<string, unknown>[];
    logs: Record<string, unknown>[];
    updates: Record<string, unknown>[];
  } = {
    course: record({
      id: "course-1",
      title: "海底图书馆",
      durationMinutes: 45,
      currentStage: "story_outline",
      people: [
        {
          personId: "teacher-1",
          role: "teacher",
          chineseNameSnapshot: "林老师",
          englishNameSnapshot: "Ms. Lin",
          ageSnapshot: 32,
          genderSnapshot: "female",
          visualAssetIdSnapshot: null,
        },
        {
          personId: "student-1",
          role: "student",
          chineseNameSnapshot: "夏天",
          englishNameSnapshot: "Summer",
          ageSnapshot: 10,
          genderSnapshot: "female",
          visualAssetIdSnapshot: null,
        },
      ],
    }),
    messages: [] as Record<string, unknown>[],
    directions: [] as Record<string, unknown>[],
    references: [] as Record<string, unknown>[],
    outline: null as Record<string, unknown> | null,
    setting: null as Record<string, unknown> | null,
    chapters: [] as Record<string, unknown>[],
    characters: [] as Record<string, unknown>[],
    logs: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
  };
  const db: StoryOutlineDb & { state: typeof state } = {
    state,
    course: {
      findUnique: vi.fn(async () => state.course),
      update: vi.fn(async ({ data }) => {
        state.course = { ...state.course, ...data };
        state.updates.push(data);
        return state.course;
      }),
    },
    courseStoryChatMessage: {
      findMany: vi.fn(async () => state.messages),
      create: vi.fn(async ({ data }) => {
        const item = record(data);
        state.messages.push(item);
        return item;
      }),
      deleteMany: vi.fn(async () => {
        state.messages = [];
        return { count: 1 };
      }),
    },
    courseStoryDirection: {
      findMany: vi.fn(async () => state.directions),
      deleteMany: vi.fn(async () => {
        state.directions = [];
        return { count: 1 };
      }),
      createMany: vi.fn(async ({ data }) => {
        state.directions.push(...data.map((item: Record<string, unknown>) => record(item)));
        return { count: data.length };
      }),
      update: vi.fn(async ({ where, data }) => {
        state.directions = state.directions.map((item) => item.id === where.id ? { ...item, ...data } : item);
        return state.directions.find((item) => item.id === where.id) ?? null;
      }),
    },
    courseSourceReference: {
      findMany: vi.fn(async () => state.references),
      create: vi.fn(async ({ data }) => {
        const item = record(data);
        state.references.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }) => {
        state.references = state.references.map((item) => item.id === where.id ? { ...item, ...data } : item);
        return state.references.find((item) => item.id === where.id) ?? null;
      }),
      deleteMany: vi.fn(async () => {
        state.references = [];
        return { count: 1 };
      }),
    },
    courseStoryOutline: {
      findUnique: vi.fn(async () => state.outline ? { ...state.outline, chapters: state.chapters } : null),
      upsert: vi.fn(async ({ create, update }) => {
        state.outline = record(state.outline ? { ...state.outline, ...update } : create);
        return state.outline;
      }),
      deleteMany: vi.fn(async () => {
        state.outline = null;
        state.chapters = [];
        return { count: 1 };
      }),
    },
    courseStorySetting: {
      findUnique: vi.fn(async () => state.setting),
      upsert: vi.fn(async ({ create, update }) => {
        state.setting = record(state.setting ? { ...state.setting, ...update } : create);
        return state.setting;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (!state.setting) return { count: 0 };
        if (where.courseId && state.setting.courseId !== where.courseId) return { count: 0 };
        if (where.stateRevision !== undefined && (state.setting.stateRevision ?? 0) !== where.stateRevision) return { count: 0 };
        if (where.operationRequestId && state.setting.operationRequestId !== where.operationRequestId) return { count: 0 };
        if (where.operationStatus && state.setting.operationStatus !== where.operationStatus) return { count: 0 };
        state.setting = record({ ...state.setting, ...data });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async () => {
        state.setting = null;
        return { count: 1 };
      }),
    },
    courseStoryOutlineChapter: {
      deleteMany: vi.fn(async () => {
        state.chapters = [];
        return { count: 1 };
      }),
      createMany: vi.fn(async ({ data }) => {
        state.chapters.push(...data.map((item: Record<string, unknown>) => record(item)));
        return { count: data.length };
      }),
      update: vi.fn(async ({ where, data }) => {
        state.chapters = state.chapters.map((item) => item.id === where.id ? { ...item, ...data } : item);
        return state.chapters.find((item) => item.id === where.id) ?? null;
      }),
    },
    courseCharacter: {
      findMany: vi.fn(async () => state.characters),
      deleteMany: vi.fn(async () => {
        state.characters = [];
        return { count: 1 };
      }),
      createMany: vi.fn(async ({ data }) => {
        state.characters.push(...data.map((item: Record<string, unknown>) => record(item)));
        return { count: data.length };
      }),
    },
    aiGenerationLog: {
      create: vi.fn(async ({ data }) => {
        state.logs.push(record(data));
        return state.logs.at(-1);
      }),
    },
    $transaction: async (callback) => callback(db),
    ...overrides,
  } as StoryOutlineDb & { state: typeof state };
  return db;
}

const deps: StoryOutlineGenerationDeps = {
  alignRequirements: vi.fn(async () => ({
    status: "ready_for_confirmation" as const,
    planningMode: "explore_options" as const,
    storyMode: "new_story" as const,
    classroomPresence: "participant" as const,
    requiredNamedCharacters: ["暮光闪闪", "云宝黛西"],
    assistantMessage: "请确认创作理解。",
    resolvedUnderstanding: ["海底冒险"],
    unresolvedIssues: [],
    questions: [],
    summary: "创作一个海底冒险，具体主线从 3 个方向中选择。",
  })),
  prepareBackgroundKnowledge: vi.fn(async () => ({ status: "not_needed" as const, reason: "完全原创" })),
  checkChangeBoundary: vi.fn(async () => ({ scope: "within_target" as const, needsBackgroundRefresh: false as const })),
  generateDirections: vi.fn(async () => [
    {
      title: "海底图书馆",
      hook: "学生们发现一本会发光的海图。",
      whyFits: "适合团队合作。",
      mainCharacters: ["林老师", "夏天"],
      storyHighlight: "发光海图会随选择改变路线。",
      growthCore: "学生从依赖提示转向自主判断。",
      classroomValue: "观察与表达。",
      seedPrompt: "ocean",
    },
  ]),
  reviseDirection: vi.fn(async (input) => ({
    ...input.direction,
    hook: `调整后：${input.direction.hook}`,
  })),
  reviseChapter: vi.fn(async (input) => ({
    status: "ready" as const,
    chapter: {
      order: input.chapterOrder,
      title: "改变路线 / A Changed Route",
      whatHappens: "夏天主动改变路线，并承担选择带来的新困难。",
      characterIds: [],
      recommendedKnowledgePointIds: [],
      knowledgePointRecommendationSummary: "练习表达选择与结果。",
    },
  })),
  searchReference: vi.fn(async () => [{
    name: "特朗普",
    type: "public_figure" as const,
    sourceStatus: "confirmed" as const,
    summary: "公众人物，可做课堂化成长改编。",
    usableFacts: ["公众表达", "面对挑战"],
    avoidTopics: ["现实政治争议"],
    adaptationBoundary: "只保留成长主题。",
  }]),
  generateOutline: vi.fn(async () => ({
    title: "The Ocean Library",
    summary: "A team learns to solve clues together.",
    characters: [
      {
        displayName: "夏天",
        englishName: "Summer",
        sourceType: "person" as const,
        sourcePersonId: "student-1",
        roleInStory: "学生主角",
        shortDescription: "喜欢观察线索。",
        shouldAppearInImages: true,
      },
    ],
    chapters: [
      {
        order: 1,
        title: "The Glowing Map",
        storyGoal: "发现线索",
        keyEvents: ["进入图书馆"],
        characterIds: [],
        setting: "海底图书馆",
        endingHook: "地图亮了起来。",
      },
    ],
  })),
};

async function generateConfirmedOutline(db: ReturnType<typeof createDb>) {
  await handleStoryOutlineMessage(db, "course-1", { message: "主题：海底", mode: "random" }, deps);
  const directionId = String(db.state.directions[0]?.id);
  await handleStoryOutlineMessage(db, "course-1", { message: "", mode: "idea", action: "choose_direction", targetId: directionId }, deps);
  return handleStoryOutlineMessage(db, "course-1", { message: "", mode: "idea", action: "confirm_direction", targetId: directionId }, deps);
}

describe("story outline repository", () => {
  test("loads initial state with default settings from course duration", async () => {
    const state = await getStoryOutlineState(createDb(), "course-1");

    expect(state.settings).toEqual({ chapterCount: 4, writingProvider: "quickrouter_gpt" });
    expect(state.outline).toBeNull();
    expect(state.coursePeople.map((person) => person.chineseName)).toEqual(["林老师", "夏天"]);
  });

  test("aligns a broad original idea before generating any story artifact", async () => {
    const db = createDb();
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "学生们进入海底图书馆",
      mode: "idea",
    }, deps);

    expect(state.chatMessages.map((message) => message.content)).toContain("学生们进入海底图书馆");
    expect(state.outline).toBeNull();
    expect(state.alignment).toMatchObject({ status: "ready_for_confirmation", storyMode: "new_story", classroomPresence: "participant", summary: expect.stringContaining("海底冒险") });
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual(["confirm_requirements", "modify_requirements"]);
  });

  test("confirms aligned requirements, prepares background once, then generates directions", async () => {
    const db = createDb();
    const prepareBackgroundKnowledge = vi.fn(deps.prepareBackgroundKnowledge);
    const generateDirections = vi.fn(deps.generateDirections);
    const scopedDeps = { ...deps, prepareBackgroundKnowledge, generateDirections };
    await handleStoryOutlineMessage(db, "course-1", { message: "参考小马宝莉创作新故事", mode: "idea" }, scopedDeps);

    const state = await handleStoryOutlineMessage(db, "course-1", { message: "我确认需求", mode: "idea", action: "confirm_requirements" }, scopedDeps);

    expect(prepareBackgroundKnowledge).toHaveBeenCalledTimes(1);
    expect(prepareBackgroundKnowledge).toHaveBeenCalledWith(expect.objectContaining({
      confirmedRequirement: "创作一个海底冒险，具体主线从 3 个方向中选择。",
      conversationHistory: expect.arrayContaining([expect.objectContaining({ content: "参考小马宝莉创作新故事" })]),
      coursePeople: expect.arrayContaining([expect.objectContaining({ personId: "student-1", age: 10 })]),
    }));
    expect(generateDirections).toHaveBeenCalledTimes(1);
    expect(generateDirections).toHaveBeenCalledWith(expect.objectContaining({
      requiredNamedCharacters: ["暮光闪闪", "云宝黛西"],
    }));
    expect(state.alignment?.status).toBe("confirmed");
    expect(state.directions).toHaveLength(1);
    expect(state.outline).toBeNull();
    expect(state.chatMessages.some((message) => message.role === "system")).toBe(false);
    expect(db.state.messages.filter((message) => message.content === "我确认这份创作理解。")).toHaveLength(1);
    expect(db.state.messages.some((message) => message.content === "我确认需求")).toBe(false);
    expect(db.state.messages.some((message) => message.content === "创作需求已确认，正在创作 3 个不同的故事方向。")).toBe(true);
  });

  test("replaces existing references after a confirmed requirement change needs fresh background", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", { message: "根据《冰雪奇缘》创作新冒险", mode: "idea" }, deps);
    db.state.setting = {
      ...db.state.setting!,
      alignmentDetails: {
        resolvedUnderstanding: ["根据新的作品创作"],
        unresolvedIssues: [],
        questions: [],
        needsBackgroundRefresh: true,
      },
    };
    db.state.references.push(record({
      courseId: "course-1",
      name: "《冰雪奇缘》核心设定",
      type: "ip",
      sourceStatus: "confirmed",
      summary: "已有的冰雪世界和核心角色资料。",
      usableFacts: ["冰雪魔法"],
      avoidTopics: [],
      adaptationBoundary: "创作新剧情。",
      researchProvider: "none",
      confirmedAt: new Date("2026-08-14T00:00:00.000Z"),
    }));
    const prepareBackgroundKnowledge = vi.fn(async () => ({
      status: "ready" as const,
      references: [{
        name: "冰雪奇缘核心设定",
        type: "ip" as const,
        sourceStatus: "confirmed" as const,
        summary: "补充后的冰雪世界和核心角色资料。",
        usableFacts: ["冰雪魔法", "角色能够合作战斗"],
        avoidTopics: [],
        adaptationBoundary: "创作新剧情。",
      }],
    }));

    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "confirm_requirements",
    }, { ...deps, prepareBackgroundKnowledge });

    expect(db.state.references).toHaveLength(1);
    expect(db.state.references[0]).toMatchObject({
      name: "冰雪奇缘核心设定",
      summary: "补充后的冰雪世界和核心角色资料。",
    });
  });

  test("skips background generation when the boundary check says existing material is sufficient", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", { message: "根据一个作品创作新冒险", mode: "idea" }, deps);
    db.state.setting = {
      ...db.state.setting!,
      alignmentStatus: "ready_for_confirmation",
      alignmentSummary: "继续使用同一个作品创作新冒险。",
      alignmentDetails: {
        resolvedUnderstanding: ["继续使用同一个作品"],
        unresolvedIssues: [],
        questions: [],
        needsBackgroundRefresh: false,
      },
    };
    db.state.references.push(record({
      courseId: "course-1",
      name: "同一个作品",
      type: "ip",
      sourceStatus: "confirmed",
      summary: "已有资料。",
      usableFacts: ["核心设定"],
      avoidTopics: [],
      adaptationBoundary: "创作新剧情。",
      researchProvider: "none",
      confirmedAt: new Date("2026-08-14T00:00:00.000Z"),
    }));
    const prepareBackgroundKnowledge = vi.fn(deps.prepareBackgroundKnowledge);

    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "confirm_requirements",
    }, { ...deps, prepareBackgroundKnowledge });

    expect(prepareBackgroundKnowledge).not.toHaveBeenCalled();
    expect(db.state.references).toHaveLength(1);
  });


  test("waits for teacher confirmation after researching a broad idea", async () => {
    const db = createDb();
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "request_reference_search",
      targetId: "特朗普",
    }, deps);

    expect(state.referenceMaterials[0]).toMatchObject({ name: "特朗普", researchProvider: "quickrouter_gpt" });
    expect(state.outline).toBeNull();
    expect(state.directions).toEqual([]);
    expect(state.chatMessages.at(-1)?.content).toBe("资料已整理，请确认后继续。");
    expect(state.chatMessages.at(-1)?.actions[0]).toMatchObject({
      action: "confirm_reference_materials",
      label: "确认参考资料并继续",
    });
  });




  test("rejects incomplete search results and asks the teacher to supply material", async () => {
    const db = createDb();
    const searchReference = vi.fn(async () => [{
      name: "冷门网络小说",
      type: "ip" as const,
      sourceStatus: "insufficient" as const,
      summary: "只能找到零散简介，无法确认完整剧情。",
      usableFacts: [],
      avoidTopics: [],
      adaptationBoundary: "缺少可靠原文信息。",
    }]);
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "request_reference_search",
      targetId: "冷门网络小说",
    }, { ...deps, searchReference });

    expect(state.referenceMaterials).toEqual([]);
    expect(state.chatMessages.at(-1)?.content).toContain("没有整理出足够完整、可用于创作");
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual(["supply_reference_material"]);
  });

  test("generates directions only after the teacher confirms researched material", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "request_reference_search",
      targetId: "特朗普",
    }, deps);

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "generate_directions",
    }, deps);

    expect(state.directions).toHaveLength(1);
    expect(state.outline).toBeNull();
    expect(state.chatMessages.map((message) => message.content)).toContain("我确认参考资料，请生成 3 个故事方向。");
  });

  test("loads direction main character objects as names instead of object strings", async () => {
    const db = createDb();
    db.state.directions = [record({
      courseId: "course-1",
      title: "无声广场",
      hook: "学生们发现城市突然失去声音。",
      whyFits: "适合团队协作。",
      mainCharacters: [
        { displayName: "孟雨老师", englishName: "Ms. Meng" },
        { name: "夏天" },
        "Ethan",
      ],
      storyHighlight: "声音会被回声核吸走。",
      growthCore: "学生学会用不同信号合作。",
      classroomValue: "",
      seedPrompt: "学生们发现城市突然失去声音。",
      selectedAt: null,
    })];

    const state = await getStoryOutlineState(db, "course-1");

    expect(state.directions[0].mainCharacters).toEqual(["孟雨老师", "夏天", "Ethan"]);
  });

  test("generates an outline from confirmed reference material", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "request_reference_search",
      targetId: "特朗普",
    }, deps);
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "generate_from_reference",
    }, deps);

    expect(state.outline?.title).toBe("The Ocean Library");
  });

  test("passes chapter count and user supplement text into outline generation", async () => {
    const db = createDb();
    const generateOutline = vi.fn(deps.generateOutline);
    await handleStoryOutlineMessage(db, "course-1", {
      message: "请补充学生要和海龟合作",
      mode: "idea",
      action: "generate_from_reference",
      chapterCount: 5,
    }, { ...deps, generateOutline });

    expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({
      task: "请补充学生要和海龟合作",
      chapterCount: 5,
      writingProvider: "quickrouter_gpt",
      coursePeople: expect.arrayContaining([expect.objectContaining({ chineseName: "夏天", age: 10 })]),
    }));
    expect(db.state.outline).toMatchObject({ chapterCount: 5 });
  });

  test("regenerates the whole outline from the current chat action", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    const generateOutline = vi.fn(async () => ({
      title: "A New Outline",
      summary: "A new full story outline.",
      characters: [
        {
          displayName: "夏天",
          englishName: "Summer",
          sourceType: "person" as const,
          sourcePersonId: "student-1",
          roleInStory: "学生主角",
          shortDescription: "重新生成后的角色描述。",
          shouldAppearInImages: true,
        },
      ],
      chapters: [
        {
          order: 1,
          title: "New Chapter",
          storyGoal: "新的剧情目标",
          keyEvents: ["重新出发"],
          characterIds: [],
          setting: "新场景",
          endingHook: "新的悬念。",
        },
      ],
    }));

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "整体换一个更轻松的方向",
      mode: "revise",
      action: "regenerate_outline",
    }, { ...deps, generateOutline });

    expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({
      task: "整体换一个更轻松的方向",
    }));
    expect(state.outline?.title).toBe("A New Outline");
    expect(state.alignment?.artifactsOutdated).toBe(false);
    expect(state.chatMessages.at(-1)?.content).toBe("故事大纲已更新，右侧显示的是最新版本。");
  });







  test("searches and persists every packet in the AI research plan", async () => {
    const db = createDb();
    const researchPlan = {
      researchGoal: "分别补足两个独立对象的故事知识",
      packets: [
        { title: "Jett 与 Sage", subjects: [{ name: "Jett" }, { name: "Sage" }], researchQuestions: ["两人的能力、动机和关系是什么？"], storyUseGoals: ["设计合作冒险"] },
        { title: "火山环境", subjects: [{ name: "火山" }], researchQuestions: ["火山环境有哪些可视化风险？"], storyUseGoals: ["建立冒险障碍"] },
      ],
    };
    const searchReference = vi.fn(async () => [
      { name: "Jett 与 Sage", type: "game_character" as const, sourceStatus: "confirmed" as const, summary: "两名角色的组合资料。", usableFacts: ["能力互补"], avoidTopics: [], adaptationBoundary: "保留核心设定。" },
      { name: "火山环境", type: "other" as const, sourceStatus: "confirmed" as const, summary: "火山冒险环境资料。", usableFacts: ["熔岩流会改变路线"], avoidTopics: [], adaptationBoundary: "科学事实优先。" },
    ]);

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "choose_reference_search",
      targetId: "Jett、Sage 和火山",
      researchPlan,
    }, { ...deps, searchReference });

    expect(searchReference).toHaveBeenCalledWith(expect.objectContaining({
      researchPlan,
      conversationHistory: expect.arrayContaining([expect.objectContaining({ role: "teacher" })]),
    }));
    expect(state.referenceMaterials.map((reference) => reference.name)).toEqual(["Jett 与 Sage", "火山环境"]);
  });


  test("selects a direction and generates the outline in one operation", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", { message: "主题：海底", mode: "random" }, deps);
    const directionId = String(db.state.directions[0]?.id);
    const generateOutline = vi.fn(deps.generateOutline);

    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "confirm_direction",
      targetId: directionId,
    }, { ...deps, generateOutline });

    expect(db.state.directions.find((direction) => direction.id === directionId)?.selectedAt).toBeInstanceOf(Date);
    expect(db.state.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "teacher", content: "我选择并生成故事大纲：海底图书馆" }),
    ]));
    expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({
      task: "请基于已确认方向生成大纲：海底图书馆",
      selectedDirection: expect.objectContaining({ title: "海底图书馆" }),
      conversationHistory: [],
      currentDirections: [],
    }));
  });

  test("keeps the selected direction when outline generation fails so the same operation can be retried", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", { message: "主题：海底", mode: "random" }, deps);
    const directionId = String(db.state.directions[0]?.id);
    const generateOutline = vi.fn(async () => { throw new Error("大纲生成暂时失败"); });

    await expect(handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "confirm_direction",
      targetId: directionId,
    }, { ...deps, generateOutline })).rejects.toThrow("大纲生成暂时失败");

    expect(db.state.directions.find((direction) => direction.id === directionId)?.selectedAt).toBeInstanceOf(Date);
    expect(db.state.outline).toBeNull();
    expect(db.state.setting?.operationStatus).toBe("failed");
    expect(db.state.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "大纲生成暂时失败。你可以重试本步，或修改要求后重新提交。",
      actions: [expect.objectContaining({ action: "retry_operation", targetId: db.state.setting?.operationRequestId })],
    });

    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "retry_operation",
    }, { ...deps, generateOutline: deps.generateOutline });

    expect(db.state.outline).not.toBeNull();
    expect(db.state.messages.filter((message) => String(message.content).startsWith("我选择并生成故事大纲："))).toHaveLength(1);
  });

  test("revises one chapter without replacing characters or other chapters", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    const originalCharacters = [...db.state.characters];
    const targetId = db.state.chapters[0]?.id;
    const reviseChapter = vi.fn(deps.reviseChapter);

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "让这一章出现一次更困难的选择",
      mode: "revise",
      action: "revise_chapter",
      targetChapterOrder: 1,
    }, { ...deps, reviseChapter });

    expect(reviseChapter).toHaveBeenCalledWith(expect.objectContaining({ chapterOrder: 1, task: "让这一章出现一次更困难的选择", currentOutline: expect.objectContaining({ title: "The Ocean Library" }) }));
    expect(db.state.chapters.find((chapter) => chapter.id === targetId)).toMatchObject({ title: "改变路线 / A Changed Route", storyGoal: expect.stringContaining("承担选择") });
    expect(db.state.characters).toEqual(originalCharacters);
    expect(state.chatMessages.at(-1)?.content).toContain("其他章节和角色保持不变");
  });

  test("explains a requirement-changing edit and waits for confirmation before realignment", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    const checkChangeBoundary = vi.fn(async () => ({ scope: "new_requirement" as const, reason: "故事主题从海底冒险改为二战历史", needsBackgroundRefresh: true }));
    const alignRequirements = vi.fn(async () => ({
      status: "ready_for_confirmation" as const,
      planningMode: "explore_options" as const,
      storyMode: "new_story" as const,
      classroomPresence: "participant" as const,
      assistantMessage: "请确认新的创作理解。",
      resolvedUnderstanding: ["二战历史故事"],
      unresolvedIssues: [],
      questions: [],
      summary: "将当前故事整体改为适龄的二战历史故事，接下来提供 3 个历史视角。",
    }));
    const generateOutline = vi.fn(deps.generateOutline);

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "修改成二战故事",
      mode: "revise",
      action: "revise_outline",
      requestId: "request-change-story",
    }, { ...deps, checkChangeBoundary, alignRequirements, generateOutline });

    expect(checkChangeBoundary).toHaveBeenCalled();
    expect(alignRequirements).not.toHaveBeenCalled();
    expect(generateOutline).not.toHaveBeenCalled();
    expect(state.outline).not.toBeNull();
    expect(state.alignment?.pendingChange).toMatchObject({
      kind: "requirement_change",
      request: "修改成二战故事",
      reason: "故事主题从海底冒险改为二战历史",
      needsBackgroundRefresh: true,
    });
    expect(state.chatMessages.at(-1)?.content).toContain("故事主题从海底冒险改为二战历史");
    expect(state.chatMessages.at(-1)?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "confirm_story_change", label: "调整创作需求并继续" }),
      expect.objectContaining({ action: "cancel_story_change", label: "保留当前内容" }),
    ]));

    const confirmed = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "revise",
      action: "confirm_story_change",
    }, { ...deps, checkChangeBoundary, alignRequirements, generateOutline });

    expect(alignRequirements).toHaveBeenCalledTimes(1);
    expect(alignRequirements).toHaveBeenCalledWith(expect.objectContaining({
      replyContext: "requirement_change",
      needsBackgroundRefresh: true,
    }));
    expect(generateOutline).not.toHaveBeenCalled();
    expect(confirmed.alignment).toMatchObject({ status: "ready_for_confirmation", summary: expect.stringContaining("二战"), needsBackgroundRefresh: true, artifactsOutdated: true });
    expect(confirmed.alignment?.pendingChange).toBeUndefined();
    expect(confirmed.chatMessages.at(-1)?.actions[0]).toMatchObject({ label: "确认修改需求" });
  });

  test("cancels a pending requirement change without touching the current outline", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    const originalOutline = db.state.outline;
    const alignRequirements = vi.fn(deps.alignRequirements);
    const checkChangeBoundary = vi.fn(async () => ({ scope: "new_requirement" as const, reason: "改变原作结局会离开忠实讲述模式", needsBackgroundRefresh: false }));

    await handleStoryOutlineMessage(db, "course-1", {
      message: "让灰姑娘和王子远走高飞",
      mode: "revise",
      action: "revise_outline",
    }, { ...deps, checkChangeBoundary, alignRequirements });
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "revise",
      action: "cancel_story_change",
    }, { ...deps, checkChangeBoundary, alignRequirements });

    expect(alignRequirements).not.toHaveBeenCalled();
    expect(db.state.outline).toEqual(originalOutline);
    expect(state.alignment?.pendingChange).toBeUndefined();
    expect(state.chatMessages.at(-1)?.content).toContain("已保留当前内容");
  });

  test("confirms an outline-wide impact without restarting requirement alignment", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    const alignRequirements = vi.fn(deps.alignRequirements);
    const generateOutline = vi.fn(deps.generateOutline);
    const checkChangeBoundary = vi.fn(async () => ({ scope: "outline_revision" as const, reason: "这个结局会改变前面多章的因果铺垫", needsBackgroundRefresh: false as const }));

    const pending = await handleStoryOutlineMessage(db, "course-1", {
      message: "让第一章的选择最终改变结局",
      mode: "revise",
      action: "revise_chapter",
      targetChapterOrder: 1,
    }, { ...deps, checkChangeBoundary, alignRequirements, generateOutline });

    expect(generateOutline).not.toHaveBeenCalled();
    expect(pending.alignment?.pendingChange).toMatchObject({ kind: "outline_revision", targetScope: "chapter" });
    const pendingId = pending.alignment?.pendingChange?.id;
    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "revise",
      action: "confirm_story_change",
      targetId: pendingId,
    }, { ...deps, checkChangeBoundary, alignRequirements, generateOutline });

    expect(alignRequirements).not.toHaveBeenCalled();
    expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({ task: expect.stringContaining("让第一章的选择最终改变结局") }));
  });

  test("keeps the refresh decision through another alignment round and replaces old references", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    db.state.references.push(record({
      courseId: "course-1",
      name: "旧作品资料",
      type: "ip",
      sourceStatus: "confirmed",
      summary: "旧资料",
      usableFacts: ["旧设定"],
      avoidTopics: [],
      adaptationBoundary: "旧边界",
      researchProvider: "none",
      confirmedAt: new Date(),
    }));
    db.state.setting = record({
      ...db.state.setting,
      courseId: "course-1",
      alignmentStatus: "needs_clarification",
      planningMode: "explore_options",
      alignmentSummary: null,
      alignmentDetails: {
        resolvedUnderstanding: [],
        unresolvedIssues: ["确认新作品"],
        questions: [],
        needsBackgroundRefresh: true,
        artifactsOutdated: true,
      },
    });
    const alignRequirements = vi.fn(async () => ({
      status: "ready_for_confirmation" as const,
      planningMode: "explore_options" as const,
      storyMode: "new_story" as const,
      classroomPresence: "participant" as const,
      assistantMessage: "请确认。",
      resolvedUnderstanding: ["改用新作品"],
      unresolvedIssues: [],
      questions: [],
      summary: "改用新作品创作故事。",
    }));
    const prepareBackgroundKnowledge = vi.fn(async () => ({
      status: "ready" as const,
      references: [{
        name: "新作品资料",
        type: "ip" as const,
        sourceStatus: "confirmed" as const,
        summary: "新资料",
        usableFacts: ["新设定"],
        avoidTopics: [],
        adaptationBoundary: "新边界",
      }],
    }));

    await handleStoryOutlineMessage(db, "course-1", {
      message: "使用新作品",
      mode: "idea",
      action: "submit_alignment_answers",
    }, { ...deps, alignRequirements, prepareBackgroundKnowledge });
    const aligned = await getStoryOutlineState(db, "course-1");
    expect(aligned.alignment).toMatchObject({ needsBackgroundRefresh: true, artifactsOutdated: true });

    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "confirm_requirements",
    }, { ...deps, alignRequirements, prepareBackgroundKnowledge });

    expect(db.state.references).toHaveLength(1);
    expect(db.state.references[0]).toMatchObject({ name: "新作品资料", summary: "新资料" });
  });

  test("does not execute the same request id twice", async () => {
    const db = createDb();
    const alignRequirements = vi.fn(deps.alignRequirements);
    const scopedDeps = { ...deps, alignRequirements };
    const input = { message: "学生进入海底图书馆", mode: "idea" as const, requestId: "same-request" };

    await handleStoryOutlineMessage(db, "course-1", input, scopedDeps);
    await handleStoryOutlineMessage(db, "course-1", input, scopedDeps);

    expect(alignRequirements).toHaveBeenCalledTimes(1);
    expect(db.state.messages.filter((message) => message.content === input.message)).toHaveLength(1);
  });

  test("retries a failed confirmed requirement operation without asking for confirmation again", async () => {
    const db = createDb();
    const prepareBackgroundKnowledge = vi.fn()
      .mockRejectedValueOnce(new Error("背景资料生成超时"))
      .mockResolvedValueOnce({ status: "not_needed", reason: "无需补充资料", references: [] });
    const scopedDeps = { ...deps, prepareBackgroundKnowledge };
    await handleStoryOutlineMessage(db, "course-1", { message: "学生进入海底图书馆", mode: "idea" }, scopedDeps);

    await expect(handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "confirm_requirements",
      requestId: "confirm-failed",
    }, scopedDeps)).rejects.toThrow("背景资料生成超时");

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "retry_operation",
      requestId: "confirm-retry",
    }, scopedDeps);

    expect(prepareBackgroundKnowledge).toHaveBeenCalledTimes(2);
    expect(state.directions.length).toBeGreaterThan(0);
    expect(db.state.messages.filter((message) => message.content === "我确认这份创作理解。")).toHaveLength(1);
  });

  test("does not let a late AI result overwrite a reset", async () => {
    const db = createDb();
    let finishGeneration!: (value: Awaited<ReturnType<typeof deps.generateDirections>>) => void;
    const generateDirections = vi.fn(() => new Promise<Awaited<ReturnType<typeof deps.generateDirections>>>((resolve) => { finishGeneration = resolve; }));
    const running = handleStoryOutlineMessage(db, "course-1", {
      message: "海底冒险",
      mode: "random",
      requestId: "slow-generation",
    }, { ...deps, generateDirections });
    await vi.waitFor(() => expect(generateDirections).toHaveBeenCalledTimes(1));

    await resetStoryOutline(db, "course-1");
    finishGeneration(await deps.generateDirections({} as never));

    await expect(running).rejects.toBeInstanceOf(CourseStoryOutlineOperationConflictError);
    expect((await getStoryOutlineState(db, "course-1")).directions).toEqual([]);
  });

  test("resets story outline state without changing course audience", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", { message: "学生们进入海底图书馆", mode: "idea" }, deps);

    const state = await resetStoryOutline(db, "course-1");

    expect(state.chatMessages).toEqual([]);
    expect(state.directions).toEqual([]);
    expect(state.referenceMaterials).toEqual([]);
    expect(state.outline).toBeNull();
    expect(state.coursePeople.length).toBeGreaterThan(0);
  });

  test("confirms the story outline and advances to teaching plan", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);

    await confirmStoryOutline(db, "course-1");

    expect(db.state.updates.at(-1)).toEqual({ currentStage: "teaching_plan" });
  });

  test("reconfirming a viewed outline does not move a later course backwards", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    db.state.course = { ...db.state.course, currentStage: "preview" };

    const course = await confirmStoryOutline(db, "course-1");

    expect(course.currentStage).toBe("preview");
    expect(db.state.updates.at(-1)).not.toEqual({ currentStage: "teaching_plan" });
  });

  test("requires reset confirmation when saving after downstream work exists", async () => {
    const db = createDb();
    db.state.course = { ...db.state.course, currentStage: "content" };

    await expect(saveStoryOutline(db, "course-1", {
      title: "New",
      summary: "Summary",
      chapterCount: 4,
      writingProvider: "quickrouter_gpt",
      chapters: [],
      characters: [],
      sourceReferences: [],
    }, false)).rejects.toBeInstanceOf(CourseStoryOutlineConflictError);
  });

  test("saves concise chapter fields through existing chapter columns", async () => {
    const db = createDb();
    await generateConfirmedOutline(db);
    const state = await getStoryOutlineState(db, "course-1");
    const outline = state.outline!;

    await saveStoryOutline(db, "course-1", {
      ...outline,
      chapters: outline.chapters.map((chapter) => ({
        ...chapter,
        whatHappens: "学生收到冒险任务。",
        characterActions: "夏天决定带队出发。",
        mainlineProgress: "队伍离开教室进入第一段旅程。",
      })),
    }, false);

    expect(db.state.chapters[0]).toMatchObject({
      storyGoal: "学生收到冒险任务。",
      keyEvents: ["夏天决定带队出发。", "队伍离开教室进入第一段旅程。"],
      setting: "",
      endingHook: "",
    });
  });

  test("normalizes chapter story goal arrays before persistence", async () => {
    const db = createDb();
    await saveStoryOutline(db, "course-1", {
      title: "Silent City",
      summary: "Students restore sound.",
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      characters: [],
      sourceReferences: [],
      chapters: [{
        order: 1,
        title: "Silent Square",
        storyGoal: [
          "回声巨兽吸走广场上的声音。",
          "学生们发现城市陷入寂静。",
        ] as unknown as string,
        keyEvents: [],
        characterIds: [],
        setting: "",
        endingHook: "",
      }],
    }, false);

    expect(db.state.chapters[0]).toMatchObject({
      storyGoal: "回声巨兽吸走广场上的声音。学生们发现城市陷入寂静。",
    });
  });

  test("持久化边界拒绝没有参考资料关联的引用角色", async () => {
    const db = createDb();

    await expect(saveStoryOutline(db, "course-1", {
      title: "Jett Story",
      summary: "Jett joins the class.",
      chapterCount: 1,
      writingProvider: "quickrouter_gpt",
      chapters: [],
      characters: [{
        displayName: "捷特",
        englishName: "Jett",
        sourceType: "referenced",
        sourcePersonId: null,
        sourceReferenceId: null,
        roleInStory: "带领学生完成训练。",
        shortDescription: "带领学生完成训练。",
        visualDescription: null,
        shouldAppearInImages: true,
      }],
      sourceReferences: [],
    }, false)).rejects.toThrow("引用角色 捷特 缺少有效参考资料关联");
  });
});
