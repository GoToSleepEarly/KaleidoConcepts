"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { resolveAuthGuardState } from "@/lib/auth-guard";
import { getStoredSession } from "@/lib/auth-session";

function subscribeAuthSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
  };
}

function getClientSessionSnapshot() {
  return getStoredSession();
}

function getServerSessionSnapshot() {
  return null;
}

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSyncExternalStore(subscribeAuthSession, getClientSessionSnapshot, getServerSessionSnapshot);
  const authState = resolveAuthGuardState(session);

  useEffect(() => {
    if (authState.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [authState.status, router]);

  if (authState.status === "unauthenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F8FB] text-sm text-slate-500">
        正在检查登录状态...
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
