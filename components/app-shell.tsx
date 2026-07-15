"use client";

import React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ListChecks, LogOut, Sparkles, Tags, UsersRound } from "lucide-react";

import { clearAuthSession, getStoredSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "@/components/person-avatar";

const navItems = [
  { href: "/courses", label: "课程列表", icon: BookOpen, key: "courses" },
  { href: "/people", label: "人物档案", icon: UsersRound, key: "people" },
  { href: "/themes", label: "主题库", icon: Tags, key: "themes" },
  { href: "/grammar", label: "语法点库", icon: ListChecks, key: "grammar" },
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
  const session = useMemo(() => getStoredSession(), []);
  const displayName = session?.user.displayName ?? "教师账号";

  function handleLogout() {
    clearAuthSession();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="print-hidden fixed inset-y-0 left-0 z-sticky flex w-64 flex-col border-r border-border bg-card">
        <Link
          className="flex h-16 items-center gap-3 px-6 font-semibold tracking-tight transition-colors hover:text-primary"
          href="/courses"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-5" />
          </span>
          <span className="whitespace-nowrap text-[15px]">Kaleido Concepts</span>
        </Link>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === routeMeta.activeKey;

            return (
              <Link
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200 ease-out-expo",
                  isActive
                    ? "bg-primary-50 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className={cn("size-[18px] transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="relative">
            <button
              className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200 hover:bg-secondary"
              onClick={() => setIsMenuOpen((value) => !value)}
              type="button"
            >
              <PersonAvatar name={displayName} seed={displayName} size={32} />
              <span className="flex-1 text-left">
                <span className="block truncate text-foreground">{displayName}</span>
                <span className="block text-xs text-muted-foreground">教师</span>
              </span>
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isMenuOpen && "rotate-180")} />
            </button>

            {isMenuOpen ? (
              <div className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-lg border border-border bg-card shadow-lg z-dropdown animate-fade-in">
                <button
                  className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-destructive transition-colors duration-200 hover:bg-destructive/5"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogOut className="size-4" />
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col pl-64">
        <header className="print-hidden sticky top-0 z-sticky flex h-16 items-center justify-between border-b border-border bg-card/80 px-8 backdrop-blur-xl">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{routeMeta.title}</h1>
        </header>

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
