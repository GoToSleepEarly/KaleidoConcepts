import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { CourseContentState } from "@/lib/contracts/api";
import { CourseContentWorkspace } from "@/features/courses/components/course-content-workspace";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

const initialState: CourseContentState = {
  course: { id: "course-1", title: "English Adventure", currentStage: "content", englishLevel: "B1" },
  storyTitle: "Hidden Door",
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
  exercisesStale: false, messages: [], errorMessage: null, updatedAt: "2026-08-09T00:00:00.000Z", operation: null,
};

describe("CourseContentWorkspace", () => {
  test("refreshes persisted teaching-plan data when returning to the previous step", () => {
    render(<CourseContentWorkspace initialState={initialState} />);

    const backButton = screen.getByRole("button", { name: "上一步" });
    fireEvent.click(backButton);

    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/teaching-plan");
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(backButton).toBeDisabled();
  });

  test("uses the app dialog before discarding an unsent modification", () => {
    render(<CourseContentWorkspace initialState={initialState} />);
    fireEvent.click(screen.getByRole("button", { name: "选择要修改的页面" }));
    fireEvent.click(screen.getByRole("button", { name: /第 1 章.*正文第 1 页/ }));
    fireEvent.change(screen.getByLabelText("修改要求"), { target: { value: "改得更紧张" } });
    fireEvent.click(screen.getByRole("link", { name: "教学规划" }));

    expect(screen.getByRole("heading", { name: "放弃未发送的修改？" })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "放弃并离开" }));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/teaching-plan");
  });
  test("defaults to the first chapter and exposes highlighted top-level and chapter tabs", () => {
    render(<CourseContentWorkspace initialState={initialState} />);
    expect(screen.getByRole("heading", { name: "文案与练习" })).toHaveClass("text-2xl");
    expect(screen.getByTestId("content-story-title")).toHaveTextContent("Hidden Door");
    expect(screen.getByTestId("content-story-title")).toHaveClass("text-sm", "text-muted-foreground");
    expect(screen.getByRole("option", { name: "GPT" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "GPT（默认）" })).not.toBeInTheDocument();
    expect(screen.getByText("B1 · 1/1 章正文已完成 · 课后阅读已生成 · 无额外语法练习")).toBeInTheDocument();
    expect(screen.queryByText("B1 · 正文、课后阅读、章节练习与课后练习")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Chapter 1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Reading" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "课后练习" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "正文" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("content-primary-tabs")).toHaveClass("border-b", "[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden");
    expect(screen.getByRole("tab", { name: "Chapter 1" })).toHaveClass("border-b-2");
    expect(screen.getByRole("tab", { name: "Chapter 1" })).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(screen.getByTestId("content-secondary-tabs")).toHaveClass("border-b", "[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden");
    expect(screen.queryByRole("tab", { name: "练习" })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1 页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByText("(find)")).toBeInTheDocument();
    expect(screen.getByText("(隐藏的门，6+4个字母)")).toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: "Reading", selected: true })).toHaveClass("border-b-2");
    expect(screen.getByText("A complete story summary.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "课后练习" }));
    expect(screen.getByRole("tab", { name: "课后练习" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/hidden door/)).toBeInTheDocument();
    expect(screen.getByText("隐藏的门")).toBeInTheDocument();
  });

  test("shows only the Chinese vocabulary hint in complete-reading mode", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, chapters: initialState.chapters.map((chapter) => ({ ...chapter, readingExerciseMode: "complete" })) }} />);

    expect(screen.getByText("（隐藏的门）")).toBeInTheDocument();
    expect(screen.queryByText("(隐藏的门，6+4个字母)")).not.toBeInTheDocument();
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
    expect([...screen.getByRole("article").querySelectorAll("span")].some((element) => element.textContent === "1")).toBe(false);
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

  test("keeps historical repair rounds completed while a later exercise generation is running", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      status: "generating_exercises",
      phase: "generating_exercises",
      messages: [{ id: "repair-1", role: "system", content: "检测到第 1 章需要修复。正在统一修复。", createdAt: "2026-08-10T00:00:00.000Z" }],
    }} />);

    expect(screen.getByText("修复完成")).toBeInTheDocument();
    expect(screen.queryByText("修复中")).not.toBeInTheDocument();
  });

  test("renders repair messages in older browsers without Array.prototype.findLastIndex", () => {
    const originalFindLastIndex = Array.prototype.findLastIndex;
    Object.defineProperty(Array.prototype, "findLastIndex", { configurable: true, value: undefined });
    try {
      render(<CourseContentWorkspace initialState={{
        ...initialState,
        messages: [{ id: "repair-1", role: "system", content: "检测到第 1 章需要修复。正在统一修复。", createdAt: "2026-08-10T00:00:00.000Z" }],
      }} />);

      expect(screen.getByText("修复完成")).toBeInTheDocument();
    } finally {
      Object.defineProperty(Array.prototype, "findLastIndex", { configurable: true, value: originalFindLastIndex });
    }
  });

  test("starts with a focused generation entry and hides the unavailable composer", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "empty", chapters: [], mainIdea: null, homework: null }} />);
    expect(screen.getByText("B1 · 1 章 · 待生成正文")).toBeInTheDocument();
    expect(screen.getByTestId("content-stage-heading")).toHaveTextContent("文案与练习Hidden Door");
    expect(screen.getByTestId("content-stage-heading")).not.toHaveTextContent("English Adventure");
    expect(screen.getByTestId("content-stage-progress")).toHaveTextContent("B1 · 1 章 · 待生成正文");
    expect(screen.getByTestId("content-stage-header")).not.toHaveClass("rounded-xl", "border", "shadow-sm");
    expect(screen.getByText(/将先生成全部章节正文、正文内练习和课后阅读/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成正文与课后阅读" })).toBeInTheDocument();
    expect(screen.getByText("生成后可逐页检查和修改").closest("[data-chat-action]")).toHaveClass("w-fit", "max-w-xl");
    expect(screen.getByRole("button", { name: "生成正文与课后阅读" })).not.toHaveClass("w-full");
    expect(screen.queryByLabelText("修改要求")).not.toBeInTheDocument();
    expect(screen.getByTestId("content-workspace-layout")).toHaveClass("w-full", "xl:grid-cols-[minmax(0,2fr)_minmax(260px,0.75fr)]");
    expect(screen.queryByLabelText("课程内容预览")).not.toBeInTheDocument();
    expect(screen.queryByText("等待生成正文")).not.toBeInTheDocument();
  });

  test("keeps Step 4 sequential on phone and iPad portrait while preserving desktop split scroll regions", () => {
    render(<CourseContentWorkspace initialState={initialState} />);

    expect(screen.getByTestId("content-workspace-layout")).toHaveAttribute("data-layout", "split");
    expect(screen.getByTestId("course-ai-workspace-frame")).toHaveClass("lg:h-full", "lg:grid-rows-[minmax(0,1fr)_auto]");
    expect(screen.getByTestId("content-workspace-layout")).toHaveClass("lg:h-full", "lg:grid-rows-[auto_minmax(0,1fr)]", "xl:grid-cols-[minmax(400px,0.95fr)_minmax(0,1.3fr)]", "xl:grid-rows-[minmax(0,1fr)]");
    expect(screen.getByTestId("content-workspace-layout")).not.toHaveClass("md:h-[calc(100dvh-13.5rem)]");
    expect(screen.getByTestId("content-chat-pane")).toHaveClass("h-[calc(100dvh-18rem)]", "min-h-[480px]", "lg:h-full", "overflow-hidden");
    expect(screen.getByTestId("content-chat-scroll")).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(screen.getByTestId("content-preview-pane")).toHaveClass("lg:h-full", "lg:overflow-hidden");
    expect(screen.getByTestId("content-preview-scroll")).toHaveClass("overflow-y-scroll", "overscroll-contain", "[scrollbar-gutter:stable]", "[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden");
  });

  test("keeps Step 4 history, composer, and preview controls dense", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      messages: [
        { id: "m1", role: "teacher", content: "让语气更紧张", createdAt: "2026-08-10T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已完成修改。", createdAt: "2026-08-10T00:01:00.000Z" },
      ],
    }} />);

    expect(screen.getByTestId("content-chat-scroll")).toHaveClass("space-y-2", "p-3", "[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden");
    expect(screen.getByText("让语气更紧张")).toBeInTheDocument();
    expect(screen.getByText("已完成修改。")).toBeInTheDocument();
    expect(screen.queryByText(/将先生成全部章节正文、正文内练习和课后阅读/)).not.toBeInTheDocument();
    expect(screen.getByTestId("content-chat-composer")).toHaveClass("space-y-1.5", "p-3");
    expect(screen.getByLabelText("修改要求")).toHaveAttribute("rows", "1");
    expect(screen.getByLabelText("修改要求")).toHaveClass("block", "min-h-13", "max-h-28", "resize-none", "pr-16");
    expect(screen.getByRole("button", { name: "发送修改要求" })).toHaveClass("absolute", "bottom-1", "right-1", "size-11", "rounded-full", "bg-primary-50", "text-primary", "p-0");
    expect(screen.getByTestId("content-preview-toolbar")).toHaveClass("space-y-0", "px-3", "py-1");
    expect(screen.getByTestId("content-preview-toolbar")).toContainElement(screen.getByTestId("content-page-controls"));
    expect(screen.getByTestId("content-preview-scroll")).toHaveClass("p-3");
  });

  test("uses mobile chat and preview tabs with preview selected first when content exists", () => {
    render(<CourseContentWorkspace initialState={initialState} />);

    expect(screen.getByTestId("content-mobile-view-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("content-mobile-view-tabs")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("button", { name: "预览" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "预览" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("button", { name: "预览" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "对话" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("content-chat-pane")).toHaveClass("hidden", "xl:flex");
    expect(screen.getByTestId("content-preview-pane")).not.toHaveClass("hidden");

    fireEvent.click(screen.getByRole("button", { name: "对话" }));

    expect(screen.getByRole("button", { name: "对话" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("content-chat-pane")).not.toHaveClass("hidden");
    expect(screen.getByTestId("content-preview-pane")).toHaveClass("hidden", "xl:block");
  });

  test("keeps mobile actions compact and prevents the bottom action bar from covering the composer", () => {
    render(<CourseContentWorkspace initialState={initialState} />);

    expect(screen.getByTestId("content-stage-actions")).toHaveClass("hidden", "xl:flex");
    expect(screen.getByTestId("content-mobile-actions")).toHaveClass("xl:hidden");
    expect(screen.getByTestId("content-bottom-actions")).not.toHaveClass("sticky", "xl:sticky", "fixed");
    expect(screen.getByTestId("course-ai-workspace-frame")).toContainElement(screen.getByTestId("content-bottom-actions"));
  });

  test("keeps the preview scroll surface mounted when the stale notice is dismissed", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      course: { ...initialState.course, staleFromStage: "teaching_plan" },
    }} />);

    const previewScroll = screen.getByTestId("content-preview-scroll");
    fireEvent.click(screen.getByRole("button", { name: "关闭旧版本提示" }));

    expect(screen.getByTestId("content-preview-scroll")).toBe(previewScroll);
    expect(previewScroll).toHaveClass("overflow-y-scroll", "[scrollbar-gutter:stable]");
  });

  test("opens both the full chat history and the current preview at their latest content", () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(520);
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      messages: [
        { id: "teacher-history", role: "teacher", content: "先保留这条历史要求。", createdAt: "2026-08-18T11:59:00.000Z" },
        { id: "assistant-result", role: "assistant", content: "正文与课后阅读已生成。", createdAt: "2026-08-18T12:00:00.000Z" },
      ],
      updatedAt: "2026-08-18T12:00:00.000Z",
    }} />);

    expect(screen.getByText("先保留这条历史要求。")).toBeInTheDocument();
    expect(screen.getByText("正文与课后阅读已生成。")).toBeInTheDocument();
    expect(screen.getByTestId("content-chat-scroll").scrollTop).toBe(520);
    expect(screen.getByTestId("content-preview-scroll").scrollTop).toBe(520);
    scrollHeight.mockRestore();
  });

  test("uses the same role avatars and constrained bubble width as story chat", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      messages: [
        { id: "m1", role: "teacher", content: "让语气更紧张", createdAt: "2026-08-10T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已完成修改。", createdAt: "2026-08-10T00:01:00.000Z" },
      ],
    }} />);

    expect(screen.getAllByRole("img", { name: "AI 助手" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "老师" })).toBeInTheDocument();
    expect(screen.getByText("让语气更紧张").closest("[data-chat-bubble]")).toHaveClass("max-w-[calc(100%-2.25rem)]", "py-2", "leading-5");
  });

  test("selects and clears a preview page as the chat modification target", () => {
    render(<CourseContentWorkspace initialState={initialState} />);
    expect(screen.getByRole("button", { name: "选择要修改的页面" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "修改正文第 1 页" }));
    expect(screen.queryByRole("button", { name: "选择要修改的页面" })).not.toBeInTheDocument();
    expect(screen.getByText("第 1 章 · 正文第 1 页")).toBeInTheDocument();
    const input = screen.getByLabelText("修改要求");
    fireEvent.change(input, { target: { value: "让语气更紧张" } });
    fireEvent.click(screen.getByRole("button", { name: "清除修改目标" }));
    expect(input).toHaveValue("让语气更紧张");
    expect(screen.getByRole("button", { name: "发送修改要求" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "全部清空" }));
    expect(input).toHaveValue("");
  });

  test("jumps the preview to the page selected from the modification picker", () => {
    const twoPageState: CourseContentState = {
      ...initialState,
      chapters: initialState.chapters.map((chapter) => ({
        ...chapter,
        paragraphs: [
          ...chapter.paragraphs,
          { id: "p2", parts: [{ type: "text", text: "The selected second page." }] },
        ],
      })),
    };
    render(<CourseContentWorkspace initialState={twoPageState} />);

    fireEvent.click(screen.getByRole("button", { name: "选择要修改的页面" }));
    fireEvent.click(screen.getByRole("button", { name: "第 1 章 · 正文第 2 页" }));

    expect(screen.getByText("The selected second page.")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 页")).toBeInTheDocument();
  });

  test("uses the styled repair-range picker instead of a native select", () => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); },
      close(this: HTMLDialogElement) { this.removeAttribute("open"); },
    });
    render(<CourseContentWorkspace initialState={initialState} />);

    expect(screen.queryByLabelText("修改范围", { selector: "select" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "选择要修改的页面" }));
    expect(screen.getByRole("heading", { name: "选择修复范围" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "第 1 章 · 正文第 1 页" }));
    expect(screen.getByText("第 1 章 · 正文第 1 页")).toBeInTheDocument();
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

  test("explains that generation state is saved", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "generating_reading", phase: "generating_chapters" }} />);
    expect(screen.getByText(/任务已经提交，本次操作只会执行一次/)).toBeInTheDocument();
  });

  test("keeps the reading confirmation before loading and preserves all records after exercises finish", async () => {
    let resolveGeneration!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveGeneration = resolve; })));
    const readingReadyState: CourseContentState = {
      ...initialState,
      status: "reading_ready",
      messages: [{ id: "existing", role: "assistant", content: "正文已经生成。", createdAt: "2026-08-10T00:00:00.000Z" }],
    };
    render(<CourseContentWorkspace initialState={readingReadyState} />);

    fireEvent.click(screen.getByRole("button", { name: "确认正文与课后阅读，生成练习" }));

    const timeline = screen.getByTestId("content-chat-scroll");
    const prior = within(timeline).getByText("正文已经生成。");
    const confirmation = within(timeline).getByText("我确认正文与课后阅读，请生成章节与课后练习。");
    const loading = within(timeline).getByText("正在生成章节与课后练习");
    expect(prior.compareDocumentPosition(confirmation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(confirmation.compareDocumentPosition(loading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    resolveGeneration(Response.json({
      ...initialState,
      messages: [
        ...readingReadyState.messages,
        { id: "confirmation", role: "teacher", content: "我确认正文与课后阅读，请生成章节与课后练习。", createdAt: "2026-08-10T00:01:00.000Z" },
      ],
    }));

    await waitFor(() => expect(within(timeline).queryByText("正在生成章节与课后练习")).not.toBeInTheDocument());
    expect(within(timeline).getByText("正文已经生成。")).toBeInTheDocument();
    expect(within(timeline).getAllByText("我确认正文与课后阅读，请生成章节与课后练习。")).toHaveLength(1);
  });

  test("restores a persisted modification as working after refresh and keeps polling", async () => {
    const fetchMock = vi.fn(async () => Response.json(initialState));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      messages: [{ id: "modify-target", role: "teacher", content: "让语气更紧张", targetType: "paragraph", targetId: "p1", createdAt: "2026-08-09T00:00:00.000Z" }],
      operation: { id: "generation-1", type: "modify", status: "running", startedAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" },
    }} />);

    expect(screen.getByText("正在修改课程内容")).toBeInTheDocument();
    expect(screen.getByText("第 1 章 · 正文第 1 页")).toBeInTheDocument();
    expect(screen.getByLabelText("修改要求")).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/content"), { timeout: 3000 });
  });

  test("keeps the reset recovery entry available for a persisted operation", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      status: "generating_reading",
      phase: "generating_chapters",
      operation: { id: "generation-1", type: "reading", status: "running", startedAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" },
    }} />);

    expect(screen.getByRole("button", { name: "重新开始" })).toBeEnabled();
  });

  test("ignores an old generation response after reset has completed", async () => {
    let resolveGeneration!: (response: Response) => void;
    const emptyState: CourseContentState = { ...initialState, status: "empty", phase: null, chapters: [], mainIdea: null, homework: null, messages: [], contentVersion: 0, operation: null };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/reading/generate")) return new Promise<Response>((resolve) => { resolveGeneration = resolve; });
      if (url.endsWith("/reset")) return Promise.resolve(Response.json(emptyState));
      return Promise.resolve(Response.json(emptyState));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseContentWorkspace initialState={initialState} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成正文与课后阅读" }));
    fireEvent.click(screen.getByRole("button", { name: "重新开始" }));
    fireEvent.click(screen.getByRole("button", { name: "删除文案与练习并重新开始" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "生成正文与课后阅读" })).toBeInTheDocument());

    resolveGeneration(Response.json(initialState));
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "生成正文与课后阅读" })).toBeInTheDocument();
    expect(screen.queryByLabelText("课程内容预览")).not.toBeInTheDocument();
  });

  test("offers a targeted Main Idea retry after its isolated validation fails", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "failed", errorMessage: "课后阅读连续两次修复后词数仍应为 130–170，实际 178" }} />);
    expect(screen.getByRole("button", { name: "重试课后阅读" })).toBeInTheDocument();
  });

  test("removes the previous timeout error immediately when retry starts", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "failed", errorMessage: "请求超时" }} />);

    expect(screen.getByText("请求超时")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试未通过内容" }));

    expect(screen.queryByText("请求超时")).not.toBeInTheDocument();
    expect(screen.getByText("正在生成正文与课后阅读")).toBeInTheDocument();
  });

  test("keeps Step 5 reachable without adding a confirmation action to chat", () => {
    render(<CourseContentWorkspace initialState={{ ...initialState, status: "confirmed", course: { ...initialState.course, currentStage: "content" } }} />);

    expect(screen.getByRole("link", { name: "视觉资源" })).toHaveAttribute(
      "href",
      "/courses/course-1/create/visual-resources",
    );
    expect(screen.queryByText("本环节已确认，视觉资源可继续编辑")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步：视觉资源" }));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/visual-resources");
  });

  test("keeps focus on real preview controls instead of the whole render window", () => {
    render(<CourseContentWorkspace initialState={initialState} />);

    const preview = screen.getByLabelText("课程内容预览");
    expect(preview).not.toHaveAttribute("tabindex");
    expect(preview).not.toHaveClass("focus-visible:ring-2", "focus-visible:ring-inset");
    expect(screen.getByRole("button", { name: "上一页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
  });

  test("keeps next step available when the current content is an older retained version", () => {
    render(<CourseContentWorkspace initialState={{
      ...initialState,
      status: "confirmed",
      course: { ...initialState.course, currentStage: "preview", staleFromStage: "content" },
    }} />);

    const nextButton = screen.getByRole("button", { name: "下一步：视觉资源" });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/visual-resources");
  });

  test("confirms and enters Step 5 directly without adding a chat action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...initialState, status: "confirmed" })));
    render(<CourseContentWorkspace initialState={initialState} />);

    expect(screen.queryByRole("button", { name: "确认内容，进入视觉资源" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步：视觉资源" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/courses/course-1/content/confirm", { method: "POST" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/visual-resources"));
    expect(screen.queryByRole("img", { name: "老师" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("does not render a generation progress card while only confirming and navigating", async () => {
    let resolveConfirm!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveConfirm = resolve; })));
    render(<CourseContentWorkspace initialState={initialState} />);

    fireEvent.click(screen.getByRole("button", { name: "下一步：视觉资源" }));

    expect(screen.queryByText("正在按指定范围修改内容")).not.toBeInTheDocument();
    expect(screen.queryByText(/已等待 \d+ 秒/)).not.toBeInTheDocument();

    resolveConfirm(Response.json({ ...initialState, status: "confirmed" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/visual-resources"));
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

  test("confirms preserving old downstream content before regenerating completed content", async () => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); },
      close(this: HTMLDialogElement) { this.removeAttribute("open"); },
    });
    const completedState = { ...initialState, course: { ...initialState.course, currentStage: "preview" as const } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "需要确认", requiresReset: true }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ...completedState, course: { ...completedState.course, currentStage: "content" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseContentWorkspace initialState={completedState} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成正文与课后阅读" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "继续重新生成？" })).toBeInTheDocument());
    expect(screen.getByText(/视觉资源、图片和预览发布设置/)).toBeInTheDocument();
    expect(screen.queryByText(/Step/)).not.toBeInTheDocument();
    expect(screen.getByText(/不会自动更新，也不会被删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续重新生成" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/courses/course-1/content/reading/generate?regenerate=true&preserveDownstream=true",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  test("clears only Step4 records and keeps later stages after confirmation", async () => {
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
    expect(screen.getByText(/将删除当前文案与练习并重新开始/)).toBeInTheDocument();
    expect(screen.getByText(/视觉资源、图片和预览发布设置/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByText(/不会被删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除文案与练习并重新开始" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/content/reset", { method: "POST" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "生成正文与课后阅读" })).toBeInTheDocument());
  });
});
