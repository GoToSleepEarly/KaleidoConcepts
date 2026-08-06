import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CourseAudienceForm } from "./course-audience-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/people/components/person-form-drawer", () => ({
  PersonEditorDialog: () => null,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CourseAudienceForm basic information UI", () => {
  test("presents Step1 as basic information without internal explanations", () => {
    render(<CourseAudienceForm />);

    expect(screen.getByRole("heading", { name: "基础信息" })).toBeInTheDocument();
    expect(screen.getByLabelText("课程创建进度")).toBeInTheDocument();
    expect(screen.getByTestId("course-stepper-flow-band")).toBeInTheDocument();
    expect(screen.getByLabelText("课程名称")).toBeInTheDocument();
    expect(screen.getByTestId("course-title-icon")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "老师" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "学生" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加老师" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加学生" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 分钟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 分钟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "60 分钟" })).toBeInTheDocument();
    expect(screen.getByText("还需：填写课程名称")).toBeInTheDocument();

    expect(screen.queryByText("阶段一 · 授课对象")).not.toBeInTheDocument();
    expect(screen.queryByText("填写课程名称，选择老师、学生和时长。")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "老师与学生" })).not.toBeInTheDocument();
    expect(screen.queryByText("这里只保存课程硬约束，不需要思考故事、知识点或题型。")).not.toBeInTheDocument();
    expect(screen.queryByText("仅用于课程管理，后续故事标题不会覆盖它。")).not.toBeInTheDocument();
    expect(screen.queryByText("一门课程只能选择一位老师。")).not.toBeInTheDocument();
    expect(screen.queryByText("至少选择一位学生，可以继续添加多人。")).not.toBeInTheDocument();
    expect(screen.queryByText("时长会影响后续章节数和内容密度。")).not.toBeInTheDocument();
  });

  test("does not show a separate teacher replace action after a teacher is selected", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/courses/course-1/audience")) {
        return Response.json({
          audience: {
            id: "course-1",
            title: "海底图书馆",
            durationMinutes: 45,
            lifecycleStatus: "draft",
            currentStage: "story_outline",
            people: [
              {
                personId: "teacher-1",
                role: "teacher",
                chineseName: "林老师",
                englishName: "Ms. Lin",
                age: 32,
                gender: "female",
                visualAssetId: null,
                visualUrl: null,
                profileChanged: false,
              },
              {
                personId: "student-1",
                role: "student",
                chineseName: "夏天",
                englishName: "Summer",
                age: 9,
                gender: "female",
                visualAssetId: null,
                visualUrl: null,
                profileChanged: false,
              },
            ],
          },
        });
      }

      return Response.json({ people: [], nextCursor: null });
    });

    render(<CourseAudienceForm courseId="course-1" />);

    expect(await screen.findByText("林老师")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更换" })).not.toBeInTheDocument();
  });
});
