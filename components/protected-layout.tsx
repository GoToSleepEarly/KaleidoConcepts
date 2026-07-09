"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { resolveAuthGuardState } from "@/lib/auth-guard";
import { getAuthSessionChangeEventName, getStoredSession } from "@/lib/auth-session";

function subscribeAuthSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(getAuthSessionChangeEventName(), onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(getAuthSessionChangeEventName(), onStoreChange);
  };
}

function getClientSessionSnapshot() {
  return getStoredSession();
}

function getServerSessionSnapshot() {
  return null;
}

export function ProtectedLayout({ children, chromeless = false }: { children: React.ReactNode; chromeless?: boolean }) {
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

  if (chromeless) {
    return children;
  }

  return <AppShell>{children}</AppShell>;
}
