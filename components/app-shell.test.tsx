import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/components/app-shell";

const { clearAuthSession, replace } = vi.hoisted(() => ({
  clearAuthSession: vi.fn(),
  replace: vi.fn(),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses",
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/auth-session", () => ({
  clearAuthSession,
  getStoredSession: () => ({ user: { id: "user-1", displayName: "教师账号", aiGateway: "quickrouter" } }),
}));

describe("AppShell account menu", () => {
  beforeEach(() => {
    replace.mockClear();
    clearAuthSession.mockClear();
    vi.unstubAllGlobals();
  });

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
    const request = vi.fn(async (_url: string, init?: RequestInit) => Response.json({
      aiGateway: init?.method === "PATCH" ? "crazyrouter" : "quickrouter",
    }));
    vi.stubGlobal("fetch", request);
    render(<AppShell><div>课程内容</div></AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/account/ai-gateway", expect.objectContaining({
      method: "GET",
      cache: "no-store",
    })));
    fireEvent.click(screen.getByRole("radio", { name: /Crazyrouter/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/account/ai-gateway", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ aiGateway: "crazyrouter" }),
    })));
  });

  test("loads the current gateway from the database whenever advanced settings opens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ aiGateway: "crazyrouter" })));
    render(<AppShell><div>课程内容</div></AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: /Crazyrouter/ })).toBeChecked());
  });

  test("clears both the server cookie and browser session on logout", async () => {
    const request = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", request);
    render(<AppShell><div>课程内容</div></AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" }));
    expect(clearAuthSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
