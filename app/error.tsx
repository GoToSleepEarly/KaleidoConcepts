"use client";

import { ClientErrorFallback } from "@/components/client-error-fallback";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ClientErrorFallback error={error} reset={reset} />;
}
