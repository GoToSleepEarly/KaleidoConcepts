"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, LoaderCircle, MessageSquareText, Pencil, RotateCcw, Send, Sparkles, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import { PreviewSlide } from "@/features/courses/components/course-slide-deck";
import type { CourseContentState, CoursePreviewPage, StoryWritingProvider } from "@/lib/contracts/api";
import { compilePreviewPages, DEFAULT_COURSE_PRESENTATION, previewPageAnswerText } from "@/lib/domain/course-preview";
import { cn } from "@/lib/utils";
import { createRequestId } from "@/lib/utils/request-id";

type TextPreviewPage = Extract<CoursePreviewPage, { type: "shot_text" | "grammar_practice" | "main_idea" | "vocabulary_matching" }>;
type ContentSection = { id: string; label: string; kind: "reading" | "practice" | "main" | "homework"; chapterId?: string; pages: TextPreviewPage[]; pageCount: number };
type ModificationTarget = { value: string; label: string };

const phaseLabels: Record<string, string> = {
  preparing: "正在准备课程内容",
  generating_chapters: "正在生成全部章节正文和课后阅读",
  validating_chapters: "正在逐章检查正文",
  repairing_chapters: "正在统一修复未通过的内容区域",
  validating_main_idea: "正在检查课后阅读",
  repairing_main_idea: "正在修复课后阅读",
  generating_exercises: "正在生成章节与课后练习",
  validating_exercises: "正在检查知识点覆盖和题量",
};

const exerciseConfirmationMessage = "我确认正文与课后阅读，请生成章节与课后练习。";

function contentHeaderSummary(state: CourseContentState) {
  const plannedChapterCount = Math.max(Object.keys(state.chapterKnowledgePointIds).length, state.chapters.length);
  const generatedChapterCount = state.chapters.length;
  const chapterPracticeCount = state.chapters.reduce((total, chapter) => total + chapter.chapterPractice.length, 0);
  const homeworkPracticeCount = state.homework?.grammar.length ?? 0;
  const levelAndChapters = `${state.course.englishLevel} · ${plannedChapterCount} 章`;
  if (state.status === "empty") return `${levelAndChapters} · 待生成正文`;
  if (state.status === "generating_reading") return `${levelAndChapters} · 正在生成正文与课后阅读`;
  if (state.status === "failed") return `${state.course.englishLevel} · 已生成 ${generatedChapterCount}/${plannedChapterCount} 章 · 上次生成未完成`;
  if (state.status === "reading_ready") return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · 课后阅读已生成 · 练习待生成`;
  if (state.status === "generating_exercises") return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · 正在生成练习`;
  if (!chapterPracticeCount && !homeworkPracticeCount) return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · 课后阅读已生成 · 无额外语法练习`;
  return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · ${chapterPracticeCount} 道章节练习 · ${homeworkPracticeCount} 道课后练习`;
}

function pageModification(state: CourseContentState, page: TextPreviewPage): ModificationTarget | null {
  if (page.type === "main_idea") return { value: "main_idea:main-idea", label: "修改课后阅读" };
  if (page.type === "shot_text") {
    const chapter = state.chapters.find((item) => item.id === page.chapterId);
    const pageNumber = chapter?.paragraphs.findIndex((paragraph) => paragraph.id === page.paragraphId) ?? -1;
    return { value: `paragraph:${page.paragraphId}`, label: `修改正文第 ${pageNumber + 1} 页` };
  }
  if (page.type === "vocabulary_matching") return null;
  const typeLabel = page.exerciseType === "optionCloze" ? "选项填空" : "给词变形";
  if (page.scope === "homework") return { value: `homework:homework|${page.exerciseType}|${page.pageNumber - 1}`, label: `修改课后${typeLabel}第 ${page.pageNumber} 页` };
  return { value: `chapter_practice:${page.chapterId}|${page.exerciseType}|${page.pageNumber - 1}`, label: `修改${typeLabel}第 ${page.pageNumber} 页` };
}

function modificationTargets(state: CourseContentState, pages: TextPreviewPage[]): ModificationTarget[] {
  return pages.flatMap((page) => {
    const target = pageModification(state, page);
    if (!target) return [];
    if (page.type === "shot_text") {
      const chapter = state.chapters.find((item) => item.id === page.chapterId);
      return [{ ...target, label: `第 ${chapter?.order ?? "-"} 章 · ${target.label.replace("修改", "")}` }];
    }
    if (page.type === "grammar_practice" && page.scope === "chapter") {
      const chapter = state.chapters.find((item) => item.id === page.chapterId);
      return [{ ...target, label: `第 ${chapter?.order ?? "-"} 章 · ${target.label.replace("修改", "")}` }];
    }
    return [{ ...target, label: page.type === "main_idea" ? "课后阅读" : `课后练习 · ${target.label.replace("修改课后", "")}` }];
  });
}

export function CourseContentWorkspace({ initialState }: { initialState: CourseContentState }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const requestEpoch = useRef(0);
  const [state, setState] = useState(initialState);
  const [selectedSection, setSelectedSection] = useState(initialState.chapters[0] ? `reading:${initialState.chapters[0].id}` : "main-idea");
  const [selectedPage, setSelectedPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(() => initialState.operation ? new Date(initialState.operation.startedAt).getTime() : null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modifyTarget, setModifyTarget] = useState("");
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [optimisticTeacherMessage, setOptimisticTeacherMessage] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [destructiveRegeneration, setDestructiveRegeneration] = useState<"reading" | "exercises" | null>(null);

  const isGenerating = state.operation?.type === "reading" || state.operation?.type === "exercises" || state.status === "generating_reading" || state.status === "generating_exercises";
  const hasPersistedOperation = Boolean(state.operation) || isGenerating;
  const isWorking = busy || hasPersistedOperation;
  const composerEnabled = state.chapters.length > 0 && !isWorking;
  const textPages = useMemo(() => compilePreviewPages({
    title: state.storyTitle,
    teacherName: null,
    studentNames: [],
    knowledgePoints: state.knowledgePoints,
    chapterKnowledgePointIds: state.chapterKnowledgePointIds,
    homeworkKnowledgePointIds: state.homeworkKnowledgePointIds,
    chapters: state.chapters,
    mainIdea: state.mainIdea,
    homework: state.homework,
    slots: [],
  }).filter((page): page is TextPreviewPage => ["shot_text", "grammar_practice", "main_idea", "vocabulary_matching"].includes(page.type)), [state]);
  const targets = useMemo(() => modificationTargets(state, textPages), [state, textPages]);
  const currentTarget = targets.find((target) => target.value === modifyTarget);
  const hasStepContent = state.status !== "empty" || state.chapters.length > 0 || state.messages.length > 0 || Boolean(state.mainIdea || state.homework);
  const hasUnsentInput = Boolean(instruction.trim());
  const mainIdeaFailed = state.status === "failed" && Boolean(state.errorMessage && (/^(Main Idea|课后阅读)/).test(state.errorMessage));
  const sections = useMemo<ContentSection[]>(() => {
    const result: ContentSection[] = [];
    for (const chapter of state.chapters) {
      const readingPages = textPages.filter((page) => page.type === "shot_text" && page.chapterId === chapter.id);
      result.push({ id: `reading:${chapter.id}`, label: `第 ${chapter.order} 章正文`, kind: "reading", chapterId: chapter.id, pages: readingPages, pageCount: readingPages.length });
      const practicePages = textPages.filter((page) => page.type === "grammar_practice" && page.scope === "chapter" && page.chapterId === chapter.id);
      if (practicePages.length) result.push({ id: `practice:${chapter.id}`, label: `第 ${chapter.order} 章练习`, kind: "practice", chapterId: chapter.id, pages: practicePages, pageCount: practicePages.length });
    }
    const mainPages = textPages.filter((page) => page.type === "main_idea");
    if (mainPages.length) result.push({ id: "main-idea", label: "课后阅读", kind: "main", pages: mainPages, pageCount: mainPages.length });
    const homeworkPages = textPages.filter((page) => page.type === "vocabulary_matching" || (page.type === "grammar_practice" && page.scope === "homework"));
    if (homeworkPages.length) result.push({ id: "homework", label: "课后练习", kind: "homework", pages: homeworkPages, pageCount: homeworkPages.length });
    return result;
  }, [state.chapters, textPages]);
  const hasGeneratedGrammarExercises = state.chapters.some((chapter) => chapter.chapterPractice.length > 0) || Boolean(state.homework?.grammar.length);
  const latestRepairMessageIndex = state.messages.findLastIndex((message) => isRepairMessage(message.content));
  const repairInProgress = isGenerating && Boolean(state.phase?.startsWith("repairing_"));
  const visibleOptimisticTeacherMessage = optimisticTeacherMessage
    && !state.messages.some((message) => message.role === "teacher" && message.content === optimisticTeacherMessage)
    ? optimisticTeacherMessage
    : "";
  const furthestStep = Math.max(
    courseStageStep(state.course.currentStage),
    state.status === "confirmed" ? 5 : 4,
  );

  useEffect(() => {
    if (!isWorking || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isWorking, startedAt]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsentInput) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsentInput]);

  function navigate(href: string) {
    if (hasUnsentInput) {
      setPendingNavigationHref(href);
      return;
    }
    router.push(href);
  }

  function beginRequest() {
    const token = ++requestEpoch.current;
    setBusy(true);
    return token;
  }

  function finishRequest(token: number) {
    if (requestEpoch.current === token) setBusy(false);
  }

  useEffect(() => {
    if (!hasPersistedOperation) return;
    const pollEpoch = requestEpoch.current;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/courses/${state.course.id}/content`);
        if (response.ok) {
          const nextState = await response.json() as CourseContentState;
          if (requestEpoch.current !== pollEpoch) return;
          setState(nextState);
          if (nextState.operation) setStartedAt(new Date(nextState.operation.startedAt).getTime());
        }
      } catch { /* The active request remains the source of truth. */ }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasPersistedOperation, state.course.id]);

  useEffect(() => {
    const timeline = chatScrollRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [isWorking, optimisticTeacherMessage, state.messages.length, state.phase, state.updatedAt]);

  async function updateProvider(writingProvider: StoryWritingProvider) {
    setState((current) => ({ ...current, writingProvider }));
    const response = await fetch(`/api/courses/${state.course.id}/content/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writingProvider }) });
    if (response.ok) setState(await response.json());
  }

  async function generate(kind: "reading" | "exercises", regenerate = false, resetDownstream = false) {
    const previousState = state;
    if (kind === "exercises" && !regenerate) setOptimisticTeacherMessage(exerciseConfirmationMessage);
    const requestToken = beginRequest(); setStartedAt(Date.now()); setElapsed(0); setError(null);
    setState((current) => ({
      ...current,
      status: kind === "reading" ? "generating_reading" : "generating_exercises",
      phase: kind === "reading" ? "generating_chapters" : "generating_exercises",
      errorMessage: null,
    }));
    try {
      const query = regenerate ? `?regenerate=true${resetDownstream ? "&resetDownstream=true" : ""}` : "";
      const response = await fetch(`/api/courses/${state.course.id}/content/${kind}/generate${query}`, { method: "POST", headers: { "Idempotency-Key": createRequestId() } });
      const body = await response.json() as CourseContentState & { message?: string; requiresReset?: boolean };
      if (requestEpoch.current !== requestToken) return;
      if (response.status === 409 && body.requiresReset) {
        setState(previousState);
        setDestructiveRegeneration(kind);
        return;
      }
      if (!response.ok) throw new Error(body.message || "生成失败");
      setState(body);
      if (kind === "exercises") setOptimisticTeacherMessage("");
      if (kind === "reading" && body.chapters[0]) { setSelectedSection(`reading:${body.chapters[0].id}`); setSelectedPage(0); }
    } catch (caught) { if (requestEpoch.current === requestToken) setError(caught instanceof Error ? caught.message : "生成失败"); }
    finally { finishRequest(requestToken); }
  }

  async function confirm() {
    const requestToken = beginRequest(); setConfirming(true); setError(null);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/content/confirm`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "确认失败");
      if (requestEpoch.current === requestToken) router.push(`/courses/${state.course.id}/create/visual-resources`);
    } catch (caught) { if (requestEpoch.current === requestToken) setError(caught instanceof Error ? caught.message : "确认失败"); }
    finally { setConfirming(false); finishRequest(requestToken); }
  }

  async function resetStep() {
    const requestToken = beginRequest(); setResetting(true); setError(null);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/content/reset`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "重新开始文案与练习失败");
      if (requestEpoch.current === requestToken) { setState(body); setSelectedSection("main-idea"); setSelectedPage(0); setModifyTarget(""); setInstruction(""); setOptimisticTeacherMessage(""); setResetOpen(false); }
    } catch (caught) { if (requestEpoch.current === requestToken) setError(caught instanceof Error ? caught.message : "重新开始文案与练习失败"); }
    finally { setResetting(false); finishRequest(requestToken); }
  }

  async function modify() {
    const separator = modifyTarget.indexOf(":");
    const targetType = modifyTarget.slice(0, separator);
    const targetId = modifyTarget.slice(separator + 1);
    const draft = instruction.trim();
    if (separator < 0 || !targetId || !draft) return;
    setOptimisticTeacherMessage(draft);
    setInstruction("");
    const requestToken = beginRequest(); setStartedAt(Date.now()); setElapsed(0); setError(null);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/content/modify`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestId() }, body: JSON.stringify({ targetType, targetId, instruction: draft }) });
      const body = await response.json();
      if (requestEpoch.current !== requestToken) return;
      if (!response.ok) throw new Error(body.message || "修改失败；原内容已保留");
      setState(body); setOptimisticTeacherMessage(""); setModifyTarget("");
    } catch (caught) {
      if (requestEpoch.current !== requestToken) return;
      setInstruction(draft); setOptimisticTeacherMessage(""); setError(caught instanceof Error ? caught.message : "修改失败；原内容已保留");
      try {
        const latest = await fetch(`/api/courses/${state.course.id}/content`, { cache: "no-store" });
        if (latest.ok) setState(await latest.json());
      } catch { /* Preserve the current content and restored instruction. */ }
    }
    finally { finishRequest(requestToken); }
  }

  function selectTarget(value: string) {
    setModifyTarget(value);
    for (const section of sections) {
      const targetPageIndex = section.pages.findIndex((page) => pageModification(state, page)?.value === value);
      if (targetPageIndex >= 0) {
        setSelectedSection(section.id);
        setSelectedPage(targetPageIndex);
        break;
      }
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const selected = sections.find((section) => section.id === selectedSection) ?? sections[0];
  const pageIndex = Math.min(selectedPage, Math.max(0, (selected?.pageCount ?? 1) - 1));
  const currentPage = selected?.pages[pageIndex];
  const currentModification = currentPage ? pageModification(state, currentPage) : null;
  const selectedChapter = selected?.chapterId ? state.chapters.find((chapter) => chapter.id === selected.chapterId) ?? null : null;
  const selectedTopLevel = selectedChapter ? `chapter:${selectedChapter.id}` : selected?.kind === "main" ? "reading" : "homework";
  const canGoBack = pageIndex > 0;
  const canGoForward = pageIndex < (selected?.pageCount ?? 1) - 1;
  function selectSection(id: string) { setSelectedSection(id); setSelectedPage(0); }
  function goPreviousPage() { if (canGoBack) setSelectedPage(pageIndex - 1); }
  function goNextPage() { if (canGoForward) setSelectedPage(pageIndex + 1); }
  const placeholder = isWorking ? "文本生成中，请稍等" : !state.chapters.length ? "请先生成正文与课后阅读" : "输入你希望调整的内容……";
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <CourseCreateSteps courseId={state.course.id} currentStep={4} furthestStep={furthestStep} onNavigate={navigate} />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" data-testid="content-stage-header">
        <div className="min-w-0" data-testid="content-stage-heading">
          <p className="text-sm font-medium text-muted-foreground">文案与练习</p>
          <h2 className="mt-1 truncate text-2xl font-semibold text-foreground">{state.storyTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
          <span aria-live="polite" className={cn("rounded-full px-3 py-1.5 text-sm font-medium", isWorking ? "bg-primary-50 text-primary-700" : state.status === "failed" ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground")} data-testid="content-stage-progress">{contentHeaderSummary(state)}</span>
          {!isWorking && state.status === "ready" && !state.exercisesStale ? <Button onClick={() => generate("reading", true)} size="sm" type="button" variant="outline"><RotateCcw className="size-4" />重新生成正文与课后阅读</Button> : null}
          {!isWorking && state.status === "ready" && !state.exercisesStale && hasGeneratedGrammarExercises ? <Button onClick={() => generate("exercises", true)} size="sm" type="button" variant="outline"><RotateCcw className="size-4" />重新生成练习</Button> : null}
          {hasStepContent ? <Button disabled={resetting} onClick={() => setResetOpen(true)} type="button" variant="outline"><RotateCcw className="size-4" />重新开始</Button> : null}
        </div>
      </header>

      <div
        className={cn(
          "grid gap-5",
          sections.length
            ? "md:h-[calc(100dvh-13.5rem)] md:min-h-[680px] md:grid-cols-[minmax(300px,0.85fr)_minmax(360px,1.15fr)] md:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.35fr)]"
            : "mx-auto w-full max-w-5xl",
        )}
        data-layout={sections.length ? "split" : "focus"}
        data-testid="content-workspace-layout"
      >
        <aside className={cn("min-w-0", sections.length && "md:h-full md:min-h-0 md:overflow-hidden")}>
          <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-sm", sections.length ? "min-h-[680px] md:h-full md:min-h-0 md:overflow-hidden" : "min-h-[clamp(560px,calc(100dvh-18rem),720px)]")} data-testid="content-chat-pane">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="size-4 text-primary" />创作对话</div><select aria-label="文本生成模型" className="h-9 rounded-md border border-input bg-muted/60 px-2 text-xs font-medium text-foreground" disabled={isWorking} onChange={(event) => updateProvider(event.target.value as StoryWritingProvider)} value={state.writingProvider}><option value="quickrouter_gpt">GPT</option><option value="quickrouter_deepseek">DeepSeek</option></select></div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain scroll-pb-24 p-4" data-testid="content-chat-scroll" ref={chatScrollRef}>
              <AssistantBubble>将先生成全部章节正文、正文内练习和课后阅读。确认内容后，再生成章节与课后练习。</AssistantBubble>
              {state.messages.map((message, index) => isRepairMessage(message.content)
                ? <AssistantMessage key={message.id}><RepairMessage failed={state.status === "failed" && index === latestRepairMessageIndex} message={message.content} working={repairInProgress && index === latestRepairMessageIndex} /></AssistantMessage>
                : <ContentChatMessage key={message.id} role={message.role === "teacher" ? "teacher" : "assistant"} system={message.role === "system"}>{message.content}</ContentChatMessage>)}
              {visibleOptimisticTeacherMessage ? <ContentChatMessage role="teacher">{visibleOptimisticTeacherMessage}</ContentChatMessage> : null}
              {isWorking && !confirming ? <AssistantMessage><div className="w-fit max-w-xl rounded-lg border border-primary-200 bg-primary-50 px-3 py-3"><div className="flex items-center gap-2 text-sm font-medium text-primary-800"><LoaderCircle className="size-4 animate-spin" />{isGenerating ? phaseLabels[state.phase ?? "preparing"] : "正在按指定范围修改内容"}</div><div className="mt-2 flex items-start gap-1.5 text-xs tabular-nums text-primary-700"><Clock3 className="mt-0.5 size-3.5 shrink-0" /><span>{elapsed < 120 ? `已等待 ${elapsed} 秒；处理状态会自动保存` : elapsed < 300 ? `已等待 ${elapsed} 秒；长篇内容仍在生成，可以稍后返回查看` : `已等待 ${elapsed} 秒；系统仍在等待本次结果，不会自动重复提交`}</span></div></div></AssistantMessage> : null}
              {!isWorking && state.status === "failed" ? <ChatAction title={(error || state.errorMessage)?.includes("超时") ? "本次等待已超时；重试会发起新请求，已保存内容不会重复生成" : "上次生成未完成，已成功内容不会重复生成"}><Button className="w-full" onClick={() => generate("reading")}><Sparkles className="size-4" />{mainIdeaFailed ? "重试课后阅读" : "重试未通过内容"}</Button></ChatAction> : null}
              {!isWorking && !state.chapters.length && state.status !== "failed" ? <ChatAction title="生成后可逐页检查和修改"><Button onClick={() => generate("reading")} size="sm"><Sparkles className="size-4" />生成正文与课后阅读</Button></ChatAction> : null}
              {!isWorking && state.status === "reading_ready" ? <ChatAction title="正文与课后阅读已生成"><div className="space-y-2"><Button className="w-full" onClick={() => generate("exercises")}>确认正文与课后阅读，生成练习<ChevronRight className="size-4" /></Button><Button className="w-full" onClick={() => generate("reading", true)} variant="outline"><RotateCcw className="size-4" />重新生成正文与课后阅读</Button></div></ChatAction> : null}
              {!isWorking && state.exercisesStale ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">正文已修改，现有练习仍保留但已过期。<Button className="mt-2 w-full" onClick={() => generate("exercises")} size="sm" variant="outline">重新生成练习</Button></div> : null}
              {(error || state.errorMessage) ? <AssistantMessage><div className="flex w-fit max-w-xl gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error || state.errorMessage}</div></AssistantMessage> : null}
            </div>

            <div className="space-y-2 border-t border-border p-4">
              {composerEnabled && !currentTarget ? <button aria-label="选择要修改的页面" className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setTargetPickerOpen(true)} type="button"><span>选择要修改的页面</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></button> : null}
              {currentTarget ? <div className="flex items-center justify-between gap-2 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2 text-xs font-medium text-primary-800"><span className="min-w-0 truncate">{currentTarget.label}</span><button aria-label="清除修改目标" className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setModifyTarget("")} type="button"><X className="size-3.5" /></button></div> : null}
              <textarea aria-label="修改要求" className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" disabled={!composerEnabled} maxLength={1000} onChange={(event) => setInstruction(event.target.value)} placeholder={placeholder} ref={inputRef} value={instruction} />
              <div className="flex items-center justify-between gap-2"><button aria-label="全部清空" className="min-h-9 px-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={!instruction && !modifyTarget} onClick={() => { setInstruction(""); setModifyTarget(""); }} type="button">全部清空</button><Button aria-label="发送修改要求" disabled={!composerEnabled || !modifyTarget || !instruction.trim()} onClick={modify} size="sm"><Send className="size-4" />发送</Button></div>
            </div>
          </section>
        </aside>

        {sections.length > 0 && selected ? <main className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/30 shadow-sm md:h-full md:min-h-0 md:overflow-hidden" data-testid="content-preview-pane">
          <section aria-label="课程内容预览" className="flex h-full min-h-0 min-w-0 flex-col rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowLeft") { event.preventDefault(); goPreviousPage(); } if (event.key === "ArrowRight") { event.preventDefault(); goNextPage(); } }} tabIndex={0}>
            <div className="space-y-3 border-b border-border bg-card p-4">
              <div aria-label="课程内容" className="flex flex-wrap gap-x-1 border-b border-border" data-testid="content-primary-tabs" role="tablist">
                {state.chapters.map((chapter) => {
                  const active = selectedTopLevel === `chapter:${chapter.id}`;
                  return <button aria-selected={active} className={cn("-mb-px min-h-10 border-b-2 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-primary-200 hover:text-foreground")} key={chapter.id} onClick={() => selectSection(`reading:${chapter.id}`)} role="tab" title={chapter.title} type="button">Chapter {chapter.order}</button>;
                })}
                {state.mainIdea ? <button aria-selected={selectedTopLevel === "reading"} className={cn("-mb-px min-h-10 border-b-2 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selectedTopLevel === "reading" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-primary-200 hover:text-foreground")} onClick={() => selectSection("main-idea")} role="tab" type="button">Reading</button> : null}
                {sections.some((section) => section.kind === "homework") ? <button aria-selected={selectedTopLevel === "homework"} className={cn("-mb-px min-h-10 border-b-2 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selectedTopLevel === "homework" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-primary-200 hover:text-foreground")} onClick={() => selectSection("homework")} role="tab" type="button">课后练习</button> : null}
              </div>

              <div className="flex min-h-10 items-center justify-between gap-3">
                <div className="inline-flex min-h-10 border-b border-border" data-testid="content-secondary-tabs" {...(selectedChapter ? { "aria-label": "章节内容", role: "tablist" } : {})}>
                  {selectedChapter ? <>
                    <button aria-selected={selected.kind === "reading"} className={cn("-mb-px min-h-10 border-b-2 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selected.kind === "reading" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => selectSection(`reading:${selectedChapter.id}`)} role="tab" type="button">正文</button>
                    {sections.some((section) => section.id === `practice:${selectedChapter.id}`) ? <button aria-selected={selected.kind === "practice"} className={cn("-mb-px min-h-10 border-b-2 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selected.kind === "practice" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => selectSection(`practice:${selectedChapter.id}`)} role="tab" type="button">练习</button> : null}
                  </> : <span aria-current="page" className="-mb-px inline-flex min-h-10 items-center border-b-2 border-primary px-4 text-sm font-medium text-primary">{selected.label}</span>}
                </div>
                {currentModification ? <Button aria-label={currentModification.label} onClick={() => selectTarget(currentModification.value)} size="sm" variant={modifyTarget === currentModification.value ? "secondary" : "outline"}><Pencil className="size-3.5" />{modifyTarget === currentModification.value ? "已选择此页" : "修改当前页"}</Button> : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pb-24 p-4" data-testid="content-preview-scroll">
              {currentPage ? <SectionPage page={currentPage} selected={currentModification?.value === modifyTarget} /> : null}
              <div aria-label="页面选择" className="mt-3 flex items-center justify-center gap-2">
                <Button aria-label="上一页" disabled={!canGoBack} onClick={goPreviousPage} size="icon-sm" variant="outline"><ChevronLeft className="size-4" /></Button>
                <span aria-live="polite" className="min-w-[88px] text-center text-sm font-semibold tabular-nums text-foreground">{pageIndex + 1} / {selected.pageCount} 页</span>
                <Button aria-label="下一页" disabled={!canGoForward} onClick={goNextPage} size="icon-sm" variant="outline"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          </section>
        </main> : null}
      </div>
      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p aria-live="polite" className="text-sm text-muted-foreground">{hasUnsentInput ? "修改要求尚未发送" : state.status === "confirmed" ? "本步骤已完成" : state.status === "ready" && !state.exercisesStale ? "内容已就绪，可以进入视觉资源" : state.exercisesStale ? "还需：重新生成已过期练习" : "还需：完成正文与练习"}</p><div className="flex gap-2"><Button disabled={isWorking} onClick={() => navigate(`/courses/${state.course.id}/create/teaching-plan`)} type="button" variant="outline"><ChevronLeft className="size-4" />上一步</Button><Button disabled={isWorking || !["ready", "confirmed"].includes(state.status) || state.exercisesStale} onClick={() => state.status === "confirmed" ? navigate(`/courses/${state.course.id}/create/visual-resources`) : void confirm()} type="button">下一步：视觉资源<ChevronRight className="size-4" /></Button></div></div>
      {resetOpen ? <Dialog onClose={() => setResetOpen(false)} open title="重新开始">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-pretty text-sm leading-6 text-muted-foreground">确认后将立即删除文案与练习、视觉资源、图片和预览发布设置，并从文案创作重新开始。即使后续生成失败，已删除内容也不会恢复。</p>
          {error && resetOpen ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button disabled={resetting} onClick={() => setResetOpen(false)} type="button" variant="outline">取消</Button><Button disabled={resetting} onClick={() => void resetStep()} type="button" variant="destructive">{resetting ? <LoaderCircle className="size-4 animate-spin" /> : null}确定</Button></div>
        </div>
      </Dialog> : null}
      {destructiveRegeneration ? <Dialog onClose={() => setDestructiveRegeneration(null)} open title="重新生成会清除后续内容">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-pretty text-sm leading-6 text-muted-foreground">确认后将立即删除视觉资源、图片和预览发布设置，再重新生成{destructiveRegeneration === "reading" ? "正文" : "练习"}。即使生成失败，已删除内容也不会恢复。</p>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setDestructiveRegeneration(null)} type="button" variant="outline">取消</Button>
            <Button disabled={busy} onClick={() => { const kind = destructiveRegeneration; setDestructiveRegeneration(null); if (kind) void generate(kind, true, true); }} type="button" variant="destructive">确认并重新生成</Button>
          </div>
        </div>
      </Dialog> : null}
      {targetPickerOpen ? <Dialog description="选择本次要调整的章节、正文页或练习页。" onClose={() => setTargetPickerOpen(false)} open title="选择修复范围">
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto p-4">
          {targets.map((target) => <button className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" key={target.value} onClick={() => { selectTarget(target.value); setTargetPickerOpen(false); }} type="button"><span className="text-pretty">{target.label}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button>)}
        </div>
      </Dialog> : null}
      {pendingNavigationHref ? <Dialog onClose={() => setPendingNavigationHref(null)} open size="compact" title="放弃未发送的修改？">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-pretty text-sm leading-6 text-muted-foreground">修改要求尚未发送。离开后输入内容和当前修改目标不会保存。</p>
          <div className="flex justify-end gap-2"><Button onClick={() => setPendingNavigationHref(null)} type="button" variant="outline">留在当前页</Button><Button onClick={() => { const href = pendingNavigationHref; setPendingNavigationHref(null); router.push(href); }} type="button" variant="destructive">放弃并离开</Button></div>
        </div>
      </Dialog> : null}
    </div>
  );
}

function ContentChatAvatar({ role }: { role: "assistant" | "teacher" }) {
  const isTeacher = role === "teacher";
  return <span aria-label={isTeacher ? "老师" : "AI 助手"} className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", isTeacher ? "bg-primary text-primary-foreground" : "bg-primary-50 text-primary")} role="img">
    {isTeacher ? <UserRound className="size-4" /> : <Bot className="size-4" />}
  </span>;
}

function AssistantMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2"><ContentChatAvatar role="assistant" />{children}</div>;
}

function ContentChatMessage({ children, role, system = false }: { children: React.ReactNode; role: "assistant" | "teacher"; system?: boolean }) {
  const isTeacher = role === "teacher";
  return <div className={cn("flex items-start gap-2", isTeacher ? "justify-end" : "justify-start")}>
    {!isTeacher ? <ContentChatAvatar role="assistant" /> : null}
    <div className={cn("max-w-[calc(100%-2.5rem)] whitespace-pre-wrap rounded-lg px-3 py-2.5 text-sm leading-6", isTeacher ? "bg-primary text-primary-foreground" : system ? "border border-amber-200 bg-amber-50 text-amber-900" : "bg-muted text-foreground")} data-chat-bubble>{children}</div>
    {isTeacher ? <ContentChatAvatar role="teacher" /> : null}
  </div>;
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return <ContentChatMessage role="assistant">{children}</ContentChatMessage>;
}

function ChatAction({ title, children }: { title: string; children: React.ReactNode }) {
  return <AssistantMessage><div className="w-fit max-w-xl rounded-lg border border-primary-100 bg-primary-50/60 p-3" data-chat-action><p className="mb-2 text-sm font-medium text-primary-900">{title}</p>{children}</div></AssistantMessage>;
}

function isRepairMessage(content: string) { return content.includes("正在统一修复") || content.includes("正在单独修复"); }

function RepairMessage({ message, working, failed }: { message: string; working: boolean; failed: boolean }) {
  const status = failed ? "failed" : working ? "working" : "completed";
  return <details className={cn("group w-fit max-w-xl rounded-lg border text-sm", status === "working" ? "border-amber-200 bg-amber-50 text-amber-950" : status === "failed" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-950")} key={status} open={status !== "completed" || undefined}>
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      {status === "working" ? <LoaderCircle className="size-4 animate-spin" /> : status === "failed" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
      <span>{status === "working" ? "修复中" : status === "failed" ? "本轮修复未通过" : "修复完成"}</span>
      <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
    </summary>
    <p className="border-t border-current/10 px-3 py-2.5 leading-6 opacity-90">{message}</p>
  </details>;
}

function SectionPage({ page, selected }: { page: TextPreviewPage; selected: boolean }) {
  const answers = previewPageAnswerText(page);
  return <article className="mx-auto w-full" data-preview-page>
    <div className={cn("aspect-video w-full overflow-hidden rounded-lg border bg-card shadow-sm transition-[border-color,box-shadow] duration-200", selected ? "border-primary ring-2 ring-primary/15" : "border-primary-100")}>
      <PreviewSlide answerMode="hidden" backgroundMode="plain" page={page} presentation={DEFAULT_COURSE_PRESENTATION} />
    </div>
    {answers ? <div className="mt-3 rounded-lg bg-card px-4 py-3 text-[clamp(13px,1.25vw,16px)] leading-6 text-muted-foreground shadow-sm ring-1 ring-inset ring-border" data-step4-answers><span className="font-semibold text-foreground">教师答案：</span>{answers}</div> : null}
  </article>;
}
