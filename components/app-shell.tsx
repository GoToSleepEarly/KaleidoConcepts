import Link from "next/link";
import { Archive, BookOpen, Box, Heart, Home, PlusSquare, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/courses", label: "课程列表", icon: Home },
  { href: "/courses/new", label: "新建课程", icon: PlusSquare, active: true },
  { href: "/resources", label: "资源库", icon: Box },
  { href: "/favorites", label: "我的收藏", icon: Heart },
  { href: "/trash", label: "回收站", icon: Trash2 },
];

export function AppShell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className="min-h-dvh bg-[#f7f8fb] text-slate-950">
      <aside className="print-hidden fixed inset-y-0 left-0 hidden w-[196px] border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <Link className="flex h-16 items-center gap-3 px-6 text-xl font-bold" href="/courses/new">
          <span className="flex size-7 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Sparkles className="size-4" />
          </span>
          AI 绘本课件
        </Link>
        <nav className="mt-6 space-y-2 px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                  item.active && "bg-violet-50 text-violet-700",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-3 px-5 py-6">
          <div className="size-8 rounded-full bg-[url('/mock-assets/rabbit-forest.png')] bg-cover bg-center" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Emily Teacher</div>
            <div className="text-xs text-slate-400">Mock workspace</div>
          </div>
        </div>
      </aside>
      <main className={cn("min-h-dvh lg:pl-[196px]", compact && "lg:pl-0")}>{children}</main>
      <BookOpen className="hidden" />
      <Archive className="hidden" />
    </div>
  );
}
