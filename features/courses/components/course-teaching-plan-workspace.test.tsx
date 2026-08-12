import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.queryByRole("button", { name: "课后练习" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /章节/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /课后/ })).toBeInTheDocument();

    expect(screen.getAllByText("选项填空").length).toBeGreaterThan(0);
    expect(screen.getAllByText("给词变形").length).toBeGreaterThan(0);
    expect(screen.getByText("中文提示写词")).toBeInTheDocument();
    expect(screen.getAllByText("举例：Summer ______ (found / lost / painted) the glowing map.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：Yesterday, Mia ______ (find) the hidden door.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：The map showed a secret ______ (路线，5个字母).").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    expect(screen.getByText("课后练习")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    expect(screen.getByText("词汇复习 · 中英配对")).toBeInTheDocument();
    expect(screen.getByText(/正文整理出的词汇词组/)).toBeInTheDocument();
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
    expect(pushMock).not.toHaveBeenCalled();
    vi.useRealTimers();
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
    expect(screen.getByRole("tab", { name: "时态" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "句型" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("选择语法点 Present Perfect"));
    fireEvent.click(screen.getByRole("tab", { name: "句型" }));
    fireEvent.click(screen.getByLabelText("选择语法点 Wh- Questions"));
    fireEvent.click(screen.getByRole("tab", { name: "情态动词" }));
    fireEvent.click(screen.getByLabelText("选择语法点 Modal Verbs"));
    fireEvent.click(screen.getByRole("button", { name: "应用选择" }));

    expect(screen.getByText("建议一章不超过 3 个知识点。")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /第 2 章/ }));
    fireEvent.click(screen.getByRole("button", { name: /第 1 章/ }));
    fireEvent.click(screen.getByRole("button", { name: "同步正文设置到全部章节" }));

    fireEvent.click(screen.getByRole("button", { name: /第 2 章/ }));
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
    fireEvent.click(screen.getByLabelText("选择语法点 Present Perfect"));
    fireEvent.click(screen.getByRole("button", { name: "应用选择" }));

    expect(screen.getByText("手动添加")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重置为 AI 推荐" }));
    expect(screen.queryByText("Present Perfect")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重置为 AI 推荐" })).not.toBeInTheDocument();
  });

  test("uses the union of current chapter knowledge points for after-class practice", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));

    expect(screen.getByText("已默认选中各章节使用的知识点；取消勾选即可排除不需要考查的内容。")).toBeInTheDocument();
    expect(screen.getByLabelText("一般过去时 · Past Simple")).toBeChecked();
    expect(screen.getByLabelText("特殊疑问句 · Wh- Questions")).toBeChecked();
    fireEvent.click(screen.getByLabelText("一般过去时 · Past Simple"));
    expect(screen.getByLabelText("一般过去时 · Past Simple")).not.toBeChecked();
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
});
