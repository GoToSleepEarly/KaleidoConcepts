import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AiOperationStatusCard, CourseAiWorkspaceFrame } from "./course-ai-workspace";

const presentation = {
  title: "正在生成故事大纲",
  currentStep: 1,
  steps: ["整理故事方向", "搭建故事主线", "检查章节推进"],
};

describe("course AI workspace primitives", () => {
  test("keeps the footer in the same bounded grid instead of making it sticky", () => {
    render(<CourseAiWorkspaceFrame active footer={<footer data-testid="footer">下一步</footer>}><main>工作区</main></CourseAiWorkspaceFrame>);

    expect(screen.getByTestId("course-ai-workspace-frame")).toHaveClass("lg:h-full", "lg:grid-rows-[minmax(0,1fr)_auto]");
    expect(screen.getByTestId("course-ai-workspace-frame")).toContainElement(screen.getByTestId("footer"));
    expect(screen.getByTestId("footer")).not.toHaveClass("sticky", "fixed");
  });

  test("shows real stages without a fake percentage and changes long-wait guidance", () => {
    const { rerender } = render(<AiOperationStatusCard elapsedSeconds={12} persisted presentation={presentation} />);

    expect(screen.getByText("正在生成故事大纲")).toBeInTheDocument();
    expect(screen.getByText("12 秒")).toHaveClass("tabular-nums");
    expect(screen.getAllByText("搭建故事主线").length).toBeGreaterThan(0);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    rerender(<AiOperationStatusCard elapsedSeconds={45} persisted presentation={presentation} />);
    expect(screen.getByText(/无需刷新或重复提交/)).toBeInTheDocument();

    rerender(<AiOperationStatusCard elapsedSeconds={95} persisted presentation={presentation} />);
    expect(screen.getByText(/可以稍后返回查看，结果会自动保存/)).toBeInTheDocument();
  });

  test("does not claim persistence before the server task is visible", () => {
    render(<AiOperationStatusCard elapsedSeconds={1} persisted={false} presentation={presentation} />);
    expect(screen.getByText("正在提交任务，请保持当前页面打开。")).toBeInTheDocument();
  });
});
