"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpenText, Check, ChevronRight, Clock3, Loader2, Minus, PencilLine, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import { KnowledgePointPickerDialog } from "@/features/courses/components/knowledge-point-picker-dialog";
import type {
  GrammarExerciseType,
  GrammarPracticeConfig,
  ReadingExerciseMode,
  TeachingPlan,
  TeachingPlanChapter,
  TeachingPlanState,
} from "@/lib/contracts/api";
import { grammarExerciseTotal, MAX_CHAPTER_TARGET_WORD_COUNT, MIN_CHAPTER_TARGET_WORD_COUNT, minimumReadingParagraphCount, practicePageCount, readingExerciseTotal, readingPageCount } from "@/lib/domain/teaching-plan-policy";
import { cn } from "@/lib/utils";
import { readJsonResponse } from "@/lib/utils/response-json";

const grammarLabels: Record<GrammarExerciseType, string> = { optionCloze: "选项填空", wordForm: "给词变形" };
const grammarExamples: Record<GrammarExerciseType, string> = {
  optionCloze: "举例：Summer ______ (found / lost / painted) the glowing map.",
  wordForm: "举例：Yesterday, Mia ______ (find) the hidden door.",
};
const vocabularyExample = "举例：The map showed a secret ______ (路线，5个字母).";

function unionKnowledgePointIds(chapters: TeachingPlanChapter[]) {
  return [...new Set(chapters.flatMap((chapter) => chapter.knowledgePointIds))];
}

type SaveStatus = "saved" | "dirty" | "saving" | "failed";
type ActivePanel = "chapters" | "afterClass";

function chapterReady(chapter: TeachingPlanChapter) {
  return Boolean(chapter.targetWordCount && chapter.knowledgePointIds.length);
}

function saveStatusLabel(status: SaveStatus, incomplete = false) {
  if (incomplete) return "待完善";
  return status === "dirty" ? "未保存" : status === "saving" ? "正在保存..." : status === "failed" ? "保存失败" : "已自动保存";
}

function hasValidExercisePlan(plan: TeachingPlan) {
  const chaptersValid = plan.chapters.every((chapter) => {
    const readingCount = grammarExerciseTotal(chapter.readingExercises.grammar);
    const practiceCount = grammarExerciseTotal(chapter.chapterPractice.grammar);
    return chapter.readingExercises.enabled
      && readingCount >= Math.max(1, chapter.knowledgePointIds.length)
      && (!chapter.chapterPractice.enabled || practiceCount >= Math.max(1, chapter.knowledgePointIds.length));
  });
  if (!chaptersValid) return false;
  if (!plan.afterClassPractice.enabled) return true;
  if (!plan.afterClassPractice.practice.enabled) return plan.afterClassPractice.vocabularyReviewEnabled;
  return grammarExerciseTotal(plan.afterClassPractice.practice.grammar) >= Math.max(1, plan.afterClassPractice.knowledgePointIds.length);
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
  const [downstreamConfirmOpen, setDownstreamConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [affectedResources, setAffectedResources] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const hasMounted = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  const selectedChapter = plan.chapters[selectedChapterIndex];
  const selectedOutlineChapter = initialState.outline.chapters[selectedChapterIndex];
  const readyChapterCount = plan.chapters.filter(chapterReady).length;
  const courseKnowledgePointCount = unionKnowledgePointIds(plan.chapters).length;
  const exercisePlanValid = hasValidExercisePlan(plan);
  const confirmHint = plan.englishLevel
    ? `章节 ${readyChapterCount}/${plan.chapters.length} · ${plan.afterClassPractice.enabled ? "课后练习已开启" : "课后练习不生成"}`
    : "还需选择英语难度";
  const afterClassNeedsReview = useMemo(() => {
    if (!plan.afterClassPractice.touched.knowledgePointIds) return false;
    const union = new Set(unionKnowledgePointIds(plan.chapters));
    return plan.afterClassPractice.knowledgePointIds.some((id) => !union.has(id));
  }, [plan.afterClassPractice.knowledgePointIds, plan.afterClassPractice.touched.knowledgePointIds, plan.chapters]);
  const unrecommendedSelectedKnowledgePointIds = useMemo(() => {
    const recommended = new Set(initialState.outline.chapters.flatMap((chapter) => chapter.recommendedKnowledgePointIds));
    return (initialState.course.knowledgePointIds ?? []).filter((id) => !recommended.has(id));
  }, [initialState.course.knowledgePointIds, initialState.outline.chapters]);

  function updatePlan(updater: (current: TeachingPlan) => TeachingPlan) {
    setError("");
    setSaveStatus("dirty");
    setPlan((current) => ({ ...updater(current), status: "draft", confirmedAt: null }));
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
            paragraphCount: source.paragraphCount,
            readingExerciseMode: source.readingExerciseMode,
            readingExercises: {
              enabled: source.readingExercises.enabled,
              grammar: { ...source.readingExercises.grammar },
              vocabulary: { ...source.readingExercises.vocabulary },
            },
            touched: {
              ...chapter.touched,
              targetWordCount: true,
              paragraphCount: false,
              readingExerciseMode: true,
              readingExercises: true,
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
            grammar: { ...source.chapterPractice.grammar },
          },
          touched: { ...chapter.touched, chapterPractice: true },
        }),
      };
    });
  }

  const saveDraft = useCallback((targetPlan: TeachingPlan) => {
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaveStatus("saving");
    setError("");
    const operation = (async () => {
      try {
        const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: targetPlan }),
          signal: controller.signal,
        });
        const data = await readJsonResponse<{ plan?: TeachingPlan; message?: string }>(response);
        if (!response.ok || !data.plan) throw new Error(data.message || "保存失败，请重试。");
        setPlan(data.plan);
        setSaveStatus("saved");
        return true;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return false;
        setSaveStatus("failed");
        setError(caught instanceof Error ? caught.message : "保存失败，请重试。");
        return false;
      }
    })();
    saveInFlight.current = operation;
    return operation;
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
    const beforeUnload = (event: BeforeUnloadEvent) => { if (saveStatus !== "saved") event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saveStatus]);

  async function navigate(href: string) {
    if (saveStatus !== "saved" && !(await saveDraft(plan))) return;
    router.push(href);
  }

  async function confirmPlan(downstreamAction: "check" | "preserve" | "clear" = "check") {
    if (!exercisePlanValid) {
      setActivePanel("chapters");
      setError("");
      return;
    }
    setConfirming(true);
    setError("");
    try {
      if (saveStatus === "saving" && saveInFlight.current) await saveInFlight.current;
      if (saveStatus !== "saved" && !(await saveDraft(plan))) return;
      const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downstreamAction }),
      });
      const data = await readJsonResponse<{ plan?: TeachingPlan; course?: { id: string; currentStage: string }; message?: string; requiresReset?: boolean; affectedResources?: string[] }>(response);
      if (response.status === 409 && data.requiresReset) {
        setAffectedResources(data.affectedResources ?? ["文案与练习", "视觉资源和图片", "预览发布设置"]);
        setDownstreamConfirmOpen(true);
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

  function advanceToContent() {
    if (plan.status === "confirmed" && saveStatus === "saved") {
      router.push(`/courses/${initialState.course.id}/create/content`);
      return;
    }
    void confirmPlan();
  }

  async function resetPlan() {
    saveController.current?.abort();
    setResetting(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan/reset`, { method: "POST" });
      const data = await readJsonResponse<{ plan?: TeachingPlan; message?: string }>(response);
      if (!response.ok || !data.plan) throw new Error(data.message || "教学规划重置失败，请重试。");
      setPlan(data.plan);
      setSelectedChapterIndex(0);
      setActivePanel("chapters");
      setSaveStatus("saved");
      setResetConfirmOpen(false);
    } catch (caught) {
      setSaveStatus("failed");
      setError(caught instanceof Error ? caught.message : "教学规划重置失败，请重试。");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CourseCreateSteps currentStep={3} courseId={initialState.course.id} furthestStep={plan.status === "confirmed" ? courseStageStep(initialState.course.currentStage) : 3} onNavigate={(href) => void navigate(href)} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">教学规划</p>
          <h2 className="mt-1 truncate text-2xl font-semibold text-foreground">{initialState.outline.title}</h2>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap text-sm">
          <Button disabled={confirming || resetting || saveStatus === "saving"} onClick={() => setResetConfirmOpen(true)} size="sm" type="button" variant="outline"><RotateCcw className="size-4" />重置教学规划</Button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-medium text-muted-foreground"><Clock3 className="size-4" />{initialState.course.durationMinutes} 分钟</span>
          <span className="rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700">{initialState.course.englishLevel}</span>
          <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">全课 {courseKnowledgePointCount} 个知识点</span>
          <span className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium", saveStatus === "failed" ? "bg-red-50 text-red-700" : !exercisePlanValid ? "bg-amber-50 text-amber-800" : saveStatus === "saving" ? "bg-primary-50 text-primary-700" : "bg-muted text-muted-foreground")}>{saveStatusLabel(saveStatus, !exercisePlanValid)}</span>
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
                summary={`课后阅读 ${plan.mainIdeaTargetWordCount ?? 120} 词 · ${plan.afterClassPractice.enabled ? plan.afterClassPractice.practice.enabled ? `${grammarExerciseTotal(plan.afterClassPractice.practice.grammar)} 道语法题${plan.afterClassPractice.vocabularyReviewEnabled ? " + 词汇复习" : ""}` : "仅词汇复习" : "无课后练习"}`}
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
                        <div>{chapter.targetWordCount ? `${chapter.targetWordCount} 词 · ${readingPageCount(chapter.targetWordCount, chapter.readingExercises, chapter.paragraphCount)} 个正文段落` : "词数未设置"} · {chapter.knowledgePointIds.length} 个知识点</div>
                        <div>{chapter.readingExerciseMode === "interactive" ? `边读边练 ${readingExerciseTotal(chapter.readingExercises)} 题` : `完整阅读 ${readingExerciseTotal(chapter.readingExercises)} 题`} · {chapter.chapterPractice.enabled ? `章节练习 ${grammarExerciseTotal(chapter.chapterPractice.grammar)} 题 / ${practicePageCount(chapter.chapterPractice.grammar)} 页` : "无章节练习"}</div>
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
              unrecommendedSelectedKnowledgePointIds={unrecommendedSelectedKnowledgePointIds}
              onApplyChapterPracticeToAll={applyCurrentChapterPracticeToAll}
              onApplyReadingToAll={applyCurrentChapterReadingToAll}
              onChange={(updater) => updateChapter(selectedChapterIndex, updater)}
              outline={selectedOutlineChapter}
            />
          ) : null}

          {activePanel === "afterClass" ? (
            <>
              <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-base font-semibold text-foreground">课后阅读</h3><p className="mt-1 text-sm text-muted-foreground">Main Idea Reading Practice</p></div><label className="flex items-center gap-2 text-sm font-medium text-foreground"><input aria-label="课后阅读目标词数" className="h-9 w-24 rounded-md border border-input bg-card px-2 text-center font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" max={150} min={80} onChange={(event) => updatePlan((current) => ({ ...current, mainIdeaTargetWordCount: Number(event.target.value) }))} type="number" value={plan.mainIdeaTargetWordCount ?? 120} />词</label></div>
                <p className="mt-3 text-xs text-muted-foreground">可设置 80–150 词，默认 120 词；用于 Step 4 生成和修改课后阅读。</p>
              </section>
              <AfterClassEditor
                afterClassNeedsReview={afterClassNeedsReview}
                knowledgePointIds={unionKnowledgePointIds(plan.chapters)}
                knowledgePoints={initialState.knowledgePoints}
                onChange={(updater) => updatePlan((current) => ({ ...current, afterClassPractice: updater(current.afterClassPractice) }))}
                plan={plan}
              />
            </>
          ) : null}
        </main>
      </div>

      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-md sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{confirmHint}</p>
          {error ? <p className="mt-0.5 text-xs text-red-700" role="alert">{error}</p> : <p className={cn("mt-0.5 text-xs", saveStatus === "failed" ? "text-red-700" : !exercisePlanValid ? "text-amber-700" : "text-muted-foreground")}>{saveStatusLabel(saveStatus, !exercisePlanValid)}</p>}
        </div>
        <div className="flex gap-2">
          <Button disabled={confirming || saveStatus === "saving"} onClick={() => void navigate(`/courses/${initialState.course.id}/create/story-outline`)} type="button" variant="outline"><ArrowLeft className="size-4" />上一步</Button>
          <Button disabled={confirming || !exercisePlanValid} onClick={advanceToContent} type="button">{confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{confirming ? "确认中" : plan.status === "confirmed" ? "进入文案与练习" : "确认并进入文案与练习"}</Button>
        </div>
      </div>
      <Dialog description="将放弃本阶段的手动调整" onClose={() => setResetConfirmOpen(false)} open={resetConfirmOpen} title="重置教学规划？">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-sm leading-6 text-muted-foreground">将根据当前故事大纲和 AI 推荐重新创建教学规划草稿。Step 3 中手动修改的词数、知识点和练习设置会被清除，后续已有内容暂时保留。</p>
          <div className="flex justify-end gap-2">
            <Button disabled={resetting} onClick={() => setResetConfirmOpen(false)} type="button" variant="outline">取消</Button>
            <Button disabled={resetting} onClick={() => void resetPlan()} type="button" variant="destructive">{resetting ? <Loader2 className="size-4 animate-spin" /> : null}确认重置</Button>
          </div>
        </div>
      </Dialog>
      <Dialog description="后续已有内容可能不再适配新的教学规划" onClose={() => setDownstreamConfirmOpen(false)} open={downstreamConfirmOpen} title="当前配置已变更">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>检测到后续流程中已有以下内容：</p>
            <ul className="list-disc pl-5 text-foreground">{affectedResources.map((item) => <li key={item}>{item}</li>)}</ul>
            <p>两种选择都会应用当前教学规划。保留后可以继续使用已有内容，但它们可能与新配置不一致；清空后可按新配置重新生成。</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={confirming} onClick={() => { setDownstreamConfirmOpen(false); void confirmPlan("preserve"); }} type="button" variant="outline">保留后续内容并继续</Button>
            <Button disabled={confirming} onClick={() => { setDownstreamConfirmOpen(false); void confirmPlan("clear"); }} type="button" variant="destructive">清空后续内容并继续</Button>
          </div>
        </div>
      </Dialog>
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

function ChapterEditor({ chapter, outline, index, knowledgePoints, unrecommendedSelectedKnowledgePointIds, onApplyReadingToAll, onApplyChapterPracticeToAll, onChange }: {
  chapter: TeachingPlanChapter;
  outline: TeachingPlanState["outline"]["chapters"][number];
  index: number;
  knowledgePoints: TeachingPlanState["knowledgePoints"];
  unrecommendedSelectedKnowledgePointIds: string[];
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
                  <input aria-label={`${chapterLabel}目标词数`} className="h-9 w-20 rounded-md border border-input bg-card px-2 text-center text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" max={MAX_CHAPTER_TARGET_WORD_COUNT} min={MIN_CHAPTER_TARGET_WORD_COUNT} onChange={(event) => onChange((current) => { const targetWordCount = Number(event.target.value); return { ...current, targetWordCount, paragraphCount: minimumReadingParagraphCount(targetWordCount, current.readingExercises), touched: { ...current.touched, targetWordCount: true } }; })} type="number" value={chapter.targetWordCount ?? ""} />
                  <span className="text-sm text-muted-foreground">词</span>
                </span>
              </label>
              <div className="rounded-md border border-input bg-background px-3 py-2">
                <span className="block text-xs font-medium text-muted-foreground">正文段落</span>
                <span className="mt-1 flex items-center gap-2">
                  <output aria-label={`${chapterLabel}正文段落数`} className="flex h-9 min-w-16 items-center justify-center rounded-md bg-muted px-3 text-sm font-semibold tabular-nums text-foreground">{chapter.paragraphCount} 段</output>
                </span>
              </div>
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
                const label = point ? knowledgePointName(point) : id;
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
            <KnowledgePointPickerDialog
              description="按类别选择本章教学目标；可使用完整语法库，不受 Step 1 预选范围限制。"
              highlightedIds={unrecommendedSelectedKnowledgePointIds}
              knowledgePoints={knowledgePoints}
              onConfirm={(ids) => {
                onChange((current) => ({ ...current, knowledgePointIds: ids, touched: { ...current.touched, knowledgePointIds: !sameIdSet(ids, recommendedIds) } }));
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
              selectedIds={chapter.knowledgePointIds}
              title="选择本章知识点"
            />
          ) : null}
        </div>

        <div className="rounded-lg bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">正文模式</h4>
            <Button onClick={onApplyReadingToAll} size="sm" type="button" variant="outline">同步正文设置到全部章节</Button>
          </div>
          <div aria-label="正文模式" className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
            <ReadingModeOption
              checked={chapter.readingExerciseMode === "complete"}
              description="题目与答案自然融入正文，学生可以连续阅读。"
              icon={BookOpenText}
              name={`reading-mode-${chapter.outlineChapterId}`}
              onChange={() => onChange((current) => ({ ...current, readingExerciseMode: "complete", touched: { ...current.touched, readingExerciseMode: true } }))}
              title="完整阅读"
              value="complete"
              answerState="答案状态：直接显示"
            />
            <ReadingModeOption
              checked={chapter.readingExerciseMode === "interactive"}
              description="正文保留作答位置，学生在阅读过程中完成练习。"
              icon={PencilLine}
              name={`reading-mode-${chapter.outlineChapterId}`}
              onChange={() => onChange((current) => ({ ...current, readingExerciseMode: "interactive", touched: { ...current.touched, readingExerciseMode: true } }))}
              title="边读边练"
              value="interactive"
              answerState="答案状态：保留空位"
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{chapter.readingExerciseMode === "complete" ? "答案直接呈现在正文中，阅读更连贯。" : "正文保留作答位置，学生边读边完成。"}</p>
          <ReadingExerciseEditor ariaPrefix={`${chapterLabel}正文`} config={chapter.readingExercises} onChange={(readingExercises) => onChange((current) => ({ ...current, readingExercises, paragraphCount: minimumReadingParagraphCount(current.targetWordCount ?? 90, readingExercises), touched: { ...current.touched, readingExercises: true } }))} />
        </div>

        <div className="rounded-lg bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleHeader enabled={chapter.chapterPractice.enabled} label="章节练习" onChange={(enabled) => onChange((current) => ({ ...current, chapterPractice: { ...current.chapterPractice, enabled }, touched: { ...current.touched, chapterPractice: true } }))} />
            <Button onClick={onApplyChapterPracticeToAll} size="sm" type="button" variant="outline">同步章节练习到全部章节</Button>
          </div>
          {chapter.chapterPractice.enabled ? (
            <>
              <GrammarPracticeEditor ariaPrefix={`${chapterLabel}章节练习`} config={chapter.chapterPractice} max={20} onChange={(config) => onChange((current) => ({ ...current, chapterPractice: config, touched: { ...current.touched, chapterPractice: true } }))} />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReadingModeOption({ checked, title, description, answerState, name, value, icon: Icon, onChange }: {
  checked: boolean;
  title: string;
  description: string;
  answerState: string;
  name: string;
  value: ReadingExerciseMode;
  icon: typeof BookOpenText;
  onChange: () => void;
}) {
  return (
    <label className={cn("group relative flex min-h-36 cursor-pointer flex-col rounded-lg border-2 p-4 transition-colors duration-200", checked ? "border-primary bg-primary-50" : "border-border bg-background hover:border-primary-200 hover:bg-muted/30")}>
      <input checked={checked} className="sr-only" name={name} onChange={onChange} type="radio" value={value} />
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-md", checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground")}><Icon className="size-4.5" /></span>
        <span aria-hidden className={cn("flex size-5 items-center justify-center rounded-full border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
          {checked ? <Check className="size-3.5" /> : null}
        </span>
      </span>
      <span className="mt-3 text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-1 text-xs leading-5 text-muted-foreground">{description}</span>
      <span className={cn("mt-auto pt-3 text-xs font-semibold", checked ? "text-primary-700" : "text-muted-foreground")}>{answerState}</span>
    </label>
  );
}

function knowledgePointName(point: TeachingPlanState["knowledgePoints"][number]) {
  return point.labelZh ? `${point.labelZh} · ${point.label}` : point.label;
}

function ToggleHeader({ enabled, label, onChange }: { enabled: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <button aria-label={`${label}${enabled ? "已开启" : "已关闭"}`} aria-pressed={enabled} className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary-300 hover:text-foreground")} onClick={() => onChange(!enabled)} type="button">
        <span aria-hidden="true" className={cn("relative h-5 w-9 rounded-full transition-colors", enabled ? "bg-white/30" : "bg-muted")}><span className={cn("absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform", enabled ? "translate-x-4" : "translate-x-0")} /></span>
        <span className="min-w-12 text-center">{enabled ? "已开启" : "已关闭"}</span>
      </button>
    </div>
  );
}

function ReadingExerciseEditor({ config, ariaPrefix, onChange }: { config: TeachingPlanChapter["readingExercises"]; ariaPrefix: string; onChange: (config: TeachingPlanChapter["readingExercises"]) => void }) {
  const [adding, setAdding] = useState(false);
  const invalid = grammarExerciseTotal(config.grammar) < 1;
  const grammarRow = (type: GrammarExerciseType) => (
    <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_220px]" key={type}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{grammarLabels[type]}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{grammarExamples[type]}</div>
      </div>
      <div className="flex items-center justify-end gap-2"><Stepper ariaPrefix={ariaPrefix} label={grammarLabels[type]} max={8} onChange={(count) => onChange({ ...config, enabled: true, grammar: { ...config.grammar, [type]: count } })} value={config.grammar[type]} /><button aria-label={`${ariaPrefix}删除题型 ${grammarLabels[type]}`} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange({ ...config, grammar: { ...config.grammar, [type]: 0 } })} type="button"><X className="size-4" /></button></div>
    </div>
  );
  const missingGrammar = (["optionCloze", "wordForm"] as GrammarExerciseType[]).filter((type) => config.grammar[type] === 0);
  const vocabularyEnabled = config.vocabulary.chineseHint > 0;
  const hasMissing = missingGrammar.length > 0 || !vocabularyEnabled;
  return (
    <div className="mt-5 space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">语法</div>
        <div className="space-y-2">{config.grammar.optionCloze > 0 ? grammarRow("optionCloze") : null}{config.grammar.wordForm > 0 ? grammarRow("wordForm") : null}{!grammarExerciseTotal(config.grammar) ? <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-sm text-amber-800">至少添加一种语法题型，才能覆盖本章知识点。</div> : null}</div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">词汇词组</div>
        {vocabularyEnabled ? <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">中文提示写词</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{vocabularyExample}</div>
          </div>
          <div className="flex items-center justify-end gap-2"><Stepper ariaPrefix={ariaPrefix} label="中文提示写词" max={8} onChange={(count) => onChange({ ...config, enabled: true, vocabulary: { chineseHint: count } })} value={config.vocabulary.chineseHint} /><button aria-label={`${ariaPrefix}删除题型 中文提示写词`} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange({ ...config, vocabulary: { chineseHint: 0 } })} type="button"><X className="size-4" /></button></div>
        </div> : <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">当前不生成正文词汇题。</p>}
      </div>
      {hasMissing ? <div><Button aria-expanded={adding} onClick={() => setAdding((current) => !current)} size="sm" type="button" variant="outline"><Plus className="size-4" />添加正文题型</Button>{adding ? <div className="mt-2 grid gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-2">{missingGrammar.map((type) => <AddExerciseTypeCard example={grammarExamples[type]} key={type} label={grammarLabels[type]} onClick={() => { onChange({ ...config, enabled: true, grammar: { ...config.grammar, [type]: type === "optionCloze" ? 4 : 3 } }); setAdding(false); }} />)}{!vocabularyEnabled ? <AddExerciseTypeCard example={vocabularyExample} label="中文提示写词" onClick={() => { onChange({ ...config, enabled: true, vocabulary: { chineseHint: 3 } }); setAdding(false); }} /> : null}</div> : null}</div> : null}
      {invalid ? <p className="text-sm font-medium text-amber-700">至少保留一种语法题型</p> : <p className="text-xs text-muted-foreground">题型可按章节增删；词汇题不参与语法知识点覆盖。</p>}
    </div>
  );
}

function GrammarPracticeEditor({ config, max, ariaPrefix, onChange }: { config: GrammarPracticeConfig; max: number; ariaPrefix: string; onChange: (config: GrammarPracticeConfig) => void }) {
  const [adding, setAdding] = useState(false);
  const active = (["optionCloze", "wordForm"] as GrammarExerciseType[]).filter((type) => config.grammar[type] > 0);
  const missing = (["optionCloze", "wordForm"] as GrammarExerciseType[]).filter((type) => config.grammar[type] === 0);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">只考查语法知识点；每页最多 5 题，超出后均衡分页。</p>
      {active.map((type) => (
        <div className="grid gap-3 rounded-md border border-primary-200 bg-primary-50/40 p-3 sm:grid-cols-[minmax(0,1fr)_220px]" key={type}>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{grammarLabels[type]}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{grammarExamples[type]}</div>
          </div>
          <div className="flex items-center justify-end gap-2"><Stepper ariaPrefix={ariaPrefix} label={grammarLabels[type]} max={max} onChange={(count) => onChange({ ...config, enabled: true, grammar: { ...config.grammar, [type]: count } })} value={config.grammar[type]} /><button aria-label={`${ariaPrefix}删除题型 ${grammarLabels[type]}`} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange({ ...config, grammar: { ...config.grammar, [type]: 0 } })} type="button"><X className="size-4" /></button></div>
        </div>
      ))}
      {!active.length ? <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-sm text-amber-800">已开启练习，请至少添加一种语法题型。</div> : null}
      {missing.length ? <div><Button aria-expanded={adding} onClick={() => setAdding((current) => !current)} size="sm" type="button" variant="outline"><Plus className="size-4" />添加{ariaPrefix.includes("章节") ? "章节练习" : "课后练习"}题型</Button>{adding ? <div className="mt-2 grid gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-2">{missing.map((type) => <AddExerciseTypeCard example={grammarExamples[type]} key={type} label={grammarLabels[type]} onClick={() => { onChange({ ...config, enabled: true, grammar: { ...config.grammar, [type]: 5 } }); setAdding(false); }} />)}</div> : null}</div> : null}
      <p className="text-xs font-medium text-muted-foreground">预计 {practicePageCount(config.grammar)} 页</p>
    </div>
  );
}

function AddExerciseTypeCard({ label, example, onClick }: { label: string; example: string; onClick: () => void }) {
  return (
    <button aria-label={`添加${label}`} className="min-h-24 rounded-md border border-border bg-background p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-primary-200 hover:bg-primary-50/50 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onClick} type="button">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground"><Plus className="size-4 text-primary" />添加{label}</span>
      <span className="mt-2 block text-xs leading-5 text-muted-foreground">{example}</span>
    </button>
  );
}

function Stepper({ ariaPrefix, label, value, max, onChange }: { ariaPrefix: string; label: string; value: number; max: number; onChange: (count: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button aria-label={`${ariaPrefix}${label}减少`} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary-200 hover:text-foreground" onClick={() => onChange(Math.max(1, value - 1))} type="button"><Minus className="size-4" /></button>
      <input aria-label={`${ariaPrefix}${label}数量`} className="h-8 w-14 rounded-md border border-input bg-background text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" max={max} min={1} onChange={(event) => onChange(Math.max(1, Math.min(max, Number(event.target.value) || 1)))} type="number" value={value} />
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
  const decisionMade = true;
  const includesVocabularyReview = plan.chapters.some((chapter) => chapter.readingExercises.vocabulary.chineseHint > 0);
  return (
    <section className="rounded-lg bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-foreground">课后练习</h3>
        <p className="mt-1 text-sm text-muted-foreground">默认不生成；需要时可主动开启。</p>
      </div>
      {!decisionMade ? <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">请选择是否生成课后练习</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button aria-pressed={decisionMade && plan.afterClassPractice.enabled} className={cn("min-h-11 rounded-md text-sm font-semibold transition-colors", decisionMade && plan.afterClassPractice.enabled ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} onClick={() => onChange((current) => ({ ...current, enabled: true, vocabularyReviewEnabled: includesVocabularyReview, knowledgePointIds: !current.knowledgePointIds.length || !current.touched.knowledgePointIds ? knowledgePointIds : current.knowledgePointIds, practice: { enabled: !includesVocabularyReview, grammar: grammarExerciseTotal(current.practice.grammar) ? current.practice.grammar : { optionCloze: 5, wordForm: 5 } }, touched: { ...current.touched, practice: true } }))} type="button">生成课后练习</button>
        <button aria-pressed={decisionMade && !plan.afterClassPractice.enabled} className={cn("min-h-11 rounded-md text-sm font-semibold transition-colors", decisionMade && !plan.afterClassPractice.enabled ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} onClick={() => onChange((current) => ({ ...current, enabled: false, vocabularyReviewEnabled: false, practice: { ...current.practice, enabled: false }, touched: { ...current.touched, practice: true } }))} type="button">不生成课后练习</button>
      </div>
      {afterClassNeedsReview ? <p className="mt-3 text-sm text-amber-700">课后练习知识点可能需要检查。</p> : null}
      {decisionMade && plan.afterClassPractice.enabled ? (
        <>
          <div className="mt-5 space-y-3">
            <div className={cn("rounded-md border p-4", plan.afterClassPractice.vocabularyReviewEnabled ? "border-primary-200 bg-primary-50/50" : "border-border bg-background")}>
              <ToggleHeader enabled={plan.afterClassPractice.vocabularyReviewEnabled} label="词汇复习" onChange={(vocabularyReviewEnabled) => onChange((current) => ({ ...current, enabled: vocabularyReviewEnabled || current.practice.enabled, vocabularyReviewEnabled, touched: { ...current.touched, practice: true } }))} />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">从各章节正文的词汇习题自动汇总并去重，生成中英配对复习；不与语法知识点联动，也无需设置题量。</p>
            </div>
            <div className={cn("rounded-md border p-4", plan.afterClassPractice.practice.enabled ? "border-primary-200 bg-primary-50/50" : "border-border bg-background")}>
              <ToggleHeader enabled={plan.afterClassPractice.practice.enabled} label="语法习题" onChange={(enabled) => onChange((current) => ({ ...current, enabled: current.vocabularyReviewEnabled || enabled, practice: { ...current.practice, enabled }, touched: { ...current.touched, practice: true } }))} />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">仅本模块与下方语法知识点联动，按所选知识点生成选项填空或给词填空。</p>
              {plan.afterClassPractice.practice.enabled ? <>
                <div className="mt-5 border-t border-primary-100 pt-4 text-sm font-medium text-foreground">课后考查知识点</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">已默认选中各章节使用的知识点；取消勾选即可排除不需要考查的内容。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {availablePoints.map((point) => (
                    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background text-muted-foreground hover:border-primary-200 hover:text-foreground")} key={point.id}>
                      <input checked={plan.afterClassPractice.knowledgePointIds.includes(point.id)} className="sr-only" onChange={() => onChange((current) => ({ ...current, knowledgePointIds: current.knowledgePointIds.includes(point.id) ? current.knowledgePointIds.filter((id) => id !== point.id) : [...current.knowledgePointIds, point.id], touched: { ...current.touched, knowledgePointIds: true } }))} type="checkbox" />
                      <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded border", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{plan.afterClassPractice.knowledgePointIds.includes(point.id) ? <Check className="size-3.5" /> : null}</span>
                      <span className="min-w-0 flex-1 font-medium">{knowledgePointName(point)}</span>
                    </label>
                  ))}
                </div>
                <GrammarPracticeEditor ariaPrefix="课后练习" config={plan.afterClassPractice.practice} max={20} onChange={(practice) => onChange((current) => ({ ...current, enabled: current.vocabularyReviewEnabled || practice.enabled, practice, touched: { ...current.touched, practice: true } }))} />
              </> : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
