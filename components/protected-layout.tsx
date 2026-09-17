"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getAuthInvalidEventName, readServerAuthSession, type AuthSession } from "@/lib/auth-client";

export function ProtectedLayout({ children, chromeless = false }: { children: React.ReactNode; chromeless?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<"checking" | "authenticated" | "error">("checking");

  async function retrySession() {
    setStatus("checking");
    try {
      const auth = await readServerAuthSession();
      if (auth.status === "authenticated") {
        setSession(auth.session);
        setStatus("authenticated");
        return;
      }
      const reason = auth.reason === "session-upgrade" ? "session-upgrade" : auth.reason === "session-expired" ? "session-expired" : null;
      router.replace(reason ? `/login?reason=${reason}` : "/login");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    let active = true;
    void readServerAuthSession()
      .then((auth) => {
        if (!active) return;
        if (auth.status === "authenticated") {
          setSession(auth.session);
          setStatus("authenticated");
          return;
        }
        const reason = auth.reason === "session-upgrade" ? "session-upgrade" : auth.reason === "session-expired" ? "session-expired" : null;
        router.replace(reason ? `/login?reason=${reason}` : "/login");
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const handleInvalidSession = () => router.replace("/login?reason=session-expired");
    window.addEventListener(getAuthInvalidEventName(), handleInvalidSession);
    return () => window.removeEventListener(getAuthInvalidEventName(), handleInvalidSession);
  }, [router]);

  if (status === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#F7F8FB] text-sm text-slate-600">
        <p>登录状态检查失败，请确认网络后重试。</p>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium" onClick={() => void retrySession()} type="button">重新检查</button>
      </div>
    );
  }

  if (status !== "authenticated" || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F8FB] text-sm text-slate-500">
        正在检查登录状态...
      </div>
    );
  }

  if (chromeless) {
    return children;
  }

  return <AppShell session={session}>{children}</AppShell>;
}
