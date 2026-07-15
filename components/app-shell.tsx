"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ListChecks, LogOut, Sparkles, Tags, UsersRound } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { clearAuthSession, getStoredSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/courses", label: "课程列表", icon: BookOpen, key: "courses" },
  { href: "/people", label: "人物档案", icon: UsersRound, key: "people" },
  { href: "/themes", label: "主题库", icon: Tags, key: "themes" },
  { href: "/grammar", label: "语法库", icon: ListChecks, key: "grammar" },
];

const routeInfo: Record<string, { title: string; subtitle: string; activeKey: string }> = {
  courses: {
    title: "课程列表",
    subtitle: "管理正在创作、待发布和已发布的课程",
    activeKey: "courses",
  },
  people: {
    title: "人物档案",
    subtitle: "维护老师和学生画像",
    activeKey: "people",
  },
  themes: {
    title: "主题库",
    subtitle: "整理课程世界观和场景灵感",
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
      subtitle: "创建故事、草稿、资源和预览",
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const routeMeta = getRouteMeta(pathname);
  const session = useMemo(() => getStoredSession(), []);
  const displayName = session?.user.displayName ?? "教师账号";

  function handleLogout() {
    clearAuthSession();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-dvh bg-[#F3F5FA] text-slate-950">
      <aside className="print-hidden fixed inset-y-0 left-0 z-sticky flex w-[260px] flex-col border-r border-[#151B2A] bg-[#070B16] text-white">
        <Link className="flex h-[76px] items-center gap-3 px-5" href="/courses">
          <span className="flex size-10 items-center justify-center rounded-lg border border-white/12 bg-white/8 text-white">
            <Sparkles className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Kaleido Concepts</span>
            <span className="mt-1 block text-xs text-white/42">万象之境</span>
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
                    "group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200",
                    isActive
                      ? "bg-white text-[#07111F]"
                      : "text-white/62 hover:bg-white/8 hover:text-white",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <Icon className={cn("size-[18px]", isActive ? "text-[#3147FF]" : "text-white/48 group-hover:text-white/80")} />
                  <span className="flex-1">{item.label}</span>
                  {isActive ? <span className="size-1.5 rounded-full bg-[#26D7FF]" /> : null}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/8 px-5 py-4">
          <div className="flex items-center justify-between text-xs text-white/42">
            <span>Studio</span>
            <span>Live</span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col pl-[260px]">
        <header className="print-hidden sticky top-0 z-sticky flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur-md">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-950">{routeMeta.title}</h1>
            <p className="mt-1 truncate text-sm text-slate-500">{routeMeta.subtitle}</p>
          </div>

          <div className="relative">
            <button
              aria-label="用户菜单"
              className="flex h-10 items-center gap-3 rounded-full border border-slate-200 bg-white px-2.5 pr-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              onClick={() => setIsMenuOpen((value) => !value)}
              type="button"
            >
              <PersonAvatar name={displayName} seed={displayName} size={30} />
              <span className="hidden sm:block">{displayName}</span>
              <ChevronDown className={cn("size-4 text-slate-400 transition-transform duration-200", isMenuOpen && "rotate-180")} />
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 top-full z-dropdown mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg animate-fade-in">
                <button
                  className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-red-600 transition-colors duration-200 hover:bg-red-50"
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

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
