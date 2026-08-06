import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CourseStoryOutlineState } from "@/lib/contracts/api";

import { CourseStoryOutlineWorkspace } from "./course-story-outline-workspace";

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
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    expect(screen.getByRole("heading", { name: "故事大纲" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toBeInTheDocument();
    expect(screen.getByText("说说你的故事想法")).toBeInTheDocument();
    expect(screen.getByText(/参考《瓦罗兰特》的 Jett 和 Sage/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始讨论故事" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "随机灵感" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));
    expect(screen.getByLabelText("主题灵感")).toBeInTheDocument();
    expect(screen.getByLabelText("故事类型")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "补充要求（可选）" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "故事想法" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 3 个故事方向" })).toBeInTheDocument();
    expect(screen.getByText("还没有生成结果")).toBeInTheDocument();
  });

  test("formats the random form as a teacher chat message", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));
    fireEvent.change(screen.getByLabelText("主题灵感"), { target: { value: "太空学校" } });
    fireEvent.change(screen.getByLabelText("故事氛围"), { target: { value: "紧张刺激" } });
    fireEvent.change(screen.getByRole("textbox", { name: "补充要求（可选）" }), {
      target: { value: "希望学生和老师共同参与" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成 3 个故事方向" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({
      mode: "random",
      message: "请帮我生成随机故事方向。\n\n主题：太空学校\n故事类型：冒险解谜\n故事氛围：紧张刺激\n补充要求：希望学生和老师共同参与",
    }));
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
          actions: [{ id: "a1", label: "整理参考资料", action: "request_reference_search", targetId: "特朗普", researchPlan, afterResearchAction: "generate_directions" }],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByText("这个想法涉及真实人物或已有角色。我先整理参考资料，避免设定编错。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "整理参考资料" }));

    await waitFor(() => expect(fetchBody(fetchMock)).toMatchObject({ researchPlan, afterResearchAction: "generate_directions" }));
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
    });
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
    expect(screen.getByText("将清空本轮 Step 2 的聊天记录、故事方向、参考资料和故事大纲。")).toBeInTheDocument();
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
    expect(screen.getByText("课堂角色")).toBeInTheDocument();
    expect(screen.queryByText("剧情概述")).not.toBeInTheDocument();
  });

  test("classroom roles use course people snapshots without AI descriptions", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...outlineState,
      coursePeople: [
        {
          personId: "student-1",
          role: "student",
          chineseName: "夏天",
          englishName: "Summer",
          age: 10,
          gender: "female",
          visualAssetId: null,
          visualUrl: null,
          profileChanged: false,
        },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "角色" }));

    expect(screen.getByText("夏天 · Summer")).toBeInTheDocument();
    expect(screen.getByText("10 岁 · 学生")).toBeInTheDocument();
    expect(screen.queryByText("喜欢观察线索。")).not.toBeInTheDocument();
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
