"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Tags, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PresetKind, PresetOption } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type PresetLibraryProps = {
  kind: PresetKind;
};

type CopyConfig = {
  description: string;
  addLabel: string;
  emptyTitle: string;
  emptyHint: string;
  labelField: string;
  labelPlaceholder: string;
  useCategory: boolean;
};

const copyByKind: Record<PresetKind, CopyConfig> = {
  theme: {
    description: "维护新建课程时可选择的主题，主题是整体世界观或场景框架。",
    addLabel: "新增主题",
    emptyTitle: "还没有主题",
    emptyHint: "新增主题后，即可在新建课程时选择。",
    labelField: "主题名称",
    labelPlaceholder: "如：海底世界",
    useCategory: false,
  },
  grammar: {
    description: "维护新建课程时可选择的语法点，可按分类归类。",
    addLabel: "新增语法点",
    emptyTitle: "还没有语法点",
    emptyHint: "新增语法点后，即可在新建课程时选择。",
    labelField: "语法点名称",
    labelPlaceholder: "如：Past Simple",
    useCategory: true,
  },
};

const UNCATEGORIZED = "未分类";

type FormState = {
  label: string;
  category: string;
};

const emptyForm: FormState = { label: "", category: "" };

export function PresetLibrary({ kind }: PresetLibraryProps) {
  const copy = copyByKind[kind];
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetOption | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");

  async function loadPresets() {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch(`/api/presets?kind=${kind}`);
      if (!response.ok) {
        throw new Error("预设加载失败");
      }

      const data = (await response.json()) as { presets: PresetOption[] };
      setPresets(data.presets);
    } catch {
      setLoadError("预设加载失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialPresets() {
      try {
        const response = await fetch(`/api/presets?kind=${kind}`);
        if (!response.ok) {
          throw new Error("预设加载失败");
        }

        const data = (await response.json()) as { presets: PresetOption[] };

        if (isActive) {
          setPresets(data.presets);
        }
      } catch {
        if (isActive) {
          setLoadError("预设加载失败，请稍后重试。");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialPresets();

    return () => {
      isActive = false;
    };
  }, [kind]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    presets.forEach((preset) => {
      if (preset.category) {
        set.add(preset.category);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
  }, [presets]);

  const groups = useMemo(() => {
    if (!copy.useCategory) {
      return [{ category: "", items: presets }];
    }

    const map = new Map<string, PresetOption[]>();
    presets.forEach((preset) => {
      const key = preset.category ?? UNCATEGORIZED;
      const list = map.get(key) ?? [];
      list.push(preset);
      map.set(key, list);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "zh"))
      .map(([category, items]) => ({ category, items }));
  }, [copy.useCategory, presets]);

  function openCreateDrawer() {
    setEditingPreset(null);
    setForm(emptyForm);
    setError("");
    setIsDrawerOpen(true);
  }

  function openEditDrawer(preset: PresetOption) {
    setEditingPreset(preset);
    setForm({ label: preset.label, category: preset.category ?? "" });
    setError("");
    setIsDrawerOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.label.trim()) {
      setError(`请填写${copy.labelField}`);
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(editingPreset ? `/api/presets/${editingPreset.id}` : "/api/presets", {
        method: editingPreset ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          label: form.label.trim(),
          category: copy.useCategory ? form.category.trim() || undefined : undefined,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "预设保存失败");
      }

      const data = (await response.json()) as { preset: PresetOption };

      if (editingPreset) {
        setPresets((current) => current.map((preset) => (preset.id === editingPreset.id ? data.preset : preset)));
      } else {
        setPresets((current) => [...current, data.preset]);
      }

      setIsDrawerOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "预设保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(preset: PresetOption) {
    if (!window.confirm(`确认删除「${preset.label}」？删除后新建课程将不再出现该选项。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/presets/${preset.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("预设删除失败");
      }

      setPresets((current) => current.filter((item) => item.id !== preset.id));
    } catch {
      window.alert("预设删除失败，请稍后重试。");
    }
  }

  return (
    <>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-6">
          <p className="text-sm text-slate-500">{copy.description}</p>
          <Button className="bg-violet-600 text-white hover:bg-violet-700" onClick={openCreateDrawer} type="button">
            <Plus className="size-4" />
            {copy.addLabel}
          </Button>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 text-sm text-slate-500">正在加载预设...</div>
        ) : loadError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-white text-center">
            <h2 className="text-lg font-semibold text-slate-950">预设加载失败</h2>
            <p className="mt-2 text-sm text-slate-500">{loadError}</p>
            <Button className="mt-6" onClick={() => void loadPresets()} type="button" variant="outline">
              重试
            </Button>
          </div>
        ) : presets.length > 0 ? (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.category || "all"} className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
                {copy.useCategory ? (
                  <h3 className="mb-4 text-sm font-semibold text-slate-700">{group.category}</h3>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {group.items.map((preset) => (
                    <PresetChip key={preset.id} onDelete={() => void handleDelete(preset)} onEdit={() => openEditDrawer(preset)} preset={preset} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[#E5E7EB] bg-white text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Tags className="size-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">{copy.emptyTitle}</h2>
            <p className="mt-2 text-sm text-slate-500">{copy.emptyHint}</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={openCreateDrawer} type="button">
              {copy.addLabel}
            </Button>
          </div>
        )}
      </section>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button aria-label="关闭抽屉" className="absolute inset-0 bg-slate-950/20" onClick={() => setIsDrawerOpen(false)} type="button" />
          <aside className="absolute right-0 top-0 flex h-full w-[420px] flex-col border-l border-[#E5E7EB] bg-white shadow-xl">
            <header className="flex h-[72px] items-center justify-between border-b border-[#E5E7EB] px-6">
              <h2 className="text-lg font-semibold text-slate-950">{editingPreset ? `编辑${copy.addLabel.replace("新增", "")}` : copy.addLabel}</h2>
              <button
                aria-label="关闭"
                className="flex size-9 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setIsDrawerOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    {copy.labelField} <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="h-10 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                    placeholder={copy.labelPlaceholder}
                    value={form.label}
                  />
                </label>

                {copy.useCategory ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">分类</span>
                    <input
                      className="h-10 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      list="preset-category-options"
                      onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                      placeholder="如：时态（可留空）"
                      value={form.category}
                    />
                    <datalist id="preset-category-options">
                      {categories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </label>
                ) : null}

                {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
              </div>

              <footer className="flex justify-end gap-3 border-t border-[#E5E7EB] px-6 py-4">
                <Button onClick={() => setIsDrawerOpen(false)} type="button" variant="outline">
                  取消
                </Button>
                <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} type="submit">
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function PresetChip({ preset, onEdit, onDelete }: { preset: PresetOption; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className={cn("group inline-flex h-9 items-center gap-1 rounded-full border border-[#E5E7EB] bg-white pl-3 pr-1 text-sm text-slate-700")}>
      <span className="font-medium">{preset.label}</span>
      <button
        aria-label="编辑"
        className="flex size-7 items-center justify-center rounded-full text-slate-400 transition-colors duration-200 hover:bg-violet-50 hover:text-violet-700"
        onClick={onEdit}
        type="button"
      >
        <Edit3 className="size-3.5" />
      </button>
      <button
        aria-label="删除"
        className="flex size-7 items-center justify-center rounded-full text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
        onClick={onDelete}
        type="button"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
