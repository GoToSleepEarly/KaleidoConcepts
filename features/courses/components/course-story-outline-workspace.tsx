"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Bot, Check, Loader2, Pencil, RotateCcw, Search, Send, Sparkles, UserRound } from "lucide-react";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AiOperationStatusCard, AiWorkspaceGuide, CourseAiWorkspaceFrame, type AiOperationPresentation } from "@/features/courses/components/course-ai-workspace";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import { CourseStaleNotice } from "@/features/courses/components/course-stale-notice";
import { OverflowingKnowledgePointTitle } from "@/features/grammar/components/overflowing-knowledge-point-title";
import type { CourseSourceReference, CourseStoryChatAction, CourseStoryMessageInput, CourseStoryOutline, CourseStoryOutlineState, CourseStoryDirection, PresetOption, StoryWritingProvider } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";
import { createRequestId } from "@/lib/utils/request-id";

type ComposerIntent = { action: "revise_direction"; label: string; targetId: string } | { action: "revise_outline"; label: string } | { action: "revise_chapter"; label: string; targetChapterOrder: number };

type ResultTab = "outline" | "characters" | "references" | "directions";

type PendingOutlineMutation = {
  input: CourseStoryMessageInput;
  label: string;
  options: {
    optimisticMessage?: string;
    restoreMessage?: string;
    restoreRandomSupplement?: string;
    preserveComposer?: boolean;
  };
};

const outlineMutationActions = new Set<CourseStoryChatAction["action"]>(["confirm_direction", "generate_from_reference", "regenerate_outline", "revise_outline", "revise_chapter", "confirm_story_change"]);

function latestResultTab(state: CourseStoryOutlineState): ResultTab {
  const candidates: Array<{ tab: ResultTab; time: number }> = [];
  if (state.outline)
    candidates.push({
      tab: "outline",
      time: new Date(state.outline.updatedAt).getTime(),
    });
  if (state.referenceMaterials.length)
    candidates.push({
      tab: "references",
      time: Math.max(...state.referenceMaterials.map((item) => new Date(item.updatedAt).getTime())),
    });
  if (state.directions.length)
    candidates.push({
      tab: "directions",
      time: Math.max(...state.directions.map((item) => new Date(item.createdAt).getTime())),
    });
  return candidates.sort((left, right) => right.time - left.time)[0]?.tab ?? "outline";
}

function resultTabAfterUpdate(previous: CourseStoryOutlineState, next: CourseStoryOutlineState, current: ResultTab): ResultTab {
  if (next.outline?.updatedAt !== previous.outline?.updatedAt) return "outline";
  const previousReferenceVersion = previous.referenceMaterials.map((item) => `${item.id}:${item.updatedAt}`).join("|");
  const nextReferenceVersion = next.referenceMaterials.map((item) => `${item.id}:${item.updatedAt}`).join("|");
  if (nextReferenceVersion !== previousReferenceVersion) return "references";
  const previousDirectionVersion = previous.directions.map((item) => `${item.id}:${item.createdAt}:${item.selectedAt ?? ""}`).join("|");
  const nextDirectionVersion = next.directions.map((item) => `${item.id}:${item.createdAt}:${item.selectedAt ?? ""}`).join("|");
  if (nextDirectionVersion !== previousDirectionVersion) return "directions";
  return current;
}

function hasStoryResult(state: CourseStoryOutlineState) {
  return Boolean(state.directions.length || state.referenceMaterials.length || state.outline);
}

function isCourseStoryOutlineState(value: unknown): value is CourseStoryOutlineState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CourseStoryOutlineState>;
  return Boolean(candidate.course?.id && candidate.settings) && Array.isArray(candidate.chatMessages) && Array.isArray(candidate.directions) && Array.isArray(candidate.referenceMaterials) && Array.isArray(candidate.coursePeople);
}

export function CourseStoryOutlineWorkspace({ initialState, themePresets = [], storyTypePresets = [], storyTonePresets = [] }: { initialState: CourseStoryOutlineState; themePresets?: PresetOption[]; storyTypePresets?: PresetOption[]; storyTonePresets?: PresetOption[] }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [mode, setMode] = useState<"idea" | "random">("idea");
  const [mobileView, setMobileView] = useState<"chat" | "result">("chat");
  const [message, setMessage] = useState("");
  const [randomSupplement, setRandomSupplement] = useState("");
  const [chapterCount, setChapterCount] = useState(initialState.settings.chapterCount);
  const [writingProvider, setWritingProvider] = useState<StoryWritingProvider>(initialState.settings.writingProvider);
  const [selectedTheme, setSelectedTheme] = useState<PresetOption | null>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [storyTypePickerOpen, setStoryTypePickerOpen] = useState(false);
  const [tonePickerOpen, setTonePickerOpen] = useState(false);
  const [storyType, setStoryType] = useState("");
  const [customStoryType, setCustomStoryType] = useState("");
  const [tone, setTone] = useState("");
  const [customTone, setCustomTone] = useState("");
  const [pending, setPending] = useState(initialState.operation?.status === "running");
  const [pendingLabel, setPendingLabel] = useState(() => operationLoadingLabel(initialState.operation?.phase));
  const [pendingAction, setPendingAction] = useState(initialState.operation?.action ?? "idea");
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [resultTab, setResultTab] = useState<ResultTab>(() => latestResultTab(initialState));
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingOutlineMutation, setPendingOutlineMutation] = useState<PendingOutlineMutation | null>(null);
  const [optimisticTeacherMessage, setOptimisticTeacherMessage] = useState("");
  const [composerIntent, setComposerIntent] = useState<ComposerIntent | null>(null);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const requestInFlight = useRef(false);
  const stateRef = useRef(initialState);
  const hasStepContent = Boolean(state.chatMessages.length || state.directions.length || state.referenceMaterials.length || state.outline);
  const hasResultContent = Boolean(state.directions.length || state.referenceMaterials.length || state.outline);
  const conversationStarted = hasStepContent || pending || Boolean(state.operation) || Boolean(optimisticTeacherMessage);
  const hasUnsentInput = Boolean(message.trim() || (mode === "random" && (randomSupplement.trim() || selectedTheme || storyType || tone)));
  const resolvedStoryType = storyType === "__custom__" ? customStoryType.trim() : storyType;
  const resolvedTone = tone === "__custom__" ? customTone.trim() : tone;
  const hasCurrentRetryAction = state.operation?.status === "failed" && state.chatMessages.some((chat) => chat.actions.some((action) => action.action === "retry_operation" && (!action.targetId || action.targetId === state.operation?.requestId)));

  const applyNextState = useCallback((nextState: CourseStoryOutlineState) => {
    const previousState = stateRef.current;
    stateRef.current = nextState;
    setResultTab((currentTab) => resultTabAfterUpdate(previousState, nextState, currentTab));
    if (!hasStoryResult(previousState) && hasStoryResult(nextState)) setMobileView("result");
    setState(nextState);
  }, []);

  function navigate(href: string) {
    if (hasUnsentInput) {
      setPendingNavigationHref(href);
      return;
    }
    router.push(href);
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsentInput) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsentInput]);

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setPendingSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  useEffect(() => {
    const timeline = chatScrollRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [optimisticTeacherMessage, pending, pendingLabel, state.chatMessages.length, state.operation?.status, state.operation?.updatedAt, state.outline?.updatedAt]);

  useEffect(() => {
    let active = true;
    const refreshPersistedState = async () => {
      try {
        const response = await fetch(`/api/courses/${initialState.course.id}/story-outline`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const nextState: unknown = await response.json();
        if (!active || requestInFlight.current || !isCourseStoryOutlineState(nextState)) return;
        if (JSON.stringify(nextState) === JSON.stringify(stateRef.current)) return;
        applyNextState(nextState);
        setChapterCount(nextState.settings.chapterCount);
        setWritingProvider(nextState.settings.writingProvider);
        const operationRunning = nextState.operation?.status === "running";
        setPending(operationRunning);
        setPendingLabel(operationRunning ? operationLoadingLabel(nextState.operation?.phase) : "");
        setError(nextState.operation?.status === "failed" ? (nextState.operation.errorMessage ?? "") : "");
      } catch {
        // 首屏仍可使用时，恢复请求失败不能把已有内容替换为空状态。
      }
    };
    void refreshPersistedState();
    return () => {
      active = false;
    };
  }, [applyNextState, initialState.course.id]);

  useEffect(() => {
    if (!pending) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/courses/${state.course.id}/story-outline`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const nextState = (await response.json()) as CourseStoryOutlineState;
        if (!active) return;
        applyNextState(nextState);
        if (!requestInFlight.current) {
          const operationRunning = nextState.operation?.status === "running";
          setPending(operationRunning);
          setPendingLabel(operationRunning ? operationLoadingLabel(nextState.operation?.phase) : "");
          if (nextState.operation?.status === "failed" && nextState.operation.errorMessage) setError(nextState.operation.errorMessage);
        }
        if (optimisticTeacherMessage && nextState.chatMessages.some((chat) => chat.role === "teacher" && chat.content === optimisticTeacherMessage)) {
          setOptimisticTeacherMessage("");
        }
      } catch {
        // 轮询只用于补充等待反馈，失败时保留当前界面并等待主请求返回。
      }
    };
    const first = window.setTimeout(() => void refresh(), 700);
    const timer = window.setInterval(() => void refresh(), 1400);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [applyNextState, optimisticTeacherMessage, pending, state.course.id]);

  async function postMessage(
    input: CourseStoryMessageInput,
    label = "正在处理...",
    options: {
      optimisticMessage?: string;
      restoreMessage?: string;
      restoreRandomSupplement?: string;
      preserveComposer?: boolean;
    } = {},
  ) {
    if (input.action && outlineMutationActions.has(input.action) && input.preserveDownstream !== true && courseStageStep(stateRef.current.course.currentStage) >= 3) {
      setPendingOutlineMutation({ input, label, options });
      return false;
    }
    const optimisticMessage = options.optimisticMessage ?? input.message.trim();
    const requestId = input.requestId ?? createRequestId();
    let operationStillRunning = false;
    let reconciledPendingLabel = "";
    let reconciledAcceptedRequest = false;
    let responseFailure: { message?: string; requestId?: string } | null = null;
    let requestAccepted = false;
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel(label);
    setPendingAction(input.action ?? input.mode);
    setError("");
    requestInFlight.current = true;
    setOptimisticTeacherMessage(optimisticMessage);
    if (!options.preserveComposer) setMessage("");
    if (input.mode === "random") setRandomSupplement("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          requestId,
          chapterCount,
          writingProvider,
        }),
      });
      const data = (await response.json()) as CourseStoryOutlineState & {
        message?: string;
        requiresReset?: boolean;
      };
      if (response.status === 409 && data.requiresReset) {
        setPendingOutlineMutation({ input, label, options });
        return false;
      }
      if (!response.ok) {
        responseFailure = data;
        throw new Error(data.message || "故事大纲生成失败");
      }
      requestAccepted = true;
      applyNextState(data);
      if (input.mode === "random") setMode("idea");
      if (!options.preserveComposer) setMessage("");
      setRandomSupplement("");
    } catch {
      try {
        const latestResponse = await fetch(`/api/courses/${state.course.id}/story-outline`, { cache: "no-store" });
        if (latestResponse.ok) {
          const latestState = (await latestResponse.json()) as CourseStoryOutlineState;
          if (latestState.operation?.requestId === requestId) {
            reconciledAcceptedRequest = true;
            requestAccepted = true;
            operationStillRunning = latestState.operation.status === "running";
            reconciledPendingLabel = operationStillRunning ? operationLoadingLabel(latestState.operation.phase) : "";
            applyNextState(latestState);
            setError("");
          }
        }
      } catch {
        // 无法读取最新状态时，不能假定服务端已经收到本次请求。
      }
      if (!reconciledAcceptedRequest) {
        setError(responseFailure && !responseFailure.requestId ? responseFailure.message || "故事大纲生成失败" : "请求未能确认送达，请检查网络后重新发送。");
        if (options.restoreMessage) setMessage(options.restoreMessage);
        if (options.restoreRandomSupplement) setRandomSupplement(options.restoreRandomSupplement);
      }
    } finally {
      requestInFlight.current = false;
      setPending(operationStillRunning);
      setPendingSeconds(0);
      setPendingLabel(reconciledPendingLabel);
      setOptimisticTeacherMessage("");
    }
    return requestAccepted;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "idea" && !message.trim()) return;
    const teacherMessage = mode === "random" ? ["请帮我生成随机故事方向。", "", `主题：${selectedTheme ? `${selectedTheme.category} / ${selectedTheme.label}` : "任意主题"}`, resolvedStoryType ? `故事类型：${resolvedStoryType}` : "", resolvedTone ? `故事氛围：${resolvedTone}` : "", randomSupplement.trim() ? `补充要求：${randomSupplement.trim()}` : ""].filter((line, index) => index === 1 || Boolean(line)).join("\n") : hasStepContent ? message.trim() : `我的故事想法：\n${message.trim()}`;
    const messageInput: CourseStoryMessageInput = composerIntent
      ? {
          message: teacherMessage,
          mode: "revise",
          action: composerIntent.action,
          ...(composerIntent.action === "revise_direction" ? { targetId: composerIntent.targetId } : {}),
          ...(composerIntent.action === "revise_chapter" ? { targetChapterOrder: composerIntent.targetChapterOrder } : {}),
        }
      : { message: teacherMessage, mode };
    const accepted = await postMessage(messageInput, composerIntent?.action === "revise_direction" ? "正在调整故事方向..." : composerIntent?.action === "revise_outline" ? "正在调整故事大纲..." : composerIntent?.action === "revise_chapter" ? `正在调整第 ${composerIntent.targetChapterOrder} 章...` : mode === "random" ? "正在生成故事方向..." : "正在分析故事要求...", {
      restoreMessage: mode === "idea" ? message : undefined,
      restoreRandomSupplement: mode === "random" ? randomSupplement : undefined,
    });
    if (accepted) setComposerIntent(null);
  }

  async function confirm() {
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel("正在确认故事大纲...");
    setError("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/confirm`, { method: "POST" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "故事大纲确认失败");
      router.push(`/courses/${state.course.id}/create/teaching-plan`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事大纲确认失败");
    } finally {
      setPending(false);
      setPendingSeconds(0);
      setPendingLabel("");
    }
  }

  function focusComposerAtEnd(prefix: string) {
    setMessage(prefix);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(prefix.length, prefix.length);
      input.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    });
  }

  function continueModify(prefix: string) {
    setComposerIntent(null);
    focusComposerAtEnd(prefix);
  }

  function prepareComposer(intent: ComposerIntent, prefix: string) {
    setComposerIntent(intent);
    focusComposerAtEnd(prefix);
  }

  async function handleAction(action: CourseStoryChatAction, preserveDownstream = false) {
    if (action.action === "modify_requirements") {
      continueModify("我想调整创作需求：");
      return;
    }
    if (action.label === "继续修改" || action.action === "confirm_reference_object") {
      continueModify("帮我修改：");
      return;
    }
    if (action.action === "supply_reference_material") {
      continueModify("我补充资料：");
      return;
    }
    if (action.action === "describe_story_usage") {
      continueModify("我希望这样讲这个故事：");
      return;
    }
    if (action.action === "retry_operation") {
      await postMessage(
        {
          message: "",
          mode: "idea",
          action: "retry_operation",
          targetId: action.targetId,
        },
        operationLoadingLabel(state.operation?.phase),
      );
      return;
    }
    const isReferenceSearch = action.action === "choose_reference_search" || action.action === "request_reference_search";
    const isRequirementConfirmation = action.action === "confirm_requirements";
    const isStoryChangeAction = action.action === "confirm_story_change" || action.action === "cancel_story_change";
    const isReferenceConfirmation = action.action === "confirm_reference_materials" || action.action === "choose_story_usage";
    const label = isReferenceSearch ? "正在整理参考资料..." : isRequirementConfirmation ? "正在准备故事创作..." : action.action === "confirm_story_change" ? "正在应用已确认的故事修改..." : action.action === "cancel_story_change" ? "正在保留当前内容..." : isReferenceConfirmation ? "正在继续构思故事..." : action.action === "generate_directions" ? "正在生成故事方向..." : "正在生成故事大纲...";
    const draft = isRequirementConfirmation || isStoryChangeAction ? "" : message.trim();
    const optimisticMessage = draft || actionHistoryMessage(action);
    await postMessage(
      {
        message: draft,
        mode: action.action === "regenerate_outline" || isStoryChangeAction ? "revise" : "idea",
        action: action.action,
        targetId: action.targetId,
        researchPlan: action.researchPlan,
        preserveDownstream,
      },
      label,
      {
        optimisticMessage,
        restoreMessage: draft,
        preserveComposer: isRequirementConfirmation || isStoryChangeAction,
      },
    );
  }

  async function resetStep() {
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel("正在重新开始...");
    setError("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/reset`, { method: "POST" });
      const data = (await response.json()) as CourseStoryOutlineState & {
        message?: string;
      };
      if (!response.ok) throw new Error(data.message || "故事大纲重置失败");
      setState(data);
      stateRef.current = data;
      setMessage("");
      setRandomSupplement("");
      setSelectedTheme(null);
      setStoryType("");
      setCustomStoryType("");
      setTone("");
      setCustomTone("");
      setMode("idea");
      setResultTab("outline");
      setResetOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事大纲重置失败");
    } finally {
      setPending(false);
      setPendingSeconds(0);
      setPendingLabel("");
    }
  }

  return (
    <div className={cn("mx-auto flex max-w-7xl flex-col gap-4 lg:gap-5", hasResultContent && "gap-3 max-lg:h-[calc(100dvh-7.25rem)] max-lg:overflow-hidden lg:h-[calc(100dvh-8.5rem)] lg:min-h-[36rem] lg:gap-4 lg:overflow-hidden")} data-testid="story-outline-shell">
      <CourseCreateSteps courseId={state.course.id} currentStep={2} furthestStep={courseStageStep(state.course.currentStage)} onNavigate={navigate} />
      <CourseStaleNotice staleFromStage={state.course.staleFromStage} stage="story_outline" />
      <div className="flex shrink-0 items-end justify-between gap-4" data-testid="story-stage-heading-row">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">故事大纲</h2>
          {state.selectedKnowledgePoints?.find((point) => point.bookTitle) ? (() => {
            const source = state.selectedKnowledgePoints!.find((point) => point.bookTitle)!;
            return <p className="mt-1 text-xs text-muted-foreground">《{source.bookTitle}》 · {source.edition} · {source.officialLevel}</p>;
          })() : null}
        </div>
        <div className="flex items-center gap-2">
          {hasStepContent ? (
            <Button disabled={pending} onClick={() => setResetOpen(true)} type="button" variant="outline">
              <RotateCcw className="size-4" />
              重新开始本轮构思
            </Button>
          ) : null}
        </div>
      </div>

      <CourseAiWorkspaceFrame
        active={hasResultContent}
        className={cn(hasResultContent && "gap-3 max-lg:flex-1 max-lg:overflow-hidden lg:flex-1 lg:gap-3")}
        footer={(
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-2 shadow-md sm:items-center sm:justify-between sm:flex-row" data-testid="story-step-footer">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {hasUnsentInput ? "输入内容尚未发送" : state.outline ? "故事大纲已生成，可以进入教学规划" : "还需：生成故事大纲"}
            </p>
            <div className="flex gap-2">
              <Button disabled={pending} onClick={() => navigate(`/courses/${state.course.id}/create/audience`)} type="button" variant="outline">
                <ArrowLeft className="size-4" />
                上一步
              </Button>
              <Button disabled={pending || !state.outline || state.alignment?.artifactsOutdated === true} loading={pending && pendingLabel === "正在确认故事大纲..."} onClick={() => (courseStageStep(state.course.currentStage) >= 3 ? navigate(`/courses/${state.course.id}/create/teaching-plan`) : void confirm())} type="button">
                下一步：教学规划
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      >
      <div className={cn("grid min-h-0 gap-4 lg:gap-5", hasResultContent ? "h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden xl:grid-cols-[minmax(420px,1fr)_minmax(0,1.2fr)] xl:grid-rows-[minmax(0,1fr)]" : "w-full xl:grid-cols-[minmax(0,2fr)_minmax(260px,0.75fr)] xl:items-start")} data-layout={hasResultContent ? "split" : "focus"} data-testid="story-outline-layout">
        {hasResultContent ? (
          <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1 xl:hidden" data-testid="story-mobile-view-tabs">
            <button aria-pressed={mobileView === "chat"} className={modeClass(mobileView === "chat")} onClick={() => setMobileView("chat")} type="button">
              聊天
            </button>
            <button aria-pressed={mobileView === "result"} className={modeClass(mobileView === "result")} onClick={() => setMobileView("result")} type="button">
              结果
            </button>
          </div>
        ) : null}
        <section className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-sm", hasResultContent && "lg:h-full", !hasResultContent && "self-start", hasResultContent && mobileView === "result" && "hidden xl:flex")} data-testid="story-chat-pane">
          <div className={cn("border-b border-border", conversationStarted ? "flex min-h-14 items-center justify-between gap-3 px-4 py-2" : "p-4", !hasResultContent && "max-w-3xl")} data-testid="story-chat-toolbar">
            {!conversationStarted ? (
              <div className={cn("grid grid-cols-2 gap-2 rounded-lg bg-muted p-1", !hasResultContent && "w-full")}>
                <button className={modeClass(mode === "idea")} onClick={() => setMode("idea")} type="button">
                  我有想法
                </button>
                <button className={modeClass(mode === "random")} onClick={() => setMode("random")} type="button">
                  随机灵感
                </button>
              </div>
            ) : <span className="shrink-0 text-sm font-semibold text-foreground">创作对话</span>}
            <div className={cn(conversationStarted ? "flex min-w-0 items-center gap-2" : "mt-3 grid w-full grid-cols-2 gap-2 sm:gap-3")} data-testid="story-chat-settings">
              <label className={cn(conversationStarted ? "flex min-w-0 items-center gap-1" : "block")}>
                <span className="shrink-0 text-xs text-muted-foreground">章节数</span>
                <select aria-label="章节数" className={cn("rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100", conversationStarted ? "h-10 w-20" : "mt-1 h-9 w-full sm:h-10 sm:px-3")} onChange={(event) => setChapterCount(Number(event.target.value))} value={chapterCount}>
                  {[3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value} 章
                    </option>
                  ))}
                </select>
              </label>
              <label className={cn(conversationStarted ? "flex min-w-0 items-center gap-1" : "block")}>
                <span className="shrink-0 text-xs text-muted-foreground">写作模型</span>
                <select aria-label="写作模型" className={cn("rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100", conversationStarted ? "h-10 w-24" : "mt-1 h-9 w-full sm:h-10 sm:px-3")} onChange={(event) => setWritingProvider(event.target.value as StoryWritingProvider)} value={writingProvider}>
                  <option value="quickrouter_gpt">GPT</option>
                  <option value="quickrouter_deepseek">DeepSeek（成本更低）</option>
                </select>
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-contain scroll-pb-24 p-4" data-testid="story-chat-scroll" ref={chatScrollRef}>
            {!conversationStarted && mode === "random" ? (
              <form className={cn("w-full space-y-4 rounded-lg border border-border bg-muted/30 p-4", !hasResultContent && "max-w-3xl")} onSubmit={submit}>
                <h3 className="font-medium text-foreground">生成故事方向</h3>
                <div className="block">
                  <span className="text-xs text-muted-foreground">主题灵感</span>
                  <button aria-label="选择主题" className="mt-1 flex min-h-12 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setThemePickerOpen(true)} type="button">
                    <span className="line-clamp-2 min-w-0 break-words leading-5 text-pretty">{selectedTheme ? `${selectedTheme.category} / ${selectedTheme.label}` : "任意主题"}</span>
                    <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </div>
                <div className="grid items-start gap-3 sm:grid-cols-2">
                  <PresetPickerField customValue={customStoryType} label="故事类型" onOpen={() => setStoryTypePickerOpen(true)} value={storyType} />
                  <PresetPickerField customValue={customTone} label="故事氛围" onOpen={() => setTonePickerOpen(true)} value={tone} />
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">补充要求（可选）</span>
                  <input aria-label="补充要求（可选）" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setRandomSupplement(event.target.value)} placeholder="例如：希望学生成为大侦探" value={randomSupplement} />
                </label>
                {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                <Button className="w-full" disabled={pending} type="submit">
                  <Sparkles className="size-4" />
                  生成 3 个故事方向
                </Button>
              </form>
            ) : null}
            {state.chatMessages.map((chat) => (
              <div className={cn("flex items-start gap-2", chat.role === "teacher" ? "justify-end" : "justify-start")} key={chat.id}>
                {chat.role !== "teacher" ? <ChatAvatar role="assistant" /> : null}
                <article className={cn("max-w-[calc(100%-2.5rem)] rounded-lg px-3 py-2 text-sm", !hasResultContent && "max-w-2xl", chat.role === "teacher" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                  <p className="whitespace-pre-wrap leading-6">{chat.content}</p>
                  {chat.actions.some((action) => action.action === "submit_alignment_answers" && action.questions?.length) ? (
                    <AlignmentQuestionForm
                      disabled={pending}
                      onSubmit={async (answers, readableMessage) => {
                        await postMessage(
                          {
                            message: readableMessage,
                            mode: "idea",
                            action: "submit_alignment_answers",
                            alignmentAnswers: answers,
                          },
                          "正在确认故事要求...",
                          { optimisticMessage: readableMessage },
                        );
                      }}
                      questions={chat.actions.find((action) => action.action === "submit_alignment_answers")?.questions ?? []}
                    />
                  ) : null}
                  {chat.actions.some((action) => isVisibleChatAction(action, state.operation, state.alignment)) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {chat.actions
                        .filter((action) => isVisibleChatAction(action, state.operation, state.alignment))
                        .map((action) => (
                          <Button disabled={pending} key={action.id} onClick={() => void handleAction(action)} size="sm" type="button" variant="outline">
                            {action.action === "request_reference_search" || action.action === "choose_reference_search" ? <Search className="size-4" /> : <Sparkles className="size-4" />}
                            {action.label}
                          </Button>
                        ))}
                    </div>
                  ) : null}
                </article>
                {chat.role === "teacher" ? <ChatAvatar role="teacher" /> : null}
              </div>
            ))}
            {optimisticTeacherMessage ? (
              <div className="flex items-start justify-end gap-2">
                <article className={cn("max-w-[calc(100%-2.5rem)] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground", !hasResultContent && "max-w-2xl")}>
                  <p className="whitespace-pre-wrap leading-6">{optimisticTeacherMessage}</p>
                </article>
                <ChatAvatar role="teacher" />
              </div>
            ) : null}
            {pending && pendingLabel && pendingLabel !== "正在确认故事大纲..." ? (
              <div className="flex items-start gap-2">
                <ChatAvatar role="assistant" />
                <AiOperationStatusCard compact elapsedSeconds={pendingSeconds} persisted={state.operation?.status === "running"} presentation={storyOperationPresentation(state.operation?.action ?? pendingAction, state.operation?.phase)} />
              </div>
            ) : null}
            {!pending && state.operation?.status === "failed" && !hasCurrentRetryAction ? (
              <div className="flex items-start gap-2">
                <ChatAvatar role="assistant" />
                <div className="max-w-[calc(100%-2.5rem)] space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <p>{state.operation.errorMessage || "当前步骤处理失败"}</p>
                  <Button
                    onClick={() =>
                      void handleAction({
                        id: "retry-operation",
                        label: "重试本步",
                        action: "retry_operation",
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    重试本步
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {mode === "idea" || conversationStarted ? (
            <form className={cn("shrink-0 border-t border-border", conversationStarted ? "p-3" : "p-4")} data-testid="story-chat-composer" onSubmit={submit}>
              <div className={cn("w-full", !hasResultContent && "max-w-3xl")}>
                {composerIntent ? (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-800" role="status">
                    <span className="font-medium">正在修改：{composerIntent.label}</span>
                    <button
                      className="shrink-0 rounded px-2 py-1 font-medium hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => {
                        setComposerIntent(null);
                        setMessage("");
                        inputRef.current?.focus();
                      }}
                      type="button"
                    >
                      取消修改
                    </button>
                  </div>
                ) : null}
                <div className={cn(conversationStarted && "relative")} data-testid={conversationStarted ? "story-inline-composer" : undefined}>
                  <label className="block">
                    <span className={conversationStarted ? "sr-only" : "text-sm font-medium text-foreground"}>{conversationStarted ? "故事想法" : "说说你的故事想法"}</span>
                    {!conversationStarted ? <span className="mt-1 block text-pretty text-xs leading-5 text-muted-foreground">可以写参考人物、IP、故事类型，以及希望老师学生如何参与。例如：老师和学生一起穿越到魔法世界经历了一场奇幻冒险。</span> : null}
                    <AutoGrowTextarea aria-label="故事想法" className={cn("block w-full resize-none overflow-y-hidden rounded-md border border-input bg-background px-3 text-sm leading-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary-100", conversationStarted ? "min-h-13 max-h-32 py-4 pr-16" : "mt-2 min-h-13 max-h-32 py-4")} onChange={(event) => setMessage(event.target.value)} placeholder={conversationStarted ? "继续补充故事要求，或说明希望如何修改" : "输入你的故事想法"} ref={inputRef} rows={1} value={message} />
                  </label>
                  {conversationStarted ? (
                    <Button aria-label={pending ? "处理中" : "发送"} className="absolute bottom-1 right-1 size-11 min-h-11 min-w-11 rounded-full bg-primary-50 p-0 text-primary shadow-none hover:bg-primary-100 hover:text-primary" disabled={pending || (mode === "idea" && !message.trim())} type="submit" variant="ghost">
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
                    </Button>
                  ) : null}
                </div>
                {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                {!conversationStarted ? (
                  <div className="mt-3">
                    <Button className="w-full" disabled={pending || (mode === "idea" && !message.trim())} type="submit">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {pending ? "处理中" : "开始讨论故事"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </form>
          ) : null}
        </section>

        {hasResultContent ? (
          <div className={cn("min-h-0 min-w-0 overflow-y-auto overscroll-contain scroll-pb-24 lg:h-full", mobileView === "chat" && "hidden xl:block")} data-testid="story-result-scroll">
            <ResultPanel
              onDescribeDirection={() => continueModify("我希望的故事方向：")}
              onConfirmDirection={(direction) =>
                postMessage(
                  {
                    message: "",
                    mode: "idea",
                    action: "confirm_direction",
                    targetId: direction.id,
                  },
                  "正在生成故事大纲...",
                  {
                    optimisticMessage: `我选择并生成故事大纲：${splitBilingual(direction.title).zh}`,
                  },
                )
              }
              onReviseDirection={(direction) =>
                prepareComposer(
                  {
                    action: "revise_direction",
                    label: `故事方向「${splitBilingual(direction.title).zh}」`,
                    targetId: direction.id,
                  },
                  `调整故事方向「${splitBilingual(direction.title).zh}」：`,
                )
              }
              onReviseOutline={() => prepareComposer({ action: "revise_outline", label: "整体大纲" }, "修改整体大纲：")}
              onReviseChapter={(order) =>
                prepareComposer(
                  {
                    action: "revise_chapter",
                    label: `第 ${order} 章`,
                    targetChapterOrder: order,
                  },
                  `修改第 ${order} 章：`,
                )
              }
              outline={state.outline}
              pending={pending}
              references={state.referenceMaterials}
              resultTab={resultTab}
              setResultTab={setResultTab}
              state={state}
            />
          </div>
        ) : null}
        {!hasResultContent ? <AiWorkspaceGuide className="hidden xl:block" items={["描述已有想法，或用随机灵感快速确定主题与氛围。", "AI 会先确认创作理解，信息不足时只询问必要问题。", "确认方向后生成可逐章修改的故事大纲。"]} title="从一个清楚的故事目标开始" /> : null}
      </div>
      </CourseAiWorkspaceFrame>
      {themePickerOpen ? (
        <ThemePickerDialog
          onClose={() => setThemePickerOpen(false)}
          onConfirm={(theme) => {
            setSelectedTheme(theme);
            setThemePickerOpen(false);
          }}
          selectedTheme={selectedTheme}
          themes={themePresets}
        />
      ) : null}
      {storyTypePickerOpen ? (
        <PresetPickerDialog
          customValue={customStoryType}
          label="故事类型"
          onClose={() => setStoryTypePickerOpen(false)}
          onConfirm={(value) => {
            setStoryType(value);
            setStoryTypePickerOpen(false);
          }}
          onCustomChange={setCustomStoryType}
          presets={storyTypePresets}
          value={storyType}
        />
      ) : null}
      {tonePickerOpen ? (
        <PresetPickerDialog
          customValue={customTone}
          label="故事氛围"
          onClose={() => setTonePickerOpen(false)}
          onConfirm={(value) => {
            setTone(value);
            setTonePickerOpen(false);
          }}
          onCustomChange={setCustomTone}
          presets={storyTonePresets}
          value={tone}
        />
      ) : null}
      {resetOpen ? (
        <Dialog onClose={() => setResetOpen(false)} open title="重新开始本轮构思？">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-sm leading-6 text-muted-foreground">将删除当前故事构思并重新开始。教学规划及后续内容不会被删除，但仍会保留旧版本。</p>
            {error && resetOpen ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button disabled={pending} onClick={() => setResetOpen(false)} type="button" variant="outline">
                保留当前内容
              </Button>
              <Button disabled={pending} onClick={() => void resetStep()} type="button">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                删除故事构思并重新开始
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {pendingOutlineMutation ? (
        <Dialog description="后续内容将保留旧版本" onClose={() => setPendingOutlineMutation(null)} open title={pendingOutlineMutation.input.action === "regenerate_outline" ? "重新生成故事大纲？" : "继续修改故事大纲？"}>
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-sm leading-6 text-muted-foreground">本次修改成功后，教学规划及后续内容不会自动更新，也不会被删除。请进入对应阶段手动重置。</p>
            <div className="flex justify-end gap-2">
              <Button disabled={pending} onClick={() => setPendingOutlineMutation(null)} type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  const pendingMutation = pendingOutlineMutation;
                  setPendingOutlineMutation(null);
                  if (pendingMutation) void postMessage({ ...pendingMutation.input, preserveDownstream: true }, pendingMutation.label, pendingMutation.options);
                }}
                type="button"
              >
                {pendingOutlineMutation.input.action === "regenerate_outline" ? "继续重新生成" : "继续修改"}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {pendingNavigationHref ? (
        <Dialog onClose={() => setPendingNavigationHref(null)} open size="compact" title="放弃未发送的内容？">
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-pretty text-sm leading-6 text-muted-foreground">输入框中还有未发送的内容。离开后这些内容不会保存。</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPendingNavigationHref(null)} type="button" variant="outline">
                留在当前页
              </Button>
              <Button
                onClick={() => {
                  const href = pendingNavigationHref;
                  setPendingNavigationHref(null);
                  router.push(href);
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

function PresetPickerField({ customValue, label, onOpen, value }: { customValue: string; label: string; onOpen: () => void; value: string }) {
  const displayValue = value === "__custom__" ? customValue.trim() || "自定义" : value || "不限";
  return (
    <div className="block">
      <span className="text-xs text-muted-foreground">{label}（可选）</span>
      <button aria-label={`选择${label}`} className="mt-1 flex min-h-12 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen} type="button">
        <span className="line-clamp-2 min-w-0 break-words leading-5">{displayValue}</span>
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

function PresetPickerDialog({ customValue, label, onClose, onConfirm, onCustomChange, presets, value }: { customValue: string; label: string; onClose: () => void; onConfirm: (value: string) => void; onCustomChange: (value: string) => void; presets: PresetOption[]; value: string }) {
  const [selectedValue, setSelectedValue] = useState(value);
  const customSelected = selectedValue === "__custom__";
  return (
    <Dialog description={`选择一个${label}，也可以输入本次课程专用的自定义内容。`} onClose={onClose} open title={`选择${label}`}>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { id: "__none__", label: "不限", value: "" },
            ...presets.map((preset) => ({
              id: preset.id,
              label: preset.label,
              value: preset.label,
            })),
            { id: "__custom__", label: "自定义", value: "__custom__" },
          ].map((option) => (
            <button aria-pressed={selectedValue === option.value} className={cn("min-h-12 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedValue === option.value ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background hover:border-primary-300")} key={option.id} onClick={() => setSelectedValue(option.value)} type="button">
              {option.label}
            </button>
          ))}
        </div>
        {customSelected ? (
          <label className="block">
            <span className="text-sm font-medium text-foreground">自定义{label}</span>
            <input aria-label={`自定义${label}`} autoFocus className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => onCustomChange(event.target.value)} placeholder={`输入${label}`} value={customValue} />
          </label>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={customSelected && !customValue.trim()} onClick={() => onConfirm(selectedValue)} type="button">
            确认{label}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ThemePickerDialog({ themes, selectedTheme, onClose, onConfirm }: { themes: PresetOption[]; selectedTheme: PresetOption | null; onClose: () => void; onConfirm: (theme: PresetOption | null) => void }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(selectedTheme?.id ?? null);
  const categories = [...new Set(themes.map((theme) => theme.category ?? "未分类"))];
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = themes.filter((theme) => {
    const category = theme.category ?? "未分类";
    const categoryMatches = Boolean(normalizedQuery) || activeCategory === "全部" || activeCategory === category;
    return categoryMatches && (!normalizedQuery || `${category} ${theme.label}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
  });

  return (
    <Dialog description="每次选择一个主题方向；AI 会结合故事类型和氛围生成三个不同目标。" onClose={onClose} open title="选择主题" size="wide">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b border-border p-4 sm:p-5">
          <label className="relative block">
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">搜索主题</span>
            <input aria-label="搜索主题" className="min-h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题方向或大类" role="searchbox" value={query} />
          </label>
          <div aria-label="主题大类" className="flex gap-1 overflow-x-auto rounded-md bg-muted p-1" role="tablist">
            {["全部", ...categories].map((category) => (
              <button
                aria-selected={activeCategory === category}
                className={cn("min-h-9 shrink-0 rounded px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", activeCategory === category ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")}
                key={category}
                onClick={() => {
                  setActiveCategory(category);
                  setQuery("");
                }}
                role="tab"
                type="button"
              >
                {category}
                {category === "全部" ? ` ${themes.length}` : ` ${themes.filter((theme) => (theme.category ?? "未分类") === category).length}`}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {!normalizedQuery && activeCategory === "全部" ? (
              <button aria-pressed={selectedId === null} className={cn("min-h-14 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === null ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background hover:border-primary-300")} onClick={() => setSelectedId(null)} type="button">
                任意主题
              </button>
            ) : null}
            {filtered.map((theme) => (
              <button aria-pressed={selectedId === theme.id} className={cn("min-h-14 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === theme.id ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background hover:border-primary-300")} key={theme.id} onClick={() => setSelectedId(theme.id)} type="button">
                {theme.label}
              </button>
            ))}
          </div>
          {!filtered.length ? <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的主题方向</p> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border p-4 sm:px-5">
          <span className="text-sm text-muted-foreground">{selectedId ? `已选择 ${themes.find((theme) => theme.id === selectedId)?.label ?? "主题"}` : "已选择任意主题"}</span>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button onClick={() => onConfirm(themes.find((theme) => theme.id === selectedId) ?? null)} type="button">
              确认主题
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function modeClass(active: boolean) {
  return cn("min-h-11 rounded-md px-3 text-sm font-medium", active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70");
}

function ChatAvatar({ role }: { role: "assistant" | "teacher" }) {
  const isTeacher = role === "teacher";
  return (
    <div aria-label={isTeacher ? "老师" : "AI 助手"} className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", isTeacher ? "border-primary bg-primary text-primary-foreground" : "border-primary-100 bg-primary-50 text-primary")} role="img">
      {isTeacher ? <UserRound aria-hidden="true" className="size-4" /> : <Bot aria-hidden="true" className="size-4" />}
    </div>
  );
}

function actionHistoryMessage(action: CourseStoryChatAction) {
  if (action.action === "confirm_requirements") return "我确认这份创作理解。";
  if (action.action === "request_reference_search" || action.action === "choose_reference_search") {
    return `请联网整理参考资料：${action.targetId || "当前引用对象"}`;
  }
  if (action.action === "generate_from_reference") return "请用已确认的参考资料生成故事大纲。";
  if (action.action === "confirm_reference_materials") return "我确认这些参考资料，请继续。";
  if (action.action === "confirm_story_change") return "我确认这项影响，并继续调整。";
  if (action.action === "cancel_story_change") return "保留当前内容，不应用这次修改。";
  if (action.action === "choose_story_usage") return action.targetId === "follow_original" || action.targetId === "faithful" ? "我选择忠实讲述，课堂人物进入场景旁观，但不改变原作或史实。" : "我选择创作新故事，课堂人物通过具体行动推动新事件。";
  if (action.action === "generate_directions") return "我确认参考资料，请生成 3 个故事方向。";
  if (action.action === "regenerate_outline") return "请基于当前全部要求重新生成故事大纲。";
  return action.label;
}

function AlignmentQuestionForm({ questions, disabled, onSubmit }: { questions: NonNullable<CourseStoryChatAction["questions"]>; disabled: boolean; onSubmit: (answers: Record<string, string | string[]>, readableMessage: string) => void | Promise<void> }) {
  const recommendedId = (question: (typeof questions)[number]) => {
    if (question.recommendedOptionId && question.options?.some((option) => option.id === question.recommendedOptionId)) return question.recommendedOptionId;
    const fallbackValue = question.recommendation?.value;
    return question.options?.find((option) => option.id === fallbackValue || option.label === fallbackValue)?.id;
  };
  const [selected, setSelected] = useState<Record<string, string[]>>(() => Object.fromEntries(questions.flatMap((question) => (recommendedId(question) ? [[question.id, [recommendedId(question)!]]] : []))));
  const [custom, setCustom] = useState<Record<string, string>>({});

  function toggle(questionId: string, optionId: string, multiple: boolean) {
    setSelected((current) => {
      const values = current[questionId] ?? [];
      return {
        ...current,
        [questionId]: multiple ? (values.includes(optionId) ? values.filter((id) => id !== optionId) : [...values, optionId]) : [optionId],
      };
    });
  }

  const complete = questions.every((question) => {
    if (!question.required) return true;
    const selectedAnswers = (selected[question.id] ?? []).filter((id) => id !== "__custom");
    return Boolean(selectedAnswers.length || custom[question.id]?.trim());
  });

  function submitAnswers() {
    const answers: Record<string, string | string[]> = {};
    const lines = ["我的回答："];
    for (const question of questions) {
      const optionLabels = (selected[question.id] ?? []).flatMap((id) => {
        if (id === "__custom") return [];
        return [question.options?.find((option) => option.id === id)?.label ?? id];
      });
      const customValue = custom[question.id]?.trim();
      const values = [...optionLabels, ...(customValue ? [customValue] : [])];
      answers[question.id] = question.answerMode === "multi_choice" ? values : values.join("；");
      lines.push(`${question.label}：${values.join("；") || "暂不回答"}`);
    }
    void onSubmit(answers, lines.join("\n"));
  }

  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-background p-3">
      {questions.map((question, index) => {
        const active = selected[question.id] ?? [];
        const hasOptions = question.answerMode !== "text" && Boolean(question.options?.length);
        const questionRecommendedId = recommendedId(question);
        const recommendationReason = question.recommendationReason || question.recommendation?.reason;
        const orderedOptions = questionRecommendedId ? [...(question.options?.filter((option) => option.id === questionRecommendedId) ?? []), ...(question.options?.filter((option) => option.id !== questionRecommendedId) ?? [])] : question.options;
        const selectedCustomOption = question.options?.some((option) => option.enablesTextInput && active.includes(option.id));
        const needsFallbackInput = !hasOptions;
        const showCustomInput = question.answerMode === "text" || needsFallbackInput || active.includes("__custom") || selectedCustomOption;
        return (
          <fieldset className="space-y-2" key={question.id}>
            <legend className="text-sm font-medium text-foreground">
              {index + 1}. {question.label}
            </legend>
            {question.reason ? <p className="text-xs leading-5 text-muted-foreground">{question.reason}</p> : null}
            {hasOptions || (question.allowCustom && question.answerMode !== "text") ? (
              <div className="grid gap-2">
                {hasOptions
                  ? orderedOptions?.map((option) => (
                      <label className={cn("min-h-11 cursor-pointer rounded-md border px-3 py-2 text-sm", active.includes(option.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border hover:border-primary-300")} key={option.id}>
                        <span className="flex items-center gap-2">
                          <input checked={active.includes(option.id)} className="accent-primary" disabled={disabled} name={question.id} onChange={() => toggle(question.id, option.id, question.answerMode === "multi_choice")} type={question.answerMode === "multi_choice" ? "checkbox" : "radio"} />
                          <span className="min-w-0 break-words leading-5">
                            {option.label}
                            {option.id === questionRecommendedId ? "（推荐）" : ""}
                          </span>
                        </span>
                        {option.id === questionRecommendedId && recommendationReason ? <span className="mt-1 block pl-5 text-xs leading-5 text-muted-foreground">{recommendationReason}</span> : null}
                      </label>
                    ))
                  : null}
                {question.allowCustom && question.answerMode !== "text" ? (
                  <label className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", active.includes("__custom") ? "border-primary bg-primary-50 text-primary-700" : "border-border hover:border-primary-300")}>
                    <input checked={active.includes("__custom")} className="accent-primary" disabled={disabled} name={question.id} onChange={() => toggle(question.id, "__custom", question.answerMode === "multi_choice")} type={question.answerMode === "multi_choice" ? "checkbox" : "radio"} />
                    <span>其他，我来说明</span>
                  </label>
                ) : null}
              </div>
            ) : null}
            {showCustomInput ? (
              <input
                aria-label={`${question.label}${needsFallbackInput ? "回答" : "补充说明"}`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                disabled={disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustom((current) => ({
                    ...current,
                    [question.id]: value,
                  }));
                  if (value.trim() && question.answerMode !== "multi_choice")
                    setSelected((current) => ({
                      ...current,
                      [question.id]: ["__custom"],
                    }));
                }}
                placeholder={question.options?.find((option) => option.enablesTextInput && active.includes(option.id))?.textPlaceholder ?? "输入你的回答"}
                value={custom[question.id] ?? ""}
              />
            ) : null}
          </fieldset>
        );
      })}
      {!complete ? <p className="text-xs text-muted-foreground">请完成所有必答问题。</p> : null}
      <Button disabled={disabled || !complete} onClick={submitAnswers} size="sm" type="button">
        <Check className="size-4" />
        确认回答并继续
      </Button>
    </div>
  );
}

function storyOperationPresentation(action: string, phase?: NonNullable<CourseStoryOutlineState["operation"]>["phase"]): AiOperationPresentation {
  if (phase === "repairing_alignment_format") {
    return {
      title: "正在整理创作理解",
      currentStep: 0,
      steps: ["整理 AI 返回结构", "重新校验创作理解", "继续原任务"],
    };
  }
  if (phase === "preparing_reference") {
    return {
      title: "正在准备故事创作",
      currentStep: 0,
      steps: ["确认需要的背景范围", "准备故事方向或大纲", "保存本轮结果"],
    };
  }
  if (phase === "searching_reference") {
    return {
      title: "正在联网整理参考资料",
      currentStep: 1,
      steps: ["确认查询对象与范围", "查找可核实资料", "提取事实和改编边界", "保存参考资料"],
    };
  }
  if (phase === "generating_directions" || action === "generate_directions" || action === "random") {
    return {
      title: "正在生成 3 个故事方向",
      currentStep: 1,
      steps: ["整理已确认的创作要求", "构思不同任务与冲突", "检查人物和故事类型", "保存故事方向"],
    };
  }
  if (phase === "generating_outline" || ["confirm_direction", "generate_from_reference", "regenerate_outline"].includes(action)) {
    return {
      title: action === "regenerate_outline" ? "正在重新生成故事大纲" : "正在生成故事大纲",
      currentStep: 1,
      steps: ["整理已确认方向和人物", "搭建故事主线", "安排角色与章节", "检查章节推进并保存"],
      preserveMessage: action === "regenerate_outline" ? "新大纲通过检查前，当前版本不会被覆盖。" : undefined,
    };
  }
  if (phase === "revising") {
    const title = action === "revise_chapter" ? "正在修改目标章节" : action === "revise_direction" ? "正在修改故事方向" : "正在修改故事大纲";
    return {
      title,
      currentStep: 1,
      steps: ["确认修改目标与边界", "生成最小范围修改", "检查未选范围保持不变", "保存新版本"],
      preserveMessage: "修改通过检查前，当前版本不会被覆盖。",
    };
  }
  if (action === "confirm_requirements") {
    return {
      title: "正在准备故事创作",
      currentStep: 1,
      steps: ["读取已确认的创作理解", "准备必要背景与人物关系", "判断生成方向或完整大纲", "保存下一步成果"],
    };
  }
  if (["confirm_reference_materials", "choose_story_usage"].includes(action)) {
    return {
      title: "正在继续构思故事",
      currentStep: 1,
      steps: ["读取已确认的参考资料", "结合故事使用方式", "生成方向或完整大纲", "保存本轮成果"],
    };
  }
  if (action === "confirm_story_change") {
    return {
      title: "正在应用已确认的故事修改",
      currentStep: 1,
      steps: ["确认修改边界", "应用已确认的创作要求", "检查未选范围保持不变", "保存新版本"],
      preserveMessage: "修改通过检查前，当前版本不会被覆盖。",
    };
  }
  return {
    title: "正在理解你的故事想法",
    currentStep: 1,
    steps: ["读取老师输入", "结合人物与课程设置", "判断需要澄清、方向或大纲", "保存创作理解"],
  };
}

function operationLoadingLabel(phase?: NonNullable<CourseStoryOutlineState["operation"]>["phase"]) {
  if (!phase) return "";
  switch (phase) {
    case "repairing_alignment_format":
      return "AI 返回格式需要整理，正在自动修复...";
    case "preparing_reference":
      return "正在准备故事创作...";
    case "searching_reference":
      return "正在整理参考资料...";
    case "generating_directions":
      return "正在生成故事方向...";
    case "generating_outline":
      return "正在生成故事大纲...";
    case "revising":
      return "正在应用修改...";
    default:
      return "正在分析故事要求...";
  }
}

function isVisibleChatAction(action: CourseStoryChatAction, operation: CourseStoryOutlineState["operation"], alignment: CourseStoryOutlineState["alignment"]) {
  if (action.action === "submit_alignment_answers") return false;
  if (action.action === "confirm_story_change" || action.action === "cancel_story_change") {
    return Boolean(alignment?.pendingChange && action.targetId === alignment.pendingChange.id);
  }
  if (action.action !== "retry_operation") return true;
  return operation?.status === "failed" && (!action.targetId || action.targetId === operation.requestId);
}

function tabClass(active: boolean) {
  return cn("min-h-11 shrink-0 rounded-md px-3 text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted");
}

function ResultPanel({ state, references, outline, resultTab, setResultTab, onConfirmDirection, onReviseDirection, onReviseOutline, onReviseChapter, onDescribeDirection, pending }: { state: CourseStoryOutlineState; references: CourseSourceReference[]; outline: CourseStoryOutline | null; resultTab: ResultTab; setResultTab: (tab: ResultTab) => void; onConfirmDirection: (direction: CourseStoryDirection) => void; onReviseDirection: (direction: CourseStoryDirection) => void; onReviseOutline: () => void; onReviseChapter: (order: number) => void; onDescribeDirection: () => void; pending: boolean }) {
  const artifactsOutdated = state.alignment?.artifactsOutdated === true;
  const hasSelectedDirection = state.directions.some((direction) => Boolean(direction.selectedAt));
  const hasDirectionsNewerThanOutline = Boolean(outline && state.directions.some((direction) => new Date(direction.createdAt).getTime() > new Date(outline.updatedAt).getTime()));
  const shouldShowDirections = state.directions.length > 0 && (!outline || artifactsOutdated || !hasSelectedDirection || hasDirectionsNewerThanOutline);

  if (shouldShowDirections) {
    const showingReferences = resultTab === "references" && references.length > 0;
    return (
      <div className="space-y-3">
        {references.length ? (
          <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto rounded-lg bg-card px-3 pt-3 shadow-sm">
            <button className={tabClass(!showingReferences)} onClick={() => setResultTab("directions")} type="button">
              故事方向
            </button>
            <button className={tabClass(showingReferences)} onClick={() => setResultTab("references")} type="button">
              参考资料
            </button>
          </div>
        ) : null}
        {showingReferences ? (
          <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
            <ReferenceCandidateNotice />
            {references.map((reference) => (
              <ReferenceCard key={reference.id} reference={reference} />
            ))}
          </section>
        ) : (
          <DirectionsPanel directions={state.directions} outdated={artifactsOutdated} onConfirmDirection={onConfirmDirection} onDescribeDirection={onDescribeDirection} onReviseDirection={onReviseDirection} pending={pending} />
        )}
      </div>
    );
  }

  if (outline) {
    return (
      <section className="space-y-3 rounded-lg bg-card p-4 shadow-sm">
        <ArtifactVersionNotice outdated={artifactsOutdated} />
        <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-border bg-card pb-3">
          <button className={tabClass(resultTab === "outline")} onClick={() => setResultTab("outline")} type="button">
            故事大纲
          </button>
          <button className={tabClass(resultTab === "characters")} onClick={() => setResultTab("characters")} type="button">
            角色
          </button>
          <button className={tabClass(resultTab === "references")} onClick={() => setResultTab("references")} type="button">
            参考资料
          </button>
          <button className={tabClass(resultTab === "directions")} onClick={() => setResultTab("directions")} type="button">
            故事方向
          </button>
        </div>
        {resultTab === "outline" ? <OutlineSummary onReviseChapter={onReviseChapter} onReviseOutline={onReviseOutline} outline={outline} pending={pending || artifactsOutdated} state={state} /> : null}
        {resultTab === "characters" ? <CharactersSection outline={outline} /> : null}
        {resultTab === "references" ? (
          <div className="space-y-4">
            {references.length || outline.sourceReferences.length ? (
              <>
                <ReferenceCandidateNotice />
                {[...references, ...outline.sourceReferences.filter((reference) => !references.some((item) => item.id === reference.id))].map((reference) => (
                  <ReferenceCard key={reference.id} reference={reference} />
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">暂无参考资料</p>
            )}
          </div>
        ) : null}
        {resultTab === "directions" ? <DirectionsHistory directions={state.directions} /> : null}
      </section>
    );
  }

  if (references.length) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">参考资料</h3>
        <ReferenceCandidateNotice />
        {references.map((reference) => (
          <ReferenceCard key={reference.id} reference={reference} />
        ))}
      </section>
    );
  }

  if (state.directions.length) {
    return <DirectionsPanel directions={state.directions} outdated={artifactsOutdated} onConfirmDirection={onConfirmDirection} onDescribeDirection={onDescribeDirection} onReviseDirection={onReviseDirection} pending={pending} />;
  }

  return null;
}

function ArtifactVersionNotice({ outdated }: { outdated: boolean }) {
  if (!outdated) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
      <p className="font-medium">当前展示的是上一版故事成果</p>
      <p className="mt-1 text-xs leading-5 text-amber-800">确认新的创作需求并完成生成后，故事方向、大纲和角色会更新为最新版本。</p>
    </div>
  );
}

function DirectionsPanel({ directions, outdated, onConfirmDirection, onDescribeDirection, onReviseDirection, pending }: { directions: CourseStoryDirection[]; outdated: boolean; onConfirmDirection: (direction: CourseStoryDirection) => void; onDescribeDirection: () => void; onReviseDirection: (direction: CourseStoryDirection) => void; pending: boolean }) {
  return (
    <section className="space-y-4 rounded-lg bg-card p-4 shadow-sm">
      <ArtifactVersionNotice outdated={outdated} />
      <div>
        <h3 className="text-lg font-semibold text-foreground">故事方向</h3>
        <p className="mt-1 text-sm text-muted-foreground">选择前可以调整任意方向；选择后将直接生成章节大纲。</p>
      </div>
      {directions.map((direction) => (
        <article className={cn("rounded-md border p-4", direction.selectedAt ? "border-primary bg-primary-50/30" : "border-border")} key={direction.id}>
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-base font-semibold text-foreground">{splitBilingual(direction.title).zh}</h4>
            {direction.selectedAt ? <span className="rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">已选择</span> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground">{splitBilingual(direction.hook).zh}</p>
          <dl className="mt-3 grid gap-3 text-sm xl:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">故事亮点</dt>
              <dd className="mt-1 leading-5 text-foreground">{direction.storyHighlight || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">成长核心</dt>
              <dd className="mt-1 leading-5 text-foreground">{direction.growthCore || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">主要角色</dt>
              <dd className="mt-1 leading-5 text-foreground">{direction.mainCharacters.join("、") || "待大纲阶段确认"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">适合原因</dt>
              <dd className="mt-1 leading-5 text-foreground">{splitBilingual(direction.whyFits).zh}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending || outdated} onClick={() => onConfirmDirection(direction)} size="sm" type="button">
              <Check className="size-4" />
              选择并生成大纲
            </Button>
            {!direction.selectedAt ? (
              <Button disabled={pending || outdated} onClick={() => onReviseDirection(direction)} size="sm" type="button" variant="outline">
                <Pencil className="size-4" />
                调整这张卡
              </Button>
            ) : null}
          </div>
        </article>
      ))}
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">都不合适？告诉我你希望的故事方向，我会重新生成。</p>
        <Button disabled={pending || outdated} onClick={onDescribeDirection} size="sm" type="button" variant="outline">
          描述我想要的方向
        </Button>
      </div>
    </section>
  );
}

function DirectionsHistory({ directions }: { directions: CourseStoryDirection[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-primary-100 bg-primary-50/50 px-3 py-2 text-sm text-primary-800" role="status">
        故事方向已确定，仅供查看
      </div>
      {directions.map((direction) => (
        <article className={cn("rounded-md border p-4", direction.selectedAt ? "border-primary bg-primary-50/30" : "border-border")} key={direction.id}>
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-base font-semibold text-foreground">{splitBilingual(direction.title).zh}</h4>
            {direction.selectedAt ? <span className="rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">已选择</span> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground">{splitBilingual(direction.hook).zh}</p>
          <dl className="mt-3 grid gap-3 text-sm xl:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">故事亮点</dt>
              <dd className="mt-1 leading-5 text-foreground">{direction.storyHighlight || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">成长核心</dt>
              <dd className="mt-1 leading-5 text-foreground">{direction.growthCore || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">主要角色</dt>
              <dd className="mt-1 leading-5 text-foreground">{direction.mainCharacters.join("、") || "待大纲阶段确认"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">适合原因</dt>
              <dd className="mt-1 leading-5 text-foreground">{splitBilingual(direction.whyFits).zh}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function CardGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function OutlineSummary({ outline, state, pending, onReviseOutline, onReviseChapter }: { outline: CourseStoryOutline; state: CourseStoryOutlineState; pending: boolean; onReviseOutline: () => void; onReviseChapter: (order: number) => void }) {
  const title = splitBilingual(outline.title);
  const summary = splitBilingual(outline.summary);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className="size-5 shrink-0 text-primary" />
            <h3 className="text-balance text-lg font-semibold text-foreground">{title.zh}</h3>
          </div>
          <Button className="shrink-0" disabled={pending} onClick={onReviseOutline} size="sm" type="button" variant="outline">
            <Pencil className="size-4" />
            修改整体大纲
          </Button>
        </div>
        <p className="mt-3 text-pretty text-sm leading-6 text-foreground">{summary.zh}</p>
      </div>
      {state.unrecommendedKnowledgePoints?.length ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
          已根据 {state.course.englishLevel} 难度和 {state.course.durationMinutes} 分钟课时智能匹配。
          {state.unrecommendedKnowledgePoints.map((item) => item.label).join("、")} 暂未放入章节推荐，可在下一阶段：教学规划手动调整。
        </p>
      ) : null}
      <CardGroup title="章节大纲">
        <div className="grid gap-3 xl:grid-cols-2">
          {outline.chapters.map((chapter) => {
            const chapterTitle = splitBilingual(chapter.title);
            const plotSummary = chapter.whatHappens || chapter.storyGoal;
            return (
              <article className="rounded-md border border-border p-3" key={chapter.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary">{chapter.order}</span>
                    <div className="min-w-0">
                      <h5 className="text-balance text-sm font-semibold text-foreground">{chapterTitle.zh}</h5>
                    </div>
                  </div>
                  <Button className="shrink-0" disabled={pending} onClick={() => onReviseChapter(chapter.order)} size="sm" type="button" variant="outline">
                    <Pencil className="size-4" />
                    修改本章
                  </Button>
                </div>
                <p className="mt-3 text-xs font-medium text-muted-foreground">剧情概述</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{plotSummary}</p>
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(chapter.recommendedKnowledgePointIds ?? []).map((id) => {
                      const point = state.selectedKnowledgePoints?.find((item) => item.id === id);
                      const unit = point?.unitStart
                        ? point.unitStart === point.unitEnd ? `Unit ${point.unitStart}` : `Units ${point.unitStart}–${point.unitEnd}`
                        : "";
                      return (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700" key={id}>
                          <OverflowingKnowledgePointTitle title={point?.label ?? id} />
                          {unit ? <span className="shrink-0 text-primary-600">{unit}</span> : null}
                        </span>
                      );
                    })}
                    {!chapter.recommendedKnowledgePointIds?.length ? <span className="text-xs text-muted-foreground">本章暂无自然适配的知识点</span> : null}
                  </div>
                  {chapter.knowledgePointRecommendationSummary ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{chapter.knowledgePointRecommendationSummary}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </CardGroup>
    </div>
  );
}

function CharactersSection({ outline }: { outline: CourseStoryOutline }) {
  return (
    <div>
      <CardGroup title="故事出场角色">
        <div className="grid gap-2 xl:grid-cols-2">{outline.characters.length ? outline.characters.map((character) => <CharacterCard character={character} key={character.id} />) : <p className="text-sm text-muted-foreground">本故事暂无出场角色</p>}</div>
      </CardGroup>
    </div>
  );
}

function CharacterCard({ character }: { character: CourseStoryOutline["characters"][number] }) {
  return (
    <article className="rounded-md border border-border p-3">
      <h5 className="text-sm font-semibold text-foreground">{character.englishName || character.displayName}</h5>
      {character.displayName !== character.englishName ? <p className="mt-0.5 text-xs font-medium text-muted-foreground">{character.displayName}</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">
        {sourceTypeLabel(character.sourceType)} · {character.roleInStory}
      </p>
      {character.shortDescription !== character.roleInStory ? <p className="mt-2 text-sm text-muted-foreground">{character.shortDescription}</p> : null}
    </article>
  );
}

function ReferenceCandidateNotice() {
  return <p className="rounded-md bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">参考资料中的角色是创作候选，不代表都会在最终故事中出场。</p>;
}

function ReferenceCard({ reference }: { reference: CourseSourceReference }) {
  return (
    <article className="space-y-5 rounded-lg border border-border bg-background p-5">
      <h4 className="text-base font-semibold text-foreground">{reference.name}</h4>
      <section className="space-y-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">资料摘要</h5>
        <p className="text-sm leading-6 text-foreground">{reference.summary}</p>
      </section>
      <section className="space-y-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">故事可用要点</h5>
        {reference.usableFacts.length ? (
          <ul className="space-y-2 text-sm leading-6 text-foreground">
            {reference.usableFacts.map((fact, index) => (
              <li className="flex gap-2" key={`${reference.id}-${index}`}>
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">暂未提取到可用要点</p>
        )}
      </section>
    </article>
  );
}

function sourceTypeLabel(sourceType: string) {
  if (sourceType === "person") return "课堂人物";
  if (sourceType === "referenced") return "引用对象";
  return "原创角色";
}

function splitBilingual(value: string) {
  const [zh, en] = value.split(" / ");
  return { zh: zh || value, en: en && en !== zh ? en : "" };
}
