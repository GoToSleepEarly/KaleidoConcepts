"use client";

import React, { useEffect, useState } from "react";

import {
  clearStoredAuthState,
  createClientErrorReportId,
  sendClientErrorReport,
} from "@/lib/client-error-report";

type ErrorWithDigest = Error & { digest?: string };

export function ClientErrorFallback({ error }: { error: ErrorWithDigest; reset?: () => void }) {
  const [reportId] = useState(() => createClientErrorReportId());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    sendClientErrorReport({
      digest: error.digest,
      message: error.message || error.name,
      stack: error.stack,
      type: "error-boundary",
    }, reportId);
  }, [error, reportId]);

  function reloadPage() {
    const url = new URL(window.location.href);
    url.searchParams.set("__retry", Date.now().toString());
    window.location.replace(url.toString());
  }

  function clearAndRetry() {
    clearStoredAuthState();
    window.location.replace(`/login?recovery=${encodeURIComponent(reportId)}`);
  }

  async function copyReportId() {
    try {
      await navigator.clipboard.writeText(reportId);
      setCopied(true);
      return;
    } catch {
      const input = document.createElement("textarea");
      input.value = reportId;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const succeeded = typeof document.execCommand === "function" && document.execCommand("copy");
      input.remove();
      setCopied(succeeded);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F7F8FB] px-6 py-10 text-foreground">
      <section aria-labelledby="client-error-title" className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-md sm:p-8" role="alert">
        <p className="text-sm font-semibold text-red-600">页面暂时无法使用</p>
        <h1 className="mt-2 text-2xl font-bold" id="client-error-title">页面加载失败</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          请先重新加载页面。如果仍然失败，请把下面的错误编号发给管理员。
        </p>

        <div className="mt-5 rounded-lg bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">错误编号</p>
          <code className="mt-1 block select-all break-all text-sm font-semibold text-foreground">{reportId}</code>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={reloadPage} type="button">
            重新加载页面
          </button>
          <button className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={clearAndRetry} type="button">
            清除登录状态并重试
          </button>
        </div>

        <button className="mt-4 min-h-10 w-full rounded-lg px-4 text-sm font-medium text-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => void copyReportId()} type="button">
          {copied ? "错误编号已复制" : "复制错误编号"}
        </button>
      </section>
    </main>
  );
}
