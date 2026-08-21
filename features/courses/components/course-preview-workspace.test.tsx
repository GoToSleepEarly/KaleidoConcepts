import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exportSlidesToPDFMock } = vi.hoisted(() => ({ exportSlidesToPDFMock: vi.fn() }));

vi.mock("@/lib/utils/pdf-export", () => ({ exportSlidesToPDF: exportSlidesToPDFMock }));

import { CoursePreviewWorkspace } from "@/features/courses/components/course-preview-workspace";
import { PreviewSlide } from "@/features/courses/components/course-slide-deck";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("CoursePreviewWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    exportSlidesToPDFMock.mockResolvedValue({ pageCount: 1 });
  });

  it("renders bilingual titles without repeating a generic chapter label", () => {
    const presentation = { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} } as const;
    const { rerender } = render(<PreviewSlide page={{ id: "cover", type: "cover_title", image: { publicUrl: null }, title: "海底图书馆 / The Ocean Library", teacherName: null, studentNames: [] }} presentation={presentation} />);
    expect(screen.getByText("海底图书馆")).toBeInTheDocument();
    expect(screen.getByText("The Ocean Library")).toBeInTheDocument();

    rerender(<PreviewSlide page={{ id: "chapter", type: "chapter_divider", chapterOrder: 1, chapterTitleZh: "发光地图", chapterTitleEn: "The Glowing Map" }} presentation={presentation} />);
    expect(screen.getByText("Chapter 01")).toBeInTheDocument();
    expect(screen.getByText("发光地图")).toBeInTheDocument();
    expect(screen.getByText("The Glowing Map")).toBeInTheDocument();

    rerender(<PreviewSlide page={{ id: "chapter-divider", type: "chapter_divider", chapterOrder: 1, chapterTitleZh: "发光地图", chapterTitleEn: "Chapter 1" }} presentation={presentation} />);
    expect(screen.getByText("Chapter 01")).toBeInTheDocument();
    expect(screen.queryByText("Chapter 1", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps the previous editor layout and exposes the new exercise page labels", () => {
    render(<CoursePreviewWorkspace initialState={{
      course: { id: "course-1", title: "Mystery", lifecycleStatus: "draft", teacherName: "Lin", studentNames: ["Summer"] },
      presentation: { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} },
      pages: [
        { id: "cover", type: "cover_title", image: { publicUrl: null }, title: "Mystery", teacherName: "Lin", studentNames: ["Summer"] },
        { id: "practice", type: "grammar_practice", scope: "chapter", chapterTitleZh: "第一章", chapterTitleEn: "Chapter One", exerciseType: "wordForm", pageNumber: 1, questionStartNumber: 1, knowledgePoints: [{ id: "past", label: "一般过去时" }], questions: [{ id: "q", type: "wordForm", knowledgePointId: "past", before: "She ", after: ".", answer: "went", baseForm: "go" }] },
      ],
    }} />);
    expect(screen.getByText("课程预览与发布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "课件预览" })).toBeInTheDocument();
    expect(screen.getByText("课件样式")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("词形变化")).toBeInTheDocument();
    expect(screen.getByText("(go)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "显示第 1 题答案" }));
    expect(screen.getByRole("button", { name: "隐藏第 1 题答案" })).toHaveTextContent("went");
    const fontSize = screen.getByRole("slider", { name: "本页字号" });
    fireEvent.keyDown(fontSize, { key: "ArrowLeft" });
    expect(screen.getByText("词形变化")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Mystery")).toBeInTheDocument();
  });

  it("auto-saves a per-page font size change", async () => {
    const fetchMock = vi.fn(async () => Response.json({ presentation: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CoursePreviewWorkspace initialState={{
      course: { id: "course-1", title: "Mystery", lifecycleStatus: "draft", teacherName: "Lin", studentNames: ["Summer"] },
      presentation: { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} },
      pages: [
        { id: "cover", type: "cover_title", image: { publicUrl: null }, title: "Mystery", teacherName: "Lin", studentNames: ["Summer"] },
        { id: "practice", type: "grammar_practice", scope: "chapter", chapterTitleZh: "第一章", chapterTitleEn: "Chapter One", exerciseType: "wordForm", pageNumber: 1, questionStartNumber: 1, knowledgePoints: [], questions: [] },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    fireEvent.change(screen.getByRole("slider", { name: "本页字号" }), { target: { value: "1.1" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/presentation",
      expect.objectContaining({ method: "PUT", body: expect.stringContaining('"fontSize":1.1') }),
    ), { timeout: 1500 });
    await waitFor(() => expect(screen.getByText("已自动保存")).toBeInTheDocument());
  });

  it("connects a clicked vocabulary word to its correct meaning", () => {
    render(<CoursePreviewWorkspace initialState={{
      course: { id: "course-1", title: "Mystery", lifecycleStatus: "draft", teacherName: "Lin", studentNames: ["Summer"] },
      presentation: { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} },
      pages: [
        { id: "cover", type: "cover_title", image: { publicUrl: null }, title: "Mystery", teacherName: "Lin", studentNames: ["Summer"] },
        { id: "vocabulary", type: "vocabulary_matching", pageNumber: 1, items: [
          { id: "v1", canonicalForm: "clue", meaningZh: "线索" },
          { id: "v2", canonicalForm: "shell", meaningZh: "贝壳" },
        ] },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    fireEvent.click(screen.getByRole("button", { name: "连接 clue 到正确释义" }));
    expect(screen.getByLabelText("clue 已连接到 线索").querySelector("path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消 clue 的连线" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps highlighted answer spacing and expands short reading text", () => {
    const { container } = render(<CoursePreviewWorkspace initialState={{
      course: { id: "course-1", title: "Mystery", lifecycleStatus: "draft", teacherName: "Lin", studentNames: ["Summer"] },
      presentation: { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} },
      pages: [
        { id: "cover", type: "cover_title", image: { publicUrl: null }, title: "Mystery", teacherName: "Lin", studentNames: ["Summer"] },
        { id: "reading", type: "shot_text", chapterId: "chapter", paragraphId: "paragraph", image: { publicUrl: null }, readingExerciseMode: "complete", knowledgePoints: [{ id: "past", label: "一般过去时" }], parts: [
          { type: "text", text: "She" },
          { type: "exercise", id: "q1", number: 1, exerciseType: "wordForm", answer: "went", knowledgePointId: "past", knowledgePointLabel: "一般过去时", spaceBefore: true, hint: "go" },
          { type: "text", text: " home and found a " },
          { type: "exercise", id: "q2", number: 2, exerciseType: "vocabulary", answer: "clue", knowledgePointId: null, knowledgePointLabel: "词汇", spaceBefore: false, hint: "线索", meaningZh: "线索" },
          { type: "text", text: "." },
        ], textBox: { opacity: 0.85, fontSize: 1 } },
      ],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("went", { exact: true }).textContent).toBe("went");
    const vocabularyMeaning = screen.getByText("（线索）");
    expect(vocabularyMeaning.parentElement).toHaveTextContent("clue（线索）");
    expect(screen.queryByText("（go）")).not.toBeInTheDocument();
    expect(container.querySelector<HTMLElement>(".slide-text-content")?.style.getPropertyValue("--auto-fit-scale")).toBe("1.55");
  });

  it("shows a non-blocking real PDF progress card and disables view switching during export", async () => {
    let finishExport!: (value: { pageCount: number }) => void;
    exportSlidesToPDFMock.mockImplementation(async (...args: unknown[]) => {
      const options = args[2] as { onProgress: (progress: object) => void };
      options.onProgress({ phase: "preparing", completedPages: 0, totalPages: 3 });
      options.onProgress({ phase: "rendering", currentPage: 2, completedPages: 1, totalPages: 3 });
      return await new Promise<{ pageCount: number }>((resolve) => { finishExport = resolve; });
    });
    render(<CoursePreviewWorkspace initialState={{
      course: { id: "course-1", title: "Mystery", lifecycleStatus: "draft", teacherName: "Lin", studentNames: ["Summer"] },
      presentation: { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} },
      pages: [{ id: "cover", type: "cover_title", image: { publicUrl: null }, title: "Mystery", teacherName: "Lin", studentNames: ["Summer"] }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "打印预览" }));
    fireEvent.click(screen.getByRole("button", { name: "下载 PDF" }));

    expect(await screen.findByRole("status", { name: "PDF 导出进度" })).toHaveTextContent("正在处理第 2/3 页");
    expect(screen.getByRole("progressbar", { name: "PDF 导出进度" })).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByRole("button", { name: "取消导出" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "课件预览" })).toBeDisabled();
    expect(JSON.parse(window.sessionStorage.getItem("course-pdf-export:course-1") ?? "null")).toMatchObject({ completedPages: 1, totalPages: 3 });

    finishExport({ pageCount: 3 });
    await waitFor(() => expect(screen.getByRole("status", { name: "PDF 导出进度" })).toHaveTextContent("导出完成"));
    expect(screen.getByRole("status", { name: "PDF 导出进度" })).toHaveTextContent(/PDF 已下载/);
    expect(screen.getByRole("button", { name: "关闭 PDF 导出结果" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "课件预览" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "关闭 PDF 导出结果" }));
    expect(screen.queryByRole("status", { name: "PDF 导出进度" })).not.toBeInTheDocument();
  });

  it("reports an interrupted browser-side PDF export after refresh", async () => {
    window.sessionStorage.setItem("course-pdf-export:course-1", JSON.stringify({ completedPages: 4, totalPages: 10, startedAt: Date.now() - 5_000 }));
    render(<CoursePreviewWorkspace initialState={{
      course: { id: "course-1", title: "Mystery", lifecycleStatus: "draft", teacherName: "Lin", studentNames: ["Summer"] },
      presentation: { coverTheme: "dark", coverTitleFontSize: 1, chapterTheme: "blue-purple", slideOverrides: {} },
      pages: [{ id: "cover", type: "cover_title", image: { publicUrl: null }, title: "Mystery", teacherName: "Lin", studentNames: ["Summer"] }],
    }} />);

    expect(await screen.findByText("上次 PDF 导出在第 4/10 页后中断，未生成下载文件。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往打印预览" })).toBeInTheDocument();
  });
});
