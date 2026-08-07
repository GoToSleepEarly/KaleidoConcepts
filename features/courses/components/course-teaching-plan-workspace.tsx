"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Clock3, Loader2, Minus, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  EnglishLevel,
  ExerciseType,
  PracticeConfig,
  TeachingPlan,
  TeachingPlanChapter,
  TeachingPlanState,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const levels: EnglishLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const defaultWordCounts: Record<EnglishLevel, number> = { A1: 50, A2: 70, B1: 90, B2: 110, C1: 130, C2: 150 };
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
  choice: "Summer ______ the glowing map. (found / lost / painted)",
  blank: "Summer ______ the glowing map. (find)",
  vocab: "The map showed a secret ______.（路线，5个字母）",
  matching: "route - 路线 / gate - 大门 / whisper - 低语",
};

function recommendedCount(duration: number, kind: "embedded" | "chapter" | "afterClass") {
  if (kind === "afterClass") return duration === 30 ? 6 : duration === 45 ? 8 : 10;
  return duration === 30 ? 3 : duration === 45 ? 4 : 5;
}

function defaultEmbeddedCounts(count: number) {
  return { choice: Math.ceil(count / 2), blank: Math.floor(count / 2), vocab: 0 };
}

function defaultPracticeCounts(count: number) {
  return { choice: Math.ceil(count / 2), blank: Math.floor(count / 2), vocab: 0, matching: 0 };
}

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
type ActivePanel = "level" | "chapters" | "afterClass";

function chapterReady(chapter: TeachingPlanChapter) {
  return Boolean(chapter.targetWordCount && chapter.knowledgePointIds.length);
}

function saveStatusLabel(status: SaveStatus) {
  return status === "dirty" ? "未保存" : status === "saving" ? "正在保存..." : status === "failed" ? "保存失败" : "已自动保存";
}

function initialCountForType(type: ExerciseType) {
  return type === "choice" ? 2 : 1;
}

export function CourseTeachingPlanWorkspace({ initialState }: { initialState: TeachingPlanState }) {
  const router = useRouter();
  const [plan, setPlan] = useState<TeachingPlan>(initialState.plan);
  const [activePanel, setActivePanel] = useState<ActivePanel>("chapters");
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const [keptManualHint, setKeptManualHint] = useState(false);
  const hasMounted = useRef(false);
  const initialFocusLevel = useRef<EnglishLevel>(plan.englishLevel ?? "A1");
  const levelButtonRefs = useRef<Partial<Record<EnglishLevel, HTMLButtonElement | null>>>({});
  const saveController = useRef<AbortController | null>(null);
  const selectedChapter = plan.chapters[selectedChapterIndex];
  const selectedOutlineChapter = initialState.outline.chapters[selectedChapterIndex];
  const readyChapterCount = plan.chapters.filter(chapterReady).length;
  const confirmHint = plan.englishLevel
    ? `章节 ${readyChapterCount}/${plan.chapters.length} · ${plan.afterClassPractice.enabled ? "课后练习开启" : "课后练习关闭"}`
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

  function applyLevel(level: EnglishLevel) {
    updatePlan((current) => {
      let preserved = false;
      const chapters = current.chapters.map((chapter) => {
        const next = { ...chapter };
        if (!chapter.touched.targetWordCount) next.targetWordCount = defaultWordCounts[level];
        else preserved = true;
        if (!chapter.touched.embeddedExercises) {
          next.embeddedExercises = {
            enabled: chapter.readingExerciseMode === "embedded",
            countsByType: chapter.readingExerciseMode === "embedded" ? defaultEmbeddedCounts(recommendedCount(initialState.course.durationMinutes, "embedded")) : { choice: 0, blank: 0, vocab: 0 },
          };
        } else preserved = true;
        if (!chapter.touched.chapterPractice) {
          next.chapterPractice = {
            enabled: chapter.chapterPractice.enabled,
            countsByType: chapter.chapterPractice.enabled ? defaultPracticeCounts(recommendedCount(initialState.course.durationMinutes, "chapter")) : { choice: 0, blank: 0, vocab: 0, matching: 0 },
          };
        } else preserved = true;
        return next;
      });
      const afterClassPractice = current.afterClassPractice.touched.practice
        ? current.afterClassPractice
        : {
            ...current.afterClassPractice,
            practice: {
              enabled: current.afterClassPractice.practice.enabled,
              countsByType: current.afterClassPractice.practice.enabled ? defaultPracticeCounts(recommendedCount(initialState.course.durationMinutes, "afterClass")) : { choice: 0, blank: 0, vocab: 0, matching: 0 },
            },
          };
      if (current.afterClassPractice.touched.practice) preserved = true;
      setKeptManualHint(preserved);
      return { ...current, englishLevel: level, chapters, afterClassPractice };
    });
    setActivePanel("chapters");
  }

  function applyCurrentChapterToAll() {
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
            chapterPractice: {
              enabled: source.chapterPractice.enabled,
              countsByType: { ...source.chapterPractice.countsByType },
            },
            touched: {
              ...chapter.touched,
              targetWordCount: true,
              readingExerciseMode: true,
              embeddedExercises: true,
              chapterPractice: true,
            },
          };
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

  useEffect(() => {
    levelButtonRefs.current[initialFocusLevel.current]?.focus();
  }, []);

  useEffect(() => {
    if (activePanel !== "level") return;
    levelButtonRefs.current[plan.englishLevel ?? initialFocusLevel.current]?.focus();
  }, [activePanel, plan.englishLevel]);

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
          <span className={cn("rounded-full px-3 py-1.5 text-xs font-medium", saveStatus === "failed" ? "bg-red-50 text-red-700" : saveStatus === "saving" ? "bg-primary-50 text-primary-700" : "bg-muted text-muted-foreground")}>{saveStatusLabel(saveStatus)}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg bg-card p-3 shadow-sm">
            <div aria-label="教学规划配置" className="space-y-2" role="tablist">
              <PanelTab
                active={activePanel === "level"}
                label="难度"
                onClick={() => setActivePanel("level")}
                summary={plan.englishLevel ?? "未选择"}
              />
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
                summary={plan.afterClassPractice.enabled ? `开启 · ${totalCount(plan.afterClassPractice.practice.countsByType)} 题` : "关闭"}
              />
            </div>
          </section>
          {activePanel === "chapters" ? (
            <section className="rounded-lg bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="text-sm font-semibold text-foreground">章节</div>
                <div className="text-xs font-medium text-muted-foreground">词数 · 知识点 · 题型</div>
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
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                        <span className={cn("rounded bg-muted px-2 py-1 text-center font-medium", chapter.targetWordCount ? "text-foreground" : "text-muted-foreground")}>{chapter.targetWordCount ?? "-"} 词</span>
                        <span className={cn("rounded bg-muted px-2 py-1 text-center font-medium", chapter.knowledgePointIds.length ? "text-foreground" : "text-muted-foreground")}>{chapter.knowledgePointIds.length} 个</span>
                        <span className="rounded bg-muted px-2 py-1 text-center font-medium text-muted-foreground">{chapter.readingExerciseMode === "embedded" ? `${totalCount(chapter.embeddedExercises.countsByType) || 0} 内嵌` : "无内嵌"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>

        <main className="min-w-0 space-y-5">
          {activePanel === "level" ? (
            <LevelEditor
              englishLevel={plan.englishLevel}
              keptManualHint={keptManualHint}
              levelButtonRefs={levelButtonRefs}
              onApplyLevel={applyLevel}
            />
          ) : null}

          {activePanel === "chapters" && selectedChapter && selectedOutlineChapter ? (
            <ChapterEditor
              chapter={selectedChapter}
              index={selectedChapterIndex}
              knowledgePoints={initialState.knowledgePoints}
              onApplyToAll={applyCurrentChapterToAll}
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

function LevelEditor({ englishLevel, keptManualHint, levelButtonRefs, onApplyLevel }: {
  englishLevel: EnglishLevel | null;
  keptManualHint: boolean;
  levelButtonRefs: React.MutableRefObject<Partial<Record<EnglishLevel, HTMLButtonElement | null>>>;
  onApplyLevel: (level: EnglishLevel) => void;
}) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">全局设置</h3>
          {keptManualHint ? <p className="mt-1 text-xs text-amber-700">部分配置保留了你的修改。</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {levels.map((level) => (
            <button
              aria-pressed={englishLevel === level}
              className={cn("min-h-9 rounded-md border px-3 text-sm font-semibold transition-colors", englishLevel === level ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary-300 hover:text-foreground")}
              key={level}
              onClick={() => onApplyLevel(level)}
              ref={(element) => {
                levelButtonRefs.current[level] = element;
              }}
              type="button"
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChapterEditor({ chapter, outline, index, knowledgePoints, onApplyToAll, onChange }: {
  chapter: TeachingPlanChapter;
  outline: TeachingPlanState["outline"]["chapters"][number];
  index: number;
  knowledgePoints: TeachingPlanState["knowledgePoints"];
  onApplyToAll: () => void;
  onChange: (updater: (chapter: TeachingPlanChapter) => TeachingPlanChapter) => void;
}) {
  const chapterLabel = `第 ${index + 1} 章`;
  const [pickerOpen, setPickerOpen] = useState(false);
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
              <Button onClick={onApplyToAll} size="sm" type="button" variant="outline">应用到所有章节</Button>
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
              <Button onClick={() => setPickerOpen(true)} size="sm" type="button" variant="outline">从语法库选择</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {chapter.knowledgePointIds.length ? chapter.knowledgePointIds.map((id) => {
                const point = knowledgePoints.find((item) => item.id === id);
                const label = point?.label ?? id;
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700" key={id}>
                    {label}
                    <button
                      aria-label={`删除知识点 ${label}`}
                      className="rounded-full p-0.5 text-primary-700 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onChange((current) => ({ ...current, knowledgePointIds: current.knowledgePointIds.filter((pointId) => pointId !== id) }))}
                      type="button"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                );
              }) : <span className="text-sm text-muted-foreground">未选择</span>}
            </div>
            {chapter.knowledgePointIds.length > 3 ? <p className="mt-2 text-sm text-amber-700">建议一章不超过 3 个知识点。</p> : null}
          </div>
          {pickerOpen ? (
            <GrammarLibraryPicker
              knowledgePoints={knowledgePoints}
              onApply={(ids) => {
                onChange((current) => ({ ...current, knowledgePointIds: ids }));
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
            <span className="text-xs font-medium text-muted-foreground">题型提示</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button aria-pressed={chapter.readingExerciseMode === "none"} className={cn("min-h-10 rounded-md text-sm font-medium", chapter.readingExerciseMode === "none" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70")} onClick={() => onChange((current) => ({ ...current, readingExerciseMode: "none", embeddedExercises: { enabled: false, countsByType: { choice: 0, blank: 0, vocab: 0 } }, touched: { ...current.touched, readingExerciseMode: true, embeddedExercises: true } }))} type="button">无题目</button>
            <button aria-pressed={chapter.readingExerciseMode === "embedded"} className={cn("min-h-10 rounded-md text-sm font-medium", chapter.readingExerciseMode === "embedded" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70")} onClick={() => onChange((current) => ({ ...current, readingExerciseMode: "embedded", embeddedExercises: { enabled: true, countsByType: current.embeddedExercises.countsByType }, touched: { ...current.touched, readingExerciseMode: true, embeddedExercises: true } }))} type="button">加入内嵌题</button>
          </div>
          {chapter.readingExerciseMode === "embedded" ? <ExerciseConfigEditor allowedTypes={embeddedTypes} ariaPrefix={`${chapterLabel}内嵌题`} config={chapter.embeddedExercises} max={8} onChange={(config) => onChange((current) => ({ ...current, embeddedExercises: config, touched: { ...current.touched, embeddedExercises: true } }))} /> : null}
        </div>

        <div className="rounded-lg bg-card p-5 shadow-sm">
          <ToggleHeader enabled={chapter.chapterPractice.enabled} label="章节练习" onChange={(enabled) => onChange((current) => ({ ...current, chapterPractice: { ...current.chapterPractice, enabled }, touched: { ...current.touched, chapterPractice: true } }))} />
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
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <button aria-pressed={enabled} className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} onClick={() => onChange(!enabled)} type="button">{enabled ? "开启" : "关闭"}</button>
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
      {selectedTypes.length ? (
        <div className="space-y-2">
          {selectedTypes.map((type) => (
            <div className="grid gap-3 rounded-md border border-primary-200 bg-primary-50/40 p-3 transition-colors sm:grid-cols-[minmax(0,1fr)_176px_36px]" key={type}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">{typeLabels[type]}</div>
                  <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">{typeHints[type]}</span>
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
                <button aria-label={`添加${typeHints[type]}`} className="rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-50" key={type} onClick={() => { onChange(type, Math.min(max, initialCountForType(type))); setAdding(false); }} type="button">
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
  return (
    <section className="rounded-lg bg-card p-5 shadow-sm">
      <ToggleHeader enabled={plan.afterClassPractice.enabled} label="全课课后练习" onChange={(enabled) => onChange((current) => ({ ...current, enabled }))} />
      {afterClassNeedsReview ? <p className="mt-3 text-sm text-amber-700">课后练习知识点可能需要检查。</p> : null}
      {plan.afterClassPractice.enabled ? (
        <>
          <div className="mt-5 text-sm font-medium text-foreground">知识点</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {availablePoints.map((point) => (
              <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background text-muted-foreground hover:border-primary-200 hover:text-foreground")} key={point.id}>
                <input checked={plan.afterClassPractice.knowledgePointIds.includes(point.id)} className="sr-only" onChange={() => onChange((current) => ({ ...current, knowledgePointIds: current.knowledgePointIds.includes(point.id) ? current.knowledgePointIds.filter((id) => id !== point.id) : [...current.knowledgePointIds, point.id], touched: { ...current.touched, knowledgePointIds: true } }))} type="checkbox" />
                {plan.afterClassPractice.knowledgePointIds.includes(point.id) ? <Check className="size-3.5" /> : null}
                {point.label}
              </label>
            ))}
          </div>
          <PracticeConfigEditor ariaPrefix="课后练习" config={plan.afterClassPractice.practice} max={20} onChange={(practice) => onChange((current) => ({ ...current, practice, touched: { ...current.touched, practice: true } }))} />
        </>
      ) : null}
    </section>
  );
}
