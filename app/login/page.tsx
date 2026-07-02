import { Sparkles } from "lucide-react";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#F7F8FB] p-6">
      <div className="grid min-h-[calc(100dvh-48px)] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden min-h-[720px] overflow-hidden bg-slate-950 lg:block">
          <div className="absolute inset-0 bg-[url('/mock-assets/login-story-world.png')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-950/25 to-violet-950/40" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/80 to-transparent" />

          <div className="relative flex h-full flex-col justify-between p-12 text-white">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                <Sparkles className="size-5" />
              </span>
              Kaleido Concepts
            </div>

            <div className="max-w-xl">
              <h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight">Kaleido Concepts 万象之境</h1>
              <p className="mt-5 text-xl font-medium text-white/90">AI 定制互动绘本英语项目</p>
              <p className="mt-10 text-2xl font-medium leading-relaxed text-white">万象为镜，照见奇思。</p>
              <p className="mt-2 text-lg text-white/75">Where wonders take shape.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-10 lg:hidden">
              <div className="mb-5 flex items-center gap-3 text-lg font-semibold text-slate-950">
                <span className="flex size-9 items-center justify-center rounded-lg bg-violet-600 text-white">
                  <Sparkles className="size-5" />
                </span>
                Kaleido Concepts
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Kaleido Concepts 万象之境</h1>
              <p className="mt-3 text-sm text-slate-500">AI 定制互动绘本英语项目</p>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">登录</h2>
              <p className="mt-3 text-sm text-slate-500">使用教师账号进入课程工作台。</p>
            </div>

            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
