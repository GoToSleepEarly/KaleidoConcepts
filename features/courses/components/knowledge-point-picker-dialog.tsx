"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type KnowledgePointPickerOption = {
  id: string;
  label: string;
  labelZh?: string;
  category?: string;
};

export function KnowledgePointPickerDialog({ description, highlightedIds = [], knowledgePoints, onClose, onConfirm, selectedIds, title }: {
  description: string;
  highlightedIds?: string[];
  knowledgePoints: KnowledgePointPickerOption[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  selectedIds: string[];
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const categories = useMemo(() => [...new Set(knowledgePoints.map((item) => item.category || "未分类"))], [knowledgePoints]);
  const highlightedCategory = "已选但 AI 未推荐";
  const [activeCategory, setActiveCategory] = useState("全部");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = knowledgePoints.filter((item) => {
    const category = item.category || "未分类";
    const categoryMatches = Boolean(normalizedQuery)
      || activeCategory === "全部"
      || (activeCategory === highlightedCategory ? highlightedIds.includes(item.id) : category === activeCategory);
    return categoryMatches && `${item.labelZh ?? ""} ${item.label} ${category}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
  });

  return (
    <Dialog description={description} onClose={onClose} open title={title}>
      <div className="flex max-h-[70dvh] min-h-[500px] flex-col max-sm:h-[calc(100dvh-6rem)] max-sm:max-h-none max-sm:min-h-0">
        <div className="border-b border-border p-4">
          <div aria-label="知识点类别" className="mb-3 flex gap-1 overflow-x-auto rounded-md bg-muted p-1" role="tablist">
            {["全部", ...(highlightedIds.length ? [highlightedCategory] : []), ...categories].map((category) => <button aria-selected={activeCategory === category} className={cn("min-h-9 shrink-0 rounded px-3 text-sm font-medium transition-colors", activeCategory === category ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} key={category} onClick={() => { setActiveCategory(category); setQuery(""); }} role="tab" type="button">{category}</button>)}
          </div>
          <label className="relative block">
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">搜索语法点</span>
            <input aria-label="搜索语法点" autoFocus className="min-h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文名或分类" role="searchbox" value={query} />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((item) => {
              const active = selected.has(item.id);
              return <button aria-pressed={active} className={cn("min-h-14 rounded-md border px-3 py-2 text-left transition-colors", active ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background hover:border-primary-300")} key={item.id} onClick={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} type="button"><span className="block text-sm font-medium">{item.labelZh ?? item.label}</span>{item.labelZh ? <span className="mt-0.5 block text-xs opacity-70">{item.label}</span> : null}</button>;
            })}
          </div>
          {!filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">没有匹配的知识点</p> : null}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="text-sm text-muted-foreground">已选择 {selected.size} 个</span>
          <div className="flex gap-2"><Button onClick={onClose} type="button" variant="outline">取消</Button><Button onClick={() => onConfirm([...selected])} type="button">确认选择</Button></div>
        </div>
      </div>
    </Dialog>
  );
}
