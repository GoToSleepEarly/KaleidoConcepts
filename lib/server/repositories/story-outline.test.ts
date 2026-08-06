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
  const state = {
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
    decision: "generate_outline",
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
  searchReference: vi.fn(async () => ({
    name: "特朗普",
    type: "public_figure",
    sourceStatus: "confirmed",
    summary: "公众人物，可做课堂化成长改编。",
    usableFacts: ["公众表达", "面对挑战"],
    avoidTopics: ["现实政治争议"],
    adaptationBoundary: "只保留成长主题。",
  })),
  generateOutline: vi.fn(async () => ({
    title: "The Ocean Library",
    summary: "A team learns to solve clues together.",
    characters: [
      {
        displayName: "夏天",
        sourceType: "person",
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
    const decideFreeInput = vi.fn(async () => ({
      decision: "request_reference_material" as const,
      assistantMessage: "这个想法需要更多参考资料。",
      referenceName: "特朗普",
    }));
    const state = await handleStoryOutlineMessage(createDb(), "course-1", {
      message: "我希望参考特朗普的一生讲个课程",
      mode: "idea",
    }, { ...deps, decideFreeInput });

    expect(state.outline).toBeNull();
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual(["supply_reference_material", "choose_reference_search"]);
  });

  test("searches reference material after the chat action", async () => {
    const db = createDb();
    const state = await handleStoryOutlineMessage(db, "course-1", {
      message: "",
      mode: "idea",
      action: "request_reference_search",
      targetId: "特朗普",
    }, deps);

    expect(state.referenceMaterials[0]).toMatchObject({ name: "特朗普", researchProvider: "quickrouter_gpt" });
    expect(state.chatMessages.at(-1)?.actions[0]).toMatchObject({ action: "generate_from_reference" });
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
      message: "请补充学生要和海龟合作",
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
      message: "整体换一个更轻松的方向",
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

    expect(decideFreeInput).toHaveBeenCalled();
    expect(state.outline).toBeNull();
    expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual([
      "supply_reference_material",
      "choose_reference_search",
    ]);
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

    expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({ message: "ocean" }));
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
});
