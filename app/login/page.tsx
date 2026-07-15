import { Sparkles } from "lucide-react";

import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#050812] text-white">
      <div className="absolute inset-0 bg-[url('/mock-assets/login-academy-portal.png')] bg-cover bg-[35%_center]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,18,0.22)_0%,rgba(5,8,18,0.58)_48%,rgba(5,8,18,0.96)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,18,0.16)_0%,rgba(5,8,18,0.28)_55%,rgba(5,8,18,0.8)_100%)]" />

      <div className="relative grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px]">
        <section className="flex min-h-[46dvh] flex-col justify-between px-6 py-7 sm:px-10 lg:min-h-dvh lg:px-14 lg:py-12 xl:px-16">
          <div className="flex items-center gap-3 text-sm font-semibold text-white">
            <span className="flex size-10 items-center justify-center rounded-lg border border-white/14 bg-white/8 text-white shadow-[0_12px_34px_rgba(37,99,235,0.22)]">
              <Sparkles className="size-5" />
            </span>
            Kaleido Concepts
          </div>

          <div className="max-w-[620px] pb-10 lg:pb-4">
            <h1 className="text-balance text-5xl font-semibold leading-none text-white sm:text-6xl lg:text-7xl">
              万象为镜，照见奇思。
            </h1>
            <p className="mt-6 text-xl font-medium leading-8 text-white/84 sm:text-2xl">
              AI 定制互动绘本英语项目
            </p>
          </div>
        </section>

        <section className="relative flex items-center justify-center overflow-hidden border-t border-white/10 bg-[#070B16]/94 px-5 py-8 backdrop-blur-md lg:border-l lg:border-t-0 lg:px-10">
          <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="absolute left-0 top-16 hidden h-28 w-px bg-gradient-to-b from-transparent via-[#26D7FF]/70 to-transparent lg:block" />
          <div className="relative w-full max-w-[420px]">
            <div className="mb-8 lg:hidden">
              <p className="text-sm font-semibold text-white">Kaleido Concepts</p>
              <p className="mt-3 text-2xl font-semibold leading-tight text-white">万象为镜，照见奇思。</p>
              <p className="mt-2 text-sm text-white/64">AI 定制互动绘本英语项目</p>
            </div>

            <div className="mb-7 text-center">
              <p className="font-serif text-3xl leading-none tracking-[0.02em] text-white sm:text-[2.15rem]">
                Kaleido Concepts
              </p>
              <div className="mx-auto mt-4 h-px w-20 bg-gradient-to-r from-transparent via-[#26D7FF]/80 to-transparent" />
            </div>

            <div className="rounded-lg border border-white/12 bg-white/[0.04] p-2 shadow-[0_32px_90px_rgba(2,6,23,0.52)]">
              <div className="rounded-md border border-white/8 bg-white p-8 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-9">
                <LoginForm />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
