import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LoginForm } from "./login-form";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset();
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => vi.unstubAllGlobals());

  test("keeps visible labels and adds consistent leading field icons", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("账号")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByTestId("username-icon")).toBeInTheDocument();
    expect(screen.getByTestId("password-icon")).toBeInTheDocument();
  });

  test("confirms the cookie round trip before entering the product", async () => {
    const session = { user: { id: "user-1", displayName: "教师账号" }, createdAt: new Date().toISOString() };
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: "AUTH_SESSION_MISSING" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(session));
    vi.stubGlobal("fetch", request);
    render(<LoginForm />);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      body: JSON.stringify({ username: "teacher", password: "123456", remember: true }),
    })));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ cache: "no-store" })));
    expect(replace).toHaveBeenCalledWith("/courses");
  });

  test("does not report success when an HTTP browser rejects the cookie", async () => {
    const request = vi.fn(async (url: string) => url === "/api/auth/login"
      ? Response.json({ user: { id: "user-1", displayName: "教师账号" } })
      : Response.json({ code: "AUTH_SESSION_MISSING" }, { status: 401 }));
    vi.stubGlobal("fetch", request);
    render(<LoginForm />);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("浏览器未建立登录会话");
    expect(replace).not.toHaveBeenCalledWith("/courses");
  });

  test("shows the planned one-time migration notice", () => {
    window.history.replaceState({}, "", "/login?reason=session-upgrade");
    render(<LoginForm />);
    expect(screen.getByText("登录安全已升级，请重新登录一次，课程数据不会受到影响。")).toBeInTheDocument();
  });

  test("explains an expired session instead of silently returning to login", () => {
    window.history.replaceState({}, "", "/login?reason=session-expired");
    render(<LoginForm />);
    expect(screen.getByText("登录状态已失效，请重新登录后继续。")).toBeInTheDocument();
  });
});
