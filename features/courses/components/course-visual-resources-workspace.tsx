"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, History, ImageIcon, List, LoaderCircle, Pencil, RefreshCw, Send, Settings2, Sparkles, Upload, UserRound } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { CourseCharacterVisual, CourseImageQuality, CourseVisualAsset, CourseVisualImageSlot, CourseVisualResourcesState } from "@/lib/contracts/api";
import { hasInFlightVisualVersion, needsInitialVisualGeneration } from "@/lib/domain/visual-resource-status";
import { cn } from "@/lib/utils";
import { createRequestId } from "@/lib/utils/request-id";
import { CourseCreateSteps, courseStageStep } from "./course-create-steps";
import { CourseStaleNotice } from "./course-stale-notice";

const qualityOptions: Array<{ value: CourseImageQuality; label: string }> = [
  { value: "low", label: "中" },
  { value: "medium", label: "高" },
  { value: "high", label: "极高" },
];
const CHARACTER_PAGE_SIZE = 6;

function formatElapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function TimedOperationStatus({ description, embedded = false, startedAt, title }: { description: string; embedded?: boolean; startedAt?: string | null; title: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const parsedStartedAt = startedAt ? Date.parse(startedAt) : Number.NaN;
    const startTime = Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now();
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1_000)));
    const initialTimer = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [startedAt]);

  return (
    <div aria-live="polite" className={cn(embedded ? "flex h-full items-center justify-center bg-primary-50/60 px-5 py-4" : "rounded-xl border border-primary/20 bg-primary-50/60 px-4 py-4")} role="status">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-pretty text-sm leading-6 text-muted-foreground">{description}</p>
          <p className="flex items-center gap-1.5 pt-1 text-xs font-medium tabular-nums text-primary-700">
            <Clock3 aria-hidden="true" className="size-3.5" />
            已等待 {formatElapsedTime(elapsedSeconds)}
          </p>
        </div>
      </div>
    </div>
  );
}

function VisualPlanLoading({ originalizing = false }: { originalizing?: boolean }) {
  return <TimedOperationStatus description={originalizing ? "正在替换原作角色的视觉设定，并同步更新封面和章节图片方案；故事正文和历史图片会保留。" : "正在整理角色形象、封面构图和章节图片方案。通常需要 1–3 分钟，角色或章节较多时可能更久；系统仍在处理中，无需重复点击。"} title={originalizing ? "正在生成原创视觉设定" : "正在生成视觉方案"} />;
}

function VisualPlanSummary({ characterCount, chapterCount, imageCount }: { characterCount: number; chapterCount: number; imageCount: number }) {
  return (
    <section aria-label="视觉方案成果" className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/55">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Check aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">视觉方案已生成</p>
          <p className="mt-0.5 text-sm text-muted-foreground">接下来可以检查角色形象并生成视觉封面。</p>
        </div>
      </div>
      <div className="grid border-t border-emerald-200/80 bg-white/55 sm:grid-cols-3">
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">角色形象</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{characterCount} 个角色</p>
        </div>
        <div className="border-t border-emerald-100 px-4 py-3 sm:border-l sm:border-t-0">
          <p className="text-xs text-muted-foreground">视觉封面</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">1 张封面方案</p>
        </div>
        <div className="border-t border-emerald-100 px-4 py-3 sm:border-l sm:border-t-0">
          <p className="text-xs text-muted-foreground">章节图片</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {imageCount} 张章节图片方案 · {chapterCount} 章
          </p>
        </div>
      </div>
    </section>
  );
}

function requestKey() {
  return createRequestId();
}

class AmbiguousMutationError extends Error {}

async function mutationRequest(url: string, init: RequestInit, fallbackMessage: string) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new AmbiguousMutationError("网络连接中断，无法确认操作结果");
  }
  let data: { message?: string; code?: string; retrySafe?: boolean };
  try {
    data = await response.json();
  } catch {
    throw new AmbiguousMutationError("服务响应中断，无法确认操作结果");
  }
  if (!response.ok) {
    const message = data.message || fallbackMessage;
    if (data.code === "invalid_ai_response" && data.retrySafe) throw new Error(message);
    if (response.status === 408 || response.status === 429 || response.status >= 500) throw new AmbiguousMutationError(message);
    throw new Error(message);
  }
  return data;
}

export function showsImageGenerationWait(pending: string | null) {
  return Boolean(pending && ["slot:", "generate:", "refine:"].some((prefix) => pending.startsWith(prefix)));
}

export function shouldPollVisualResources(pending: string | null, hasServerGeneration: boolean) {
  return hasServerGeneration || showsImageGenerationWait(pending);
}

function visualStateFingerprint(state: CourseVisualResourcesState) {
  return JSON.stringify({
    planRevision: state.planRevision,
    confirmedCoverAssetId: state.confirmedCoverAssetId,
    characters: state.characters.map((character) => [character.characterId, character.activeAssetId, character.status, character.versions.map((asset) => [asset.id, asset.status])]),
    slots: state.slots.map((slot) => [slot.id, slot.activeAssetId, slot.versions.map((asset) => [asset.id, asset.status])]),
  });
}

function statusLabel(status: CourseVisualAsset["status"]) {
  if (["pending", "submitting", "generating"].includes(status)) return "生成中";
  if (status === "succeeded") return "已生成";
  return "生成失败";
}

function qualityLabel(quality: CourseImageQuality) {
  return qualityOptions.find((option) => option.value === quality)?.label ?? "高";
}

function findLastCompat<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (predicate(item)) return item;
  }
  return null;
}

function latestVersionForRevision(versions: CourseVisualAsset[], revision: number | null) {
  return findLastCompat(versions, (asset) => revision === null || asset.planRevision === revision);
}

function hasCurrentFailure(slot: CourseVisualImageSlot, revision: number | null) {
  return latestVersionForRevision(slot.versions, revision)?.status === "failed";
}

function slotStatusLabel(slot: CourseVisualImageSlot | null, revision: number | null) {
  if (!slot) return "待视觉方案";
  if (hasInFlightVisualVersion(slot.versions, revision)) return "生成中";
  if (hasCurrentFailure(slot, revision)) return "生成失败";
  if (slot.activeAssetId && slot.versions.some((asset) => asset.id === slot.activeAssetId && (revision === null || asset.planRevision === revision))) return "已完成";
  return "待生成";
}

function QualitySelector({ disabled, onChange, value }: { disabled: boolean; onChange: (quality: CourseImageQuality) => void; value: CourseImageQuality }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">画面质量</span>
      <div aria-label="画面质量" className="inline-flex rounded-lg border bg-muted p-1" role="radiogroup">
        {qualityOptions.map((option) => (
          <button aria-checked={value === option.value} className={cn("min-h-8 rounded-md border px-3 text-xs font-medium", value === option.value ? "border-primary bg-primary-50 text-primary-700" : "border-transparent text-muted-foreground hover:bg-background")} disabled={disabled} key={option.value} onClick={() => onChange(option.value)} role="radio" type="button">
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageGenerationConcurrencySelector({ disabled, onChange, value }: { disabled: boolean; onChange: (concurrency: number) => void; value: number }) {
  return (
    <label className="flex flex-wrap items-center gap-2" htmlFor="image-generation-concurrency">
      <span className="text-xs font-medium text-muted-foreground">同时生成图片数</span>
      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" disabled={disabled} id="image-generation-concurrency" onChange={(event) => onChange(Number(event.target.value))} value={value}>
        {[1, 2, 3, 4, 5].map((concurrency) => (
          <option key={concurrency} value={concurrency}>
            {concurrency} 张
          </option>
        ))}
      </select>
    </label>
  );
}

function PromptDisclosure({ prompt }: { prompt: string }) {
  return (
    <details className="group rounded-lg border bg-muted/20">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm text-muted-foreground hover:text-foreground">
        <span>查看 Prompt</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t px-3 py-3 font-sans text-xs leading-5 text-muted-foreground">{prompt}</pre>
    </details>
  );
}

function CharacterPreview({ character }: { character: CourseCharacterVisual }) {
  const preview = character.sourceType === "person" ? character.personVisualUrl : character.activeAsset?.publicUrl;
  return <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">{preview ? <Image alt={`${character.displayName} 的形象`} className="size-full object-contain" height={144} src={preview} width={96} unoptimized /> : <PersonAvatar name={character.chineseName} seed={character.characterId} size={72} />}</div>;
}

function courseCharacterAppearance(character: CourseCharacterVisual) {
  return character.appearanceDescription ?? "当前视觉方案未包含具体外貌描述，请更新视觉方案";
}

function VisualSection({ action, children, description, icon, title }: { action?: React.ReactNode; children: React.ReactNode; description?: string; icon: React.ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#CCD8F8] bg-[#E9EEFF] px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/80 text-[#4659DC] ring-1 ring-[#CCD8F8]">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-balance text-sm font-bold text-[#30459E]">{title}</h2>
            {description ? <p className="mt-0.5 text-pretty text-xs text-[#60729A]">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function CharacterCard({ advanced, character, disabled, onEdit, onUpload }: { advanced: boolean; character: CourseCharacterVisual; disabled: boolean; onEdit: () => void; onUpload: () => void }) {
  const person = character.sourceType === "person";
  const hasActions = !person || advanced;
  return (
    <article className="flex min-h-44 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid={`character-card-${character.characterId}`}>
      <div className="flex flex-1 items-center gap-3 bg-[#F8FBFE] px-3 py-3">
        <CharacterPreview character={character} />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center" data-testid={`character-card-copy-${character.characterId}`}>
          <h3 className="max-w-full truncate text-base font-bold text-[#19324D]">{character.chineseName}</h3>
          <p className="mt-0.5 max-w-full truncate text-sm font-medium text-[#69829B]">{character.englishName}</p>
          {person ? (
            <div className="mt-2 w-full">
              <p className="text-xs font-semibold text-[#60729A]">本课形象</p>
              <p className={cn("mt-1 line-clamp-3 text-pretty text-sm leading-5", character.storyVisualDesign ? "text-[#38536E]" : "text-amber-700")}>{character.storyVisualDesign || "当前方案未包含本课形象，请更新视觉方案"}</p>
            </div>
          ) : (
            <>
              <div className="mt-2 w-full">
                <p className="text-xs font-semibold text-[#60729A]">角色形象</p>
                <p className={cn("mt-1 line-clamp-3 text-pretty text-sm leading-5", character.appearanceDescription ? "text-[#38536E]" : "text-amber-700")}>{courseCharacterAppearance(character)}</p>
              </div>
              {character.storyVisualDesign ? <p className="mt-1.5 line-clamp-2 text-pretty text-xs leading-5 text-[#60729A]">本课造型：{character.storyVisualDesign}</p> : null}
            </>
          )}
        </div>
      </div>
      {hasActions ? (
        <div className="flex min-h-11 items-center justify-center gap-2 border-t border-[#E5EFF7] bg-white px-3 py-2">
          {!person ? (
            <Button disabled={disabled} onClick={onUpload} size="sm" variant="outline">
              <Upload />
              {character.activeAsset?.publicUrl ? "更换参考图" : "上传参考图"}
            </Button>
          ) : null}
          {advanced ? (
            <Button aria-label={`编辑${character.displayName}形象描述`} disabled={disabled} onClick={onEdit} size="sm" variant="ghost">
              <Pencil />
              编辑
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
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

function ImageLoadingPreview({ startedAt, title }: { startedAt?: string | null; title: string }) {
  return (
    <div className="aspect-video overflow-hidden rounded-xl border border-primary/20 bg-muted" data-testid="asset-image-frame">
      <TimedOperationStatus description="图片生成通常需要 1–3 分钟，复杂画面可能更久；系统仍在处理中，无需重复点击。" embedded startedAt={startedAt} title={title} />
    </div>
  );
}

function AssetWorkspace({ activeAssetId, courseId, disabled, generationPending, onChanged, onForceRegenerate, onRegenerate, pending, planRevision, regenerateLabel, run, versions }: { activeAssetId: string | null; courseId: string; disabled: boolean; generationPending: boolean; onChanged: () => Promise<void>; onForceRegenerate: () => void; onRegenerate: () => void; pending: string | null; planRevision: number | null; regenerateLabel: string; run: (key: string, action: (requestId: string) => Promise<void>) => Promise<void>; versions: CourseVisualAsset[] }) {
  const [manualSelection, setManualSelection] = useState<{
    id: string;
    anchor: string;
  } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const [recoveryMenuOpen, setRecoveryMenuOpen] = useState(false);
  const recoveryMenuRef = useRef<HTMLDivElement>(null);
  const recoveryMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const recoveryMenuItemRef = useRef<HTMLButtonElement>(null);
  const latest = versions.length ? versions[versions.length - 1]! : null;
  const latestCurrent = latestVersionForRevision(versions, planRevision);
  const selectionAnchor = `${activeAssetId ?? ""}:${latest?.id ?? ""}:${latest?.status ?? ""}`;
  const automaticSelectedId = latestCurrent && latestCurrent.status !== "succeeded" ? latestCurrent.id : (activeAssetId ?? latestCurrent?.id ?? latest?.id ?? null);
  const selectedId = manualSelection?.anchor === selectionAnchor ? manualSelection.id : automaticSelectedId;
  const selectVersion = (id: string) => setManualSelection({ id, anchor: selectionAnchor });
  const selected = versions.find((asset) => asset.id === selectedId) ?? versions.find((asset) => asset.id === activeAssetId) ?? latest;
  const succeeded = versions.filter((asset) => asset.status === "succeeded" && asset.publicUrl);

  useEffect(() => {
    if (!recoveryMenuOpen) return;
    recoveryMenuItemRef.current?.focus();
    const closeWithoutFocus = (event: PointerEvent) => {
      if (!recoveryMenuRef.current?.contains(event.target as Node)) setRecoveryMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setRecoveryMenuOpen(false);
      recoveryMenuTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeWithoutFocus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWithoutFocus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [recoveryMenuOpen]);

  if (!selected) return null;
  const current = selected;
  const selectedMatchesPlan = planRevision === null || selected.planRevision === planRevision;
  const restoringStoredImage = selectedMatchesPlan && selected.status === "failed" && selected.failureCode === "storage_recoverable";

  async function selectAsset() {
    await run(`select:${current.id}`, async () => {
      await mutationRequest(`/api/courses/${courseId}/visual-resources/assets/${current.id}/select`, { method: "POST" }, "图片版本采用失败");
      await onChanged();
    });
  }

  async function refine() {
    await run(`refine:${current.id}`, async (requestId) => {
      await mutationRequest(
        `/api/courses/${courseId}/visual-resources/assets/${current.id}/refine`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestId,
          },
          body: JSON.stringify({ instruction }),
        },
        "图片修改失败",
      );
      setInstruction("");
      setEditing(false);
      await onChanged();
    });
  }

  const inFlight = findLastCompat(versions, (asset) => asset.planRevision === planRevision && ["pending", "submitting", "generating"].includes(asset.status));
  const refiningPending = Boolean(pending?.startsWith("refine:") && versions.some((asset) => pending === `refine:${asset.id}`));
  const generating = Boolean(inFlight || generationPending || refiningPending);
  const refining = refiningPending || inFlight?.operation === "revision";
  const replacingPlan = pending === "originalize" || pending === "plan";
  const generationTitle = restoringStoredImage ? "正在重新保存图片" : refining ? "正在修改图片" : regenerateLabel.includes("封面") ? "正在重新生成视觉封面" : "正在重新生成插图";
  const visibleStatus = generating ? "生成中" : replacingPlan ? "待生成" : selectedMatchesPlan || activeAssetId === selected.id ? statusLabel(selected.status) : "待生成";
  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted" data-testid="asset-image-frame">
        {generating ? <TimedOperationStatus description="图片生成通常需要 1–3 分钟，复杂画面可能更久；系统仍在处理中，无需重复点击。" embedded startedAt={inFlight?.startedAt} title={generationTitle} /> : selected.publicUrl ? <Image alt="当前查看的图片版本" className="object-cover" fill sizes="(max-width: 1024px) 100vw, 760px" src={selected.publicUrl} unoptimized /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{visibleStatus}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={generating ? "secondary" : visibleStatus === "已生成" ? "success" : visibleStatus === "生成失败" ? "destructive" : "secondary"}>{visibleStatus}</Badge>
          <span className="text-xs text-muted-foreground">质量：{qualityLabel(selected.quality)}</span>
          {activeAssetId === selected.id ? (
            <Badge variant="outline">
              <Check className="mr-1 size-3" />
              当前采用
            </Badge>
          ) : selected.status === "succeeded" ? (
            <Button disabled={disabled} onClick={selectAsset} size="sm" variant="outline">
              采用此版本
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.status === "succeeded" ? (
            <Button disabled={disabled} onClick={() => setEditing((value) => !value)} size="sm" variant="ghost">
              <Pencil />
              编辑图片
            </Button>
          ) : null}
          {restoringStoredImage ? (
            <div className="relative inline-flex" ref={recoveryMenuRef}>
              <Button className="rounded-r-none" disabled={disabled || generating} onClick={onRegenerate} size="sm" variant="outline">
                <RefreshCw className={cn(generating && "animate-spin")} />
                {generating ? "生成中" : "重新保存图片"}
              </Button>
              <Button
                aria-expanded={recoveryMenuOpen}
                aria-haspopup="menu"
                aria-label="更多图片恢复操作"
                className="-ml-px rounded-l-none px-2"
                disabled={disabled || generating}
                onClick={() => setRecoveryMenuOpen((value) => !value)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown") return;
                  event.preventDefault();
                  setRecoveryMenuOpen(true);
                }}
                ref={recoveryMenuTriggerRef}
                size="sm"
                variant="outline"
              >
                <ChevronDown aria-hidden="true" />
              </Button>
              {recoveryMenuOpen ? (
                <div className="absolute right-0 top-full z-dropdown mt-1 w-56 rounded-lg border bg-card p-1 shadow-lg" role="menu">
                  <button
                    aria-label="重新生成图片"
                    className="w-full rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setRecoveryMenuOpen(false);
                      recoveryMenuTriggerRef.current?.focus();
                      onForceRegenerate();
                    }}
                    ref={recoveryMenuItemRef}
                    role="menuitem"
                    type="button"
                  >
                    <span className="block font-medium text-foreground">重新生成图片</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">放弃旧地址并创建新的图片版本</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Button disabled={disabled || generating} onClick={onRegenerate} size="sm" variant="outline">
              <RefreshCw className={cn(generating && "animate-spin")} />
              {generating ? "生成中" : regenerateLabel}
            </Button>
          )}
        </div>
      </div>
      {selected.failureReason && selectedMatchesPlan && !generating && !replacingPlan ? (
        <div className="space-y-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <p>{selected.failureReason}</p>
          <p className="font-medium">{restoringStoredImage ? "图片内容已经生成，可以重新保存，不会再次调用 AI" : selected.operation === "revision" ? "编辑图片失败，可以修改要求后重试" : "图片生成失败，可以重新生成"}</p>
          {selected.operation === "revision" && selected.parentAssetId && !restoringStoredImage ? (
            <Button
              onClick={() => {
                selectVersion(selected.parentAssetId!);
                setEditing(true);
              }}
              size="sm"
              variant="outline"
            >
              修改要求后重试
            </Button>
          ) : null}
        </div>
      ) : null}
      {editing && selected.status === "succeeded" ? (
        <div className="rounded-lg border bg-muted/30 p-3">
          <label className="text-sm font-medium" htmlFor={`image-edit-${current.id}`}>
            修改当前版本
          </label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">请具体描述要修改的对象、位置和目标结果，信息越明确，修改越准确。</p>
          <textarea className="mt-2 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" disabled={disabled} id={`image-edit-${current.id}`} maxLength={500} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：消除画面右侧重复的角色，其他人物和构图保持不变" value={instruction} />
          <div className="mt-2 flex justify-end">
            <Button disabled={disabled || !instruction.trim()} onClick={refine} size="sm">
              <Send />
              提交修改
            </Button>
          </div>
        </div>
      ) : null}
      {succeeded.length > 1 ? (
        <details className="group rounded-lg border bg-muted/20">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-2">
              <History className="size-4" />
              历史版本（{succeeded.length}）
            </span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div aria-label="成功图片版本" className="flex gap-2 overflow-x-auto border-t p-3">
            {succeeded.map((item) => (
              <button aria-label={`查看 ${item.createdAt} 生成的版本`} className={cn("relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border-2 bg-muted", selected.id === item.id ? "border-primary" : "border-transparent")} key={item.id} onClick={() => selectVersion(item.id)} type="button">
                <Image alt="" className="object-cover" fill sizes="112px" src={item.publicUrl!} unoptimized />
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

type ChapterGroup = {
  id: string;
  order: number;
  title: string;
  slots: CourseVisualImageSlot[];
};
type VisualMobileStage = "flow" | "characters" | "cover" | "shots";
const visualMobileStages: Array<{ id: VisualMobileStage; label: string }> = [
  { id: "flow", label: "流程" },
  { id: "characters", label: "角色" },
  { id: "cover", label: "封面" },
  { id: "shots", label: "章节图片" },
];

function initialChapter(state: CourseVisualResourcesState) {
  const lessonSlots = state.slots.filter((slot) => slot.slotType === "lesson_shot");
  return lessonSlots.find((slot) => needsInitialVisualGeneration(slot, state.planRevision))?.chapterId ?? lessonSlots[0]?.chapterId ?? "";
}

export function CourseVisualResourcesWorkspace({ initialState }: { initialState: CourseVisualResourcesState }) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRequestIds = useRef(new Map<string, string>());
  const [advanced, setAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState(() => initialChapter(initialState));
  const [characterTab, setCharacterTab] = useState<"people" | "main" | "other">("people");
  const [characterPage, setCharacterPage] = useState(1);
  const [confirmPlanUpdate, setConfirmPlanUpdate] = useState(false);
  const [confirmOriginalize, setConfirmOriginalize] = useState(false);
  const [uploadCharacter, setUploadCharacter] = useState<CourseCharacterVisual | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<CourseCharacterVisual | null>(null);
  const [appearanceDraft, setAppearanceDraft] = useState("");
  const [courseAppearanceDraft, setCourseAppearanceDraft] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [mobileStage, setMobileStage] = useState<VisualMobileStage>(() => (initialState.planReady ? "cover" : "flow"));
  const tabListRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/courses/${state.course.id}/visual-resources`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "视觉资源加载失败");
    const nextState = data as CourseVisualResourcesState;
    setState(nextState);
    setMobileStage((current) => {
      if (!nextState.planReady) return "flow";
      if (current === "flow") return nextState.confirmedCoverAssetId ? "shots" : "cover";
      return current;
    });
    return nextState;
  }, [state.course.id]);

  const hasServerGeneration = state.slots.some((slot) => hasInFlightVisualVersion(slot.versions, state.planRevision));
  useEffect(() => {
    if (!shouldPollVisualResources(pending, hasServerGeneration)) return;
    const timer = window.setInterval(() => {
      void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "图片状态同步失败"));
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [hasServerGeneration, pending, refresh]);

  useEffect(() => {
    const sync = () => {
      void refresh().catch(() => undefined);
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [refresh]);

  async function run(key: string, action: (requestId: string) => Promise<void>) {
    if (pending) return;
    const before = visualStateFingerprint(state);
    const requestId = retryRequestIds.current.get(key) ?? requestKey();
    retryRequestIds.current.set(key, requestId);
    setPending(key);
    setError(null);
    try {
      await action(requestId);
      retryRequestIds.current.delete(key);
    } catch (reason) {
      if (reason instanceof AmbiguousMutationError) {
        const reconciled = await refresh().catch(() => null);
        if (reconciled && visualStateFingerprint(reconciled) !== before) {
          retryRequestIds.current.delete(key);
          return;
        }
        setError(`${reason.message}；恢复网络后可安全重试`);
      } else {
        retryRequestIds.current.delete(key);
        setError(reason instanceof Error ? reason.message : "操作失败");
      }
    } finally {
      setPending(null);
    }
  }

  async function jsonAction(key: string, url: string, body?: unknown) {
    await run(key, async (requestId) => {
      await mutationRequest(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestId,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        "操作失败",
      );
      await refresh();
    });
  }

  const coverSlot = state.slots.find((slot) => slot.slotType === "visual_cover") ?? null;
  const lessonSlots = state.slots.filter((slot) => slot.slotType === "lesson_shot");
  const chapters = useMemo(
    () =>
      Array.from(
        lessonSlots
          .reduce((groups, item) => {
            const id = item.chapterId ?? "unknown";
            const group = groups.get(id) ?? {
              id,
              order: item.chapterOrder ?? groups.size + 1,
              title: item.chapterTitle ?? "未命名章节",
              slots: [],
            };
            group.slots.push(item);
            groups.set(id, group);
            return groups;
          }, new Map<string, ChapterGroup>())
          .values(),
      ).sort((a, b) => a.order - b.order),
    [lessonSlots],
  );
  const peopleCharacters = state.characters.filter((character) => character.sourceType === "person");
  const mainCharacters = state.characters.filter((character) => character.sourceType !== "person" && character.isMain);
  const otherCharacters = state.characters.filter((character) => character.sourceType !== "person" && !character.isMain);
  const canOriginalize = state.planReady && state.characters.some((character) => character.sourceType === "referenced");
  const originalizeLabel = state.planMode === "originalized" ? "重新调整原创视觉设定" : "改用原创视觉设定";
  const policyRecoveryText = state.planMode === "originalized" ? "部分图片受到生成限制。可以直接重试当前图片，也可以重新调整原创视觉设定。" : "部分图片受到生成限制。可以直接重试当前图片，也可以改用原创视觉设定。";
  const characterGroup = characterTab === "people" ? peopleCharacters : characterTab === "main" ? mainCharacters : otherCharacters;
  const characterTotalPages = Math.max(1, Math.ceil(characterGroup.length / CHARACTER_PAGE_SIZE));
  const safeCharacterPage = Math.min(characterPage, characterTotalPages);
  const visibleCharacters = characterGroup.slice((safeCharacterPage - 1) * CHARACTER_PAGE_SIZE, safeCharacterPage * CHARACTER_PAGE_SIZE);
  const missingPeople = peopleCharacters.filter((character) => coverSlot?.characterIds.includes(character.characterId) && !character.personVisualUrl);
  const coverConfirmed = Boolean(state.confirmedCoverAssetId && coverSlot?.activeAssetId === state.confirmedCoverAssetId);
  const replacingPlan = pending === "originalize" || pending === "plan";
  const coverStatus = pending === `slot:${coverSlot?.id}` ? "生成中" : replacingPlan ? "处理中" : slotStatusLabel(coverSlot, state.planRevision);
  const completed = lessonSlots.filter((item) => item.activeAssetId && item.versions.some((asset) => asset.id === item.activeAssetId && asset.planRevision === state.planRevision)).length;
  const generating = lessonSlots.filter((item) => hasInFlightVisualVersion(item.versions, state.planRevision)).length;
  const failed = replacingPlan ? 0 : lessonSlots.filter((item) => hasCurrentFailure(item, state.planRevision)).length;
  const missing = lessonSlots.length - completed - generating;
  const currentChapter = chapters.find((chapter) => chapter.id === activeTab) ?? null;
  const disabled = Boolean(pending || hasServerGeneration);
  const canEnterPreview = !hasServerGeneration;

  useEffect(() => {
    const active = tabListRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    active?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTab]);

  function moveTab(direction: 1 | -1) {
    const tabIds = chapters.map((chapter) => chapter.id);
    if (!tabIds.length) return;
    const currentIndex = Math.max(0, tabIds.indexOf(activeTab));
    const nextIndex = (currentIndex + direction + tabIds.length) % tabIds.length;
    setActiveTab(tabIds[nextIndex]);
  }

  async function uploadReference(character: CourseCharacterVisual, file: File) {
    await run(`upload:${character.characterId}`, async (requestId) => {
      const form = new FormData();
      form.set("image", file);
      await mutationRequest(
        `/api/courses/${state.course.id}/visual-resources/characters/${character.characterId}/reference`,
        {
          method: "POST",
          headers: { "Idempotency-Key": requestId },
          body: form,
        },
        "外形参考保存失败",
      );
      await refresh();
      setUploadCharacter(null);
    });
  }

  function openAppearanceEditor(character: CourseCharacterVisual) {
    setDialogError("");
    setEditingCharacter(character);
    setAppearanceDraft(character.appearanceDescription ?? "");
    setCourseAppearanceDraft(character.storyVisualDesign ?? "");
  }

  async function saveAppearance() {
    if (!editingCharacter || pending) return;
    setDialogError("");
    setPending(`appearance:${editingCharacter.characterId}`);
    try {
      const response = await fetch(`/api/courses/${state.course.id}/visual-resources/characters/${editingCharacter.characterId}/appearance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingCharacter.sourceType === "person"
            ? { courseAppearance: courseAppearanceDraft }
            : {
                appearanceDescription: appearanceDraft,
                courseAppearance: courseAppearanceDraft,
              },
        ),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        const message = data?.message || "形象描述保存失败";
        throw new Error(message);
      }
      await refresh();
      setEditingCharacter(null);
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : "形象描述保存失败");
    } finally {
      setPending(null);
    }
  }

  function generateSlot(slotId: string, recoveryMode: "auto" | "regenerate" = "auto") {
    void jsonAction(`slot:${slotId}`, `/api/courses/${state.course.id}/visual-resources/images/generate`, {
      scope: "slot",
      slotId,
      ...(recoveryMode === "regenerate" ? { recoveryMode } : {}),
    });
  }

  function updateVisualSettings(key: string, body: { quality?: CourseImageQuality; imageGenerationConcurrency?: number }) {
    void run(key, async () => {
      const response = await fetch(`/api/courses/${state.course.id}/visual-resources/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      await refresh();
    });
  }

  async function confirmCover() {
    if (!coverSlot?.activeAssetId) return;
    await run("confirm-cover", async () => {
      await mutationRequest(
        `/api/courses/${state.course.id}/visual-resources/cover/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: coverSlot.activeAssetId }),
        },
        "封面确认失败",
      );
      const next = await refresh();
      setActiveTab(initialChapter(next));
    });
  }

  async function enterPreview() {
    await run("confirm", async () => {
      await mutationRequest(`/api/courses/${state.course.id}/visual-resources/confirm`, { method: "POST" }, "无法进入预览发布");
      window.location.assign(`/courses/${state.course.id}/create/preview`);
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4">
      <CourseCreateSteps courseId={state.course.id} currentStep={5} furthestStep={courseStageStep(state.course.currentStage)} onNavigate={(href) => window.location.assign(href)} />
      <CourseStaleNotice staleFromStage={state.course.staleFromStage} stage="visual_resources" />
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">阶段五</p>
          <h1 className="text-balance text-2xl font-semibold">视觉资源</h1>
        </div>
        <div className="hidden flex-wrap gap-2 lg:flex" data-testid="visual-stage-actions">
          <Button asChild variant="outline">
            <Link href={`/courses/${state.course.id}/create/content`}>
              <ChevronLeft />
              返回文案与练习
            </Link>
          </Button>
          <Button aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)} variant="ghost">
            <Settings2 />
            高级模式
          </Button>
          <Button disabled={disabled || !canEnterPreview} loading={pending === "confirm"} onClick={enterPreview}>
            <Send />
            进入预览发布
          </Button>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto lg:hidden">
          <Button aria-expanded={advanced} className="shrink-0 whitespace-nowrap" onClick={() => setAdvanced((value) => !value)} size="sm" variant="outline">
            <Settings2 />
            高级
          </Button>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 lg:hidden" data-testid="visual-stage-tabs">
        {visualMobileStages.map((stage) => (
          <button aria-pressed={mobileStage === stage.id} disabled={!state.planReady && stage.id !== "flow"} className={visualStageClass(mobileStage === stage.id)} key={stage.id} onClick={() => setMobileStage(stage.id)} type="button">
            {stage.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          <span>{error}</span>
          <button className="underline" onClick={() => setError(null)} type="button">
            关闭
          </button>
        </div>
      ) : null}
      {state.policyBlocked && !replacingPlan ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-4" />
            {policyRecoveryText}
          </span>
          {canOriginalize ? (
            <Button disabled={disabled} onClick={() => setConfirmOriginalize(true)} size="sm" variant="outline">
              {originalizeLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={cn(mobileStage !== "flow" && "hidden lg:block")} data-testid="visual-flow-section">
        <VisualSection icon={<Sparkles className="size-4" />} title="图片生成流程">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className={cn("rounded-lg border px-3 py-2.5", state.planReady ? "border-emerald-200 bg-emerald-50/70" : "border-primary-200 bg-primary-50/60")}>
              <p className="text-xs font-semibold text-foreground">1 · 视觉方案</p>
              <p className="mt-1 text-xs text-muted-foreground">{state.planReady ? "已生成" : "待生成"}</p>
            </div>
            <div className={cn("rounded-lg border px-3 py-2.5", state.planReady ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-muted/25")}>
              <p className="text-xs font-semibold text-foreground">2 · 主要角色</p>
              <p className="mt-1 text-xs text-muted-foreground">{state.planReady ? `${state.characters.length} 个角色` : "待视觉方案"}</p>
            </div>
            <div className={cn("rounded-lg border px-3 py-2.5", coverConfirmed ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-muted/25")}>
              <p className="text-xs font-semibold text-foreground">3 · 视觉封面</p>
              <p className="mt-1 text-xs text-muted-foreground">{state.planReady ? (coverConfirmed ? "已确认" : coverStatus) : "待视觉方案"}</p>
            </div>
            <div className={cn("rounded-lg border px-3 py-2.5", lessonSlots.length > 0 && completed === lessonSlots.length ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-muted/25")}>
              <p className="text-xs font-semibold text-foreground">4 · 章节图片</p>
              <p className="mt-1 text-xs text-muted-foreground">{state.planReady ? `${completed}/${lessonSlots.length} 已完成` : "待视觉方案"}</p>
            </div>
          </div>
        </VisualSection>
      </div>

      {advanced ? (
        <VisualSection icon={<Settings2 className="size-4" />} title="高级设置">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">调整后续图片的生成质量。</p>
              <QualitySelector disabled={disabled} onChange={(quality) => updateVisualSettings(`quality:${quality}`, { quality })} value={state.quality} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">批量生成时最多同时处理这些图片。数值越高生成越快，也更容易触发图片服务限流。</p>
              <ImageGenerationConcurrencySelector disabled={disabled} onChange={(imageGenerationConcurrency) => updateVisualSettings(`concurrency:${imageGenerationConcurrency}`, { imageGenerationConcurrency })} value={state.imageGenerationConcurrency} />
            </div>
            {canOriginalize && !state.policyBlocked ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="max-w-2xl text-xs leading-5 text-muted-foreground">保留故事和整体视觉气质，将原作身份、专有地名与标志性元素转换为描述性视觉设定。</p>
                <Button disabled={disabled} onClick={() => setConfirmOriginalize(true)} size="sm" variant="outline">
                  {originalizeLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </VisualSection>
      ) : null}

      <div className={cn(mobileStage !== "flow" && "hidden lg:block")} data-testid="visual-plan-section">
        <VisualSection
          action={
            state.planReady ? (
              <Button disabled={disabled} loading={pending === "plan"} onClick={() => setConfirmPlanUpdate(true)} size="sm" variant="outline">
                <RefreshCw />
                更新视觉方案
              </Button>
            ) : undefined
          }
          description="生成全课角色形象、封面和章节图片方案；不会生成图片。"
          icon={<Sparkles className="size-4" />}
          title="视觉方案"
        >
          {replacingPlan ? (
            <VisualPlanLoading originalizing={pending === "originalize"} />
          ) : state.planReady ? (
            <VisualPlanSummary chapterCount={chapters.length} characterCount={state.characters.length} imageCount={lessonSlots.length} />
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <Button disabled={disabled} onClick={() => void jsonAction("plan", `/api/courses/${state.course.id}/visual-resources/plan/generate`)}>
                <Sparkles />
                生成视觉方案
              </Button>
            </div>
          )}
        </VisualSection>
      </div>

      <div className={cn(mobileStage !== "characters" && "hidden lg:block")} data-testid="visual-characters-section">
        <VisualSection description="系统将根据故事生成角色形象；若封面生成的人物形象不够精确，可上传参考图后重试。" icon={<UserRound className="size-4" />} title="主要角色">
          {!state.planReady ? (
            <p className="py-4 text-center text-sm text-muted-foreground">生成视觉方案后显示本课角色形象。</p>
          ) : (
            <div className="space-y-3">
              <div className="flex overflow-x-auto whitespace-nowrap rounded-lg bg-slate-100 p-1" role="tablist" aria-label="角色分类">
                {(
                  [
                    {
                      id: "people",
                      label: "老师学生",
                      count: peopleCharacters.length,
                    },
                    {
                      id: "main",
                      label: "主要角色",
                      count: mainCharacters.length,
                    },
                    {
                      id: "other",
                      label: "其他角色",
                      count: otherCharacters.length,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    aria-selected={characterTab === tab.id}
                    className={cn("min-h-11 shrink-0 whitespace-nowrap rounded-md px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/30", characterTab === tab.id ? "bg-white text-[#30459E] shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-[#30459E]")}
                    key={tab.id}
                    onClick={() => {
                      setCharacterTab(tab.id);
                      setCharacterPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    {tab.label}（{tab.count}）
                  </button>
                ))}
              </div>
              {visibleCharacters.length ? (
                <div className="grid gap-3 lg:grid-cols-2" data-testid="character-list">
                  {visibleCharacters.map((character) => (
                    <CharacterCard advanced={advanced} character={character} disabled={disabled} key={character.characterId} onEdit={() => openAppearanceEditor(character)} onUpload={() => setUploadCharacter(character)} />
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无角色</p>
              )}
              {characterGroup.length > CHARACTER_PAGE_SIZE ? (
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">共 {characterGroup.length} 个角色</span>
                  <div className="flex items-center gap-2">
                    <Button aria-label="上一页角色" disabled={safeCharacterPage <= 1} onClick={() => setCharacterPage((page) => page - 1)} size="icon-sm" variant="outline">
                      <ChevronLeft />
                    </Button>
                    <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
                      {safeCharacterPage}/{characterTotalPages}
                    </span>
                    <Button aria-label="下一页角色" disabled={safeCharacterPage >= characterTotalPages} onClick={() => setCharacterPage((page) => page + 1)} size="icon-sm" variant="outline">
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </VisualSection>
      </div>

      <div className={cn(mobileStage !== "cover" && "hidden lg:block")} data-testid="visual-cover-section">
        {state.planReady && coverSlot ? (
          <VisualSection action={<Badge variant={coverConfirmed ? "success" : "secondary"}>{coverConfirmed ? "已确认" : coverStatus}</Badge>} icon={<ImageIcon className="size-4" />} title="视觉封面">
            <div className="space-y-3">
              <PromptDisclosure prompt={coverSlot.prompt} />
              {coverSlot.hasUnsyncedChanges ? <p className="rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">角色设定已更新，现有图片不会自动变化；如有需要，请重新生成。</p> : null}
              {coverSlot.versions.length ? (
                <AssetWorkspace
                  activeAssetId={coverSlot.activeAssetId}
                  courseId={state.course.id}
                  disabled={disabled}
                  generationPending={pending === `slot:${coverSlot.id}`}
                  onChanged={async () => {
                    await refresh();
                  }}
                  onForceRegenerate={() => generateSlot(coverSlot.id, "regenerate")}
                  onRegenerate={() => generateSlot(coverSlot.id)}
                  pending={pending}
                  planRevision={state.planRevision}
                  regenerateLabel="重新生成封面"
                  run={run}
                  versions={coverSlot.versions}
                />
              ) : (
                <>
                  {pending === `slot:${coverSlot.id}` ? <ImageLoadingPreview title="正在生成视觉封面" /> : <EmptyImagePreview generating={false} label="尚未生成视觉封面" />}
                  {missingPeople.length ? (
                    <p className="text-sm text-destructive">
                      人物档案缺少可用形象：
                      {missingPeople.map((item) => item.chineseName ?? item.displayName).join("、")}
                    </p>
                  ) : null}
                  <Button disabled={disabled || Boolean(missingPeople.length)} loading={pending === `slot:${coverSlot.id}`} onClick={() => generateSlot(coverSlot.id)}>
                    <ImageIcon />
                    生成视觉封面
                  </Button>
                </>
              )}
              {coverSlot.activeAssetId && !coverConfirmed ? (
                <div className="flex justify-end border-t pt-4">
                  <Button disabled={disabled} loading={pending === "confirm-cover"} onClick={() => void confirmCover()}>
                    <Check />
                    确认视觉封面
                  </Button>
                </div>
              ) : null}
            </div>
          </VisualSection>
        ) : null}
      </div>

      <div className={cn(mobileStage !== "shots" && "hidden lg:block")} data-testid="visual-shots-section">
        {state.planReady ? (
          <VisualSection
            action={
              <Button disabled={disabled || !coverConfirmed || missing <= 0} loading={pending === "generate:all"} onClick={() => void jsonAction("generate:all", `/api/courses/${state.course.id}/visual-resources/images/generate`, { scope: "all" })} size="sm">
                <Sparkles />
                生成全部未生成图片
              </Button>
            }
            description={`${completed}/${lessonSlots.length} 已完成${generating ? ` · ${generating} 张生成中` : ""}${failed ? ` · ${failed} 张失败` : ""}`}
            icon={<ImageIcon className="size-4" />}
            title="章节图片"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b">
                <div
                  aria-label="章节图片导航"
                  className="flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                      event.preventDefault();
                      moveTab(event.key === "ArrowRight" ? 1 : -1);
                    }
                  }}
                  ref={tabListRef}
                  role="tablist"
                >
                  {chapters.map((chapter) => {
                    const done = chapter.slots.filter((item) => item.activeAssetId).length;
                    const hasFailure = !replacingPlan && chapter.slots.some((item) => hasCurrentFailure(item, state.planRevision));
                    const status = hasFailure ? "失败" : done === chapter.slots.length ? "已完成" : done ? `${done}/${chapter.slots.length}` : "待生成";
                    return (
                      <button aria-selected={activeTab === chapter.id} className={cn("min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2", activeTab === chapter.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")} key={chapter.id} onClick={() => setActiveTab(chapter.id)} role="tab" type="button">
                        第 {chapter.order} 章 · {status}
                      </button>
                    );
                  })}
                </div>
                <details className="group relative shrink-0">
                  <summary aria-label="跳转章节" className="list-none" role="button">
                    <Button asChild size="sm" variant="outline">
                      <span>
                        <List />
                        跳转章节
                      </span>
                    </Button>
                  </summary>
                  <div className="absolute right-0 top-11 z-30 w-64 rounded-xl border bg-card p-2 shadow-md">
                    {chapters.map((chapter) => (
                      <button className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-muted" key={chapter.id} onClick={() => setActiveTab(chapter.id)} type="button">
                        <span className="truncate">
                          第 {chapter.order} 章 · {chapter.title}
                        </span>
                        <ChevronRight className="size-4" />
                      </button>
                    ))}
                  </div>
                </details>
              </div>
              {!coverConfirmed ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">请先确认视觉封面，再生成章节图片</p> : null}
              {currentChapter ? (
                <section className="space-y-4" role="tabpanel">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-balance text-base font-semibold">
                      第 {currentChapter.order} 章 · {currentChapter.title}
                    </h2>
                    <Button disabled={disabled || !coverConfirmed || !currentChapter.slots.some((item) => needsInitialVisualGeneration(item, state.planRevision))} loading={pending === `generate:${currentChapter.id}`} onClick={() => void jsonAction(`generate:${currentChapter.id}`, `/api/courses/${state.course.id}/visual-resources/images/generate`, { scope: "chapter", chapterId: currentChapter.id })}>
                      <Sparkles />
                      生成本章未生成图片
                    </Button>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    {currentChapter.slots.map((item, index) => {
                      const serverGenerating = hasInFlightVisualVersion(item.versions, state.planRevision);
                      const directPending = pending === `slot:${item.id}`;
                      const batchPending = pending === `generate:${currentChapter.id}` || pending === "generate:all";
                      const itemGenerating = directPending || serverGenerating;
                      const itemQueued = batchPending && needsInitialVisualGeneration(item, state.planRevision) && !itemGenerating;
                      const itemStatus = itemQueued ? "等待生成" : slotStatusLabel(item, state.planRevision);
                      return (
                        <article className="min-w-0 space-y-3 rounded-xl border p-4" key={item.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">第 {index + 1} 段插图</p>
                              <p className="mt-2 line-clamp-4 text-pretty text-sm leading-6 text-muted-foreground">{item.sourceText}</p>
                            </div>
                            <Badge variant={item.activeAssetId ? "success" : "secondary"}>{itemStatus}</Badge>
                          </div>
                          <PromptDisclosure prompt={item.prompt} />
                          {item.hasUnsyncedChanges ? <p className="rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">角色设定已更新，现有图片不会自动变化；如有需要，请重新生成。</p> : null}
                          {item.versions.length ? (
                            <AssetWorkspace
                              activeAssetId={item.activeAssetId}
                              courseId={state.course.id}
                              disabled={disabled}
                              generationPending={itemGenerating}
                              onChanged={async () => {
                                await refresh();
                              }}
                              onForceRegenerate={() => generateSlot(item.id, "regenerate")}
                              onRegenerate={() => generateSlot(item.id)}
                              pending={pending}
                              planRevision={state.planRevision}
                              regenerateLabel="重新生成"
                              run={run}
                              versions={item.versions}
                            />
                          ) : (
                            <>
                              {itemGenerating ? <ImageLoadingPreview title="正在生成本段插图" /> : <EmptyImagePreview generating={false} label={itemQueued ? "等待生成" : "图片待生成"} />}
                              <Button disabled={disabled || !coverConfirmed} loading={directPending} onClick={() => generateSlot(item.id)} size="sm">
                                <ImageIcon />
                                生成本张
                              </Button>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          </VisualSection>
        ) : null}
      </div>

      <Dialog
        icon={<RefreshCw className="size-5" />}
        onClose={() => {
          if (!pending) setConfirmPlanUpdate(false);
        }}
        open={confirmPlanUpdate}
        size="compact"
        title="更新视觉方案？"
      >
        <div className="space-y-4 p-5">
          <p className="text-pretty text-sm leading-6 text-muted-foreground">更新会替换当前角色设定、封面方案和章节图片方案，并重新调用 AI。当前采用的封面与章节图片将变为待重新生成。</p>
          <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">已上传的角色参考图和历史图片版本会保留。</p>
          <div className="flex justify-end gap-2">
            <Button disabled={Boolean(pending)} onClick={() => setConfirmPlanUpdate(false)} variant="outline">
              取消
            </Button>
            <Button
              disabled={Boolean(pending)}
              loading={pending === "plan"}
              onClick={() => {
                setConfirmPlanUpdate(false);
                void jsonAction("plan", `/api/courses/${state.course.id}/visual-resources/plan/generate`);
              }}
              variant="destructive"
            >
              确认更新视觉方案
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        icon={<CircleAlert className="size-5" />}
        onClose={() => {
          if (!pending) setConfirmOriginalize(false);
        }}
        open={confirmOriginalize}
        size="compact"
        title={state.planMode === "originalized" ? "重新调整原创视觉设定？" : "改用原创视觉设定？"}
      >
        <div className="space-y-4 p-5">
          <p className="text-pretty text-sm leading-6 text-muted-foreground">系统会保留故事内容和整体视觉气质，将引用角色转换为不依赖原作名称识别的文字视觉形象。</p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">专有地名和背景元素会改为描述性设定；构图、氛围、老师学生和已有原创角色尽量保持。封面与章节图片需要重新生成，历史版本仍会保留。</p>
          <div className="flex justify-end gap-2">
            <Button disabled={Boolean(pending)} onClick={() => setConfirmOriginalize(false)} variant="outline">
              取消
            </Button>
            <Button
              disabled={Boolean(pending)}
              loading={pending === "originalize"}
              onClick={() => {
                setConfirmOriginalize(false);
                void jsonAction("originalize", `/api/courses/${state.course.id}/visual-resources/plan/originalize`);
              }}
            >
              {state.planMode === "originalized" ? "确认重新调整" : "确认并原创化"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog icon={<Upload className="size-5" />} onClose={() => setUploadCharacter(null)} open={Boolean(uploadCharacter)} size="compact" title={`上传${uploadCharacter?.displayName ?? "角色"}参考图`}>
        <div className="p-6">
          <div
            autoFocus
            className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file && uploadCharacter) void uploadReference(uploadCharacter, file);
            }}
            onPaste={(event) => {
              const file = Array.from(event.clipboardData.items)
                .find((item) => item.type.startsWith("image/"))
                ?.getAsFile();
              if (!file || !uploadCharacter) return;
              event.preventDefault();
              void uploadReference(uploadCharacter, file);
            }}
            tabIndex={0}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">拖入图片或按 Ctrl + V 粘贴</p>
            <label className="mt-4 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
              <Upload className="size-4" />
              选择图片
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && uploadCharacter) void uploadReference(uploadCharacter, file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          </div>
        </div>
      </Dialog>

      <Dialog
        icon={<UserRound className="size-5" />}
        onClose={() => {
          if (!pending) setEditingCharacter(null);
        }}
        open={Boolean(editingCharacter)}
        size="compact"
        title={`编辑${editingCharacter?.displayName ?? "角色"}形象`}
      >
        <div className="space-y-4 p-5">
          {editingCharacter?.sourceType !== "person" ? (
            <label className="block text-sm font-medium">
              角色形象
              <textarea className="mt-2 min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" maxLength={400} onChange={(event) => setAppearanceDraft(event.target.value)} value={appearanceDraft} />
            </label>
          ) : null}
          <label className="block text-sm font-medium">
            本课造型
            <textarea className="mt-2 min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" maxLength={400} onChange={(event) => setCourseAppearanceDraft(event.target.value)} value={courseAppearanceDraft} />
          </label>
          {dialogError ? (
            <p className="text-sm text-destructive" role="alert">
              {dialogError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button disabled={Boolean(pending)} onClick={() => setEditingCharacter(null)} variant="outline">
              取消
            </Button>
            <Button disabled={Boolean(pending)} loading={pending?.startsWith("appearance:")} onClick={() => void saveAppearance()}>
              保存
            </Button>
          </div>
        </div>
      </Dialog>

      <div className="max-xl:static xl:sticky xl:bottom-4 z-20 flex flex-col gap-2 rounded-lg border bg-card/95 px-3 py-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4" data-testid="visual-bottom-actions">
        <p aria-live="polite" className="truncate text-sm text-muted-foreground">
          {hasServerGeneration ? "图片正在生成，完成后才能进入预览发布" : "可以随时使用占位图继续预览发布"}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button disabled={disabled} onClick={() => window.location.assign(`/courses/${state.course.id}/create/content`)} variant="outline">
            <ChevronLeft />
            上一步
          </Button>
          <Button aria-label="下一步：预览发布" disabled={disabled || !canEnterPreview} loading={pending === "confirm"} onClick={enterPreview}>
            <Send />
            <span className="sm:hidden">下一步</span>
            <span className="hidden sm:inline">下一步：预览发布</span>
          </Button>
        </div>
      </div>
    </main>
  );
}

function visualStageClass(active: boolean) {
  return cn("min-h-11 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground");
}
