import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kaleido Concepts",
  description: "AI 定制互动绘本英语项目",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-[#F7F8FB] font-sans antialiased">{children}</body>
    </html>
  );
}
