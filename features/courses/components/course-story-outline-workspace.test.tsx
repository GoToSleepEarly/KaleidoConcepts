import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CourseStoryOutlineState } from "@/lib/contracts/api";

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
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
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

    expect(screen.getByRole("heading", { name: "故事大纲" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toBeInTheDocument();
    expect(screen.getByText("说说你的故事想法")).toBeInTheDocument();
    expect(screen.getByText("可以写参考人物、IP、故事类型，以及希望老师学生如何参与。例如：老师和学生一起穿越到魔法世界经历了一场奇幻冒险。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始讨论故事" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "随机灵感" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));
    expect(screen.getByRole("button", { name: "选择主题" })).toBeInTheDocument();
    expect(screen.getByLabelText("故事类型")).toHaveValue("");
    expect(screen.getByLabelText("故事氛围")).toHaveValue("");
    expect(screen.queryByText("选择基本方向，也可以补充一个特别要求。")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "补充要求（可选）" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例如：希望学生成为大侦探")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "故事想法" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 3 个故事方向" })).toBeInTheDocument();
    expect(screen.getByText("还没有生成结果")).toBeInTheDocument();
  });

  test("does not silently discard an unsent chat draft when navigating steps", () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CourseStoryOutlineWorkspace initialState={emptyState} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), { target: { value: "先不要丢掉这段想法" } });
    fireEvent.click(screen.getByRole("link", { name: "基础信息" }));
    expect(confirmMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    confirmMock.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "基础信息" }));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/audience");
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
    fireEvent.change(screen.getByLabelText("故事类型"), { target: { value: "冒险" } });
    fireEvent.change(screen.getByLabelText("故事氛围"), { target: { value: "紧张刺激" } });
    fireEvent.change(screen.getByRole("textbox", { name: "补充要求（可选）" }), {
      target: { value: "希望学生和老师共同参与" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成 3 个故事方向" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      mode: "random",
      message: "请帮我生成随机故事方向。\n\n主题：科学与未来 / 太空探索\n故事类型：冒险\n故事氛围：紧张刺激\n补充要求：希望学生和老师共同参与",
    }));
  });

  test("supports custom story type and tone without preset defaults", () => {
    render(<CourseStoryOutlineWorkspace initialState={emptyState} storyTonePresets={storyTonePresets} storyTypePresets={storyTypePresets} themePresets={themePresets} />);
    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));

    fireEvent.change(screen.getByLabelText("故事类型"), { target: { value: "__custom__" } });
    fireEvent.change(screen.getByLabelText("故事氛围"), { target: { value: "__custom__" } });

    expect(screen.getByRole("textbox", { name: "自定义故事类型" })).toBeInTheDocument();
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
    expect(screen.getByText("还没有生成结果")).toBeInTheDocument();
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

    expect(screen.getByRole("option", { name: "GPT（大纲更稳）" })).toBeInTheDocument();
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
    expect(fetchMock).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole("button", { name: "选择这个方向" }));

    expect(screen.getByText(/我选择故事方向：海底谜题/)).toBeInTheDocument();

    await waitFor(() => {
      const body = fetchBody(fetchMock);
      expect(body).toMatchObject({ action: "choose_direction", targetId: "direction-1" });
    });
    await act(async () => {
      resolveResponse(Response.json(outlineState));
      await responsePromise;
    });
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
            { id: "usage", label: "怎样使用小马宝莉角色？", required: true, answerMode: "single_choice", options: [{ id: "new", label: "使用角色创作新剧情" }], allowCustom: true, allowRecommendation: false },
            { id: "roles", label: "希望哪些角色出场？", required: true, answerMode: "text", allowCustom: true, allowRecommendation: false },
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

  test("preselects AI recommendations for every clarification question and allows immediate confirmation", async () => {
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
              options: [{ id: "new", label: "使用原作人物创作新剧情" }],
              allowCustom: true,
              allowRecommendation: true,
              recommendation: { value: "使用原作人物创作新剧情", reason: "老师已经提出新的课堂冒险。" },
            },
            {
              id: "focus",
              label: "故事聚焦谁？",
              required: true,
              answerMode: "text",
              allowCustom: true,
              allowRecommendation: true,
              recommendation: { value: "所有学生组成行动团队，老师共同参与", reason: "课堂人物默认全部进入故事。" },
            },
          ],
        }],
        createdAt: "2026-08-13T00:00:00.000Z",
      }],
    }} />);

    expect(screen.getAllByText(/建议：/)).toHaveLength(2);
    const submit = screen.getByRole("button", { name: "确认回答并继续" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      action: "submit_alignment_answers",
      alignmentAnswers: {
        usage: "采用建议：使用原作人物创作新剧情",
        focus: "采用建议：所有学生组成行动团队，老师共同参与",
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
            { id: "first", label: "第一个问题", required: true, answerMode: "single_choice", allowCustom: false, allowRecommendation: false },
            { id: "second", label: "第二个问题", required: true, answerMode: "single_choice", allowCustom: false, allowRecommendation: false },
          ],
        }],
        createdAt: "2026-08-13T00:00:00.000Z",
      }],
    }} />);

    expect(screen.getByLabelText("第一个问题回答")).toBeInTheDocument();
    expect(screen.getByLabelText("第二个问题回答")).toBeInTheDocument();
  });

  test("lets the teacher revise only one direction and explicitly confirm it before outline generation", async () => {
    const selectedState: CourseStoryOutlineState = {
      ...emptyState,
      directions: [{
        id: "direction-1", courseId: "course-1", title: "情绪天气城",
        hook: "暮光闪闪和云宝误入情绪会改变天气的城市，必须在风暴吞没城市前帮助居民表达真实感受。",
        storyHighlight: "情绪直接改变天气和道路。", growthCore: "从压抑情绪转向理解和表达。",
        whyFits: "适合讨论情绪表达。", mainCharacters: ["暮光闪闪", "云宝"], seedPrompt: "weather", selectedAt: "2026-08-12T00:00:00.000Z", createdAt: "2026-08-12T00:00:00.000Z",
      }],
    };
    const fetchMock = vi.fn(async () => Response.json(selectedState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={selectedState} />);

    expect(screen.getByText("情绪直接改变天气和道路。")).toBeInTheDocument();
    expect(screen.getByText("从压抑情绪转向理解和表达。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "调整这张卡" }));
    fireEvent.change(screen.getByPlaceholderText("例如：保留角色，但把冲突改得更离奇一些"), { target: { value: "保留角色，把城市改成漂浮在梦境里" } });
    fireEvent.click(screen.getByRole("button", { name: "应用修改" }));
    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({ action: "revise_direction", targetId: "direction-1" }));

    fireEvent.click(screen.getByRole("button", { name: "确认方向，生成大纲" }));
    await waitFor(() => expect(fetchBody(fetchMock, 1)).toMatchObject({ action: "confirm_direction", targetId: "direction-1" }));
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
    expect(screen.getByText("将清空本阶段的聊天记录、故事方向、参考资料和故事大纲。")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "角色" }));
    expect(screen.getByText("故事出场角色")).toBeInTheDocument();
    expect(screen.queryByText("剧情概述")).not.toBeInTheDocument();
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
});
