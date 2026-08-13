import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CourseCreateSteps } from "./course-create-steps";

describe("CourseCreateSteps", () => {
  test("mounts the progress into the course header slot without waiting for user interaction", async () => {
    const slot = document.createElement("div");
    slot.id = "course-create-progress-slot";
    document.body.appendChild(slot);
    render(<CourseCreateSteps currentStep={1} />);
    await waitFor(() => expect(slot).toContainElement(screen.getByLabelText("课程创建进度")));
    slot.remove();
  });

  test("shows compact progress without a next-step action", () => {
    render(<CourseCreateSteps currentStep={1} />);

    expect(screen.getByLabelText("课程创建进度")).toBeInTheDocument();
    expect(screen.getByTestId("course-stepper-flow-band")).toBeInTheDocument();
    expect(screen.getByTestId("course-stepper-flow-band")).not.toHaveClass("bg-gradient-to-b");
    expect(screen.getAllByText("基础信息").length).toBeGreaterThan(0);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText(/下一步/)).not.toBeInTheDocument();
  });

  test("links completed steps when a course id exists and disables locked steps", () => {
    render(<CourseCreateSteps courseId="course-1" currentStep={2} />);

    expect(screen.getByRole("link", { name: "基础信息" })).toHaveAttribute(
      "href",
      "/courses/course-1/create/audience",
    );
    const currentStep = screen.getAllByText("故事大纲").find((node) => node.closest("[aria-current='step']"));
    const lockedStep = screen.getAllByText("教学规划").find((node) => node.closest("[aria-disabled='true']"));
    expect(currentStep?.closest("[aria-current='step']")).toHaveAttribute("aria-current", "step");
    expect(lockedStep?.closest("[aria-disabled='true']")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "基础信息" })).toHaveClass("cursor-pointer");
    expect(currentStep?.closest("[aria-current='step']")).toHaveClass("bg-primary");
  });

  test("links an already reached later step after navigating back", () => {
    render(<CourseCreateSteps courseId="course-1" currentStep={4} furthestStep={5} />);

    expect(screen.getByRole("link", { name: "视觉资源" })).toHaveAttribute(
      "href",
      "/courses/course-1/create/visual-resources",
    );
    expect(screen.getAllByText("预览发布").find((node) => node.closest("[aria-disabled='true']"))?.closest("[aria-disabled='true']")).toHaveAttribute("aria-disabled", "true");
  });

  test("lets the page guard an unlocked step navigation", () => {
    const onNavigate = vi.fn();
    render(<CourseCreateSteps courseId="course-1" currentStep={2} furthestStep={4} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("link", { name: "文案与练习" }));
    expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining("/courses/course-1/create/content"));
  });
});
