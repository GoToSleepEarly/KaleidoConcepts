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

  test("uses an extensible category layout and saves text runtime settings", async () => {
    const saved = {
      writingProvider: "gpt-5.6-sol" as const,
      aiGateway: "easy88ai" as const,
      quickRouterEndpoint: "main" as const,
      imageModel: "gpt-image-2-c" as const,
      imageGateway: "quickrouter" as const,
      imageQuickRouterEndpoint: "main" as const,
      textReasoningEffort: "medium" as const,
      textStreamingEnabled: true,
      textStreamFirstEventTimeoutSeconds: 120,
      textStreamIdleTimeoutSeconds: 180,
      textStreamMaxDurationSeconds: 1_200,
      textNonStreamTimeoutSeconds: 600,
      imageQuality: "high" as const,
    };
    const request = vi.fn(async () => Response.json(saved));
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
    const advancedSettingsDialog = screen.getByRole("dialog", { name: "高级设置" });
    expect(advancedSettingsDialog).toHaveClass("h-[min(720px,calc(100dvh-2rem))]");
    expect(advancedSettingsDialog.querySelector(".overflow-y-auto")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-settings-layout")).toHaveClass("md:grid-cols-[192px_minmax(0,1fr)]", "md:gap-0");
    const settingsNavigation = screen.getByRole("navigation", { name: "高级设置分类" });
    expect(settingsNavigation).toHaveClass("grid-cols-2", "md:block", "md:border-r", "md:bg-[#F7F5FB]", "md:pr-0");
    const textCategory = within(settingsNavigation).getByRole("button", { name: /^文本生成/ });
    expect(textCategory).toHaveClass("w-full", "md:min-h-14", "md:rounded-r-none", "md:border-r-0");
    expect(within(textCategory).getByText("文本生成")).toHaveClass("text-sm", "font-semibold");
    const textSettings = screen.getByRole("region", { name: "文本生成" });
    expect(within(textSettings).getByRole("heading", { name: "文本生成", level: 3 })).toHaveClass("text-lg", "font-semibold");
    expect(within(textSettings).getByRole("heading", { name: "模型配置", level: 4 })).toHaveClass("text-sm", "font-semibold");
    expect(within(textSettings).getByRole("heading", { name: "生成偏好", level: 4 })).toHaveClass("text-sm", "font-semibold");
    expect(within(textSettings).getByText("思考强度")).toHaveClass("text-[13px]", "font-medium");
    expect(screen.getByTestId("reasoning-options")).toHaveClass("h-11", "border", "bg-[#F1EFF6]");
    fireEvent.change(within(textSettings).getByRole("combobox", { name: "文本模型" }), { target: { value: "deepseek-v4-pro" } });
    expect(within(textSettings).getByRole("combobox", { name: "文本提供方" })).toHaveValue("deepseek");
    fireEvent.click(within(textSettings).getByRole("radio", { name: "高" }));
    expect(within(textSettings).getByRole("radio", { name: "高" })).toHaveClass("border-primary-200", "bg-white", "text-primary");
    const streamingSwitch = within(textSettings).getByRole("switch", { name: "流式返回" });
    expect(screen.getByTestId("streaming-control")).toHaveClass("h-11", "border", "bg-white");
    expect(screen.getByTestId("streaming-state")).toHaveTextContent("已开启");
    expect(screen.getByTestId("streaming-track")).toHaveClass("h-6", "w-10", "bg-primary-50");
    expect(screen.getByTestId("streaming-thumb")).toHaveClass("size-[18px]", "translate-x-4", "bg-primary");
    expect(within(textSettings).getByRole("spinbutton", { name: "首个响应事件 秒" })).toHaveValue(120);
    expect(within(textSettings).getByRole("spinbutton", { name: "事件空闲 秒" })).toHaveValue(180);
    expect(within(textSettings).getByRole("spinbutton", { name: "最长运行 分钟" })).toHaveValue(20);
    fireEvent.change(within(textSettings).getByRole("spinbutton", { name: "首个响应事件 秒" }), { target: { value: "150" } });
    fireEvent.change(within(textSettings).getByRole("spinbutton", { name: "事件空闲 秒" }), { target: { value: "240" } });
    fireEvent.change(within(textSettings).getByRole("spinbutton", { name: "最长运行 分钟" }), { target: { value: "25" } });
    fireEvent.click(streamingSwitch);
    expect(screen.getByTestId("streaming-state")).toHaveTextContent("已关闭");
    expect(screen.getByTestId("streaming-track")).toHaveClass("bg-slate-200");
    expect(screen.getByTestId("streaming-thumb")).toHaveClass("translate-x-0", "bg-white");
    fireEvent.change(within(textSettings).getByRole("spinbutton", { name: "非流式请求总时限 分钟" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/account/ai-gateway",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            writingProvider: "deepseek-v4-pro",
            aiGateway: "easy88ai",
            quickRouterEndpoint: "main",
            imageModel: "gpt-image-2-c",
            imageGateway: "quickrouter",
            imageQuickRouterEndpoint: "main",
            textReasoningEffort: "high",
            textStreamingEnabled: false,
            textStreamFirstEventTimeoutSeconds: 150,
            textStreamIdleTimeoutSeconds: 240,
            textStreamMaxDurationSeconds: 1500,
            textNonStreamTimeoutSeconds: 720,
            imageQuality: "high",
          }),
        }),
      ),
    );
  });

  test("loads saved settings and exposes compatible providers through selects", async () => {
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
          textReasoningEffort: "low",
          textStreamingEnabled: false,
          textStreamFirstEventTimeoutSeconds: 90,
          textStreamIdleTimeoutSeconds: 240,
          textStreamMaxDurationSeconds: 1_200,
          textNonStreamTimeoutSeconds: 480,
          imageQuality: "medium",
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

    await waitFor(() => expect(screen.getByRole("combobox", { name: "文本模型" })).toHaveValue("deepseek-v4-pro"));
    expect(screen.getByRole("combobox", { name: "文本提供方" })).toHaveValue("deepseek");
    expect(screen.getByRole("radio", { name: "低" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "流式返回" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("spinbutton", { name: "非流式请求总时限 分钟" })).toHaveValue(8);
    expect(screen.queryByText(/中转站/)).not.toBeInTheDocument();
    expect(screen.queryByText(/api\.deepseek\.com/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^图片生成/ }));
    expect(screen.getByRole("combobox", { name: "图片提供方" })).toHaveValue("easy88ai");
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
    expect(screen.queryByRole("combobox", { name: "文本模型" })).not.toBeInTheDocument();

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
    await waitFor(() => expect(screen.getByRole("combobox", { name: "文本模型" })).toHaveValue("deepseek-v4-pro"));
    expect(screen.getByRole("combobox", { name: "文本提供方" })).toHaveValue("deepseek");
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

  test("presents QuickRouter main and direct as peer select options", async () => {
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
    const textProvider = await screen.findByRole("combobox", { name: "文本提供方" });
    await waitFor(() => expect(textProvider).toHaveValue("quickrouter-main"));
    expect(within(textProvider).getByRole("option", { name: "QuickRouter 直连" })).toBeEnabled();
    expect(screen.queryByText(/Base URL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument();
    fireEvent.change(textProvider, { target: { value: "quickrouter-direct" } });
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
            textReasoningEffort: "medium",
            textStreamingEnabled: true,
            textStreamFirstEventTimeoutSeconds: 120,
            textStreamIdleTimeoutSeconds: 180,
            textStreamMaxDurationSeconds: 1200,
            textNonStreamTimeoutSeconds: 600,
            imageQuality: "medium",
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
    await screen.findByRole("combobox", { name: "文本模型" });
    fireEvent.click(screen.getByRole("button", { name: /^图片生成/ }));
    const imageSettings = screen.getByRole("region", { name: "图片生成" });
    expect(within(imageSettings).getByRole("heading", { name: "图片生成", level: 3 })).toHaveClass("text-lg", "font-semibold");
    expect(within(imageSettings).getByRole("heading", { name: "模型配置", level: 4 })).toHaveClass("text-sm", "font-semibold");
    expect(within(imageSettings).getByRole("heading", { name: "输出质量", level: 4 })).toHaveClass("text-sm", "font-semibold");
    expect(screen.getByTestId("image-quality-options")).toHaveClass("h-11", "border", "bg-[#F1EFF6]");
    fireEvent.change(screen.getByRole("combobox", { name: "图片模型" }), { target: { value: "gpt-image-2-c" } });
    const imageProvider = screen.getByRole("combobox", { name: "图片提供方" });
    expect(within(imageProvider).getAllByRole("option")).toHaveLength(2);
    expect(imageProvider).toHaveValue("quickrouter-direct");
    expect(within(imageProvider).queryByRole("option", { name: "Crazyrouter" })).not.toBeInTheDocument();
    expect(within(imageProvider).queryByRole("option", { name: "Easy88AI" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "极高（模型固定）" })).toHaveAttribute("aria-checked", "true");
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
            textReasoningEffort: "medium",
            textStreamingEnabled: true,
            textStreamFirstEventTimeoutSeconds: 120,
            textStreamIdleTimeoutSeconds: 180,
            textStreamMaxDurationSeconds: 1200,
            textNonStreamTimeoutSeconds: 600,
            imageQuality: "high",
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
