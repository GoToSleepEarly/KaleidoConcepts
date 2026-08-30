"use client";

import React, { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { GrammarCatalogBrowser } from "@/features/grammar/components/grammar-catalog-browser";
import type { GrammarBookCatalog } from "@/lib/contracts/api";

export function GrammarKnowledgePointPickerDialog({
  books,
  initialBookId,
  initialSelectedIds,
  allowEmpty = false,
  description,
  highlightedIds = [],
  step1SelectedIds,
  aiUnrecommendedIds = [],
  onClose,
  onConfirm,
  title = "选择语法知识点",
}: {
  books: GrammarBookCatalog[];
  initialBookId: string;
  initialSelectedIds: string[];
  allowEmpty?: boolean;
  description?: string;
  highlightedIds?: string[];
  step1SelectedIds?: string[];
  aiUnrecommendedIds?: string[];
  onClose: () => void;
  onConfirm: (value: { bookId: string; selectedIds: string[] }) => void;
  title?: string;
}) {
  const [bookId, setBookId] = useState(initialBookId);
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<"unrecommended" | "more">(aiUnrecommendedIds.length ? "unrecommended" : "more");
  const guided = step1SelectedIds !== undefined;
  const allPointIds = useMemo(() => books.flatMap((book) => book.sections.flatMap((section) => section.points.map((point) => point.id))), [books]);
  const step1IdSet = useMemo(() => new Set(step1SelectedIds ?? []), [step1SelectedIds]);
  const moreIds = useMemo(() => allPointIds.filter((id) => !step1IdSet.has(id)), [allPointIds, step1IdSet]);
  const visiblePointIds = taskView === "unrecommended" ? aiUnrecommendedIds : moreIds;
  const emptyMessage = taskView === "unrecommended" ? "Step 1 选择的知识点均已被 AI 推荐" : "当前语法书没有更多可添加的知识点";

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
      description={description}
      onClose={onClose}
      open
      size="wide"
      title={title}
    >
      <div className="flex h-full min-h-0 flex-col">
        {guided ? (
          <div className="shrink-0 border-b border-border bg-white px-3 py-3 sm:px-4">
            <div aria-label="知识点选择范围" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
              {([
                ["unrecommended", `AI 未推荐 ${aiUnrecommendedIds.length}`],
                ["more", `更多知识点 ${moreIds.length}`],
              ] as const).map(([value, label]) => (
                <button aria-selected={taskView === value} className={taskView === value ? "min-h-11 rounded-md bg-white px-2 text-xs font-semibold text-primary shadow-sm sm:text-sm" : "min-h-11 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-white/70 sm:text-sm"} key={value} onClick={() => setTaskView(value)} role="tab" type="button">{label}</button>
              ))}
            </div>
            {taskView === "more" ? <p className="mt-2 text-pretty text-sm leading-5 text-muted-foreground">仅用于本章，不会修改基础信息。</p> : null}
          </div>
        ) : null}
        <GrammarCatalogBrowser
          activeBookId={bookId}
          books={books}
          emptyMessage={emptyMessage}
          highlightedIds={highlightedIds}
          onActiveBookChange={requestBookChange}
          onSelectedIdsChange={setSelectedIds}
          selectionLabels={guided ? { selected: "已加入本章", unselected: "加入本章" } : undefined}
          selectedIds={selectedIds}
          visiblePointIds={guided ? visiblePointIds : undefined}
        />
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <p className="text-sm text-muted-foreground">已选 <span className="font-semibold text-foreground">{selectedIds.length}</span> 个知识点</p>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="outline">取消</Button>
            <Button disabled={!allowEmpty && !selectedIds.length} onClick={() => onConfirm({ bookId, selectedIds })} type="button">确认选择</Button>
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
