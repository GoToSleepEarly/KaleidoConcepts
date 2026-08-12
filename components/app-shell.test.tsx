import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/components/app-shell";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses",
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/auth-session", () => ({
  clearAuthSession: vi.fn(),
  getStoredSession: () => ({ user: { displayName: "教师账号" } }),
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
});
