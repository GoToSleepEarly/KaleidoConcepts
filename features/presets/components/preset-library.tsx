"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, Plus, Search, Tags, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { PresetKind, PresetOption } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type PresetLibraryProps = { kind: PresetKind };

type CopyConfig = {
  description: string;
  addLabel: string;
  emptyTitle: string;
  emptyHint: string;
  labelField: string;
  labelPlaceholder: string;
  categoryField: string;
  categoryPlaceholder: string;
  searchLabel: string;
  fixedCategory?: string;
};

const copyByKind: Record<PresetKind, CopyConfig> = {
  theme: {
    description: "按大类维护主题方向，帮助老师快速生成不同的故事目标。",
    addLabel: "新增主题方向",
    emptyTitle: "还没有主题方向",
    emptyHint: "新增主题大类和主题方向后，即可在故事大纲中选择。",
    labelField: "主题方向名称",
    labelPlaceholder: "如：机器人",
    categoryField: "主题大类",
    categoryPlaceholder: "如：科学与未来",
    searchLabel: "搜索主题库",
  },
  story_type: {
    description: "维护随机灵感可选择的故事类型，也允许老师在 Step2 临时自定义。",
    addLabel: "新增故事类型",
    emptyTitle: "还没有故事类型",
    emptyHint: "新增后即可在随机灵感中选择。",
    labelField: "故事类型名称",
    labelPlaceholder: "如：历史穿越",
    categoryField: "所属分类",
    categoryPlaceholder: "故事类型",
    searchLabel: "搜索故事类型",
    fixedCategory: "故事类型",
  },
  story_tone: {
    description: "维护随机灵感可选择的故事氛围，也允许老师在 Step2 临时自定义。",
    addLabel: "新增故事氛围",
    emptyTitle: "还没有故事氛围",
    emptyHint: "新增后即可在随机灵感中选择。",
    labelField: "故事氛围名称",
    labelPlaceholder: "如：奇妙梦幻",
    categoryField: "所属分类",
    categoryPlaceholder: "故事氛围",
    searchLabel: "搜索故事氛围",
    fixedCategory: "故事氛围",
  },
  grammar: {
    description: "维护课程可选择的语法点，支持按中文或英文名称快速查找。",
    addLabel: "新增语法点",
    emptyTitle: "还没有语法点",
    emptyHint: "新增语法点后，即可在课程中选择。",
    labelField: "英文名称",
    labelPlaceholder: "如：Past Simple",
    categoryField: "语法分类",
    categoryPlaceholder: "如：时态",
    searchLabel: "搜索语法库",
  },
};

const UNCATEGORIZED = "未分类";
const ALL_CATEGORIES = "全部";
const CATEGORIES_PER_PAGE = 5;

type FormState = { label: string; labelZh: string; category: string };
type CategoryMode = "existing" | "new";
const emptyForm: FormState = { label: "", labelZh: "", category: "" };

const themeLibrarySections: Array<{ kind: "theme" | "story_type" | "story_tone"; label: string }> = [
  { kind: "theme", label: "主题灵感" },
  { kind: "story_type", label: "故事类型" },
  { kind: "story_tone", label: "故事氛围" },
];

export function ThemePresetLibrary() {
  const [kind, setKind] = useState<(typeof themeLibrarySections)[number]["kind"]>("theme");
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex rounded-xl border border-[#CCD8F8] bg-[#E9EEFF] p-1.5 shadow-sm" role="tablist" aria-label="主题库内容">
        {themeLibrarySections.map((section) => <button aria-selected={kind === section.kind} className={cn("min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC] focus-visible:ring-offset-2", kind === section.kind ? "bg-[#5365EC] text-white shadow-sm" : "text-[#30459E] hover:bg-white/75 hover:text-[#20327F]")} key={section.kind} onClick={() => setKind(section.kind)} role="tab" type="button">{section.label}</button>)}
      </div>
      <PresetLibrary key={kind} kind={kind} />
    </div>
  );
}

export function PresetLibrary({ kind }: PresetLibraryProps) {
  const copy = copyByKind[kind];
  const isFlatKind = Boolean(copy.fixedCategory);
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [page, setPage] = useState(1);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetOption | null>(null);
  const [presetToDelete, setPresetToDelete] = useState<PresetOption | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("existing");
  const [error, setError] = useState("");

  async function loadPresets() {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/presets?kind=${kind}`);
      if (!response.ok) throw new Error("预设加载失败");
      const data = (await response.json()) as { presets: PresetOption[] };
      setPresets(data.presets);
    } catch {
      setLoadError("预设加载失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialPresets() {
      try {
        const response = await fetch(`/api/presets?kind=${kind}`);
        if (!response.ok) throw new Error("预设加载失败");
        const data = (await response.json()) as { presets: PresetOption[] };
        if (active) setPresets(data.presets);
      } catch {
        if (active) setLoadError("预设加载失败，请稍后重试。");
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadInitialPresets();
    return () => { active = false; };
  }, [kind]);

  const categories = useMemo(() => [...new Set(presets.map((preset) => preset.category ?? UNCATEGORIZED))], [presets]);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filteredPresets = useMemo(() => presets.filter((preset) => {
    const category = preset.category ?? UNCATEGORIZED;
    const categoryMatches = Boolean(normalizedQuery) || activeCategory === ALL_CATEGORIES || activeCategory === category;
    const queryMatches = !normalizedQuery || `${preset.labelZh ?? ""} ${preset.label} ${category}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    return categoryMatches && queryMatches;
  }), [activeCategory, normalizedQuery, presets]);

  const groups = useMemo(() => {
    const map = new Map<string, PresetOption[]>();
    filteredPresets.forEach((preset) => {
      const category = preset.category ?? UNCATEGORIZED;
      map.set(category, [...(map.get(category) ?? []), preset]);
    });
    return [...map.entries()].map(([category, items]) => ({ category, items }));
  }, [filteredPresets]);
  const totalPages = Math.max(1, Math.ceil(groups.length / CATEGORIES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleGroups = activeCategory === ALL_CATEGORIES || normalizedQuery
    ? groups.slice((currentPage - 1) * CATEGORIES_PER_PAGE, currentPage * CATEGORIES_PER_PAGE)
    : groups;

  function openCreateDrawer() {
    setEditingPreset(null);
    const selectedCategory = copy.fixedCategory ?? (activeCategory === ALL_CATEGORIES ? "" : activeCategory);
    setForm({ ...emptyForm, category: selectedCategory });
    setCategoryMode(selectedCategory || categories.length ? "existing" : "new");
    setError("");
    setIsDrawerOpen(true);
  }

  function openEditDrawer(preset: PresetOption) {
    setEditingPreset(preset);
    setForm({ label: preset.label, labelZh: preset.labelZh ?? "", category: preset.category ?? "" });
    setCategoryMode(categories.includes(preset.category ?? "") ? "existing" : "new");
    setError("");
    setIsDrawerOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.label.trim()) return setError(`请填写${copy.labelField}`);
    if (kind === "grammar" && !form.labelZh.trim()) return setError("请填写中文名称");
    if (!form.category.trim()) return setError(`请填写${copy.categoryField}`);

    setError("");
    setIsSaving(true);
    try {
      const targetPreset = editingPreset;
      const response = await fetch(targetPreset ? `/api/presets/${targetPreset.id}` : "/api/presets", {
        method: targetPreset ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          label: form.label.trim(),
          ...(kind === "grammar" ? { labelZh: form.labelZh.trim() } : {}),
          category: form.category.trim(),
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "预设保存失败");
      }
      const data = (await response.json()) as { preset: PresetOption };
      setPresets((current) => targetPreset
        ? current.map((preset) => preset.id === targetPreset.id ? data.preset : preset)
        : [...current, data.preset]);
      setIsDrawerOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "预设保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function openDeleteDialog(preset: PresetOption) {
    setPresetToDelete(preset);
    setDeleteError("");
  }

  async function handleDelete() {
    if (!presetToDelete) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/presets/${presetToDelete.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("预设删除失败");
      setPresets((current) => current.filter((item) => item.id !== presetToDelete.id));
      setPresetToDelete(null);
    } catch {
      setDeleteError("删除失败，请稍后重试。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full max-w-md">
          <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7890A7]" />
          <span className="sr-only">{copy.searchLabel}</span>
          <input
            aria-label={copy.searchLabel}
            className="h-10 w-full rounded-lg border border-[#D7E5F1] bg-white pl-9 pr-9 text-sm text-[#19324D] outline-none placeholder:text-[#7890A7] focus:border-[#7A88EF] focus:ring-2 focus:ring-[#DDE2FF]"
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder={kind === "grammar" ? "搜索中文名、英文名或分类" : "搜索主题方向或大类"}
            role="searchbox"
            value={query}
          />
          {query ? <button aria-label="清除搜索" className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[#7890A7] hover:bg-[#EEF3F8]" onClick={() => { setQuery(""); setPage(1); }} type="button"><X className="size-4" /></button> : null}
        </label>
        <Button className="shrink-0 bg-[#5365EC] text-white hover:bg-[#4659DC]" onClick={openCreateDrawer} type="button">
          <Plus aria-hidden className="size-4" />{copy.addLabel}
        </Button>
      </div>

      {!isFlatKind && !isLoading && !loadError && presets.length ? (
        <div className="overflow-hidden rounded-xl border border-[#CCD8F8] bg-[#E9EEFF] shadow-[0_2px_8px_rgba(46,78,108,0.08)]">
          <div aria-label={kind === "grammar" ? "语法分类" : "主题大类"} className="flex min-h-12 gap-1 overflow-x-auto px-2.5 py-2" role="tablist">
            {[ALL_CATEGORIES, ...categories].map((category) => {
              const count = category === ALL_CATEGORIES ? presets.length : presets.filter((preset) => (preset.category ?? UNCATEGORIZED) === category).length;
              return (
                <button
                  aria-selected={activeCategory === category}
                  className={cn("min-h-8 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC] focus-visible:ring-offset-2", activeCategory === category ? "bg-[#5365EC] text-white shadow-sm" : "text-[#30459E] hover:bg-white/75 hover:text-[#20327F]")}
                  key={category}
                  onClick={() => { setActiveCategory(category); setQuery(""); setPage(1); }}
                  role="tab"
                  type="button"
                >
                  {category} <span className="text-xs opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500" role="status">正在加载预设...</div>
      ) : loadError ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-white text-center">
          <h2 className="text-lg font-semibold text-slate-950">预设加载失败</h2>
          <p className="mt-2 text-sm text-slate-500">{loadError}</p>
          <Button className="mt-6" onClick={() => void loadPresets()} type="button" variant="outline">重试</Button>
        </div>
      ) : presets.length === 0 ? (
        <EmptyState copy={copy} onCreate={openCreateDrawer} />
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-500">没有匹配的内容</div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(46,78,108,0.06)]" key={group.category}>
              <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[#CCD8F8] bg-[#E9EEFF] px-3.5 py-2 sm:px-4">
                <h2 className="text-sm font-bold text-[#30459E]">{group.category}</h2>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-[#4659DC] ring-1 ring-[#CCD8F8]">{group.items.length} 项</span>
              </div>
              <div className="grid gap-1.5 p-2.5 sm:grid-cols-2 sm:p-3 xl:grid-cols-3">
                {group.items.map((preset) => <PresetCard key={preset.id} kind={kind} onDelete={() => openDeleteDialog(preset)} onEdit={() => openEditDrawer(preset)} preset={preset} />)}
              </div>
            </section>
          ))}
          {(activeCategory === ALL_CATEGORIES || normalizedQuery) && groups.length > CATEGORIES_PER_PAGE ? (
            <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-[0_2px_8px_rgba(46,78,108,0.08)]">
              <span className="text-[13px] font-medium text-[#69829B]">共 {groups.length} 个类别</span>
              <div className="flex items-center gap-2"><Button aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} size="icon-sm" type="button" variant="outline"><ChevronLeft className="size-4" /></Button><span className="min-w-20 text-center text-[13px] font-semibold tabular-nums text-[#38536E]">第 {currentPage} / {totalPages} 页</span><Button aria-label="下一页" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} size="icon-sm" type="button" variant="outline"><ChevronRight className="size-4" /></Button></div>
            </div>
          ) : null}
        </div>
      )}

      <Dialog onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen} size="compact" title={editingPreset ? `编辑${copy.addLabel.replace("新增", "")}` : copy.addLabel}>
        <form className="flex max-h-[calc(100dvh-8rem)] min-h-0 flex-col" onSubmit={handleSubmit}>
          <div className="flex-1 space-y-5 px-6 py-6">
            {!isFlatKind ? <CategoryField
              categoryMode={categoryMode}
              error={Boolean(error) && !form.category.trim()}
              label={copy.categoryField}
              newModeLabel={kind === "theme" ? "新建大类" : "新建分类"}
              onCategoryChange={(category) => setForm((current) => ({ ...current, category }))}
              onModeChange={(mode) => { setCategoryMode(mode); setForm((current) => ({ ...current, category: "" })); }}
              options={categories.filter((category) => category !== UNCATEGORIZED)}
              placeholder={copy.categoryPlaceholder}
              value={form.category}
            /> : null}
            {kind === "grammar" ? <FormField error={Boolean(error) && !form.labelZh.trim()} label="中文名称" onChange={(value) => setForm((current) => ({ ...current, labelZh: value }))} placeholder="如：一般过去时" value={form.labelZh} /> : null}
            <FormField autoFocus={kind !== "grammar"} error={Boolean(error) && !form.label.trim()} label={copy.labelField} onChange={(value) => setForm((current) => ({ ...current, label: value }))} placeholder={copy.labelPlaceholder} value={form.label} />
            {error ? <div aria-live="assertive" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error}</div> : null}
          </div>
          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <Button onClick={() => setIsDrawerOpen(false)} type="button" variant="outline">取消</Button>
            <Button className="bg-[#5365EC] text-white hover:bg-[#4659DC]" disabled={isSaving} type="submit">{isSaving ? "保存中..." : "保存"}</Button>
          </footer>
        </form>
      </Dialog>

      <Dialog onClose={() => { if (!isDeleting) setPresetToDelete(null); }} open={Boolean(presetToDelete)} size="compact" title="确认删除">
        <div className="px-6 py-6">
          <p className="text-sm leading-6 text-slate-600">删除「{presetToDelete?.labelZh ?? presetToDelete?.label}」？</p>
          {deleteError ? <div aria-live="assertive" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{deleteError}</div> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button disabled={isDeleting} onClick={() => setPresetToDelete(null)} type="button" variant="outline">取消</Button>
          <Button disabled={isDeleting} onClick={() => void handleDelete()} type="button" variant="destructive">{isDeleting ? "删除中..." : "删除"}</Button>
        </footer>
      </Dialog>
    </section>
  );
}

function CategoryField({ label, newModeLabel, placeholder, value, options, categoryMode, error, onCategoryChange, onModeChange }: { label: string; newModeLabel: string; placeholder: string; value: string; options: string[]; categoryMode: CategoryMode; error: boolean; onCategoryChange: (value: string) => void; onModeChange: (mode: CategoryMode) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{label} <span aria-hidden className="text-red-500">*</span></legend>
      <div className="mb-3 grid w-full grid-cols-2 rounded-lg bg-slate-100 p-1" role="group" aria-label={`${label}录入方式`}>
        <button aria-pressed={categoryMode === "existing"} className={cn("h-9 rounded-md text-sm font-medium transition-colors", categoryMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")} onClick={() => onModeChange("existing")} type="button">选择已有</button>
        <button aria-pressed={categoryMode === "new"} className={cn("h-9 rounded-md text-sm font-medium transition-colors", categoryMode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")} onClick={() => onModeChange("new")} type="button">{newModeLabel}</button>
      </div>
      {categoryMode === "existing" ? (
        <select aria-invalid={error} aria-label={label} aria-required="true" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#5365EC] focus:ring-2 focus:ring-[#DDE2FF]" onChange={(event) => onCategoryChange(event.target.value)} value={value}>
          <option value="">请选择</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input aria-invalid={error} aria-label={`新${label}名称`} aria-required="true" autoFocus className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#5365EC] focus:ring-2 focus:ring-[#DDE2FF]" onChange={(event) => onCategoryChange(event.target.value)} placeholder={placeholder} value={value} />
      )}
    </fieldset>
  );
}

function FormField({ label, placeholder, value, onChange, autoFocus = false, error = false }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; autoFocus?: boolean; error?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label} <span aria-hidden className="text-red-500">*</span></span>
      <input aria-invalid={error} aria-label={label} aria-required="true" autoFocus={autoFocus} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#5365EC] focus:ring-2 focus:ring-[#DDE2FF]" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </label>
  );
}

function EmptyState({ copy, onCreate }: { copy: CopyConfig; onCreate: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-[#EEF0FF] text-[#5365EC]"><Tags aria-hidden className="size-7" /></div>
      <h2 className="text-lg font-semibold text-slate-950">{copy.emptyTitle}</h2>
      <p className="mt-2 text-sm text-slate-500">{copy.emptyHint}</p>
      <Button className="mt-6 bg-[#5365EC] text-white hover:bg-[#4659DC]" onClick={onCreate} type="button">{copy.addLabel}</Button>
    </div>
  );
}

function PresetCard({ kind, preset, onEdit, onDelete }: { kind: PresetKind; preset: PresetOption; onEdit: () => void; onDelete: () => void }) {
  const displayName = preset.labelZh ?? preset.label;
  return (
    <article className="group flex min-h-12 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:border-[#BFC9F7] hover:shadow-sm">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-slate-800">{displayName}</h3>
        {kind === "grammar" ? <p className="mt-0.5 truncate text-xs text-slate-500">{preset.label}</p> : null}
      </div>
      <div className="flex shrink-0 gap-1">
        <button aria-label={`编辑${displayName}`} className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-[#EEF0FF] hover:text-[#4659DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC]" onClick={onEdit} type="button"><Edit3 aria-hidden className="size-3.5" /></button>
        <button aria-label={`删除${displayName}`} className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" onClick={onDelete} type="button"><Trash2 aria-hidden className="size-3.5" /></button>
      </div>
    </article>
  );
}
