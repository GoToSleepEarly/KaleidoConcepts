import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { PersonProfile } from "@/lib/contracts/api";

import { PersonEditorDialog } from "./person-form-drawer";

vi.mock("./person-visual-studio", () => ({
  PersonVisualStudio: ({ profileJustCreated }: { profileJustCreated?: boolean }) => (
    <div>{profileJustCreated ? "人物资料已保存，下一步创建人物形象" : "人物形象工作台"}</div>
  ),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const existingPerson: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  chineseName: "林老师",
  englishName: "Ms. Lin",
  age: 32,
  gender: "female",
  notes: "",
  activeVisual: {
    id: "visual-1",
    publicUrl: "/teacher.webp",
    sourceMode: "description",
    createdAt: "2026-08-20T00:00:00.000Z",
  },
  visualStatus: "ready",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

describe("PersonEditorDialog", () => {
  test("closes an existing-person editor after save and returns the complete updated profile", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const updated = { ...existingPerson, englishName: "Linda" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ person: updated })));

    render(
      <PersonEditorDialog
        onClose={onClose}
        onSaved={onSaved}
        open
        person={existingPerson}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /英文名/ }), {
      target: { value: "Linda" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("keeps a newly created person open and explains that visual creation is next", async () => {
    const onClose = vi.fn();
    const created = { ...existingPerson, id: "teacher-new", activeVisual: null, visualStatus: "missing" as const };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ person: created }, { status: 201 })));

    render(
      <PersonEditorDialog
        defaultRole="teacher"
        onClose={onClose}
        onSaved={vi.fn()}
        open
        person={null}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /中文名/ }), { target: { value: "林老师" } });
    fireEvent.change(screen.getByRole("textbox", { name: /英文名/ }), { target: { value: "Ms. Lin" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /年龄/ }), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并创建形象/ }));

    expect(await screen.findByText("人物资料已保存，下一步创建人物形象")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
