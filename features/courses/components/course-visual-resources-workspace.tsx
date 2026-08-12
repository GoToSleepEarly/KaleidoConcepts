"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, History, ImageIcon, Pencil, RefreshCw, Send, Sparkles, Upload, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CharacterVisualIntent, CourseCharacterVisual, CourseImageQuality, CourseVisualAsset, CourseVisualImageSlot, CourseVisualResourcesState } from "@/lib/contracts/api";
import { hasInFlightVisualVersion, needsInitialVisualGeneration } from "@/lib/domain/visual-resource-status";
import { cn } from "@/lib/utils";
import { CourseCreateSteps, courseStageStep } from "./course-create-steps";

const qualityOptions: Array<{ value: CourseImageQuality; label: string }> = [
  { value: "low", label: "中" },
  { value: "medium", label: "高" },
  { value: "high", label: "极高" },
];

function requestKey() {
  return crypto.randomUUID();
}

export function showsImageGenerationWait(pending: string | null) {
  return Boolean(pending && ["slot:", "generate:", "refine:"].some((prefix) => pending.startsWith(prefix)));
}

function statusLabel(status: CourseVisualAsset["status"]) {
  if (status === "pending" || status === "submitting" || status === "generating") return "生成中";
  if (status === "succeeded") return "已生成";
  return "生成失败";
}

function qualityLabel(quality: CourseImageQuality) {
  return qualityOptions.find((option) => option.value === quality)?.label ?? "高";
}

function hasSuccessfulVersion(slot: CourseVisualImageSlot) {
  return slot.versions.some((asset) => asset.status === "succeeded");
}

function slotStatusLabel(slot: CourseVisualImageSlot | null) {
  if (!slot) return "待资源方案";
  if (slot.activeAssetId) return "已采用";
  if (hasSuccessfulVersion(slot)) return "待采用";
  if (hasInFlightVisualVersion(slot.versions)) return "生成中";
  if (slot.versions.some((asset) => asset.status === "failed")) return "生成失败";
  return "待生成";
}

function characterReady(character: CourseCharacterVisual) {
  if (character.sourceType === "original") return true;
  if (character.sourceType === "referenced" && character.intent === "originalize") return true;
  if (character.sourceType === "person") return Boolean(character.personVisualUrl);
  return Boolean(character.activeAssetId);
}

function WorkflowStage({ active, done, label, value }: { active: boolean; done: boolean; label: string; value: string }) {
  return (
    <div className={cn("min-w-0 border-l-2 pl-3", active ? "border-primary" : done ? "border-emerald-500" : "border-border")}>
      <p className={cn("truncate text-xs font-medium", active ? "text-primary" : done ? "text-emerald-700" : "text-muted-foreground")}>{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function QualitySelector({ disabled, onChange, value }: { disabled: boolean; onChange: (quality: CourseImageQuality) => void; value: CourseImageQuality }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">画面质量</span>
      <div aria-label="画面质量" className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="radiogroup">
        {qualityOptions.map((option) => (
          <button
            aria-checked={value === option.value}
            className={cn("min-h-8 rounded-md px-3 text-xs font-medium transition-colors", value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}{option.value === "medium" ? "（默认）" : ""}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">仅影响之后的生成</span>
    </div>
  );
}

function PromptDisclosure({ defaultOpen, prompt }: { defaultOpen: boolean; prompt: string }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!prompt) return null;
  return (
    <div className="rounded-lg border bg-muted/30">
      <button aria-expanded={open} className="flex min-h-10 w-full items-center justify-between gap-3 px-3 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setOpen((value) => !value)} type="button">
        <span>查看 Prompt</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t px-3 py-3 font-sans text-xs leading-5 text-muted-foreground">{prompt}</pre> : null}
    </div>
  );
}

function EmptyImagePreview({ generating, label }: { generating: boolean; label: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 text-center text-muted-foreground">
      <ImageIcon className={cn("size-8", generating && "animate-pulse text-primary")} />
      <p className="text-sm">{generating ? "生成中，预计 1–3 分钟" : label}</p>
    </div>
  );
}

function AssetWorkspace({
  courseId,
  activeAssetId,
  versions,
  disabled,
  onChanged,
  onRegenerate,
  regenerateLabel,
  run,
}: {
  courseId: string;
  activeAssetId: string | null;
  versions: CourseVisualAsset[];
  disabled: boolean;
  onChanged: () => Promise<void>;
  onRegenerate: () => void;
  regenerateLabel: string;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
}) {
  const initialSelectedId = activeAssetId ?? versions.findLast((asset) => asset.status === "succeeded")?.id ?? versions.at(-1)?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const selected = versions.find((asset) => asset.id === selectedId) ?? versions.find((asset) => asset.id === activeAssetId) ?? versions.at(-1) ?? null;
  const succeededVersions = versions.filter((asset) => asset.status === "succeeded" && asset.publicUrl);
  const generating = hasInFlightVisualVersion(versions);

  if (!selected) return null;
  const selectedAsset = selected;

  async function selectAsset() {
    await run(`select:${selectedAsset.id}`, async () => {
      const response = await fetch(`/api/courses/${courseId}/visual-resources/assets/${selectedAsset.id}/select`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "采用图片失败");
      await onChanged();
    });
  }

  async function refine() {
    const value = instruction.trim();
    if (!value) return;
    await run(`refine:${selectedAsset.id}`, async () => {
      const response = await fetch(`/api/courses/${courseId}/visual-resources/assets/${selectedAsset.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey() },
        body: JSON.stringify({ instruction: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "修改图片失败");
      setInstruction("");
      setSelectedId(data.id);
      await onChanged();
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted">
        {selected.publicUrl ? <Image alt="当前查看的图片版本" className="object-cover" fill sizes="(max-width: 1024px) 100vw, 760px" src={selected.publicUrl} unoptimized /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{statusLabel(selected.status)}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={selected.status === "succeeded" ? "success" : selected.status === "failed" ? "destructive" : "secondary"}>{statusLabel(selected.status)}</Badge>
          <span className="text-xs text-muted-foreground">质量：{qualityLabel(selected.quality)}</span>
          {activeAssetId === selected.id ? <Badge variant="outline"><Check className="mr-1 size-3" />当前采用</Badge> : selected.status === "succeeded" ? <Button disabled={disabled} onClick={selectAsset} size="sm" variant="outline">采用此版本</Button> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.status === "succeeded" ? <Button disabled={disabled} onClick={() => setEditing((value) => !value)} size="sm" variant="ghost"><Pencil />编辑图片</Button> : null}
          <Button disabled={disabled || generating} onClick={onRegenerate} size="sm" variant="outline"><RefreshCw className={cn(generating && "animate-spin")} />{generating ? "生成中" : regenerateLabel}</Button>
        </div>
      </div>

      {selected.failureReason ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{selected.failureReason}</p> : null}

      {editing && selected.status === "succeeded" ? (
        <div className="rounded-lg border bg-muted/30 p-3">
          <label className="text-sm font-medium">修改当前版本
            <textarea className="mt-2 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" disabled={disabled} maxLength={500} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：把背景改成黄昏" value={instruction} />
          </label>
          <div className="mt-2 flex justify-end"><Button disabled={disabled || !instruction.trim()} onClick={refine} size="sm"><Send />提交修改</Button></div>
        </div>
      ) : null}

      {succeededVersions.length > 1 ? (
        <details className="group rounded-lg border bg-muted/20">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-2"><History className="size-4" />历史版本（{succeededVersions.length}）</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div aria-label="成功图片版本" className="flex gap-2 overflow-x-auto border-t p-3">
            {succeededVersions.map((asset) => (
              <button aria-label={`查看 ${asset.createdAt} 生成的版本`} className={cn("relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border-2 bg-muted", selected.id === asset.id ? "border-primary" : "border-transparent")} key={asset.id} onClick={() => setSelectedId(asset.id)} type="button">
                <Image alt="" className="object-cover" fill sizes="112px" src={asset.publicUrl!} unoptimized />
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function CourseVisualResourcesWorkspace({ initialState }: { initialState: CourseVisualResourcesState }) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch(`/api/courses/${state.course.id}/visual-resources`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "视觉资源加载失败");
    setState(data);
  }

  const hasServerGeneration = state.slots.some((slot) => hasInFlightVisualVersion(slot.versions));

  useEffect(() => {
    if (!hasServerGeneration) return;
    let active = true;
    const timer = window.setInterval(() => {
      void fetch(`/api/courses/${state.course.id}/visual-resources`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (active && response.ok) setState(data);
        })
        .catch(() => undefined);
    }, 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [hasServerGeneration, state.course.id]);

  async function run(key: string, action: () => Promise<void>) {
    if (pending) return;
    setPending(key);
    setError(null);
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请重试"); }
    finally { setPending(null); }
  }

  async function jsonAction(key: string, url: string, method: "POST" | "PATCH", body?: unknown, paid = false) {
    await run(key, async () => {
      const response = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(paid ? { "Idempotency-Key": requestKey() } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "操作失败，请重试");
      await refresh();
    });
  }

  function generateSlot(slotId: string) {
    void jsonAction(`slot:${slotId}`, `/api/courses/${state.course.id}/visual-resources/images/generate`, "POST", { scope: "slot", slotId }, true);
  }

  async function uploadReference(characterId: string, file: File) {
    await run(`upload:${characterId}`, async () => {
      const form = new FormData();
      form.set("image", file);
      const response = await fetch(`/api/courses/${state.course.id}/visual-resources/characters/${characterId}/reference`, { method: "POST", headers: { "Idempotency-Key": requestKey() }, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "外形参考保存失败");
      await refresh();
    });
  }

  async function enterPreview() {
    await run("confirm", async () => {
      const response = await fetch(`/api/courses/${state.course.id}/visual-resources/confirm`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "无法进入预览发布");
      window.location.assign(data.redirectUrl);
    });
  }

  const disabled = pending !== null;
  const coverSlot = state.slots.find((slot) => slot.slotType === "visual_cover") ?? null;
  const lessonSlots = state.slots.filter((slot) => slot.slotType === "lesson_shot");
  const missingSlots = state.slots.filter(needsInitialVisualGeneration);
  const inFlightSlotCount = state.slots.filter((slot) => hasInFlightVisualVersion(slot.versions)).length;
  const incompleteSlotCount = state.slots.filter((slot) => !slot.activeAssetId).length;
  const canEnterPreview = inFlightSlotCount === 0;
  const previewStatusMessage = inFlightSlotCount > 0
      ? `还有 ${inFlightSlotCount} 张图片正在生成，全部完成后才能预览发布`
      : !state.planReady || !state.slots.length
        ? "尚未生成课程图片，将使用占位图继续预览发布"
        : incompleteSlotCount > 0
          ? `还有 ${incompleteSlotCount} 张图片未完成，将使用占位图继续预览发布`
          : "课程图片已就绪，可以进入预览发布";
  const chapterGroups = useMemo(() => Array.from(lessonSlots.reduce((groups, slot) => {
    const key = slot.chapterId ?? "unknown";
    const group = groups.get(key) ?? { id: key, order: slot.chapterOrder ?? groups.size + 1, title: slot.chapterTitle ?? "未命名章节", slots: [] as CourseVisualImageSlot[] };
    group.slots.push(slot);
    groups.set(key, group);
    return groups;
  }, new Map<string, { id: string; order: number; title: string; slots: CourseVisualImageSlot[] }>()).values()).sort((a, b) => a.order - b.order), [lessonSlots]);

  const rolesReady = state.characters.every(characterReady);
  const readyRoleCount = state.characters.filter(characterReady).length;
  const adoptedLessonCount = lessonSlots.filter((slot) => slot.activeAssetId).length;
  const coverDone = Boolean(coverSlot?.activeAssetId);
  const chaptersDone = lessonSlots.length > 0 && adoptedLessonCount === lessonSlots.length;
  const activeWorkflowStage = !rolesReady ? 1 : !state.planReady ? 2 : !coverDone ? 3 : 4;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <CourseCreateSteps courseId={state.course.id} currentStep={5} furthestStep={courseStageStep(state.course.currentStage)} onNavigate={(href) => window.location.assign(href)} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-primary">阶段五</p><h1 className="text-2xl font-semibold tracking-tight">视觉资源</h1><p className="mt-1 text-sm text-muted-foreground">确认角色外形，再按旧版流程完成资源方案、封面和章节插图。</p></div>
        <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/courses/${state.course.id}/create/content`}><ChevronLeft />返回文案与练习</Link></Button><Button disabled={disabled || !canEnterPreview} loading={pending === "confirm"} onClick={enterPreview}><Send />进入预览发布</Button></div>
      </header>

      {error ? <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert"><span className="min-w-0 break-words">{error}</span><button aria-label="关闭错误提示" className="shrink-0 underline" onClick={() => setError(null)} type="button">关闭</button></div> : null}
      {showsImageGenerationWait(pending) ? <div aria-live="polite" className="rounded-xl border border-primary/20 bg-primary-50 px-4 py-3 text-sm text-primary-700">生成请求已提交，图片通常需要 1–3 分钟，请保持页面打开。</div> : null}

      <Card>
        <CardContent className="space-y-5 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-sm font-semibold">图片生成流程</p><p className="mt-1 text-xs text-muted-foreground">主路径按顺序推进，完成项仍可返回调整。</p></div>
            <QualitySelector disabled={disabled} onChange={(quality) => void jsonAction(`quality:${quality}`, `/api/courses/${state.course.id}/visual-resources/settings`, "PATCH", { quality })} value={state.quality} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <WorkflowStage active={activeWorkflowStage === 1} done={rolesReady} label="1 · 角色确认" value={`${readyRoleCount}/${state.characters.length} 已确认`} />
            <WorkflowStage active={activeWorkflowStage === 2} done={state.planReady} label="2 · 资源方案" value={state.planReady ? "已生成" : "待生成"} />
            <WorkflowStage active={activeWorkflowStage === 3} done={state.planReady && coverDone} label="3 · 视觉封面" value={state.planReady ? slotStatusLabel(coverSlot) : "待资源方案"} />
            <WorkflowStage active={activeWorkflowStage === 4} done={state.planReady && chaptersDone} label="4 · 章节插图" value={state.planReady ? lessonSlots.length ? `${adoptedLessonCount}/${lessonSlots.length} 张已采用` : "待生成" : "待资源方案"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>第一步：确认角色外形</CardTitle><CardDescription>参考图只固定脸型、发型和体态；服装、动作与画风由本课造型统一控制。</CardDescription></div><Badge variant={rolesReady ? "success" : "secondary"}>{readyRoleCount}/{state.characters.length} 已确认</Badge></div></CardHeader>
        <CardContent className="divide-y rounded-xl border px-4">
          {state.characters.map((character) => {
            const ready = characterReady(character);
            const usesTextDesign = character.sourceType === "original" || (character.sourceType === "referenced" && character.intent === "originalize");
            const status = usesTextDesign ? "使用文字设定" : ready ? "外形参考已就绪" : "需要上传参考图";
            const previewUrl = character.sourceType === "person" ? character.personVisualUrl : character.activeAsset?.publicUrl ?? character.versions.findLast((asset) => asset.status === "succeeded")?.publicUrl;
            return (
              <div className="py-4" key={character.characterId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                    {previewUrl ? <Image alt={`${character.displayName} 的外形参考`} className="object-cover" fill sizes="56px" src={previewUrl} unoptimized /> : <UserRound className="size-6" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{character.displayName}</p><Badge variant={ready ? "success" : "secondary"}>{status}</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{character.sourceType === "person" ? "人物档案角色" : character.sourceType === "referenced" ? "外部引用角色" : "原创角色"}</p>
                    {character.storyVisualDesign ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground"><span className="font-medium text-foreground">本课造型：</span>{character.storyVisualDesign}</p> : <p className="mt-2 text-xs text-muted-foreground">生成资源方案后补充本课服装与造型设定。</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-sm sm:justify-end">
                    {character.sourceType === "referenced" ? (["preserve_identity", "originalize"] as CharacterVisualIntent[]).map((intent) => <button className={cn("min-h-9 rounded-lg border px-3 text-xs font-medium", character.intent === intent ? "border-primary bg-primary-50 text-primary-700" : "bg-card hover:bg-muted")} disabled={disabled} key={intent} onClick={() => void jsonAction(`intent:${character.characterId}`, `/api/courses/${state.course.id}/visual-resources/characters/${character.characterId}/intent`, "PATCH", { intent })} type="button">{intent === "preserve_identity" ? "保持原形象" : "课堂原创化"}</button>) : null}
                    {character.sourceType === "person" ? <Button disabled={disabled} onClick={() => void jsonAction(`latest:${character.characterId}`, `/api/courses/${state.course.id}/visual-resources/characters/${character.characterId}/use-latest-person-visual`, "POST")} size="sm" variant="outline"><RefreshCw />使用最新形象</Button> : null}
                    {character.sourceType !== "person" && character.intent === "preserve_identity" ? <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-xs font-medium hover:border-primary hover:bg-primary-50"><Upload className="size-4" />{ready ? "更换参考图" : "选择参考图"}<input accept="image/jpeg,image/png,image/webp" aria-label="选择参考图" className="sr-only" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReference(character.characterId, file); event.currentTarget.value = ""; }} type="file" /></label> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {!state.planReady ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary-50 text-primary"><Sparkles className="size-6" /></div>
            <h2 className="text-lg font-semibold">第二步：生成资源方案</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">生成全课统一角色造型、封面和段落图片 Prompt；这一步不产生图片费用。</p>
            {!rolesReady ? <p className="mt-3 text-sm font-medium text-amber-700">请先补齐需要保持身份的角色外形参考。</p> : null}
            <Button className="mt-5" disabled={disabled || !rolesReady} loading={pending === "plan"} onClick={() => void jsonAction("plan", `/api/courses/${state.course.id}/visual-resources/plan/generate`, "POST")}><Sparkles />生成资源方案</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">第二步：资源方案已生成</p><p className="mt-1 text-sm text-muted-foreground">1 张封面 · {chapterGroups.length} 章 · {lessonSlots.length} 张段落插图</p></div>
            <Button disabled={disabled || !rolesReady} loading={pending === "plan"} onClick={() => void jsonAction("plan", `/api/courses/${state.course.id}/visual-resources/plan/generate`, "POST")} size="sm" variant="outline"><RefreshCw />更新资源方案</Button>
          </CardContent>
        </Card>
      )}

      {state.planReady && coverSlot ? (
        <Card>
          <CardHeader className="pb-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle>第三步：视觉封面</CardTitle><CardDescription className="mt-2 line-clamp-2">{coverSlot.sourceText}</CardDescription></div><Badge variant={coverDone ? "success" : hasSuccessfulVersion(coverSlot) ? "warning" : "secondary"}>{slotStatusLabel(coverSlot)}</Badge></div></CardHeader>
          <CardContent className="space-y-3">
            {coverSlot.versions.length ? <AssetWorkspace activeAssetId={coverSlot.activeAssetId} courseId={state.course.id} disabled={disabled} onChanged={refresh} onRegenerate={() => generateSlot(coverSlot.id)} regenerateLabel="重新生成封面" run={run} versions={coverSlot.versions} /> : <><EmptyImagePreview generating={pending === `slot:${coverSlot.id}`} label="尚未生成视觉封面" /><Button disabled={disabled} loading={pending === `slot:${coverSlot.id}`} onClick={() => generateSlot(coverSlot.id)} size="sm"><ImageIcon />生成封面</Button></>}
            <PromptDisclosure defaultOpen={!hasSuccessfulVersion(coverSlot)} prompt={coverSlot.prompt} />
          </CardContent>
        </Card>
      ) : null}

      {state.planReady && lessonSlots.length ? (
        <Card>
          <CardHeader className="pb-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle>第四步：章节插图</CardTitle><CardDescription>按章节核对正文和 Prompt，可生成单张、本章或全部缺失图片。</CardDescription></div>{missingSlots.some((slot) => slot.slotType === "lesson_shot") ? <Button disabled={disabled} loading={pending === "generate:all"} onClick={() => void jsonAction("generate:all", `/api/courses/${state.course.id}/visual-resources/images/generate`, "POST", { scope: "all" }, true)} size="sm"><Sparkles />生成全部缺失图片</Button> : null}</div></CardHeader>
          <CardContent className="space-y-7">
            {chapterGroups.map((chapter) => {
              const chapterMissing = chapter.slots.filter(needsInitialVisualGeneration);
              const adopted = chapter.slots.filter((slot) => slot.activeAssetId).length;
              return (
                <section className="space-y-4" key={chapter.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">第 {chapter.order} 章 · {chapter.title}</h3><p className="mt-1 flex gap-1 text-xs text-muted-foreground"><span>{adopted}/{chapter.slots.length} 张已采用</span><span>·</span><span>{chapter.slots.length} 张段落插图</span></p></div>{chapterMissing.length ? <Button disabled={disabled} loading={pending === `generate:${chapter.id}`} onClick={() => void jsonAction(`generate:${chapter.id}`, `/api/courses/${state.course.id}/visual-resources/images/generate`, "POST", { scope: "chapter", chapterId: chapter.id }, true)} size="sm" variant="outline"><Sparkles />生成本章</Button> : null}</div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {chapter.slots.map((slot, index) => (
                      <article className="min-w-0 overflow-hidden rounded-xl border bg-card" key={slot.id}>
                        <div className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">第 {index + 1} 段插图</p><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{slot.sourceText}</p></div><Badge className="shrink-0" variant={slot.activeAssetId ? "success" : hasSuccessfulVersion(slot) ? "warning" : "secondary"}>{slotStatusLabel(slot)}</Badge></div>
                          {slot.versions.length ? <AssetWorkspace activeAssetId={slot.activeAssetId} courseId={state.course.id} disabled={disabled} onChanged={refresh} onRegenerate={() => generateSlot(slot.id)} regenerateLabel="重新生成" run={run} versions={slot.versions} /> : <><EmptyImagePreview generating={pending === `slot:${slot.id}` || pending === `generate:${chapter.id}` || pending === "generate:all"} label="尚未生成本段插图" /><Button disabled={disabled} loading={pending === `slot:${slot.id}`} onClick={() => generateSlot(slot.id)} size="sm"><ImageIcon />生成本张</Button></>}
                          <PromptDisclosure defaultOpen={!hasSuccessfulVersion(slot)} prompt={slot.prompt} />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p aria-live="polite" className={cn("text-sm", canEnterPreview ? "text-muted-foreground" : "text-amber-700")}>{pending ? "正在保存当前操作…" : previewStatusMessage}</p><div className="flex gap-2"><Button disabled={disabled} onClick={() => window.location.assign(`/courses/${state.course.id}/create/content`)} variant="outline"><ChevronLeft />上一步</Button><Button disabled={disabled || !canEnterPreview} loading={pending === "confirm"} onClick={enterPreview}><Send />下一步：预览发布</Button></div></div>
    </main>
  );
}
