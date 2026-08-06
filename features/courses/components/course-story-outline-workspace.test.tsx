import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { CourseStoryOutlineState } from "@/lib/contracts/api";

import { CourseStoryOutlineWorkspace } from "./course-story-outline-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
        title: "发光地图",
        storyGoal: "发现线索",
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

describe("CourseStoryOutlineWorkspace", () => {
  test("shows chat controls and keeps the right panel empty before results exist", () => {
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    expect(screen.getByRole("heading", { name: "故事大纲" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "故事想法" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "随机灵感" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "随机灵感" }));
    expect(screen.getByLabelText("主题灵感")).toBeInTheDocument();
    expect(screen.getByLabelText("故事类型")).toBeInTheDocument();
    expect(screen.getByText("还没有生成结果")).toBeInTheDocument();
  });

  test("renders action buttons inside chat messages", () => {
    render(<CourseStoryOutlineWorkspace initialState={{
      ...emptyState,
      chatMessages: [
        {
          id: "m1",
          courseId: "course-1",
          role: "assistant",
          content: "这个想法涉及真实人物或已有角色。我先整理参考资料，避免设定编错。",
          actions: [{ id: "a1", label: "整理参考资料", action: "request_reference_search", targetId: "特朗普" }],
          createdAt: "2026-08-06T08:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByText("这个想法涉及真实人物或已有角色。我先整理参考资料，避免设定编错。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "整理参考资料" })).toBeInTheDocument();
  });

  test("shows confirmed reference material on the right and allows editing", () => {
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
    expect(screen.getByDisplayValue("特朗普")).toBeInTheDocument();
    expect(screen.getByDisplayValue("公众人物，可做课堂化成长改编。")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/story-outline/message",
      expect.objectContaining({ method: "POST" }),
    ));
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
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({
        action: "generate_from_reference",
        message: "补充：学生要和角色一起合作解谜",
      });
    });
  });

  test("supports regenerating the whole outline from the chat controls", async () => {
    const fetchMock = vi.fn(async () => Response.json(outlineState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "整体换一个更轻松的方向" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => {
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({
        action: "regenerate_outline",
        mode: "revise",
        message: "整体换一个更轻松的方向",
      });
    });
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
    const fetchMock = vi.fn(async () => Response.json(outlineState));
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

    await waitFor(() => {
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({ action: "choose_direction", targetId: "direction-1" });
    });
  });

  test("shows loading message while a request is pending", async () => {
    let resolveResponse!: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => responsePromise));
    render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

    fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
      target: { value: "学生们进入海底图书馆" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect((await screen.findAllByText("正在分析故事要求...")).length).toBeGreaterThan(0);
    await act(async () => {
      resolveResponse(Response.json(emptyState));
      await responsePromise;
    });
  });

  test("restarts Step2 through the reset endpoint after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

    fireEvent.click(screen.getByRole("button", { name: "重新开始" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/story-outline/reset",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  test("saves edited reference material before generating from it", async () => {
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
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

    fireEvent.change(screen.getByLabelText("资料摘要"), {
      target: { value: "更新后的资料摘要。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存参考资料" }));

    await waitFor(() => {
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/courses/course-1/story-outline/reference-materials/ref-1");
      expect(body).toMatchObject({ summary: "更新后的资料摘要。" });
    });
  });
});
