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
      { id: "grammar-1", label: "Past Simple", category: "时态" },
      { id: "grammar-2", label: "Wh- Questions", category: "句型" },
      { id: "grammar-3", label: "Present Perfect", category: "时态" },
      { id: "grammar-4", label: "Modal Verbs", category: "情态动词" },
    ],
    plan: {
      courseId: "course-1",
      status: "draft",
      englishLevel: "B1",
      chapters: [
        {
          outlineChapterId: "chapter-1",
          targetWordCount: 180,
          knowledgePointIds: ["grammar-1"],
          readingExerciseMode: "none",
          embeddedExercises: { enabled: false, countsByType: { choice: 0, blank: 0, vocab: 0 } },
          chapterPractice: { enabled: true, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } },
          touched: { targetWordCount: false, readingExerciseMode: false, embeddedExercises: false, chapterPractice: false },
        },
        {
          outlineChapterId: "chapter-2",
          targetWordCount: 180,
          knowledgePointIds: ["grammar-2"],
          readingExerciseMode: "none",
          embeddedExercises: { enabled: false, countsByType: { choice: 0, blank: 0, vocab: 0 } },
          chapterPractice: { enabled: true, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } },
          touched: { targetWordCount: false, readingExerciseMode: false, embeddedExercises: false, chapterPractice: false },
        },
      ],
      afterClassPractice: {
        enabled: false,
        knowledgePointIds: ["grammar-1", "grammar-2"],
        practice: { enabled: false, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } },
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
  });

  test("opens with Step 1 difficulty and system recommendations already applied", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.queryByRole("tab", { name: /难度/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("B1").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveValue(180);
    expect(screen.getByLabelText("第 1 章章节练习选择题数量")).toHaveValue(5);
    expect(screen.getByText(/AI 推荐：适合用过去时/)).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 章目标词数")).toHaveAttribute("max", "200");
    expect(screen.queryByText(/当前难度推荐/)).not.toBeInTheDocument();
    expect(screen.queryByText("部分配置保留了你的修改。")).not.toBeInTheDocument();
  });

  test("adds embedded exercise types without offering matching", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    fireEvent.click(screen.getByRole("button", { name: "加入内嵌题" }));

    expect(screen.queryByLabelText("第 1 章内嵌题选择题数量")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加内嵌题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选项填空" }));

    expect(screen.getByLabelText("第 1 章内嵌题选择题数量")).toHaveValue(5);
    expect(screen.queryByLabelText("第 1 章内嵌题匹配题数量")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加中英配对" })).not.toBeInTheDocument();
    expect(screen.getAllByText("举例：Summer ______ the glowing map. (found / lost / painted)").length).toBeGreaterThan(0);
  });

  test("uses story title, inline global settings, and accurate exercise type hints", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.getByRole("heading", { name: "海底图书馆" })).toBeInTheDocument();
    expect(screen.getByText("45 分钟")).toBeInTheDocument();
    expect(screen.queryByText("选择全课英语难度")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "课后练习" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /章节/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /课后/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "加入内嵌题" }));
    fireEvent.click(screen.getByRole("button", { name: "添加内嵌题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选项填空" }));
    fireEvent.click(screen.getByRole("button", { name: "添加内嵌题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加给词变形" }));
    fireEvent.click(screen.getByRole("button", { name: "添加内嵌题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加中文提示写词" }));

    expect(screen.getAllByText("选择题").length).toBeGreaterThan(0);
    expect(screen.getAllByText("填空题").length).toBeGreaterThan(0);
    expect(screen.getAllByText("词汇题").length).toBeGreaterThan(0);
    expect(screen.queryByText("选项填空")).not.toBeInTheDocument();
    expect(screen.getAllByText("举例：Summer ______ the glowing map. (found / lost / painted)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：Summer ______ the glowing map. (find)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("举例：The map showed a secret ______.（路线，5个字母）").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    expect(screen.getByText("课后练习")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成课后练习" }));
    fireEvent.click(screen.getByRole("button", { name: "添加课后练习题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加中英配对" }));
    expect(screen.getAllByText("举例：route - 路线 / gate - 大门 / whisper - 低语").length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByLabelText("删除知识点 Modal Verbs"));
    expect(screen.queryByText("建议一章不超过 3 个知识点。")).not.toBeInTheDocument();
  });

  test("does not render chapter preview", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    expect(screen.queryByText("当前章预览")).not.toBeInTheDocument();
    expect(screen.queryByText("阅读页")).not.toBeInTheDocument();
    expect(screen.queryByText(/章节练习页/)).not.toBeInTheDocument();
  });

  test("warns when chapter practice uses more than two exercise types", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "添加章节练习题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加中文提示写词" }));
    fireEvent.click(screen.getByLabelText("第 1 章章节练习词汇题增加"));

    expect(screen.getByText("建议章节练习不超过 2 种题型。")).toBeInTheDocument();
  });

  test("applies current chapter settings to all chapters without overwriting knowledge points", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("button", { name: "加入内嵌题" }));
    fireEvent.click(screen.getByRole("button", { name: "添加内嵌题型" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选项填空" }));
    fireEvent.click(screen.getByLabelText("第 1 章内嵌题选择题增加"));

    fireEvent.click(screen.getByRole("button", { name: /第 2 章/ }));
    fireEvent.click(screen.getByRole("button", { name: /第 1 章/ }));
    fireEvent.click(screen.getByRole("button", { name: "同步正文设置到全部章节" }));

    fireEvent.click(screen.getByRole("button", { name: /第 2 章/ }));
    expect(screen.getByText("Wh- Questions")).toBeInTheDocument();
    expect(screen.queryByText("Past Simple")).not.toBeInTheDocument();
    expect(screen.getByLabelText("第 2 章目标词数")).toHaveValue(180);
    expect(screen.getByLabelText("第 2 章内嵌题选择题数量")).toHaveValue(6);
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
    expect(screen.getByLabelText("Past Simple")).toBeChecked();
    expect(screen.getByLabelText("Wh- Questions")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Past Simple"));
    expect(screen.getByLabelText("Past Simple")).not.toBeChecked();
  });

  test("explains pure reading mode and requires an explicit after-class decision", () => {
    render(<CourseTeachingPlanWorkspace initialState={state()} />);

    fireEvent.click(screen.getByRole("tab", { name: /章节/ }));
    expect(screen.getByText("将展示完整正文，不在阅读中插入题目。")).toBeInTheDocument();
    expect(screen.queryByText("题型提示")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步正文设置到全部章节" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步章节练习到全部章节" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /课后/ }));
    expect(screen.getByText("请选择是否生成课后练习")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成课后练习" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不生成课后练习" })).toBeInTheDocument();
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
