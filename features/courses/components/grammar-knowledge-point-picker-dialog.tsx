"use client";

import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { GrammarCatalogBrowser } from "@/features/grammar/components/grammar-catalog-browser";
import type { GrammarBookCatalog } from "@/lib/contracts/api";

export function GrammarKnowledgePointPickerDialog({
  books,
  initialBookId,
  initialSelectedIds,
  onClose,
  onConfirm,
}: {
  books: GrammarBookCatalog[];
  initialBookId: string;
  initialSelectedIds: string[];
  onClose: () => void;
  onConfirm: (value: { bookId: string; selectedIds: string[] }) => void;
}) {
  const [bookId, setBookId] = useState(initialBookId);
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);

  function requestBookChange(nextBookId: string) {
    if (nextBookId === bookId) return;
    if (selectedIds.length) {
      setPendingBookId(nextBookId);
      return;
    }
    setBookId(nextBookId);
  }

  return (
    <Dialog
      onClose={onClose}
      open
      size="wide"
      title="选择语法知识点"
    >
      <div className="flex h-full min-h-0 flex-col">
        <GrammarCatalogBrowser
          activeBookId={bookId}
          books={books}
          onActiveBookChange={requestBookChange}
          onSelectedIdsChange={setSelectedIds}
          selectedIds={selectedIds}
        />
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <p className="text-sm text-muted-foreground">已选 <span className="font-semibold text-foreground">{selectedIds.length}</span> 个知识点</p>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="outline">取消</Button>
            <Button disabled={!selectedIds.length} onClick={() => onConfirm({ bookId, selectedIds })} type="button">确认选择</Button>
          </div>
        </footer>

        {pendingBookId ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="switch-grammar-book-title">
              <h3 className="text-lg font-semibold" id="switch-grammar-book-title">切换书籍会清空已选知识点</h3>
              <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">当前选择将被清空，是否继续？</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setPendingBookId(null)} type="button" variant="outline">取消</Button>
                <Button onClick={() => { setBookId(pendingBookId); setSelectedIds([]); setPendingBookId(null); }} type="button" variant="destructive">清空并切换</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
