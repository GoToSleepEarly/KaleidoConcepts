import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CourseAudienceForm } from "./course-audience-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/people/components/person-form-drawer", () => ({
  PersonEditorDialog: () => null,
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CourseAudienceForm basic information UI", () => {
  test("warns before course creation when teacher and student profiles do not exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/api/people")) return Response.json({ people: [], page: 1, pageSize: 1, total: 0, totalPages: 1 });
      return Response.json({ presets: [] });
    }));

    render(<CourseAudienceForm />);

    expect(await screen.findByText("创建课程前，请先创建老师和学生人物，并完成人物形象")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往人物档案" })).toHaveAttribute("href", "/people");
  });

  test("organizes Step1 knowledge points by grammar category", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ presets: [
      { id: "grammar-1", kind: "grammar", label: "Past Simple", labelZh: "一般过去时", category: "时态", sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: "grammar-2", kind: "grammar", label: "Wh- Questions", labelZh: "特殊疑问句", category: "句型", sortOrder: 1, createdAt: "", updatedAt: "" },
    ] })));
    render(<CourseAudienceForm />);

    fireEvent.click(screen.getByRole("button", { name: "选择知识点" }));
    expect(await screen.findByRole("tab", { name: "时态" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "句型" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "句型" }));
    expect(screen.getByRole("button", { name: /特殊疑问句.*Wh- Questions/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /一般过去时.*Past Simple/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索语法点" }), { target: { value: "过去时" } });
    expect(screen.getByRole("button", { name: /一般过去时.*Past Simple/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /特殊疑问句.*Wh- Questions/ })).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole("button", { name: "60 分钟" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Starter" })).toBeInTheDocument();
    expect(screen.getAllByText("*")).toHaveLength(6);
    expect(screen.getAllByTestId("audience-section-header")).toHaveLength(6);
    expect(screen.getAllByTestId("audience-section-header")[0]).toHaveClass("bg-[#E9EEFF]");
    expect(screen.queryByText("未选择")).not.toBeInTheDocument();
    expect(screen.getByText("还需：填写课程名称")).toBeInTheDocument();
    expect(screen.getByText("还需：填写课程名称")).toHaveClass("text-red-600");
    expect(screen.getByLabelText("故事大纲")).toHaveAttribute("aria-disabled", "true");

    expect(screen.queryByText("阶段一 · 授课对象")).not.toBeInTheDocument();
    expect(screen.queryByText("填写课程名称，选择老师、学生和时长。")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "老师与学生" })).not.toBeInTheDocument();
    expect(screen.queryByText("这里只保存课程硬约束，不需要思考故事、知识点或题型。")).not.toBeInTheDocument();
    expect(screen.queryByText("仅用于课程管理，后续故事标题不会覆盖它。")).not.toBeInTheDocument();
    expect(screen.queryByText("一门课程只能选择一位老师。")).not.toBeInTheDocument();
    expect(screen.queryByText("至少选择一位学生，可以继续添加多人。")).not.toBeInTheDocument();
    expect(screen.queryByText("时长会影响后续章节数和内容密度。")).not.toBeInTheDocument();
  });

  test("shows people as visual cards and blocks profiles without a current visual", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/api/people")) return Response.json({
        people: [
          { id: "student-ready", role: "student", chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", notes: "", visualStatus: "ready", activeVisual: { id: "visual-1", publicUrl: "/summer.png", sourceMode: "description", createdAt: "" }, createdAt: "", updatedAt: "" },
          { id: "student-missing", role: "student", chineseName: "小宇", englishName: "Leo", age: 8, gender: "male", notes: "", visualStatus: "missing", activeVisual: null, createdAt: "", updatedAt: "" },
        ], page: 1, pageSize: 100, total: 2, totalPages: 1,
      });
      return Response.json({ presets: [] });
    }));
    render(<CourseAudienceForm />);

    fireEvent.click(screen.getByRole("button", { name: "添加学生" }));
    const readyCard = await screen.findByTestId("person-picker-card-student-ready");
    expect(screen.getByTestId("person-picker-grid")).toHaveClass("items-start");
    expect(readyCard).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "选择" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /选择小宇/ })).not.toBeInTheDocument();
    expect(screen.getByText("形象未生成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建小宇的形象" })).toBeInTheDocument();
    expect(screen.getByTestId("person-picker-card-student-missing")).toHaveClass("h-36", "self-start");
    expect(screen.queryByText("未创建形象")).not.toBeInTheDocument();
    expect(screen.getByAltText("夏天的人物形象")).toHaveAttribute("src", expect.stringContaining("summer.png"));
    expect(screen.getAllByText("9 岁")[0]).toHaveClass("bg-[#E9EEFF]");
    expect(screen.getAllByText("女")[0]).toHaveClass("bg-pink-50");

    fireEvent.click(readyCard);
    expect(readyCard).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));
    expect(screen.getByTestId("selected-person-student-ready")).toHaveClass("max-w-sm");
    expect(screen.getByRole("button", { name: "编辑夏天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除夏天" })).toBeInTheDocument();
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

      return Response.json({ people: [], page: 1, pageSize: 100, total: 0, totalPages: 1 });
    });

    render(<CourseAudienceForm courseId="course-1" />);

    expect(await screen.findByText("林老师")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更换" })).not.toBeInTheDocument();
  });

  test("uses the app dialog and lets the teacher preserve downstream results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/presets?kind=grammar") return Response.json({ presets: [{ id: "grammar-1", kind: "grammar", label: "Past Simple", labelZh: "一般过去时", category: "时态", sortOrder: 0, createdAt: "", updatedAt: "" }] });
      if (url === "/api/courses/course-1/audience" && !init?.method) return Response.json({ audience: { id: "course-1", title: "海底图书馆", durationMinutes: 45, englishLevel: "B1", knowledgePointIds: ["grammar-1"], lifecycleStatus: "draft", currentStage: "preview", people: [
        { personId: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Linda", age: 32, gender: "female", visualAssetId: "v1", visualUrl: "/teacher.png", profileChanged: false },
        { personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", visualAssetId: "v2", visualUrl: "/student.png", profileChanged: false },
      ] } });
      if (url.includes("/api/people?role=teacher")) return Response.json({ people: [{ id: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Linda", age: 32, gender: "female", activeVisual: { id: "v1", publicUrl: "/teacher.png", sourceMode: "description", createdAt: "" }, visualStatus: "ready", createdAt: "", updatedAt: "" }] });
      if (url.includes("/api/people?role=student")) return Response.json({ people: [{ id: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", activeVisual: { id: "v2", publicUrl: "/student.png", sourceMode: "description", createdAt: "" }, visualStatus: "ready", createdAt: "", updatedAt: "" }] });
      if (url === "/api/courses/course-1/audience" && init?.method === "PUT") return Response.json({ message: "需要确认", requiresReset: true, affectedResources: ["故事大纲", "教学规划"] }, { status: 409 });
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseAudienceForm courseId="course-1" />);

    await screen.findByText("林老师");
    fireEvent.click(screen.getByRole("button", { name: "30 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：故事大纲" }));

    const dialogHeading = await screen.findByRole("heading", { name: "本次修改可能影响后续内容" });
    expect(within(dialogHeading.closest("dialog")!).getByText("故事大纲")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保留后续成果，暂不应用" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "本次修改可能影响后续内容" })).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/courses/course-1/audience" && (call[1] as RequestInit | undefined)?.method === "PUT")).toHaveLength(1);
  });
});
