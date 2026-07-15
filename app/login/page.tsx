import { Sparkles } from "lucide-react";

import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-background p-4 sm:p-8">
      <div className="grid min-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1fr_1fr]">
        <section className="relative hidden min-h-[600px] overflow-hidden lg:block">
          <div className="absolute inset-0 bg-[url('/mock-assets/login-story-world.png')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-br from-foreground/60 via-primary-700/20 to-primary/40" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-foreground/70 to-transparent" />

          <div className="relative flex h-full flex-col justify-between p-10 xl:p-12 text-white">
            <div className="flex items-center gap-3 text-[15px] font-semibold">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <Sparkles className="size-5" />
              </span>
              Kaleido Concepts
            </div>

            <div className="max-w-lg">
              <h1 className="text-balance text-4xl xl:text-5xl font-semibold leading-[1.1] tracking-tight">
                Kaleido Concepts
              </h1>
              <p className="mt-3 text-2xl font-medium text-white/95">万象之境</p>
              <p className="mt-8 text-lg font-medium leading-relaxed text-white/90">
                AI 定制互动绘本英语教学平台
              </p>
              <p className="mt-2 text-base text-white/70">为每位学生生成专属的学习旅程</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-8 lg:p-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <div className="mb-5 flex items-center gap-3 text-[15px] font-semibold text-foreground">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="size-5" />
                </span>
                Kaleido Concepts
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Kaleido Concepts</h1>
              <p className="mt-1 text-sm text-muted-foreground">万象之境 · AI 定制互动绘本</p>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">欢迎回来</h2>
              <p className="mt-2 text-sm text-muted-foreground">使用教师账号登录，开始创建课程。</p>
            </div>

            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
