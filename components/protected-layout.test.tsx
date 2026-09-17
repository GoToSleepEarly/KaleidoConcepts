import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ProtectedLayout } from "./protected-layout";

const { readServerAuthSession, replace } = vi.hoisted(() => ({
  readServerAuthSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return { ...actual, readServerAuthSession };
});
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, session }: { children: React.ReactNode; session: { user: { displayName: string } } }) => (
    <div data-testid="app-shell">{session.user.displayName}{children}</div>
  ),
}));

describe("ProtectedLayout", () => {
  beforeEach(() => {
    replace.mockReset();
    readServerAuthSession.mockReset();
  });

  test("renders protected content only after the server cookie session is valid", async () => {
    readServerAuthSession.mockResolvedValue({
      status: "authenticated",
      session: { user: { id: "user-1", displayName: "教师账号" }, createdAt: "2026-09-16T00:00:00.000Z" },
    });
    render(<ProtectedLayout><div>课程内容</div></ProtectedLayout>);

    expect(screen.getByText("正在检查登录状态...")).toBeInTheDocument();
    expect(await screen.findByText("课程内容")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveTextContent("教师账号");
  });

  test("redirects a legacy cookie with the explicit one-time upgrade reason", async () => {
    readServerAuthSession.mockResolvedValue({ status: "unauthenticated", reason: "session-upgrade" });
    render(<ProtectedLayout><div>课程内容</div></ProtectedLayout>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?reason=session-upgrade"));
    expect(screen.queryByText("课程内容")).not.toBeInTheDocument();
  });

  test("redirects when any protected request announces a 401", async () => {
    readServerAuthSession.mockResolvedValue({
      status: "authenticated",
      session: { user: { id: "user-1", displayName: "教师账号" }, createdAt: "2026-09-16T00:00:00.000Z" },
    });
    render(<ProtectedLayout><div>课程内容</div></ProtectedLayout>);
    await screen.findByText("课程内容");

    act(() => window.dispatchEvent(new Event("kaleido.auth.invalid")));
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
  });
});
