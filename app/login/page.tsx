import React from "react";
import { Sparkles } from "lucide-react";

import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main
      className="relative min-h-dvh overflow-hidden bg-[#EEF6FB]"
      data-testid="login-shell"
    >
      <div
        aria-hidden="true"
        className="login-background pointer-events-none absolute inset-y-0 left-1/2 z-0 w-[min(100vw,177.78dvh)] -translate-x-1/2 bg-[url('/mock-assets/login-learning-lab-v2.png')] bg-cover bg-[42%_center] bg-no-repeat min-[1200px]:bg-center"
        data-testid="login-background"
      />
      <div
        aria-hidden="true"
        className="login-workspace-blur pointer-events-none absolute inset-0 z-0 backdrop-blur-[12px]"
      />
      <div
        aria-hidden="true"
        className="login-transition pointer-events-none absolute inset-0 z-0"
        data-testid="login-transition"
      />

      <div className="relative z-10 grid min-h-dvh grid-cols-[54%_46%] min-[1200px]:grid-cols-[62%_38%]">
        <section aria-label="少儿项目式学习插画" data-testid="login-illustration" />

        <section
          className="flex min-h-dvh min-w-[440px] items-center justify-center px-6 py-3 text-[#17335C] min-[1200px]:px-8"
          data-testid="login-workspace"
        >
          <div className="flex w-full max-w-[420px] flex-col items-center">
            <div className="flex items-center justify-center gap-4 font-bold">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-white text-[#17335C] shadow-[0_2px_8px_rgba(23,51,92,0.12)]">
                <Sparkles aria-hidden="true" className="size-7" />
              </span>
              <span className="text-[2rem] leading-none tracking-[-0.03em]">Kaleido Concepts</span>
            </div>

            <h1 className="mt-6 whitespace-nowrap text-center text-[1.75rem] font-bold leading-[1.08] tracking-[-0.02em] text-[#17335C] min-[1200px]:text-[1.875rem]">
              万象为镜，照见奇思
            </h1>
            <p className="mt-2.5 text-center text-lg font-medium leading-6 text-[#294E75]">
              AI 定制互动绘本英语项目
            </p>

            <div className="mt-5 w-full rounded-xl bg-white p-6 text-slate-950 shadow-[0_8px_24px_rgba(34,77,111,0.16)] min-[1200px]:p-7 min-[1440px]:mt-7 min-[1440px]:p-8">
              <LoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
