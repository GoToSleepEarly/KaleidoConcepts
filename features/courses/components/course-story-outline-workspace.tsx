"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Loader2, RotateCcw, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  CourseSourceReference,
  CourseStoryChatAction,
  CourseStoryMessageInput,
  CourseStoryOutline,
  CourseStoryOutlineState,
  CourseStoryDirection,
  CourseAudiencePerson,
  StoryWritingProvider,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

export function CourseStoryOutlineWorkspace({ initialState }: { initialState: CourseStoryOutlineState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [mode, setMode] = useState<"idea" | "random">("idea");
  const [message, setMessage] = useState("");
  const [randomSupplement, setRandomSupplement] = useState("");
  const [chapterCount, setChapterCount] = useState(initialState.settings.chapterCount);
  const [writingProvider, setWritingProvider] = useState<StoryWritingProvider>(initialState.settings.writingProvider);
  const [theme, setTheme] = useState("任意主题");
  const [storyType, setStoryType] = useState("冒险解谜");
  const [tone, setTone] = useState("温暖合作");
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("");
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [resultTab, setResultTab] = useState<"outline" | "characters" | "references">("outline");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [optimisticTeacherMessage, setOptimisticTeacherMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasStepContent = Boolean(state.chatMessages.length || state.directions.length || state.referenceMaterials.length || state.outline);
  const conversationStarted = hasStepContent || pending || Boolean(optimisticTeacherMessage);

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
    options: { optimisticMessage?: string; restoreMessage?: string; restoreRandomSupplement?: string } = {},
  ) {
    const optimisticMessage = options.optimisticMessage ?? input.message.trim();
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel(label);
    setError("");
    setOptimisticTeacherMessage(optimisticMessage);
    setMessage("");
    if (input.mode === "random") setRandomSupplement("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, chapterCount, writingProvider }),
      });
      const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
      if (!response.ok) throw new Error(data.message || "故事大纲生成失败");
      const hasNewReferences = data.referenceMaterials.length > state.referenceMaterials.length;
      setState(data);
      if (hasNewReferences) setResultTab("references");
      if (input.mode === "random") setMode("idea");
      setMessage("");
      setRandomSupplement("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事大纲生成失败");
      if (options.restoreMessage) setMessage(options.restoreMessage);
      if (options.restoreRandomSupplement) setRandomSupplement(options.restoreRandomSupplement);
    } finally {
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
        `主题：${theme}`,
        `故事类型：${storyType}`,
        `故事氛围：${tone}`,
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
    const isReferenceSearch = action.action === "choose_reference_search" || action.action === "request_reference_search";
    const isFlowDecision = action.action === "confirm_reference_materials" || action.action === "choose_story_usage";
    const label = isReferenceSearch
      ? "正在整理参考资料..."
      : isFlowDecision
        ? "正在分析故事要求..."
      : action.action === "generate_directions"
        ? "正在生成故事方向..."
        : "正在生成故事大纲...";
    const draft = message.trim();
    const optimisticMessage = draft || actionHistoryMessage(action);
    await postMessage({
      message: draft,
      mode: action.action === "regenerate_outline" ? "revise" : "idea",
      action: action.action,
      targetId: action.targetId,
      researchPlan: action.researchPlan,
    }, label, { optimisticMessage, restoreMessage: draft });
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
      <CourseCreateSteps courseId={state.course.id} currentStep={2} />
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
                  <option value="quickrouter_gpt">GPT（资料更稳）</option>
                  <option value="quickrouter_deepseek">DeepSeek（成本更低）</option>
                </select>
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!conversationStarted && mode === "random" ? (
              <form className="mx-auto w-full max-w-xl space-y-4 rounded-lg border border-border bg-muted/30 p-4" onSubmit={submit}>
                <div>
                  <h3 className="font-medium text-foreground">生成故事方向</h3>
                  <p className="mt-1 text-sm text-muted-foreground">选择基本方向，也可以补充一个特别要求。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs text-muted-foreground">主题灵感</span>
                    <select aria-label="主题灵感" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" onChange={(event) => setTheme(event.target.value)} value={theme}>
                      <option>任意主题</option>
                      <option>海底世界</option>
                      <option>太空学校</option>
                      <option>时间旅行</option>
                      <option>魔法图书馆</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">故事类型</span>
                    <select aria-label="故事类型" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" onChange={(event) => setStoryType(event.target.value)} value={storyType}>
                      <option>冒险解谜</option>
                      <option>校园生活</option>
                      <option>科学探索</option>
                      <option>人物成长</option>
                      <option>奇幻任务</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">故事氛围</span>
                    <select aria-label="故事氛围" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" onChange={(event) => setTone(event.target.value)} value={tone}>
                      <option>温暖合作</option>
                      <option>轻松幽默</option>
                      <option>紧张刺激</option>
                      <option>安静治愈</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">补充要求（可选）</span>
                  <input
                    aria-label="补充要求（可选）"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                    onChange={(event) => setRandomSupplement(event.target.value)}
                    placeholder="例如：希望学生和老师共同参与"
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
              <article className={cn("rounded-lg px-3 py-2 text-sm", chat.role === "teacher" ? "ml-10 bg-primary text-primary-foreground" : "mr-10 bg-muted text-foreground")} key={chat.id}>
                <p className="whitespace-pre-wrap leading-6">{chat.content}</p>
                {chat.actions.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {chat.actions.map((action) => (
                      <Button disabled={pending} key={action.id} onClick={() => void handleAction(action)} size="sm" type="button" variant="outline">
                        {action.action === "request_reference_search" || action.action === "choose_reference_search" ? <Search className="size-4" /> : <Sparkles className="size-4" />}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {optimisticTeacherMessage ? (
              <article className="ml-10 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                <p className="whitespace-pre-wrap leading-6">{optimisticTeacherMessage}</p>
              </article>
            ) : null}
            {pending && pendingLabel ? <LoadingCard className="mr-10" label={pendingLabel} seconds={pendingSeconds} /> : null}
          </div>

          {mode === "idea" || conversationStarted ? <form className="border-t border-border p-4" onSubmit={submit}>
            <label className="block">
              <span className={conversationStarted ? "sr-only" : "text-sm font-medium text-foreground"}>{conversationStarted ? "故事想法" : "说说你的故事想法"}</span>
              {!conversationStarted ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">可以写人物、角色、故事类型，以及希望学生如何参与。例如：参考《瓦罗兰特》的 Jett 和 Sage，让他们和学生一起经历一场冒险。</span> : null}
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
            "正在生成故事大纲...",
            { optimisticMessage: `我选择故事方向：${direction.title}\n${direction.hook}` },
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
      <Dialog onClose={() => setResetOpen(false)} open={resetOpen} title="重新开始本轮构思？">
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-sm leading-6 text-muted-foreground">将清空本轮 Step 2 的聊天记录、故事方向、参考资料和故事大纲。</p>
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

function modeClass(active: boolean) {
  return cn("min-h-10 rounded-md px-3 text-sm font-medium", active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70");
}

function actionHistoryMessage(action: CourseStoryChatAction) {
  if (action.action === "request_reference_search" || action.action === "choose_reference_search") {
    return `请联网整理参考资料：${action.targetId || "当前引用对象"}`;
  }
  if (action.action === "generate_from_reference") return "请用已确认的参考资料生成故事大纲。";
  if (action.action === "confirm_reference_materials") return "我确认参考资料，请继续判断故事生成方式。";
  if (action.action === "choose_story_usage") return action.targetId === "follow_original"
    ? "我选择按原剧情讲，保留原作主线、关键转折和结局。"
    : "我选择创作新剧情，使用原作人物、世界观或主题重新创作。";
  if (action.action === "generate_directions") return "我确认参考资料，请生成 3 个故事方向。";
  if (action.action === "regenerate_outline") return "请基于当前全部要求重新生成故事大纲。";
  return action.label;
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
  onDescribeDirection: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const hasNewDirections = state.directions.length > 0 && !state.directions.some((direction) => direction.selectedAt);

  if (hasNewDirections) {
    return <DirectionsPanel directions={state.directions} onChooseDirection={onChooseDirection} onDescribeDirection={onDescribeDirection} />;
  }

  if (outline) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <div className="flex gap-2 border-b border-border pb-3">
          <button className={tabClass(resultTab === "outline")} onClick={() => setResultTab("outline")} type="button">故事大纲</button>
          <button className={tabClass(resultTab === "characters")} onClick={() => setResultTab("characters")} type="button">角色</button>
          <button className={tabClass(resultTab === "references")} onClick={() => setResultTab("references")} type="button">参考资料</button>
        </div>
        {resultTab === "outline" ? <OutlineSummary outline={outline} state={state} /> : null}
        {resultTab === "characters" ? <CharactersSection coursePeople={state.coursePeople} outline={outline} /> : null}
        {resultTab === "references" ? (
          <div className="space-y-4">
            {references.length || outline.sourceReferences.length ? [...references, ...outline.sourceReferences.filter((reference) => !references.some((item) => item.id === reference.id))].map((reference) => (
              <ReferenceCard key={reference.id} reference={reference} />
            )) : <p className="text-sm text-muted-foreground">暂无参考资料</p>}
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
        {references.map((reference) => <ReferenceCard key={reference.id} reference={reference} />)}
      </section>
    );
  }

  if (state.directions.length) {
    return <DirectionsPanel directions={state.directions} onChooseDirection={onChooseDirection} onDescribeDirection={onDescribeDirection} />;
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
  onDescribeDirection,
}: {
  directions: CourseStoryDirection[];
  onChooseDirection: (direction: CourseStoryDirection) => void;
  onDescribeDirection: () => void;
}) {
  return (
    <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-foreground">故事方向</h3>
      {directions.map((direction) => (
        <article className="rounded-md border border-border p-4" key={direction.id}>
          <h4 className="text-sm font-semibold text-foreground">{splitBilingual(direction.title).zh}</h4>
          <p className="mt-2 text-sm text-muted-foreground">{splitBilingual(direction.hook).zh}</p>
          <p className="mt-2 text-xs text-muted-foreground">{splitBilingual(direction.whyFits).zh}</p>
          <Button className="mt-3" onClick={() => onChooseDirection(direction)} size="sm" type="button">选择这个方向</Button>
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

function OutlineSummary({ outline, state }: { outline: CourseStoryOutline; state: CourseStoryOutlineState }) {
  const title = splitBilingual(outline.title);
  const summary = splitBilingual(outline.summary);
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
              </article>
            );
          })}
        </div>
      </CardGroup>
    </div>
  );
}

function CharactersSection({ outline, coursePeople }: { outline: CourseStoryOutline; coursePeople: CourseAudiencePerson[] }) {
  const referenced = outline.characters.filter((character) => character.sourceType === "referenced");
  const original = outline.characters.filter((character) => character.sourceType === "original");
  return (
    <div className="space-y-5">
      <CardGroup title="课堂角色">
        <div className="grid gap-2 sm:grid-cols-2">
          {coursePeople.length ? coursePeople.map((person) => (
            <article className="rounded-md border border-border p-3" key={person.personId}>
              <h5 className="text-sm font-semibold text-foreground">{person.chineseName} · {person.englishName}</h5>
              <p className="mt-1 text-xs text-muted-foreground">{person.age} 岁 · {person.role === "teacher" ? "老师" : "学生"}</p>
            </article>
          )) : <p className="text-sm text-muted-foreground">暂无课堂角色</p>}
        </div>
      </CardGroup>
      <CardGroup title="引用角色">
        <div className="grid gap-2 sm:grid-cols-2">
          {referenced.length ? referenced.map((character) => (
            <CharacterCard character={character} key={character.id} />
          )) : <p className="text-sm text-muted-foreground">暂无引用角色</p>}
        </div>
      </CardGroup>
      <CardGroup title="原创角色">
        <div className="grid gap-2 sm:grid-cols-2">
          {original.length ? original.map((character) => (
            <CharacterCard character={character} key={character.id} />
          )) : <p className="text-sm text-muted-foreground">暂无原创角色</p>}
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
