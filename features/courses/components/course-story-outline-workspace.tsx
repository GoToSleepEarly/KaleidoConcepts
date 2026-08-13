"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Bot, Check, Loader2, Pencil, RotateCcw, Search, Sparkles, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import type {
  CourseSourceReference,
  CourseStoryChatAction,
  CourseStoryMessageInput,
  CourseStoryOutline,
  CourseStoryOutlineState,
  CourseStoryDirection,
  PresetOption,
  StoryWritingProvider,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

export function CourseStoryOutlineWorkspace({ initialState, themePresets = [], storyTypePresets = [], storyTonePresets = [] }: { initialState: CourseStoryOutlineState; themePresets?: PresetOption[]; storyTypePresets?: PresetOption[]; storyTonePresets?: PresetOption[] }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [mode, setMode] = useState<"idea" | "random">("idea");
  const [message, setMessage] = useState("");
  const [randomSupplement, setRandomSupplement] = useState("");
  const [chapterCount, setChapterCount] = useState(initialState.settings.chapterCount);
  const [writingProvider, setWritingProvider] = useState<StoryWritingProvider>(initialState.settings.writingProvider);
  const [selectedTheme, setSelectedTheme] = useState<PresetOption | null>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [storyType, setStoryType] = useState("");
  const [customStoryType, setCustomStoryType] = useState("");
  const [tone, setTone] = useState("");
  const [customTone, setCustomTone] = useState("");
  const [pending, setPending] = useState(initialState.operation?.status === "running");
  const [pendingLabel, setPendingLabel] = useState(() => operationLoadingLabel(initialState.operation?.phase));
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [resultTab, setResultTab] = useState<"outline" | "characters" | "references">("outline");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [optimisticTeacherMessage, setOptimisticTeacherMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const requestInFlight = useRef(false);
  const hasStepContent = Boolean(state.chatMessages.length || state.directions.length || state.referenceMaterials.length || state.outline);
  const conversationStarted = hasStepContent || pending || Boolean(state.operation) || Boolean(optimisticTeacherMessage);
  const hasUnsentInput = Boolean(message.trim() || (mode === "random" && (randomSupplement.trim() || selectedTheme || storyType || tone)));
  const resolvedStoryType = storyType === "__custom__" ? customStoryType.trim() : storyType;
  const resolvedTone = tone === "__custom__" ? customTone.trim() : tone;

  function navigate(href: string) {
    if (hasUnsentInput && !window.confirm("输入框里还有未发送的内容。离开将放弃这些内容，是否继续？")) return;
    router.push(href);
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsentInput) event.preventDefault(); };
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
    if (!pending) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/courses/${state.course.id}/story-outline`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const nextState = (await response.json()) as CourseStoryOutlineState;
        if (!active) return;
        setState(nextState);
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
  }, [optimisticTeacherMessage, pending, state.course.id]);

  async function postMessage(
    input: CourseStoryMessageInput,
    label = "正在处理...",
    options: { optimisticMessage?: string; restoreMessage?: string; restoreRandomSupplement?: string; preserveComposer?: boolean } = {},
  ) {
    const optimisticMessage = options.optimisticMessage ?? input.message.trim();
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel(label);
    setError("");
    requestInFlight.current = true;
    setOptimisticTeacherMessage(optimisticMessage);
    if (!options.preserveComposer) setMessage("");
    if (input.mode === "random") setRandomSupplement("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, requestId: input.requestId ?? crypto.randomUUID(), chapterCount, writingProvider }),
      });
      const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
      if (!response.ok) throw new Error(data.message || "故事大纲生成失败");
      const hasNewReferences = data.referenceMaterials.length > state.referenceMaterials.length;
      setState(data);
      if (hasNewReferences) setResultTab("references");
      if (input.mode === "random") setMode("idea");
      if (!options.preserveComposer) setMessage("");
      setRandomSupplement("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事大纲生成失败");
      if (options.restoreMessage) setMessage(options.restoreMessage);
      if (options.restoreRandomSupplement) setRandomSupplement(options.restoreRandomSupplement);
    } finally {
      requestInFlight.current = false;
      setPending(false);
      setPendingSeconds(0);
      setPendingLabel("");
      setOptimisticTeacherMessage("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "idea" && !message.trim()) return;
    const teacherMessage = mode === "random"
      ? [
        "请帮我生成随机故事方向。",
        "",
        `主题：${selectedTheme ? `${selectedTheme.category} / ${selectedTheme.label}` : "任意主题"}`,
        resolvedStoryType ? `故事类型：${resolvedStoryType}` : "",
        resolvedTone ? `故事氛围：${resolvedTone}` : "",
        randomSupplement.trim() ? `补充要求：${randomSupplement.trim()}` : "",
      ].filter((line, index) => index === 1 || Boolean(line)).join("\n")
      : hasStepContent
        ? message.trim()
        : `我的故事想法：\n${message.trim()}`;
    await postMessage(
      { message: teacherMessage, mode },
      mode === "random" ? "正在生成故事方向..." : "正在分析故事要求...",
      {
        restoreMessage: mode === "idea" ? message : undefined,
        restoreRandomSupplement: mode === "random" ? randomSupplement : undefined,
      },
    );
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

  function continueModify(prefix: string) {
    setMessage(prefix);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleAction(action: CourseStoryChatAction) {
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
      await postMessage({ message: "", mode: "idea", action: "retry_operation" }, operationLoadingLabel(state.operation?.phase));
      return;
    }
    const isReferenceSearch = action.action === "choose_reference_search" || action.action === "request_reference_search";
    const isRequirementConfirmation = action.action === "confirm_requirements";
    const isReferenceConfirmation = action.action === "confirm_reference_materials" || action.action === "choose_story_usage";
    const label = isReferenceSearch
      ? "正在整理参考资料..."
      : isRequirementConfirmation
        ? "正在准备故事创作..."
      : isReferenceConfirmation
        ? "正在继续构思故事..."
      : action.action === "generate_directions"
        ? "正在生成故事方向..."
        : "正在生成故事大纲...";
    const draft = isRequirementConfirmation ? "" : message.trim();
    const optimisticMessage = draft || actionHistoryMessage(action);
    await postMessage({
      message: draft,
      mode: action.action === "regenerate_outline" ? "revise" : "idea",
      action: action.action,
      targetId: action.targetId,
      researchPlan: action.researchPlan,
    }, label, { optimisticMessage, restoreMessage: draft, preserveComposer: isRequirementConfirmation });
  }

  async function resetStep() {
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel("正在重新开始...");
    setError("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/reset`, { method: "POST" });
      const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
      if (!response.ok) throw new Error(data.message || "故事大纲重置失败");
      setState(data);
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
    <div className="mx-auto max-w-7xl space-y-6">
      <CourseCreateSteps courseId={state.course.id} currentStep={2} furthestStep={courseStageStep(state.course.currentStage)} onNavigate={navigate} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">故事大纲</h2>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.35fr)]">
        <section className="flex min-h-[680px] flex-col rounded-lg bg-card shadow-sm">
          <div className="border-b border-border p-4">
            {!conversationStarted ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                <button className={modeClass(mode === "idea")} onClick={() => setMode("idea")} type="button">我有想法</button>
                <button className={modeClass(mode === "random")} onClick={() => setMode("random")} type="button">随机灵感</button>
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">章节数</span>
                <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" onChange={(event) => setChapterCount(Number(event.target.value))} value={chapterCount}>
                  {[3, 4, 5].map((value) => <option key={value} value={value}>{value} 章</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">写作模型</span>
                <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" onChange={(event) => setWritingProvider(event.target.value as StoryWritingProvider)} value={writingProvider}>
                  <option value="quickrouter_gpt">GPT（大纲更稳）</option>
                  <option value="quickrouter_deepseek">DeepSeek（成本更低）</option>
                </select>
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!conversationStarted && mode === "random" ? (
              <form className="mx-auto w-full max-w-xl space-y-4 rounded-lg border border-border bg-muted/30 p-4" onSubmit={submit}>
                <h3 className="font-medium text-foreground">生成故事方向</h3>
                <div className="block">
                    <span className="text-xs text-muted-foreground">主题灵感</span>
                    <button aria-label="选择主题" className="mt-1 flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setThemePickerOpen(true)} type="button">
                      <span className="min-w-0 whitespace-normal text-pretty">{selectedTheme ? `${selectedTheme.category} / ${selectedTheme.label}` : "任意主题"}</span>
                      <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                </div>
                <div className="grid items-start gap-3 sm:grid-cols-2">
                  <PresetOrCustomSelect customLabel="自定义故事类型" customPlaceholder="输入故事类型" customValue={customStoryType} label="故事类型" onCustomChange={setCustomStoryType} onValueChange={setStoryType} presets={storyTypePresets} value={storyType} />
                  <PresetOrCustomSelect customLabel="自定义故事氛围" customPlaceholder="输入故事氛围" customValue={customTone} label="故事氛围" onCustomChange={setCustomTone} onValueChange={setTone} presets={storyTonePresets} value={tone} />
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">补充要求（可选）</span>
                  <input
                    aria-label="补充要求（可选）"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                    onChange={(event) => setRandomSupplement(event.target.value)}
                    placeholder="例如：希望学生成为大侦探"
                    value={randomSupplement}
                  />
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
                <article className={cn("max-w-[calc(100%-2.5rem)] rounded-lg px-3 py-2 text-sm", chat.role === "teacher" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                  <p className="whitespace-pre-wrap leading-6">{chat.content}</p>
                  {chat.actions.some((action) => action.action === "submit_alignment_answers" && action.questions?.length) ? (
                    <AlignmentQuestionForm
                      disabled={pending}
                      onSubmit={(answers, readableMessage) => postMessage(
                        { message: readableMessage, mode: "idea", action: "submit_alignment_answers", alignmentAnswers: answers },
                        "正在确认故事要求...",
                        { optimisticMessage: readableMessage },
                      )}
                      questions={chat.actions.find((action) => action.action === "submit_alignment_answers")?.questions ?? []}
                    />
                  ) : null}
                  {chat.actions.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {chat.actions.filter((action) => action.action !== "submit_alignment_answers").map((action) => (
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
                <article className="max-w-[calc(100%-2.5rem)] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  <p className="whitespace-pre-wrap leading-6">{optimisticTeacherMessage}</p>
                </article>
                <ChatAvatar role="teacher" />
              </div>
            ) : null}
            {pending && pendingLabel ? <div className="flex items-start gap-2"><ChatAvatar role="assistant" /><LoadingCard className="max-w-[calc(100%-2.5rem)]" label={pendingLabel} seconds={pendingSeconds} /></div> : null}
            {!pending && state.operation?.status === "failed" ? (
              <div className="flex items-start gap-2">
                <ChatAvatar role="assistant" />
                <div className="max-w-[calc(100%-2.5rem)] space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <p>{state.operation.errorMessage || "当前步骤处理失败"}</p>
                  <Button onClick={() => void handleAction({ id: "retry-operation", label: "重试本步", action: "retry_operation" })} size="sm" type="button" variant="outline">重试本步</Button>
                </div>
              </div>
            ) : null}
          </div>

          {mode === "idea" || conversationStarted ? <form className="border-t border-border p-4" onSubmit={submit}>
            <label className="block">
              <span className={conversationStarted ? "sr-only" : "text-sm font-medium text-foreground"}>{conversationStarted ? "故事想法" : "说说你的故事想法"}</span>
              {!conversationStarted ? <span className="mt-1 block text-pretty text-xs leading-5 text-muted-foreground">可以写参考人物、IP、故事类型，以及希望老师学生如何参与。例如：老师和学生一起穿越到魔法世界经历了一场奇幻冒险。</span> : null}
              <textarea
                aria-label="故事想法"
                className="mt-2 min-h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                onChange={(event) => setMessage(event.target.value)}
                placeholder={conversationStarted ? "继续补充故事要求，或说明希望如何修改" : "输入你的故事想法"}
                ref={inputRef}
                value={message}
              />
            </label>
            {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Button disabled={pending || (mode === "idea" && !message.trim())} type="submit">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {pending ? "处理中" : conversationStarted ? "发送" : "开始讨论故事"}
              </Button>
            </div>
          </form> : null}
        </section>

        <ResultPanel
          onDescribeDirection={() => continueModify("我希望的故事方向：")}
          onChooseDirection={(direction) => postMessage(
            { message: "", mode: "idea", action: "choose_direction", targetId: direction.id },
            "正在选择故事方向...",
            { optimisticMessage: `我选择故事方向：${direction.title}\n${direction.hook}` },
          )}
          onConfirmDirection={(direction) => postMessage(
            { message: "", mode: "idea", action: "confirm_direction", targetId: direction.id },
            "正在生成故事大纲...",
            { optimisticMessage: `我确认使用故事方向：${direction.title}` },
          )}
          onReviseDirection={(direction, instruction) => postMessage(
            { message: instruction, mode: "revise", action: "revise_direction", targetId: direction.id },
            "正在调整故事方向...",
            { optimisticMessage: `调整“${direction.title}”：${instruction}` },
          )}
          onReviseOutline={(instruction) => postMessage(
            { message: instruction, mode: "revise", action: "revise_outline" },
            "正在调整故事大纲...",
            { optimisticMessage: `修改整体大纲：${instruction}` },
          )}
          onReviseChapter={(order, instruction) => postMessage(
            { message: instruction, mode: "revise", action: "revise_chapter", targetChapterOrder: order },
            `正在调整第 ${order} 章...`,
            { optimisticMessage: `修改第 ${order} 章：${instruction}` },
          )}
          onConfirm={confirm}
          outline={state.outline}
          pending={pending}
          pendingLabel={pendingLabel}
          pendingSeconds={pendingSeconds}
          references={state.referenceMaterials}
          resultTab={resultTab}
          setResultTab={setResultTab}
          state={state}
        />
      </div>
      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm text-muted-foreground">{hasUnsentInput ? "输入内容尚未发送" : state.outline ? "故事大纲已生成，可以进入教学规划" : "还需：生成故事大纲"}</p>
        <div className="flex gap-2"><Button disabled={pending} onClick={() => navigate(`/courses/${state.course.id}/create/audience`)} type="button" variant="outline"><ArrowLeft className="size-4" />上一步</Button><Button disabled={pending || !state.outline} onClick={() => courseStageStep(state.course.currentStage) >= 3 ? navigate(`/courses/${state.course.id}/create/teaching-plan`) : void confirm()} type="button">下一步：教学规划<ArrowRight className="size-4" /></Button></div>
      </div>
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
      <Dialog onClose={() => setResetOpen(false)} open={resetOpen} title="重新开始本轮构思？">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-sm leading-6 text-muted-foreground">将清空本阶段的聊天记录、故事方向、参考资料和故事大纲。</p>
          {error && resetOpen ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setResetOpen(false)} type="button" variant="outline">保留当前内容</Button>
            <Button disabled={pending} onClick={() => void resetStep()} type="button">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              清空并重新开始
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function PresetOrCustomSelect({ customLabel, customPlaceholder, customValue, label, onCustomChange, onValueChange, presets, value }: { customLabel: string; customPlaceholder: string; customValue: string; label: string; onCustomChange: (value: string) => void; onValueChange: (value: string) => void; presets: PresetOption[]; value: string }) {
  return (
    <div>
      <label className="block">
        <span className="text-xs text-muted-foreground">{label}（可选）</span>
        <select aria-label={label} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => onValueChange(event.target.value)} value={value}>
          <option value="">请选择</option>
          {presets.map((preset) => <option key={preset.id} value={preset.label}>{preset.label}</option>)}
          <option value="__custom__">自定义…</option>
        </select>
      </label>
      {value === "__custom__" ? <input aria-label={customLabel} autoFocus className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => onCustomChange(event.target.value)} placeholder={customPlaceholder} value={customValue} /> : null}
    </div>
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
              <button aria-selected={activeCategory === category} className={cn("min-h-9 shrink-0 rounded px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", activeCategory === category ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} key={category} onClick={() => { setActiveCategory(category); setQuery(""); }} role="tab" type="button">
                {category}{category === "全部" ? ` ${themes.length}` : ` ${themes.filter((theme) => (theme.category ?? "未分类") === category).length}`}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {!normalizedQuery && activeCategory === "全部" ? (
              <button aria-pressed={selectedId === null} className={cn("min-h-14 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === null ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background hover:border-primary-300")} onClick={() => setSelectedId(null)} type="button">任意主题</button>
            ) : null}
            {filtered.map((theme) => (
              <button aria-pressed={selectedId === theme.id} className={cn("min-h-14 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === theme.id ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background hover:border-primary-300")} key={theme.id} onClick={() => setSelectedId(theme.id)} type="button">{theme.label}</button>
            ))}
          </div>
          {!filtered.length ? <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的主题方向</p> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border p-4 sm:px-5">
          <span className="text-sm text-muted-foreground">{selectedId ? `已选择 ${themes.find((theme) => theme.id === selectedId)?.label ?? "主题"}` : "已选择任意主题"}</span>
          <div className="flex gap-2"><Button onClick={onClose} type="button" variant="outline">取消</Button><Button onClick={() => onConfirm(themes.find((theme) => theme.id === selectedId) ?? null)} type="button">确认主题</Button></div>
        </div>
      </div>
    </Dialog>
  );
}

function modeClass(active: boolean) {
  return cn("min-h-10 rounded-md px-3 text-sm font-medium", active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70");
}

function ChatAvatar({ role }: { role: "assistant" | "teacher" }) {
  const isTeacher = role === "teacher";
  return (
    <div
      aria-label={isTeacher ? "老师" : "AI 助手"}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border",
        isTeacher ? "border-primary bg-primary text-primary-foreground" : "border-primary-100 bg-primary-50 text-primary",
      )}
      role="img"
    >
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
  if (action.action === "choose_story_usage") return action.targetId === "follow_original"
    ? "我选择按原剧情讲，保留原作主线、关键转折和结局。"
    : "我选择创作新剧情，使用原作人物、世界观或主题重新创作。";
  if (action.action === "generate_directions") return "我确认参考资料，请生成 3 个故事方向。";
  if (action.action === "regenerate_outline") return "请基于当前全部要求重新生成故事大纲。";
  return action.label;
}

function AlignmentQuestionForm({
  questions,
  disabled,
  onSubmit,
}: {
  questions: NonNullable<CourseStoryChatAction["questions"]>;
  disabled: boolean;
  onSubmit: (answers: Record<string, string | string[]>, readableMessage: string) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() => Object.fromEntries(
    questions.flatMap((question) => question.allowRecommendation && question.recommendation
      ? [[question.id, ["__recommendation"]]]
      : []),
  ));
  const [custom, setCustom] = useState<Record<string, string>>({});

  function toggle(questionId: string, optionId: string, multiple: boolean) {
    setSelected((current) => {
      const values = current[questionId] ?? [];
      return { ...current, [questionId]: multiple ? (values.includes(optionId) ? values.filter((id) => id !== optionId) : [...values, optionId]) : [optionId] };
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
        if (id === "__recommendation") return [`采用建议：${question.recommendation?.value ?? "请给我建议"}`];
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
        const hasRecommendation = question.allowRecommendation && Boolean(question.recommendation);
        const selectedCustomOption = question.options?.some((option) => option.enablesTextInput && active.includes(option.id));
        const needsFallbackInput = !hasOptions && !hasRecommendation;
        const showCustomInput = question.answerMode === "text" || needsFallbackInput || active.includes("__custom") || selectedCustomOption;
        return (
          <fieldset className="space-y-2" key={question.id}>
            <legend className="text-sm font-medium text-foreground">{index + 1}. {question.label}</legend>
            {question.reason ? <p className="text-xs leading-5 text-muted-foreground">{question.reason}</p> : null}
            {hasOptions || hasRecommendation || (question.allowCustom && question.answerMode !== "text") ? (
              <div className="grid gap-2">
                {hasOptions ? question.options?.map((option) => (
                  <label className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", active.includes(option.id) ? "border-primary bg-primary-50 text-primary-700" : "border-border hover:border-primary-300")} key={option.id}>
                    <input
                      checked={active.includes(option.id)}
                      className="accent-primary"
                      disabled={disabled}
                      name={question.id}
                      onChange={() => toggle(question.id, option.id, question.answerMode === "multi_choice")}
                      type={question.answerMode === "multi_choice" ? "checkbox" : "radio"}
                    />
                    <span>{option.label}</span>
                  </label>
                )) : null}
                {hasRecommendation && question.recommendation ? (
                  <label className={cn("cursor-pointer rounded-md border px-3 py-2 text-sm", active.includes("__recommendation") ? "border-primary bg-primary-50" : "border-border hover:border-primary-300")}>
                    <span className="flex items-center gap-2"><input checked={active.includes("__recommendation")} className="accent-primary" disabled={disabled} name={question.id} onChange={() => toggle(question.id, "__recommendation", question.answerMode === "multi_choice")} type={question.answerMode === "multi_choice" ? "checkbox" : "radio"} />采用 AI 推荐</span>
                    <span className="mt-1 block pl-5 text-xs text-muted-foreground">建议：{question.recommendation.value}。{question.recommendation.reason}</span>
                  </label>
                ) : null}
                {question.allowCustom && question.answerMode !== "text" ? (
                  <label className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", active.includes("__custom") ? "border-primary bg-primary-50 text-primary-700" : "border-border hover:border-primary-300")}>
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
                  setCustom((current) => ({ ...current, [question.id]: value }));
                  if (value.trim() && question.answerMode !== "multi_choice") setSelected((current) => ({ ...current, [question.id]: ["__custom"] }));
                }}
                placeholder={question.options?.find((option) => option.enablesTextInput && active.includes(option.id))?.textPlaceholder ?? "输入你的回答"}
                value={custom[question.id] ?? ""}
              />
            ) : null}
          </fieldset>
        );
      })}
      {!complete ? <p className="text-xs text-muted-foreground">请完成所有必答问题，或直接采用 AI 推荐。</p> : null}
      <Button disabled={disabled || !complete} onClick={submitAnswers} size="sm" type="button">
        <Check className="size-4" />确认回答并继续
      </Button>
    </div>
  );
}

function loadingStatus(label: string, seconds: number) {
  const elapsed = seconds > 0 ? `${seconds}s` : "刚刚开始";
  if (label.includes("分析")) {
    if (seconds < 6) return { title: "正在理解你的故事想法", detail: `识别人物、类型和学生参与方式 · ${elapsed}` };
    if (seconds < 14) return { title: "正在梳理故事上下文", detail: `结合历史对话和人物信息 · ${elapsed}` };
    return { title: "正在准备下一步内容", detail: `可能返回澄清问题、故事方向或完整大纲 · ${elapsed}` };
  }
  if (label.includes("故事方向")) return { title: "正在构思 3 个故事方向", detail: `拉开任务、冲突和冒险路径的差异 · ${elapsed}` };
  if (label.includes("故事大纲")) {
    if (seconds < 10) return { title: "正在搭建故事主线", detail: `保持人物和故事类型要求 · ${elapsed}` };
    return { title: "正在安排角色与章节", detail: `让每章都推进具体事件 · ${elapsed}` };
  }
  if (label.includes("参考资料")) return { title: "正在整理参考资料", detail: `提取可用要点和改编边界 · ${elapsed}` };
  if (label.includes("重新开始")) return { title: "正在清空本轮内容", detail: elapsed };
  return { title: label.replace(/\.\.\.$/, ""), detail: elapsed };
}

function operationLoadingLabel(phase?: NonNullable<CourseStoryOutlineState["operation"]>["phase"]) {
  if (!phase) return "";
  switch (phase) {
    case "preparing_reference": return "正在准备故事创作...";
    case "searching_reference": return "正在整理参考资料...";
    case "generating_directions": return "正在生成故事方向...";
    case "generating_outline": return "正在生成故事大纲...";
    case "revising": return "正在应用修改...";
    default: return "正在分析故事要求...";
  }
}

function LoadingCard({ label, seconds, className }: { label: string; seconds: number; className?: string }) {
  const status = loadingStatus(label, seconds);
  return (
    <article aria-live="polite" className={cn("rounded-lg bg-muted px-3 py-3 text-sm text-foreground", className)}>
      <div className="flex items-start gap-2">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
        <div>
          <p className="font-medium leading-5">{status.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.detail}</p>
        </div>
      </div>
    </article>
  );
}

function tabClass(active: boolean) {
  return cn(
    "min-h-9 rounded-md px-3 text-sm font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
  );
}

function ResultPanel({
  state,
  references,
  outline,
  pendingLabel,
  pendingSeconds,
  resultTab,
  setResultTab,
  onChooseDirection,
  onConfirmDirection,
  onReviseDirection,
  onReviseOutline,
  onReviseChapter,
  onDescribeDirection,
  onConfirm,
  pending,
}: {
  state: CourseStoryOutlineState;
  references: CourseSourceReference[];
  outline: CourseStoryOutline | null;
  pendingLabel: string;
  pendingSeconds: number;
  resultTab: "outline" | "characters" | "references";
  setResultTab: (tab: "outline" | "characters" | "references") => void;
  onChooseDirection: (direction: CourseStoryDirection) => void;
  onConfirmDirection: (direction: CourseStoryDirection) => void;
  onReviseDirection: (direction: CourseStoryDirection, instruction: string) => void;
  onReviseOutline: (instruction: string) => void;
  onReviseChapter: (order: number, instruction: string) => void;
  onDescribeDirection: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const hasNewDirections = state.directions.length > 0 && !state.directions.some((direction) => direction.selectedAt);

  if (hasNewDirections) {
    return <DirectionsPanel directions={state.directions} onChooseDirection={onChooseDirection} onConfirmDirection={onConfirmDirection} onDescribeDirection={onDescribeDirection} onReviseDirection={onReviseDirection} pending={pending} />;
  }

  if (outline) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <div className="flex gap-2 border-b border-border pb-3">
          <button className={tabClass(resultTab === "outline")} onClick={() => setResultTab("outline")} type="button">故事大纲</button>
          <button className={tabClass(resultTab === "characters")} onClick={() => setResultTab("characters")} type="button">角色</button>
          <button className={tabClass(resultTab === "references")} onClick={() => setResultTab("references")} type="button">参考资料</button>
        </div>
        {resultTab === "outline" ? <OutlineSummary onReviseChapter={onReviseChapter} onReviseOutline={onReviseOutline} outline={outline} pending={pending} state={state} /> : null}
        {resultTab === "characters" ? <CharactersSection outline={outline} /> : null}
        {resultTab === "references" ? (
          <div className="space-y-4">
            {references.length || outline.sourceReferences.length ? <>
              <ReferenceCandidateNotice />
              {[...references, ...outline.sourceReferences.filter((reference) => !references.some((item) => item.id === reference.id))].map((reference) => (
                <ReferenceCard key={reference.id} reference={reference} />
              ))}
            </> : <p className="text-sm text-muted-foreground">暂无参考资料</p>}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">确认后将进入教学规划，继续设计每章教学内容。</p>
          <Button disabled={pending} onClick={onConfirm} type="button">
            {pending && pendingLabel === "正在确认故事大纲..." ? <Loader2 className="size-4 animate-spin" /> : null}
            确认故事大纲并进入教学规划
            {!pending ? <ArrowRight className="size-4" /> : null}
          </Button>
        </div>
      </section>
    );
  }

  if (references.length) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">参考资料</h3>
        <ReferenceCandidateNotice />
        {references.map((reference) => <ReferenceCard key={reference.id} reference={reference} />)}
      </section>
    );
  }

  if (state.directions.length) {
    return <DirectionsPanel directions={state.directions} onChooseDirection={onChooseDirection} onConfirmDirection={onConfirmDirection} onDescribeDirection={onDescribeDirection} onReviseDirection={onReviseDirection} pending={pending} />;
  }

  return (
    <section className="flex min-h-[680px] items-center justify-center rounded-lg bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
      {pendingLabel ? (
        <div className="space-y-2">
          <Loader2 className="mx-auto size-5 animate-spin text-primary" />
          <p className="font-medium text-foreground">结果生成后会显示在这里</p>
          <p className="text-xs text-muted-foreground">已处理 {pendingSeconds}s</p>
        </div>
      ) : "还没有生成结果"}
    </section>
  );
}

function DirectionsPanel({
  directions,
  onChooseDirection,
  onConfirmDirection,
  onDescribeDirection,
  onReviseDirection,
  pending,
}: {
  directions: CourseStoryDirection[];
  onChooseDirection: (direction: CourseStoryDirection) => void;
  onConfirmDirection: (direction: CourseStoryDirection) => void;
  onDescribeDirection: () => void;
  onReviseDirection: (direction: CourseStoryDirection, instruction: string) => void;
  pending: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  return (
    <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
      <div><h3 className="text-lg font-semibold text-foreground">故事方向</h3><p className="mt-1 text-sm text-muted-foreground">先选择大方向；你仍可单独调整选中的卡片，确认后才会生成章节大纲。</p></div>
      {directions.map((direction) => (
        <article className={cn("rounded-md border p-4", direction.selectedAt ? "border-primary bg-primary-50/30" : "border-border")} key={direction.id}>
          <div className="flex items-start justify-between gap-3"><h4 className="text-base font-semibold text-foreground">{splitBilingual(direction.title).zh}</h4>{direction.selectedAt ? <span className="rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">已选择</span> : null}</div>
          <p className="mt-2 text-sm leading-6 text-foreground">{splitBilingual(direction.hook).zh}</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-muted-foreground">故事亮点</dt><dd className="mt-1 leading-5 text-foreground">{direction.storyHighlight || "—"}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">成长核心</dt><dd className="mt-1 leading-5 text-foreground">{direction.growthCore || "—"}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">主要角色</dt><dd className="mt-1 leading-5 text-foreground">{direction.mainCharacters.join("、") || "待大纲阶段确认"}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">适合原因</dt><dd className="mt-1 leading-5 text-foreground">{splitBilingual(direction.whyFits).zh}</dd></div>
          </dl>
          {editingId === direction.id ? (
            <div className="mt-4 space-y-2 rounded-md border border-border bg-background p-3">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`revise-${direction.id}`}>只修改这张方向卡</label>
              <textarea className="min-h-20 w-full resize-y rounded-md border border-input p-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" id={`revise-${direction.id}`} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：保留角色，但把冲突改得更离奇一些" value={instruction} />
              <div className="flex gap-2"><Button disabled={pending || !instruction.trim()} onClick={() => { onReviseDirection(direction, instruction.trim()); setEditingId(null); setInstruction(""); }} size="sm" type="button">应用修改</Button><Button onClick={() => { setEditingId(null); setInstruction(""); }} size="sm" type="button" variant="outline">取消</Button></div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {direction.selectedAt ? <Button disabled={pending} onClick={() => onConfirmDirection(direction)} size="sm" type="button"><Check className="size-4" />确认方向，生成大纲</Button> : <Button disabled={pending} onClick={() => onChooseDirection(direction)} size="sm" type="button">选择这个方向</Button>}
              <Button disabled={pending} onClick={() => { setEditingId(direction.id); setInstruction(""); }} size="sm" type="button" variant="outline"><Pencil className="size-4" />调整这张卡</Button>
            </div>
          )}
        </article>
      ))}
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">都不合适？告诉我你希望的故事方向，我会重新生成。</p>
        <Button onClick={onDescribeDirection} size="sm" type="button" variant="outline">描述我想要的方向</Button>
      </div>
    </section>
  );
}

function CardGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-sm font-semibold text-foreground">{title}</h4><div className="space-y-2">{children}</div></div>;
}

function OutlineSummary({ outline, state, pending, onReviseOutline, onReviseChapter }: { outline: CourseStoryOutline; state: CourseStoryOutlineState; pending: boolean; onReviseOutline: (instruction: string) => void; onReviseChapter: (order: number, instruction: string) => void }) {
  const title = splitBilingual(outline.title);
  const summary = splitBilingual(outline.summary);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [chapterInstruction, setChapterInstruction] = useState("");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">{title.zh}</h3>
        </div>
        <p className="mt-3 text-sm leading-6 text-foreground">{summary.zh}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {outline.narrativeType ? <span className="rounded-full bg-card px-2 py-1">叙事类型：{outline.narrativeType}</span> : null}
        </div>
        {editing ? <div className="mt-4 space-y-2"><textarea aria-label="整体大纲修改要求" className="min-h-20 w-full resize-y rounded-md border border-input bg-background p-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setInstruction(event.target.value)} placeholder="说明需要调整的主线、角色或成长方向" value={instruction} /><div className="flex gap-2"><Button disabled={pending || !instruction.trim()} onClick={() => { onReviseOutline(instruction.trim()); setEditing(false); setInstruction(""); }} size="sm" type="button">重新生成整体大纲</Button><Button onClick={() => setEditing(false)} size="sm" type="button" variant="outline">取消</Button></div></div> : <Button className="mt-4" disabled={pending} onClick={() => setEditing(true)} size="sm" type="button" variant="outline"><Pencil className="size-4" />修改整体大纲</Button>}
      </div>
      {state.unrecommendedKnowledgePoints?.length ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">已根据 {state.course.englishLevel} 难度和 {state.course.durationMinutes} 分钟课时智能匹配。{state.unrecommendedKnowledgePoints.map((item) => item.label).join("、")} 暂未放入章节推荐，可在下一步手动调整。</p> : null}
      <CardGroup title="章节大纲">
        <div className="grid gap-3 xl:grid-cols-2">
          {outline.chapters.map((chapter) => {
            const chapterTitle = splitBilingual(chapter.title);
            const plotSummary = chapter.whatHappens || chapter.storyGoal;
            return (
              <article className="rounded-md border border-border p-3" key={chapter.id}>
                <div className="flex items-start gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary">{chapter.order}</span>
                  <div className="min-w-0">
                    <h5 className="text-sm font-semibold text-foreground">{chapterTitle.zh}</h5>
                  </div>
                </div>
                <p className="mt-3 text-xs font-medium text-muted-foreground">剧情概述</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{plotSummary}</p>
                <div className="mt-3 border-t border-border pt-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">建议 {chapter.recommendedWordCount} 词</span>{(chapter.recommendedKnowledgePointIds ?? []).map((id) => { const point = state.selectedKnowledgePoints?.find((item) => item.id === id); return <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700" key={id}>{point?.label ?? id}</span>; })}</div>{chapter.knowledgePointRecommendationSummary ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{chapter.knowledgePointRecommendationSummary}</p> : null}</div>
                {editingChapter === chapter.order ? <div className="mt-3 space-y-2"><textarea aria-label={`第 ${chapter.order} 章修改要求`} className="min-h-20 w-full resize-y rounded-md border border-input p-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setChapterInstruction(event.target.value)} placeholder="只说明这一章需要怎样调整" value={chapterInstruction} /><div className="flex gap-2"><Button disabled={pending || !chapterInstruction.trim()} onClick={() => { onReviseChapter(chapter.order, chapterInstruction.trim()); setEditingChapter(null); setChapterInstruction(""); }} size="sm" type="button">应用本章修改</Button><Button onClick={() => setEditingChapter(null)} size="sm" type="button" variant="outline">取消</Button></div></div> : <Button className="mt-3" disabled={pending} onClick={() => { setEditingChapter(chapter.order); setChapterInstruction(""); }} size="sm" type="button" variant="ghost"><Pencil className="size-4" />修改本章</Button>}
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
        <div className="grid gap-2 sm:grid-cols-2">
          {outline.characters.length ? outline.characters.map((character) => (
            <CharacterCard character={character} key={character.id} />
          )) : <p className="text-sm text-muted-foreground">本故事暂无出场角色</p>}
        </div>
      </CardGroup>
    </div>
  );
}

function CharacterCard({ character }: { character: CourseStoryOutline["characters"][number] }) {
  return (
    <article className="rounded-md border border-border p-3">
      <h5 className="text-sm font-semibold text-foreground">{character.displayName}</h5>
      <p className="mt-1 text-xs text-muted-foreground">{sourceTypeLabel(character.sourceType)} · {character.roleInStory}</p>
      <p className="mt-2 text-sm text-muted-foreground">{character.shortDescription}</p>
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
        ) : <p className="text-sm text-muted-foreground">暂未提取到可用要点</p>}
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
