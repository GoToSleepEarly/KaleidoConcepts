import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CourseCreateSteps } from "./course-create-steps";

describe("CourseCreateSteps", () => {
  test("shows compact progress without a next-step action", () => {
    render(<CourseCreateSteps currentStep={1} />);

    expect(screen.getByLabelText("课程创建进度")).toBeInTheDocument();
    expect(screen.getByTestId("course-stepper-flow-band")).toBeInTheDocument();
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
  });
});
