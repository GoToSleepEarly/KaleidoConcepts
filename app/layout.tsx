import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI 绘本课件",
  description: "AI picture-book courseware creation mock frontend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-slate-50 font-sans antialiased">{children}</body>
    </html>
  );
}
