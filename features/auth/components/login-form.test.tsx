import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";

import { LoginForm } from "./login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("LoginForm", () => {
  test("keeps visible labels and adds consistent leading field icons", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("账号")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByTestId("username-icon")).toBeInTheDocument();
    expect(screen.getByTestId("password-icon")).toBeInTheDocument();
  });

  test("sends the remember-me choice to the server cookie session", async () => {
    const request = vi.fn(async () => Response.json({ user: { id: "user-1", displayName: "教师账号" }, createdAt: new Date().toISOString() }));
    vi.stubGlobal("fetch", request);
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      body: JSON.stringify({ username: "teacher", password: "123456", remember: true }),
    })));
    vi.unstubAllGlobals();
  });
});
