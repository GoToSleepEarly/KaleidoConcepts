"use client";

import React from "react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readServerAuthSession } from "@/lib/auth-client";

function authNotice(reason: string | null) {
  if (reason === "session-upgrade") return "登录安全已升级，请重新登录一次，课程数据不会受到影响。";
  if (reason === "session-expired") return "登录状态已失效，请重新登录后继续。";
  return "";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("teacher");
  const [password, setPassword] = useState("123456");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const recoveryRequested = searchParams.has("recovery");
  const [notice, setNotice] = useState(() => authNotice(searchParams.get("reason")));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (recoveryRequested) return;
    let active = true;
    void readServerAuthSession()
      .then((state) => {
        if (!active) return;
        if (state.status === "authenticated") router.replace("/courses");
        else setNotice(authNotice(state.reason));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [recoveryRequested, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, remember }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        setError(result.message || (response.status === 401 ? "账号或密码错误" : "登录服务暂不可用，请稍后重试"));
        return;
      }

      let sessionState;
      try {
        sessionState = await readServerAuthSession();
      } catch {
        setError("账号验证已通过，但登录状态确认失败。请检查网络后重试；若持续失败，请联系管理员。");
        return;
      }
      if (sessionState.status !== "authenticated") {
        setError("账号验证已通过，但浏览器未建立登录会话。请联系管理员检查 HTTP Cookie 配置。");
        return;
      }
      router.replace("/courses");
    } catch {
      setError("登录服务暂不可用，请检查网络后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-900" htmlFor="username">
          账号
        </label>
        <div className="relative">
          <UserRound
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500"
            data-testid="username-icon"
          />
          <Input
            id="username"
            onChange={(event) => setUsername(event.target.value)}
            value={username}
            autoComplete="username"
            className="h-12 pl-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-900" htmlFor="password">
          密码
        </label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500"
            data-testid="password-icon"
          />
          <Input
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            className="h-12 pl-11 pr-11"
          />
          <button
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-200 hover:text-slate-700"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          checked={remember}
          className="size-4 rounded border-slate-300 text-[#3147FF] focus:ring-[#3147FF] focus:ring-offset-0"
          onChange={(event) => setRemember(event.target.checked)}
          type="checkbox"
        />
        记住我
      </label>

      {notice ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <Button className="h-12 w-full bg-[#3147FF] hover:bg-[#2637CC] active:bg-[#1F2EA8]" loading={isSubmitting} size="lg" type="submit">
        登录
      </Button>
    </form>
  );
}
