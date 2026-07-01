import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "PBL Studio",
  description: "AI English picture-book lesson generator for teachers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans antialiased">
        <header className="print-hidden border-b bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Link className="text-lg font-semibold tracking-normal" href="/">
              PBL Studio
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="/students">
                Students
              </Link>
              <Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="/courses">
                Courses
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
