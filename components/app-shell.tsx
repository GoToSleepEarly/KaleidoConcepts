"use client";

import React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ListChecks, LogOut, Sparkles, Tags, UsersRound } from "lucide-react";

import { clearAuthSession, getStoredSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/people", label: "人物档案", icon: UsersRound, key: "people" },
  { href: "/themes", label: "主题库", icon: Tags, key: "themes" },
  { href: "/grammar", label: "语法点库", icon: ListChecks, key: "grammar" },
  { href: "/courses", label: "课程列表", icon: BookOpen, key: "courses" },
];

function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/people")) {
    return { title: "人物档案", activeKey: "people" };
  }

  if (pathname.startsWith("/themes")) {
    return { title: "主题库", activeKey: "themes" };
  }

  if (pathname.startsWith("/grammar")) {
    return { title: "语法点库", activeKey: "grammar" };
  }

  if (pathname === "/courses/new") {
    return { title: "新建课程", activeKey: "courses" };
  }

  if (pathname.includes("/create/") && pathname.startsWith("/courses/")) {
    return { title: "新建课程", activeKey: "courses" };
  }

  if (pathname.endsWith("/pdf") && pathname.startsWith("/courses/")) {
    return { title: "PDF 预览", activeKey: "courses" };
  }

  if (pathname.startsWith("/courses/")) {
    return { title: "课程预览", activeKey: "courses" };
  }

  return { title: "课程列表", activeKey: "courses" };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const routeMeta = getRouteMeta(pathname);
  const displayName = useMemo(() => getStoredSession()?.user.displayName ?? "教师账号", []);

  function handleLogout() {
    clearAuthSession();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#F7F8FB] text-slate-950">
      <aside className="print-hidden fixed inset-y-0 left-0 z-30 w-[240px] border-r border-[#E5E7EB] bg-white">
        <Link className="flex h-[72px] items-center gap-3 px-6 text-lg font-semibold tracking-tight" href="/courses">
          <span className="flex size-8 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Sparkles className="size-4" />
          </span>
          <span className="whitespace-nowrap">Kaleido Concepts</span>
        </Link>

        <nav className="mt-4 space-y-1 px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === routeMeta.activeKey;

            return (
              <Link
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-violet-50 hover:text-violet-700",
                  isActive && "bg-violet-50 text-violet-700",
                )}
                href={item.href}
                key={item.href}
              >
                {isActive ? <span className="absolute left-0 top-2 h-7 w-[3px] rounded-full bg-violet-600" /> : null}
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-h-dvh pl-[240px]">
        <header className="print-hidden sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#E5E7EB] bg-white/90 px-8 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">{routeMeta.title}</h1>

          <div className="relative">
            <button
              className="flex h-10 items-center gap-3 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
              onClick={() => setIsMenuOpen((value) => !value)}
              type="button"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                师
              </span>
              {displayName}
              <ChevronDown className={cn("size-4 text-slate-400 transition-transform duration-200", isMenuOpen && "rotate-180")} />
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-[#E5E7EB] bg-white p-1 shadow-lg">
                <button
                  className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-red-600 transition-colors duration-200 hover:bg-red-50"
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

        <main className="min-h-[calc(100dvh-72px)] px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
