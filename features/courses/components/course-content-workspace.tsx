"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, LoaderCircle, Maximize2, MessageSquareText, Pencil, RotateCcw, Send, Sparkles, UserRound, X } from "lucide-react";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AiHistoryCard, CourseAiWorkspaceFrame, formatAiDuration, type AiHistoryStatus, type AiOperationPresentation } from "@/features/courses/components/course-ai-workspace";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import { CourseStaleNotice } from "@/features/courses/components/course-stale-notice";
import { PreviewSlide } from "@/features/courses/components/course-slide-deck";
import type { CourseContentState, CoursePreviewPage } from "@/lib/contracts/api";
import { compilePreviewPages, DEFAULT_COURSE_PRESENTATION, previewPageAnswerText } from "@/lib/domain/course-preview";
import { cn } from "@/lib/utils";
import { createRequestId } from "@/lib/utils/request-id";

type TextPreviewPage = Extract<
  CoursePreviewPage,
  {
    type: "shot_text" | "grammar_practice" | "main_idea" | "vocabulary_matching";
  }
>;
type ContentSection = {
  id: string;
  label: string;
  kind: "reading" | "practice" | "main" | "homework";
  chapterId?: string;
  pages: TextPreviewPage[];
  pageCount: number;
};
type ModificationTarget = { value: string; label: string };
type ContentMobileView = "chat" | "preview";
type OptimisticContentOperation = {
  requestId: string;
  type: "reading" | "exercises" | "modify";
  createdAt: string;
  targetType?: CourseContentState["messages"][number]["targetType"];
  targetId?: string;
};
type OptimisticTeacherMessage = {
  requestId: string;
  content: string;
  createdAt: string;
  source: "teacher_input" | "ui_action";
  triggerLabel: string;
};
type TimelineItem =
  | { kind: "message"; index: number; message: CourseContentState["messages"][number] }
  | { kind: "repair-history"; key: string; messages: CourseContentState["messages"] }
  | { kind: "operation"; key: string; requestId: string; messages: CourseContentState["messages"] };

const exerciseConfirmationMessage = "我确认阅读内容，请生成章节与课后练习。";
const CONTENT_GUIDE_DISMISSED_KEY = "pblstudio.content-guide.dismissed.v1";

function initialMobileView(state: CourseContentState): ContentMobileView {
  if (!state.chapters.length) return "chat";
  if (state.errorMessage) return "chat";
  if (state.operation || state.exercisesStale) return "chat";
  if (["generating_reading", "generating_exercises", "reading_ready", "failed"].includes(state.status)) return "chat";
  return "preview";
}

function contentHeaderSummary(state: CourseContentState) {
  const plannedChapterCount = Math.max(Object.keys(state.chapterKnowledgePointIds).length, state.chapters.length);
  const generatedChapterCount = state.chapters.length;
  const chapterPracticeCount = state.chapters.reduce((total, chapter) => total + chapter.chapterPractice.length, 0);
  const homeworkPracticeCount = state.homework?.grammar.length ?? 0;
  const levelAndChapters = `${state.course.englishLevel} · ${plannedChapterCount} 章`;
  if (state.status === "empty") return `${levelAndChapters} · 待生成正文`;
  if (state.status === "generating_reading") return `${levelAndChapters} · 正在生成阅读内容`;
  if (state.status === "failed") return `${state.course.englishLevel} · 已生成 ${generatedChapterCount}/${plannedChapterCount} 章 · 上次生成未完成`;
  if (state.status === "reading_ready") return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · 课后阅读已生成 · 练习待生成`;
  if (state.status === "generating_exercises") return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · 正在生成练习`;
  if (!chapterPracticeCount && !homeworkPracticeCount) return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · 课后阅读已生成 · 无额外语法练习`;
  return `${state.course.englishLevel} · ${generatedChapterCount}/${plannedChapterCount} 章正文已完成 · ${chapterPracticeCount} 道章节练习 · ${homeworkPracticeCount} 道课后练习`;
}

function contentMobileSummary(state: CourseContentState) {
  if (state.status === "empty") return `${state.course.englishLevel} · 待生成`;
  if (state.status === "failed") return `${state.course.englishLevel} · 生成未完成`;
  if (state.status === "generating_reading" || state.status === "generating_exercises") return `${state.course.englishLevel} · 生成中`;
  if (state.status === "reading_ready") return `${state.course.englishLevel} · 练习待生成`;
  if (state.exercisesStale) return `${state.course.englishLevel} · 练习需更新`;
  return `${state.course.englishLevel} · 内容就绪`;
}

function contentOperationPresentation(type: "reading" | "exercises" | "modify", phase: CourseContentState["phase"], target?: string, regenerating = false, hasRepair = false): AiOperationPresentation {
  if (type === "modify") {
    return {
      title: "正在修改课程内容",
      target,
      currentStep: 1,
      steps: ["定位目标与相关上下文", "生成最小范围修改", "检查篇幅、题量与知识点", "保存新版本"],
      preserveMessage: "修改通过检查前，当前内容不会被覆盖。",
    };
  }
  if (type === "exercises") {
    const currentStep = phase === "validating_exercises" ? 2 : phase === "repairing_chapters" ? 3 : 1;
    return {
      title: regenerating ? "正在重新生成章节与课后练习" : "正在生成章节与课后练习",
      currentStep,
      steps: ["整理知识点、题型和题量", "生成章节与课后练习", "检查答案、题量和知识点覆盖", "修复未通过的练习", "保存练习结果"],
      preserveMessage: regenerating ? "新练习通过检查前，当前版本不会被覆盖。" : undefined,
    };
  }
  const currentStep = phase === "repairing_chapters" || phase === "repairing_main_idea"
    ? 2
    : phase === "validating_chapters" || phase === "validating_main_idea"
      ? hasRepair ? 3 : 1
      : 0;
  return {
    title: regenerating ? "正在重新生成阅读内容" : "正在生成阅读内容",
    currentStep,
    steps: ["生成正文、互动题和课后阅读", "检查结构、题量和篇幅", "调整未通过的内容", "复核并保存结果"],
    preserveMessage: regenerating ? "新内容通过检查前，当前版本不会被覆盖。" : undefined,
  };
}

function contentOperationRunningCopy(type: OptimisticContentOperation["type"]) {
  if (type === "reading") return "系统正在生成全部章节正文、正文内互动题和课后阅读。";
  if (type === "exercises") return "系统正在根据已确认正文生成章节练习和课后练习。";
  return "系统正在按指定范围修改，原内容会保留到新版本通过检查。";
}

function findLastIndexCompat<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function pageModification(state: CourseContentState, page: TextPreviewPage): ModificationTarget | null {
  if (page.type === "main_idea") return { value: "main_idea:main-idea", label: "修改课后阅读" };
  if (page.type === "shot_text") {
    const chapter = state.chapters.find((item) => item.id === page.chapterId);
    const pageNumber = chapter?.paragraphs.findIndex((paragraph) => paragraph.id === page.paragraphId) ?? -1;
    return {
      value: `paragraph:${page.paragraphId}`,
      label: `修改正文第 ${pageNumber + 1} 页`,
    };
  }
  if (page.type === "vocabulary_matching") return null;
  const typeLabel = page.exerciseType === "optionCloze" ? "选项填空" : "给词变形";
  if (page.scope === "homework")
    return {
      value: `homework:homework|${page.exerciseType}|${page.pageNumber - 1}`,
      label: `修改课后${typeLabel}第 ${page.pageNumber} 页`,
    };
  return {
    value: `chapter_practice:${page.chapterId}|${page.exerciseType}|${page.pageNumber - 1}`,
    label: `修改${typeLabel}第 ${page.pageNumber} 页`,
  };
}

function modificationTargets(state: CourseContentState, pages: TextPreviewPage[]): ModificationTarget[] {
  return pages.flatMap((page) => {
    const target = pageModification(state, page);
    if (!target) return [];
    if (page.type === "shot_text") {
      const chapter = state.chapters.find((item) => item.id === page.chapterId);
      return [
        {
          ...target,
          label: `第 ${chapter?.order ?? "-"} 章 · ${target.label.replace("修改", "")}`,
        },
      ];
    }
    if (page.type === "grammar_practice" && page.scope === "chapter") {
      const chapter = state.chapters.find((item) => item.id === page.chapterId);
      return [
        {
          ...target,
          label: `第 ${chapter?.order ?? "-"} 章 · ${target.label.replace("修改", "")}`,
        },
      ];
    }
    return [
      {
        ...target,
        label: page.type === "main_idea" ? "课后阅读" : `课后练习 · ${target.label.replace("修改课后", "")}`,
      },
    ];
  });
}

export function CourseContentWorkspace({ initialState }: { initialState: CourseContentState }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const requestEpoch = useRef(0);
  const [state, setState] = useState(initialState);
  const [selectedSection, setSelectedSection] = useState(initialState.chapters[0] ? `reading:${initialState.chapters[0].id}` : "main-idea");
  const [selectedPage, setSelectedPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(() => (initialState.operation ? new Date(initialState.operation.startedAt).getTime() : null));
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modifyTarget, setModifyTarget] = useState("");
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [optimisticTeacherMessage, setOptimisticTeacherMessage] = useState<OptimisticTeacherMessage | null>(null);
  const [optimisticOperation, setOptimisticOperation] = useState<OptimisticContentOperation | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [destructiveRegeneration, setDestructiveRegeneration] = useState<"reading" | "exercises" | null>(null);
  const [destructiveModification, setDestructiveModification] = useState(false);
  const [regeneratingKind, setRegeneratingKind] = useState<"reading" | "exercises" | null>(null);
  const [mobileView, setMobileView] = useState<ContentMobileView>(() => initialMobileView(initialState));
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideOpenedManually, setGuideOpenedManually] = useState(false);

  const isGenerating = state.operation?.type === "reading" || state.operation?.type === "exercises" || state.status === "generating_reading" || state.status === "generating_exercises";
  const hasPersistedOperation = Boolean(state.operation) || isGenerating;
  const isWorking = busy || hasPersistedOperation;
  const composerEnabled = state.chapters.length > 0 && !isWorking;
  const textPages = useMemo(
    () =>
      compilePreviewPages({
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
      }).filter((page): page is TextPreviewPage => ["shot_text", "grammar_practice", "main_idea", "vocabulary_matching"].includes(page.type)),
    [state],
  );
  const targets = useMemo(() => modificationTargets(state, textPages), [state, textPages]);
  const currentTarget = targets.find((target) => target.value === modifyTarget);
  const hasStepContent = state.status !== "empty" || state.chapters.length > 0 || state.messages.length > 0 || Boolean(state.mainIdea || state.homework);
  const hasUnsentInput = Boolean(instruction.trim());
  const mainIdeaFailed = state.status === "failed" && Boolean(state.errorMessage && /^(Main Idea|课后阅读)/.test(state.errorMessage));
  const sections = useMemo<ContentSection[]>(() => {
    const result: ContentSection[] = [];
    for (const chapter of state.chapters) {
      const readingPages = textPages.filter((page) => page.type === "shot_text" && page.chapterId === chapter.id);
      result.push({
        id: `reading:${chapter.id}`,
        label: `第 ${chapter.order} 章正文`,
        kind: "reading",
        chapterId: chapter.id,
        pages: readingPages,
        pageCount: readingPages.length,
      });
      const practicePages = textPages.filter((page) => page.type === "grammar_practice" && page.scope === "chapter" && page.chapterId === chapter.id);
      if (practicePages.length)
        result.push({
          id: `practice:${chapter.id}`,
          label: `第 ${chapter.order} 章练习`,
          kind: "practice",
          chapterId: chapter.id,
          pages: practicePages,
          pageCount: practicePages.length,
        });
    }
    const mainPages = textPages.filter((page) => page.type === "main_idea");
    if (mainPages.length)
      result.push({
        id: "main-idea",
        label: "课后阅读",
        kind: "main",
        pages: mainPages,
        pageCount: mainPages.length,
      });
    const homeworkPages = textPages.filter((page) => page.type === "vocabulary_matching" || (page.type === "grammar_practice" && page.scope === "homework"));
    if (homeworkPages.length)
      result.push({
        id: "homework",
        label: "课后练习",
        kind: "homework",
        pages: homeworkPages,
        pageCount: homeworkPages.length,
      });
    return result;
  }, [state.chapters, textPages]);
  const hasGeneratedGrammarExercises = state.chapters.some((chapter) => chapter.chapterPractice.length > 0) || Boolean(state.homework?.grammar.length);
  const latestRepairMessageIndex = findLastIndexCompat(state.messages, (message) => isRepairMessage(message.content));
  const repairInProgress = isGenerating && Boolean(state.phase?.startsWith("repairing_"));
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const operationsByRequest = new Map<string, Extract<TimelineItem, { kind: "operation" }>>();
    const activeRepairIndex = repairInProgress || state.status === "failed" ? latestRepairMessageIndex : -1;
    for (let index = 0; index < state.messages.length; index += 1) {
      const message = state.messages[index]!;
      if (message.requestId && (message.kind === "operation" || message.kind === "repair")) {
        const existing = operationsByRequest.get(message.requestId);
        if (existing) existing.messages.push(message);
        else {
          const operationItem: Extract<TimelineItem, { kind: "operation" }> = { kind: "operation", key: `operation-${message.requestId}`, requestId: message.requestId, messages: [message] };
          operationsByRequest.set(message.requestId, operationItem);
          items.push(operationItem);
        }
        continue;
      }
      if (!isRepairMessage(message.content) || index === activeRepairIndex) {
        items.push({ kind: "message", index, message });
        continue;
      }
      const completedRepairs = [message];
      let nextIndex = index + 1;
      while (nextIndex < state.messages.length && nextIndex !== activeRepairIndex && isRepairMessage(state.messages[nextIndex]!.content)) {
        completedRepairs.push(state.messages[nextIndex]!);
        nextIndex += 1;
      }
      items.push({ kind: "repair-history", key: `repair-history-${message.id}`, messages: completedRepairs });
      index = nextIndex - 1;
    }
    const optimisticTeacherVisible = optimisticTeacherMessage && !state.messages.some((message) => message.role === "teacher" && (message.requestId === optimisticTeacherMessage.requestId || (!message.requestId && message.content === optimisticTeacherMessage.content)));
    if (optimisticTeacherVisible) {
      items.push({
        kind: "message",
        index: state.messages.length,
        message: {
          id: `optimistic-teacher-${optimisticTeacherMessage.requestId}`,
          role: "teacher",
          content: optimisticTeacherMessage.content,
          requestId: optimisticTeacherMessage.requestId,
          createdAt: optimisticTeacherMessage.createdAt,
          details: { triggerSource: optimisticTeacherMessage.source, triggerLabel: optimisticTeacherMessage.triggerLabel },
          ...(optimisticOperation?.targetType ? { targetType: optimisticOperation.targetType, targetId: optimisticOperation.targetId } : {}),
        },
      });
    }
    const persistedType = state.operation?.type
      ?? (state.status === "generating_reading" ? "reading" : state.status === "generating_exercises" ? "exercises" : null);
    const pendingOperation = optimisticOperation ?? (persistedType
      ? { requestId: state.operation?.id ?? `active-${persistedType}`, type: persistedType, createdAt: state.operation?.startedAt ?? new Date().toISOString() }
      : null);
    const alreadyHasOperation = pendingOperation && items.some((item) => item.kind === "operation" && (
      item.requestId === pendingOperation.requestId
      || item.messages.some((message) => message.kind === "operation" && message.status === "running")
    ));
    if (pendingOperation && !alreadyHasOperation) {
      const presentation = contentOperationPresentation(pendingOperation.type, state.phase, undefined, regeneratingKind === pendingOperation.type);
      const latestTargetMessage = [...state.messages].reverse().find((message) => message.role === "teacher" && message.targetType && message.targetId);
      const targetType = pendingOperation.targetType ?? (pendingOperation.type === "modify" ? latestTargetMessage?.targetType : undefined);
      const targetId = pendingOperation.targetId ?? (pendingOperation.type === "modify" ? latestTargetMessage?.targetId : undefined);
      items.push({
        kind: "operation",
        key: `operation-${pendingOperation.requestId}`,
        requestId: pendingOperation.requestId,
        messages: [{
          id: `optimistic-${pendingOperation.requestId}`,
          role: "assistant",
          content: contentOperationRunningCopy(pendingOperation.type),
          kind: "operation",
          status: "running",
          operation: pendingOperation.type,
          requestId: pendingOperation.requestId,
          title: presentation.title,
          createdAt: pendingOperation.createdAt,
          ...(targetType ? { targetType, targetId } : {}),
        }],
      });
    }
    return items;
  }, [latestRepairMessageIndex, optimisticOperation, optimisticTeacherMessage, regeneratingKind, repairInProgress, state.messages, state.operation, state.phase, state.status]);
  const latestStructuredOperation = [...timelineItems].reverse().find((item): item is Extract<TimelineItem, { kind: "operation" }> => item.kind === "operation");
  const latestStructuredStatus = latestStructuredOperation ? [...latestStructuredOperation.messages].reverse().find((message) => message.kind === "operation")?.status : null;
  const latestStructuredReadingSuccess = [...timelineItems].reverse().find((item): item is Extract<TimelineItem, { kind: "operation" }> => item.kind === "operation" && [...item.messages].reverse().some((message) => message.kind === "operation" && message.operation === "reading" && message.status === "succeeded"));
  const hasStructuredFailure = latestStructuredStatus === "failed";
  const hasStructuredReadingSuccess = Boolean(latestStructuredReadingSuccess);
  const furthestStep = Math.max(courseStageStep(state.course.currentStage), state.status === "confirmed" ? 5 : 4);

  useEffect(() => {
    let shouldOpen: boolean;
    try {
      shouldOpen = window.localStorage.getItem(CONTENT_GUIDE_DISMISSED_KEY) !== "true";
    } catch {
      shouldOpen = true;
    }
    if (!shouldOpen) return;
    const timer = window.setTimeout(() => setGuideOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isWorking || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isWorking, startedAt]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsentInput) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsentInput]);

  function navigate(href: string) {
    if (hasUnsentInput) {
      setPendingNavigationHref(href);
      return;
    }
    setNavigating(true);
    router.push(href);
    if (href.endsWith("/teaching-plan")) router.refresh();
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
          const nextState = (await response.json()) as CourseContentState;
          if (requestEpoch.current !== pollEpoch) return;
          setState(nextState);
          if (nextState.operation) setStartedAt(new Date(nextState.operation.startedAt).getTime());
          if (state.operation?.type === "modify" && !nextState.operation && !nextState.errorMessage && ["ready", "confirmed"].includes(nextState.status)) setMobileView("preview");
        }
      } catch {
        /* The active request remains the source of truth. */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasPersistedOperation, state.course.id, state.operation?.type]);

  useLayoutEffect(() => {
    const timeline = chatScrollRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [isWorking, mobileView, optimisticTeacherMessage, state.messages.length, state.phase, state.updatedAt]);

  useLayoutEffect(() => {
    const preview = previewScrollRef.current;
    if (preview) preview.scrollTop = preview.scrollHeight;
  }, [mobileView, selectedSection, selectedPage, state.contentVersion]);

  async function generate(kind: "reading" | "exercises", regenerate = false, resetDownstream = false) {
    const previousState = state;
    const requestId = createRequestId();
    const createdAt = new Date().toISOString();
    const actionLabel = kind === "reading"
      ? regenerate ? "重新生成阅读内容" : state.status === "failed" ? (mainIdeaFailed ? "重试课后阅读" : "重试未通过内容") : "开始生成阅读内容"
      : regenerate ? "重新生成章节与课后练习" : state.status === "failed" ? "重试章节与课后练习" : exerciseConfirmationMessage;
    setOptimisticOperation({ requestId, type: kind, createdAt });
    setOptimisticTeacherMessage({ requestId, content: actionLabel, createdAt, source: "ui_action", triggerLabel: actionLabel });
    const requestToken = beginRequest();
    setStartedAt(Date.now());
    setElapsed(0);
    setError(null);
    setRegeneratingKind(regenerate ? kind : null);
    setState((current) => ({
      ...current,
      status: kind === "reading" ? "generating_reading" : "generating_exercises",
      phase: kind === "reading" ? "generating_chapters" : "generating_exercises",
      errorMessage: null,
    }));
    try {
      const query = regenerate ? `?regenerate=true${resetDownstream ? "&resetDownstream=true" : ""}` : "";
      const response = await fetch(`/api/courses/${state.course.id}/content/${kind}/generate${query}`, { method: "POST", headers: { "Idempotency-Key": requestId } });
      const body = (await response.json()) as CourseContentState & {
        message?: string;
        requiresReset?: boolean;
      };
      if (requestEpoch.current !== requestToken) return;
      if (response.status === 409 && body.requiresReset) {
        setState(previousState);
        setOptimisticTeacherMessage(null);
        setOptimisticOperation(null);
        setDestructiveRegeneration(kind);
        return;
      }
      if (!response.ok) throw new Error(body.message || "生成失败");
      setState(body);
      setOptimisticOperation(null);
      setOptimisticTeacherMessage(null);
      if (kind === "reading" && body.chapters[0]) {
        setSelectedSection(`reading:${body.chapters[0].id}`);
        setSelectedPage(0);
      }
    } catch (caught) {
      if (requestEpoch.current === requestToken) {
        setOptimisticOperation(null);
        setError(caught instanceof Error ? caught.message : "生成失败");
      }
    } finally {
      setRegeneratingKind(null);
      finishRequest(requestToken);
    }
  }

  async function confirm() {
    const requestToken = beginRequest();
    setError(null);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/content/confirm`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "确认失败");
      if (requestEpoch.current === requestToken) router.push(`/courses/${state.course.id}/create/visual-resources`);
    } catch (caught) {
      if (requestEpoch.current === requestToken) setError(caught instanceof Error ? caught.message : "确认失败");
    } finally {
      finishRequest(requestToken);
    }
  }

  async function resetStep() {
    const requestToken = beginRequest();
    setResetting(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/content/reset`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "重新开始文案与练习失败");
      if (requestEpoch.current === requestToken) {
        setState(body);
        setSelectedSection("main-idea");
        setSelectedPage(0);
        setModifyTarget("");
        setInstruction("");
        setOptimisticTeacherMessage(null);
        setOptimisticOperation(null);
        setResetOpen(false);
      }
    } catch (caught) {
      if (requestEpoch.current === requestToken) setError(caught instanceof Error ? caught.message : "重新开始文案与练习失败");
    } finally {
      setResetting(false);
      finishRequest(requestToken);
    }
  }

  async function modify(resetDownstream = false) {
    const separator = modifyTarget.indexOf(":");
    const targetType = modifyTarget.slice(0, separator);
    const targetId = modifyTarget.slice(separator + 1);
    const draft = instruction.trim();
    if (separator < 0 || !targetId || !draft) return;
    const requestId = createRequestId();
    const createdAt = new Date().toISOString();
    setOptimisticTeacherMessage({ requestId, content: draft, createdAt, source: "teacher_input", triggerLabel: "发送修改要求" });
    setOptimisticOperation({ requestId, type: "modify", createdAt, targetType: targetType as CourseContentState["messages"][number]["targetType"], targetId });
    setInstruction("");
    const requestToken = beginRequest();
    setStartedAt(Date.now());
    setElapsed(0);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/content/modify${resetDownstream ? "?resetDownstream=true" : ""}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({ targetType, targetId, instruction: draft }),
      });
      const body = await response.json();
      if (requestEpoch.current !== requestToken) return;
      if (response.status === 409 && body.requiresReset) {
        setInstruction(draft);
        setOptimisticTeacherMessage(null);
        setOptimisticOperation(null);
        setDestructiveModification(true);
        return;
      }
      if (!response.ok) throw new Error(body.message || "修改失败；原内容已保留");
      setState(body);
      setOptimisticTeacherMessage(null);
      setOptimisticOperation(null);
      setModifyTarget("");
      setMobileView("preview");
    } catch (caught) {
      if (requestEpoch.current !== requestToken) return;
      setInstruction(draft);
      setOptimisticTeacherMessage(null);
      setOptimisticOperation(null);
      setError(caught instanceof Error ? caught.message : "修改失败；原内容已保留");
      try {
        const latest = await fetch(`/api/courses/${state.course.id}/content`, {
          cache: "no-store",
        });
        if (latest.ok) setState(await latest.json());
      } catch {
        /* Preserve the current content and restored instruction. */
      }
    } finally {
      finishRequest(requestToken);
    }
  }

  function selectTarget(value: string) {
    setModifyTarget(value);
    setMobileView("chat");
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
  const selectedChapter = selected?.chapterId ? (state.chapters.find((chapter) => chapter.id === selected.chapterId) ?? null) : null;
  const selectedTopLevel = selectedChapter ? `chapter:${selectedChapter.id}` : selected?.kind === "main" ? "reading" : "homework";
  const canGoBack = pageIndex > 0;
  const canGoForward = pageIndex < (selected?.pageCount ?? 1) - 1;
  function selectSection(id: string) {
    setSelectedSection(id);
    setSelectedPage(0);
  }
  function selectTopLevel(value: string) {
    if (value.startsWith("chapter:")) selectSection(`reading:${value.slice("chapter:".length)}`);
    else if (value === "reading") selectSection("main-idea");
    else selectSection("homework");
  }
  function goPreviousPage() {
    if (canGoBack) setSelectedPage(pageIndex - 1);
  }
  function goNextPage() {
    if (canGoForward) setSelectedPage(pageIndex + 1);
  }
  const placeholder = isWorking ? "文本生成中，请稍等" : !state.chapters.length ? "请先生成阅读内容" : "输入你希望调整的内容……";
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1500px] flex-col gap-3 overflow-hidden lg:gap-4" data-testid="content-workspace-root">
      <CourseCreateSteps courseId={state.course.id} currentStep={4} furthestStep={furthestStep} onNavigate={navigate} />
      <CourseStaleNotice staleFromStage={state.course.staleFromStage} stage="content" />
      <header className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between" data-testid="content-stage-header">
        <div className="min-w-0" data-testid="content-stage-heading">
          <h2 className="text-2xl font-semibold text-foreground">文案与练习</h2>
          <p className="mt-1 truncate text-sm font-medium text-muted-foreground" data-testid="content-story-title">{state.storyTitle}</p>
        </div>
        <div className="hidden flex-wrap items-center justify-end gap-2 xl:flex xl:shrink-0" data-testid="content-stage-actions">
          {isWorking || state.status === "failed" || state.status === "reading_ready" || state.status === "empty" || state.exercisesStale ? (
            <span aria-live="polite" className={cn("rounded-full px-3 py-1.5 text-sm font-medium", isWorking ? "bg-primary-50 text-primary-700" : state.status === "failed" ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground")} data-testid="content-stage-progress">
              {state.exercisesStale ? `${state.course.englishLevel} · 练习需更新` : contentHeaderSummary(state)}
            </span>
          ) : null}
          <Button aria-label="操作指引" onClick={() => { setGuideOpenedManually(true); setGuideOpen(true); }} size="sm" type="button" variant="outline">
            <CircleHelp className="size-4" />
            操作指引
          </Button>
          {hasStepContent ? (
            <Button disabled={resetting} onClick={() => setResetOpen(true)} type="button" variant="outline">
              <RotateCcw className="size-4" />
              重新开始
            </Button>
          ) : null}
          {!isWorking && state.status === "ready" && !state.exercisesStale ? (
            <Button onClick={() => generate("reading", true)} size="sm" type="button" variant="outline">
              <RotateCcw className="size-4" />
              重新生成阅读内容
            </Button>
          ) : null}
          {!isWorking && state.status === "ready" && !state.exercisesStale && hasGeneratedGrammarExercises ? (
            <Button onClick={() => generate("exercises", true)} size="sm" type="button" variant="outline">
              <RotateCcw className="size-4" />
              重新生成练习
            </Button>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto xl:hidden" data-testid="content-mobile-actions">
          {isWorking || state.status === "failed" || state.status === "reading_ready" || state.status === "empty" || state.exercisesStale ? (
            <span aria-live="polite" className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", isWorking ? "bg-primary-50 text-primary-700" : state.status === "failed" ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground")}>
              {contentMobileSummary(state)}
            </span>
          ) : null}
          <Button aria-label="打开操作指引" className="shrink-0" onClick={() => { setGuideOpenedManually(true); setGuideOpen(true); }} size="icon-sm" type="button" variant="outline">
            <CircleHelp className="size-4" />
          </Button>
          {hasStepContent ? (
            <Button className="shrink-0 whitespace-nowrap" disabled={resetting} onClick={() => setResetOpen(true)} size="sm" type="button" variant="outline">
              <RotateCcw className="size-4" />
              重新开始本步骤
            </Button>
          ) : null}
        </div>
      </header>

      <CourseAiWorkspaceFrame
        active={sections.length > 0}
        className="min-h-0 flex-1 gap-3 overflow-hidden lg:gap-3"
        constrained
        footer={(
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-4" data-testid="content-bottom-actions">
            <p aria-live="polite" className="truncate text-sm text-muted-foreground">
              {navigating ? "正在加载目标步骤..." : hasUnsentInput ? "修改要求尚未发送" : state.status === "confirmed" ? "本步骤已完成" : state.status === "ready" && !state.exercisesStale ? "内容已就绪，可以进入视觉资源" : state.exercisesStale ? "还需：重新生成已过期练习" : "还需：完成正文与练习"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button disabled={isWorking} loading={navigating} onClick={() => navigate(`/courses/${state.course.id}/create/teaching-plan`)} type="button" variant="outline">
                <ChevronLeft className="size-4" />
                上一步
              </Button>
              <Button aria-label="下一步：视觉资源" disabled={navigating || isWorking || !["ready", "confirmed"].includes(state.status) || state.exercisesStale} onClick={() => (state.status === "confirmed" ? navigate(`/courses/${state.course.id}/create/visual-resources`) : void confirm())} type="button">
                <span className="sm:hidden">下一步</span>
                <span className="hidden sm:inline">下一步：视觉资源</span>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      >
      <div className={cn("grid h-full min-h-0 min-w-0 overflow-hidden", sections.length ? "grid-rows-[auto_minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(400px,0.95fr)_minmax(0,1.3fr)] xl:grid-rows-[minmax(0,1fr)]" : "w-full")} data-layout={sections.length ? "split" : "focus"} data-testid="content-workspace-layout">
        {sections.length ? (
          <div className="grid grid-cols-[repeat(2,minmax(5.5rem,1fr))] gap-1 overflow-x-auto rounded-lg bg-muted p-1 xl:hidden" data-testid="content-mobile-view-tabs">
            <button aria-pressed={mobileView === "chat"} className={mobileModeClass(mobileView === "chat")} onClick={() => setMobileView("chat")} type="button">
              <span>对话</span>
              {isWorking ? <span className="ml-1 text-xs font-medium text-primary">进行中</span> : null}
            </button>
            <button aria-pressed={mobileView === "preview"} className={mobileModeClass(mobileView === "preview")} onClick={() => setMobileView("preview")} type="button">
              预览
            </button>
          </div>
        ) : null}
        <aside className={cn("h-full min-h-0 min-w-0 overflow-hidden", !sections.length && "mx-auto w-full max-w-3xl")} data-testid="content-chat-column">
          <section className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-sm", sections.length && mobileView === "preview" && "hidden xl:flex")} data-testid="content-chat-pane">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquareText className="size-4 text-primary" />
                创作对话
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain scroll-pb-20 p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="content-chat-scroll" ref={chatScrollRef}>
              {timelineItems.map((item) => item.kind === "operation" ? (
                <TimelineOperationCard
                  elapsedSeconds={elapsed}
                  key={item.key}
                  messages={item.messages}
                  onContinue={item === latestStructuredReadingSuccess && !isWorking && state.status === "reading_ready" ? () => generate("exercises") : undefined}
                  onRegenerateReading={item === latestStructuredReadingSuccess && !isWorking && state.status === "reading_ready" ? () => generate("reading", true) : undefined}
                  onRetry={item === latestStructuredOperation && !isWorking && latestStructuredStatus === "failed"
                    ? item.messages.find((message) => message.operation === "exercises")
                      ? () => generate("exercises")
                      : item.messages.find((message) => message.operation === "reading")
                        ? () => generate("reading")
                        : undefined
                    : undefined}
                  phase={state.phase}
                  requestId={item.requestId}
                  targetLabel={targets.find((target) => {
                    const targetMessage = item.messages.find((message) => message.targetType && message.targetId);
                    return targetMessage ? target.value === `${targetMessage.targetType}:${targetMessage.targetId}` : false;
                  })?.label}
                />
              ) : item.kind === "repair-history" ? (
                <AssistantMessage key={item.key}>
                  <RepairHistoryGroup messages={item.messages} />
                </AssistantMessage>
              ) : isRepairMessage(item.message.content) ? (
                <AssistantMessage key={item.message.id}>
                  <RepairMessage failed={state.status === "failed" && item.index === latestRepairMessageIndex} message={item.message} working={repairInProgress && item.index === latestRepairMessageIndex} />
                </AssistantMessage>
              ) : (
                <ContentChatMessage createdAt={item.message.createdAt} details={item.message.details} key={item.message.role === "teacher" && item.message.requestId ? `teacher-${item.message.requestId}` : item.message.id} role={item.message.role === "teacher" ? "teacher" : "assistant"} system={item.message.role === "system"} targetLabel={item.message.targetType && item.message.targetId ? targets.find((target) => target.value === `${item.message.targetType}:${item.message.targetId}`)?.label : undefined}>
                  {item.message.content}
                </ContentChatMessage>
              ))}
              {!isWorking && state.status === "failed" && !hasStructuredFailure ? (
                <TimelineCard
                  footer={<Button className="w-full" onClick={() => generate("reading")}><RotateCcw className="size-4" />{mainIdeaFailed ? "重试课后阅读" : "重试未通过内容"}</Button>}
                  status="failed"
                  testId="content-failure-card"
                  title="本次生成未完成"
                  wide
                >
                  <p className="text-muted-foreground">已完成的内容已保存，只需重试未通过的部分。</p>
                  {error || state.errorMessage ? (
                    <details className="group mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        查看失败原因
                        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="pb-1 pt-1 text-pretty leading-5">{error || state.errorMessage}</p>
                    </details>
                  ) : null}
                </TimelineCard>
              ) : null}
              {!isWorking && !state.chapters.length && state.status !== "failed" ? (
                <ChatAction title="生成阅读内容">
                  <div className="space-y-3">
                    <p className="text-pretty text-sm leading-6 text-primary-800">系统会一次生成全部章节正文、正文内互动题和课后阅读。生成完成后，你可以逐页检查和修改。</p>
                    <Button className="min-h-11" onClick={() => generate("reading")}>
                      <Sparkles className="size-4" />
                      开始生成
                    </Button>
                    <p className="text-pretty text-xs leading-5 text-primary-700">生成期间无需重复点击，进度会自动保存。</p>
                  </div>
                </ChatAction>
              ) : null}
              {!isWorking && state.status === "reading_ready" && !hasStructuredReadingSuccess ? (
                <ReadingReadyCard onContinue={() => generate("exercises")} onRegenerate={() => generate("reading", true)} />
              ) : null}
              {!isWorking && state.exercisesStale ? (
                <TimelineNoticeCard title="练习需要更新">
                  <p className="text-pretty text-sm leading-6 text-muted-foreground">正文已修改，现有练习仍保留但已过期。</p>
                  <Button className="mt-2 w-full" onClick={() => generate("exercises")} size="sm" variant="outline">
                    重新生成练习
                  </Button>
                </TimelineNoticeCard>
              ) : null}
              {(error || state.errorMessage) && state.status !== "failed" && !hasStructuredFailure ? (
                <AssistantMessage>
                  <div className="flex w-fit max-w-xl gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {error || state.errorMessage}
                  </div>
                </AssistantMessage>
              ) : null}
            </div>

            {sections.length ? <div className="space-y-1.5 border-t border-border p-3" data-testid="content-chat-composer">
              <div className="flex items-center gap-2" data-testid="content-target-row">
                {composerEnabled && !currentTarget ? (
                  <button aria-label="选择要修改的页面" className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setTargetPickerOpen(true)} type="button">
                    <span className="truncate">选择要修改的页面</span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ) : null}
                {currentTarget ? (
                  <div className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary-800">
                    <span className="min-w-0 truncate">{currentTarget.label}</span>
                    <button aria-label="清除修改目标" className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setModifyTarget("")} type="button">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : null}
                <button
                  aria-label="全部清空"
                  className="min-h-10 shrink-0 px-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                  disabled={!instruction && !modifyTarget}
                  onClick={() => {
                    setInstruction("");
                    setModifyTarget("");
                  }}
                  type="button"
                >
                  清空
                </button>
              </div>
              <div className="relative" data-testid="content-inline-composer">
                <AutoGrowTextarea aria-label="修改要求" className="block min-h-13 max-h-28 w-full resize-none overflow-y-hidden rounded-md border border-input bg-background px-3 py-4 pr-16 text-sm leading-5 outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" disabled={!composerEnabled} maxLength={1000} onChange={(event) => setInstruction(event.target.value)} placeholder={placeholder} ref={inputRef} rows={1} value={instruction} />
                <Button aria-label="发送修改要求" className="absolute bottom-1 right-1 size-11 min-h-11 min-w-11 rounded-full bg-primary-50 p-0 text-primary shadow-none hover:bg-primary-100 hover:text-primary" disabled={!composerEnabled || !modifyTarget || !instruction.trim()} onClick={() => void modify()} variant="ghost">
                  <Send aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div> : null}
          </section>
        </aside>

        {sections.length > 0 && selected ? (
          <main className={cn("h-full min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-muted/30 shadow-sm", mobileView === "chat" && "hidden xl:block")} data-testid="content-preview-pane">
            <section aria-label="课程内容预览" className="flex h-full min-h-0 min-w-0 flex-col rounded-lg">
              <div className="space-y-2 border-b border-border bg-card p-3" data-testid="content-preview-toolbar">
                <label className="flex min-h-11 items-center gap-2 xl:hidden">
                  <span className="shrink-0 text-xs font-semibold text-foreground">选择章节</span>
                  <select aria-label="选择课程内容" className="min-h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => selectTopLevel(event.target.value)} value={selectedTopLevel}>
                    {state.chapters.map((chapter) => <option key={chapter.id} value={`chapter:${chapter.id}`}>第 {chapter.order} 章</option>)}
                    {state.mainIdea ? <option value="reading">课后阅读</option> : null}
                    {sections.some((section) => section.kind === "homework") ? <option value="homework">课后练习</option> : null}
                  </select>
                </label>
                <div className="hidden min-w-0 items-center gap-3 xl:flex">
                  <span className="shrink-0 text-xs font-semibold text-foreground">选择章节</span>
                  <div aria-label="课程内容" className="flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap rounded-lg bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="content-primary-tabs" role="tablist">
                  {state.chapters.map((chapter) => {
                    const active = selectedTopLevel === `chapter:${chapter.id}`;
                    return (
                      <button aria-selected={active} className={cn("min-h-9 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} key={chapter.id} onClick={() => selectSection(`reading:${chapter.id}`)} role="tab" title={chapter.title} type="button">
                        第 {chapter.order} 章
                      </button>
                    );
                  })}
                  {state.mainIdea ? (
                    <button aria-selected={selectedTopLevel === "reading"} className={cn("min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedTopLevel === "reading" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} onClick={() => selectSection("main-idea")} role="tab" type="button">
                      课后阅读
                    </button>
                  ) : null}
                  {sections.some((section) => section.kind === "homework") ? (
                    <button aria-selected={selectedTopLevel === "homework"} className={cn("min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedTopLevel === "homework" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")} onClick={() => selectSection("homework")} role="tab" type="button">
                      课后练习
                    </button>
                  ) : null}
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-foreground">查看内容</span>
                    <div className="inline-flex min-h-10 min-w-0 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="content-secondary-tabs" {...(selectedChapter ? { "aria-label": "章节内容", role: "tablist" } : {})}>
                    {selectedChapter ? (
                      <>
                        <button aria-selected={selected.kind === "reading"} className={cn("min-h-8 shrink-0 rounded-md px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected.kind === "reading" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={() => selectSection(`reading:${selectedChapter.id}`)} role="tab" type="button">
                          正文
                        </button>
                        {sections.some((section) => section.id === `practice:${selectedChapter.id}`) ? (
                          <button aria-selected={selected.kind === "practice"} className={cn("min-h-8 shrink-0 rounded-md px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected.kind === "practice" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={() => selectSection(`practice:${selectedChapter.id}`)} role="tab" type="button">
                            练习
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span aria-current="page" className="inline-flex min-h-8 shrink-0 items-center whitespace-nowrap rounded-md bg-card px-4 text-sm font-semibold text-primary shadow-sm">
                        {selected.label}
                      </span>
                    )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background p-1" data-testid="content-page-controls">
                    <Button aria-label="上一页" disabled={!canGoBack} onClick={goPreviousPage} size="sm" variant="ghost">
                      <ChevronLeft className="size-4" />
                      <span>上一页</span>
                    </Button>
                    <span aria-live="polite" className="min-w-20 text-center text-xs font-semibold tabular-nums text-foreground">
                      第 {pageIndex + 1} / {selected.pageCount} 页
                    </span>
                    <Button aria-label="下一页" disabled={!canGoForward} onClick={goNextPage} size="sm" variant="ghost">
                      <span>下一页</span>
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button aria-label="放大查看当前页" className="xl:hidden" onClick={() => setPreviewExpanded(true)} size="icon-sm" variant="ghost">
                      <Maximize2 className="size-4" />
                    </Button>
                    {currentModification ? (
                      <Button aria-label={currentModification.label} className="w-20 shrink-0 whitespace-nowrap px-2" onClick={() => selectTarget(currentModification.value)} size="sm" variant={modifyTarget === currentModification.value ? "secondary" : "outline"}>
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">{modifyTarget === currentModification.value ? "已选" : "修改"}</span>
                      </Button>
                    ) : currentPage?.type === "vocabulary_matching" ? (
                      <Button aria-label="词汇配对由正文词汇自动汇总" className="w-20 shrink-0 whitespace-nowrap px-2" disabled size="sm" title="词汇配对由正文词汇自动汇总，无需单独修改" variant="outline">
                        <Sparkles className="size-3.5" />
                        <span className="hidden sm:inline">自动汇总</span>
                      </Button>
                    ) : <span aria-hidden className="w-20 shrink-0" />}
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-scroll overscroll-contain scroll-pb-20 p-3 [scrollbar-gutter:stable] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="content-preview-scroll" ref={previewScrollRef}>
                {currentPage ? <SectionPage page={currentPage} selected={currentModification?.value === modifyTarget} /> : null}
              </div>
            </section>
          </main>
        ) : null}
      </div>
      </CourseAiWorkspaceFrame>
      {resetOpen ? (
        <Dialog description="将删除本阶段及全部后续成果" onClose={() => setResetOpen(false)} open title="重置文案与练习？">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-pretty text-sm leading-6 text-muted-foreground">将删除当前文案与练习、视觉资源、图片和预览发布设置，并重新开始本阶段。</p>
            {error && resetOpen ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button disabled={resetting} onClick={() => setResetOpen(false)} type="button" variant="outline">
                取消
              </Button>
              <Button disabled={resetting} onClick={() => void resetStep()} type="button" variant="destructive">
                {resetting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                删除并重置文案与练习
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {previewExpanded && currentPage ? (
        <Dialog description={`${selected.label} · 第 ${pageIndex + 1} 页`} onClose={() => setPreviewExpanded(false)} open title="放大查看" variant="drawer">
          <div className="h-full overflow-y-auto overscroll-contain bg-muted/30 p-3 sm:p-5">
            <SectionPage page={currentPage} selected={false} />
          </div>
        </Dialog>
      ) : null}
      {guideOpen ? (
        <Dialog onClose={() => setGuideOpen(false)} open title="文案与练习使用指引">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-pretty text-sm leading-6 text-muted-foreground">这一阶段会依次完成正文、课后阅读和练习。你只需逐页检查，需要时告诉 AI 修改哪里，不必一次处理完所有内容。</p>
            <ol className="grid gap-3">
              {[
                ["生成正文", "先生成全部章节正文、正文内互动题和课后阅读，系统会自动检查结构、篇幅与知识点。"],
                ["逐页检查", "在预览中切换章节和页面；发现问题时点击当前页的“修改”，描述你希望调整的内容。"],
                ["生成练习", "阅读内容确认后，再生成章节练习和课后练习，避免正文修改造成练习失效。"],
                ["确认完成", "检查练习和教师答案后进入视觉资源。刷新或暂时离开不会丢失已保存内容和处理进度。"],
              ].map(([title, content], index) => (
                <li className="flex gap-3 rounded-lg bg-muted/50 p-3" key={title}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
                  <div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-pretty text-sm leading-6 text-muted-foreground">{content}</p></div>
                </li>
              ))}
            </ol>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              {!guideOpenedManually ? <Button onClick={() => setGuideOpen(false)} type="button" variant="outline">稍后再看</Button> : null}
              <Button onClick={() => {
                if (!guideOpenedManually) {
                  try { window.localStorage.setItem(CONTENT_GUIDE_DISMISSED_KEY, "true"); } catch { /* Local preferences must not block the workflow. */ }
                }
                setGuideOpen(false);
              }} type="button">{guideOpenedManually ? "知道了" : "知道了，不再自动展示"}</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {destructiveRegeneration ? (
        <Dialog description="本次操作尚未开始" onClose={() => setDestructiveRegeneration(null)} open title="修改将重置后续流程">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-pretty text-sm leading-6 text-muted-foreground">
              重新生成{destructiveRegeneration === "reading" ? "正文" : "练习"}
              成功后，视觉资源、图片和预览发布设置会被删除，需要重新生成。生成失败不会影响当前课程。
            </p>
            <div className="flex justify-end gap-2">
              <Button disabled={busy} onClick={() => setDestructiveRegeneration(null)} type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  const kind = destructiveRegeneration;
                  setDestructiveRegeneration(null);
                  if (kind) void generate(kind, true, true);
                }}
                type="button"
              >
                确认并开始生成
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {destructiveModification ? (
        <Dialog description="本次操作尚未开始" onClose={() => setDestructiveModification(false)} open title="修改将重置后续流程">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-pretty text-sm leading-6 text-muted-foreground">本次 AI 修改成功后，视觉资源、图片和预览发布设置会被删除，需要重新生成。修改失败不会影响当前课程。</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDestructiveModification(false)} type="button" variant="outline">取消</Button>
              <Button onClick={() => { setDestructiveModification(false); void modify(true); }} type="button">确认并开始生成</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {targetPickerOpen ? (
        <Dialog description="选择本次要调整的章节、正文页或练习页。" onClose={() => setTargetPickerOpen(false)} open title="选择修复范围">
          <div className="max-h-[60dvh] space-y-2 overflow-y-auto p-4">
            {targets.map((target) => (
              <button
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={target.value}
                onClick={() => {
                  selectTarget(target.value);
                  setTargetPickerOpen(false);
                }}
                type="button"
              >
                <span className="text-pretty">{target.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Dialog>
      ) : null}
      {pendingNavigationHref ? (
        <Dialog onClose={() => setPendingNavigationHref(null)} open size="compact" title="放弃未发送的修改？">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-pretty text-sm leading-6 text-muted-foreground">修改要求尚未发送。离开后输入内容和当前修改目标不会保存。</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPendingNavigationHref(null)} type="button" variant="outline">
                留在当前页
              </Button>
              <Button
                onClick={() => {
                  const href = pendingNavigationHref;
                  setPendingNavigationHref(null);
                  setNavigating(true);
                  router.push(href);
                  if (href.endsWith("/teaching-plan")) router.refresh();
                }}
                type="button"
                variant="destructive"
              >
                放弃并离开
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function ContentChatAvatar({ role }: { role: "assistant" | "teacher" }) {
  const isTeacher = role === "teacher";
  return (
    <span aria-label={isTeacher ? "老师" : "AI 助手"} className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", isTeacher ? "bg-primary text-primary-foreground" : "bg-primary-50 text-primary")} role="img">
      {isTeacher ? <UserRound className="size-3.5" /> : <Bot className="size-3.5" />}
    </span>
  );
}

function AssistantMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <ContentChatAvatar role="assistant" />
      {children}
    </div>
  );
}

type TimelineStatus = AiHistoryStatus;

function TimelineCard({ children, role = "assistant", title, status, createdAt, targetLabel, meta, footer, accent = false, statusEmphasis = false, wide = false, testId, requestId }: { children: React.ReactNode; role?: "assistant" | "teacher"; title: string; status?: TimelineStatus; createdAt?: string; targetLabel?: string; meta?: React.ReactNode; footer?: React.ReactNode; accent?: boolean; statusEmphasis?: boolean; wide?: boolean; testId?: string; requestId?: string }) {
  const isTeacher = role === "teacher";
  return (
    <div className={cn("flex items-start gap-1.5", isTeacher ? "justify-end" : "justify-start")}>
      {!isTeacher ? <ContentChatAvatar role="assistant" /> : null}
      <AiHistoryCard accent={accent} createdAt={createdAt} footer={footer} meta={meta} requestId={requestId} role={role} status={status} statusEmphasis={statusEmphasis} targetLabel={targetLabel} testId={testId} title={title} wide={wide}>{children}</AiHistoryCard>
      {isTeacher ? <ContentChatAvatar role="teacher" /> : null}
    </div>
  );
}

function ContentChatMessage({ children, role, system = false, createdAt, targetLabel, details }: { children: React.ReactNode; role: "assistant" | "teacher"; system?: boolean; createdAt?: string; targetLabel?: string; details?: Record<string, unknown> | null }) {
  const source = details?.triggerSource === "ui_action" ? "按钮操作" : details?.triggerSource === "teacher_input" ? "手动输入" : null;
  const retryAttempt = typeof details?.retryAttempt === "number" ? details.retryAttempt : null;
  const meta = source || (retryAttempt && retryAttempt > 1) ? <><span>{source}</span>{retryAttempt && retryAttempt > 1 ? <span>第 {retryAttempt} 次尝试</span> : null}</> : undefined;
  const title = role === "teacher" ? (source === "按钮操作" ? "老师操作" : "我的要求") : system ? "系统记录" : "AI 助手";
  return <TimelineCard createdAt={createdAt} meta={meta} role={role} targetLabel={targetLabel} title={title}>{children}</TimelineCard>;
}

function ChatAction({ title, children }: { title: string; children: React.ReactNode }) {
  return <TimelineCard accent testId="content-chat-action" title={title}>{children}</TimelineCard>;
}

function TimelineNoticeCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <TimelineCard status="stale" title={title}>{children}</TimelineCard>;
}

function ReadingReadyActions({ onContinue, onRegenerate, disabled = false }: { onContinue?: () => void; onRegenerate?: () => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button disabled={disabled || !onContinue} onClick={onContinue} size="sm">
        确认并生成练习
        <ChevronRight className="size-4" />
      </Button>
      <Button disabled={disabled || !onRegenerate} onClick={onRegenerate} size="sm" variant="outline">
        <RotateCcw className="size-4" />
        重新生成阅读内容
      </Button>
    </div>
  );
}

function ReadingReadyCard({ onContinue, onRegenerate }: { onContinue: () => void; onRegenerate: () => void }) {
  return (
    <TimelineCard footer={<ReadingReadyActions onContinue={onContinue} onRegenerate={onRegenerate} />} status="succeeded" testId="content-reading-ready-card" title="阅读内容已生成" wide>
      <p className="text-muted-foreground">阅读内容已保存。确认后即可生成章节与课后练习。</p>
    </TimelineCard>
  );
}

function TimelineOperationCard({ messages, requestId, phase, elapsedSeconds, targetLabel, onRetry, onContinue, onRegenerateReading }: { messages: CourseContentState["messages"]; requestId: string; phase: CourseContentState["phase"]; elapsedSeconds: number; targetLabel?: string; onRetry?: () => void; onContinue?: () => void; onRegenerateReading?: () => void }) {
  const operationEvents = messages.filter((message) => message.kind === "operation");
  const latest = operationEvents[operationEvents.length - 1] ?? messages[messages.length - 1]!;
  const terminal = [...operationEvents].reverse().find((message) => message.status === "succeeded" || message.status === "failed");
  const status = (terminal?.status ?? "running") as TimelineStatus;
  const operation = latest.operation ?? "reading";
  const presentation = contentOperationPresentation(operation, phase, targetLabel, false, messages.some((message) => message.kind === "repair"));
  const details = status === "failed"
    ? messages.filter((message) => message.kind === "repair" || (message.kind === "operation" && message.status === "failed"))
    : messages.filter((message) => message.id !== latest.id);
  const retryAttempt = operationDetailNumber(terminal ?? latest, "retryAttempt") ?? operationDetailNumber(latest, "retryAttempt") ?? 1;
  const recordedDurationMs = operationDetailNumber(terminal ?? latest, "durationMs");
  const firstEventAt = new Date(operationEvents[0]?.createdAt ?? latest.createdAt).getTime();
  const terminalAt = terminal ? new Date(terminal.createdAt).getTime() : Number.NaN;
  const durationSeconds = recordedDurationMs !== null
    ? Math.round(recordedDurationMs / 1000)
    : Number.isFinite(firstEventAt) && Number.isFinite(terminalAt) ? Math.max(0, Math.round((terminalAt - firstEventAt) / 1000)) : null;
  const meta = status !== "running" && (durationSeconds !== null || retryAttempt > 1) ? <>{durationSeconds !== null ? <span>执行用时 {formatAiDuration(durationSeconds)}</span> : null}{retryAttempt > 1 ? <span>第 {retryAttempt} 次尝试</span> : null}</> : undefined;
  const footer = status === "succeeded" && operation === "reading" ? (
    <ReadingReadyActions disabled={!onContinue || !onRegenerateReading} onContinue={onContinue} onRegenerate={onRegenerateReading} />
  ) : status === "failed" ? (
    <Button className="w-full" disabled={!onRetry} onClick={onRetry} size="sm">
      <RotateCcw className="size-4" />
      重试本次操作
    </Button>
  ) : undefined;
  const estimate = operation === "reading" ? "5–10 分钟" : operation === "exercises" ? "2–5 分钟" : "1–3 分钟";
  return (
    <TimelineCard createdAt={latest.createdAt} footer={footer} meta={meta} requestId={requestId} status={status} statusEmphasis targetLabel={targetLabel} testId="content-operation-card" title={latest.title ?? presentation.title} wide={status !== "running" || Boolean(onContinue)}>
      <p className="text-muted-foreground">{status === "failed" ? "已完成的内容已保存，只需重试未通过的部分。" : onContinue ? "阅读内容已保存。确认后即可生成章节与课后练习。" : latest.content}</p>
      {status === "running" ? (
        <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 font-medium text-foreground"><LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />{presentation.steps[Math.min(presentation.currentStep, presentation.steps.length - 1)]}</p>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">已用时 {elapsedSeconds > 0 ? formatAiDuration(elapsedSeconds) : "刚刚开始"}</span>
          </div>
          <ol aria-label="处理阶段" className="mt-3 grid gap-1.5">
            {presentation.steps.map((step, index) => {
              const active = index === presentation.currentStep;
              const complete = index < presentation.currentStep;
              return (
                <li className={cn("flex items-center gap-2 text-xs leading-5", active ? "font-medium text-foreground" : complete ? "text-primary-700" : "text-muted-foreground")} key={step}>
                  {complete ? <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-emerald-600" /> : active ? <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" /> : <span aria-hidden className="ml-0.5 size-2.5 shrink-0 rounded-full border border-border" />}
                  <span>{step}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 border-t border-border pt-2 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">预计用时 {estimate}</span> · {elapsedSeconds < 30 ? "任务已经提交，本次操作只会执行一次。" : elapsedSeconds < 90 ? "任务进度会自动保存，无需刷新或重复提交。" : "长内容仍在生成或校验，可以稍后返回查看，结果会自动保存。"}</p>
        </div>
      ) : null}
      {details.length ? (
        <details className="group mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {status === "failed" ? "查看失败原因" : "查看处理详情"}
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          </summary>
          <ol className="grid gap-2 pb-1 pt-1">
            {details.map((message) => {
              const issues = repairIssueDetails(message);
              return (
                <li className="text-pretty leading-5" key={message.id}>
                  <p>{message.content}</p>
                  {issues.length ? <ul className="mt-1.5 space-y-1 border-l border-border pl-2">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}
    </TimelineCard>
  );
}

function mobileModeClass(active: boolean) {
  return cn("min-h-11 shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground");
}

function isRepairMessage(content: string) {
  return content.includes("正在统一修复") || content.includes("正在单独修复");
}

function operationDetailNumber(message: CourseContentState["messages"][number], key: string) {
  const value = message.details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function repairIssueDetails(message: CourseContentState["messages"][number]) {
  const issues = message.details?.issues;
  return Array.isArray(issues) ? issues.filter((issue): issue is string => typeof issue === "string") : [];
}

function RepairMessage({ message, working, failed }: { message: CourseContentState["messages"][number]; working: boolean; failed: boolean }) {
  const status = failed ? "failed" : working ? "working" : "completed";
  const issues = repairIssueDetails(message);
  return (
    <details className={cn("group w-fit max-w-xl rounded-xl border border-border bg-card text-sm text-foreground shadow-sm", status === "failed" && "border-destructive/30")} key={status} open={status !== "completed" || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {status === "working" ? <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" /> : status === "failed" ? <AlertCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
        <span>{status === "working" ? "修复中" : status === "failed" ? "本轮修复未通过" : "修复完成"}</span>
        <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border px-3 py-2.5 text-pretty leading-6 text-muted-foreground">
        <p>{message.content}</p>
        {issues.length ? <ol className="mt-2 space-y-1 border-t border-border/70 pt-2 text-xs">{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ol> : null}
      </div>
    </details>
  );
}

function RepairHistoryGroup({ messages }: { messages: CourseContentState["messages"] }) {
  return (
    <details className="group w-fit max-w-xl rounded-xl border border-border bg-card text-sm text-foreground shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <CheckCircle2 className="size-4 text-emerald-600" />
        <span>系统已完成 {messages.length} 轮内容修复</span>
        <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
      </summary>
      <ol className="space-y-2 border-t border-border px-3 py-2.5 leading-6 text-muted-foreground">
        {messages.map((message, index) => <li key={message.id}>{index + 1}. {message.content}</li>)}
      </ol>
    </details>
  );
}

function SectionPage({ page, selected }: { page: TextPreviewPage; selected: boolean }) {
  const answers = previewPageAnswerText(page);
  return (
    <article className="mx-auto w-full" data-preview-page>
      <div className={cn("aspect-video w-full overflow-hidden rounded-lg border bg-card shadow-sm transition-[border-color,box-shadow] duration-200", selected ? "border-primary ring-2 ring-primary/15" : "border-primary-100")}>
        <PreviewSlide answerMode="hidden" backgroundMode="plain" page={page} presentation={DEFAULT_COURSE_PRESENTATION} />
      </div>
      {answers ? (
        <div className="mt-2 rounded-lg bg-card px-3 py-2 text-[clamp(13px,1.25vw,16px)] leading-5 text-muted-foreground shadow-sm ring-1 ring-inset ring-border" data-step4-answers>
          <span className="font-semibold text-foreground">教师答案：</span>
          {answers}
        </div>
      ) : null}
    </article>
  );
}
