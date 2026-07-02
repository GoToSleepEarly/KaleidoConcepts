"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getStoredSession } from "@/lib/auth-session";

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session] = useState(() => getStoredSession());

  useEffect(() => {
    if (!session) {
      router.replace("/login");
    }
  }, [router, session]);

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F8FB] text-sm text-slate-500">
        正在检查登录状态...
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
