"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ListChecks, LogOut, Settings2, Sparkles, Tags, UsersRound } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AI_GATEWAYS, aiGatewayDescriptions, aiGatewayLabels, type AiGateway } from "@/lib/ai-gateway";
import { clearAuthSession, getStoredSession, updateStoredAiGateway } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/courses", label: "课程列表", icon: BookOpen, key: "courses" },
  { href: "/people", label: "人物档案", icon: UsersRound, key: "people" },
  { href: "/themes", label: "主题库", icon: Tags, key: "themes" },
  { href: "/grammar", label: "语法库", icon: ListChecks, key: "grammar" },
];

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
    subtitle: "沉淀可复用的语法点",
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
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [aiGateway, setAiGateway] = useState<AiGateway>(session?.user.aiGateway ?? "quickrouter");
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const routeMeta = getRouteMeta(pathname);
  const isCourseCreateRoute = pathname === "/courses/new" || (pathname.includes("/create/") && pathname.startsWith("/courses/"));
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

  function handleLogout() {
    clearAuthSession();
    router.replace("/login");
  }

  async function saveAiGateway() {
    setGatewayError("");
    setIsSavingGateway(true);
    try {
      const response = await fetch("/api/account/ai-gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiGateway }),
      });
      const result = await response.json() as { aiGateway?: AiGateway; message?: string };
      if (!response.ok || !result.aiGateway) throw new Error(result.message || "中转站设置保存失败");
      setAiGateway(result.aiGateway);
      updateStoredAiGateway(result.aiGateway);
      setIsAdvancedOpen(false);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : "中转站设置保存失败");
    } finally {
      setIsSavingGateway(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-[#F4F9FF] text-[#19324D]">
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
                <Link
                  className={cn(
                    "group flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-colors duration-200",
                    isActive
                      ? "bg-[#EEF0FF] text-[#3447D4]"
                      : "text-[#526B84] hover:bg-[#F3F8FC] hover:text-[#19324D]",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <Icon className={cn("size-[18px]", isActive ? "text-[#5365EC]" : "text-[#7890A7] group-hover:text-[#536B83]")} />
                  <span className="flex-1">{item.label}</span>
                  {isActive ? <span className="size-1.5 rounded-full bg-[#6FD8C2]" /> : null}
                </Link>
              );
            })}
          </div>
        </nav>

      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:pl-60">
        <header className="print-hidden sticky top-0 z-sticky flex min-h-[64px] items-center gap-4 border-b border-[#DCEAF6] bg-white px-4 py-3 sm:px-6 lg:h-[72px] lg:px-8 lg:py-0">
          <div className="min-w-0 shrink-0">
            <h1 className="truncate text-lg font-semibold text-[#19324D] sm:text-xl">{routeMeta.title}</h1>
            {routeMeta.subtitle ? <p className="mt-0.5 line-clamp-1 text-[13px] text-[#69829B]">{routeMeta.subtitle}</p> : null}
          </div>

          {isCourseCreateRoute ? <div className="min-w-0 flex-1" id="course-create-progress-slot" /> : <div className="flex-1" />}

          <div className="relative w-40 shrink-0" ref={accountMenuRef}>
            <button
              aria-expanded={isMenuOpen}
              aria-label="用户菜单"
              className="flex min-h-11 w-full items-center gap-2 rounded-full border border-[#D7E5F1] bg-white px-2.5 pr-3 text-sm font-medium text-[#38536E] transition-colors hover:border-[#BBCFE0] hover:bg-[#F7FBFE] sm:gap-3"
              onClick={() => setIsMenuOpen((value) => !value)}
              type="button"
            >
              <PersonAvatar name={displayName} seed={displayName} size={30} />
              <span className="hidden sm:block">{displayName}</span>
              <ChevronDown className={cn("ml-auto size-4 text-[#7890A7] transition-transform duration-200", isMenuOpen && "rotate-180")} />
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 top-full z-dropdown mt-2 w-full overflow-hidden rounded-xl bg-white shadow-[0_6px_14px_rgba(46,78,108,0.14)] animate-fade-in" data-testid="account-menu">
                <button
                  className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-[#38536E] transition-colors duration-200 hover:bg-[#F3F8FC]"
                  onClick={() => { setIsMenuOpen(false); setGatewayError(""); setIsAdvancedOpen(true); }}
                  type="button"
                >
                  <Settings2 className="size-4" />
                  高级设置
                </button>
                <button
                  className="flex h-10 w-full items-center gap-2 border-t border-[#E7EFF6] px-3 text-left text-sm text-red-600 transition-colors duration-200 hover:bg-red-50"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogOut className="size-4" />
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <Dialog
          description="仅选择国外 GPT 文本、联网研究、图片生成和编辑使用的中转站；DeepSeek 仍走原有直连。"
          icon={<Settings2 className="size-5" />}
          onClose={() => setIsAdvancedOpen(false)}
          open={isAdvancedOpen}
          size="compact"
          title="高级设置"
        >
          <div className="space-y-5 p-5 sm:p-6">
            <fieldset>
              <legend className="text-sm font-semibold text-foreground">GPT 中转站</legend>
              <div className="mt-3 grid gap-3">
                {AI_GATEWAYS.map((gateway) => (
                  <label className={cn("cursor-pointer rounded-xl border p-4 transition-colors", aiGateway === gateway ? "border-primary bg-primary-50/60 ring-1 ring-primary/20" : "border-border hover:bg-muted/50")} key={gateway}>
                    <span className="flex items-center gap-2">
                      <input checked={aiGateway === gateway} className="size-4" name="ai-gateway" onChange={() => setAiGateway(gateway)} type="radio" value={gateway} />
                      <span className="text-sm font-semibold text-foreground">{aiGatewayLabels[gateway]}</span>
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                      {aiGatewayDescriptions[gateway]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {gatewayError ? <p className="text-sm text-destructive" role="alert">{gatewayError}</p> : null}
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button disabled={isSavingGateway} onClick={() => setIsAdvancedOpen(false)} type="button" variant="outline">取消</Button>
              <Button loading={isSavingGateway} onClick={() => void saveAiGateway()} type="button">保存设置</Button>
            </div>
          </div>
        </Dialog>

        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:p-8">{children}</main>

        <nav className="print-hidden fixed inset-x-0 bottom-0 z-sticky border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-md lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === routeMeta.activeKey;

              return (
                <Link
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors duration-200",
                    isActive
                      ? "bg-primary-50 text-primary"
                      : "text-slate-500 active:bg-slate-100",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="size-5" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
