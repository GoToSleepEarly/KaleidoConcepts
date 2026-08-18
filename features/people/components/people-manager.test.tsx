import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { PersonProfile } from "@/lib/contracts/api";

import { PeopleManager } from "./people-manager";

vi.mock("./person-form-drawer", () => ({ PersonEditorDialog: () => null }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function person(id: string, name: string): PersonProfile {
  return {
    id,
    role: "student",
    chineseName: name,
    englishName: `Student ${id}`,
    age: 9,
    gender: "female",
    notes: "喜欢阅读和表达",
    activeVisual: null,
    visualStatus: "missing",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("PeopleManager", () => {
  test("renders profile cards and requests the next database page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const page = new URL(url, "http://localhost").searchParams.get("page");
      return Response.json({
        people: page === "2" ? [person("7", "小七")] : [person("1", "小一")],
        page: Number(page),
        pageSize: 6,
        total: 7,
        totalPages: 2,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PeopleManager />);
    const heading = await screen.findByRole("heading", { name: "小一" });
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement).toHaveClass("items-center", "justify-center", "text-center");
    expect(screen.getByText("9 岁").parentElement).toHaveClass("justify-center");
    expect(screen.getByRole("article")).not.toHaveTextContent("喜欢阅读和表达");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByRole("heading", { name: "小七" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("page=2&pageSize=6"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
  });

  test("archives a person from the custom delete dialog and removes the card", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ ok: true })
      : Response.json({ people: [person("1", "小一")], page: 1, pageSize: 6, total: 1, totalPages: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PeopleManager />);
    await screen.findByRole("heading", { name: "小一" });
    fireEvent.click(screen.getByRole("button", { name: "删除小一" }));
    expect(screen.getByRole("dialog", { name: "确认删除" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "小一" })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/people/1/archive", { method: "POST" });
  });

  test("always shows pagination and opens an image preview from the card", async () => {
    const withVisual = {
      ...person("1", "小一"),
      activeVisual: { id: "visual-1", publicUrl: "/people/xiaoyi.webp", sourceMode: "description" as const, createdAt: "2026-08-01T00:00:00.000Z" },
      visualStatus: "ready" as const,
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ people: [withVisual], page: 1, pageSize: 6, total: 1, totalPages: 1 })));

    render(<PeopleManager />);
    await screen.findByRole("heading", { name: "小一" });
    expect(screen.getByRole("combobox", { name: "选择页码" })).toHaveValue("1");
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "查看小一大图" }));
    expect(screen.getByRole("dialog", { name: "小一" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "小一 的人物形象" })).toHaveAttribute("src", "/people/xiaoyi.webp");
  });

  test("supports direct page selection and does not reserve space for empty notes", async () => {
    const withoutNotes = { ...person("1", "小一"), notes: undefined };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input), "http://localhost").searchParams.get("page"));
      return Response.json({ people: page === 3 ? [person("13", "小十三")] : [withoutNotes], page, pageSize: 6, total: 13, totalPages: 3 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PeopleManager />);
    await screen.findByRole("heading", { name: "小一" });
    expect(screen.queryByText("暂无备注")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "选择页码" }), { target: { value: "3" } });
    expect(await screen.findByRole("heading", { name: "小十三" })).toBeInTheDocument();
  });
});
