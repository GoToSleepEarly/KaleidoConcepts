import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CourseTeachingPlanWorkspace } from "@/features/courses/components/course-teaching-plan-workspace";
import type { TeachingPlanState } from "@/lib/contracts/api";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function state(): TeachingPlanState {
  return {
    course: { id: "course-1", title: "海底图书馆", durationMinutes: 45, currentStage: "teaching_plan", englishLevel: "B1", knowledgePointIds: ["grammar-1", "grammar-2"] },
    outline: {
      id: "outline-1",
      title: "海底图书馆",
      chapters: [
        { id: "chapter-1", order: 1, title: "发光地图", summary: "学生发现发光地图。", recommendedKnowledgePointIds: ["grammar-1"], knowledgePointRecommendationSummary: "适合用过去时描述发现地图的过程。" },
        { id: "chapter-2", order: 2, title: "蓝色书页", summary: "学生寻找蓝色书页。", recommendedKnowledgePointIds: ["grammar-2"], knowledgePointRecommendationSummary: "适合用问句推动寻找线索。" },
      ],
    },
    knowledgePoints: [
      { id: "grammar-1", label: "Past Simple", labelZh: "一般过去时", category: "时态" },
      { id: "grammar-2", label: "Wh- Questions", labelZh: "特殊疑问句", category: "句型" },
      { id: "grammar-3", label: "Present Perfect", labelZh: "现在完成时", category: "时态" },
      { id: "grammar-4", label: "Modal Verbs", labelZh: "情态动词", category: "情态动词" },
    ],
    plan: {
      courseId: "course-1",
      status: "draft",
      englishLevel: "B1",
      chapters: [
        {
          outlineChapterId: "chapter-1",
          targetWordCount: 180,
          paragraphCount: 3,
          knowledgePointIds: ["grammar-1"],
          readingExerciseMode: "complete",
          readingExercises: { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } },
          chapterPractice: { enabled: true, grammar: { optionCloze: 5, wordForm: 5 } },
          touched: { targetWordCount: false, paragraphCount: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false },
        },
        {
          outlineChapterId: "chapter-2",
          targetWordCount: 180,
          paragraphCount: 3,
          knowledgePointIds: ["grammar-2"],
          readingExerciseMode: "complete",
          readingExercises: { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } },
          chapterPractice: { enabled: true, grammar: { optionCloze: 5, wordForm: 5 } },
          touched: { targetWordCount: false, paragraphCount: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false },
        },
      ],
      afterClassPractice: {
        enabled: false,
        vocabularyReviewEnabled: false,
        knowledgePointIds: ["grammar-1", "grammar-2"],
        practice: { enabled: false, grammar: { optionCloze: 5, wordForm: 5 } },
        touched: { knowledgePointIds: false, practice: false },
      },
      updatedAt: "2026-08-07T00:00:00.000Z",
      confirmedAt: null,
    },
  };
}

describe("CourseTeachingPlanWorkspace", () => {
  beforeEach(() => {
    vi.useRealTimers();
    pushMock.mockClear();
    vi.unstubAllGlobals();
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
  });

  test("opens with Step 1 difficulty and system recommendations already applied", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.queryByRole("tab", { name: /难度/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("B1").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("第 1 章正文段落数")).toHaveTextContent("3 段");
    expect(screen.getByLabelText("第 1 章正文段落数")).not.toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveValue(180);
    expect(screen.getByLabelText("第 1 章章节练习选项填空数量")).toHaveValue(5);
    expect(screen.getByText(/AI 推荐：适合用过去时/)).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveAttribute("max", "200");
    expect(screen.queryByText(/当前难度推荐/)).not.toBeInTheDocument();
    expect(screen.queryByText("部分配置保留了你的修改。")).not.toBeInTheDocument();
  });

  test("shows fixed正文 categories and defaults without matching", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    expect(screen.getByText("语法")).toBeInTheDocument();
    expect(screen.getByText("词汇词组")).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 章正文选项填空数量")).toHaveValue(4);
    expect(screen.getByLabelText("第 1 章正文给词变形数量")).toHaveValue(3);
    expect(screen.getByLabelText("第 1 章正文中文提示写词数量")).toHaveValue(3);
    expect(screen.queryByLabelText("第 1 章正文中英配对数量")).not.toBeInTheDocument();
    expect(screen.getAllByText("举例：Summer ______ (found / lost / painted) the glowing map.").length).toBeGreaterThan(0);
  });

  test("uses story title, inline global settings, and accurate exercise type hints", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByRole("heading", { name: "海底图书馆" })).toBeInTheDocument();
    expect(screen.getByText("45 分钟")).toBeInTheDocument();
    expect(screen.queryByText("选择全课英语难度")).not.toBeInTheDocument();
    const desktopSidebar = screen.getByTestId("teaching-plan-desktop-sidebar");
    expect(within(desktopSidebar).getByRole("tab", { name: /章节/ })).toBeInTheDocument();
    expect(within(desktopSidebar).getByRole("tab", { name: /课后/ })).toBeInTheDocument();

    expect(screen.getAllByText("选项填空").length).toBeGreaterThan(0);
    expect(screen.getAllByText("给词变形").length).toBeGreaterThan(0);
    expect(screen.getByText("中文提示写词")).toBeInTheDocument();
    expect(screen.getAllByText("举例：Summer ______ (found / lost / painted) the glowing map.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：Yesterday, Mia ______ (find) the hidden door.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：The map showed a secret ______ (路线，5个字母).").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B1").length).toBeGreaterThan(0);
    expect(screen.getByText("全课 2 个知识点")).toBeInTheDocument();

    fireEvent.click(within(desktopSidebar).getByRole("tab", { name: /课后/ }));
    expect(screen.getByRole("heading", { name: "课后练习" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    expect(screen.getByRole("button", { name: "词汇复习已开启" })).toBeInTheDocument();
    expect(screen.getByText(/从各章节正文的词汇习题自动汇总并去重/)).toBeInTheDocument();
  });

  test("uses a single-column mobile workbench without horizontal chapter dragging", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByTestId("teaching-plan-layout")).toHaveClass("lg:grid-cols-[300px_minmax(0,1fr)]");
    expect(screen.getByTestId("teaching-plan-desktop-sidebar")).toHaveClass("hidden", "lg:block");
    expect(screen.getByTestId("teaching-plan-mobile-controls")).toHaveClass("lg:hidden");
    expect(screen.getByTestId("teaching-plan-mobile-panel-tabs")).toHaveClass("grid-cols-2");
    expect(screen.queryByTestId("teaching-plan-mobile-chapter-tabs")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置" })).toHaveClass("lg:hidden");
    expect(screen.getByRole("button", { name: "重置教学规划" })).toHaveClass("hidden", "lg:inline-flex");
    expect(screen.getByRole("button", { name: "章节" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "课后" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("combobox", { name: "移动端章节选择" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("teaching-plan-mobile-section-tabs")).toHaveClass("grid-cols-3");
    expect(screen.getByRole("button", { name: "目标" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "正文" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "练习" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("teaching-plan-bottom-summary")).toHaveClass("flex", "flex-wrap");
    expect(screen.getByTestId("teaching-plan-bottom-summary")).toHaveTextContent("章节 2/2 · 课后练习不生成");
    expect(screen.getByTestId("teaching-plan-bottom-summary")).toHaveTextContent("已自动保存");

    fireEvent.click(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" }));
    expect(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" })).toHaveAttribute("aria-controls", "mobile-chapter-list");
    expect(screen.getByRole("listbox", { name: "移动端章节列表" })).toHaveAttribute("id", "mobile-chapter-list");
    expect(screen.getByRole("listbox", { name: "移动端章节列表" })).toHaveClass("max-h-[40dvh]", "overflow-y-auto");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "移动端章节列表" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox", { name: "移动端章节列表" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" }));
    fireEvent.click(screen.getByRole("option", { name: "第 2/2 章 · 蓝色书页" }));

    expect(screen.getByRole("heading", { name: "第 2 章 · 蓝色书页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 2/2 章 · 蓝色书页" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "移动端章节列表" })).not.toBeInTheDocument();
    expect(screen.getByTestId("teaching-plan-goals-section")).not.toHaveClass("max-lg:hidden");
    expect(screen.getByTestId("teaching-plan-reading-section")).toHaveClass("max-lg:hidden");
    expect(screen.getByTestId("teaching-plan-practice-section")).toHaveClass("max-lg:hidden");

    fireEvent.click(screen.getByRole("button", { name: "正文" }));
    expect(screen.getByRole("radiogroup", { name: "正文模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步正文设置到全部章节" })).toHaveClass("self-start", "sm:self-auto");
    expect(screen.getByTestId("teaching-plan-goals-section")).toHaveClass("max-lg:hidden");
    expect(screen.getByTestId("teaching-plan-reading-section")).not.toHaveClass("max-lg:hidden");
    expect(screen.getByTestId("teaching-plan-practice-section")).toHaveClass("max-lg:hidden");

    fireEvent.click(screen.getByRole("button", { name: "练习" }));
    expect(screen.getByRole("button", { name: "章节练习已开启" })).toBeInTheDocument();
    expect(screen.getByTestId("teaching-plan-goals-section")).toHaveClass("max-lg:hidden");
    expect(screen.getByTestId("teaching-plan-reading-section")).toHaveClass("max-lg:hidden");
    expect(screen.getByTestId("teaching-plan-practice-section")).not.toHaveClass("max-lg:hidden");

    fireEvent.click(screen.getByRole("button", { name: "课后" }));

    expect(screen.queryByRole("button", { name: /第 2\/2 章/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "课后阅读" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "章节" }));
    expect(screen.queryByRole("listbox", { name: "移动端章节列表" })).not.toBeInTheDocument();
  });

  test("auto-saves edits and shows saved status without navigating", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => Response.json({ plan: { ...state().plan, chapters: [{ ...state().plan.chapters[0], targetWordCount: 120 }, state().plan.chapters[1]] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    fireEvent.change(screen.getByLabelText("第 1 章目标词数"), { target: { value: "120" } });

    expect(screen.getAllByText("未保存").length).toBeGreaterThan(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/teaching-plan",
      expect.objectContaining({ method: "PUT" }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByText("已自动保存").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已自动保存")[0]).toHaveClass("whitespace-nowrap");
    expect(pushMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("turns an empty save response into a recoverable business error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.change(screen.getByLabelText("第 1 章目标词数"), { target: { value: "120" } });
    await act(async () => void await vi.advanceTimersByTimeAsync(900));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("保存失败，请重试");
    expect(alert.closest(".sticky")).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected end of JSON input/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  test("resets the teaching plan from the current outline after confirmation", async () => {
    const freshPlan = {
      ...state().plan,
      chapters: state().plan.chapters.map((chapter, index) => ({
        ...chapter,
        targetWordCount: 120,
        knowledgePointIds: [`grammar-${index + 1}`],
      })),
    };
    const fetchMock = vi.fn(async () => Response.json({ plan: freshPlan }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "重置教学规划" }));
    expect(screen.getByRole("dialog", { name: "重置教学规划？" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/teaching-plan/reset",
      { method: "POST" },
    ));
    await waitFor(() => expect(screen.getByLabelText("第 1 章目标词数")).toHaveValue(120));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "重置教学规划？" })).not.toBeInTheDocument());
  });

  test("deletes and restores optional正文 exercise types", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url, options: RequestInit) => Response.json({ plan: JSON.parse(String(options.body)).plan }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "第 1 章正文删除题型 中文提示写词" }));
    expect(screen.queryByLabelText("第 1 章正文中文提示写词数量")).not.toBeInTheDocument();
    await act(async () => void await vi.advanceTimersByTimeAsync(900));
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1/teaching-plan", expect.objectContaining({ method: "PUT" }));

    fireEvent.click(screen.getByRole("button", { name: "添加正文题型" }));
    expect(screen.getByRole("button", { name: "添加中文提示写词" })).toHaveTextContent("The map showed a secret");
    fireEvent.click(screen.getByRole("button", { name: "添加中文提示写词" }));
    expect(screen.getByLabelText("第 1 章正文中文提示写词数量")).toHaveValue(3);
    vi.useRealTimers();
  });

  test("selects knowledge points from grammar library and warns after more than three", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    expect(screen.queryByLabelText("第 1 章知识点Past Simple")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "从语法库选择" }));
    expect(screen.getByRole("heading", { name: "选择本章知识点" })).toBeInTheDocument();
    expect(screen.getByText("按类别选择本章教学目标；可使用完整语法库，不受 Step 1 预选范围限制。")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "时态" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "句型" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /现在完成时.*Present Perfect/ }));
    fireEvent.click(screen.getByRole("tab", { name: "句型" }));
    fireEvent.click(screen.getByRole("button", { name: /特殊疑问句.*Wh- Questions/ }));
    fireEvent.click(screen.getByRole("tab", { name: "情态动词" }));
    fireEvent.click(screen.getByRole("button", { name: /情态动词.*Modal Verbs/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));

    expect(screen.getByText("建议一章不超过 3 个知识点。")).toBeInTheDocument();
    expect(screen.getByText("全课 4 个知识点")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("删除知识点 情态动词 · Modal Verbs"));
    expect(screen.queryByText("建议一章不超过 3 个知识点。")).not.toBeInTheDocument();
  });

  test("does not render chapter preview", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.queryByText("当前章预览")).not.toBeInTheDocument();
    expect(screen.queryByText("阅读页")).not.toBeInTheDocument();
    expect(screen.queryByText(/章节练习页/)).not.toBeInTheDocument();
  });

  test("keeps chapter practice limited to selectable grammar exercise types", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByLabelText("第 1 章章节练习选项填空数量")).toHaveValue(5);
    expect(screen.getByLabelText("第 1 章章节练习给词变形数量")).toHaveValue(5);
    expect(screen.queryByLabelText("第 1 章章节练习中文提示写词数量")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "第 1 章章节练习删除题型 给词变形" }));
    expect(screen.queryByLabelText("第 1 章章节练习给词变形数量")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加章节练习题型" }));
    expect(screen.getByRole("button", { name: "添加给词变形" })).toHaveTextContent("Yesterday, Mia");
    fireEvent.click(screen.getByRole("button", { name: "添加给词变形" }));
    expect(screen.getByLabelText("第 1 章章节练习给词变形数量")).toHaveValue(5);
  });

  test("applies current chapter settings to all chapters without overwriting knowledge points", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("radio", { name: /边读边练/ }));
    fireEvent.click(screen.getByLabelText("第 1 章正文选项填空增加"));

    const desktopSidebar = screen.getByTestId("teaching-plan-desktop-sidebar");
    fireEvent.click(within(desktopSidebar).getByRole("button", { name: /第 2 章/ }));
    fireEvent.click(within(desktopSidebar).getByRole("button", { name: /第 1 章/ }));
    fireEvent.click(screen.getByRole("button", { name: "同步正文设置到全部章节" }));

    fireEvent.click(within(desktopSidebar).getByRole("button", { name: /第 2 章/ }));
    expect(screen.getByText("特殊疑问句 · Wh- Questions")).toBeInTheDocument();
    expect(screen.queryByText("一般过去时 · Past Simple")).not.toBeInTheDocument();
    expect(screen.getByLabelText("第 2 章目标词数")).toHaveValue(180);
    expect(screen.getByRole("radio", { name: /边读边练/ })).toBeChecked();
    expect(screen.getByLabelText("第 2 章正文选项填空数量")).toHaveValue(5);
  });

  test("distinguishes AI recommendations from manual additions and can reset the chapter", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByText(/AI 推荐：适合用过去时/)).toBeInTheDocument();
    expect(screen.getByText("AI 推荐", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "从语法库选择" }));
    fireEvent.click(screen.getByRole("button", { name: /现在完成时.*Present Perfect/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));

    expect(screen.getByText("手动添加")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重置为 AI 推荐" }));
    expect(screen.queryByText("Present Perfect")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重置为 AI 推荐" })).not.toBeInTheDocument();
  });

  test("groups Step 1 selections that AI did not recommend for manual completion", () => {
    const input = state();
    input.course.knowledgePointIds = ["grammar-1", "grammar-2", "grammar-3"];
    render(<CourseTeachingPlanWorkspace initialState={input} />);

    fireEvent.click(screen.getByRole("button", { name: "从语法库选择" }));
    fireEvent.click(screen.getByRole("tab", { name: "已选但 AI 未推荐" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /现在完成时.*Present Perfect/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /一般过去时.*Past Simple/ })).not.toBeInTheDocument();
  });

  test("uses the union of current chapter knowledge points for after-class practice", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    fireEvent.click(screen.getByRole("button", { name: "语法习题已关闭" }));

    expect(screen.getByText("已默认选中各章节使用的知识点；取消勾选即可排除不需要考查的内容。")).toBeInTheDocument();
    expect(screen.getByLabelText("一般过去时 · Past Simple")).toBeChecked();
    expect(screen.getByLabelText("特殊疑问句 · Wh- Questions")).toBeChecked();
    fireEvent.click(screen.getByLabelText("一般过去时 · Past Simple"));
    expect(screen.getByLabelText("一般过去时 · Past Simple")).not.toBeChecked();
  });

  test("allows vocabulary-only after-class review and closes the parent option when both children are off", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    expect(screen.getByRole("button", { name: "词汇复习已开启" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "语法习题已关闭" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/从各章节正文的词汇习题自动汇总并去重/)).toBeInTheDocument();
    expect(screen.getByText(/仅本模块与下方语法知识点联动/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "语法习题已关闭" }));
    expect(screen.getByRole("button", { name: "语法习题已开启" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "语法习题已开启" }));
    expect(screen.getByRole("button", { name: "词汇复习已开启" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "生成课后练习" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "词汇复习已开启" }));
    expect(screen.getByRole("button", { name: "不生成课后练习" })).toHaveAttribute("aria-pressed", "true");
  });

  test("falls back to grammar homework when no chapter can provide vocabulary review", () => {
    const withoutVocabulary = state();
    withoutVocabulary.plan.chapters = withoutVocabulary.plan.chapters.map((chapter) => ({
      ...chapter,
      readingExercises: { ...chapter.readingExercises, vocabulary: { chineseHint: 0 } },
    }));
    render(<CourseTeachingPlanWorkspace initialState={withoutVocabulary} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));

    expect(screen.getByRole("button", { name: "词汇复习已关闭" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "语法习题已开启" })).toHaveAttribute("aria-pressed", "true");
  });

  test("locks forward step navigation after an upstream style edit until the plan is reconfirmed", () => {
    const returnedState = state();
    returnedState.plan.status = "confirmed";
    returnedState.course.currentStage = "visual_resources";
    render(<CourseTeachingPlanWorkspace initialState={returnedState} />);

    expect(screen.getByRole("link", { name: "文案与练习" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    fireEvent.click(screen.getByRole("radio", { name: /边读边练/ }));
    expect(screen.queryByRole("link", { name: "文案与练习" })).not.toBeInTheDocument();
  });

  test("defaults to inline questions without chapter or after-class practice", () => {
    const defaultState = state();
    defaultState.plan.chapters = defaultState.plan.chapters.map((chapter) => ({ ...chapter, readingExerciseMode: "interactive", chapterPractice: { ...chapter.chapterPractice, enabled: false } }));
    render(<CourseTeachingPlanWorkspace initialState={defaultState} />);

    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    expect(screen.getByRole("radiogroup", { name: "正文模式" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /边读边练/ })).toBeChecked();
    expect(screen.getByText("答案状态：直接显示")).toBeInTheDocument();
    expect(screen.getByText("答案状态：保留空位")).toBeInTheDocument();
    expect(screen.getByText("正文保留作答位置，学生边读边完成。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "章节练习已关闭" })).toHaveAttribute("aria-pressed", "false");
    const chapterPracticeToggle = screen.getByRole("button", { name: "章节练习已关闭" });
    const toggleThumb = chapterPracticeToggle.querySelector("span > span");
    expect(toggleThumb).toHaveClass("left-0.5", "translate-x-0");
    fireEvent.click(chapterPracticeToggle);
    expect(screen.getByRole("button", { name: "章节练习已开启" }).querySelector("span > span")).toHaveClass("left-0.5", "translate-x-4");
    expect(screen.queryByText("题型提示")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步正文设置到全部章节" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步章节练习到全部章节" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    expect(screen.queryByText("请选择是否生成课后练习")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成课后练习" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不生成课后练习" })).toHaveAttribute("aria-pressed", "true");
  });

  test("confirms plan and navigates to content", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      plan: { ...state().plan, status: "confirmed", confirmedAt: "2026-08-07T00:10:00.000Z" },
      course: { id: "course-1", currentStage: "content" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "确认并进入文案与练习" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/content");
  });

  test("uses one click to save and confirm while automatic saving is still running", async () => {
    vi.useFakeTimers();
    let finishFirstSave: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/teaching-plan") && init?.method === "PUT") {
        if (fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/teaching-plan")).length === 1) {
          return new Promise<Response>((resolve) => { finishFirstSave = resolve; });
        }
        return Promise.resolve(Response.json({ plan: { ...state().plan, mainIdeaTargetWordCount: 130 } }));
      }
      return Promise.resolve(Response.json({
        plan: { ...state().plan, status: "confirmed", confirmedAt: "2026-08-07T00:10:00.000Z" },
        course: { id: "course-1", currentStage: "content" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.change(screen.getByLabelText("课后阅读目标词数"), { target: { value: "130" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    const confirmButton = screen.getByRole("button", { name: "确认并进入文案与练习" });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/teaching-plan/confirm"))).toBe(false);
    finishFirstSave?.(Response.json({ plan: { ...state().plan, mainIdeaTargetWordCount: 130 } }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/content");
  });

  test("uses an in-app confirmation before immediately deleting later results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "需要确认", requiresReset: true, affectedResources: ["视觉资源和图片"] }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ plan: { ...state().plan, status: "confirmed" }, course: { id: "course-1", currentStage: "content" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={{ ...state(), course: { ...state().course, currentStage: "preview" } }} />);

    fireEvent.click(screen.getByRole("button", { name: "确认并进入文案与练习" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "当前配置已变更" })).toBeInTheDocument());
    expect(screen.getByText("视觉资源和图片")).toBeInTheDocument();
    expect(screen.queryByText("预览发布设置")).not.toBeInTheDocument();
    expect(screen.getByText(/两种选择都会应用当前教学规划/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保留后续内容并继续" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空后续内容并继续" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ body: JSON.stringify({ downstreamAction: "clear" }) }),
    ));
  });

  test("applies the changed plan and continues when preserving downstream content", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "需要选择", requiresReset: true, affectedResources: ["文案与练习"] }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ plan: { ...state().plan, status: "confirmed" }, course: { id: "course-1", currentStage: "content" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "确认并进入文案与练习" }));
    fireEvent.click(await screen.findByRole("button", { name: "保留后续内容并继续" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ body: JSON.stringify({ downstreamAction: "preserve" }) }),
    ));
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/content");
  });

  test("viewing a confirmed plan and continuing does not call confirm or show deletion", async () => {
    const viewed = state();
    viewed.plan.status = "confirmed";
    viewed.plan.confirmedAt = "2026-08-07T00:10:00.000Z";
    viewed.course.currentStage = "preview";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={viewed} />);

    fireEvent.click(screen.getByRole("button", { name: "进入文案与练习" }));

    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/content");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "当前配置已变更" })).not.toBeInTheDocument();
  });
});
