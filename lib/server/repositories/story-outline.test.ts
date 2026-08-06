import { describe, expect, test, vi } from "vitest";

import {
  CourseStoryOutlineConflictError,
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
  decideFreeInput: vi.fn(async () => ({
    decision: "generate_outline" as const,
    assistantMessage: "可以直接生成故事大纲。",
  })),
  generateDirections: vi.fn(async () => [
    {
      title: "海底图书馆",
      hook: "学生们发现一本会发光的海图。",
      whyFits: "适合团队合作。",
      mainCharacters: ["林老师", "夏天"],
      classroomValue: "观察与表达。",
      seedPrompt: "ocean",
    },
  ]),
  generateReferenceFromKnowledge: vi.fn(async () => [{
    name: "Jett 与 Sage",
    type: "game_character" as const,
    sourceStatus: "confirmed" as const,
    summary: "两位角色的可靠核心设定。",
    usableFacts: ["Jett 擅长机动", "Sage 擅长保护与支援"],
    avoidTopics: [],
    adaptationBoundary: "保留核心设定，改编为适合课堂的冒险。",
  }]),
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
        sourceType: "person" as const,
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

describe("story outline repository", () => {
  test("loads initial state with default settings from course duration", async () => {
    const state = await getStoryOutlineState(createDb(), "course-1");

    expect(state.settings).toEqual({ chapterCount: 4, writingProvider: "quickrouter_gpt" });
    expect(state.outline).toBeNull();
    expect(state.coursePeople.map((person) => person.chineseName)).toEqual(["林老师", "夏天"]);
  });

  test("creates an outline directly for an original idea", async () => {
    const db = createDb();
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "学生们进入海底图书馆",
      mode: "idea",
    }, deps);

    expect(state.chatMessages.map((message) => message.content)).toContain("学生们进入海底图书馆");
    expect(state.outline?.title).toBe("The Ocean Library");
    expect(db.state.logs[0]).toMatchObject({ stage: "story_outline", operation: "generate_outline", status: "succeeded" });
  });

  test("does not generate an outline before high-risk reference material is confirmed", async () => {
    const researchPlan = {
      researchGoal: "提取可转化为成长故事的关键经历",
      packets: [{
        title: "特朗普人生经历",
        subjects: [{ name: "特朗普" }],
        researchQuestions: ["哪些转折最能体现选择与结果？"],
        storyUseGoals: ["构建有因果关系的成长主线"],
      }],
    };
    const decideFreeInput = vi.fn(async () => ({
      decision: "request_reference_material" as const,
      assistantMessage: "这个想法需要更多参考资料。",
      referenceName: "特朗普",
      researchPlan,
      afterResearchAction: "generate_directions" as const,
    }));
    const state = await handleStoryOutlineMessage(createDb(), "course-1", {
      message: "我希望参考特朗普的一生讲个课程",
      mode: "idea",
    }, { ...deps, decideFreeInput });

    expect(state.outline).toBeNull();
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual(["supply_reference_material", "choose_reference_search"]);
    expect(state.chatMessages.at(-1)?.actions[1].researchPlan).toEqual(researchPlan);
    expect(state.chatMessages.at(-1)?.actions[1].afterResearchAction).toBe("generate_directions");
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
      action: "generate_directions",
      label: "确认资料并生成故事方向",
    });
  });

  test("prepares references from model knowledge and waits for teacher confirmation", async () => {
    const db = createDb();
    const researchPlan = {
      researchGoal: "整理两名角色可用于故事的共同设定",
      packets: [{
        title: "Jett 与 Sage",
        subjects: [{ name: "Jett" }, { name: "Sage" }],
        researchQuestions: ["两人的能力和合作关系是什么？"],
        storyUseGoals: ["设计合作冒险"],
      }],
    };
    const decideFreeInput = vi.fn(async () => ({
      decision: "prepare_reference_material" as const,
      assistantMessage: "我先整理已有的角色背景知识。",
      referenceName: "Jett 与 Sage",
      researchPlan,
      afterResearchAction: "generate_directions" as const,
    }));
    const generateReferenceFromKnowledge = vi.fn(deps.generateReferenceFromKnowledge);

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "参考 Jett 和 Sage 生成一个冒险故事",
      mode: "idea",
    }, { ...deps, decideFreeInput, generateReferenceFromKnowledge });

    expect(generateReferenceFromKnowledge).toHaveBeenCalledWith(expect.objectContaining({ researchPlan }));
    expect(state.referenceMaterials[0]).toMatchObject({
      name: "Jett 与 Sage",
      researchProvider: "none",
    });
    expect(state.directions).toEqual([]);
    expect(state.outline).toBeNull();
    expect(state.chatMessages.at(-1)?.content).toBe("参考资料已整理，请确认后继续。");
    expect(state.chatMessages.at(-1)?.actions[0]).toMatchObject({
      action: "generate_directions",
      label: "确认资料并生成故事方向",
    });
  });

  test("waits for teacher confirmation before generating an outline for an explicit mainline", async () => {
    const state = await handleStoryOutlineMessage(createDb(), "course-1", {
      message: "",
      mode: "idea",
      action: "request_reference_search",
      targetId: "Jett",
      afterResearchAction: "generate_outline",
    }, deps);

    expect(state.directions).toEqual([]);
    expect(state.outline).toBeNull();
    expect(state.chatMessages.at(-1)?.actions[0]).toMatchObject({
      action: "generate_from_reference",
      label: "确认资料并生成故事大纲",
    });
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
    await handleStoryOutlineMessage(db, "course-1", {
      message: "学生们进入海底图书馆",
      mode: "idea",
    }, deps);
    const generateOutline = vi.fn(async () => ({
      title: "A New Outline",
      summary: "A new full story outline.",
      characters: [
        {
          displayName: "夏天",
          sourceType: "person" as const,
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
    expect(state.chatMessages.at(-1)?.content).toBe("故事大纲已生成。");
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.label)).toEqual(["重新生成", "继续修改"]);
  });

  test("asks AI to decide free input instead of local keyword detection", async () => {
    const db = createDb();
    const decideFreeInput = vi.fn(async () => ({
      decision: "request_reference_material" as const,
      assistantMessage: "这个对象需要更多资料。",
      referenceName: "Jett",
    }));

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "参考 Jett 做一个故事",
      mode: "idea",
    }, { ...deps, decideFreeInput });

    expect(decideFreeInput).toHaveBeenCalledWith(expect.objectContaining({
      chapterCount: 4,
      coursePeople: expect.arrayContaining([expect.objectContaining({ chineseName: "夏天", age: 10 })]),
      conversationHistory: expect.arrayContaining([
        expect.objectContaining({ role: "teacher", content: "参考 Jett 做一个故事" }),
      ]),
    }));
    expect(state.outline).toBeNull();
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual([
      "supply_reference_material",
      "choose_reference_search",
    ]);
  });

  test("generates direction cards when AI decides free input is broad", async () => {
    const db = createDb();
    const decideFreeInput = vi.fn(async () => ({
      decision: "generate_directions" as const,
      assistantMessage: "这个想法方向明确，但主线还可以先选一个方向。",
    }));
    const generateDirections = vi.fn(deps.generateDirections);

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "写一个冒险故事",
      mode: "idea",
    }, { ...deps, decideFreeInput, generateDirections });

    expect(generateDirections).toHaveBeenCalledWith(expect.objectContaining({
      task: "根据老师当前要求和已确认资料生成 3 个故事方向。",
      chapterCount: 4,
      coursePeople: expect.arrayContaining([expect.objectContaining({ chineseName: "夏天" })]),
      conversationHistory: expect.arrayContaining([
        expect.objectContaining({ role: "teacher", content: "写一个冒险故事" }),
      ]),
    }));
    expect(state.outline).toBeNull();
    expect(state.directions.length).toBeGreaterThan(0);
    expect(state.chatMessages.at(-1)?.content).toBe("我生成了 3 个故事方向，你可以选一个继续。");
  });

  test("saves teacher supplied reference and directly generates outline when AI says it is enough", async () => {
    const db = createDb();
    const decideFreeInput = vi.fn(async () => ({
      decision: "generate_outline" as const,
      assistantMessage: "资料足够，可以生成。",
      teacherReference: {
        name: "马斯克",
        type: "public_figure" as const,
        summary: "老师补充的人物资料。",
        usableFacts: ["创业经历"],
        avoidTopics: ["现实争议"],
        adaptationBoundary: "只做课堂化改编。",
      },
    }));

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "我补充资料：马斯克做过很多工程项目",
      mode: "idea",
    }, { ...deps, decideFreeInput });

    expect(state.referenceMaterials[0]).toMatchObject({ name: "马斯克", sourceStatus: "teacher_supplied", researchProvider: "none" });
    expect(state.outline).not.toBeNull();
  });

  test("saves teacher supplied reference before generating directions for a broad idea", async () => {
    const decideFreeInput = vi.fn(async () => ({
      decision: "generate_directions" as const,
      assistantMessage: "资料足够，先选择故事方向。",
      teacherReference: {
        name: "马斯克",
        type: "public_figure" as const,
        summary: "老师补充的人物资料。",
        usableFacts: ["火箭工程经历"],
        avoidTopics: [],
        adaptationBoundary: "课堂化改编。",
      },
    }));

    const state = await handleStoryOutlineMessage(createDb(), "course-1", {
      message: "我补充资料：马斯克参与火箭工程",
      mode: "idea",
    }, { ...deps, decideFreeInput });

    expect(state.referenceMaterials[0]).toMatchObject({ name: "马斯克", sourceStatus: "teacher_supplied" });
    expect(state.directions).toHaveLength(1);
    expect(state.outline).toBeNull();
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

  test("fills missing teacher reference fields before writing to the database", async () => {
    const db = createDb();
    const decideFreeInput = vi.fn(async () => ({
      decision: "generate_outline" as const,
      assistantMessage: "资料足够，可以生成。",
      referenceName: "Sage",
      teacherReference: {
        type: "game_character" as const,
        summary: "老师补充了 Sage 的治疗能力。",
      } as never,
    }));

    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "我补充资料：Sage 可以治疗队友",
      mode: "idea",
    }, { ...deps, decideFreeInput });

    expect(state.referenceMaterials[0]).toMatchObject({
      name: "Sage",
      usableFacts: [],
      avoidTopics: [],
      sourceStatus: "teacher_supplied",
    });
  });

  test("chooses a random direction and generates outline from its seed prompt", async () => {
    const db = createDb();
    await handleStoryOutlineMessage(db, "course-1", { message: "主题：海底", mode: "random" }, deps);
    const directionId = String(db.state.directions[0]?.id);
    const generateOutline = vi.fn(deps.generateOutline);

    await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "choose_direction",
      targetId: directionId,
    }, { ...deps, generateOutline });

    expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.stringContaining("海底图书馆"),
      selectedDirection: expect.objectContaining({ title: "海底图书馆" }),
      conversationHistory: expect.arrayContaining([
        expect.objectContaining({ role: "teacher", content: expect.stringContaining("我选择故事方向：海底图书馆") }),
      ]),
    }));
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
    await handleStoryOutlineMessage(db, "course-1", {
      message: "学生们进入海底图书馆",
      mode: "idea",
    }, deps);

    await confirmStoryOutline(db, "course-1");

    expect(db.state.updates.at(-1)).toEqual({ currentStage: "teaching_plan" });
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
    await handleStoryOutlineMessage(db, "course-1", { message: "学生们进入海底图书馆", mode: "idea" }, deps);
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
});
