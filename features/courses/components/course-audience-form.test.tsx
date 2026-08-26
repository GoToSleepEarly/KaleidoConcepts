import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CourseAudienceForm } from "./course-audience-form";

const grammarCatalog = {
  books: [
    { id: "essential-grammar-in-use-4", title: "Essential Grammar in Use", edition: "4th Edition", officialLevel: "A1–B1", sections: [{ id: "essential-present", officialTitle: "Present", points: [{ id: "essential-present-simple", title: "Present simple", unitStart: 5, unitEnd: 6, units: [{ unitNumber: 5, officialTitle: "I do/work/like etc." }, { unitNumber: 6, officialTitle: "I don't ..." }] }] }] },
    { id: "english-grammar-in-use-5", title: "English Grammar in Use", edition: "5th Edition", officialLevel: "B1–B2", sections: [{ id: "english-present", officialTitle: "Present and past", points: [{ id: "grammar-1", title: "Past simple", unitStart: 5, unitEnd: 5, units: [{ unitNumber: 5, officialTitle: "Past simple" }] }, { id: "grammar-2", title: "Present perfect and past", unitStart: 13, unitEnd: 14, units: [{ unitNumber: 13, officialTitle: "Present perfect and past 1" }, { unitNumber: 14, officialTitle: "Present perfect and past 2" }] }] }] },
    { id: "advanced-grammar-in-use-4", title: "Advanced Grammar in Use", edition: "4th Edition", officialLevel: "C1–C2", sections: [] },
  ],
};

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

  test("lands on the level-matched book and selects merged official knowledge points", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(grammarCatalog)));
    render(<CourseAudienceForm />);

    fireEvent.click(screen.getByRole("button", { name: "B1" }));
    fireEvent.click(screen.getByRole("button", { name: "选择知识点" }));
    expect(await screen.findByRole("tab", { name: /English Grammar in Use/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /Units 13–14.*Present perfect and past/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));
    expect(screen.getByText("Present perfect and past")).toBeInTheDocument();
    expect(screen.getByText("Units 13–14")).toBeInTheDocument();
    expect(screen.getByText(/5th Edition.*B1–B2/)).toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: "课程时长" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /分钟/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Starter" })).toBeInTheDocument();
    expect(screen.getByText("参考 Pre-A1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("选择等级后查看对应的语言能力描述")).not.toBeInTheDocument();
    expect(screen.getByText("综合能力")).toBeInTheDocument();
    expect(screen.getByText("语法表现")).toBeInTheDocument();
    expect(screen.getByText(/能理解个人信息、购物、居住地等日常表达/)).toBeInTheDocument();
    expect(screen.getByText(/仍会反复出现时态、主谓一致等错误/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "CEFR 官方标准" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "B1" }));
    expect(screen.getAllByText("独立使用者")).toHaveLength(3);
    expect(screen.getByText(/能理解工作、学习、旅行等熟悉话题的主要内容/)).toBeInTheDocument();
    expect(screen.getByText(/复杂表达中仍会犯错，但意思通常清楚/)).toBeInTheDocument();
    expect(screen.getAllByText("*")).toHaveLength(5);
    expect(screen.getAllByTestId("audience-section-header")).toHaveLength(5);
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
            englishLevel: "B1",
            grammarBookEditionId: "english-grammar-in-use-5",
            knowledgePointIds: ["grammar-1"],
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

  test("shows every Step1 field for legacy courses while keeping the page read-only", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/grammar/catalog") return Response.json(grammarCatalog);
      if (url.includes("/api/courses/legacy-course/audience")) return Response.json({
        audience: {
          id: "legacy-course",
          title: "旧版海底课程",
          durationMinutes: 45,
          englishLevel: "A2",
          grammarBookEditionId: null,
          knowledgePointIds: ["legacy-grammar-1"],
          legacyKnowledgePoints: [{ id: "legacy-grammar-1", label: "Past Simple", labelZh: "一般过去时", category: "时态" }],
          lifecycleStatus: "draft",
          currentStage: "preview",
          people: [
            { personId: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Ms. Lin", age: 32, gender: "female", visualAssetId: "v1", visualUrl: "/teacher.png", profileChanged: false },
            { personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", visualAssetId: "v2", visualUrl: "/student.png", profileChanged: false },
          ],
        },
      });
      return Response.json({ people: [], page: 1, pageSize: 100, total: 0, totalPages: 1 });
    });

    render(<CourseAudienceForm courseId="legacy-course" />);

    expect(await screen.findByDisplayValue("旧版海底课程")).toHaveAttribute("readonly");
    expect(screen.getByText("林老师")).toBeInTheDocument();
    expect(screen.getByText("夏天")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A2" })).toBeDisabled();
    expect(screen.getByText("一般过去时 · Past Simple")).toBeInTheDocument();
    expect(screen.getByText("时态")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择知识点" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /编辑|移除/ })).not.toBeInTheDocument();
    expect(screen.getByText("旧课程基础信息仅供查看，不能修改")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回课程详情" })).toHaveAttribute("href", "/courses/legacy-course");
  });

  test("uses the app dialog and lets the teacher preserve downstream results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/grammar/catalog") return Response.json(grammarCatalog);
      if (url === "/api/courses/course-1/audience" && !init?.method) return Response.json({ audience: { id: "course-1", title: "海底图书馆", durationMinutes: 45, englishLevel: "B1", grammarBookEditionId: "english-grammar-in-use-5", knowledgePointIds: ["grammar-1"], lifecycleStatus: "draft", currentStage: "preview", people: [
        { personId: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Linda", age: 32, gender: "female", visualAssetId: "v1", visualUrl: "/teacher.png", profileChanged: false },
        { personId: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", visualAssetId: "v2", visualUrl: "/student.png", profileChanged: false },
      ] } });
      if (url.includes("/api/people?role=teacher")) return Response.json({ people: [{ id: "teacher-1", role: "teacher", chineseName: "林老师", englishName: "Linda", age: 32, gender: "female", activeVisual: { id: "v1", publicUrl: "/teacher.png", sourceMode: "description", createdAt: "" }, visualStatus: "ready", createdAt: "", updatedAt: "" }] });
      if (url.includes("/api/people?role=student")) return Response.json({ people: [{ id: "student-1", role: "student", chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", activeVisual: { id: "v2", publicUrl: "/student.png", sourceMode: "description", createdAt: "" }, visualStatus: "ready", createdAt: "", updatedAt: "" }] });
      if (url === "/api/courses/course-1/audience" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        return body.preserveDownstream
          ? Response.json({ course: { id: "course-1" } })
          : Response.json({ message: "需要确认", requiresReset: true, affectedResources: ["故事大纲", "教学规划"] }, { status: 409 });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseAudienceForm courseId="course-1" />);

    await screen.findByText("林老师");
    fireEvent.click(screen.getByRole("button", { name: "A2" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：故事大纲" }));

    const dialog = await screen.findByRole("dialog", { name: "后续内容需要更新" });
    expect(within(dialog).getByText("故事大纲")).toBeInTheDocument();
    expect(within(dialog).getByText(/系统不会自动删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存修改并继续" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "后续内容需要更新" })).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/courses/course-1/audience" && (call[1] as RequestInit | undefined)?.method === "PUT")).toHaveLength(2);
  });
});
