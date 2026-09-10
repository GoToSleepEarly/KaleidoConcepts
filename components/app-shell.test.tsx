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

  test("shows models before compatible providers and saves the flattened provider choice", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        writingProvider: init?.method === "PATCH" ? "deepseek-v4-pro" : "gpt-5.6-sol",
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
    const textSettings = screen.getByRole("region", { name: "文本设置" });
    const textModelGroup = within(textSettings).getByRole("group", {
      name: "文本模型",
    });
    const textProviderGroup = within(textSettings).getByRole("group", {
      name: "文本提供方",
    });
    expect(textModelGroup.compareDocumentPosition(textProviderGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("advanced-settings-grid")).toHaveClass("grid", "md:grid-cols-2");
    expect(within(textProviderGroup).getByRole("radio", { name: "QuickRouter 主站" }).closest("label")).toHaveClass("min-h-11");
    fireEvent.click(within(textProviderGroup).getByRole("radio", { name: "Crazyrouter" }));
    fireEvent.click(within(textModelGroup).getByRole("radio", { name: "DeepSeek V4 Pro" }));
    expect(within(textProviderGroup).getAllByRole("radio")).toHaveLength(1);
    expect(within(textProviderGroup).getByRole("radio", { name: "DeepSeek" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/account/ai-gateway",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            writingProvider: "deepseek-v4-pro",
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
          writingProvider: "deepseek-v4-pro",
          aiGateway: "crazyrouter",
          quickRouterEndpoint: "main",
          imageModel: "gpt-image-2",
          imageGateway: "easy88ai",
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

    await waitFor(() => expect(within(screen.getByRole("group", { name: "文本模型" })).getByRole("radio", { name: "DeepSeek V4 Pro" })).toBeChecked());
    const textSettings = screen.getByRole("region", { name: "文本设置" });
    const textProviderGroup = within(textSettings).getByRole("group", {
      name: "文本提供方",
    });
    expect(within(textProviderGroup).getAllByRole("radio")).toHaveLength(1);
    expect(within(textProviderGroup).getByRole("radio", { name: "DeepSeek" })).toBeChecked();
    expect(screen.queryByText(/联网/)).not.toBeInTheDocument();
    expect(screen.queryByText(/中转站/)).not.toBeInTheDocument();
    expect(screen.queryByText(/api\.deepseek\.com/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "图片提供方" })).getByRole("radio", { name: "Easy88AI" })).toBeChecked();
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
        writingProvider: "deepseek-v4-pro",
        aiGateway: "crazyrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2",
        imageGateway: "crazyrouter",
        imageQuickRouterEndpoint: "main",
      }),
    );
    await waitFor(() => expect(within(screen.getByRole("group", { name: "文本模型" })).getByRole("radio", { name: "DeepSeek V4 Pro" })).toBeChecked());
    expect(within(screen.getByRole("group", { name: "文本提供方" })).getByRole("radio", { name: "DeepSeek" })).toBeChecked();
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

  test("presents QuickRouter main and direct as two peer providers", async () => {
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
    const textProviderGroup = await screen.findByRole("group", {
      name: "文本提供方",
    });
    await waitFor(() =>
      expect(
        within(textProviderGroup).getByRole("radio", {
          name: "QuickRouter 主站",
        }),
      ).toBeChecked(),
    );
    expect(
      within(textProviderGroup).getByRole("radio", {
        name: "QuickRouter 直连",
      }),
    ).toBeEnabled();
    expect(screen.queryByText(/Base URL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument();
    fireEvent.click(
      within(textProviderGroup).getByRole("radio", {
        name: "QuickRouter 直连",
      }),
    );
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
    const imageModelGroup = await screen.findByRole("group", {
      name: "图片模型",
    });
    fireEvent.click(within(imageModelGroup).getByRole("radio", { name: "GPT Image 2-C" }));
    const imageProviderGroup = screen.getByRole("group", {
      name: "图片提供方",
    });
    expect(within(imageProviderGroup).getAllByRole("radio")).toHaveLength(2);
    expect(
      within(imageProviderGroup).getByRole("radio", {
        name: "QuickRouter 主站",
      }),
    ).toBeInTheDocument();
    expect(
      within(imageProviderGroup).getByRole("radio", {
        name: "QuickRouter 直连",
      }),
    ).toBeChecked();
    expect(within(imageProviderGroup).queryByRole("radio", { name: "Crazyrouter" })).not.toBeInTheDocument();
    expect(within(imageProviderGroup).queryByRole("radio", { name: "Easy88AI" })).not.toBeInTheDocument();
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
