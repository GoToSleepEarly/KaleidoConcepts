import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CourseStoryMessageInput, CourseStoryOutlineState } from "@/lib/contracts/api";

import { CourseStoryOutlineWorkspace } from "./course-story-outline-workspace";

const themePresets = [
  { id: "theme-space", kind: "theme" as const, label: "太空探索", category: "科学与未来", sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "theme-robot", kind: "theme" as const, label: "机器人", category: "科学与未来", sortOrder: 1, createdAt: "", updatedAt: "" },
  { id: "theme-ocean", kind: "theme" as const, label: "海洋生态", category: "自然与生态", sortOrder: 2, createdAt: "", updatedAt: "" },
];
const storyTypePresets = [
  { id: "type-adventure", kind: "story_type" as const, label: "冒险", category: "故事类型", sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "type-detective", kind: "story_type" as const, label: "侦探推理", category: "故事类型", sortOrder: 1, createdAt: "", updatedAt: "" },
];
const storyTonePresets = [
  { id: "tone-warm", kind: "story_tone" as const, label: "温暖治愈", category: "故事氛围", sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "tone-tense", kind: "story_tone" as const, label: "紧张刺激", category: "故事氛围", sortOrder: 1, createdAt: "", updatedAt: "" },
];

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const emptyState: CourseStoryOutlineState = {
  course: {
    id: "course-1",
    title: "海底图书馆",
    durationMinutes: 45,
    currentStage: "story_outline",
  },
  chatMessages: [],
  settings: {
    chapterCount: 4,
    writingProvider: "quickrouter_gpt",
  },
  directions: [],
  referenceMaterials: [],
  outline: null,
  coursePeople: [],
};

const outlineState: CourseStoryOutlineState = {
  ...emptyState,
  outline: {
    id: "outline-1",
    courseId: "course-1",
    chapterCount: 4,
    title: "海底图书馆 / The Ocean Library",
    summary: "学生合作寻找线索。 / Students solve clues together.",
    writingProvider: "quickrouter_gpt",
    sourceReferences: [],
    characters: [
      {
        id: "char-1",
      courseId: "course-1",
      displayName: "夏天",
      englishName: "Summer",
        sourceType: "person",
        sourcePersonId: null,
        sourceReferenceId: null,
        roleInStory: "学生主角",
        shortDescription: "喜欢观察线索。",
        visualDescription: null,
        shouldAppearInImages: true,
        createdAt: "2026-08-06T08:00:00.000Z",
        updatedAt: "2026-08-06T08:00:00.000Z",
      },
    ],
    chapters: [
      {
        id: "chapter-1",
        order: 1,
        title: "发光地图 / The Glowing Map",
        storyGoal: "夏天在海底图书馆发现发光地图，林老师引导大家确认任务，团队决定一起寻找失落的蓝色书页。",
        keyEvents: ["进入图书馆"],
        characterIds: [],
        setting: "海底图书馆",
        endingHook: "地图亮了起来。",
      },
    ],
    createdAt: "2026-08-06T08:00:00.000Z",
    updatedAt: "2026-08-06T08:00:00.000Z",
  },
};

function fetchBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const callsWithBody = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.body !== undefined);
  const init = callsWithBody[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}

function fetchBodyCallCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.body !== undefined).length;
}

function fetchPostCallCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST").length;
}

describe("CourseStoryOutlineWorkspace", () => {
  beforeEach(() => {
    vi.useRealTimers();
    pushMock.mockReset();
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("shows guided idea input and keeps the right panel empty before results exist", () => {
    render(<CourseStoryOutlineWorkspace initialState={emptyState} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);

    expect(screen.getByTestId("story-outline-layout")).toHaveAttribute("data-layout", "focus");
    expect(screen.getByTestId("story-outline-layout")).toHaveClass("max-w-5xl");
    expect(screen.getByRole("heading", { name: "故事大纲" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toBeInTheDocument();
    expect(screen.getByText("说说你的故事想法")).toBeInTheDocument();
    expect(screen.getByText("可以写参考人物、IP、故事类型，以及希望老师学生如何参与。例如：老师和学生一起穿越到魔法世界经历了一场奇幻冒险。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始讨论故事" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "随机灵感" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));
    expect(screen.getByRole("button", { name: "选择主题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择故事类型" })).toHaveTextContent("不限");
    expect(screen.getByRole("button", { name: "选择故事氛围" })).toHaveTextContent("不限");
    expect(screen.queryByRole("combobox", { name: "故事类型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "故事氛围" })).not.toBeInTheDocument();
    expect(screen.queryByText("选择基本方向，也可以补充一个特别要求。")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "补充要求（可选）" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例如：希望学生成为大侦探")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "故事想法" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 3 个故事方向" })).toBeInTheDocument();
    expect(screen.queryByText("还没有生成结果")).not.toBeInTheDocument();
  });

  test("shows knowledge point labels without a Step 2 word recommendation and names the teaching-plan stage", () => {
    const state = structuredClone(outlineState);
    state.course = { ...state.course, englishLevel: "A1", durationMinutes: 30 };
    state.selectedKnowledgePoints = [
      { id: "knowledge-2", label: "Present Simple", category: "时态" },
      { id: "knowledge-3", label: "Present Continuous", category: "时态" },
      { id: "knowledge-4", label: "Past Continuous", category: "时态" },
    ];
    state.unrecommendedKnowledgePoints = [state.selectedKnowledgePoints[2]];
    state.outline!.chapters[0] = {
      ...state.outline!.chapters[0],
      recommendedKnowledgePointIds: ["knowledge-2", "knowledge-3"],
      knowledgePointRecommendationSummary: "Present Simple 描述固定状态；Present Continuous 描述正在发生的行动。",
    };

    render(<CourseStoryOutlineWorkspace initialState={state} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);

    expect(screen.getByText("Present Simple")).toBeInTheDocument();
    expect(screen.getByText("Present Continuous")).toBeInTheDocument();
    expect(screen.queryByText(/^KP\d+$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^建议\s+\d+\s+词$/)).not.toBeInTheDocument();
    expect(screen.getByText("已根据 A1 难度和 30 分钟课时智能匹配。Past Continuous 暂未放入章节推荐，可在下一阶段：教学规划手动调整。")).toBeInTheDocument();
  });

  test("switches to an iPad-compatible two-column layout only after a result exists", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    expect(screen.getByTestId("story-outline-layout")).toHaveAttribute("data-layout", "split");
    expect(screen.getByTestId("story-outline-layout")).toHaveClass("min-h-0", "lg:grid-cols-[minmax(300px,0.85fr)_minmax(360px,1.15fr)]");
    expect(screen.getByTestId("story-outline-layout")).toHaveClass("lg:h-[calc(100dvh-13.5rem)]");
    expect(screen.getByTestId("story-mobile-view-tabs")).toHaveClass("shrink-0", "lg:hidden");
    expect(screen.getByTestId("story-chat-pane")).toHaveClass("min-h-0", "overflow-hidden", "lg:h-full");
    expect(screen.getByTestId("story-chat-scroll")).toHaveClass("overflow-y-auto", "overscroll-contain", "touch-pan-y");
    expect(screen.getByTestId("story-result-scroll")).toHaveClass("lg:h-full", "overflow-y-auto", "overscroll-contain");
    expect(screen.getByTestId("story-mobile-view-tabs")).toHaveClass("lg:hidden");
    expect(screen.queryByTestId("story-step-mobile-actions")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-chat-settings")).toHaveClass("grid-cols-2");
    expect(screen.getByTestId("story-chat-settings")).not.toHaveClass("grid-cols-1");
    expect(screen.getByTestId("story-step-footer")).toHaveClass("hidden", "lg:sticky", "lg:bottom-4");
    expect(screen.getByTestId("story-step-footer")).not.toHaveClass("sticky");
    expect(screen.getByRole("button", { name: "故事大纲" })).toHaveClass("min-h-11");
  });

  test("keeps the mobile chat controls reachable by scrolling the message list inside the pane", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      chatMessages: [
        { id: "assistant-1", courseId: "course-1", role: "assistant", content: "第一条消息", actions: [], createdAt: "2026-08-18T12:00:00.000Z" },
        { id: "teacher-1", courseId: "course-1", role: "teacher", content: "第二条消息", actions: [], createdAt: "2026-08-18T12:01:00.000Z" },
      ],
    }} />);

    expect(screen.getByTestId("story-outline-shell")).toHaveClass("flex", "max-lg:h-[calc(100dvh-7.25rem)]", "max-lg:overflow-hidden");
    expect(screen.getByTestId("story-outline-layout")).toHaveClass("min-h-0", "max-lg:flex-1", "max-lg:overflow-hidden");
    expect(screen.getByTestId("story-outline-layout")).toHaveClass("max-lg:grid-rows-[auto_minmax(0,1fr)]");
    expect(screen.getByTestId("story-chat-pane")).toHaveClass("min-h-0", "overflow-hidden");
    expect(screen.getByTestId("story-chat-scroll")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto", "touch-pan-y");
    expect(screen.getByTestId("story-chat-composer")).toHaveClass("shrink-0");
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.queryByTestId("story-step-mobile-actions")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-step-footer")).toHaveClass("hidden", "lg:flex");
    expect(screen.getByTestId("story-result-scroll")).toHaveClass("min-h-0", "overflow-y-auto");
  });

  test("lets compact Step 2 settings share one row with clear labels", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    const settings = screen.getByTestId("story-chat-settings");
    expect(settings).toHaveClass("grid-cols-2");
    expect(screen.getByText("章节数")).toBeInTheDocument();
    expect(screen.getByText("写作模型")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "章节数" })).toHaveClass("h-9");
    expect(screen.getByRole("combobox", { name: "写作模型" })).toHaveClass("h-9");
  });

  test("lets phone and iPad portrait switch between chat and result without scrolling to the other pane", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    const tabs = screen.getByTestId("story-mobile-view-tabs");
    const chatPane = screen.getByTestId("story-chat-pane");
    const resultPane = screen.getByTestId("story-result-scroll");

    expect(tabs).toHaveClass("lg:hidden");
    expect(screen.getByRole("button", { name: "聊天" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "结果" })).toHaveAttribute("aria-pressed", "false");
    expect(chatPane).not.toHaveClass("hidden");
    expect(resultPane).toHaveClass("hidden", "lg:block");

    fireEvent.click(screen.getByRole("button", { name: "结果" }));

    expect(screen.getByRole("button", { name: "聊天" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "结果" })).toHaveAttribute("aria-pressed", "true");
    expect(chatPane).toHaveClass("hidden", "lg:flex");
    expect(resultPane).not.toHaveClass("hidden");

    fireEvent.click(screen.getByRole("button", { name: "聊天" }));

    expect(screen.getByRole("button", { name: "聊天" })).toHaveAttribute("aria-pressed", "true");
    expect(chatPane).not.toHaveClass("hidden");
    expect(resultPane).toHaveClass("hidden", "lg:block");
  });

  test("keeps the chat timeline at the bottom when a result is shown", () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(480);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      chatMessages: [{ id: "assistant-result", courseId: "course-1", role: "assistant", content: "故事方向已经生成。", actions: [], createdAt: "2026-08-18T12:00:00.000Z" }],
    }} />);

    expect(screen.getByTestId("story-chat-scroll").scrollTop).toBe(480);
    scrollHeight.mockRestore();
  });

  test("does not silently discard an unsent chat draft when navigating steps", () => {
    render(<CourseStoryOutlineWorkspace initialState={emptyState} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), { target: { value: "先不要丢掉这段想法" } });
    fireEvent.click(screen.getByRole("link", { name: "基础信息" }));
    expect(screen.getByRole("heading", { name: "放弃未发送的内容？" })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "放弃并离开" }));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/audience");
  });

  test("reloads persisted unselected directions when re-entering Step 2 with a stale empty page state", async () => {
    const persistedState: CourseStoryOutlineState = {
      ...emptyState,
      chatMessages: [{
        id: "assistant-directions",
        courseId: "course-1",
        role: "assistant",
        content: "故事方向已经生成。",
        actions: [],
        createdAt: "2026-08-21T08:00:00.000Z",
      }],
      directions: ["协作突围", "技能接力", "老师的最后一课"].map((title, index) => ({
        id: `direction-${index + 1}`,
        courseId: "course-1",
        title,
        hook: `第 ${index + 1} 个超级英雄故事方向。`,
        whyFits: "四名学生都能参与推进故事。",
        mainCharacters: ["学生一", "学生二", "学生三", "学生四", "老师"],
        classroomValue: "团队合作",
        seedPrompt: `第 ${index + 1} 个超级英雄故事方向。`,
        selectedAt: null,
        createdAt: `2026-08-21T08:00:0${index}.000Z`,
      })),
    };
    const fetchMock = vi.fn(async () => Response.json(persistedState));
    vi.stubGlobal("fetch", fetchMock);

    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/story-outline",
      { cache: "no-store" },
    ));
    expect(await screen.findByText("协作突围")).toBeInTheDocument();
    expect(screen.getByText("技能接力")).toBeInTheDocument();
    expect(screen.getByText("老师的最后一课")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "选择并生成大纲" })).toHaveLength(3);
  });

  test("renders persisted AI progress messages while a multi-round request is still running", async () => {
    vi.useFakeTimers();
    let finishPost: ((response: Response) => void) | undefined;
    const intermediateState: CourseStoryOutlineState = {
      ...emptyState,
      chatMessages: [
        { id: "teacher-1", courseId: "course-1", role: "teacher", content: "我的故事想法：\n写一个冒险故事", actions: [], createdAt: "2026-08-07T00:00:00.000Z" },
        { id: "assistant-1", courseId: "course-1", role: "assistant", content: "已理解故事想法，正在创作 3 个不同的故事方向。", actions: [], createdAt: "2026-08-07T00:00:01.000Z" },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { finishPost = resolve; });
      return Promise.resolve(Response.json(intermediateState));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), { target: { value: "写一个冒险故事" } });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(screen.getByText("已理解故事想法，正在创作 3 个不同的故事方向。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/story-outline", { cache: "no-store" });
    await act(async () => { finishPost?.(Response.json(intermediateState)); await Promise.resolve(); });
  });

  test("formats the random form as a teacher chat message", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={emptyState} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);

    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));
    fireEvent.click(screen.getByRole("button", { name: "选择主题" }));
    fireEvent.click(screen.getByRole("tab", { name: /科学与未来/ }));
    fireEvent.click(screen.getByRole("button", { name: "太空探索" }));
    fireEvent.click(screen.getByRole("button", { name: "确认主题" }));
    expect(screen.getByRole("button", { name: "选择主题" })).toHaveTextContent("科学与未来 / 太空探索");
    fireEvent.click(screen.getByRole("button", { name: "选择故事类型" }));
    fireEvent.click(screen.getByRole("button", { name: "冒险" }));
    fireEvent.click(screen.getByRole("button", { name: "确认故事类型" }));
    fireEvent.click(screen.getByRole("button", { name: "选择故事氛围" }));
    fireEvent.click(screen.getByRole("button", { name: "紧张刺激" }));
    fireEvent.click(screen.getByRole("button", { name: "确认故事氛围" }));
    fireEvent.change(screen.getByRole("textbox", { name: "补充要求（可选）" }), {
      target: { value: "希望学生和老师共同参与" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成 3 个故事方向" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      mode: "random",
      message: "请帮我生成随机故事方向。\n\n主题：科学与未来 / 太空探索\n故事类型：冒险\n故事氛围：紧张刺激\n补充要求：希望学生和老师共同参与",
    }));
  });

  test("supports custom story type and tone in the shared card picker", () => {
    render(<CourseStoryOutlineWorkspace initialState={emptyState} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);
    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));

    fireEvent.click(screen.getByRole("button", { name: "选择故事类型" }));
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    expect(screen.getByRole("textbox", { name: "自定义故事类型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认故事类型" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "自定义故事类型" }), { target: { value: "带有多次时空跳跃与团队协作任务的公路喜剧" } });
    fireEvent.click(screen.getByRole("button", { name: "确认故事类型" }));
    expect(screen.getByRole("button", { name: "选择故事类型" })).toHaveTextContent("带有多次时空跳跃与团队协作任务的公路喜剧");
    expect(screen.getByRole("button", { name: "选择故事类型" }).querySelector("span")).toHaveClass("line-clamp-2", "break-words");

    fireEvent.click(screen.getByRole("button", { name: "选择故事氛围" }));
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    expect(screen.getByRole("textbox", { name: "自定义故事氛围" })).toBeInTheDocument();
  });

  test("forwards the AI research plan when a teacher starts reference search", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    const researchPlan = {
      researchGoal: "提取可用于成长故事的关键经历",
      packets: [{ title: "特朗普人生经历", subjects: [{ name: "特朗普" }], researchQuestions: ["关键转折是什么？"], storyUseGoals: ["构建成长主线"] }],
    };
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [
        {
          id: "m1",
          courseId: "course-1",
          role: "assistant",
          content: "这个想法涉及真实人物或已有角色。我先整理参考资料，避免设定编错。",
          actions: [{ id: "a1", label: "整理参考资料", action: "request_reference_search", targetId: "特朗普", researchPlan }],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByText("这个想法涉及真实人物或已有角色。我先整理参考资料，避免设定编错。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "整理参考资料" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({ researchPlan }));
  });

  test("shows only the useful read-only reference content", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      referenceMaterials: [
        {
          id: "ref-1",
          courseId: "course-1",
          name: "特朗普",
          type: "public_figure",
          sourceStatus: "confirmed",
          summary: "公众人物，可做课堂化成长改编。",
          usableFacts: ["公众表达"],
          avoidTopics: ["现实政治争议"],
          adaptationBoundary: "只保留成长主题。",
          researchProvider: "quickrouter_gpt",
          confirmedAt: "2026-08-06T08:00:00.000Z",
          createdAt: "2026-08-06T08:00:00.000Z",
          updatedAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByRole("heading", { name: "参考资料" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "特朗普" })).toBeInTheDocument();
    expect(screen.getByText("公众人物，可做课堂化成长改编。")).toBeInTheDocument();
    expect(screen.getByText("公众表达")).toBeInTheDocument();
    expect(screen.getByText("参考资料中的角色是创作候选，不代表都会在最终故事中出场。")).toBeInTheDocument();
    expect(screen.queryByLabelText("引用对象")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("资料摘要")).not.toBeInTheDocument();
    expect(screen.queryByText("现实政治争议")).not.toBeInTheDocument();
    expect(screen.queryByText("只保留成长主题。")).not.toBeInTheDocument();
  });

  test("does not expose internal reference metadata", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      referenceMaterials: [
        {
          id: "ref-1",
          courseId: "course-1",
          name: "马斯克",
          type: "public_figure",
          sourceStatus: "teacher_supplied",
          summary: "老师补充资料。",
          usableFacts: ["工程项目"],
          avoidTopics: ["争议"],
          adaptationBoundary: "课堂化改编。",
          researchProvider: "none",
          confirmedAt: "2026-08-06T08:00:00.000Z",
          createdAt: "2026-08-06T08:00:00.000Z",
          updatedAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.queryByText("资料来源：老师补充")).not.toBeInTheDocument();
    expect(screen.queryByText("争议")).not.toBeInTheDocument();
  });

  test("keeps ambiguous object confirmation in chat instead of rendering a candidate card on the right", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [
        {
          id: "m1",
          courseId: "course-1",
          role: "assistant",
          content: "我不确定你指的是哪一个 Jett。请补充一下具体对象。",
          actions: [],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByText("我不确定你指的是哪一个 Jett。请补充一下具体对象。")).toBeInTheDocument();
    expect(screen.queryByText("候选对象")).not.toBeInTheDocument();
    expect(screen.queryByText("还没有生成结果")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-outline-layout")).toHaveAttribute("data-layout", "focus");
  });

  test("visually identifies AI and teacher chat messages", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [
        {
          id: "teacher-message",
          courseId: "course-1",
          role: "teacher",
          content: "我想创作一个海底故事。",
          actions: [],
          createdAt: "2026-08-14T00:00:00.000Z",
        },
        {
          id: "assistant-message",
          courseId: "course-1",
          role: "assistant",
          content: "建议按这个方向创作。",
          actions: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    }} />);

    expect(screen.getByRole("img", { name: "老师" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "AI 助手" })).toBeInTheDocument();
  });

  test("submits teacher input to the message endpoint", async () => {
    const nextState = {
      ...emptyState,
      chatMessages: [
        {
          id: "m1",
          courseId: "course-1",
          role: "teacher" as const,
          content: "学生们进入海底图书馆",
          actions: [],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi.fn(async () => Response.json(nextState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "学生们进入海底图书馆" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/story-outline/message",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(fetchBody(fetchMock)).toMatchObject({
      message: "我的故事想法：\n学生们进入海底图书馆",
      requestId: expect.any(String),
    });
  });

  test("uses accurate model and flow status copy", async () => {
    const responsePromise = new Promise<Response>(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [{
        id: "confirm-copy",
        courseId: "course-1",
        role: "assistant",
        content: "请确认创作理解。",
        actions: [{ id: "confirm-requirements", label: "确认需求", action: "confirm_requirements" }],
        createdAt: "2026-08-14T00:00:00.000Z",
      }],
    }} />);

    expect(screen.getByRole("option", { name: "GPT" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("故事想法"), { target: { value: "我确认需求" } });
    fireEvent.click(screen.getByRole("button", { name: "确认需求" }));
    expect(screen.getByText("我确认这份创作理解。")).toBeInTheDocument();
    expect(screen.queryByText("确认需求", { selector: "article p" })).not.toBeInTheDocument();
    expect(screen.getByText("正在准备故事创作")).toBeInTheDocument();
    expect(fetchBody(vi.mocked(fetch))).toMatchObject({ message: "", action: "confirm_requirements" });
    expect(screen.getByLabelText("故事想法")).toHaveValue("我确认需求");
  });

  test("describes reference confirmation without implying another requirement decision", async () => {
    const responsePromise = new Promise<Response>(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [{
        id: "confirm-reference-copy",
        courseId: "course-1",
        role: "assistant",
        content: "资料已整理，请确认后继续。",
        actions: [{ id: "confirm-reference", label: "确认参考资料并继续", action: "confirm_reference_materials" }],
        createdAt: "2026-08-14T00:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "确认参考资料并继续" }));
    expect(screen.getByText("我确认这些参考资料，请继续。")).toBeInTheDocument();
    expect(screen.getByText("正在继续构思故事")).toBeInTheDocument();
  });

  test("confirms only the current pending story change and preserves the composer draft", () => {
    const responsePromise = new Promise<Response>(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      alignment: {
        status: "confirmed",
        planningMode: "follow_defined_plot",
        storyMode: "faithful",
        classroomPresence: "observer",
        resolvedUnderstanding: [],
        unresolvedIssues: [],
        questions: [],
        pendingChange: {
          id: "pending-current",
          kind: "requirement_change",
          request: "改变原作结局",
          reason: "会离开忠实讲述模式",
          targetScope: "outline",
          needsBackgroundRefresh: false,
        },
      },
      chatMessages: [{
        id: "impact-confirmation",
        courseId: "course-1",
        role: "assistant",
        content: "改变原作结局会离开忠实讲述模式。是否继续？",
        actions: [
          { id: "stale", label: "旧确认", action: "confirm_story_change", targetId: "pending-old" },
          { id: "current", label: "调整创作需求并继续", action: "confirm_story_change", targetId: "pending-current" },
        ],
        createdAt: "2026-08-14T00:00:00.000Z",
      }],
    }} />);

    expect(screen.queryByRole("button", { name: "旧确认" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("故事想法"), { target: { value: "另一条尚未发送的想法" } });
    fireEvent.click(screen.getByRole("button", { name: "调整创作需求并继续" }));

    expect(fetchBody(vi.mocked(fetch))).toMatchObject({ action: "confirm_story_change", targetId: "pending-current", message: "" });
    expect(screen.getByLabelText("故事想法")).toHaveValue("另一条尚未发送的想法");
    expect(screen.getByText("正在应用已确认的故事修改")).toBeInTheDocument();
  });

  test("restores a persisted running operation after refresh", async () => {
    vi.useFakeTimers();
    const completedState = { ...emptyState, operation: null };
    const fetchMock = vi.fn(async () => Response.json(completedState));
    vi.stubGlobal("fetch", fetchMock);

    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      operation: {
        requestId: "request-running",
        action: "confirm_requirements",
        phase: "generating_directions",
        status: "running",
        errorMessage: null,
        startedAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:00.000Z",
      },
    }} />);

    expect(screen.getAllByText("正在构思 3 个故事方向").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "处理中" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/story-outline", { cache: "no-store" });
  });

  test("shows a persisted failed operation with a retry action", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      operation: {
        requestId: "request-failed",
        action: "confirm_requirements",
        phase: "preparing_reference",
        status: "failed",
        errorMessage: "故事大纲生成超时，请稍后重试",
        startedAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:01:00.000Z",
      },
    }} />);

    expect(screen.getByText("故事大纲生成超时，请稍后重试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试本步" })).toBeInTheDocument();
  });

  test("shows alignment format repair as a visible running phase", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      operation: {
        requestId: "request-repairing",
        action: "idea",
        phase: "repairing_alignment_format",
        status: "running",
        errorMessage: null,
        startedAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:10.000Z",
      },
    }} />);

    expect(screen.getAllByText("AI 返回格式需要整理，正在自动修复").length).toBeGreaterThan(0);
  });

  test("reconciles an accepted failed request without restoring or resending the original text", async () => {
    const failedState: CourseStoryOutlineState = {
      ...emptyState,
      chatMessages: [
        { id: "teacher-1", courseId: "course-1", role: "teacher", content: "我的故事想法：\n学生进入海底图书馆", actions: [], createdAt: "2026-08-14T00:00:00.000Z" },
        { id: "failed-1", courseId: "course-1", role: "assistant", content: "AI 返回的需求对齐内容不是有效 JSON，自动修复后仍未通过。", actions: [{ id: "retry-request-1", label: "重试本步", action: "retry_operation", targetId: "request-1" }], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
      operation: {
        requestId: "request-1",
        action: "idea",
        phase: "repairing_alignment_format",
        status: "failed",
        errorMessage: "AI 返回的需求对齐内容不是有效 JSON，自动修复后仍未通过。",
        startedAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:01.000Z",
      },
    };
    vi.spyOn(crypto, "randomUUID").mockReturnValue("request-1");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as CourseStoryMessageInput;
        if (body.action === "retry_operation") return Response.json({ ...failedState, operation: null });
        return Response.json({ message: failedState.operation?.errorMessage, errorCode: "STORY_ALIGNMENT_INVALID_JSON", requestId: "request-1" }, { status: 502 });
      }
      return Response.json(failedState);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    const textbox = screen.getByRole("textbox", { name: "故事想法" });
    fireEvent.change(textbox, { target: { value: "学生进入海底图书馆" } });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));

    await waitFor(() => expect(screen.getByText("AI 返回的需求对齐内容不是有效 JSON，自动修复后仍未通过。")).toBeInTheDocument());
    expect(textbox).toHaveValue("");
    expect(screen.getAllByText(/学生进入海底图书馆/)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "重试本步" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "重试本步" }));
    await waitFor(() => expect(fetchBody(fetchMock, 1)).toMatchObject({ action: "retry_operation", message: "" }));
  });

  test("restores the draft only when the server cannot confirm receiving the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    const textbox = screen.getByRole("textbox", { name: "故事想法" });
    fireEvent.change(textbox, { target: { value: "学生进入海底图书馆" } });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));

    await waitFor(() => expect(textbox).toHaveValue("学生进入海底图书馆"));
    expect(screen.getByText("请求未能确认送达，请检查网络后重新发送。")).toBeInTheDocument();
  });

  test("clears the composer as soon as the teacher sends an idea", async () => {
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    const textbox = screen.getByRole("textbox", { name: "故事想法" });
    fireEvent.change(textbox, { target: { value: "学生们进入海底图书馆" } });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));

    expect(textbox).toHaveValue("");
    expect(screen.queryByText("继续补充或修改")).not.toBeInTheDocument();
    expect(screen.getByText("正在理解你的故事想法")).toBeInTheDocument();

    await act(async () => {
      resolveResponse(Response.json(emptyState));
      await responsePromise;
    });
  });

  test("sends supplement text together with chat action", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [
        {
          id: "m1",
          courseId: "course-1",
          role: "assistant",
          content: "资料已整理。",
          actions: [{ id: "a1", label: "用这些资料生成大纲", action: "generate_from_reference" }],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "补充：学生要和角色一起合作解谜" },
    });
    fireEvent.click(screen.getByRole("button", { name: "用这些资料生成大纲" }));

    await waitFor(() => {
      const body = fetchBody(fetchMock);
      expect(body).toMatchObject({
        action: "generate_from_reference",
        message: "补充：学生要和角色一起合作解谜",
      });
    });
  });

  test("supports regenerating the whole outline from the chat controls", async () => {
    const fetchMock = vi.fn(async () => Response.json(outlineState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      chatMessages: [
        {
          id: "m-generated",
          courseId: "course-1",
          role: "assistant",
          content: "故事大纲已生成。",
          actions: [{ id: "regenerate-outline", label: "重新生成", action: "regenerate_outline" }],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "整体换一个更轻松的方向" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => {
      const body = fetchBody(fetchMock);
      expect(body).toMatchObject({
        action: "regenerate_outline",
        mode: "revise",
        message: "整体换一个更轻松的方向",
      });
    });
  });

  test("does not show a persistent regenerate button outside generated chat actions", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    expect(screen.queryByRole("button", { name: "重新生成" })).not.toBeInTheDocument();
  });

  test("continue modify prefills the input without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      chatMessages: [
        {
          id: "m-generated",
          courseId: "course-1",
          role: "assistant",
          content: "故事大纲已生成。",
          actions: [{ id: "continue", label: "继续修改", action: "confirm_reference_object" }],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "继续修改" }));

    expect(screen.getByRole("textbox", { name: "故事想法" })).toHaveValue("帮我修改：");
    expect(fetchBodyCallCount(fetchMock)).toBe(0);
  });

  test("selects a random direction from the right panel", async () => {
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetchMock = vi.fn(() => responsePromise);
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      directions: [{
        id: "direction-1",
        courseId: "course-1",
        title: "海底谜题",
        hook: "一本发光海图出现。",
        whyFits: "适合合作。",
        mainCharacters: ["夏天"],
        classroomValue: "观察表达",
        seedPrompt: "ocean clue",
        selectedAt: null,
        createdAt: "2026-08-06T08:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "选择并生成大纲" }));

    const selectionMessage = screen.getByText("我选择并生成故事大纲：海底谜题");
    expect(selectionMessage).toBeInTheDocument();
    expect(selectionMessage.closest("article")).toHaveTextContent(/^我选择并生成故事大纲：海底谜题$/);

    await waitFor(() => {
      const body = fetchBody(fetchMock);
      expect(body).toMatchObject({ action: "confirm_direction", targetId: "direction-1" });
    });
    await act(async () => {
      resolveResponse(Response.json(outlineState));
      await responsePromise;
    });
  });

  test("asks before regenerating an outline that already has later results", async () => {
    const fetchMock = vi.fn(async () => Response.json(outlineState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      course: { ...outlineState.course, currentStage: "preview" },
      chatMessages: [{ id: "m-generated", courseId: "course-1", role: "assistant", content: "故事大纲已生成。", actions: [{ id: "regenerate-outline", label: "重新生成", action: "regenerate_outline" }], createdAt: "2026-08-06T08:00:00.000Z" }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    expect(screen.getByRole("heading", { name: "重新生成会清除后续内容" })).toBeInTheDocument();
    expect(screen.getByText(/教学规划、文案与练习、视觉资源、图片和预览发布设置/)).toBeInTheDocument();
    expect(fetchBodyCallCount(fetchMock)).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "确认并重新生成" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({ action: "regenerate_outline", resetDownstream: true }));
  });

  test("asks before revising a chapter that already has a teaching plan", async () => {
    const fetchMock = vi.fn(async () => Response.json(outlineState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      course: { ...outlineState.course, currentStage: "teaching_plan" },
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "修改本章" }));
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "修改第 1 章：增加一次困难选择" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByRole("heading", { name: "修改故事大纲会清除后续内容" })).toBeInTheDocument();
    expect(fetchBodyCallCount(fetchMock)).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "清空后续内容并继续" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      action: "revise_chapter",
      resetDownstream: true,
      targetChapterOrder: 1,
    }));
  });

  test("shows the reset dialog when the server finds downstream data behind a stale course stage", async () => {
    let postCount = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json(outlineState);
      postCount += 1;
      return postCount === 1
        ? Response.json({ message: "需要重置", requiresReset: true }, { status: 409 })
        : Response.json(outlineState);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    fireEvent.click(screen.getByRole("button", { name: "修改本章" }));
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "修改第 1 章：增加一次困难选择" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "修改故事大纲会清除后续内容" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "清空后续内容并继续" }));

    await waitFor(() => expect(fetchBody(fetchMock, 1)).toMatchObject({ action: "revise_chapter", resetDownstream: true }));
  });

  test("lands on the outline when one response adds references and finishes the outline", async () => {
    const reference = {
      id: "ref-1",
      courseId: "course-1",
      name: "海洋资料",
      type: "knowledge_topic" as const,
      sourceStatus: "confirmed" as const,
      summary: "海底图书馆的背景资料。",
      usableFacts: ["海洋生态"],
      avoidTopics: [],
      adaptationBoundary: "适合课堂改编。",
      researchProvider: "quickrouter_gpt" as const,
      confirmedAt: "2026-08-14T08:00:00.000Z",
      createdAt: "2026-08-14T08:00:00.000Z",
      updatedAt: "2026-08-14T08:00:00.000Z",
    };
    const fetchMock = vi.fn(async () => Response.json({ ...outlineState, referenceMaterials: [reference] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      directions: [{
        id: "direction-1", courseId: "course-1", title: "海底谜题", hook: "一本发光海图出现。", whyFits: "适合合作。", mainCharacters: ["夏天"], classroomValue: "观察表达", seedPrompt: "ocean clue", selectedAt: null, createdAt: "2026-08-06T08:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "选择并生成大纲" }));

    await waitFor(() => expect(screen.getByText("剧情概述")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "海洋资料" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "故事大纲" })).toHaveClass("bg-primary");
  });

  test("keeps background references available while the teacher chooses a story direction", () => {
    const reference = {
      id: "ref-1", courseId: "course-1", name: "海洋背景资料", type: "other" as const, sourceStatus: "confirmed" as const,
      summary: "故事发生在一座海底图书馆。", usableFacts: ["图书馆由海洋生物共同维护"], avoidTopics: [], adaptationBoundary: "适合课堂创作。",
      researchProvider: "quickrouter_gpt" as const, confirmedAt: "2026-08-14T08:00:00.000Z", createdAt: "2026-08-14T08:00:00.000Z", updatedAt: "2026-08-14T08:00:00.000Z",
    };
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      referenceMaterials: [reference],
      directions: [{
        id: "direction-1", courseId: "course-1", title: "海底谜题", hook: "一本发光海图出现。", whyFits: "适合合作。", mainCharacters: ["夏天"], classroomValue: "观察表达", seedPrompt: "ocean clue", selectedAt: null, createdAt: "2026-08-15T08:00:00.000Z",
      }],
    }} />);

    expect(screen.getByRole("button", { name: "故事方向" })).toHaveClass("bg-primary");
    fireEvent.click(screen.getByRole("button", { name: "参考资料" }));
    expect(screen.getByRole("heading", { name: "海洋背景资料" })).toBeInTheDocument();
    expect(screen.getByText("故事发生在一座海底图书馆。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "故事方向" }));
    expect(screen.getByRole("button", { name: "选择并生成大纲" })).toBeEnabled();
  });

  test("renders AI clarification as a mixed-choice form and submits every answer", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [{
        id: "alignment-1",
        courseId: "course-1",
        role: "assistant",
        content: "还需要确认两个会改变故事方向的问题。",
        actions: [{
          id: "submit-alignment",
          label: "提交回答",
          action: "submit_alignment_answers",
          questions: [
            { id: "usage", label: "怎样使用小马宝莉角色？", required: true, answerMode: "single_choice", options: [{ id: "new", label: "使用角色创作新剧情" }], allowCustom: true },
            { id: "roles", label: "希望哪些角色出场？", required: true, answerMode: "text", allowCustom: true },
          ],
        }],
        createdAt: "2026-08-12T00:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByText("使用角色创作新剧情"));
    fireEvent.change(screen.getByPlaceholderText("输入你的回答"), { target: { value: "暮光闪闪和云宝" } });
    fireEvent.click(screen.getByRole("button", { name: "确认回答并继续" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      action: "submit_alignment_answers",
      alignmentAnswers: { usage: "使用角色创作新剧情", roles: "暮光闪闪和云宝" },
    }));
  });

  test("shows every option, puts the recommendation first with its reason, and hides internal ids", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [{
        id: "alignment-recommendations",
        courseId: "course-1",
        role: "assistant",
        content: "只需要确认一个会改变故事本质的选择。",
        actions: [{
          id: "submit-recommendations",
          label: "确认建议",
          action: "submit_alignment_answers",
          questions: [
            {
              id: "usage",
              label: "怎样使用原作？",
              required: true,
              answerMode: "single_choice",
              options: [
                { id: "follow_original", label: "忠实讲述原剧情" },
                { id: "new_story", label: "使用原作人物创作新剧情" },
                { id: "theme_only", label: "只借用主题重新创作" },
              ],
              allowCustom: true,
              recommendedOptionId: "new_story",
              recommendationReason: "老师已经提出新的课堂冒险。",
            },
          ],
        }],
        createdAt: "2026-08-13T00:00:00.000Z",
      }],
    }} />);

    expect(screen.getByText("使用原作人物创作新剧情（推荐）")).toBeInTheDocument();
    expect(screen.getByText("忠实讲述原剧情")).toBeInTheDocument();
    expect(screen.getByText("只借用主题重新创作")).toBeInTheDocument();
    expect(screen.getByText("老师已经提出新的课堂冒险。")).toBeInTheDocument();
    expect(screen.queryByText("new_story")).not.toBeInTheDocument();
    expect(screen.queryByText("采用 AI 推荐")).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "确认回答并继续" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      action: "submit_alignment_answers",
      alignmentAnswers: {
        usage: "使用原作人物创作新剧情",
      },
    }));
  });

  test("renders a separate fallback input for every malformed choice question", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [{
        id: "alignment-fallback",
        courseId: "course-1",
        role: "assistant",
        content: "请补充信息。",
        actions: [{
          id: "submit-fallback",
          label: "提交回答",
          action: "submit_alignment_answers",
          questions: [
            { id: "first", label: "第一个问题", required: true, answerMode: "single_choice", allowCustom: false },
            { id: "second", label: "第二个问题", required: true, answerMode: "single_choice", allowCustom: false },
          ],
        }],
        createdAt: "2026-08-13T00:00:00.000Z",
      }],
    }} />);

    expect(screen.getByLabelText("第一个问题回答")).toBeInTheDocument();
    expect(screen.getByLabelText("第二个问题回答")).toBeInTheDocument();
  });

  test("lets the teacher revise a direction before selecting it and then generates in one click", async () => {
    const selectedState: CourseStoryOutlineState = {
      ...emptyState,
      directions: [{
        id: "direction-1", courseId: "course-1", title: "情绪天气城",
        hook: "暮光闪闪和云宝误入情绪会改变天气的城市，必须在风暴吞没城市前帮助居民表达真实感受。",
        storyHighlight: "情绪直接改变天气和道路。", growthCore: "从压抑情绪转向理解和表达。",
        whyFits: "适合讨论情绪表达。", mainCharacters: ["暮光闪闪", "云宝"], seedPrompt: "weather", selectedAt: null, createdAt: "2026-08-12T00:00:00.000Z",
      }],
    };
    const fetchMock = vi.fn(async () => Response.json(selectedState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={selectedState} />);

    expect(screen.getByText("情绪直接改变天气和道路。")).toBeInTheDocument();
    expect(screen.getByText("从压抑情绪转向理解和表达。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "调整这张卡" }));
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), { target: { value: "调整故事方向「情绪天气城」：保留角色，把城市改成漂浮在梦境里" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({ action: "revise_direction", targetId: "direction-1", message: expect.stringContaining("保留角色") }));

    fireEvent.click(screen.getByRole("button", { name: "选择并生成大纲" }));
    await waitFor(() => expect(fetchBody(fetchMock, 1)).toMatchObject({ action: "confirm_direction", targetId: "direction-1" }));
  });

  test("keeps all generated directions in a final read-only tab after the outline exists", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      directions: [
        { id: "direction-1", courseId: "course-1", title: "海底图书馆", hook: "寻找失落书页。", whyFits: "适合合作。", mainCharacters: ["夏天"], seedPrompt: "library", selectedAt: "2026-08-06T07:00:00.000Z", createdAt: "2026-08-06T07:00:00.000Z" },
        { id: "direction-2", courseId: "course-1", title: "珊瑚邮局", hook: "送回迷路的信。", whyFits: "适合表达。", mainCharacters: ["夏天"], seedPrompt: "post", selectedAt: null, createdAt: "2026-08-06T07:00:00.000Z" },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "故事方向" }));
    expect(screen.getByText("故事方向已确定，仅供查看")).toBeInTheDocument();
    expect(screen.getByText("海底图书馆")).toBeInTheDocument();
    expect(screen.getByText("珊瑚邮局")).toBeInTheDocument();
    expect(screen.getByText("已选择")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择并生成大纲" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整这张卡" })).not.toBeInTheDocument();
  });

  test("shows newly generated directions before an existing outline", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      directions: [{
        id: "direction-new",
        courseId: "course-1",
        title: "新的中文方向",
        hook: "重新选择一条故事主线。",
        whyFits: "符合老师最新修改。",
        mainCharacters: ["夏天"],
        classroomValue: "合作表达",
        seedPrompt: "新的故事方向",
        selectedAt: null,
        createdAt: "2026-08-06T08:00:00.000Z",
      }],
    }} />);

    expect(screen.getByRole("heading", { name: "故事方向" })).toBeInTheDocument();
    expect(screen.getByText("新的中文方向")).toBeInTheDocument();
    expect(screen.queryByText("剧情概述")).not.toBeInTheDocument();
    expect(screen.getByText("都不合适？告诉我你希望的故事方向，我会重新生成。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "描述我想要的方向" })).toBeInTheDocument();
  });

  test("moves the cursor to the end when prefilling a direction request", async () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      directions: [{
        id: "direction-new",
        courseId: "course-1",
        title: "新的中文方向",
        hook: "重新选择一条故事主线。",
        whyFits: "符合老师最新修改。",
        mainCharacters: ["夏天"],
        classroomValue: "合作表达",
        seedPrompt: "新的故事方向",
        selectedAt: null,
        createdAt: "2026-08-06T08:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "描述我想要的方向" }));
    const input = screen.getByRole("textbox", { name: "故事想法" }) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(input).toHaveFocus();
      expect(input).toHaveValue("我希望的故事方向：");
      expect(input.selectionStart).toBe("我希望的故事方向：".length);
      expect(input.selectionEnd).toBe("我希望的故事方向：".length);
    });
  });

  test("routes direction edits to the shared chat composer", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      directions: [{
        id: "direction-new",
        courseId: "course-1",
        title: "新的中文方向",
        hook: "重新选择一条故事主线。",
        whyFits: "符合老师最新修改。",
        mainCharacters: ["夏天"],
        classroomValue: "合作表达",
        seedPrompt: "新的故事方向",
        selectedAt: null,
        createdAt: "2026-08-06T08:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "调整这张卡" }));
    expect(screen.queryByText("只修改这张方向卡")).not.toBeInTheDocument();
    expect(screen.getByText("正在修改：故事方向「新的中文方向」")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toHaveValue("调整故事方向「新的中文方向」：");
  });

  test("lets the teacher describe a specific way to use the source story", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [{
        id: "m-usage",
        courseId: "course-1",
        role: "assistant",
        content: "你希望怎么讲这个故事？",
        actions: [{ id: "custom-usage", label: "我有具体想法", action: "describe_story_usage" }],
        createdAt: "2026-08-07T08:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "我有具体想法" }));
    expect(screen.getByRole("textbox", { name: "故事想法" })).toHaveValue("我希望这样讲这个故事：");
  });

  test("shows loading message while a request is pending", async () => {
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "学生们进入海底图书馆" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));

    expect((await screen.findAllByText("正在理解你的故事想法")).length).toBeGreaterThan(0);
    await act(async () => {
      resolveResponse(Response.json(emptyState));
      await responsePromise;
    });
  });

  test("shows elapsed seconds and long-wait hint while generating", async () => {
    vi.useFakeTimers();
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "写一个冒险故事" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始讨论故事" }));

    await act(async () => {
      vi.advanceTimersByTime(16_000);
    });

    expect(screen.getAllByText(/16s/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/正在准备下一步内容/).length).toBeGreaterThan(0);

    await act(async () => {
      resolveResponse(Response.json(emptyState));
      await responsePromise;
    });
  });

  test("restarts Step2 through the reset endpoint after the custom confirmation", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      chatMessages: [{
        id: "m1",
        courseId: "course-1",
        role: "teacher",
        content: "我的故事想法：海底冒险",
        actions: [],
        createdAt: "2026-08-06T08:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "重新开始本轮构思" }));
    expect(screen.getByText(/将立即删除故事构思、教学规划、文案与练习、视觉资源、图片和预览发布设置/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空并重新开始" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/story-outline/reset",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  test("keeps reference material read-only", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      referenceMaterials: [
        {
          id: "ref-1",
          courseId: "course-1",
          name: "特朗普",
          type: "public_figure",
          sourceStatus: "confirmed",
          summary: "公众人物，可做课堂化成长改编。",
          usableFacts: ["公众表达"],
          avoidTopics: ["现实政治争议"],
          adaptationBoundary: "只保留成长主题。",
          researchProvider: "quickrouter_gpt",
          confirmedAt: "2026-08-06T08:00:00.000Z",
          createdAt: "2026-08-06T08:00:00.000Z",
          updatedAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.queryByRole("button", { name: "保存参考资料" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("资料摘要")).not.toBeInTheDocument();
  });

  test("separates outline, roles, and references into tabs", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    expect(screen.getByRole("button", { name: "故事大纲" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "参考资料" })).toBeInTheDocument();
    expect(screen.getByText("剧情概述")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修改本章" }).parentElement).toHaveClass("border-t");

    fireEvent.click(screen.getByRole("button", { name: "角色" }));
    expect(screen.getByText("故事出场角色")).toBeInTheDocument();
    expect(screen.queryByText("剧情概述")).not.toBeInTheDocument();
  });

  test("does not repeat the same generated role description in a character card", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      outline: outlineState.outline ? {
        ...outlineState.outline,
        characters: outlineState.outline.characters.map((character) => ({
          ...character,
          shortDescription: character.roleInStory,
        })),
      } : null,
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "角色" }));
    expect(screen.queryByText("学生主角", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/课堂人物 · 学生主角/)).toBeInTheDocument();
  });

  test("routes chapter and outline edits through the shared chat composer with explicit targets", () => {
    const responsePromise = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn(() => responsePromise);
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    fireEvent.click(screen.getByRole("button", { name: "修改本章" }));
    expect(screen.queryByLabelText("第 1 章修改要求")).not.toBeInTheDocument();
    expect(screen.getByText("正在修改：第 1 章")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "故事想法" });
    expect(input).toHaveValue("修改第 1 章：");
    fireEvent.change(input, { target: { value: "修改第 1 章：增加一次困难选择" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(fetchBody(fetchMock)).toMatchObject({
      action: "revise_chapter",
      targetChapterOrder: 1,
      message: "修改第 1 章：增加一次困难选择",
    });
  });

  test("moves whole-outline editing to the shared chat composer", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    fireEvent.click(screen.getByRole("button", { name: "修改整体大纲" }));
    expect(screen.queryByLabelText("整体大纲修改要求")).not.toBeInTheDocument();
    expect(screen.getByText("正在修改：整体大纲")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toHaveValue("修改整体大纲：");
    fireEvent.click(screen.getByRole("button", { name: "取消修改" }));
    expect(screen.queryByText("正在修改：整体大纲")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toHaveValue("");
  });

  test("shows only story characters and hides audience-only people", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      coursePeople: [
        {
          personId: "teacher-1",
          role: "teacher",
          chineseName: "林老师",
          englishName: "Ms. Lin",
          age: 30,
          gender: "female",
          visualAssetId: null,
          visualUrl: null,
          profileChanged: false,
        },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "角色" }));

    expect(screen.getByText("夏天")).toBeInTheDocument();
    expect(screen.getByText("Summer")).toBeInTheDocument();
    expect(screen.getByText("课堂人物 · 学生主角")).toBeInTheDocument();
    expect(screen.getByText("喜欢观察线索。")).toBeInTheDocument();
    expect(screen.queryByText("林老师 · Ms. Lin")).not.toBeInTheDocument();
  });

  test("renders a read-only Chinese outline for chat-based revision", () => {
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    expect(screen.getByText("海底图书馆")).toBeInTheDocument();
    expect(screen.getByText("学生合作寻找线索。")).toBeInTheDocument();
    expect(screen.getByText("发光地图")).toBeInTheDocument();
    expect(screen.getByText("夏天在海底图书馆发现发光地图，林老师引导大家确认任务，团队决定一起寻找失落的蓝色书页。")).toBeInTheDocument();
    expect(screen.queryByText("The Ocean Library")).not.toBeInTheDocument();
    expect(screen.queryByText("Students solve clues together.")).not.toBeInTheDocument();
    expect(screen.queryByText("The Glowing Map")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("中文主线概括")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存故事大纲" })).not.toBeInTheDocument();
    expect(screen.getByText("最新版本")).toBeInTheDocument();
  });

  test("marks the existing outline and characters as outdated after the creative requirement changes", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      alignment: {
        status: "ready_for_confirmation",
        planningMode: "explore_options",
        resolvedUnderstanding: ["改为二战故事"],
        unresolvedIssues: [],
        questions: [],
        summary: "改为二战故事",
        needsBackgroundRefresh: true,
        artifactsOutdated: true,
      },
    }} />);

    expect(screen.getByText("当前展示的是上一版故事成果")).toBeInTheDocument();
    expect(screen.getByText("确认新的创作需求并完成生成后，故事方向、大纲和角色会更新为最新版本。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认故事大纲并进入教学规划" })).toBeDisabled();
  });

  test("confirms the generated outline from the result panel before entering Step 3", async () => {
    const fetchMock = vi.fn(async () => Response.json({ course: { id: "course-1", currentStage: "teaching_plan" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    expect(screen.getAllByRole("button", { name: "确认故事大纲并进入教学规划" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "确认故事大纲并进入教学规划" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/story-outline/confirm",
      { method: "POST" },
    ));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/teaching-plan");
  });

  test("keeps outline confirmation out of the chat timeline", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    fireEvent.click(screen.getByRole("button", { name: "确认故事大纲并进入教学规划" }));

    expect(screen.queryByText("正在确认故事大纲...", { exact: false })).not.toBeInTheDocument();
    resolveResponse(Response.json({ course: { id: "course-1", currentStage: "teaching_plan" } }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/teaching-plan"));
  });

  test("continues directly from the result panel when an existing outline is only viewed", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={{ ...outlineState, course: { ...outlineState.course, currentStage: "preview" } }} />);

    fireEvent.click(screen.getByRole("button", { name: "进入教学规划" }));

    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/teaching-plan");
    expect(fetchPostCallCount(fetchMock)).toBe(0);
  });
});
