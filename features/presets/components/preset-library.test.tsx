import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PresetLibrary, ThemePresetLibrary } from "./preset-library";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PresetLibrary", () => {
  test("searches grammar presets by Chinese and English labels", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ presets: [
      { id: "g1", kind: "grammar", label: "Past Simple", labelZh: "一般过去时", category: "时态与体", sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: "g2", kind: "grammar", label: "Wh- Questions", labelZh: "特殊疑问句", category: "基本句型与疑问句", sortOrder: 1, createdAt: "", updatedAt: "" },
    ] })));

    render(<PresetLibrary kind="grammar" />);
    expect(await screen.findByText("一般过去时")).toBeInTheDocument();
    expect(screen.getByText("Past Simple")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索语法库" }), { target: { value: "Wh-" } });
    expect(screen.getByText("特殊疑问句")).toBeInTheDocument();
    expect(screen.queryByText("一般过去时")).not.toBeInTheDocument();
  });

  test("orders grammar category before Chinese and English names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ presets: [
      { id: "g1", kind: "grammar", label: "Past Simple", labelZh: "一般过去时", category: "时态与体", sortOrder: 0, createdAt: "", updatedAt: "" },
    ] })));

    render(<PresetLibrary kind="grammar" />);
    await screen.findByText("一般过去时");
    fireEvent.click(screen.getByRole("button", { name: "新增语法点" }));

    const dialog = screen.getByRole("dialog");
    const fields = Array.from(dialog.querySelectorAll("select, input")).map((field) => field.getAttribute("aria-label"));
    expect(fields).toEqual(["语法分类", "中文名称", "英文名称"]);
  });

  test("deletes through the app dialog and removes the card", async () => {
    const preset = { id: "g1", kind: "grammar", label: "Past Simple", labelZh: "一般过去时", category: "时态与体", sortOrder: 0, createdAt: "", updatedAt: "" };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "DELETE"
      ? Response.json({ ok: true })
      : Response.json({ presets: [preset] }));
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm");

    render(<PresetLibrary kind="grammar" />);
    await screen.findByText("一般过去时");
    fireEvent.click(screen.getByRole("button", { name: "删除一般过去时" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "确认删除" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.queryByText("一般过去时")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/presets/g1", { method: "DELETE" });
  });

  test("creates a categorized theme", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init) return Response.json({ presets: [] });
      return Response.json({ preset: { id: "t1", kind: "theme", label: "机器人", category: "科学与未来", sortOrder: 0, createdAt: "", updatedAt: "" } }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PresetLibrary kind="theme" />);
    await screen.findByText("还没有主题方向");
    fireEvent.click(screen.getAllByRole("button", { name: "新增主题方向" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "新建大类" }));
    fireEvent.change(screen.getByLabelText("主题方向名称"), { target: { value: "机器人" } });
    fireEvent.change(screen.getByLabelText("新主题大类名称"), { target: { value: "科学与未来" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/presets", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ kind: "theme", label: "机器人", category: "科学与未来" }),
    })));
  });

  test("paginates five categories and creates under an existing category", async () => {
    const presets = Array.from({ length: 6 }, (_, index) => ({ id: `t${index + 1}`, kind: "theme", label: `方向${index + 1}`, category: `类别${index + 1}`, sortOrder: 0, createdAt: "", updatedAt: "" }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init) return Response.json({ presets });
      return Response.json({ preset: presets[0] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PresetLibrary kind="theme" />);
    expect((await screen.findAllByText("类别1")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "类别6" })).not.toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByRole("heading", { name: "类别6" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增主题方向" }));
    expect(screen.getByRole("dialog")).not.toHaveClass("right-0");
    fireEvent.change(screen.getByRole("combobox", { name: "主题大类" }), { target: { value: "类别1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "主题方向名称" }), { target: { value: "方向1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/presets", expect.objectContaining({ method: "POST" })));
  });

  test("manages story types and tones inside the theme library", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init) {
        if (url.includes("story_type")) return Response.json({ presets: [{ id: "type-1", kind: "story_type", label: "冒险", category: "故事类型", sortOrder: 0, createdAt: "", updatedAt: "" }] });
        if (url.includes("story_tone")) return Response.json({ presets: [{ id: "tone-1", kind: "story_tone", label: "温暖治愈", category: "故事氛围", sortOrder: 0, createdAt: "", updatedAt: "" }] });
        return Response.json({ presets: [] });
      }
      return Response.json({ preset: { id: "type-2", kind: "story_type", label: "历史穿越", category: "故事类型", sortOrder: 1, createdAt: "", updatedAt: "" } }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ThemePresetLibrary />);
    fireEvent.click(screen.getByRole("tab", { name: "故事类型" }));
    expect(await screen.findByText("冒险")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增故事类型" }));
    fireEvent.change(screen.getByLabelText("故事类型名称"), { target: { value: "历史穿越" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/presets", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ kind: "story_type", label: "历史穿越", category: "故事类型" }),
    })));
  });
});
