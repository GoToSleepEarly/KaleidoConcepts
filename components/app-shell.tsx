"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, FileText, ImageIcon, ListChecks, LoaderCircle, LogOut, Menu, Settings2, Sparkles, Tags, UsersRound, X } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IMAGE_GENERATION_MODELS, IMAGE_QUALITIES, TEXT_GENERATION_MODELS, TEXT_TIMEOUT_DEFAULTS, imageModelLabels, imageQualityForSelection, imageQualityLabels, isTextTimeoutSettingsValid, reasoningEffortsForModel, textModelLabels, textReasoningEffortLabels, type AccountAiSettings, type AiGateway, type ImageGenerationModel, type ImageQuality, type QuickRouterEndpoint, type TextGenerationModel, type TextReasoningEffort } from "@/lib/ai-gateway";
import { clearAuthSession, getStoredSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/courses", label: "课程列表", icon: BookOpen, key: "courses" },
  { href: "/people", label: "人物档案", icon: UsersRound, key: "people" },
  { href: "/themes", label: "主题库", icon: Tags, key: "themes" },
  { href: "/grammar", label: "语法库", icon: ListChecks, key: "grammar" },
];

type ProviderOption = {
  id: "quickrouter-main" | "quickrouter-direct" | "crazyrouter" | "easy88ai" | "deepseek";
  label: string;
  gateway: AiGateway | "deepseek";
  endpoint?: QuickRouterEndpoint;
};

const presetProviderOptions: readonly ProviderOption[] = [
  {
    id: "quickrouter-main",
    label: "QuickRouter 主站",
    gateway: "quickrouter",
    endpoint: "main",
  },
  {
    id: "quickrouter-direct",
    label: "QuickRouter 直连",
    gateway: "quickrouter",
    endpoint: "direct",
  },
  { id: "crazyrouter", label: "Crazyrouter", gateway: "crazyrouter" },
  { id: "easy88ai", label: "Easy88AI", gateway: "easy88ai" },
];

const deepSeekProviderOption: ProviderOption = {
  id: "deepseek",
  label: "DeepSeek",
  gateway: "deepseek",
};

function selectedProviderId(gateway: AiGateway, endpoint: QuickRouterEndpoint): ProviderOption["id"] {
  if (gateway === "quickrouter") return endpoint === "main" ? "quickrouter-main" : "quickrouter-direct";
  return gateway;
}

const routeInfo: Record<string, { title: string; subtitle?: string; activeKey: string }> = {
  courses: {
    title: "课程列表",
    subtitle: "管理正在创作、待发布和已发布的课程",
    activeKey: "courses",
  },
  people: {
    title: "人物档案",
    subtitle: "人物资料会用于课程内容和插图生成",
    activeKey: "people",
  },
  themes: {
    title: "主题库",
    subtitle: "管理主题灵感、故事类型和故事氛围",
    activeKey: "themes",
  },
  grammar: {
    title: "语法库",
    activeKey: "grammar",
  },
};

function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/people")) {
    return routeInfo.people;
  }

  if (pathname.startsWith("/themes")) {
    return routeInfo.themes;
  }

  if (pathname.startsWith("/grammar")) {
    return routeInfo.grammar;
  }

  if (pathname === "/courses/new" || (pathname.includes("/create/") && pathname.startsWith("/courses/"))) {
    return {
      title: "新建课程",
      activeKey: "courses",
    };
  }

  if (pathname.endsWith("/pdf") && pathname.startsWith("/courses/")) {
    return {
      title: "PDF 预览",
      subtitle: "核对最终页面与导出效果",
      activeKey: "courses",
    };
  }

  if (pathname.startsWith("/courses/")) {
    return {
      title: "课程预览",
      subtitle: "查看课程内容和发布状态",
      activeKey: "courses",
    };
  }

  return routeInfo.courses;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useMemo(() => getStoredSession(), []);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [writingProvider, setWritingProvider] = useState<TextGenerationModel>("gpt-5.6-sol");
  const [aiGateway, setAiGateway] = useState<AiGateway>("quickrouter");
  const [quickRouterEndpoint, setQuickRouterEndpoint] = useState<QuickRouterEndpoint>("main");
  const [imageModel, setImageModel] = useState<ImageGenerationModel>("gpt-image-2");
  const [imageGateway, setImageGateway] = useState<AiGateway>("quickrouter");
  const [imageQuickRouterEndpoint, setImageQuickRouterEndpoint] = useState<QuickRouterEndpoint>("main");
  const [textReasoningEffort, setTextReasoningEffort] = useState<TextReasoningEffort>("medium");
  const [textStreamingEnabled, setTextStreamingEnabled] = useState(true);
  const [textStreamFirstEventTimeoutSeconds, setTextStreamFirstEventTimeoutSeconds] = useState<number>(TEXT_TIMEOUT_DEFAULTS.streamFirstEventSeconds);
  const [textStreamIdleTimeoutSeconds, setTextStreamIdleTimeoutSeconds] = useState<number>(TEXT_TIMEOUT_DEFAULTS.streamIdleSeconds);
  const [textStreamMaxDurationSeconds, setTextStreamMaxDurationSeconds] = useState<number>(TEXT_TIMEOUT_DEFAULTS.streamMaxDurationSeconds);
  const [textNonStreamTimeoutSeconds, setTextNonStreamTimeoutSeconds] = useState<number>(TEXT_TIMEOUT_DEFAULTS.nonStreamSeconds);
  const [imageQuality, setImageQuality] = useState<ImageQuality>("high");
  const [advancedSection, setAdvancedSection] = useState<"text" | "image">("text");
  const [isLoadingGateway, setIsLoadingGateway] = useState(false);
  const [hasLoadedGateway, setHasLoadedGateway] = useState(false);
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const routeMeta = getRouteMeta(pathname);
  const isCourseCreateRoute = pathname === "/courses/new" || (pathname.includes("/create/") && pathname.startsWith("/courses/"));
  const isFixedCourseWorkspaceRoute = /^\/courses\/[^/]+\/create\/(story-outline|teaching-plan|content)$/u.test(pathname);
  const displayName = session?.user.displayName ?? "教师账号";

  useEffect(() => {
    if (!isMenuOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMobileNavOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isMobileNavOpen]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      clearAuthSession();
      router.replace("/login");
    }
  }

  async function openAdvancedSettings() {
    setIsMenuOpen(false);
    setGatewayError("");
    setIsAdvancedOpen(true);
    setIsLoadingGateway(true);
    setHasLoadedGateway(false);
    try {
      const response = await fetch("/api/account/ai-gateway", {
        method: "GET",
        cache: "no-store",
      });
      const result = (await response.json()) as Partial<AccountAiSettings> & {
        message?: string;
      };
      if (!response.ok || !result.writingProvider || !result.aiGateway || !result.quickRouterEndpoint || !result.imageModel || !result.imageGateway || !result.imageQuickRouterEndpoint) {
        throw new Error(result.message || "高级设置加载失败");
      }
      setWritingProvider(result.writingProvider);
      setAiGateway(result.aiGateway);
      setQuickRouterEndpoint(result.quickRouterEndpoint);
      setImageModel(result.imageModel);
      setImageGateway(result.imageGateway);
      setImageQuickRouterEndpoint(result.imageQuickRouterEndpoint);
      setTextReasoningEffort(result.textReasoningEffort ?? "medium");
      setTextStreamingEnabled(result.textStreamingEnabled ?? true);
      setTextStreamFirstEventTimeoutSeconds(result.textStreamFirstEventTimeoutSeconds ?? TEXT_TIMEOUT_DEFAULTS.streamFirstEventSeconds);
      setTextStreamIdleTimeoutSeconds(result.textStreamIdleTimeoutSeconds ?? TEXT_TIMEOUT_DEFAULTS.streamIdleSeconds);
      setTextStreamMaxDurationSeconds(result.textStreamMaxDurationSeconds ?? TEXT_TIMEOUT_DEFAULTS.streamMaxDurationSeconds);
      setTextNonStreamTimeoutSeconds(result.textNonStreamTimeoutSeconds ?? TEXT_TIMEOUT_DEFAULTS.nonStreamSeconds);
      setImageQuality(imageQualityForSelection(result.imageModel, result.imageQuality ?? "medium"));
      setHasLoadedGateway(true);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : "高级设置加载失败");
    } finally {
      setIsLoadingGateway(false);
    }
  }

  async function saveAiGateway() {
    setGatewayError("");
    const timeoutSettings = { textStreamFirstEventTimeoutSeconds, textStreamIdleTimeoutSeconds, textStreamMaxDurationSeconds, textNonStreamTimeoutSeconds };
    if (!isTextTimeoutSettingsValid(timeoutSettings)) {
      setGatewayError("请检查文本超时设置：最长运行时间必须大于首个响应和事件空闲时间，且所有数值需在提示范围内。");
      return;
    }
    setIsSavingGateway(true);
    try {
      const response = await fetch("/api/account/ai-gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writingProvider,
          aiGateway,
          quickRouterEndpoint,
          imageModel,
          imageGateway,
          imageQuickRouterEndpoint,
          textReasoningEffort,
          textStreamingEnabled,
          ...timeoutSettings,
          imageQuality: imageQualityForSelection(imageModel, imageQuality),
        }),
      });
      const result = (await response.json()) as Partial<AccountAiSettings> & {
        message?: string;
      };
      if (!response.ok || !result.aiGateway) throw new Error(result.message || "高级设置保存失败");
      setWritingProvider(result.writingProvider ?? writingProvider);
      setAiGateway(result.aiGateway);
      setQuickRouterEndpoint(result.quickRouterEndpoint ?? quickRouterEndpoint);
      setImageModel(result.imageModel ?? imageModel);
      setImageGateway(result.imageGateway ?? imageGateway);
      setImageQuickRouterEndpoint(result.imageQuickRouterEndpoint ?? imageQuickRouterEndpoint);
      setTextReasoningEffort(result.textReasoningEffort ?? textReasoningEffort);
      setTextStreamingEnabled(result.textStreamingEnabled ?? textStreamingEnabled);
      setTextStreamFirstEventTimeoutSeconds(result.textStreamFirstEventTimeoutSeconds ?? textStreamFirstEventTimeoutSeconds);
      setTextStreamIdleTimeoutSeconds(result.textStreamIdleTimeoutSeconds ?? textStreamIdleTimeoutSeconds);
      setTextStreamMaxDurationSeconds(result.textStreamMaxDurationSeconds ?? textStreamMaxDurationSeconds);
      setTextNonStreamTimeoutSeconds(result.textNonStreamTimeoutSeconds ?? textNonStreamTimeoutSeconds);
      setImageQuality(result.imageQuality ?? imageQuality);
      setIsAdvancedOpen(false);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : "高级设置保存失败");
    } finally {
      setIsSavingGateway(false);
    }
  }

  return (
    <div className={cn("flex min-h-dvh bg-[#F4F9FF] text-[#19324D]", isFixedCourseWorkspaceRoute && "h-dvh overflow-hidden")} data-testid="app-shell-root">
      <aside className="print-hidden fixed inset-y-0 left-0 z-sticky hidden w-60 flex-col border-r border-[#DCEAF6] bg-white text-[#19324D] lg:flex">
        <Link className="flex h-[72px] items-center gap-3 px-5" href="/courses">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#EEF0FF] text-[#4D5FE8]">
            <Sparkles className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold">Kaleido Concepts</span>
            <span className="mt-0.5 block text-[13px] font-medium text-[#69829B]">万象之境</span>
          </span>
        </Link>

        <nav className="flex-1 px-3 py-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === routeMeta.activeKey;

              return (
                <Link className={cn("group flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-colors duration-200", isActive ? "bg-[#EEF0FF] text-[#3447D4]" : "text-[#526B84] hover:bg-[#F3F8FC] hover:text-[#19324D]")} href={item.href} key={item.href}>
                  <Icon className={cn("size-[18px]", isActive ? "text-[#5365EC]" : "text-[#7890A7] group-hover:text-[#536B83]")} />
                  <span className="flex-1">{item.label}</span>
                  {isActive ? <span className="size-1.5 rounded-full bg-[#6FD8C2]" /> : null}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className={cn("flex min-h-dvh min-w-0 flex-1 flex-col lg:pl-60", isFixedCourseWorkspaceRoute && "h-dvh min-h-0 overflow-hidden")}>
        <header className="print-hidden sticky top-0 z-sticky flex min-h-[64px] flex-wrap items-center gap-3 border-b border-[#DCEAF6] bg-white px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-6 lg:h-[72px] lg:px-8 lg:py-0">
          <button aria-expanded={isMobileNavOpen} aria-label="打开主导航" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[#D7E5F1] bg-white text-[#38536E] transition-colors active:bg-[#EEF0FF] lg:hidden" onClick={() => setIsMobileNavOpen(true)} type="button">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1 sm:shrink-0 sm:flex-none" data-testid="app-shell-route-heading">
            <h1 className="truncate text-lg font-semibold text-[#19324D] sm:text-xl">{routeMeta.title}</h1>
            {routeMeta.subtitle ? <p className="mt-0.5 hidden text-[13px] text-[#69829B] sm:line-clamp-1 sm:block">{routeMeta.subtitle}</p> : null}
          </div>

          {isCourseCreateRoute ? <div className="order-last min-w-0 w-full sm:order-none sm:flex-1" id="course-create-progress-slot" /> : <div className="hidden flex-1 sm:block" />}

          <div className="relative w-11 shrink-0 sm:w-40" data-testid="account-menu-anchor" ref={accountMenuRef}>
            <button aria-expanded={isMenuOpen} aria-label="用户菜单" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#D7E5F1] bg-white px-1.5 text-sm font-medium text-[#38536E] transition-colors hover:border-[#BBCFE0] hover:bg-[#F7FBFE] sm:justify-start sm:gap-3 sm:px-2.5 sm:pr-3" onClick={() => setIsMenuOpen((value) => !value)} type="button">
              <PersonAvatar name={displayName} seed={displayName} size={30} />
              <span className="hidden sm:block">{displayName}</span>
              <ChevronDown className={cn("ml-auto hidden size-4 text-[#7890A7] transition-transform duration-200 sm:block", isMenuOpen && "rotate-180")} />
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 top-full z-dropdown mt-2 w-full overflow-hidden rounded-xl bg-white shadow-[0_6px_14px_rgba(46,78,108,0.14)] animate-fade-in" data-testid="account-menu">
                <button className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-[#38536E] transition-colors duration-200 hover:bg-[#F3F8FC]" onClick={() => void openAdvancedSettings()} type="button">
                  <Settings2 className="size-4" />
                  高级设置
                </button>
                <button className="flex h-10 w-full items-center gap-2 border-t border-[#E7EFF6] px-3 text-left text-sm text-red-600 transition-colors duration-200 hover:bg-red-50" onClick={() => void handleLogout()} type="button">
                  <LogOut className="size-4" />
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {isMobileNavOpen ? (
          <div className="fixed inset-0 z-modal lg:hidden">
            <button aria-hidden="true" className="fixed inset-0 bg-slate-950/35" onClick={() => setIsMobileNavOpen(false)} tabIndex={-1} type="button" />
            <nav aria-label="移动端主导航" className="fixed inset-y-0 left-0 flex w-[min(82vw,320px)] flex-col border-r border-[#DCEAF6] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-[#19324D] shadow-lg lg:hidden">
              <div className="flex min-h-16 items-center justify-between gap-3 border-b border-[#E7EFF6] px-4">
                <Link className="flex min-w-0 items-center gap-3" href="/courses" onClick={() => setIsMobileNavOpen(false)}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FF] text-[#4D5FE8]">
                    <Sparkles className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">Kaleido Concepts</span>
                    <span className="block text-xs font-medium text-[#69829B]">万象之境</span>
                  </span>
                </Link>
                <button aria-label="关闭主导航" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#526B84] transition-colors active:bg-[#EEF0FF]" onClick={() => setIsMobileNavOpen(false)} type="button">
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-1 px-3 py-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === routeMeta.activeKey;

                  return (
                    <Link className={cn("flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-colors", isActive ? "bg-[#EEF0FF] text-[#3447D4]" : "text-[#526B84] active:bg-[#F3F8FC]")} href={item.href} key={item.href} onClick={() => setIsMobileNavOpen(false)}>
                      <Icon className={cn("size-[18px]", isActive ? "text-[#5365EC]" : "text-[#7890A7]")} />
                      <span className="flex-1">{item.label}</span>
                      {isActive ? <span className="size-1.5 rounded-full bg-[#6FD8C2]" /> : null}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        ) : null}

        <Dialog description="统一管理当前账号的 AI 生成偏好。" icon={<Settings2 className="size-5" />} onClose={() => setIsAdvancedOpen(false)} open={isAdvancedOpen} size="medium" title="高级设置">
          <div className="p-5 sm:p-6">
            {isLoadingGateway ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                正在读取已保存的设置…
              </div>
            ) : null}
            {!isLoadingGateway && !hasLoadedGateway ? (
              <div className="space-y-4 py-4 text-center">
                <p className="text-sm text-destructive" role="alert">
                  {gatewayError || "高级设置加载失败"}
                </p>
                <div className="flex justify-center gap-3">
                  <Button onClick={() => setIsAdvancedOpen(false)} type="button" variant="outline">
                    关闭
                  </Button>
                  <Button onClick={() => void openAdvancedSettings()} type="button">
                    重新加载
                  </Button>
                </div>
              </div>
            ) : null}
            <div aria-hidden={!hasLoadedGateway || isLoadingGateway} className={cn((!hasLoadedGateway || isLoadingGateway) && "hidden")}>
              <div className="grid gap-5 md:grid-cols-[192px_minmax(0,1fr)] md:gap-0" data-testid="advanced-settings-layout">
                <nav aria-label="高级设置分类" className="grid grid-cols-2 gap-2 border-b border-border pb-4 md:block md:space-y-2 md:rounded-l-lg md:border-b-0 md:border-r md:bg-[#F7F5FB] md:py-2 md:pl-2 md:pr-0">
                  {([
                    { id: "text" as const, label: "文本生成", description: "模型与响应", icon: FileText },
                    { id: "image" as const, label: "图片生成", description: "模型与画质", icon: ImageIcon },
                  ]).map((item) => {
                    const Icon = item.icon;
                    const active = advancedSection === item.id;
                    return (
                      <button aria-current={active ? "page" : undefined} className={cn("relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent md:min-h-14 md:rounded-l-lg md:rounded-r-none md:border-y md:border-l md:border-r-0 md:before:hidden", active ? "bg-primary-50/70 text-primary before:bg-primary md:border-primary-100 md:bg-white md:shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground md:border-transparent md:hover:bg-white/70")} key={item.id} onClick={() => setAdvancedSection(item.id)} type="button">
                        <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{item.label}</span>
                          <span className="hidden text-xs text-muted-foreground md:block">{item.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </nav>

                {advancedSection === "text" ? (
                  <section aria-labelledby="text-settings-title" className="min-w-0 md:pl-6" role="region">
                    <h3 className="text-lg font-semibold text-foreground" id="text-settings-title">文本生成</h3>
                    <p className="mt-1 text-[13px] leading-5 text-muted-foreground">用于故事、课程正文、练习和联网资料整理，下次请求生效。</p>
                    <div className="mt-6 space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">模型配置</h4>
                        <div className="mt-4 space-y-4">
                      <label className="block text-[13px] font-medium text-foreground" htmlFor="text-model">
                        文本模型
                        <select className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="text-model" onChange={(event) => {
                          const model = event.target.value as TextGenerationModel;
                          setWritingProvider(model);
                          if (!reasoningEffortsForModel(model).includes(textReasoningEffort)) setTextReasoningEffort(reasoningEffortsForModel(model)[0]!);
                        }} value={writingProvider}>
                          {TEXT_GENERATION_MODELS.map((model) => <option key={model} value={model}>{textModelLabels[model]}</option>)}
                        </select>
                      </label>
                      <label className="block text-[13px] font-medium text-foreground" htmlFor="text-provider">
                        文本提供方
                        <select className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway || writingProvider === "deepseek-v4-pro"} id="text-provider" onChange={(event) => {
                          const provider = presetProviderOptions.find((item) => item.id === event.target.value);
                          if (!provider || provider.gateway === "deepseek") return;
                          setAiGateway(provider.gateway);
                          if (provider.endpoint) setQuickRouterEndpoint(provider.endpoint);
                        }} value={writingProvider === "deepseek-v4-pro" ? "deepseek" : selectedProviderId(aiGateway, quickRouterEndpoint)}>
                          {(writingProvider === "deepseek-v4-pro" ? [deepSeekProviderOption] : presetProviderOptions).map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                        </select>
                      </label>
                        </div>
                      </div>
                      <div className="border-t border-border pt-6">
                        <h4 className="text-sm font-semibold text-foreground">生成偏好</h4>
                        <div className="mt-4 space-y-4">
                      <fieldset disabled={isSavingGateway}>
                        <legend className="text-[13px] font-medium text-foreground">思考强度</legend>
                        <div aria-label="思考强度" className="mt-2 grid h-11 grid-cols-3 gap-1 rounded-lg border border-[#DED8E8] bg-[#F1EFF6] p-1" data-testid="reasoning-options" role="radiogroup">
                          {reasoningEffortsForModel(writingProvider).map((effort) => (
                            <button aria-checked={textReasoningEffort === effort} className={cn("h-full rounded-md border px-3 text-sm font-medium transition-colors", textReasoningEffort === effort ? "border-primary-200 bg-white text-primary shadow-sm" : "border-transparent bg-transparent text-muted-foreground hover:bg-white/60 hover:text-foreground")} key={effort} onClick={() => setTextReasoningEffort(effort)} role="radio" type="button">{textReasoningEffortLabels[effort]}</button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">强度越高通常更适合复杂任务，但响应时间和消耗也可能增加。</p>
                      </fieldset>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">流式返回</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">服务器持续接收模型输出，完整校验后再显示到页面。</p>
                        <div className="mt-2 flex h-11 items-center justify-between rounded-lg border border-input bg-white pl-3" data-testid="streaming-control">
                          <span className="text-sm font-medium text-foreground" data-testid="streaming-state">{textStreamingEnabled ? "已开启" : "已关闭"}</span>
                          <button aria-checked={textStreamingEnabled} aria-label="流式返回" className="relative flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" disabled={isSavingGateway} onClick={() => setTextStreamingEnabled((value) => !value)} role="switch" type="button">
                            <span className={cn("relative h-6 w-10 rounded-full border transition-colors", textStreamingEnabled ? "border-primary-100 bg-primary-50" : "border-slate-300 bg-slate-200")} data-testid="streaming-track">
                              <span className={cn("absolute left-[3px] top-[2px] size-[18px] rounded-full border shadow-sm transition-[transform,background-color,border-color]", textStreamingEnabled ? "translate-x-4 border-primary bg-primary" : "translate-x-0 border-slate-300 bg-white")} data-testid="streaming-thumb" />
                            </span>
                          </button>
                        </div>
                      </div>
                        </div>
                      </div>
                      <div className="border-t border-border pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">超时保护</h4>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">只影响下次新请求；持续活跃的流式响应不会按非流式时限中断。</p>
                          </div>
                          <button className="shrink-0 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} onClick={() => {
                            setTextStreamFirstEventTimeoutSeconds(TEXT_TIMEOUT_DEFAULTS.streamFirstEventSeconds);
                            setTextStreamIdleTimeoutSeconds(TEXT_TIMEOUT_DEFAULTS.streamIdleSeconds);
                            setTextStreamMaxDurationSeconds(TEXT_TIMEOUT_DEFAULTS.streamMaxDurationSeconds);
                            setTextNonStreamTimeoutSeconds(TEXT_TIMEOUT_DEFAULTS.nonStreamSeconds);
                          }} type="button">恢复默认值</button>
                        </div>
                        {textStreamingEnabled ? (
                          <div className="mt-4 grid gap-4 sm:grid-cols-3" data-testid="stream-timeout-settings">
                            <label className="block text-[13px] font-medium text-foreground" htmlFor="stream-first-event-timeout">
                              首个响应事件
                              <span className="relative mt-2 block">
                                <input className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="stream-first-event-timeout" max={600} min={10} onChange={(event) => setTextStreamFirstEventTimeoutSeconds(Number(event.target.value))} type="number" value={textStreamFirstEventTimeoutSeconds} />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">秒</span>
                              </span>
                            </label>
                            <label className="block text-[13px] font-medium text-foreground" htmlFor="stream-idle-timeout">
                              事件空闲
                              <span className="relative mt-2 block">
                                <input className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="stream-idle-timeout" max={600} min={10} onChange={(event) => setTextStreamIdleTimeoutSeconds(Number(event.target.value))} type="number" value={textStreamIdleTimeoutSeconds} />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">秒</span>
                              </span>
                            </label>
                            <label className="block text-[13px] font-medium text-foreground" htmlFor="stream-max-duration">
                              最长运行
                              <span className="relative mt-2 block">
                                <input className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-12 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="stream-max-duration" max={60} min={5} onChange={(event) => setTextStreamMaxDurationSeconds(Number(event.target.value) * 60)} type="number" value={textStreamMaxDurationSeconds / 60} />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">分钟</span>
                              </span>
                            </label>
                          </div>
                        ) : (
                          <div className="mt-4 max-w-[220px]" data-testid="non-stream-timeout-settings">
                            <label className="block text-[13px] font-medium text-foreground" htmlFor="non-stream-timeout">
                              非流式请求总时限
                              <span className="relative mt-2 block">
                                <input className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-12 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="non-stream-timeout" max={30} min={1} onChange={(event) => setTextNonStreamTimeoutSeconds(Number(event.target.value) * 60)} type="number" value={textNonStreamTimeoutSeconds / 60} />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">分钟</span>
                              </span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                ) : (
                  <section aria-labelledby="image-settings-title" className="min-w-0 md:pl-6" role="region">
                    <h3 className="text-lg font-semibold text-foreground" id="image-settings-title">图片生成</h3>
                    <p className="mt-1 text-[13px] leading-5 text-muted-foreground">统一用于人物档案、课程插图和后续图片修改。</p>
                    <div className="mt-6 space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">模型配置</h4>
                        <div className="mt-4 space-y-4">
                      <label className="block text-[13px] font-medium text-foreground" htmlFor="image-model">
                        图片模型
                        <select className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="image-model" onChange={(event) => {
                          const model = event.target.value as ImageGenerationModel;
                          setImageModel(model);
                          setImageQuality(imageQualityForSelection(model, imageQuality));
                          if (model === "gpt-image-2-c") setImageGateway("quickrouter");
                        }} value={imageModel}>
                          {IMAGE_GENERATION_MODELS.map((model) => <option key={model} value={model}>{imageModelLabels[model]}</option>)}
                        </select>
                      </label>
                      <label className="block text-[13px] font-medium text-foreground" htmlFor="image-provider">
                        图片提供方
                        <select className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSavingGateway} id="image-provider" onChange={(event) => {
                          const provider = presetProviderOptions.find((item) => item.id === event.target.value);
                          if (!provider || provider.gateway === "deepseek") return;
                          setImageGateway(provider.gateway);
                          if (provider.endpoint) setImageQuickRouterEndpoint(provider.endpoint);
                        }} value={selectedProviderId(imageGateway, imageQuickRouterEndpoint)}>
                          {presetProviderOptions.filter((provider) => imageModel !== "gpt-image-2-c" || provider.gateway === "quickrouter").map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                        </select>
                      </label>
                        </div>
                      </div>
                      <div className="border-t border-border pt-6">
                        <h4 className="text-sm font-semibold text-foreground">输出质量</h4>
                        <div className="mt-4">
                      <fieldset disabled={isSavingGateway || imageModel === "gpt-image-2-c"}>
                        <legend className="text-[13px] font-medium text-foreground">图片质量</legend>
                        <div aria-label="图片质量" className="mt-2 grid h-11 grid-cols-3 gap-1 rounded-lg border border-[#DED8E8] bg-[#F1EFF6] p-1" data-testid="image-quality-options" role="radiogroup">
                          {(imageModel === "gpt-image-2-c" ? ["high" as const] : IMAGE_QUALITIES).map((quality) => (
                            <button aria-checked={imageQualityForSelection(imageModel, imageQuality) === quality} className={cn("h-full rounded-md border px-3 text-sm font-medium transition-colors", imageQualityForSelection(imageModel, imageQuality) === quality ? "border-primary-200 bg-white text-primary shadow-sm" : "border-transparent bg-transparent text-muted-foreground hover:bg-white/60 hover:text-foreground", imageModel === "gpt-image-2-c" && "col-span-3 cursor-default")} key={quality} onClick={() => setImageQuality(quality)} role="radio" type="button">{imageQualityLabels[quality]}{imageModel === "gpt-image-2-c" ? "（模型固定）" : ""}</button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{imageModel === "gpt-image-2-c" ? "GPT Image 2-C 只支持极高质量，并按该模型规则计费。" : "新的质量设置会同时应用于人物档案和 Step 5 后续生成。"}</p>
                      </fieldset>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
              {gatewayError ? (
                <p className="mt-5 text-sm text-destructive" role="alert">
                  {gatewayError}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                <Button disabled={isSavingGateway} onClick={() => setIsAdvancedOpen(false)} type="button" variant="outline">
                  取消
                </Button>
                <Button disabled={isSavingGateway} loading={isSavingGateway} onClick={() => void saveAiGateway()} type="button">
                  保存设置
                </Button>
              </div>
            </div>
          </div>
        </Dialog>

        <main className={cn("flex-1 px-4 py-5 sm:px-6 lg:p-8", isFixedCourseWorkspaceRoute && "min-h-0 overflow-hidden")}>{children}</main>
      </div>
    </div>
  );
}
