"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, MessageSquareText, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  CourseSourceReference,
  CourseStoryChatAction,
  CourseStoryMessageInput,
  CourseStoryOutline,
  CourseStoryOutlineState,
  CourseAudiencePerson,
  StoryWritingProvider,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

export function CourseStoryOutlineWorkspace({ initialState }: { initialState: CourseStoryOutlineState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [mode, setMode] = useState<"idea" | "random">("idea");
  const [message, setMessage] = useState("");
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setPendingSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  async function postMessage(input: CourseStoryMessageInput, label = "正在处理...") {
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel(label);
    setError("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, chapterCount, writingProvider }),
      });
      const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
      if (!response.ok) throw new Error(data.message || "故事大纲生成失败");
      setState(data);
      setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事大纲生成失败");
    } finally {
      setPending(false);
      setPendingSeconds(0);
      setPendingLabel("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "idea" && !message.trim()) return;
    const randomPrompt = mode === "random" ? [`主题：${theme}`, `故事类型：${storyType}`, `氛围：${tone}`, message.trim()].filter(Boolean).join("\n") : message.trim();
    await postMessage({ message: randomPrompt, mode }, mode === "random" ? "正在生成故事方向..." : "正在分析故事要求...");
  }

  async function confirm() {
    setPendingSeconds(0);
    setPending(true);
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
    }
  }

  function continueModify(prefix: "帮我修改：" | "我补充资料：") {
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
    const label = action.action === "choose_reference_search" || action.action === "request_reference_search"
      ? "正在整理参考资料..."
      : "正在生成故事大纲...";
    await postMessage({ message: message.trim(), mode: "idea", action: action.action, targetId: action.targetId }, label);
  }

  async function resetStep() {
    if (!window.confirm("重新开始会清空 Step 2 当前聊天历史、参考资料和故事大纲，是否继续？")) return;
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "故事大纲重置失败");
    } finally {
      setPending(false);
      setPendingSeconds(0);
      setPendingLabel("");
    }
  }

  async function saveReference(referenceId: string, payload: Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">) {
    setPendingSeconds(0);
    setPending(true);
    setPendingLabel("正在保存参考资料...");
    setError("");
    try {
      const response = await fetch(`/api/courses/${state.course.id}/story-outline/reference-materials/${referenceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
      if (!response.ok) throw new Error(data.message || "参考资料保存失败");
      setState(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参考资料保存失败");
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
        <div className="flex gap-2">
          <Button disabled={pending} onClick={resetStep} type="button" variant="outline">重新开始</Button>
          <Button disabled={!state.outline || pending} onClick={confirm} type="button">确认进入教学规划</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.35fr)]">
        <section className="flex min-h-[680px] flex-col rounded-lg bg-card shadow-sm">
          <div className="border-b border-border p-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <button className={modeClass(mode === "idea")} onClick={() => setMode("idea")} type="button">我有想法</button>
              <button className={modeClass(mode === "random")} onClick={() => setMode("random")} type="button">随机灵感</button>
            </div>
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
            {mode === "random" ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
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
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {state.chatMessages.length ? state.chatMessages.map((chat) => (
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
            )) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                <MessageSquareText className="mx-auto mb-2 size-5" />
                输入故事想法，或让系统先给出几个方向。
              </div>
            )}
            {pending && pendingLabel ? (
              <article className="mr-10 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                <p className="flex items-center gap-2 leading-6">
                  <Loader2 className="size-4 animate-spin" />
                  {loadingText(pendingLabel, pendingSeconds)}
                </p>
              </article>
            ) : null}
          </div>

          <form className="border-t border-border p-4" onSubmit={submit}>
            <label className="block">
              <span className="sr-only">故事想法</span>
              <textarea
                aria-label="故事想法"
                className="min-h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                onChange={(event) => setMessage(event.target.value)}
                placeholder={mode === "idea" ? "例如：参考特朗普的一生讲个课程" : "可选补充：更想让学生参与、避开某类情节"}
                ref={inputRef}
                value={message}
              />
            </label>
            {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Button disabled={pending || (mode === "idea" && !message.trim())} type="submit">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {pending ? "处理中" : "发送"}
              </Button>
              {state.outline ? (
                <Button disabled={pending} onClick={() => postMessage({ message: message.trim(), mode: "revise", action: "regenerate_outline" }, "正在重新生成故事大纲...")} type="button" variant="outline">
                  重新生成
                </Button>
              ) : null}
            </div>
          </form>
        </section>

        <ResultPanel
          onChooseDirection={(directionId) => postMessage({ message: "", mode: "idea", action: "choose_direction", targetId: directionId }, "正在生成故事大纲...")}
          onSaveReference={saveReference}
          outline={state.outline}
          pendingLabel={loadingText(pendingLabel, pendingSeconds)}
          references={state.referenceMaterials}
          resultTab={resultTab}
          setResultTab={setResultTab}
          state={state}
        />
      </div>
    </div>
  );
}

function modeClass(active: boolean) {
  return cn("min-h-10 rounded-md px-3 text-sm font-medium", active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70");
}

function loadingText(label: string, seconds: number) {
  if (!label) return "";
  const suffix = seconds > 0 ? ` · ${seconds}s` : "";
  const hint = seconds >= 15 ? "，仍在生成，请不要关闭页面" : "";
  return `${label}${suffix}${hint}`;
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
  resultTab,
  setResultTab,
  onChooseDirection,
  onSaveReference,
}: {
  state: CourseStoryOutlineState;
  references: CourseSourceReference[];
  outline: CourseStoryOutline | null;
  pendingLabel: string;
  resultTab: "outline" | "characters" | "references";
  setResultTab: (tab: "outline" | "characters" | "references") => void;
  onChooseDirection: (directionId: string) => void;
  onSaveReference: (referenceId: string, payload: Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">) => void;
}) {
  if (outline) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <div className="flex gap-2 border-b border-border pb-3">
          <button className={tabClass(resultTab === "outline")} onClick={() => setResultTab("outline")} type="button">故事大纲</button>
          <button className={tabClass(resultTab === "characters")} onClick={() => setResultTab("characters")} type="button">角色</button>
          <button className={tabClass(resultTab === "references")} onClick={() => setResultTab("references")} type="button">参考资料</button>
        </div>
        {resultTab === "outline" ? <OutlineSummary outline={outline} /> : null}
        {resultTab === "characters" ? <CharactersSection coursePeople={state.coursePeople} outline={outline} /> : null}
        {resultTab === "references" ? (
          <div className="space-y-4">
            {references.length || outline.sourceReferences.length ? [...references, ...outline.sourceReferences.filter((reference) => !references.some((item) => item.id === reference.id))].map((reference) => (
              <ReferenceEditor key={reference.id} onSave={onSaveReference} reference={reference} />
            )) : <p className="text-sm text-muted-foreground">暂无参考资料</p>}
          </div>
        ) : null}
      </section>
    );
  }

  if (references.length) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">参考资料</h3>
        {references.map((reference) => <ReferenceEditor key={reference.id} onSave={onSaveReference} reference={reference} />)}
      </section>
    );
  }

  if (state.directions.length) {
    return (
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">故事方向</h3>
        {state.directions.map((direction) => (
          <article className="rounded-md border border-border p-4" key={direction.id}>
            <h4 className="text-sm font-semibold text-foreground">{direction.title}</h4>
            <p className="mt-2 text-sm text-muted-foreground">{direction.hook}</p>
            <p className="mt-2 text-xs text-muted-foreground">{direction.whyFits}</p>
            <Button className="mt-3" onClick={() => onChooseDirection(direction.id)} size="sm" type="button">选择这个方向</Button>
          </article>
        ))}
      </section>
    );
  }

  return (
    <section className="flex min-h-[680px] items-center justify-center rounded-lg bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
      {pendingLabel ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{pendingLabel}</span> : "还没有生成结果"}
    </section>
  );
}

function CardGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-sm font-semibold text-foreground">{title}</h4><div className="space-y-2">{children}</div></div>;
}

function OutlineSummary({ outline }: { outline: CourseStoryOutline }) {
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

function referenceSourceLabel(reference: CourseSourceReference) {
  if (reference.sourceStatus === "teacher_supplied" || reference.researchProvider === "none") return "老师补充";
  if (reference.researchProvider === "quickrouter_gpt") return "联网整理";
  return "信息不足";
}

function ReferenceEditor({
  reference,
  onSave,
}: {
  reference: CourseSourceReference;
  onSave: (referenceId: string, payload: Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">) => void;
}) {
  const [name, setName] = useState(reference.name);
  const [summary, setSummary] = useState(reference.summary);
  const [adaptationBoundary, setAdaptationBoundary] = useState(reference.adaptationBoundary);
  const [usableFacts, setUsableFacts] = useState(reference.usableFacts.join("\n"));
  const [avoidTopics, setAvoidTopics] = useState(reference.avoidTopics.join("\n"));
  const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
  return (
    <article className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{reference.name}</h4>
        <p className="mt-1 text-xs text-muted-foreground">资料来源：{referenceSourceLabel(reference)}</p>
      </div>
      <label className="block"><span className="text-xs text-muted-foreground">引用对象</span><input aria-label="引用对象" className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm" onChange={(event) => setName(event.target.value)} value={name} /></label>
      <label className="block"><span className="text-xs text-muted-foreground">资料摘要</span><textarea aria-label="资料摘要" className="mt-1 min-h-20 w-full rounded-md border border-input p-3 text-sm" onChange={(event) => setSummary(event.target.value)} value={summary} /></label>
      <label className="block"><span className="text-xs text-muted-foreground">可用要点</span><textarea aria-label="可用要点" className="mt-1 min-h-20 w-full rounded-md border border-input p-3 text-sm" onChange={(event) => setUsableFacts(event.target.value)} value={usableFacts} /></label>
      <label className="block"><span className="text-xs text-muted-foreground">避开内容</span><textarea aria-label="避开内容" className="mt-1 min-h-20 w-full rounded-md border border-input p-3 text-sm" onChange={(event) => setAvoidTopics(event.target.value)} value={avoidTopics} /></label>
      <label className="block"><span className="text-xs text-muted-foreground">改编边界</span><textarea aria-label="改编边界" className="mt-1 min-h-20 w-full rounded-md border border-input p-3 text-sm" onChange={(event) => setAdaptationBoundary(event.target.value)} value={adaptationBoundary} /></label>
      <Button onClick={() => onSave(reference.id, {
        name,
        type: reference.type,
        sourceStatus: reference.sourceStatus,
        summary,
        usableFacts: lines(usableFacts),
        avoidTopics: lines(avoidTopics),
        adaptationBoundary,
      })} size="sm" type="button">保存参考资料</Button>
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
