import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CourseStaleNotice } from "@/features/courses/components/course-stale-notice";

describe("CourseStaleNotice", () => {
  test("uses a compact presentation and can be dismissed for the current stale version", () => {
    render(<CourseStaleNotice staleFromStage="audience" stage="content" />);

    expect(screen.getByRole("status")).toHaveClass("items-center", "px-3", "py-1");
    fireEvent.click(screen.getByRole("button", { name: "关闭旧版本提示" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
