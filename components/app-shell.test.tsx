import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/components/app-shell";

const replace = vi.fn();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses",
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/auth-session", () => ({
  clearAuthSession: vi.fn(),
  getStoredSession: () => ({ user: { id: "user-1", displayName: "教师账号", aiGateway: "quickrouter" } }),
  updateStoredAiGateway: vi.fn(),
}));

describe("AppShell account menu", () => {
  beforeEach(() => replace.mockClear());

  test("aligns the menu to its trigger and closes on Escape or outside click", () => {
    render(<AppShell><div>课程内容</div></AppShell>);

    const trigger = screen.getByRole("button", { name: "用户菜单" });
    fireEvent.click(trigger);
    expect(screen.getByTestId("account-menu")).toHaveClass("w-full");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("account-menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("account-menu")).not.toBeInTheDocument();
  });

  test("saves the account GPT gateway from advanced settings", async () => {
    const request = vi.fn(async () => Response.json({ aiGateway: "crazyrouter" }));
    vi.stubGlobal("fetch", request);
    render(<AppShell><div>课程内容</div></AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    fireEvent.click(screen.getByRole("radio", { name: /Crazyrouter/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/account/ai-gateway", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ aiGateway: "crazyrouter" }),
    })));
  });
});
