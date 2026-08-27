"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookOpenText, Check, ChevronDown, ChevronRight, Loader2, Minus, PencilLine, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import { CourseStaleNotice } from "@/features/courses/components/course-stale-notice";
import { KnowledgePointPickerDialog } from "@/features/courses/components/knowledge-point-picker-dialog";
import { OverflowingKnowledgePointTitle } from "@/features/grammar/components/overflowing-knowledge-point-title";
import type { GrammarExerciseType, GrammarPracticeConfig, ReadingExerciseMode, TeachingPlan, TeachingPlanChapter, TeachingPlanState } from "@/lib/contracts/api";
import { grammarExerciseTotal, MAX_CHAPTER_TARGET_WORD_COUNT, MIN_CHAPTER_TARGET_WORD_COUNT, minimumReadingParagraphCount, practicePageCount, readingExerciseTotal, readingPageCount } from "@/lib/domain/teaching-plan-policy";
import { storyComplexityLabel } from "@/lib/domain/story-length-policy";
import { cn } from "@/lib/utils";
import { readJsonResponse } from "@/lib/utils/response-json";

const grammarLabels: Record<GrammarExerciseType, string> = {
  optionCloze: "选项填空",
  wordForm: "给词变形",
};
const grammarExamples: Record<GrammarExerciseType, string> = {
  optionCloze: "举例：Summer ______ (found / lost / painted) the glowing map.",
  wordForm: "举例：Yesterday, Mia ______ (find) the hidden door.",
};
const vocabularyExample = "举例：The map showed a secret ______ (路线，5个字母).";

function unionKnowledgePointIds(chapters: TeachingPlanChapter[]) {
  return [...new Set(chapters.flatMap((chapter) => chapter.knowledgePointIds))];
}

type ActivePanel = "chapters" | "afterClass";
type MobileChapterSection = "goals" | "reading" | "practice";

function chapterReady(chapter: TeachingPlanChapter) {
  return Boolean(chapter.targetWordCount);
}

function compactTabClass(active: boolean) {
  return cn("min-h-11 rounded-md px-3 text-sm font-medium", active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70");
}

function hasValidExercisePlan(plan: TeachingPlan) {
  const chaptersValid = plan.chapters.every((chapter) => {
    const readingCount = grammarExerciseTotal(chapter.readingExercises.grammar);
    const practiceCount = grammarExerciseTotal(chapter.chapterPractice.grammar);
    if (!chapter.knowledgePointIds.length) return chapter.readingExercises.enabled && readingCount === 0 && !chapter.chapterPractice.enabled && practiceCount === 0;
    return chapter.readingExercises.enabled && readingCount >= chapter.knowledgePointIds.length && (!chapter.chapterPractice.enabled || practiceCount >= chapter.knowledgePointIds.length);
  });
  if (!chaptersValid || !plan.chapters.some((chapter) => chapter.knowledgePointIds.length)) return false;
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
  const [mobileChapterSection, setMobileChapterSection] = useState<MobileChapterSection>("goals");
  const [mobileChapterMenuOpen, setMobileChapterMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downstreamConfirmOpen, setDownstreamConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [affectedResources, setAffectedResources] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mobileChapterMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedChapter = plan.chapters[selectedChapterIndex];
  const selectedOutlineChapter = initialState.outline.chapters[selectedChapterIndex];
  const readyChapterCount = plan.chapters.filter(chapterReady).length;
  const courseKnowledgePointCount = unionKnowledgePointIds(plan.chapters).length;
  const grammarSource = initialState.knowledgePoints.find((point) => point.bookTitle);
  const exercisePlanValid = hasValidExercisePlan(plan);
  const confirmHint = plan.englishLevel ? `章节 ${readyChapterCount}/${plan.chapters.length} · ${plan.afterClassPractice.enabled ? "课后练习已开启" : "课后练习不生成"}` : "还需选择英语难度";
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
    setHasChanges(true);
    setPlan((current) => ({
      ...updater(current),
      status: "draft",
      confirmedAt: null,
    }));
  }

  function updateChapter(index: number, updater: (chapter: TeachingPlanChapter) => TeachingPlanChapter) {
    updatePlan((current) => {
      const chapters = current.chapters.map((chapter, chapterIndex) => (chapterIndex === index ? updater(chapter) : chapter));
      const nextUnion = unionKnowledgePointIds(chapters);
      const afterClassPractice = current.afterClassPractice.touched.knowledgePointIds ? current.afterClassPractice : { ...current.afterClassPractice, knowledgePointIds: nextUnion };
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
        chapters: current.chapters.map((chapter, index) =>
          index === selectedChapterIndex
            ? chapter
            : {
                ...chapter,
                chapterPractice: {
                  enabled: source.chapterPractice.enabled,
                  grammar: { ...source.chapterPractice.grammar },
                },
                touched: { ...chapter.touched, chapterPractice: true },
              },
        ),
      };
    });
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasChanges) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasChanges]);

  useEffect(() => {
    if (!mobileChapterMenuOpen) return;
    function closeMobileChapterMenu(event: KeyboardEvent | MouseEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setMobileChapterMenuOpen(false);
        return;
      }
      if (event.target instanceof Node && mobileChapterMenuRef.current?.contains(event.target)) return;
      setMobileChapterMenuOpen(false);
    }
    document.addEventListener("keydown", closeMobileChapterMenu);
    document.addEventListener("mousedown", closeMobileChapterMenu);
    return () => {
      document.removeEventListener("keydown", closeMobileChapterMenu);
      document.removeEventListener("mousedown", closeMobileChapterMenu);
    };
  }, [mobileChapterMenuOpen]);

  function navigate(href: string) {
    if (hasChanges) {
      setPendingNavigationHref(href);
      return;
    }
    router.push(href);
  }

  async function confirmPlan(downstreamAction: "check" | "preserve" = "check") {
    if (!exercisePlanValid) {
      setActivePanel("chapters");
      setError("");
      return;
    }
    setConfirming(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downstreamAction, plan }),
      });
      const data = await readJsonResponse<{
        plan?: TeachingPlan;
        course?: { id: string; currentStage: string };
        message?: string;
        requiresReset?: boolean;
        affectedResources?: string[];
      }>(response);
      if (response.status === 409 && data.requiresReset) {
        setAffectedResources(data.affectedResources ?? ["文案与练习", "视觉资源和图片", "预览发布设置"]);
        setDownstreamConfirmOpen(true);
        return;
      }
      if (!response.ok || !data.course) throw new Error(data.message || "教学规划确认失败");
      setHasChanges(false);
      router.push(`/courses/${initialState.course.id}/create/content`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "教学规划确认失败");
    } finally {
      setConfirming(false);
    }
  }

  function advanceToContent() {
    if (plan.status === "confirmed" && !hasChanges) {
      router.push(`/courses/${initialState.course.id}/create/content`);
      return;
    }
    void confirmPlan();
  }

  async function resetPlan() {
    setResetting(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/teaching-plan/reset`, { method: "POST" });
      const data = await readJsonResponse<{
        plan?: TeachingPlan;
        message?: string;
      }>(response);
      if (!response.ok || !data.plan) throw new Error(data.message || "教学规划重置失败，请重试。");
      setPlan(data.plan);
      setSelectedChapterIndex(0);
      setActivePanel("chapters");
      setHasChanges(false);
      setResetConfirmOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "教学规划重置失败，请重试。");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CourseCreateSteps currentStep={3} courseId={initialState.course.id} furthestStep={courseStageStep(initialState.course.currentStage)} onNavigate={navigate} />
      <CourseStaleNotice staleFromStage={initialState.course.staleFromStage} stage="teaching_plan" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3 sm:block">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">教学规划</p>
              <h2 className="mt-1 truncate text-xl font-semibold text-foreground sm:text-2xl">{initialState.outline.title}</h2>
              {grammarSource ? <p className="mt-1 text-xs text-muted-foreground">《{grammarSource.bookTitle}》 · {grammarSource.edition} · {grammarSource.officialLevel}</p> : null}
            </div>
            <Button className="shrink-0 lg:hidden" disabled={confirming || resetting} onClick={() => setResetConfirmOpen(true)} size="sm" type="button" variant="outline">
              <RotateCcw className="size-4" />
              重置
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 text-xs sm:justify-end sm:text-sm">
          <Button className="hidden lg:inline-flex" disabled={confirming || resetting} onClick={() => setResetConfirmOpen(true)} size="sm" type="button" variant="outline">
            <RotateCcw className="size-4" />
            重置教学规划
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5 font-medium text-muted-foreground sm:px-3">{storyComplexityLabel(initialState.lengthPolicy.storyComplexity)}</span>
          <span className="rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700">{initialState.course.englishLevel}</span>
          <span className="rounded-full bg-muted px-2.5 py-1.5 font-medium text-muted-foreground sm:px-3">全课 {courseKnowledgePointCount} 个知识点</span>
          <span className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium", !exercisePlanValid ? "bg-amber-50 text-amber-800" : hasChanges ? "bg-primary-50 text-primary-700" : "bg-muted text-muted-foreground")}>{!exercisePlanValid ? "待完善" : hasChanges ? "有未确认修改" : "已确认"}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5" data-testid="teaching-plan-layout">
        <div className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm lg:hidden" data-testid="teaching-plan-mobile-controls">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" data-testid="teaching-plan-mobile-panel-tabs" aria-label="教学规划配置">
            <button aria-pressed={activePanel === "chapters"} className={compactTabClass(activePanel === "chapters")} onClick={() => setActivePanel("chapters")} type="button">
              章节
            </button>
            <button aria-pressed={activePanel === "afterClass"} className={compactTabClass(activePanel === "afterClass")} onClick={() => setActivePanel("afterClass")} type="button">
              课后
            </button>
          </div>
          {activePanel === "chapters" ? (
            <div className="space-y-3">
              <div className="block" ref={mobileChapterMenuRef}>
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">当前章节</span>
                <button aria-controls="mobile-chapter-list" aria-expanded={mobileChapterMenuOpen} aria-haspopup="listbox" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm font-semibold text-foreground transition-colors hover:border-primary-200 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileChapterMenuOpen((open) => !open)} type="button">
                  <span className="min-w-0 truncate">
                    第 {selectedOutlineChapter?.order ?? selectedChapterIndex + 1}/{plan.chapters.length} 章 · {selectedOutlineChapter?.title ?? "未命名章节"}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", mobileChapterMenuOpen ? "rotate-180" : "")} />
                </button>
                {mobileChapterMenuOpen ? (
                  <div aria-label="移动端章节列表" className="mt-2 max-h-[40dvh] space-y-1 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-sm" id="mobile-chapter-list" role="listbox">
                    {plan.chapters.map((chapter, index) => {
                      const outline = initialState.outline.chapters[index];
                      const active = selectedChapterIndex === index;
                      return (
                        <button
                          aria-selected={active}
                          className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm transition-colors", active ? "bg-primary-50 font-semibold text-primary-700" : "text-foreground hover:bg-muted")}
                          key={chapter.outlineChapterId}
                          onClick={() => {
                            setSelectedChapterIndex(index);
                            setMobileChapterSection("goals");
                            setMobileChapterMenuOpen(false);
                          }}
                          role="option"
                          type="button"
                        >
                          <span className="min-w-0 truncate">
                            第 {outline.order}/{plan.chapters.length} 章 · {outline.title}
                          </span>
                          {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" data-testid="teaching-plan-mobile-section-tabs" aria-label="当前章节配置">
                <button aria-pressed={mobileChapterSection === "goals"} className={compactTabClass(mobileChapterSection === "goals")} onClick={() => setMobileChapterSection("goals")} type="button">
                  目标
                </button>
                <button aria-pressed={mobileChapterSection === "reading"} className={compactTabClass(mobileChapterSection === "reading")} onClick={() => setMobileChapterSection("reading")} type="button">
                  正文
                </button>
                <button aria-pressed={mobileChapterSection === "practice"} className={compactTabClass(mobileChapterSection === "practice")} onClick={() => setMobileChapterSection("practice")} type="button">
                  练习
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <aside className="hidden space-y-4 lg:block" data-testid="teaching-plan-desktop-sidebar">
          <section className="rounded-lg bg-card p-3 shadow-sm">
            <div aria-label="教学规划配置" className="space-y-2" role="tablist">
              <PanelTab active={activePanel === "chapters"} label="章节" onClick={() => setActivePanel("chapters")} summary={`${readyChapterCount}/${plan.chapters.length} 章 · 词数 · 知识点 · 题型`} />
              <PanelTab active={activePanel === "afterClass"} label="课后" onClick={() => setActivePanel("afterClass")} summary={`课后阅读 ${plan.mainIdeaTargetWordCount ?? 120} 词 · ${plan.afterClassPractice.enabled ? (plan.afterClassPractice.practice.enabled ? `${grammarExerciseTotal(plan.afterClassPractice.practice.grammar)} 道语法题${plan.afterClassPractice.vocabularyReviewEnabled ? " + 词汇复习" : ""}` : "仅词汇复习") : "无课后练习"}`} />
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
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                          第 {outline.order} 章 · {outline.title}
                        </span>
                        {chapterReady(chapter) ? <Check className="size-4 text-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      </div>
                      <div className="mt-2 space-y-1 text-xs font-medium text-muted-foreground">
                        <div>
                          {chapter.targetWordCount ? `${chapter.targetWordCount} 词 · ${readingPageCount(chapter.targetWordCount, chapter.readingExercises, chapter.paragraphCount)} 个正文段落` : "词数未设置"} · {chapter.knowledgePointIds.length} 个知识点
                        </div>
                        <div>
                          {chapter.readingExerciseMode === "interactive" ? `边读边练 ${readingExerciseTotal(chapter.readingExercises)} 题` : `完整阅读 ${readingExerciseTotal(chapter.readingExercises)} 题`} · {chapter.chapterPractice.enabled ? `章节练习 ${grammarExerciseTotal(chapter.chapterPractice.grammar)} 题 / ${practicePageCount(chapter.chapterPractice.grammar)} 页` : "无章节练习"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>

        <main className="min-w-0 space-y-5">
          {activePanel === "chapters" && selectedChapter && selectedOutlineChapter ? <ChapterEditor chapter={selectedChapter} index={selectedChapterIndex} knowledgePoints={initialState.knowledgePoints} lengthPolicy={initialState.lengthPolicy} unrecommendedSelectedKnowledgePointIds={unrecommendedSelectedKnowledgePointIds} mobileSection={mobileChapterSection} onApplyChapterPracticeToAll={applyCurrentChapterPracticeToAll} onApplyReadingToAll={applyCurrentChapterReadingToAll} onChange={(updater) => updateChapter(selectedChapterIndex, updater)} outline={selectedOutlineChapter} /> : null}

          {activePanel === "afterClass" ? (
            <>
              <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">课后阅读</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Main Idea Reading Practice</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      aria-label="课后阅读目标词数"
                      className="h-9 w-24 rounded-md border border-input bg-card px-2 text-center font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                      max={150}
                      min={80}
                      onChange={(event) =>
                        updatePlan((current) => ({
                          ...current,
                          mainIdeaTargetWordCount: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={plan.mainIdeaTargetWordCount ?? 120}
                    />
                    词
                  </label>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">可设置 80–150 词，默认 120 词；用于 Step 4 生成和修改课后阅读。</p>
              </section>
              <AfterClassEditor
                afterClassNeedsReview={afterClassNeedsReview}
                knowledgePointIds={unionKnowledgePointIds(plan.chapters)}
                knowledgePoints={initialState.knowledgePoints}
                onChange={(updater) =>
                  updatePlan((current) => ({
                    ...current,
                    afterClassPractice: updater(current.afterClassPractice),
                  }))
                }
                plan={plan}
              />
            </>
          ) : null}
        </main>
      </div>

      <div className="sticky bottom-3 flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-md sm:bottom-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="teaching-plan-bottom-summary">
          <span className="font-medium text-foreground">{confirmHint}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          {error ? (
            <span className="text-xs text-red-700" role="alert">
              {error}
            </span>
          ) : (
            <span className={cn("text-xs", !exercisePlanValid ? "text-amber-700" : "text-muted-foreground")}>{!exercisePlanValid ? "请完善后再确认" : hasChanges ? "确认后保存" : "当前规划已确认"}</span>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-2 sm:flex">
          <Button className="min-w-0 px-3" disabled={confirming} onClick={() => navigate(`/courses/${initialState.course.id}/create/story-outline`)} type="button" variant="outline">
            <ArrowLeft className="size-4" />
            <span className="truncate">上一步</span>
          </Button>
          <Button className="min-w-0 px-3" disabled={confirming || !exercisePlanValid} onClick={advanceToContent} type="button">
            {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            <span className="truncate">{confirming ? "确认中" : plan.status === "confirmed" ? "进入文案与练习" : "确认并进入文案与练习"}</span>
          </Button>
        </div>
      </div>
      <Dialog description="将放弃本阶段的手动调整" onClose={() => setResetConfirmOpen(false)} open={resetConfirmOpen} title="重置教学规划？">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-sm leading-6 text-muted-foreground">将删除当前教学规划，并按最新故事大纲重新创建。后续内容不会被删除，但仍会保留旧版本。</p>
          <div className="flex justify-end gap-2">
            <Button disabled={resetting} onClick={() => setResetConfirmOpen(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={resetting} onClick={() => void resetPlan()} type="button" variant="destructive">
              {resetting ? <Loader2 className="size-4 animate-spin" /> : null}
              删除并重置教学规划
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog description="本次修改尚未保存" onClose={() => setDownstreamConfirmOpen(false)} open={downstreamConfirmOpen} title="后续内容需要更新">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2 text-sm leading-6">
            <p className="text-muted-foreground">保存后，以下内容仍会保留修改前的版本：</p>
            <ul className="list-disc pl-5 text-foreground">
              {affectedResources.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-amber-950">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="text-sm leading-6">
              <p className="font-semibold">系统不会自动删除这些内容</p>
              <p className="text-amber-900">进入下一步后，请到对应阶段手动重置。</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={confirming}
              onClick={() => {
                setDownstreamConfirmOpen(false);
                void confirmPlan("preserve");
              }}
              type="button"
            >
              保存修改并继续
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog onClose={() => setPendingNavigationHref(null)} open={Boolean(pendingNavigationHref)} size="compact" title="放弃未保存的修改？">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-sm leading-6 text-muted-foreground">离开后，本页尚未确认的修改不会保留。</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPendingNavigationHref(null)} type="button" variant="outline">
              继续编辑
            </Button>
            <Button
              onClick={() => {
                const href = pendingNavigationHref;
                setPendingNavigationHref(null);
                if (href) router.push(href);
              }}
              type="button"
              variant="destructive"
            >
              放弃修改并离开
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function PanelTab({ active, label, summary, onClick }: { active: boolean; label: string; summary: string; onClick: () => void }) {
  return (
    <button aria-selected={active} className={cn("w-full rounded-md border p-3 text-left transition-colors", active ? "border-primary bg-primary-50" : "border-border bg-background hover:border-primary-200 hover:bg-muted/40")} onClick={onClick} role="tab" type="button">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {active ? <Check className="size-4 text-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </span>
      <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">{summary}</span>
    </button>
  );
}

function ChapterEditor({ chapter, outline, index, knowledgePoints, lengthPolicy, unrecommendedSelectedKnowledgePointIds, mobileSection, onApplyReadingToAll, onApplyChapterPracticeToAll, onChange }: { chapter: TeachingPlanChapter; outline: TeachingPlanState["outline"]["chapters"][number]; index: number; knowledgePoints: TeachingPlanState["knowledgePoints"]; lengthPolicy: TeachingPlanState["lengthPolicy"]; unrecommendedSelectedKnowledgePointIds: string[]; mobileSection?: MobileChapterSection; onApplyReadingToAll: () => void; onApplyChapterPracticeToAll: () => void; onChange: (updater: (chapter: TeachingPlanChapter) => TeachingPlanChapter) => void }) {
  const chapterLabel = `第 ${index + 1} 章`;
  const [pickerOpen, setPickerOpen] = useState(false);
  const recommendedIds = outline.recommendedKnowledgePointIds;
  const knowledgePointsChanged = !sameIdSet(chapter.knowledgePointIds, recommendedIds);
  const recommendedRange = lengthPolicy.english.teacherRecommendedRange;
  const wordCountWarning = chapter.targetWordCount !== null && chapter.targetWordCount < recommendedRange[0]
    ? "低于推荐范围，可能无法完整表达本章事件。"
    : chapter.targetWordCount !== null && chapter.targetWordCount > recommendedRange[1]
      ? "高于推荐范围，可能增加学生阅读负担；调高词数不会增加剧情复杂度。"
      : "";
  const mobileSectionClass = (section: MobileChapterSection) => (mobileSection && mobileSection !== section ? "max-lg:hidden" : "");
  return (
    <section>
      <div className="space-y-5">
        <div className={cn("rounded-lg bg-card p-5 shadow-sm", mobileSectionClass("goals"))} data-testid="teaching-plan-goals-section">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground">
                {chapterLabel} · {outline.title}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{outline.summary}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-start gap-2">
              <label className="rounded-md border border-input bg-background px-3 py-2">
                <span className="block text-xs font-medium text-muted-foreground">目标词数</span>
                <span className="mt-1 flex items-center gap-2">
                  <input
                    aria-label={`${chapterLabel}目标词数`}
                    className="h-9 w-20 rounded-md border border-input bg-card px-2 text-center text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                    max={MAX_CHAPTER_TARGET_WORD_COUNT}
                    min={MIN_CHAPTER_TARGET_WORD_COUNT}
                    onChange={(event) =>
                      onChange((current) => {
                        const targetWordCount = Number(event.target.value);
                        return {
                          ...current,
                          targetWordCount,
                          paragraphCount: minimumReadingParagraphCount(targetWordCount, current.readingExercises),
                          touched: {
                            ...current.touched,
                            targetWordCount: true,
                          },
                        };
                      })
                    }
                    type="number"
                    value={chapter.targetWordCount ?? ""}
                  />
                  <span className="text-sm text-muted-foreground">词</span>
                </span>
              </label>
              <div className="rounded-md border border-input bg-background px-3 py-2">
                <span className="block text-xs font-medium text-muted-foreground">正文段落</span>
                <span className="mt-1 flex items-center gap-2">
                  <output aria-label={`${chapterLabel}正文段落数`} className="flex h-9 min-w-16 items-center justify-center rounded-md bg-muted px-3 text-sm font-semibold tabular-nums text-foreground">
                    {chapter.paragraphCount} 段
                  </output>
                </span>
              </div>
            </div>
          </div>
          <p className={cn("mt-2 text-xs", wordCountWarning ? "text-amber-700" : "text-muted-foreground")}>
            推荐 {recommendedRange[0]}–{recommendedRange[1]} 词；只有低于 {lengthPolicy.english.hardRange[0]} 或高于 {lengthPolicy.english.hardRange[1]} 才会阻止保存。{wordCountWarning ? ` ${wordCountWarning}` : ""}
          </p>
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">知识点</div>
              <div className="flex items-center gap-2">
                {knowledgePointsChanged ? (
                  <Button
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        knowledgePointIds: [...recommendedIds],
                        touched: {
                          ...current.touched,
                          knowledgePointIds: false,
                        },
                      }))
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw className="size-4" />
                    重置为 AI 推荐
                  </Button>
                ) : null}
                <Button onClick={() => setPickerOpen(true)} size="sm" type="button" variant="outline">
                  从语法库选择
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {chapter.knowledgePointIds.length ? (
                chapter.knowledgePointIds.map((id) => {
                  const point = knowledgePoints.find((item) => item.id === id);
                  const label = point ? knowledgePointName(point) : id;
                  return (
                    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-sm", recommendedIds.includes(id) ? "bg-primary-50 text-primary-700" : "bg-amber-50 text-amber-800")} key={id}>
                      <OverflowingKnowledgePointTitle title={label} />
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", recommendedIds.includes(id) ? "bg-primary-100 text-primary-700" : "bg-amber-100 text-amber-800")}>{recommendedIds.includes(id) ? "AI 推荐" : "手动添加"}</span>
                      <button
                        aria-label={`删除知识点 ${label}`}
                        className="rounded-full p-0.5 text-primary-700 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() =>
                          onChange((current) => ({
                            ...current,
                            knowledgePointIds: current.knowledgePointIds.filter((pointId) => pointId !== id),
                            ...(current.knowledgePointIds.length === 1 ? {
                              readingExercises: { ...current.readingExercises, grammar: { optionCloze: 0, wordForm: 0 } },
                              chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } },
                            } : {}),
                            touched: {
                              ...current.touched,
                              knowledgePointIds: true,
                            },
                          }))
                        }
                        type="button"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  );
                })
              ) : (
                <span className="text-sm text-muted-foreground">本章不分配语法知识点，仅生成阅读与词汇内容</span>
              )}
            </div>
            {outline.knowledgePointRecommendationSummary ? <p className="mt-3 rounded-md bg-primary-50 px-3 py-2 text-sm leading-6 text-primary-700">AI 推荐：{outline.knowledgePointRecommendationSummary} 如需调整，可从第一步已选知识点中修改。</p> : null}
            {chapter.knowledgePointIds.length > 3 ? <p className="mt-2 text-sm text-amber-700">建议一章不超过 3 个知识点。</p> : null}
          </div>
          {pickerOpen ? (
            <KnowledgePointPickerDialog
              description="按 Section 选择本章教学目标；范围仅限第一步已选知识点。"
              highlightedIds={unrecommendedSelectedKnowledgePointIds}
              knowledgePoints={knowledgePoints}
              onConfirm={(ids) => {
                onChange((current) => ({
                  ...current,
                  knowledgePointIds: ids,
                  ...(!ids.length ? {
                    readingExercises: { ...current.readingExercises, grammar: { optionCloze: 0, wordForm: 0 } },
                    chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } },
                  } : current.knowledgePointIds.length ? {} : {
                    readingExercises: { ...current.readingExercises, grammar: { optionCloze: 4, wordForm: 3 } },
                  }),
                  touched: {
                    ...current.touched,
                    knowledgePointIds: !sameIdSet(ids, recommendedIds),
                  },
                }));
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
              selectedIds={chapter.knowledgePointIds}
              title="选择本章知识点"
            />
          ) : null}
        </div>

        <div className={cn("rounded-lg bg-card p-5 shadow-sm", mobileSectionClass("reading"))} data-testid="teaching-plan-reading-section">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-sm font-semibold text-foreground">正文模式</h4>
            <Button aria-label="同步正文设置到全部章节" className="self-start sm:self-auto" onClick={onApplyReadingToAll} size="sm" type="button" variant="outline">
              <span className="sm:hidden">同步到全部章节</span>
              <span className="hidden sm:inline">同步正文设置到全部章节</span>
            </Button>
          </div>
          <div aria-label="正文模式" className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
            <ReadingModeOption
              checked={chapter.readingExerciseMode === "complete"}
              description="题目与答案自然融入正文，学生可以连续阅读。"
              icon={BookOpenText}
              name={`reading-mode-${chapter.outlineChapterId}`}
              onChange={() =>
                onChange((current) => ({
                  ...current,
                  readingExerciseMode: "complete",
                  touched: { ...current.touched, readingExerciseMode: true },
                }))
              }
              title="完整阅读"
              value="complete"
              answerState="答案状态：直接显示"
            />
            <ReadingModeOption
              checked={chapter.readingExerciseMode === "interactive"}
              description="正文保留作答位置，学生在阅读过程中完成练习。"
              icon={PencilLine}
              name={`reading-mode-${chapter.outlineChapterId}`}
              onChange={() =>
                onChange((current) => ({
                  ...current,
                  readingExerciseMode: "interactive",
                  touched: { ...current.touched, readingExerciseMode: true },
                }))
              }
              title="边读边练"
              value="interactive"
              answerState="答案状态：保留空位"
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{chapter.readingExerciseMode === "complete" ? "答案直接呈现在正文中，阅读更连贯。" : "正文保留作答位置，学生边读边完成。"}</p>
          <ReadingExerciseEditor
            ariaPrefix={`${chapterLabel}正文`}
            config={chapter.readingExercises}
            grammarDisabled={!chapter.knowledgePointIds.length}
            onChange={(readingExercises) =>
              onChange((current) => ({
                ...current,
                readingExercises,
                paragraphCount: minimumReadingParagraphCount(current.targetWordCount ?? 90, readingExercises),
                touched: { ...current.touched, readingExercises: true },
              }))
            }
          />
        </div>

        <div className={cn("rounded-lg bg-card p-5 shadow-sm", mobileSectionClass("practice"))} data-testid="teaching-plan-practice-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleHeader
              disabled={!chapter.knowledgePointIds.length}
              enabled={chapter.chapterPractice.enabled}
              label="章节练习"
              onChange={(enabled) =>
                onChange((current) => ({
                  ...current,
                  chapterPractice: { ...current.chapterPractice, enabled },
                  touched: { ...current.touched, chapterPractice: true },
                }))
              }
            />
            <Button onClick={onApplyChapterPracticeToAll} size="sm" type="button" variant="outline">
              同步章节练习到全部章节
            </Button>
          </div>
          {chapter.chapterPractice.enabled ? (
            <>
              <GrammarPracticeEditor
                ariaPrefix={`${chapterLabel}章节练习`}
                config={chapter.chapterPractice}
                max={20}
                onChange={(config) =>
                  onChange((current) => ({
                    ...current,
                    chapterPractice: config,
                    touched: { ...current.touched, chapterPractice: true },
                  }))
                }
              />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReadingModeOption({ checked, title, description, answerState, name, value, icon: Icon, onChange }: { checked: boolean; title: string; description: string; answerState: string; name: string; value: ReadingExerciseMode; icon: typeof BookOpenText; onChange: () => void }) {
  return (
    <label className={cn("group relative flex min-h-36 cursor-pointer flex-col rounded-lg border-2 p-4 transition-colors duration-200", checked ? "border-primary bg-primary-50" : "border-border bg-background hover:border-primary-200 hover:bg-muted/30")}>
      <input checked={checked} className="sr-only" name={name} onChange={onChange} type="radio" value={value} />
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-md", checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground")}>
          <Icon className="size-4.5" />
        </span>
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
  const title = point.labelZh ? `${point.labelZh} · ${point.label}` : point.label;
  if (!point.unitStart) return title;
  const units = point.unitStart === point.unitEnd ? `Unit ${point.unitStart}` : `Units ${point.unitStart}–${point.unitEnd}`;
  return `${title} · ${units}`;
}

function ToggleHeader({ disabled = false, enabled, label, onChange }: { disabled?: boolean; enabled: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <button aria-label={`${label}${enabled ? "已开启" : "已关闭"}`} aria-pressed={enabled} className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary-300 hover:text-foreground", disabled && "cursor-not-allowed opacity-50")} disabled={disabled} onClick={() => onChange(!enabled)} type="button">
        <span aria-hidden="true" className={cn("relative h-5 w-9 rounded-full transition-colors", enabled ? "bg-white/30" : "bg-muted")}>
          <span className={cn("absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform", enabled ? "translate-x-4" : "translate-x-0")} />
        </span>
        <span className="min-w-12 text-center">{enabled ? "已开启" : "已关闭"}</span>
      </button>
    </div>
  );
}

function ReadingExerciseEditor({ config, ariaPrefix, grammarDisabled = false, onChange }: { config: TeachingPlanChapter["readingExercises"]; ariaPrefix: string; grammarDisabled?: boolean; onChange: (config: TeachingPlanChapter["readingExercises"]) => void }) {
  const [adding, setAdding] = useState(false);
  const invalid = !grammarDisabled && grammarExerciseTotal(config.grammar) < 1;
  const grammarRow = (type: GrammarExerciseType) => (
    <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_220px]" key={type}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{grammarLabels[type]}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{grammarExamples[type]}</div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Stepper
          ariaPrefix={ariaPrefix}
          label={grammarLabels[type]}
          max={8}
          onChange={(count) =>
            onChange({
              ...config,
              enabled: true,
              grammar: { ...config.grammar, [type]: count },
            })
          }
          value={config.grammar[type]}
        />
        <button aria-label={`${ariaPrefix}删除题型 ${grammarLabels[type]}`} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange({ ...config, grammar: { ...config.grammar, [type]: 0 } })} type="button">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
  const missingGrammar = (["optionCloze", "wordForm"] as GrammarExerciseType[]).filter((type) => config.grammar[type] === 0);
  const vocabularyEnabled = config.vocabulary.chineseHint > 0;
  const hasMissing = (!grammarDisabled && missingGrammar.length > 0) || !vocabularyEnabled;
  return (
    <div className="mt-5 space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">语法</div>
        <div className="space-y-2">
          {grammarDisabled ? <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">本章未分配知识点，不生成语法题。</div> : null}
          {!grammarDisabled && config.grammar.optionCloze > 0 ? grammarRow("optionCloze") : null}
          {!grammarDisabled && config.grammar.wordForm > 0 ? grammarRow("wordForm") : null}
          {!grammarDisabled && !grammarExerciseTotal(config.grammar) ? <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-sm text-amber-800">至少添加一种语法题型，才能覆盖本章知识点。</div> : null}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">词汇词组</div>
        {vocabularyEnabled ? (
          <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">中文提示写词</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{vocabularyExample}</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Stepper
                ariaPrefix={ariaPrefix}
                label="中文提示写词"
                max={8}
                onChange={(count) =>
                  onChange({
                    ...config,
                    enabled: true,
                    vocabulary: { chineseHint: count },
                  })
                }
                value={config.vocabulary.chineseHint}
              />
              <button aria-label={`${ariaPrefix}删除题型 中文提示写词`} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange({ ...config, vocabulary: { chineseHint: 0 } })} type="button">
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">当前不生成正文词汇题。</p>
        )}
      </div>
      {hasMissing ? (
        <div>
          <Button aria-expanded={adding} onClick={() => setAdding((current) => !current)} size="sm" type="button" variant="outline">
            <Plus className="size-4" />
            添加正文题型
          </Button>
          {adding ? (
            <div className="mt-2 grid gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-2">
              {!grammarDisabled ? missingGrammar.map((type) => (
                <AddExerciseTypeCard
                  example={grammarExamples[type]}
                  key={type}
                  label={grammarLabels[type]}
                  onClick={() => {
                    onChange({
                      ...config,
                      enabled: true,
                      grammar: {
                        ...config.grammar,
                        [type]: type === "optionCloze" ? 4 : 3,
                      },
                    });
                    setAdding(false);
                  }}
                />
              )) : null}
              {!vocabularyEnabled ? (
                <AddExerciseTypeCard
                  example={vocabularyExample}
                  label="中文提示写词"
                  onClick={() => {
                    onChange({
                      ...config,
                      enabled: true,
                      vocabulary: { chineseHint: 3 },
                    });
                    setAdding(false);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {invalid ? <p className="text-sm font-medium text-amber-700">至少保留一种语法题型</p> : <p className="text-xs text-muted-foreground">{grammarDisabled ? "本章仅保留阅读与词汇内容。" : "题型可按章节增删；词汇题不参与语法知识点覆盖。"}</p>}
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
          <div className="flex items-center justify-end gap-2">
            <Stepper
              ariaPrefix={ariaPrefix}
              label={grammarLabels[type]}
              max={max}
              onChange={(count) =>
                onChange({
                  ...config,
                  enabled: true,
                  grammar: { ...config.grammar, [type]: count },
                })
              }
              value={config.grammar[type]}
            />
            <button
              aria-label={`${ariaPrefix}删除题型 ${grammarLabels[type]}`}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() =>
                onChange({
                  ...config,
                  grammar: { ...config.grammar, [type]: 0 },
                })
              }
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
      {!active.length ? <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-sm text-amber-800">已开启练习，请至少添加一种语法题型。</div> : null}
      {missing.length ? (
        <div>
          <Button aria-expanded={adding} onClick={() => setAdding((current) => !current)} size="sm" type="button" variant="outline">
            <Plus className="size-4" />
            添加{ariaPrefix.includes("章节") ? "章节练习" : "课后练习"}题型
          </Button>
          {adding ? (
            <div className="mt-2 grid gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-2">
              {missing.map((type) => (
                <AddExerciseTypeCard
                  example={grammarExamples[type]}
                  key={type}
                  label={grammarLabels[type]}
                  onClick={() => {
                    onChange({
                      ...config,
                      enabled: true,
                      grammar: { ...config.grammar, [type]: 5 },
                    });
                    setAdding(false);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs font-medium text-muted-foreground">预计 {practicePageCount(config.grammar)} 页</p>
    </div>
  );
}

function AddExerciseTypeCard({ label, example, onClick }: { label: string; example: string; onClick: () => void }) {
  return (
    <button aria-label={`添加${label}`} className="min-h-24 rounded-md border border-border bg-background p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-primary-200 hover:bg-primary-50/50 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onClick} type="button">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Plus className="size-4 text-primary" />
        添加{label}
      </span>
      <span className="mt-2 block text-xs leading-5 text-muted-foreground">{example}</span>
    </button>
  );
}

function Stepper({ ariaPrefix, label, value, max, onChange }: { ariaPrefix: string; label: string; value: number; max: number; onChange: (count: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button aria-label={`${ariaPrefix}${label}减少`} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary-200 hover:text-foreground" onClick={() => onChange(Math.max(1, value - 1))} type="button">
        <Minus className="size-4" />
      </button>
      <input aria-label={`${ariaPrefix}${label}数量`} className="h-8 w-14 rounded-md border border-input bg-background text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" max={max} min={1} onChange={(event) => onChange(Math.max(1, Math.min(max, Number(event.target.value) || 1)))} type="number" value={value} />
      <button aria-label={`${ariaPrefix}${label}增加`} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary-200 hover:text-foreground" onClick={() => onChange(Math.min(max, value + 1))} type="button">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function AfterClassEditor({ plan, knowledgePoints, knowledgePointIds, afterClassNeedsReview, onChange }: { plan: TeachingPlan; knowledgePoints: TeachingPlanState["knowledgePoints"]; knowledgePointIds: string[]; afterClassNeedsReview: boolean; onChange: (updater: (config: TeachingPlan["afterClassPractice"]) => TeachingPlan["afterClassPractice"]) => void }) {
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
        <button
          aria-pressed={decisionMade && plan.afterClassPractice.enabled}
          className={cn("min-h-11 rounded-md text-sm font-semibold transition-colors", decisionMade && plan.afterClassPractice.enabled ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}
          onClick={() =>
            onChange((current) => ({
              ...current,
              enabled: true,
              vocabularyReviewEnabled: includesVocabularyReview,
              knowledgePointIds: !current.knowledgePointIds.length || !current.touched.knowledgePointIds ? knowledgePointIds : current.knowledgePointIds,
              practice: {
                enabled: !includesVocabularyReview,
                grammar: grammarExerciseTotal(current.practice.grammar) ? current.practice.grammar : { optionCloze: 5, wordForm: 5 },
              },
              touched: { ...current.touched, practice: true },
            }))
          }
          type="button"
        >
          生成课后练习
        </button>
        <button
          aria-pressed={decisionMade && !plan.afterClassPractice.enabled}
          className={cn("min-h-11 rounded-md text-sm font-semibold transition-colors", decisionMade && !plan.afterClassPractice.enabled ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}
          onClick={() =>
            onChange((current) => ({
              ...current,
              enabled: false,
              vocabularyReviewEnabled: false,
              practice: { ...current.practice, enabled: false },
              touched: { ...current.touched, practice: true },
            }))
          }
          type="button"
        >
          不生成课后练习
        </button>
      </div>
      {afterClassNeedsReview ? <p className="mt-3 text-sm text-amber-700">课后练习知识点可能需要检查。</p> : null}
      {decisionMade && plan.afterClassPractice.enabled ? (
        <>
          <div className="mt-5 space-y-3">
            <div className={cn("rounded-md border p-4", plan.afterClassPractice.vocabularyReviewEnabled ? "border-primary-200 bg-primary-50/50" : "border-border bg-background")}>
              <ToggleHeader
                enabled={plan.afterClassPractice.vocabularyReviewEnabled}
                label="词汇复习"
                onChange={(vocabularyReviewEnabled) =>
                  onChange((current) => ({
                    ...current,
                    enabled: vocabularyReviewEnabled || current.practice.enabled,
                    vocabularyReviewEnabled,
                    touched: { ...current.touched, practice: true },
                  }))
                }
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">从各章节正文的词汇习题自动汇总并去重，生成中英配对复习；不与语法知识点联动，也无需设置题量。</p>
            </div>
            <div className={cn("rounded-md border p-4", plan.afterClassPractice.practice.enabled ? "border-primary-200 bg-primary-50/50" : "border-border bg-background")}>
              <ToggleHeader
                enabled={plan.afterClassPractice.practice.enabled}
                label="语法习题"
                onChange={(enabled) =>
                  onChange((current) => ({
                    ...current,
                    enabled: current.vocabularyReviewEnabled || enabled,
                    practice: { ...current.practice, enabled },
                    touched: { ...current.touched, practice: true },
                  }))
                }
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">仅本模块与下方语法知识点联动，按所选知识点生成选项填空或给词填空。</p>
              {plan.afterClassPractice.practice.enabled ? (
                <>
                  <div className="mt-5 border-t border-primary-100 pt-4 text-sm font-medium text-foreground">课后考查知识点</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">已默认选中各章节使用的知识点；取消勾选即可排除不需要考查的内容。</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {availablePoints.map((point) => (
                      <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background text-muted-foreground hover:border-primary-200 hover:text-foreground")} key={point.id}>
                        <input
                          checked={plan.afterClassPractice.knowledgePointIds.includes(point.id)}
                          className="sr-only"
                          onChange={() =>
                            onChange((current) => ({
                              ...current,
                              knowledgePointIds: current.knowledgePointIds.includes(point.id) ? current.knowledgePointIds.filter((id) => id !== point.id) : [...current.knowledgePointIds, point.id],
                              touched: {
                                ...current.touched,
                                knowledgePointIds: true,
                              },
                            }))
                          }
                          type="checkbox"
                        />
                        <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded border", plan.afterClassPractice.knowledgePointIds.includes(point.id) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
                          {plan.afterClassPractice.knowledgePointIds.includes(point.id) ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 font-medium">{knowledgePointName(point)}</span>
                      </label>
                    ))}
                  </div>
                  <GrammarPracticeEditor
                    ariaPrefix="课后练习"
                    config={plan.afterClassPractice.practice}
                    max={20}
                    onChange={(practice) =>
                      onChange((current) => ({
                        ...current,
                        enabled: current.vocabularyReviewEnabled || practice.enabled,
                        practice,
                        touched: { ...current.touched, practice: true },
                      }))
                    }
                  />
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
