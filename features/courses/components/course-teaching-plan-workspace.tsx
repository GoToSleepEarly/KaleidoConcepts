"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Clock3, Loader2, Minus, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  ExerciseType,
  PracticeConfig,
  TeachingPlan,
  TeachingPlanChapter,
  TeachingPlanState,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const embeddedTypes: Array<Exclude<ExerciseType, "matching">> = ["choice", "blank", "vocab"];
const practiceTypes: ExerciseType[] = ["choice", "blank", "vocab", "matching"];
const typeLabels: Record<ExerciseType, string> = { choice: "选择题", blank: "填空题", vocab: "词汇题", matching: "匹配题" };
const typeHints: Record<ExerciseType, string> = {
  choice: "选项填空",
  blank: "给词变形",
  vocab: "中文提示写词",
  matching: "中英配对",
};
const typeExamples: Record<ExerciseType, string> = {
  choice: "举例：Summer ______ the glowing map. (found / lost / painted)",
  blank: "举例：Summer ______ the glowing map. (find)",
  vocab: "举例：The map showed a secret ______.（路线，5个字母）",
  matching: "举例：route - 路线 / gate - 大门 / whisper - 低语",
};

function unionKnowledgePointIds(chapters: TeachingPlanChapter[]) {
  return [...new Set(chapters.flatMap((chapter) => chapter.knowledgePointIds))];
}

function totalCount(counts?: Record<string, number> | null) {
  if (!counts) return 0;
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function selectedTypeCount(counts?: Record<string, number> | null) {
  if (!counts) return 0;
  return Object.values(counts).filter((count) => count > 0).length;
}

type SaveStatus = "saved" | "dirty" | "saving" | "failed";
type ActivePanel = "chapters" | "afterClass";

function chapterReady(chapter: TeachingPlanChapter) {
  return Boolean(chapter.targetWordCount && chapter.knowledgePointIds.length);
}

function saveStatusLabel(status: SaveStatus) {
  return status === "dirty" ? "未保存" : status === "saving" ? "正在保存..." : status === "failed" ? "保存失败" : "已自动保存";
}

function initialCountForType() {
  return 5;
}

function sameIdSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function CourseTeachingPlanWorkspace({ initialState }: { initialState: TeachingPlanState }) {
  const router = useRouter();
  const [plan, setPlan] = useState<TeachingPlan>(initialState.plan);
  const [activePanel, setActivePanel] = useState<ActivePanel>("chapters");
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const hasMounted = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const selectedChapter = plan.chapters[selectedChapterIndex];
  const selectedOutlineChapter = initialState.outline.chapters[selectedChapterIndex];
  const readyChapterCount = plan.chapters.filter(chapterReady).length;
  const afterClassDecisionMade = plan.status === "confirmed" || plan.afterClassPractice.touched.practice;
  const confirmHint = plan.englishLevel
    ? `章节 ${readyChapterCount}/${plan.chapters.length} · ${afterClassDecisionMade ? (plan.afterClassPractice.enabled ? "课后练习已开启" : "课后练习不生成") : "课后练习待确认"}`
    : "还需选择英语难度";
  const afterClassNeedsReview = useMemo(() => {
    if (!plan.afterClassPractice.touched.knowledgePointIds) return false;
    const union = new Set(unionKnowledgePointIds(plan.chapters));
    return plan.afterClassPractice.knowledgePointIds.some((id) => !union.has(id));
  }, [plan.afterClassPractice.knowledgePointIds, plan.afterClassPractice.touched.knowledgePointIds, plan.chapters]);

  function updatePlan(updater: (current: TeachingPlan) => TeachingPlan) {
    setError("");
    setSaveStatus("dirty");
    setPlan(updater);
  }

  function updateChapter(index: number, updater: (chapter: TeachingPlanChapter) => TeachingPlanChapter) {
    updatePlan((current) => {
      const chapters = current.chapters.map((chapter, chapterIndex) => chapterIndex === index ? updater(chapter) : chapter);
      const nextUnion = unionKnowledgePointIds(chapters);
      const afterClassPractice = current.afterClassPractice.touched.knowledgePointIds
        ? current.afterClassPractice
        : { ...current.afterClassPractice, knowledgePointIds: nextUnion };
      return { ...current, chapters, afterClassPractice };
    });
  }

  function applyCurrentChapterReadingToAll() {
    if (!selectedChapter) return;
    updatePlan((current) => {
      const source = current.chapters[selectedChapterIndex];
      return {
        ...current,
        chapters: current.chapters.map((chapter, index) => {
          if (index === selectedChapterIndex) return chapter;
          return {
            ...chapter,
            targetWordCount: source.targetWordCount,
            readingExerciseMode: source.readingExerciseMode,
            embeddedExercises: {
              enabled: source.embeddedExercises.enabled,
              countsByType: { ...source.embeddedExercises.countsByType },
            },
            touched: {
              ...chapter.touched,
              targetWordCount: true,
              readingExerciseMode: true,
              embeddedExercises: true,
            },
          };
        }),
      };
    });
  }

  function applyCurrentChapterPracticeToAll() {
    if (!selectedChapter) return;
    updatePlan((current) => {
      const source = current.chapters[selectedChapterIndex];
      return {
        ...current,
        chapters: current.chapters.map((chapter, index) => index === selectedChapterIndex ? chapter : {
          ...chapter,
          chapterPractice: {
            enabled: source.chapterPractice.enabled,
            countsByType: { ...source.chapterPractice.countsByType },
          },
          touched: { ...chapter.touched, chapterPractice: true },
        }),
      };
    });
  }

  const saveDraft = useCallback(async (targetPlan: TeachingPlan) => {
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaveStatus("saving");
    setError("");
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
        signal: controller.signal,
      });
      const data = (await response.json()) as { plan?: TeachingPlan; message?: string };
      if (!response.ok || !data.plan) throw new Error(data.message || "保存失败，请重试。");
      setPlan(data.plan);
      setSaveStatus("saved");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setSaveStatus("failed");
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。");
    }
  }, [initialState.course.id]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (saveStatus !== "dirty") return;
    const timer = window.setTimeout(() => void saveDraft(plan), 800);
    return () => window.clearTimeout(timer);
  }, [plan, saveDraft, saveStatus]);

  async function confirmPlan(resetDownstream = false) {
    setConfirming(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetDownstream }),
      });
      const data = (await response.json()) as { plan?: TeachingPlan; course?: { id: string; currentStage: string }; message?: string; requiresReset?: boolean };
      if (response.status === 409 && data.requiresReset) {
        const confirmed = window.confirm("确认后会重置已生成的文案、练习和视觉资源。");
        if (!confirmed) return;
        await confirmPlan(true);
        return;
      }
      if (!response.ok || !data.course) throw new Error(data.message || "教学规划确认失败");
      router.push(`/courses/${initialState.course.id}/create/content`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "教学规划确认失败");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CourseCreateSteps currentStep={3} courseId={initialState.course.id} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">教学规划</p>
          <h2 className="mt-1 truncate text-2xl font-semibold text-foreground">{initialState.outline.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-medium text-muted-foreground"><Clock3 className="size-4" />{initialState.course.durationMinutes} 分钟</span>
          <span className="rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700">{initialState.course.englishLevel}</span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">全课 {initialState.knowledgePoints.length} 个知识点</span>
          <span className={cn("rounded-full px-3 py-1.5 text-xs font-medium", saveStatus === "failed" ? "bg-red-50 text-red-700" : saveStatus === "saving" ? "bg-primary-50 text-primary-700" : "bg-muted text-muted-foreground")}>{saveStatusLabel(saveStatus)}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg bg-card p-3 shadow-sm">
            <div aria-label="教学规划配置" className="space-y-2" role="tablist">
              <PanelTab
                active={activePanel === "chapters"}
                label="章节"
                onClick={() => setActivePanel("chapters")}
                summary={`${readyChapterCount}/${plan.chapters.length} 章 · 词数 · 知识点 · 题型`}
              />
              <PanelTab
                active={activePanel === "afterClass"}
                label="课后"
                onClick={() => setActivePanel("afterClass")}
                summary={afterClassDecisionMade ? (plan.afterClassPractice.enabled ? `生成 · ${totalCount(plan.afterClassPractice.practice.countsByType)} 题` : "不生成") : "待确认"}
              />
            </div>
          </section>
          {activePanel === "chapters" ? (
            <section className="rounded-lg bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="text-sm font-semibold text-foreground">章节</div>
                <div className="text-xs font-medium text-muted-foreground">配置概要</div>
              </div>
              <div className="space-y-2">
                {plan.chapters.map((chapter, index) => {
                  const outline = initialState.outline.chapters[index];
                  const active = selectedChapterIndex === index;
                  return (
                    <button className={cn("w-full rounded-md border p-3 text-left transition-colors", active ? "border-primary bg-primary-50" : "border-border bg-background hover:border-primary-200 hover:bg-muted/40")} key={chapter.outlineChapterId} onClick={() => setSelectedChapterIndex(index)} type="button">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">第 {outline.order} 章 · {outline.title}</span>
                        {chapterReady(chapter) ? <Check className="size-4 text-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      </div>
                      <div className="mt-2 space-y-1 text-xs font-medium text-muted-foreground">
                        <div>{chapter.targetWordCount ? `${chapter.targetWordCount} 词` : "词数未设置"} · {chapter.knowledgePointIds.length} 个知识点</div>
                        <div>{chapter.readingExerciseMode === "embedded" ? `内嵌 ${totalCount(chapter.embeddedExercises.countsByType)} 题` : "纯正文"} · {chapter.chapterPractice.enabled ? `章节练习 ${totalCount(chapter.chapterPractice.countsByType)} 题` : "无章节练习"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>

        <main className="min-w-0 space-y-5">
          {activePanel === "chapters" && selectedChapter && selectedOutlineChapter ? (
            <ChapterEditor
              chapter={selectedChapter}
              index={selectedChapterIndex}
              knowledgePoints={initialState.knowledgePoints}
              onApplyChapterPracticeToAll={applyCurrentChapterPracticeToAll}
              onApplyReadingToAll={applyCurrentChapterReadingToAll}
              onChange={(updater) => updateChapter(selectedChapterIndex, updater)}
              outline={selectedOutlineChapter}
            />
          ) : null}

          {activePanel === "afterClass" ? (
            <AfterClassEditor
              afterClassNeedsReview={afterClassNeedsReview}
              knowledgePointIds={unionKnowledgePointIds(plan.chapters)}
              knowledgePoints={initialState.knowledgePoints}
              onChange={(updater) => updatePlan((current) => ({ ...current, afterClassPractice: updater(current.afterClassPractice) }))}
              plan={plan}
            />
          ) : null}
        </main>
      </div>

      {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-md sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{confirmHint}</p>
          <p className={cn("mt-0.5 text-xs", saveStatus === "failed" ? "text-red-700" : "text-muted-foreground")}>{saveStatusLabel(saveStatus)}</p>
        </div>
        <div className="flex gap-2">
          <Button disabled={confirming || saveStatus === "saving"} onClick={() => void confirmPlan(false)} type="button">{confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{confirming ? "确认中" : "确认并进入文案与练习"}</Button>
        </div>
      </div>
    </div>
  );
}

function PanelTab({ active, label, summary, onClick }: { active: boolean; label: string; summary: string; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={cn("w-full rounded-md border p-3 text-left transition-colors", active ? "border-primary bg-primary-50" : "border-border bg-background hover:border-primary-200 hover:bg-muted/40")}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {active ? <Check className="size-4 text-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </span>
      <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">{summary}</span>
    </button>
  );
}

function ChapterEditor({ chapter, outline, index, knowledgePoints, onApplyReadingToAll, onApplyChapterPracticeToAll, onChange }: {
  chapter: TeachingPlanChapter;
  outline: TeachingPlanState["outline"]["chapters"][number];
  index: number;
  knowledgePoints: TeachingPlanState["knowledgePoints"];
  onApplyReadingToAll: () => void;
  onApplyChapterPracticeToAll: () => void;
  onChange: (updater: (chapter: TeachingPlanChapter) => TeachingPlanChapter) => void;
}) {
  const chapterLabel = `第 ${index + 1} 章`;
  const [pickerOpen, setPickerOpen] = useState(false);
  const recommendedIds = outline.recommendedKnowledgePointIds;
  const knowledgePointsChanged = !sameIdSet(chapter.knowledgePointIds, recommendedIds);
  return (
    <section>
      <div className="space-y-5">
        <div className="rounded-lg bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground">{chapterLabel} · {outline.title}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{outline.summary}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-start gap-2">
              <label className="rounded-md border border-input bg-background px-3 py-2">
                <span className="block text-xs font-medium text-muted-foreground">目标词数</span>
                <span className="mt-1 flex items-center gap-2">
                  <input aria-label={`${chapterLabel}目标词数`} className="h-9 w-20 rounded-md border border-input bg-card px-2 text-center text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" max={200} min={50} onChange={(event) => onChange((current) => ({ ...current, targetWordCount: Number(event.target.value), touched: { ...current.touched, targetWordCount: true } }))} type="number" value={chapter.targetWordCount ?? ""} />
                  <span className="text-sm text-muted-foreground">词</span>
                </span>
              </label>
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">知识点</div>
              <div className="flex items-center gap-2">
                {knowledgePointsChanged ? <Button onClick={() => onChange((current) => ({ ...current, knowledgePointIds: [...recommendedIds], touched: { ...current.touched, knowledgePointIds: false } }))} size="sm" type="button" variant="ghost"><RotateCcw className="size-4" />重置为 AI 推荐</Button> : null}
                <Button onClick={() => setPickerOpen(true)} size="sm" type="button" variant="outline">从语法库选择</Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {chapter.knowledgePointIds.length ? chapter.knowledgePointIds.map((id) => {
                const point = knowledgePoints.find((item) => item.id === id);
                const label = point?.label ?? id;
                return (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm", recommendedIds.includes(id) ? "bg-primary-50 text-primary-700" : "bg-amber-50 text-amber-800")} key={id}>
                    {label}
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", recommendedIds.includes(id) ? "bg-primary-100 text-primary-700" : "bg-amber-100 text-amber-800")}>{recommendedIds.includes(id) ? "AI 推荐" : "手动添加"}</span>
                    <button
                      aria-label={`删除知识点 ${label}`}
                      className="rounded-full p-0.5 text-primary-700 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onChange((current) => ({ ...current, knowledgePointIds: current.knowledgePointIds.filter((pointId) => pointId !== id), touched: { ...current.touched, knowledgePointIds: true } }))}
                      type="button"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                );
              }) : <span className="text-sm text-muted-foreground">未选择</span>}
            </div>
            {outline.knowledgePointRecommendationSummary ? <p className="mt-3 rounded-md bg-primary-50 px-3 py-2 text-sm leading-6 text-primary-700">AI 推荐：{outline.knowledgePointRecommendationSummary} 如需调整，可从完整语法库中修改。</p> : null}
            {chapter.knowledgePointIds.length > 3 ? <p className="mt-2 text-sm text-amber-700">建议一章不超过 3 个知识点。</p> : null}
          </div>
          {pickerOpen ? (
            <GrammarLibraryPicker
              knowledgePoints={knowledgePoints}
              onApply={(ids) => {
                onChange((current) => ({ ...current, knowledgePointIds: ids, touched: { ...current.touched, knowledgePointIds: !sameIdSet(ids, recommendedIds) } }));
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
              selectedIds={chapter.knowledgePointIds}
            />
          ) : null}
        </div>

        <div className="rounded-lg bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">正文模式</h4>
            <Button onClick={onApplyReadingToAll} size="sm" type="button" variant="outline">同步正文设置到全部章节</Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button aria-pressed={chapter.readingExerciseMode === "none"} className={cn("min-h-10 rounded-md text-sm font-medium", chapter.readingExerciseMode === "none" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70")} onClick={() => onChange((current) => ({ ...current, readingExerciseMode: "none", embeddedExercises: { enabled: false, countsByType: { choice: 0, blank: 0, vocab: 0 } }, touched: { ...current.touched, readingExerciseMode: true, embeddedExercises: true } }))} type="button">无题目</button>
            <button aria-pressed={chapter.readingExerciseMode === "embedded"} className={cn("min-h-10 rounded-md text-sm font-medium", chapter.readingExerciseMode === "embedded" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70")} onClick={() => onChange((current) => ({ ...current, readingExerciseMode: "embedded", embeddedExercises: { enabled: true, countsByType: current.embeddedExercises.countsByType }, touched: { ...current.touched, readingExerciseMode: true, embeddedExercises: true } }))} type="button">加入内嵌题</button>
          </div>
          {chapter.readingExerciseMode === "embedded" ? <ExerciseConfigEditor allowedTypes={embeddedTypes} ariaPrefix={`${chapterLabel}内嵌题`} config={chapter.embeddedExercises} max={8} onChange={(config) => onChange((current) => ({ ...current, embeddedExercises: config, touched: { ...current.touched, embeddedExercises: true } }))} /> : <p className="mt-3 text-sm text-muted-foreground">将展示完整正文，不在阅读中插入题目。</p>}
        </div>

        <div className="rounded-lg bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleHeader enabled={chapter.chapterPractice.enabled} label="章节练习" onChange={(enabled) => onChange((current) => ({ ...current, chapterPractice: { ...current.chapterPractice, enabled }, touched: { ...current.touched, chapterPractice: true } }))} />
            <Button onClick={onApplyChapterPracticeToAll} size="sm" type="button" variant="outline">同步章节练习到全部章节</Button>
          </div>
          {chapter.chapterPractice.enabled ? (
            <>
              <PracticeConfigEditor ariaPrefix={`${chapterLabel}章节练习`} config={chapter.chapterPractice} max={10} onChange={(config) => onChange((current) => ({ ...current, chapterPractice: config, touched: { ...current.touched, chapterPractice: true } }))} />
              {selectedTypeCount(chapter.chapterPractice.countsByType) > 2 ? <p className="mt-3 text-sm text-amber-700">建议章节练习不超过 2 种题型。</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GrammarLibraryPicker({ knowledgePoints, selectedIds, onApply, onClose }: { knowledgePoints: TeachingPlanState["knowledgePoints"]; selectedIds: string[]; onApply: (ids: string[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [localIds, setLocalIds] = useState(selectedIds);
  const categories = useMemo(() => [...new Set(knowledgePoints.map((point) => point.category || "未分类"))], [knowledgePoints]);
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? "未分类");
  const filtered = knowledgePoints.filter((point) => {
    const category = point.category || "未分类";
    return category === activeCategory && `${point.label} ${category}`.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-xl rounded-lg bg-card shadow-lg">
        <div className="border-b border-border p-4">
          <h4 className="text-base font-semibold text-foreground">语法库</h4>
          <div aria-label="语法分类" className="mt-3 flex gap-1 overflow-x-auto rounded-md bg-muted p-1" role="tablist">
            {categories.map((category) => (
              <button
                aria-selected={activeCategory === category}
                className={cn("min-h-9 shrink-0 rounded px-3 text-sm font-medium transition-colors", activeCategory === category ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")}
                key={category}
                onClick={() => setActiveCategory(category)}
                role="tab"
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
          <label className="relative mt-3 block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">搜索语法点</span>
            <input className="min-h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setQuery(event.target.value)} placeholder="搜索语法点" value={query} />
          </label>
        </div>
        <div className="max-h-[52dvh] overflow-y-auto p-3">
          {filtered.map((point) => (
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50" key={point.id}>
              <input aria-label={`选择语法点 ${point.label}`} checked={localIds.includes(point.id)} onChange={() => setLocalIds((current) => current.includes(point.id) ? current.filter((id) => id !== point.id) : [...current, point.id])} type="checkbox" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{point.label}</span>
                {point.category ? <span className="text-xs text-muted-foreground">{point.category}</span> : null}
              </span>
            </label>
          ))}
          {!filtered.length ? <p className="p-6 text-center text-sm text-muted-foreground">没有匹配的语法点</p> : null}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="text-sm text-muted-foreground">已选择 {localIds.length} 个</span>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="outline">取消</Button>
            <Button onClick={() => onApply(localIds)} type="button">应用选择</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleHeader({ enabled, label, onChange }: { enabled: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <button aria-label={`${label}${enabled ? "已开启" : "已关闭"}`} aria-pressed={enabled} className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary-300 hover:text-foreground")} onClick={() => onChange(!enabled)} type="button">
        <span aria-hidden="true" className={cn("relative h-5 w-9 rounded-full transition-colors", enabled ? "bg-white/30" : "bg-muted")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform", enabled ? "translate-x-[18px]" : "translate-x-0.5")} /></span>
        {enabled ? "已开启" : "已关闭"}
      </button>
    </div>
  );
}

function ExerciseConfigEditor({ config, allowedTypes, max, ariaPrefix, onChange }: { config: TeachingPlanChapter["embeddedExercises"]; allowedTypes: Array<Exclude<ExerciseType, "matching">>; max: number; ariaPrefix: string; onChange: (config: TeachingPlanChapter["embeddedExercises"]) => void }) {
  return (
    <ExerciseCountRows
      allowedTypes={allowedTypes}
      ariaPrefix={ariaPrefix}
      counts={config.countsByType}
      max={max}
      onChange={(type, count) => onChange({ ...config, enabled: true, countsByType: { ...config.countsByType, [type]: count } })}
    />
  );
}

function PracticeConfigEditor({ config, max, ariaPrefix, onChange }: { config: PracticeConfig; max: number; ariaPrefix: string; onChange: (config: PracticeConfig) => void }) {
  return (
    <ExerciseCountRows
      allowedTypes={practiceTypes}
      ariaPrefix={ariaPrefix}
      counts={config.countsByType}
      max={max}
      onChange={(type, count) => onChange({ ...config, enabled: true, countsByType: { ...config.countsByType, [type]: count } })}
    />
  );
}

function ExerciseCountRows<T extends ExerciseType>({ counts, allowedTypes, ariaPrefix, max, onChange }: { counts: Partial<Record<T, number>>; allowedTypes: T[]; ariaPrefix: string; max: number; onChange: (type: T, count: number) => void }) {
  const [adding, setAdding] = useState(false);
  const selectedTypes = allowedTypes.filter((type) => (counts[type] ?? 0) > 0);
  const availableTypes = allowedTypes.filter((type) => (counts[type] ?? 0) <= 0);
  const addLabel = ariaPrefix.includes("内嵌题") ? "添加内嵌题型" : ariaPrefix.includes("章节练习") ? "添加章节练习题型" : "添加课后练习题型";
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">建议每种题型 5 题一组，便于统一展示。</p>
      {selectedTypes.length ? (
        <div className="space-y-2">
          {selectedTypes.map((type) => (
            <div className="grid gap-3 rounded-md border border-primary-200 bg-primary-50/40 p-3 transition-colors sm:grid-cols-[minmax(0,1fr)_176px_36px]" key={type}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">{typeLabels[type]}</div>
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{typeExamples[type]}</div>
              </div>
              <Stepper ariaPrefix={ariaPrefix} label={typeLabels[type]} max={max} onChange={(count) => onChange(type, count)} value={counts[type] ?? 0} />
              <button aria-label={`${ariaPrefix}${typeLabels[type]}删除`} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => onChange(type, 0)} type="button">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">尚未添加题型</div>
      )}
      {availableTypes.length ? (
        <div className="space-y-2">
          <Button onClick={() => setAdding((current) => !current)} size="sm" type="button" variant="outline"><Plus className="size-4" />{addLabel}</Button>
          {adding ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {availableTypes.map((type) => (
                <button aria-label={`添加${typeHints[type]}`} className="rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-50" key={type} onClick={() => { onChange(type, Math.min(max, initialCountForType())); setAdding(false); }} type="button">
                  <span className="block text-sm font-semibold text-foreground">添加{typeHints[type]}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{typeExamples[type]}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stepper({ ariaPrefix, label, value, max, onChange }: { ariaPrefix: string; label: string; value: number; max: number; onChange: (count: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button aria-label={`${ariaPrefix}${label}减少`} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary-200 hover:text-foreground" onClick={() => onChange(Math.max(0, value - 1))} type="button"><Minus className="size-4" /></button>
      <input aria-label={`${ariaPrefix}${label}数量`} className="h-8 w-14 rounded-md border border-input bg-background text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" max={max} min={1} onChange={(event) => onChange(Math.max(1, Math.min(max, Number(event.target.value))))} type="number" value={value} />
      <button aria-label={`${ariaPrefix}${label}增加`} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary-200 hover:text-foreground" onClick={() => onChange(Math.min(max, value + 1))} type="button"><Plus className="size-4" /></button>
    </div>
  );
}

function AfterClassEditor({ plan, knowledgePoints, knowledgePointIds, afterClassNeedsReview, onChange }: {
  plan: TeachingPlan;
  knowledgePoints: TeachingPlanState["knowledgePoints"];
  knowledgePointIds: string[];
  afterClassNeedsReview: boolean;
  onChange: (updater: (config: TeachingPlan["afterClassPractice"]) => TeachingPlan["afterClassPractice"]) => void;
}) {
  const availablePoints = knowledgePoints.filter((point) => knowledgePointIds.includes(point.id));
  const decisionMade = plan.status === "confirmed" || plan.afterClassPractice.touched.practice;
  return (
    <section className="rounded-lg bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-foreground">课后练习</h3>
        <p className="mt-1 text-sm text-muted-foreground">全课统一配置，请确认是否需要生成。</p>
      </div>
      {!decisionMade ? <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">请选择是否生成课后练习</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button aria-pressed={decisionMade && plan.afterClassPractice.enabled} className={cn("min-h-11 rounded-md text-sm font-semibold transition-colors", decisionMade && plan.afterClassPractice.enabled ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} onClick={() => onChange((current) => ({ ...current, enabled: true, knowledgePointIds: current.touched.knowledgePointIds ? current.knowledgePointIds : knowledgePointIds, practice: { enabled: true, countsByType: totalCount(current.practice.countsByType) ? current.practice.countsByType : { choice: 5, blank: 5, vocab: 0, matching: 0 } }, touched: { ...current.touched, practice: true } }))} type="button">生成课后练习</button>
        <button aria-pressed={decisionMade && !plan.afterClassPractice.enabled} className={cn("min-h-11 rounded-md text-sm font-semibold transition-colors", decisionMade && !plan.afterClassPractice.enabled ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} onClick={() => onChange((current) => ({ ...current, enabled: false, practice: { ...current.practice, enabled: false }, touched: { ...current.touched, practice: true } }))} type="button">不生成课后练习</button>
      </div>
      {afterClassNeedsReview ? <p className="mt-3 text-sm text-amber-700">课后练习知识点可能需要检查。</p> : null}
      {decisionMade && plan.afterClassPractice.enabled ? (
        <>
          <div className="mt-5 text-sm font-medium text-foreground">课后考查知识点</div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">已默认选中各章节使用的知识点；取消勾选即可排除不需要考查的内容。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {availablePoints.map((point) => (
              <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background text-muted-foreground hover:border-primary-200 hover:text-foreground")} key={point.id}>
                <input checked={plan.afterClassPractice.knowledgePointIds.includes(point.id)} className="sr-only" onChange={() => onChange((current) => ({ ...current, knowledgePointIds: current.knowledgePointIds.includes(point.id) ? current.knowledgePointIds.filter((id) => id !== point.id) : [...current.knowledgePointIds, point.id], touched: { ...current.touched, knowledgePointIds: true } }))} type="checkbox" />
                <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded border", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{plan.afterClassPractice.knowledgePointIds.includes(point.id) ? <Check className="size-3.5" /> : null}</span>
                <span className="min-w-0 flex-1 font-medium">{point.label}</span>
              </label>
            ))}
          </div>
          <PracticeConfigEditor ariaPrefix="课后练习" config={plan.afterClassPractice.practice} max={20} onChange={(practice) => onChange((current) => ({ ...current, practice, touched: { ...current.touched, practice: true } }))} />
        </>
      ) : null}
    </section>
  );
}
