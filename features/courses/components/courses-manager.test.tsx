import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CoursesManager } from "@/features/courses/components/courses-manager";

describe("CoursesManager", () => {
  test("shows a stable business error when the list response has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    render(<CoursesManager />);

    expect(await screen.findByRole("alert")).toHaveTextContent("课程列表加载失败");
    expect(screen.queryByText(/Unexpected end of JSON input/)).not.toBeInTheDocument();
  });

  test("confirms and removes an archived course from the list", async () => {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ courses: [{ id: "course-1", title: "海底图书馆", durationMinutes: 45, englishLevel: "B1", storyTitle: "会发光的借书证", lessonDraftExists: true, lifecycleStatus: "draft", currentStage: "story_outline", teacherName: "Ms. Lin", studentNames: ["Summer"], nextEditPath: "/courses/course-1/create/story-outline", updatedAt: "2026-08-07T00:00:00.000Z" }], page: 1, pageSize: 5, total: 6, totalPages: 2 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CoursesManager />);

    expect(screen.queryByText("课程工作台")).not.toBeInTheDocument();
    expect(screen.getByTestId("courses-list")).toBeInTheDocument();
    expect(await screen.findByText("海底图书馆")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/courses?page=1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索课程" }), { target: { value: "借书证" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/courses?page=1&query=%E5%80%9F%E4%B9%A6%E8%AF%81", expect.objectContaining({ signal: expect.any(AbortSignal) })));
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/courses?page=2&query=%E5%80%9F%E4%B9%A6%E8%AF%81", expect.objectContaining({ signal: expect.any(AbortSignal) })));
    expect(screen.getByTitle("会发光的借书证")).toHaveTextContent("故事 · 会发光的借书证");
    expect(screen.getByText("B1 · 45 分钟")).toBeInTheDocument();
    expect(screen.getByTitle("Ms. Lin")).toHaveTextContent("老师 · Ms. Lin");
    expect(screen.getByTitle("Summer")).toHaveTextContent("学生 · Summer");
    expect(screen.getByRole("link", { name: "编辑" })).toHaveAttribute("href", "/courses/course-1/create/story-outline");
    expect(screen.getByRole("link", { name: "预览" })).toHaveAttribute("href", "/courses/course-1/create/preview");
    fireEvent.click(screen.getByRole("button", { name: "删除课程 海底图书馆" }));
    expect(screen.getByText(/课程内容和已生成图片会保留/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除课程" }));

    await waitFor(() => expect(screen.queryByText("海底图书馆")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1", { method: "DELETE" });
  });

  test("opens teaching in a new page while published editing stays in the current page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      courses: [{
        id: "course-1",
        title: "海底图书馆",
        durationMinutes: 45,
        englishLevel: "B1",
        storyTitle: "会发光的借书证",
        lessonDraftExists: true,
        lifecycleStatus: "published",
        currentStage: "preview",
        teacherName: "Ms. Lin",
        studentNames: ["Summer"],
        nextEditPath: "/courses/course-1/create/preview",
        updatedAt: "2026-08-07T00:00:00.000Z",
      }],
      page: 1,
      pageSize: 5,
      total: 1,
      totalPages: 1,
    })));

    render(<CoursesManager />);

    expect(await screen.findByText("海底图书馆")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "编辑" })).toHaveAttribute("href", "/courses/course-1/create/preview");
    expect(screen.getByRole("link", { name: "编辑" })).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "授课" })).toHaveAttribute("href", "/courses/course-1");
    expect(screen.getByRole("link", { name: "授课" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "授课" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});
