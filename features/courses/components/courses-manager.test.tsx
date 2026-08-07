import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CoursesManager } from "@/features/courses/components/courses-manager";

describe("CoursesManager", () => {
  test("confirms and removes an archived course from the list", async () => {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ courses: [{ id: "course-1", title: "海底图书馆", durationMinutes: 45, lifecycleStatus: "draft", currentStage: "story_outline", teacherName: "林老师", studentNames: ["夏天"], nextEditPath: "/courses/course-1/create/story-outline", updatedAt: "2026-08-07T00:00:00.000Z" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CoursesManager />);

    expect(await screen.findByText("海底图书馆")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除课程 海底图书馆" }));
    expect(screen.getByText(/课程内容和已生成图片会保留/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除课程" }));

    await waitFor(() => expect(screen.queryByText("海底图书馆")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/courses/course-1", { method: "DELETE" });
  });
});
