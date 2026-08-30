import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      title: "海底图书馆 / The Underwater Library",
      chapters: [
        { id: "chapter-1", order: 1, title: "发光地图", summary: "学生发现发光地图。", recommendedKnowledgePointIds: ["grammar-1"], knowledgePointRecommendationSummary: "适合用过去时描述发现地图的过程。" },
        { id: "chapter-2", order: 2, title: "蓝色书页", summary: "学生寻找蓝色书页。", recommendedKnowledgePointIds: ["grammar-2"], knowledgePointRecommendationSummary: "适合用问句推动寻找线索。" },
      ],
    },
    knowledgePoints: [
      { id: "grammar-1", label: "Past Simple", labelZh: "一般过去时", category: "Past", bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2", unitStart: 1, unitEnd: 1, units: [{ unitNumber: 1, officialTitle: "Past simple" }] },
      { id: "grammar-2", label: "Wh- Questions", labelZh: "特殊疑问句", category: "Questions", bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2", unitStart: 2, unitEnd: 2, units: [{ unitNumber: 2, officialTitle: "Questions" }] },
      { id: "grammar-3", label: "Present Perfect", labelZh: "现在完成时", category: "Past", bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2", unitStart: 3, unitEnd: 3, units: [{ unitNumber: 3, officialTitle: "Present perfect" }] },
      { id: "grammar-4", label: "Modal Verbs", labelZh: "情态动词", category: "Modals", bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2", unitStart: 4, unitEnd: 4, units: [{ unitNumber: 4, officialTitle: "Modals" }] },
    ],
    lengthPolicy: {
      englishLevel: "B1",
      storyComplexity: "conflict_driven",
      chinese: {
        directionOverview: { recommendedMax: 70, hardMax: 90 },
        outlineSummary: { recommendedMax: 80, hardMax: 105 },
        chapterOverview: { recommendedMax: 45, hardMax: 55 },
      },
      english: { chapterTargetWords: 130, generationRange: [115, 145], validationRange: [110, 155], teacherRecommendedRange: [110, 150], hardRange: [60, 180] },
    },
    plan: {
      courseId: "course-1",
      status: "draft",
      englishLevel: "B1",
      chapters: [
        {
          outlineChapterId: "chapter-1",
          targetWordCount: 180,
          paragraphCount: 2,
          knowledgePointIds: ["grammar-1"],
          readingExerciseMode: "complete",
          readingExercises: { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } },
          chapterPractice: { enabled: true, grammar: { optionCloze: 5, wordForm: 5 } },
          touched: { targetWordCount: false, paragraphCount: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false },
        },
        {
          outlineChapterId: "chapter-2",
          targetWordCount: 180,
          paragraphCount: 2,
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
    vi.restoreAllMocks();
    pushMock.mockClear();
    vi.unstubAllGlobals();
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
  });

  test("opens with the Step 2 heading hierarchy and system defaults already applied", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.queryByRole("tab", { name: /难度/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "教学规划" })).toHaveClass("text-2xl");
    expect(screen.getByText("海底图书馆 / The Underwater Library")).toHaveClass("text-lg", "font-semibold");
    expect(screen.queryByText(/难度 B1|教材范围/)).not.toBeInTheDocument();
    expect(screen.queryByText("B1", { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("第 1 章正文页数")).toHaveValue(2);
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveValue(180);
    expect(screen.getByLabelText("第 1 章章节练习选项填空数量")).toHaveValue(5);
    expect(screen.getByText(/AI 推荐：适合用过去时/)).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveAttribute("min", "60");
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveAttribute("max", "200");
    expect(screen.getByLabelText("第 1 章正文页数")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("第 1 章正文页数")).toHaveAttribute("max", "3");
    expect(screen.getByLabelText("第 1 章正文页数")).toHaveAttribute("step", "1");
    expect(screen.queryByText(/推荐 .*词|只有低于|推荐.*页/)).not.toBeInTheDocument();
    expect(screen.queryByText("部分配置保留了你的修改。")).not.toBeInTheDocument();
  });

  test("recommends two pages for A2 90 words and preserves a teacher page choice after word edits", () => {
    const input = state();
    input.course.englishLevel = "A2";
    input.plan.englishLevel = "A2";
    input.plan.chapters[0] = { ...input.plan.chapters[0], targetWordCount: 90, paragraphCount: 2 };
    render(<CourseTeachingPlanWorkspace initialState={input} />);

    expect(screen.getByLabelText("第 1 章正文页数")).toHaveValue(2);
    expect(screen.getByText(/每页约 45 词 · 将生成 2 个正文页和 2 张章节配图/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("第 1 章正文页数"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("第 1 章目标词数"), { target: { value: "120" } });

    expect(screen.getByLabelText("第 1 章正文页数")).toHaveValue(1);
    expect(screen.getByText(/每页约 120 词，高于 A2 建议的 45–70 词/)).toBeInTheDocument();
  });

  test("keeps numeric input editable but blocks confirmation with specific range errors", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    const wordInput = screen.getByLabelText("第 1 章目标词数");
    fireEvent.change(wordInput, { target: { value: "" } });
    expect(wordInput).toHaveValue(null);
    expect(wordInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("请输入 60–200 之间的整数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认并进入文案与练习" })).toBeDisabled();

    fireEvent.change(wordInput, { target: { value: "120" } });
    const pageInput = screen.getByLabelText("第 1 章正文页数");
    fireEvent.change(pageInput, { target: { value: "4" } });
    expect(pageInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("请输入 1–3 之间的整数")).toBeInTheDocument();
    expect(screen.getByTestId("teaching-plan-bottom-summary")).toHaveTextContent("第 1 章正文页数需为 1–3 之间的整数");

    fireEvent.change(pageInput, { target: { value: "3" } });
    expect(pageInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: "确认并进入文案与练习" })).toBeEnabled();
  });

  test("shows two summary lines by default and only offers expansion when the text overflows", () => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function mockClientHeight(this: HTMLElement) {
      return this.tagName === "P" ? 40 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function mockScrollHeight(this: HTMLElement) {
      return this.tagName === "P" && this.textContent?.includes("更长的章节概要") ? 72 : 20;
    });
    const input = state();
    input.outline.chapters[0].summary = "更长的章节概要，用来验证内容实际超过两行时才显示展开操作，并且默认仍然只展示两行内容。";
    render(<CourseTeachingPlanWorkspace initialState={input} />);

    const summary = screen.getByText(/更长的章节概要/);
    expect(summary).toHaveClass("line-clamp-2");
    fireEvent.click(screen.getByRole("button", { name: "展开概要" }));
    expect(summary).not.toHaveClass("line-clamp-2");
    expect(screen.getByRole("button", { name: "收起概要" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起概要" }));
    expect(summary).toHaveClass("line-clamp-2");
  });

  test("shows fixed正文 categories and defaults without matching", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

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

    expect(screen.getByRole("heading", { name: "教学规划" })).toBeInTheDocument();
    expect(screen.getByText("海底图书馆 / The Underwater Library")).toBeInTheDocument();
    expect(screen.queryByText("标准·冲突推进")).not.toBeInTheDocument();
    expect(screen.queryByText("45 分钟")).not.toBeInTheDocument();
    expect(screen.queryByText("选择全课英语难度")).not.toBeInTheDocument();
    const desktopSidebar = screen.getByTestId("teaching-plan-desktop-sidebar");
    expect(within(desktopSidebar).getByRole("tab", { name: /第 1 章/ })).toBeInTheDocument();
    expect(within(desktopSidebar).getByRole("tab", { name: /课后设置/ })).toBeInTheDocument();

    expect(screen.getAllByText("选项填空").length).toBeGreaterThan(0);
    expect(screen.getAllByText("给词变形").length).toBeGreaterThan(0);
    expect(screen.getByText("中文提示写词")).toBeInTheDocument();
    expect(screen.getAllByText("举例：Summer ______ (found / lost / painted) the glowing map.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：Yesterday, Mia ______ (find) the hidden door.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：The map showed a secret ______ (路线，5个字母).").length).toBeGreaterThan(0);
    expect(screen.queryByText(/难度 B1|教材范围/)).not.toBeInTheDocument();
    expect(screen.queryByText("全课 2 个知识点")).not.toBeInTheDocument();

    fireEvent.click(within(desktopSidebar).getByRole("tab", { name: /课后设置/ }));
    expect(screen.getByRole("heading", { name: "课后练习" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    expect(screen.getByRole("button", { name: "词汇复习已开启" })).toBeInTheDocument();
    expect(screen.getByText(/从各章节正文的词汇习题自动汇总并去重/)).toBeInTheDocument();
  });

  test("uses a single-column mobile workbench without horizontal chapter dragging", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByTestId("teaching-plan-workspace")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("teaching-plan-layout")).toHaveClass("grid-rows-[auto_minmax(0,1fr)]", "lg:grid-cols-[280px_minmax(0,1fr)]", "overflow-hidden");
    expect(screen.getByTestId("teaching-plan-editor-scroll")).toHaveClass("overflow-x-hidden", "overflow-y-auto");
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
    expect(screen.getByTestId("teaching-plan-bottom-summary")).toHaveTextContent("当前规划已确认");

    fireEvent.click(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" }));
    expect(screen.getByRole("button", { name: "第 1/2 章 · 发光地图" })).toHaveAttribute("aria-controls", "mobile-chapter-list");
    expect(screen.getByRole("listbox", { name: "移动端章节列表" })).toHaveAttribute("id", "mobile-chapter-list");
    expect(screen.getByRole("listbox", { name: "移动端章节列表" })).toHaveClass("max-h-[40dvh]", "overflow-y-auto");
    expect(screen.getByRole("option", { name: "第 2/2 章 · 蓝色书页" })).toHaveClass("min-h-11");
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
    expect(screen.getByRole("button", { name: "应用本章正文设置到其他章节" })).toHaveClass("self-start", "sm:self-auto");
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

  test("keeps edits local until the teacher confirms", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.change(screen.getByLabelText("第 1 章目标词数"), { target: { value: "120" } });

    expect(screen.getByText(/有未确认修改，确认后保存/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  test("does not show the old recommendation copy for valid word counts", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.change(screen.getByLabelText("第 1 章目标词数"), { target: { value: "100" } });
    expect(screen.queryByText(/低于推荐范围|高于推荐范围|只有低于/)).not.toBeInTheDocument();
  });

  test("turns an empty confirm response into a recoverable business error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.change(screen.getByLabelText("第 1 章目标词数"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "确认并进入文案与练习" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("教学规划确认失败");
    expect(alert.closest(".shadow-md")).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected end of JSON input/)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "删除并重置教学规划" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/teaching-plan/reset",
      { method: "POST" },
    ));
    await waitFor(() => expect(screen.getByLabelText("第 1 章目标词数")).toHaveValue(120));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "重置教学规划？" })).not.toBeInTheDocument());
  });

  test("deletes and restores optional正文 exercise types without saving early", async () => {
    const fetchMock = vi.fn(async (_url, options: RequestInit) => Response.json({ plan: JSON.parse(String(options.body)).plan }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "第 1 章正文删除题型 中文提示写词" }));
    expect(screen.queryByLabelText("第 1 章正文中文提示写词数量")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "添加正文题型" }));
    expect(screen.getByRole("button", { name: "添加中文提示写词" })).toHaveTextContent("The map showed a secret");
    fireEvent.click(screen.getByRole("button", { name: "添加中文提示写词" }));
    expect(screen.getByLabelText("第 1 章正文中文提示写词数量")).toHaveValue(3);
  });

  test("selects knowledge points from grammar library and warns after more than three", () => {
    const input = state();
    input.course.knowledgePointIds = ["grammar-1"];
    render(<CourseTeachingPlanWorkspace initialState={input} />);

    expect(screen.queryByLabelText("第 1 章知识点Past Simple")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "从语法库选择" }));
    expect(screen.getByRole("heading", { name: "新增本章知识点" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /English Grammar in Use.*Fifth Edition.*B1–B2/ })).toBeInTheDocument();
    expect(screen.getByLabelText("搜索当前书籍")).toHaveClass("text-base", "sm:text-sm");
    fireEvent.click(screen.getByRole("button", { name: /选择 Unit 3 Present Perfect/ }));
    fireEvent.click(screen.getByRole("button", { name: "Questions" }));
    fireEvent.click(screen.getByRole("button", { name: /选择 Unit 2 Wh- Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Modals" }));
    fireEvent.click(screen.getByRole("button", { name: /选择 Unit 4 Modal Verbs/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));

    expect(screen.getByText("建议一章不超过 3 个知识点。")).toBeInTheDocument();
    expect(screen.queryByText("全课 4 个知识点")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/删除知识点 情态动词 · Modal Verbs · Unit 4/));
    expect(screen.queryByText("建议一章不超过 3 个知识点。")).not.toBeInTheDocument();
  });

  test("allows clearing a chapter from the chapter configuration", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByLabelText(/删除知识点 一般过去时 · Past Simple · Unit 1/));

    expect(screen.getByText("本章不分配语法知识点，仅生成阅读与词汇内容")).toBeInTheDocument();
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
    fireEvent.click(within(desktopSidebar).getByRole("tab", { name: /第 2 章/ }));
    fireEvent.click(within(desktopSidebar).getByRole("tab", { name: /第 1 章/ }));
    fireEvent.click(screen.getByRole("button", { name: "应用本章正文设置到其他章节" }));
    expect(screen.getByRole("dialog", { name: "将本章正文设置应用到其他 1 章？" })).toHaveTextContent("目标词数、正文页数、阅读模式、正文题型和题量");
    expect(screen.getByRole("dialog", { name: "将本章正文设置应用到其他 1 章？" })).toHaveTextContent("各章知识点、章节练习");
    fireEvent.click(screen.getByRole("button", { name: "应用到其他章节" }));

    fireEvent.click(within(desktopSidebar).getByRole("tab", { name: /第 2 章/ }));
    expect(screen.getByText("特殊疑问句 · Wh- Questions · Unit 2")).toBeInTheDocument();
    expect(screen.queryByText("一般过去时 · Past Simple · Unit 1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("第 2 章目标词数")).toHaveValue(180);
    expect(screen.getByRole("radio", { name: /边读边练/ })).toBeChecked();
    expect(screen.getByLabelText("第 2 章正文选项填空数量")).toHaveValue(5);
  });

  test("explains chapter-practice scope and skips chapters without knowledge points", () => {
    const input = state();
    input.plan.chapters[1] = {
      ...input.plan.chapters[1],
      knowledgePointIds: [],
      readingExercises: { ...input.plan.chapters[1].readingExercises, grammar: { optionCloze: 0, wordForm: 0 } },
      chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } },
    };
    render(<CourseTeachingPlanWorkspace initialState={input} />);

    fireEvent.click(screen.getByRole("button", { name: "应用本章章节练习配置到其他章节" }));
    const dialog = screen.getByRole("dialog", { name: "将本章章节练习配置应用到其他 1 章？" });
    expect(dialog).toHaveTextContent("章节练习开启状态、选项填空和给词变形题量");
    expect(dialog).toHaveTextContent("将应用到 0 章；另有 1 章没有语法知识点，将保持关闭");
    fireEvent.click(screen.getByRole("button", { name: "应用到其他章节" }));

    const desktopSidebar = screen.getByTestId("teaching-plan-desktop-sidebar");
    fireEvent.click(within(desktopSidebar).getByRole("tab", { name: /第 2 章/ }));
    expect(screen.getByRole("button", { name: "章节练习已关闭" })).toHaveAttribute("aria-pressed", "false");
  });

  test("distinguishes AI recommendations from manual additions and can reset the chapter", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByText(/AI 推荐：适合用过去时/)).toBeInTheDocument();
    expect(screen.getByText("AI 推荐", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "从语法库选择" }));
    fireEvent.click(screen.getByRole("tab", { name: "更多知识点 2" }));
    fireEvent.click(screen.getByRole("button", { name: /选择 Unit 3 Present Perfect/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));

    expect(screen.getByText("本章添加")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重置为 AI 推荐" }));
    expect(screen.queryByText("Present Perfect")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重置为 AI 推荐" })).not.toBeInTheDocument();
  });

  test("limits the picker to AI-unrecommended and additional knowledge points", () => {
    const input = state();
    input.course.knowledgePointIds = ["grammar-1", "grammar-2", "grammar-3"];
    render(<CourseTeachingPlanWorkspace initialState={input} />);

    fireEvent.click(screen.getByRole("button", { name: "从语法库选择" }));
    const dialog = screen.getByRole("dialog");
    const catalogMain = dialog.querySelector("main");
    expect(catalogMain).not.toBeNull();
    expect(within(dialog).getByRole("tab", { name: "AI 未推荐 1" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("tab", { name: "更多知识点 1" })).toBeInTheDocument();
    expect(within(catalogMain as HTMLElement).getByRole("button", { name: /选择 Unit 3 Present Perfect/ })).toBeInTheDocument();
    expect(within(catalogMain as HTMLElement).queryByRole("button", { name: /Past Simple/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: /本章已选|基础信息已选/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/基础信息中已选择|检查本章最终使用/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("tab", { name: "更多知识点 1" }));
    expect(within(dialog).getByText("仅用于本章，不会修改基础信息。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modals" }));
    fireEvent.click(within(catalogMain as HTMLElement).getByRole("button", { name: /选择 Unit 4 Modal Verbs/ }));
    expect(within(catalogMain as HTMLElement).getByText("已加入本章")).toBeInTheDocument();
  });

  test("uses the union of current chapter knowledge points for after-class practice", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    fireEvent.click(screen.getByRole("button", { name: "语法习题已关闭" }));

    expect(screen.getByText("已默认选中各章节使用的知识点；取消勾选即可排除不需要考查的内容。")).toBeInTheDocument();
    expect(screen.getByLabelText("一般过去时 · Past Simple · Unit 1")).toBeChecked();
    expect(screen.getByLabelText("特殊疑问句 · Wh- Questions · Unit 2")).toBeChecked();
    fireEvent.click(screen.getByLabelText("一般过去时 · Past Simple · Unit 1"));
    expect(screen.getByLabelText("一般过去时 · Past Simple · Unit 1")).not.toBeChecked();
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

  test("keeps forward navigation available but warns before discarding local edits", () => {
    const returnedState = state();
    returnedState.plan.status = "confirmed";
    returnedState.course.currentStage = "visual_resources";
    render(<CourseTeachingPlanWorkspace initialState={returnedState} />);

    expect(screen.getByRole("link", { name: "文案与练习" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /边读边练/ }));
    fireEvent.click(screen.getByRole("link", { name: "文案与练习" }));
    expect(screen.getByRole("dialog", { name: "放弃未保存的修改？" })).toBeInTheDocument();
  });

  test("defaults to inline questions without chapter or after-class practice", () => {
    const defaultState = state();
    defaultState.plan.chapters = defaultState.plan.chapters.map((chapter) => ({ ...chapter, readingExerciseMode: "interactive", chapterPractice: { ...chapter.chapterPractice, enabled: false } }));
    render(<CourseTeachingPlanWorkspace initialState={defaultState} />);

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
    expect(screen.getByRole("button", { name: "应用本章正文设置到其他章节" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用本章章节练习配置到其他章节" })).toBeInTheDocument();

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

  test("saves the current plan only when confirming", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json({
        plan: { ...state().plan, status: "confirmed", confirmedAt: "2026-08-07T00:10:00.000Z" },
        course: { id: "course-1", currentStage: "content" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.change(screen.getByLabelText("课后阅读目标词数"), { target: { value: "130" } });
    const confirmButton = screen.getByRole("button", { name: "确认并进入文案与练习" });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ method: "POST" }),
    ));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ downstreamAction: "check", plan: { mainIdeaTargetWordCount: 130 } });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/teaching-plan"))).toBe(false);
    expect(pushMock).toHaveBeenCalledWith("/courses/course-1/create/content");
  });

  test("only preserves later results when confirming a changed teaching plan", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "需要确认", requiresReset: true, affectedResources: ["视觉资源和图片"] }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ plan: { ...state().plan, status: "confirmed" }, course: { id: "course-1", currentStage: "content" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={{ ...state(), course: { ...state().course, currentStage: "preview" } }} />);

    fireEvent.click(screen.getByRole("button", { name: "确认并进入文案与练习" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "后续内容需要更新" })).toBeInTheDocument());
    expect(screen.getByText("视觉资源和图片")).toBeInTheDocument();
    expect(screen.queryByText("预览发布设置")).not.toBeInTheDocument();
    expect(screen.getByText("保存后，以下内容仍会保留修改前的版本：")).toBeInTheDocument();
    expect(screen.getByText(/系统不会自动删除/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "后续内容需要更新" });
    expect(within(dialog).queryByRole("button", { name: /清空|删除/ })).not.toBeInTheDocument();
    expect(screen.getByText(/系统不会自动删除/).closest(".bg-amber-50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存修改并继续" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body))).toMatchObject({ downstreamAction: "preserve", plan: state().plan });
  });

  test("applies the changed plan and continues when preserving downstream content", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "需要选择", requiresReset: true, affectedResources: ["文案与练习"] }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ plan: { ...state().plan, status: "confirmed" }, course: { id: "course-1", currentStage: "content" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "确认并进入文案与练习" }));
    fireEvent.click(await screen.findByRole("button", { name: "保存修改并继续" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/courses/course-1/teaching-plan/confirm",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body))).toMatchObject({ downstreamAction: "preserve" });
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
