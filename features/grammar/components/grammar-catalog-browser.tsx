"use client";

import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";

import { GrammarUnitSummary } from "@/features/grammar/components/grammar-unit-summary";
import type { GrammarBookCatalog, GrammarCatalogPoint } from "@/lib/contracts/api";
import { matchesGrammarPoint, unitRangeLabel } from "@/lib/domain/grammar-catalog";
import { cn } from "@/lib/utils";

type CatalogBrowserProps = {
  books: GrammarBookCatalog[];
  activeBookId: string;
  onActiveBookChange: (bookId: string) => void;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  highlightedIds?: string[];
  visiblePointIds?: string[];
  emptyMessage?: string;
  pointDescriptions?: Record<string, string>;
  selectionLabels?: { selected: string; unselected: string };
  compactExpandableDetails?: boolean;
  defaultExpandFirstDetails?: boolean;
};

function pointMap(book: GrammarBookCatalog | undefined) {
  return new Map(book?.sections.flatMap((section) => section.points).map((point) => [point.id, point]) ?? []);
}

function grammarRules(point: GrammarCatalogPoint) {
  return point.units.flatMap((unit) => unit.learningContents ?? []);
}

function GrammarRuleList({ rules, className }: { rules: string[]; className?: string }) {
  return <span className={cn("grid gap-1 text-xs font-normal leading-5 text-[#526B84]", className)}>{rules.map((rule) => <span className="flex gap-2" key={rule}><span aria-hidden className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-[#7A88EF]" />{rule}</span>)}</span>;
}

export function GrammarCatalogBrowser({ books, activeBookId, onActiveBookChange, selectedIds, onSelectedIdsChange, highlightedIds = [], visiblePointIds, emptyMessage = "当前书籍没有匹配的知识点", pointDescriptions = {}, selectionLabels, compactExpandableDetails = false, defaultExpandFirstDetails = false }: CatalogBrowserProps) {
  const selectable = Boolean(onSelectedIdsChange);
  const activeBook = books.find((book) => book.id === activeBookId) ?? books[0];
  const [activeSectionId, setActiveSectionId] = useState(activeBook?.sections[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [mobileView, setMobileView] = useState<"browse" | "selected">("browse");
  const [expandedBrowseId, setExpandedBrowseId] = useState<string | null>(() => compactExpandableDetails && defaultExpandFirstDetails
    ? activeBook?.sections.flatMap((section) => section.points).find((point) => grammarRules(point).length)?.id ?? null
    : null);
  const [expandedSelectedId, setExpandedSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const highlighted = useMemo(() => new Set(highlightedIds), [highlightedIds]);
  const visiblePointIdSet = useMemo(() => visiblePointIds === undefined ? null : new Set(visiblePointIds), [visiblePointIds]);
  const points = useMemo(() => pointMap(activeBook), [activeBook]);

  const scopedSections = useMemo(() => activeBook?.sections
    .map((section) => ({ ...section, points: visiblePointIdSet ? section.points.filter((point) => visiblePointIdSet.has(point.id)) : section.points }))
    .filter((section) => section.points.length) ?? [], [activeBook, visiblePointIdSet]);
  const resolvedSectionId = scopedSections.some((section) => section.id === activeSectionId) ? activeSectionId : scopedSections[0]?.id ?? activeBook?.sections[0]?.id ?? "";

  const normalizedQuery = query.trim();
  const visibleSections = useMemo(() => {
    if (!activeBook) return [];
    if (normalizedQuery) {
      return scopedSections
        .map((section) => ({ ...section, points: section.points.filter((point) => matchesGrammarPoint(point, normalizedQuery)) }))
        .filter((section) => section.points.length);
    }
    const active = scopedSections.find((section) => section.id === resolvedSectionId);
    return active ? [active] : scopedSections.slice(0, 1);
  }, [activeBook, scopedSections, resolvedSectionId, normalizedQuery]);

  const selectedPoints = (selectedIds ?? []).map((id) => points.get(id)).filter((point): point is GrammarCatalogPoint => Boolean(point));

  function togglePoint(id: string) {
    if (!onSelectedIdsChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange([...next]);
  }

  if (!activeBook) return <p className="py-12 text-center text-sm text-muted-foreground">语法目录暂不可用</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-[#CCD8F8] bg-white px-3 pt-3 sm:px-4 sm:pt-4">
        <div aria-label="Grammar in Use 书籍" className="flex gap-1.5 overflow-x-auto rounded-xl border border-[#CCD8F8] bg-[#E9EEFF] p-1.5 shadow-sm" role="tablist">
          {books.map((book) => (
            <button
              aria-selected={book.id === activeBook.id}
              className={cn("min-h-14 shrink-0 rounded-lg px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC] focus-visible:ring-offset-2", book.id === activeBook.id ? "bg-[#5365EC] text-white shadow-sm" : "text-[#30459E] hover:bg-white/75 hover:text-[#20327F]")}
              key={book.id}
              onClick={() => { setActiveSectionId(book.sections[0]?.id ?? ""); setQuery(""); setMobileView("browse"); onActiveBookChange(book.id); }}
              role="tab"
              type="button"
            >
              <span className="block text-sm font-bold">《{book.title}》</span>
              <span className="block text-xs font-medium opacity-75">{book.edition} · {book.officialLevel}</span>
            </button>
          ))}
        </div>
        <div className="-mx-3 mt-3 flex flex-wrap gap-2 border-t border-[#DCEAF6] bg-white px-3 py-3 sm:-mx-4 sm:flex-nowrap sm:px-4">
          {selectable ? (
            <div className="flex shrink-0 rounded-lg border border-[#CCD8F8] bg-[#E9EEFF] p-1 xl:hidden">
              <button className={cn("min-h-10 rounded-md px-3 text-sm font-semibold", mobileView === "browse" ? "bg-[#5365EC] text-white shadow-sm" : "text-[#30459E]")} onClick={() => setMobileView("browse")} type="button">浏览</button>
              <button className={cn("min-h-10 rounded-md px-3 text-sm font-semibold", mobileView === "selected" ? "bg-[#5365EC] text-white shadow-sm" : "text-[#30459E]")} onClick={() => setMobileView("selected")} type="button">已选 {selected.size}</button>
            </div>
          ) : null}
          <label className={cn("relative block min-w-0 flex-1", mobileView === "selected" && "max-xl:hidden")}>
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7890A7]" />
            <span className="sr-only">搜索当前书籍</span>
            <input aria-label="搜索当前书籍" className="min-h-11 w-full rounded-lg border border-[#D7E5F1] bg-white pl-9 pr-3 text-base text-[#19324D] outline-none placeholder:text-[#7890A7] focus:border-[#7A88EF] focus:ring-2 focus:ring-[#DDE2FF] sm:text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Unit 或语法要点" type="search" value={query} />
          </label>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 md:grid md:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_250px]", !selectable && "xl:grid-cols-[220px_minmax(0,1fr)]")}>
        <aside className={cn("hidden min-h-0 overflow-y-auto border-r border-[#CCD8F8] bg-[#F8FAFF] p-3 md:block", mobileView === "selected" && "max-xl:hidden")}>
          <p className="px-2 pb-2 text-xs font-bold text-[#69829B]">目录章节</p>
          <nav className="space-y-1" aria-label="语法 Section">
            {scopedSections.map((section) => (
              <button className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC]", section.id === resolvedSectionId && !normalizedQuery ? "bg-[#5365EC] font-bold text-white shadow-sm" : "text-[#526B84] hover:bg-[#E9EEFF] hover:text-[#30459E]")} key={section.id} onClick={() => { setActiveSectionId(section.id); setQuery(""); }} type="button"><span className="min-w-0 flex-1">{section.officialTitle}</span><ChevronRight aria-hidden className="size-4 shrink-0 opacity-70" /></button>
            ))}
          </nav>
        </aside>

        <main className={cn("min-h-0 overflow-y-auto p-3 sm:p-4", mobileView === "selected" && "max-xl:hidden")}>
          <label className="mb-3 block md:hidden">
            <span className="sr-only">选择 Section</span>
            <select aria-label="选择 Section" className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground sm:text-sm" onChange={(event) => { setActiveSectionId(event.target.value); setQuery(""); }} value={resolvedSectionId}>
              {scopedSections.map((section) => <option key={section.id} value={section.id}>{section.officialTitle}</option>)}
            </select>
          </label>
          <div className="space-y-5">
            {visibleSections.map((section) => (
              <section key={section.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-[#19324D]">{section.officialTitle}</h3>
                  <span className="rounded-full bg-[#E9EEFF] px-2.5 py-1 text-xs font-semibold text-[#4659DC]">{section.points.length} 个知识点</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#DCEAF6] bg-white">
                  {section.points.map((point) => {
                    const active = selected.has(point.id);
                    const rules = grammarRules(point);
                    const expanded = compactExpandableDetails && expandedBrowseId === point.id;
                    const accessibleName = `${unitRangeLabel(point)} · ${point.title}`;
                    return (
                      <div className="border-b border-[#DCEAF6] last:border-b-0" key={point.id}>
                        <div className={cn("flex min-h-14 items-stretch transition-colors hover:bg-[#F8FAFF]", active && "bg-[#EEF0FF] hover:bg-[#EEF0FF]")}>
                          <button aria-label={selectable ? `${active ? "取消选择" : "选择"} ${unitRangeLabel(point)} ${point.title}` : `${unitRangeLabel(point)} ${point.title}`} aria-pressed={selectable ? active : undefined} className={cn("flex min-w-0 flex-1 gap-2 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC] focus-visible:ring-inset sm:gap-3 sm:px-4", compactExpandableDetails ? "items-center py-2" : "items-start py-3", selectable ? "cursor-pointer" : "cursor-default")} disabled={!selectable} onClick={() => togglePoint(point.id)} type="button">
                            {selectable ? <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded border", active ? "border-[#5365EC] bg-[#5365EC] text-white" : "border-[#B8CADD] bg-white")}>{active ? <Check className="size-3.5" /> : null}</span> : null}
                            <span className="w-12 shrink-0 text-xs font-semibold text-[#69829B] sm:w-24">{unitRangeLabel(point)}</span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block text-sm font-semibold leading-5 text-[#19324D]", compactExpandableDetails && "truncate")} title={compactExpandableDetails ? point.title : undefined}>{point.title}</span>
                              {!compactExpandableDetails && rules.length ? <span className="mt-2 block"><span className="mb-1 block text-[11px] font-semibold text-[#69829B]">语法要点</span><GrammarRuleList rules={rules} /></span> : null}
                              {pointDescriptions[point.id] ? <span className="mt-0.5 block text-xs leading-5 text-[#69829B]">{pointDescriptions[point.id]}</span> : null}
                              {selectionLabels ? <span className={cn("mt-0.5 block text-xs font-semibold", active ? "text-[#4659DC]" : "text-[#526B84]")}>{active ? selectionLabels.selected : selectionLabels.unselected}</span> : null}
                            </span>
                            {!selectionLabels && highlighted.has(point.id) ? <span className="hidden shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success sm:inline">尚未分配</span> : null}
                          </button>
                          {compactExpandableDetails && rules.length ? <button aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}列表中 ${accessibleName} 的语法要点`} className="flex min-w-12 shrink-0 items-center justify-center border-l border-[#DCEAF6] text-[#526B84] hover:bg-[#E9EEFF] hover:text-[#30459E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC] focus-visible:ring-inset" onClick={() => setExpandedBrowseId(expanded ? null : point.id)} title={expanded ? "收起语法要点" : "展开语法要点"} type="button"><ChevronDown aria-hidden className={cn("size-4 transition-transform", expanded && "rotate-180")} /></button> : null}
                        </div>
                        {expanded ? <div className="border-t border-[#DCEAF6] bg-[#F8FAFF] px-4 py-3 pl-8 sm:pl-10"><GrammarRuleList rules={rules} /></div> : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {!visibleSections.length ? <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div> : null}
          </div>
        </main>

        {selectable ? (
          <aside className={cn("min-h-0 overflow-y-auto border-l border-border bg-card p-3 sm:p-4", mobileView === "browse" && "max-xl:hidden")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">已选知识点</h3>
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">{selectedPoints.length}</span>
            </div>
            <div className="space-y-2">
              {selectedPoints.map((point) => compactExpandableDetails ? (() => {
                const expanded = expandedSelectedId === point.id;
                const rules = grammarRules(point);
                const accessibleName = `${unitRangeLabel(point)} · ${point.title}`;
                return <div className="overflow-hidden rounded-lg border border-border bg-card" data-layout="single-line" data-testid={`selected-grammar-point-${point.id}`} key={point.id}>
                  <div className="flex min-h-11 items-center gap-1">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-sm leading-5 text-foreground">
                      <span className="min-w-0 flex-1 truncate" title={point.title}>{point.title}</span>
                      <span aria-hidden className="shrink-0 text-xs font-semibold text-muted-foreground">· {unitRangeLabel(point)}</span>
                    </span>
                    {rules.length ? <button aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}已选知识点 ${accessibleName} 的语法要点`} className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setExpandedSelectedId(expanded ? null : point.id)} title={expanded ? "收起语法要点" : "展开语法要点"} type="button"><ChevronDown aria-hidden className={cn("size-4 transition-transform", expanded && "rotate-180")} /></button> : null}
                    <button aria-label={`移除 ${accessibleName}`} className="flex min-h-11 shrink-0 items-center px-2 text-xs text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => togglePoint(point.id)} type="button">移除</button>
                  </div>
                  {expanded ? <div className="border-t border-border bg-muted/35 px-3 py-2.5"><GrammarRuleList rules={rules} /></div> : null}
                </div>;
              })() : (
                <GrammarUnitSummary
                  action={<button aria-label={`移除 ${unitRangeLabel(point)} · ${point.title}`} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => togglePoint(point.id)} type="button"><X aria-hidden className="size-4" /></button>}
                  className="rounded-lg border border-border bg-card"
                  expanded={expandedSelectedId === point.id}
                  key={point.id}
                  onExpandedChange={(expanded) => setExpandedSelectedId(expanded ? point.id : null)}
                  rules={grammarRules(point)}
                  testId={`selected-grammar-point-${point.id}`}
                  title={point.title}
                  unitLabel={unitRangeLabel(point)}
                />
              ))}
              {!selectedPoints.length ? <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">尚未选择知识点</div> : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
