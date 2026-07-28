"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Edit3,
  Eye,
  Library,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  LessonChatAction,
  LessonChatMessage,
  LessonChatResponse,
  LlmModel,
  PresetOption,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const llmModelOptions: { value: LlmModel; label: string }[] = [
  { value: "gpt_5_5", label: "GPT 5.5" },
  { value: "deepseek_chat", label: "DeepSeek" },
];

type ChatIntent = "outline" | "draft" | "revise";
type StartMode = "library" | "idea";

type DraftIssue = {
  level: "blocker" | "warning";
  message: string;
};

type DraftFormatIssue = {
  code: string;
  message: string;
  lineNumber?: number;
  stage?: number;
  sLabel?: string;
  line?: string;
  questionNumbers?: number[];
};

function parseSseEvent(rawEvent: string) {
  const lines = rawEvent.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
  const data = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("");
  if (!event || !data) return null;
  return { event, data: JSON.parse(data) as Record<string, unknown> };
}

export function StoryOptionsManager({ courseId }: { courseId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const repairPanelRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<LessonChatMessage[]>([]);
  const [draftText, setDraftText] = useState("");
  const [input, setInput] = useState("");
  const [selectedLlmModel, setSelectedLlmModel] = useState<LlmModel>("gpt_5_5");
  const [themePresets, setThemePresets] = useState<PresetOption[]>([]);
  const [selectedTheme, setSelectedTheme] = useState("");
  const [startMode, setStartMode] = useState<StartMode | null>(null);
  const [ideaText, setIdeaText] = useState("");
  const [lessonDraftExists, setLessonDraftExists] = useState(false);
  const [editorMode, setEditorMode] = useState<"preview" | "edit">("preview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeIntent, setActiveIntent] = useState<ChatIntent | null>(null);
  const [sendingSeconds, setSendingSeconds] = useState(0);
  const [streamedCharCount, setStreamedCharCount] = useState(0);
  const [isStructuring, setIsStructuring] = useState(false);
  const [structuringSeconds, setStructuringSeconds] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formatIssues, setFormatIssues] = useState<DraftFormatIssue[]>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");

  const hasDraft = draftText.trim().length > 0;
  const hasStarted = messages.length > 0 || hasDraft;
  const showStartForm = !hasStarted;
  const canSend = input.trim().length > 0 && !isSending && !isStructuring;
  const visibleMessages = useMemo(() => messages.slice(-8), [messages]);
  const latestOutlineMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) => message.role === "assistant" && message.actions?.length,
        ),
    [messages],
  );
  const draftIssues = useMemo(() => analyzeDraftText(draftText), [draftText]);
  const blockers = draftIssues.filter((issue) => issue.level === "blocker");
  const isOutlineWork = isSending && activeIntent === "outline";
  const isDraftWork = isSending && activeIntent !== "outline";
  const showStoryWorkspace = hasDraft || lessonDraftExists;
  const showDraftQuality = hasDraft && !isSending && !isStructuring;
  const hasRepairableIssues =
    showDraftQuality && (formatIssues.length > 0 || blockers.length > 0);
  const selectedModelLabel =
    llmModelOptions.find((option) => option.value === selectedLlmModel)
      ?.label ?? selectedLlmModel;

  useEffect(() => {
    let isActive = true;

    async function loadChat() {
      setIsLoading(true);
      setError("");

      try {
        const [chatResponse, presetsResponse] = await Promise.all([
          fetch(`/api/courses/${courseId}/lesson-chat`),
          fetch("/api/presets?kind=theme"),
        ]);

        if (!chatResponse.ok) {
          const data = (await chatResponse.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(data?.message ?? "教案共创内容加载失败");
        }

        const chatData = (await chatResponse.json()) as LessonChatResponse;
        const presetData = presetsResponse.ok
          ? ((await presetsResponse.json()) as { presets: PresetOption[] })
          : { presets: [] };

        if (isActive) {
          setMessages(chatData.messages);
          setDraftText(chatData.draftText);
          setSelectedLlmModel(chatData.llmModel);
          setLessonDraftExists(chatData.lessonDraftExists);
          setThemePresets(presetData.presets);
        }
      } catch (loadError) {
        if (isActive)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "教案共创内容加载失败",
          );
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadChat();
    return () => {
      isActive = false;
    };
  }, [courseId]);

  useEffect(() => {
    if (!isSending) return;
    const timer = window.setInterval(
      () => setSendingSeconds((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isSending]);

  useEffect(() => {
    if (!isStructuring) return;
    const timer = window.setInterval(
      () => setStructuringSeconds((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isStructuring]);

  useEffect(() => {
    if (showStartForm) return;
    const frame = window.requestAnimationFrame(() => {
      chatBottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
      const scrollArea = chatScrollRef.current;
      if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    showStartForm,
    visibleMessages.length,
    isSending,
    sendingSeconds,
    streamedCharCount,
    isStructuring,
    structuringSeconds,
    statusText,
  ]);

  useEffect(() => {
    if (!hasDraft) return;
    if (isSending || isStructuring) return;

    let isActive = true;
    const controller = new AbortController();

    async function diagnoseDraftText() {
      setIsDiagnosing(true);
      setDiagnosisError("");
      try {
        const response = await fetch(
          `/api/courses/${courseId}/lesson-chat/diagnose`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draftText }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(data?.message ?? "文本检测失败");
        }
        const data = (await response.json()) as { issues?: DraftFormatIssue[] };
        if (isActive) setFormatIssues(data.issues ?? []);
      } catch (diagnoseError) {
        if (!isActive || controller.signal.aborted) return;
        setFormatIssues([]);
        setDiagnosisError(
          diagnoseError instanceof Error
            ? diagnoseError.message
            : "文本检测失败",
        );
      } finally {
        if (isActive) setIsDiagnosing(false);
      }
    }

    const timer = window.setTimeout(() => {
      void diagnoseDraftText();
    }, 300);
    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [courseId, draftText, hasDraft, isSending, isStructuring]);

  function updateDraftText(text: string) {
    setDraftText(text);
    setLessonDraftExists(false);
    if (!text.trim()) {
      setFormatIssues([]);
      setDiagnosisError("");
      setIsDiagnosing(false);
    }
  }

  async function sendMessage(text = input, intent?: ChatIntent) {
    const content = text.trim();
    if (!content || isSending) return;

    const inferredIntent = intent ?? (hasDraft ? "revise" : "outline");
    setInput("");
    setError("");
    setNotice("");
    setStatusText("");
    setSendingSeconds(0);
    setStreamedCharCount(0);
    setActiveIntent(inferredIntent);
    setIsSending(true);

    const localMessage: LessonChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, localMessage]);

    try {
      const response = await fetch(
        `/api/courses/${courseId}/lesson-chat/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            draftText,
            intent: inferredIntent,
            llmModel: selectedLlmModel,
          }),
        },
      );

      const reader = response.body?.getReader();
      if (!reader) throw new Error("AI 响应读取失败");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedDraft = "";
      let assistantReply = "";
      let assistantActions: LessonChatAction[] | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const parsed = parseSseEvent(rawEvent);
          if (!parsed) continue;
          const { event, data } = parsed;

          if (event === "status" && typeof data.message === "string") {
            setStatusText(data.message);
          } else if (event === "notice" && typeof data.message === "string") {
            setNotice(data.message);
          } else if (event === "draft_reset") {
            streamedDraft = "";
            updateDraftText("");
            setStreamedCharCount(0);
          } else if (event === "draft_delta" && typeof data.text === "string") {
            streamedDraft += data.text;
            updateDraftText(streamedDraft);
            setStreamedCharCount(streamedDraft.length);
          } else if (event === "draft" && typeof data.draftText === "string") {
            streamedDraft = data.draftText;
            updateDraftText(data.draftText);
            setStreamedCharCount(data.draftText.length);
          } else if (
            event === "assistant" &&
            typeof data.message === "string"
          ) {
            assistantReply = data.message;
            assistantActions = Array.isArray(data.actions)
              ? (data.actions as LessonChatAction[])
              : undefined;
          } else if (event === "error") {
            throw new Error(
              typeof data.message === "string" ? data.message : "AI 共创失败",
            );
          }
        }
      }

      setMessages((current) => [
        ...current.filter((item) => item.id !== localMessage.id),
        {
          id: `user-${Date.now()}`,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
        },
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            assistantReply ||
            (inferredIntent === "outline"
              ? "已生成简单故事大纲。"
              : "已更新右侧最终文案。"),
          createdAt: new Date().toISOString(),
          ...(assistantActions?.length ? { actions: assistantActions } : {}),
        },
      ]);
      setStatusText("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "AI 共创失败");
      setMessages((current) =>
        current.filter((item) => item.id !== localMessage.id),
      );
    } finally {
      setIsSending(false);
      setActiveIntent(null);
      setSendingSeconds(0);
    }
  }

  function startFromLibrary() {
    if (!selectedTheme) return;
    const prompt = [
      `我想从主题灵感「${selectedTheme}」开始。`,
      "请先生成一个简单故事大纲让我确认，不要直接生成最终课文。",
      "默认使用原创故事，不要凭空引入第三方 IP 或真实人物。",
    ].join("\n");
    void sendMessage(prompt, "outline");
  }

  function startFromIdea() {
    const idea = ideaText.trim();
    if (!idea) return;
    const prompt = [
      "我有自己的故事想法。请先生成一个简单故事大纲让我确认，不要直接生成最终课文。",
      "",
      "故事想法：",
      idea,
    ].join("\n");
    void sendMessage(prompt, "outline");
  }

  function handleAction(action: LessonChatAction) {
    if (action.id === "revise_outline" || action.id === "add_reference") {
      setInput(action.message);
      return;
    }
    void sendMessage(action.message, action.intent);
  }

  async function clearChat() {
    if (isSending || isStructuring) return;
    const confirmed = window.confirm(
      "确定清空 Step2 对话和右侧最终文案吗？Step1 基础信息不会被清空。",
    );
    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/courses/${courseId}/lesson-chat`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "清空对话失败");
      }
      setMessages([]);
      updateDraftText("");
      setStatusText("");
      setStartMode(null);
      setSelectedTheme("");
      setIdeaText("");
      setNotice("已清空，可以重新开始。");
    } catch (clearError) {
      setError(
        clearError instanceof Error ? clearError.message : "清空对话失败",
      );
    }
  }

  function focusRepairPanel() {
    repairPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function buildRepairPrompt() {
    const issueLines = [
      ...formatIssues.map((issue, index) =>
        [
          `${index + 1}. ${issue.message}`,
          issue.lineNumber ? `位置：第 ${issue.lineNumber} 行` : "",
          issue.line ? `原文：${issue.line}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      ...blockers.map(
        (issue, index) =>
          `${formatIssues.length + index + 1}. ${issue.message}`,
      ),
    ];

    return [
      "请修复最终文案中的以下程序格式问题。",
      "",
      "修复要求：",
      "- 只修复列出的问题，不重写故事主线、阶段标题、课堂目标和整体题量。",
      "- 返回完整的【Lesson Draft】最终文案，不要解释，不要 Markdown 代码块。",
      "- 每个 Reading 的 S 行最多包含 1 道嵌入题。",
      "- 如果同一 S 行有多道题，请由 AI 重新改写局部句子，把题点分配到自然的多条 S 行中，并保持题号与答案区一致。",
      "- 挖空和提示必须放在句子中间缺词位置，不要放在句尾。",
      "",
      "需要修复的问题：",
      ...issueLines,
    ].join("\n");
  }

  function repairDraftWithAi() {
    if (!hasRepairableIssues || isSending || isStructuring) return;
    const prompt = buildRepairPrompt();
    setInput(prompt);
    inputRef.current?.focus();
    void sendMessage(prompt, "revise").finally(() => {
      inputRef.current?.focus();
    });
  }

  async function structureDraft() {
    if (lessonDraftExists) {
      router.push(`/courses/${courseId}/create/lesson-draft`);
      return;
    }

    if (!draftText.trim()) {
      setError("请先生成最终文案");
      return;
    }

    if (hasRepairableIssues) {
      setNotice("最终文案还有格式问题，请先点击右侧的 AI 修复。");
      focusRepairPanel();
      inputRef.current?.focus();
      return;
    }

    if (isDiagnosing) {
      setNotice("正在检测最终文案，请稍等几秒再进入 Step3。");
      return;
    }

    if (blockers.length > 0) {
      setError(`确认前需要修复：${blockers[0].message}`);
      return;
    }

    setIsStructuring(true);
    setStructuringSeconds(0);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/courses/${courseId}/lesson-chat/structure`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftText }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
          issues?: DraftFormatIssue[];
        } | null;
        if (data?.issues?.length) {
          setFormatIssues(data.issues);
          setNotice("最终文案还有格式问题，请先点击右侧的 AI 修复。");
          window.setTimeout(() => {
            focusRepairPanel();
            inputRef.current?.focus();
          }, 0);
          return;
        }
        throw new Error(data?.message ?? "标准教案生成失败");
      }

      setLessonDraftExists(true);
      router.push(`/courses/${courseId}/create/lesson-draft`);
    } catch (structureError) {
      setError(
        structureError instanceof Error
          ? structureError.message
          : "标准教案生成失败",
      );
    } finally {
      setIsStructuring(false);
      setStructuringSeconds(0);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        正在加载 AI 教案共创...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CourseCreateSteps courseId={courseId} currentStep={2} />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Button asChild className="mb-4 h-9 px-3 text-sm" variant="outline">
            <Link href={`/courses/${courseId}/create/basic`}>
              <ArrowLeft className="size-4" />
              返回基础信息
            </Link>
          </Button>
          <h2 className="text-balance text-xl font-semibold text-slate-950">
            AI 教案共创
          </h2>
          <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-slate-500">
            先和 AI
            讨论故事大纲。确认大纲并生成最终文案后，右侧才会出现故事工作台。
          </p>
        </div>
        <Button
          className="mt-12 h-9 shrink-0 bg-slate-950 px-4 text-sm text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
          disabled={
            (!hasDraft && !lessonDraftExists) || isSending || isStructuring
          }
          onClick={structureDraft}
          type="button"
        >
          {isStructuring ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {lessonDraftExists ? "查看 Step3" : "进入 Step3"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {notice}
        </div>
      ) : null}

      <div
        className={cn(
          "grid h-[calc(100vh-230px)] min-h-[620px] gap-5",
          showStoryWorkspace
            ? "xl:grid-cols-[400px_minmax(0,1fr)]"
            : "mx-auto max-w-4xl",
        )}
      >
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-slate-100 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">
                  {showStoryWorkspace ? "对话与改稿" : "讨论故事大纲"}
                </div>
                <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">
                  {showStoryWorkspace
                    ? "继续提出修改要求，右侧会同步更新最终文案。"
                    : latestOutlineMessage
                      ? "先确认大纲方向。如果不满意，直接让 AI 调整。"
                      : "选择灵感库或输入你的想法，先生成一个可确认的大纲。"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {llmModelOptions.map((option) => (
                    <button
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition",
                        selectedLlmModel === option.value
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                      key={option.value}
                      onClick={() => setSelectedLlmModel(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="清空对话"
                  className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                  disabled={isSending || isStructuring}
                  onClick={() => void clearChat()}
                  title="清空对话"
                  type="button"
                >
                  <RotateCcw className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-50/60 p-4"
            ref={chatScrollRef}
          >
            {showStartForm ? (
              <StartForm
                isSending={isSending}
                mode={startMode}
                onIdeaSubmit={startFromIdea}
                onLibrarySubmit={startFromLibrary}
                onModeChange={setStartMode}
                onSelectedThemeChange={setSelectedTheme}
                onIdeaTextChange={setIdeaText}
                selectedTheme={selectedTheme}
                ideaText={ideaText}
                themePresets={themePresets}
              />
            ) : null}

            {!showStartForm && visibleMessages.length > 0
              ? visibleMessages.map((item) => (
                  <ChatBubble
                    disabled={isSending || isStructuring}
                    key={item.id}
                    message={item}
                    onAction={handleAction}
                  />
                ))
              : null}
            {isSending ? (
              <ChatStatusBubble
                detail={
                  isDraftWork && streamedCharCount > 0
                    ? `右侧故事工作台已同步 ${streamedCharCount} 字`
                    : undefined
                }
                guide={
                  isDraftWork
                    ? "最终文案会在右侧故事工作台实时出现，可以先看右侧。"
                    : "大纲会出现在下一条 AI 回复里；确认后再生成最终文案，右侧故事工作台才会展开。"
                }
                label={
                  statusText ||
                  (isOutlineWork
                    ? "AI 正在生成故事大纲..."
                    : "AI 正在生成最终文案...")
                }
                seconds={sendingSeconds}
              />
            ) : null}
            {isStructuring ? (
              <ChatStatusBubble
                guide="解析完成后会自动进入 Step3。"
                label="正在解析阶段、题号、答案区和课文结构..."
                seconds={structuringSeconds}
              />
            ) : null}
            <div ref={chatBottomRef} />
          </div>

          {!showStartForm ? (
            <div className="shrink-0 border-t border-slate-100 bg-white p-4">
              <div className="flex gap-2">
                <textarea
                  className="min-h-20 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  ref={inputRef}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={
                    hasDraft
                      ? "继续提出修改要求..."
                      : "补充大纲要求，或点击 AI 大纲下方的确认按钮..."
                  }
                  value={input}
                />
                <Button
                  className="self-end bg-slate-950 text-white hover:bg-slate-800"
                  disabled={!canSend}
                  onClick={() => void sendMessage()}
                  type="button"
                >
                  {isSending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {showStoryWorkspace ? (
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-slate-100 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-950">
                      故事工作台
                    </div>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {selectedModelLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">
                    当前最终文案。这里确认无误后，再进入 Step3 生成标准教案。
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition",
                        editorMode === "preview"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                      onClick={() => setEditorMode("preview")}
                      type="button"
                    >
                      <Eye className="size-3.5" />
                      预览
                    </button>
                    <button
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition",
                        editorMode === "edit"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                      onClick={() => setEditorMode("edit")}
                      type="button"
                    >
                      <Edit3 className="size-3.5" />
                      编辑
                    </button>
                  </div>
                </div>
              </div>

              {isDiagnosing ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  正在检测最终文案格式...
                </div>
              ) : null}
              {diagnosisError ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  {diagnosisError}
                </div>
              ) : null}
              {hasRepairableIssues ? (
                <div
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs leading-5 text-red-800"
                  ref={repairPanelRef}
                >
                  <div className="font-semibold">最终文案需要先修复</div>
                  <div className="mt-1 text-red-700">
                    系统已定位到会影响 Step3 解析的问题，请让 AI 先修复。
                  </div>
                  <div className="mt-2 space-y-1">
                    {formatIssues.map((issue) => (
                      <div
                        key={`${issue.code}-${issue.lineNumber}-${issue.message}`}
                      >
                        {issue.lineNumber ? `第 ${issue.lineNumber} 行：` : ""}
                        {issue.message}
                        {issue.line ? (
                          <div className="mt-1 break-words rounded-md bg-white/70 px-2 py-1 font-mono text-[11px] text-red-700">
                            {issue.line}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {blockers.map((issue) => (
                      <div key={issue.message}>{issue.message}</div>
                    ))}
                  </div>
                  <Button
                    className="mt-3 h-8 bg-slate-950 px-3 text-xs text-white hover:bg-slate-800"
                    disabled={isSending || isStructuring}
                    onClick={repairDraftWithAi}
                    type="button"
                  >
                    <Sparkles className="size-3.5" />
                    AI 修复
                  </Button>
                </div>
              ) : showDraftQuality && !diagnosisError ? (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                  文案格式检测通过，可以进入 Step3。
                </div>
              ) : null}

              {lessonDraftExists && !isStructuring ? (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  标准教案已同步。修改最终文案后需要重新进入 Step3。
                </div>
              ) : null}
              {showDraftQuality && blockers.length > 0 ? (
                <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                  {blockers.map((issue) => (
                    <div key={issue.message}>需要修复：{issue.message}</div>
                  ))}
                </div>
              ) : null}
            </div>

            {hasDraft && editorMode === "edit" ? (
              <textarea
                className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-slate-50/40 p-6 font-mono text-sm leading-7 text-slate-800 outline-none"
                onChange={(event) => updateDraftText(event.target.value)}
                placeholder="最终文案会显示在这里，也可以手动微调。"
                value={draftText}
              />
            ) : (
              <LessonTextPreview text={draftText} />
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ChatStatusBubble({
  label,
  seconds,
  detail,
  guide,
}: {
  label: string;
  seconds: number;
  detail?: string;
  guide?: string;
}) {
  return (
    <div className="mr-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800">
      <div className="mb-1 text-[11px] font-medium text-slate-400">AI</div>
      <div className="flex items-center gap-2 font-medium text-emerald-700">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        已等待 {seconds} 秒{detail ? `，${detail}` : ""}
      </div>
      {guide ? (
        <div className="mt-2 text-xs text-slate-600">{guide}</div>
      ) : null}
    </div>
  );
}

function ChatBubble({
  message,
  disabled,
  onAction,
}: {
  message: LessonChatMessage;
  disabled: boolean;
  onAction: (action: LessonChatAction) => void;
}) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 text-pretty text-sm leading-6",
        message.role === "user"
          ? "ml-10 bg-slate-950 text-white shadow-sm"
          : "mr-3 border border-slate-200 bg-white text-slate-800",
      )}
    >
      <div
        className={cn(
          "mb-1 text-[11px] font-medium",
          message.role === "user" ? "text-white/55" : "text-slate-400",
        )}
      >
        {message.role === "user" ? "你" : "AI"}
      </div>
      <RichTextContent
        contrast={message.role === "user"}
        text={message.content}
      />
      {isAssistant && message.actions?.length ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          {message.actions.map((action) => (
            <button
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
              disabled={disabled}
              key={action.id}
              onClick={() => onAction(action)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RichTextContent({
  text,
  contrast = false,
  variant = "chat",
}: {
  text: string;
  contrast?: boolean;
  variant?: "chat" | "outline";
}) {
  const lines = text.split("\n");

  return (
    <div
      className={cn(
        "space-y-2",
        variant === "outline" ? "text-sm leading-7 text-slate-700" : "",
      )}
    >
      {lines.map((line, index) => (
        <RichTextLine
          contrast={contrast}
          key={`${index}-${line}`}
          line={line}
          variant={variant}
        />
      ))}
    </div>
  );
}

function RichTextLine({
  line,
  contrast,
  variant,
}: {
  line: string;
  contrast: boolean;
  variant: "chat" | "outline";
}) {
  const trimmed = line.trim();
  if (!trimmed) return <div className="h-1" />;

  const outlineHeadingMatch = trimmed.match(
    /^(故事题目|参考来源|主要角色|故事目标|章节大纲|课堂适配|需要确认)[:：]\s*(.*)$/,
  );
  if (outlineHeadingMatch) {
    const [, label, value] = outlineHeadingMatch;
    return (
      <div
        className={cn(
          variant === "outline"
            ? "grid gap-1 border-b border-slate-100 pb-2 last:border-b-0"
            : "",
        )}
      >
        <div
          className={cn(
            "text-xs font-semibold",
            contrast ? "text-white/70" : "text-slate-500",
          )}
        >
          {label}
        </div>
        {value ? (
          <div
            className={cn(
              "text-pretty font-medium",
              contrast ? "text-white" : "text-slate-900",
            )}
          >
            {renderInlineMarkdown(value)}
          </div>
        ) : null}
      </div>
    );
  }

  if (/^\d+[.、]\s*/.test(trimmed)) {
    return (
      <div
        className={cn(
          "flex gap-2",
          contrast ? "text-white/90" : "text-slate-700",
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums",
            contrast ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600",
          )}
        >
          {trimmed.match(/^\d+/)?.[0]}
        </span>
        <span className="min-w-0 text-pretty">
          {renderInlineMarkdown(trimmed.replace(/^\d+[.、]\s*/, ""))}
        </span>
      </div>
    );
  }

  if (
    /^【\s*(Lesson Draft|Lesson Meta|Stage\s*\d+|Reading|Closing Reading|教师答案区\s*\/\s*Answer Key|Answer Key|答案区)\s*】/i.test(
      trimmed,
    )
  ) {
    return (
      <div
        className={cn(
          "pt-2 text-sm font-semibold",
          contrast ? "text-white" : "text-slate-950",
        )}
      >
        {renderInlineMarkdown(trimmed)}
      </div>
    );
  }

  if (
    /^(Story Title|Title|English Title|Teacher Tip|Level|Question Count|Vocabulary|Phrases)\s*[:：]/i.test(
      trimmed,
    )
  ) {
    const [label = "", ...rest] = trimmed.split(/[:：]/);
    return (
      <p
        className={cn(
          "text-pretty",
          contrast ? "text-white/90" : "text-slate-700",
        )}
      >
        <span
          className={cn(
            "font-semibold",
            contrast ? "text-white" : "text-slate-900",
          )}
        >
          {label}：
        </span>
        {renderInlineMarkdown(rest.join("：").trim())}
      </p>
    );
  }

  if (/^---+$/.test(trimmed))
    return (
      <div
        className={cn(
          "my-2 border-t",
          contrast ? "border-white/20" : "border-slate-200",
        )}
      />
    );

  return (
    <p
      className={cn(
        "text-pretty",
        contrast ? "text-white/90" : "text-slate-700",
      )}
    >
      {renderInlineMarkdown(trimmed)}
    </p>
  );
}

function StartForm({
  isSending,
  mode,
  onIdeaSubmit,
  onLibrarySubmit,
  onModeChange,
  onSelectedThemeChange,
  onIdeaTextChange,
  selectedTheme,
  ideaText,
  themePresets,
}: {
  isSending: boolean;
  mode: StartMode | null;
  onIdeaSubmit: () => void;
  onLibrarySubmit: () => void;
  onModeChange: (mode: StartMode) => void;
  onSelectedThemeChange: (theme: string) => void;
  onIdeaTextChange: (idea: string) => void;
  selectedTheme: string;
  ideaText: string;
  themePresets: PresetOption[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-950">
          这次教案从哪里开始？
        </h3>
        <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">
          先生成故事大纲，确认方向后再生成最终文案。
        </p>
        <div className="mt-4 grid gap-3">
          <button
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition",
              mode === "library"
                ? "border-slate-900 ring-2 ring-slate-100"
                : "border-slate-200 hover:border-slate-300",
            )}
            onClick={() => onModeChange("library")}
            type="button"
          >
            <Library className="mt-0.5 size-4 text-slate-700" />
            <span>
              <span className="block text-sm font-medium text-slate-950">
                从灵感库开始
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                选择一个主题灵感，让 AI 先生成一个可确认的大纲。
              </span>
            </span>
          </button>
          <button
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition",
              mode === "idea"
                ? "border-slate-900 ring-2 ring-slate-100"
                : "border-slate-200 hover:border-slate-300",
            )}
            onClick={() => onModeChange("idea")}
            type="button"
          >
            <MessageSquareText className="mt-0.5 size-4 text-slate-700" />
            <span>
              <span className="block text-sm font-medium text-slate-950">
                我有自己的想法
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                可以写原创点子，也可以写参考故事、历史人物、游戏角色或已有剧情。
              </span>
            </span>
          </button>
        </div>
      </div>

      {mode === "library" ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <BookOpenText className="size-4" />
            选择主题灵感
          </div>
          {themePresets.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {themePresets.map((preset) => (
                <button
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                    selectedTheme === preset.label
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                  )}
                  key={preset.id}
                  onClick={() => onSelectedThemeChange(preset.label)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              主题灵感库为空。可以先去主题库维护，或切换到“我有自己的想法”。
            </div>
          )}
          <Button
            className="mt-4 h-9 bg-slate-950 px-3 text-sm text-white hover:bg-slate-800"
            disabled={!selectedTheme || isSending}
            onClick={onLibrarySubmit}
            type="button"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            生成故事大纲
          </Button>
        </div>
      ) : null}

      {mode === "idea" ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label
            className="text-sm font-semibold text-slate-950"
            htmlFor="story-idea"
          >
            故事想法
          </label>
          <textarea
            className="mt-3 min-h-36 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            id="story-idea"
            onChange={(event) => onIdeaTextChange(event.target.value)}
            placeholder="例如：参考 Mozart 的成长经历，做一个适合 B1 学生的音乐冒险故事；或用瓦罗兰特角色做团队解谜故事。"
            value={ideaText}
          />
          <Button
            className="mt-4 h-9 bg-slate-950 px-3 text-sm text-white hover:bg-slate-800"
            disabled={!ideaText.trim() || isSending}
            onClick={onIdeaSubmit}
            type="button"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            生成故事大纲
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function analyzeDraftText(text: string): DraftIssue[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const issues: DraftIssue[] = [];
  const answerKeyPattern =
    /(?:【\s*(?:教师答案区\s*\/\s*Answer Key|Answer Key|答案区|教师答案区)\s*】|^Answer Key\s*:?\s*$)/im;
  const answerKeyMatch = trimmed.match(answerKeyPattern);
  const bodyText =
    answerKeyMatch?.index == null
      ? trimmed
      : trimmed.slice(0, answerKeyMatch.index);
  const answerKeyText =
    answerKeyMatch?.index == null
      ? ""
      : trimmed.slice(answerKeyMatch.index + answerKeyMatch[0].length);
  const questionNumbers = [...bodyText.matchAll(/\((\d{1,3})\)/g)].map(
    (match) => Number(match[1]),
  );
  const uniqueQuestionNumbers = [...new Set(questionNumbers)].sort(
    (left, right) => left - right,
  );

  if (!/【\s*Lesson Draft\s*】/i.test(trimmed)) {
    issues.push({ level: "blocker", message: "缺少【Lesson Draft】" });
  }

  if (!answerKeyMatch) {
    issues.push({
      level: "blocker",
      message: "缺少【教师答案区 / Answer Key】",
    });
  }

  if (!/【\s*Closing Reading\s*】/i.test(trimmed)) {
    issues.push({ level: "blocker", message: "缺少【Closing Reading】" });
  }

  if (uniqueQuestionNumbers.length > 0) {
    const missing = Array.from(
      { length: uniqueQuestionNumbers.at(-1) ?? 0 },
      (_, index) => index + 1,
    ).filter((number) => !uniqueQuestionNumbers.includes(number));
    if (missing.length > 0) {
      issues.push({
        level: "blocker",
        message: `题号可能不连续，缺少：${missing.slice(0, 8).join("、")}${missing.length > 8 ? "..." : ""}`,
      });
    }
  }

  if (answerKeyMatch && uniqueQuestionNumbers.length > 0) {
    const answerNumbers = [
      ...answerKeyText.matchAll(
        /^\s*(?:Answer\s*)?\(?(\d{1,3})\)?\s*(?:[.、:：]|\s+-\s+)/gim,
      ),
    ].map((match) => Number(match[1]));
    if (answerNumbers.length < uniqueQuestionNumbers.length) {
      issues.push({
        level: "blocker",
        message: `答案区覆盖不足：正文约 ${uniqueQuestionNumbers.length} 题，答案区识别到 ${answerNumbers.length} 条`,
      });
    }
  }

  const trailingExerciseLines = bodyText
    .split(/\r?\n/)
    .filter((line) =>
      /[.!?。！？]["”']?\s*\(\d{1,3}\)\s*(?:\[[VP]\d+\s*:|_{3,})/.test(line),
    );
  if (trailingExerciseLines.length > 0) {
    issues.push({
      level: "blocker",
      message: "有题目标记可能被放在句尾，需嵌入到句子中缺词的位置再进入 Step3",
    });
  }

  return issues.slice(0, 6);
}

function LessonTextPreview({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-slate-400">
        确认故事大纲后，最终文案会出现在这里。
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 p-6">
      <article className="mx-auto max-w-4xl rounded-lg bg-white px-7 py-6 text-sm leading-7 text-slate-700 shadow-sm ring-1 ring-slate-200">
        {text.split("\n").map((line, index) => (
          <PreviewLine key={`${index}-${line}`} line={line} />
        ))}
      </article>
    </div>
  );
}

function PreviewLine({ line }: { line: string }) {
  const trimmed = line.trim();

  if (!trimmed) return <div className="h-2" />;

  if (
    /^【\s*(Lesson Draft|Lesson Meta|Stage\s*\d+|Closing Reading)\s*】/i.test(
      trimmed,
    ) ||
    /^第[一二三四五六七八九十\d]+阶段[:：]/.test(trimmed)
  ) {
    return (
      <h3 className="border-t border-slate-100 pt-5 text-base font-semibold text-slate-950 first:border-t-0 first:pt-0">
        {renderInlineMarkdown(trimmed)}
      </h3>
    );
  }

  if (/^Teacher Tip\s*[:：]|语法提示[:：]/.test(trimmed)) {
    return (
      <p className="rounded-md border-l-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  if (
    /^【\s*(教师答案区\s*\/\s*Answer Key|Answer Key|答案区)\s*】|^Answer Key/i.test(
      trimmed,
    )
  ) {
    return (
      <h3 className="border-t border-slate-100 pt-5 text-base font-semibold text-amber-700">
        {renderInlineMarkdown(trimmed)}
      </h3>
    );
  }

  if (/^S\d+\s*[:：]/.test(trimmed)) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-1.5 font-mono text-[13px] leading-7 text-slate-700">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  return (
    <p className="text-pretty text-slate-700">
      {renderInlineMarkdown(trimmed)}
    </p>
  );
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
