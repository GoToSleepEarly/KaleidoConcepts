"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getStoredSession, saveAuthSession, type MockSession } from "@/lib/auth-session";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("teacher");
  const [password, setPassword] = useState("123456");
  const [remember, setRemember] = useState(false);
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
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="username">
          账号
        </label>
        <input
          className="h-11 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          id="username"
          onChange={(event) => setUsername(event.target.value)}
          value={username}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          密码
        </label>
        <div className="relative">
          <input
            className="h-11 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 pr-11 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            value={password}
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

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          checked={remember}
          className="size-4 rounded border-[#E5E7EB] accent-violet-600"
          onChange={(event) => setRemember(event.target.checked)}
          type="checkbox"
        />
        记住我
      </label>

      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}

      <Button className="h-11 w-full bg-violet-600 text-white hover:bg-violet-700" disabled={isSubmitting} type="submit">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        登录
      </Button>
    </form>
  );
}
