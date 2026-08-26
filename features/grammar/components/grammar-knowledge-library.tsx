"use client";

import React, { useEffect, useState } from "react";
import type { GrammarCatalogResponse } from "@/lib/contracts/api";
import { GrammarCatalogBrowser } from "@/features/grammar/components/grammar-catalog-browser";

const sessionKey = "pblstudio:last-grammar-book";

export function GrammarKnowledgeLibrary() {
  const [catalog, setCatalog] = useState<GrammarCatalogResponse | null>(null);
  const [activeBookId, setActiveBookId] = useState("english-grammar-in-use-5");
  const [error, setError] = useState("");

  useEffect(() => {
    const remembered = window.sessionStorage.getItem(sessionKey);
    void fetch("/api/grammar/catalog", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as GrammarCatalogResponse & { message?: string };
        if (!response.ok || !data.books?.length) throw new Error(data.message || "语法知识库加载失败");
        setCatalog(data);
        setActiveBookId(remembered && data.books.some((book) => book.id === remembered) ? remembered : "english-grammar-in-use-5");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "语法知识库加载失败"));
  }, []);

  function changeBook(bookId: string) {
    setActiveBookId(bookId);
    window.sessionStorage.setItem(sessionKey, bookId);
  }

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700">{error}</div>;
  if (!catalog) return <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">正在加载 Grammar in Use 目录...</div>;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 className="text-balance text-lg font-bold text-foreground">语法知识库</h2>
      </div>
      <div className="flex h-[calc(100dvh-190px)] min-h-[520px] max-h-[820px] flex-col max-sm:h-[calc(100dvh-150px)] max-sm:min-h-[480px]">
        <GrammarCatalogBrowser activeBookId={activeBookId} books={catalog.books} onActiveBookChange={changeBook} />
      </div>
    </section>
  );
}
