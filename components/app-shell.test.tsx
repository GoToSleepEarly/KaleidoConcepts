import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/components/app-shell";

const { clearAuthSession, pathnameMock, replace } = vi.hoisted(() => ({
  clearAuthSession: vi.fn(),
  pathnameMock: vi.fn(() => "/courses"),
  replace: vi.fn(),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/auth-session", () => ({
  clearAuthSession,
  getStoredSession: () => ({
    user: { id: "user-1", displayName: "教师账号", aiGateway: "quickrouter" },
  }),
}));

describe("AppShell account menu", () => {
  beforeEach(() => {
    replace.mockClear();
    pathnameMock.mockReturnValue("/courses");
    clearAuthSession.mockClear();
    vi.unstubAllGlobals();
  });

  test("provides a touch-safe navigation drawer below desktop width", () => {
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    const menuButton = screen.getByRole("button", { name: "打开主导航" });
    expect(menuButton).toHaveClass("lg:hidden", "min-h-11", "min-w-11");
    expect(screen.getByTestId("app-shell-route-heading")).toHaveClass("flex-1", "sm:shrink-0");
    expect(screen.getByTestId("account-menu-anchor")).toHaveClass("w-11", "sm:w-40");

    fireEvent.click(menuButton);

    const mobileNavigation = screen.getByRole("navigation", {
      name: "移动端主导航",
    });
    expect(mobileNavigation).toHaveClass("lg:hidden");
    expect(within(mobileNavigation).getByRole("link", { name: /课程列表/ })).toHaveAttribute("href", "/courses");
    expect(within(mobileNavigation).getByRole("button", { name: "关闭主导航" })).toHaveClass("min-h-11", "min-w-11");
  });

  test("gives Step 2 through Step 4 bounded viewports while keeping ordinary pages naturally scrollable", () => {
    pathnameMock.mockReturnValue("/courses/course-1/create/story-outline");
    const view = render(
      <AppShell>
        <div>故事大纲内容</div>
      </AppShell>,
    );

    expect(screen.getByTestId("app-shell-root")).toHaveClass("h-dvh", "overflow-hidden");
    expect(screen.getByRole("main")).toHaveClass("min-h-0", "overflow-hidden");

    view.unmount();
    pathnameMock.mockReturnValue("/courses/course-1/create/teaching-plan");
    const teachingPlanView = render(
      <AppShell>
        <div>教学规划内容</div>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-root")).toHaveClass("h-dvh", "overflow-hidden");
    expect(screen.getByRole("main")).toHaveClass("min-h-0", "overflow-hidden");

    teachingPlanView.unmount();
    pathnameMock.mockReturnValue("/courses/course-1/create/content");
    const contentView = render(
      <AppShell>
        <div>文案与练习内容</div>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-root")).toHaveClass("h-dvh", "overflow-hidden");
    expect(screen.getByRole("main")).toHaveClass("min-h-0", "overflow-hidden");

    contentView.unmount();
    pathnameMock.mockReturnValue("/courses");
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-root")).not.toHaveClass("h-dvh", "overflow-hidden");
  });

  test("keeps the course step portal visible on phones without pushing the account menu off screen", () => {
    pathnameMock.mockReturnValue("/courses/course-1/create/content");

    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    const progressSlot = document.getElementById("course-create-progress-slot");
    expect(progressSlot).toHaveClass("order-last", "w-full", "sm:order-none", "sm:flex-1");
    expect(progressSlot).not.toHaveClass("hidden");
    expect(screen.getByTestId("app-shell-route-heading")).toHaveClass("flex-1", "sm:flex-none");
    expect(screen.getByTestId("account-menu-anchor")).toHaveClass("w-11", "shrink-0");
  });

  test("aligns the menu to its trigger and closes on Escape or outside click", () => {
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

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
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        writingProvider: init?.method === "PATCH" ? "deepseek-chat" : "gpt-5.6-sol",
        aiGateway: init?.method === "PATCH" ? "crazyrouter" : "quickrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2",
        imageGateway: "quickrouter",
        imageQuickRouterEndpoint: "main",
      }),
    );
    vi.stubGlobal("fetch", request);
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/account/ai-gateway",
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
        }),
      ),
    );
    fireEvent.click(screen.getByRole("radio", { name: /DeepSeek/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "GPT 与联网研究线路" })).getByRole("radio", { name: /Crazyrouter/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/account/ai-gateway",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            writingProvider: "deepseek-chat",
            aiGateway: "crazyrouter",
            quickRouterEndpoint: "direct",
            imageModel: "gpt-image-2",
            imageGateway: "quickrouter",
            imageQuickRouterEndpoint: "main",
          }),
        }),
      ),
    );
  });

  test("loads the current gateway from the database whenever advanced settings opens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          writingProvider: "deepseek-chat",
          aiGateway: "crazyrouter",
          quickRouterEndpoint: "main",
          imageModel: "gpt-image-2-c",
          imageGateway: "quickrouter",
          imageQuickRouterEndpoint: "direct",
        }),
      ),
    );
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: /Crazyrouter/ })).toBeChecked());
    expect(screen.getByRole("radio", { name: /DeepSeek/ })).toBeChecked();
  });

  test("does not show default choices before saved advanced settings finish loading", async () => {
    let resolveSettings!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveSettings = resolve;
          }),
      ),
    );
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在读取已保存的设置");
    expect(screen.queryByRole("radio", { name: /GPT/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /QuickRouter/ })).not.toBeInTheDocument();

    resolveSettings(
      Response.json({
        writingProvider: "deepseek-chat",
        aiGateway: "crazyrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2",
        imageGateway: "crazyrouter",
        imageQuickRouterEndpoint: "main",
      }),
    );
    await waitFor(() => expect(screen.getByRole("radio", { name: /DeepSeek/ })).toBeChecked());
    expect(within(screen.getByRole("group", { name: "GPT 与联网研究线路" })).getByRole("radio", { name: /Crazyrouter/ })).toBeChecked();
  });

  test("keeps default choices hidden and offers recovery when advanced settings fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "数据库暂时不可用" }, { status: 500 })),
    );
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("数据库暂时不可用"));
    expect(screen.queryByRole("radio", { name: /GPT/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeEnabled();
  });

  test("loads and saves the QuickRouter base URL option", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        writingProvider: "gpt-5.6-sol",
        aiGateway: "quickrouter",
        quickRouterEndpoint: init?.method === "PATCH" ? "direct" : "main",
        imageModel: "gpt-image-2",
        imageGateway: "crazyrouter",
        imageQuickRouterEndpoint: "main",
      }),
    );
    vi.stubGlobal("fetch", request);
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    const textEndpointGroup = await screen.findByRole("group", {
      name: "QuickRouter Base URL",
    });
    await waitFor(() => expect(within(textEndpointGroup).getByRole("radio", { name: /主站/ })).toBeChecked());
    fireEvent.click(within(textEndpointGroup).getByRole("radio", { name: /^直连/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/account/ai-gateway",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            writingProvider: "gpt-5.6-sol",
            aiGateway: "quickrouter",
            quickRouterEndpoint: "direct",
            imageModel: "gpt-image-2",
            imageGateway: "crazyrouter",
            imageQuickRouterEndpoint: "main",
          }),
        }),
      ),
    );
  });

  test("treats GPT Image 2-C as an explicit QuickRouter-only choice", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        writingProvider: "gpt-5.5",
        aiGateway: "easy88ai",
        quickRouterEndpoint: "main",
        imageModel: init?.method === "PATCH" ? "gpt-image-2-c" : "gpt-image-2",
        imageGateway: "quickrouter",
        imageQuickRouterEndpoint: "direct",
      }),
    );
    vi.stubGlobal("fetch", request);
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    const imageGroup = await screen.findByRole("group", {
      name: "图片生成与编辑",
    });
    fireEvent.click(within(imageGroup).getByRole("radio", { name: /GPT Image 2-C/ }));
    expect(within(imageGroup).queryByRole("radio", { name: /Crazyrouter/ })).not.toBeInTheDocument();
    expect(within(imageGroup).queryByRole("radio", { name: /Easy88AI/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/account/ai-gateway",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            writingProvider: "gpt-5.5",
            aiGateway: "easy88ai",
            quickRouterEndpoint: "main",
            imageModel: "gpt-image-2-c",
            imageGateway: "quickrouter",
            imageQuickRouterEndpoint: "direct",
          }),
        }),
      ),
    );
  });

  test("clears both the server cookie and browser session on logout", async () => {
    const request = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", request);
    render(
      <AppShell>
        <div>课程内容</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
      }),
    );
    expect(clearAuthSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
