"use client";

import { ClientErrorFallback } from "@/components/client-error-fallback";

export default function GlobalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body>
        <ClientErrorFallback error={error} reset={reset} />
      </body>
    </html>
  );
}
