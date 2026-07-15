"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredSession, saveAuthSession, type MockSession } from "@/lib/auth-session";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("teacher");
  const [password, setPassword] = useState("123456");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getStoredSession()) {
      router.replace("/courses");
    }
  }, [router]);

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
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("账号或密码错误");
        return;
      }

      const session = (await response.json()) as MockSession;
      saveAuthSession(session, remember);
      router.replace("/courses");
    } catch {
      setError("账号或密码错误");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-800" htmlFor="username">
          账号
        </label>
        <Input
          id="username"
          onChange={(event) => setUsername(event.target.value)}
          value={username}
          autoComplete="username"
          className="h-12"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-800" htmlFor="password">
          密码
        </label>
        <div className="relative">
          <Input
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            className="h-12 pr-11"
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

      {error ? (
        <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Button className="h-12 w-full bg-[#3147FF] hover:bg-[#2637CC] active:bg-[#1F2EA8]" loading={isSubmitting} size="lg" type="submit">
        登录
      </Button>
    </form>
  );
}
