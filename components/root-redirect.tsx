"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getStoredSession } from "@/lib/auth-session";

export function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getStoredSession() ? "/courses" : "/login");
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F7F8FB] text-sm text-slate-500">
      正在进入 Kaleido Concepts...
    </div>
  );
}
