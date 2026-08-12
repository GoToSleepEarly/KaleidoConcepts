import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { CourseContentState } from "@/lib/contracts/api";
import { CourseContentWorkspace } from "@/features/courses/components/course-content-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const initialState: CourseContentState = {
  course: { id: "course-1", title: "Hidden Door", currentStage: "content", englishLevel: "B1" },
  knowledgePoints: [{ id: "kp1", label: "一般过去时" }],
  chapterKnowledgePointIds: { o1: ["kp1"] },
  homeworkKnowledgePointIds: ["kp1"],
  status: "ready", phase: null, writingProvider: "quickrouter_gpt", sourceRevision: "r1", contentVersion: 2,
  chapters: [{ id: "c1", outlineChapterId: "o1", order: 1, title: "The Map", targetWordCount: 90, readingExerciseMode: "interactive", validationIssues: [],
    paragraphs: [{ id: "p1", parts: [{ type: "text", text: "Mia " }, { type: "grammar", id: "g1", exerciseType: "wordForm", knowledgePointId: "kp1", answer: "found", baseForm: "find" }, { type: "text", text: " a " }, { type: "vocabulary", id: "v1", answer: "hidden door", canonicalForm: "hidden door", meaningZh: "隐藏的门" }, { type: "text", text: "." }] }],
    chapterPractice: [],
  }],
  mainIdea: { id: "main-idea", title: "Main Idea", text: "A complete story summary." },
  homework: { grammar: [], vocabularyMatching: [{ id: "v1", canonicalForm: "hidden door", meaningZh: "隐藏的门" }] },
  exercisesStale: false, messages: [], errorMessage: null, updatedAt: "2026-08-09T00:00:00.000Z",
};

describe("CourseContentWorkspace", () => {
  test("defaults to the first chapter and exposes highlighted top-level and chapter tabs", () => {
    render(<CourseContentWorkspace initialState={initialState} />);
    expect(screen.getByRole("tab", { name: "Chapter 1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Reading" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "课后练习" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "正文" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "练习" })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1 页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByText("(find)")).toBeInTheDocument();
    expect(screen.getByText("(隐藏的门)")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument();
    const article = screen.getByRole("article");
    expect(article.querySelector(".preview-slide")).toBeInTheDocument();
    expect(article.querySelector(".preview-slide")?.textContent).not.toContain("教师答案");
    expect(article.querySelector("[data-step4-answers]")).toHaveTextContent("教师答案：1. found；2. hidden door");
    expect(screen.queryByText("图片尚未采用")).not.toBeInTheDocument();
  });

  test("switches to pure main idea and closed vocabulary matching page", () => {
    render(<CourseContentWorkspace initialState={initialState} />);
    fireEvent.click(screen.getByRole("tab", { name: "Reading" }));
    expect(screen.getByRole("tab", { name: "Reading" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("A complete story summary.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "课后练习" }));
    expect(screen.getByRole("tab", { name: "课后练习" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/hidden door/)).toBeInTheDocument();
    expect(screen.getByText("隐藏的门")).toBeInTheDocument();
  });

  test("uses chapter subtabs and keeps bottom pagination inside the selected section", () => {
    const navigationState: CourseContentState = {
      ...initialState,
      chapters: initialState.chapters.map((chapter) => ({
        ...chapter,
        paragraphs: [
          ...chapter.paragraphs,
          { id: "p2", parts: [{ type: "text", text: "The second reading page." }] },
        ],
        chapterPractice: [{ id: "q1", type: "optionCloze", knowledgePointId: "kp1", before: "Mia ", after: " the map.", answer: "found", options: ["found", "finds", "finding"] }],
      })),
    };
    render(<CourseContentWorkspace initialState={navigationState} />);

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("The second reading page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "练习" }));
    expect(screen.getByText("选词填空")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "练习" })).toHaveAttribute("aria-selected", "true");
  });

  test("hides optional practice tabs when their content does not exist", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, homework: null }} />);
    expect(screen.queryByRole("tab", { name: "课后练习" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "练习" })).not.toBeInTheDocument();
  });

  test("balances grammar practice across pages with a five-item capacity", () => {
    const questions = Array.from({ length: 6 }, (_, index) => ({ id: `q${index + 1}`, type: "optionCloze" as const, knowledgePointId: "kp1", before: `Question ${index + 1} `, after: ".", answer: "found", options: ["found", "finds", "finding"] }));
    render(<CourseContentWorkspace initialState={{ ...initialState, chapters: initialState.chapters.map((chapter) => ({ ...chapter, chapterPractice: questions })) }} />);
    fireEvent.click(screen.getByRole("tab", { name: "练习" }));
    expect(screen.getByText("1 / 2 页")).toBeInTheDocument();
    expect(screen.getByRole("article").querySelectorAll("ol > li")).toHaveLength(3);
  });

  test("marks a finished repair round as completed and collapses its details", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      messages: [{ id: "repair-1", role: "system", content: "检测到第 1 章需要修复。正在统一修复。", createdAt: "2026-08-10T00:00:00.000Z" }],
    }} />);

    expect(screen.getByText("修复完成")).toBeInTheDocument();
    expect(screen.getByText("修复完成").closest("details")).not.toHaveAttribute("open");
  });

  test("starts with guided chat and disables the composer before reading generation", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "empty", chapters: [], mainIdea: null, homework: null }} />);
    expect(screen.getByText(/点击一次会连续生成全部章节正文/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始生成正文" })).toBeInTheDocument();
    expect(screen.getByLabelText("修改要求")).toBeDisabled();
    expect(screen.getByPlaceholderText("请先点击开始生成正文")).toBeInTheDocument();
  });

  test("selects and clears a preview page as the chat modification target", () => {
    render(<CourseContentWorkspace initialState={initialState} />);
    expect(screen.getByLabelText("修改范围")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "修改正文第 1 页" }));
    expect(screen.queryByLabelText("修改范围")).not.toBeInTheDocument();
    expect(screen.getByText("第 1 章 · 正文第 1 页")).toBeInTheDocument();
    const input = screen.getByLabelText("修改要求");
    fireEvent.change(input, { target: { value: "让语气更紧张" } });
    fireEvent.click(screen.getByRole("button", { name: "清除修改目标" }));
    expect(input).toHaveValue("让语气更紧张");
    expect(screen.getByRole("button", { name: "发送修改要求" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "全部清空" }));
    expect(input).toHaveValue("");
  });

  test("logs the teacher message immediately while a modification is running", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    render(<CourseContentWorkspace initialState={initialState} />);
    fireEvent.click(screen.getByRole("button", { name: "修改正文第 1 页" }));
    fireEvent.change(screen.getByLabelText("修改要求"), { target: { value: "让语气更紧张" } });
    fireEvent.click(screen.getByRole("button", { name: "发送修改要求" }));
    expect(screen.getByText("让语气更紧张")).toBeInTheDocument();
    expect(screen.getByLabelText("修改要求")).toHaveValue("");
    resolveRequest(Response.json({ ...initialState, messages: [{ id: "m1", role: "teacher", content: "让语气更紧张", createdAt: "2026-08-10T00:00:00.000Z" }] }));
    await waitFor(() => expect(screen.getAllByText("让语气更紧张")).toHaveLength(1));
  });

  test("asks the teacher to wait without refreshing during generation", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "generating_reading", phase: "generating_chapters" }} />);
    expect(screen.getByText(/请耐心等待，不要刷新页面/)).toBeInTheDocument();
    expect(screen.queryByText(/可以离开页面/)).not.toBeInTheDocument();
  });

  test("offers a targeted Main Idea retry after its isolated validation fails", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "failed", errorMessage: "Main Idea 连续两次修复后词数仍应为 130–170，实际 178" }} />);
    expect(screen.getByRole("button", { name: "重试课后阅读" })).toBeInTheDocument();
  });

  test("keeps Step 5 reachable after confirmed content is opened again", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "confirmed", course: { ...initialState.course, currentStage: "content" } }} />);

    expect(screen.getByRole("link", { name: "视觉资源" })).toHaveAttribute(
      "href",
      "/courses/course-1/create/visual-resources",
    );
    expect(screen.getByRole("button", { name: "返回视觉资源" })).toBeInTheDocument();
  });

  test("supports explicitly regenerating reading and exercises", async () => {
    const stateWithExercises = {
      ...initialState,
      chapters: initialState.chapters.map((chapter) => ({ ...chapter, chapterPractice: [{ id: "q1", type: "optionCloze" as const, knowledgePointId: "kp1", before: "Mia ", after: " home.", answer: "went", options: ["went", "goes", "going"] }] })),
    };
    const fetchMock = vi.fn(async () => Response.json(stateWithExercises));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseContentWorkspace initialState={stateWithExercises} />);
    fireEvent.click(screen.getByRole("button", { name: "重新生成正文与课后阅读" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/content/reading/generate?regenerate=true",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新生成练习" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "重新生成练习" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/content/exercises/generate?regenerate=true",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  test("clears all Step4 records and starts over after confirmation", async () => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); },
      close(this: HTMLDialogElement) { this.removeAttribute("open"); },
    });
    const emptyState = { ...initialState, status: "empty" as const, chapters: [], mainIdea: null, homework: null, messages: [], contentVersion: 0 };
    const fetchMock = vi.fn(async () => Response.json(emptyState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseContentWorkspace initialState={initialState} />);
    fireEvent.click(screen.getByRole("button", { name: "重新开始" }));
    expect(screen.getByRole("heading", { name: "重新开始" })).toBeInTheDocument();
    expect(screen.getByText("会删除本环节的所有数据并重新开始，是否确定？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/content/reset", { method: "POST" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "开始生成正文" })).toBeInTheDocument());
  });
});
