"use client";

import { ArrowLeft, Download, LayoutList, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import { CourseStaleNotice } from "@/features/courses/components/course-stale-notice";
import { CourseSlideDeck } from "@/features/courses/components/course-slide-deck";
import type { CoursePreviewResponse } from "@/lib/contracts/api";
import { pdfPagesForMode, type CoursePdfMode } from "@/lib/domain/course-preview";
import { cn } from "@/lib/utils";
import { exportSlidesToPDF, type PdfExportProgress } from "@/lib/utils/pdf-export";

const coverThemes = [
  { id: "dark", label: "深色" },
  { id: "warm", label: "暖色" },
  { id: "light", label: "浅色" },
];
const chapterThemes = [
  { id: "blue-purple", label: "蓝紫" },
  { id: "green-teal", label: "青竹" },
  { id: "orange-red", label: "橙红" },
  { id: "purple-pink", label: "紫粉" },
  { id: "blue-indigo", label: "蓝靛" },
];

type StoredPdfExport = Pick<PdfExportProgress, "completedPages" | "totalPages"> & { mode?: CoursePdfMode; startedAt: number };

function pdfProgressLabel(progress: PdfExportProgress) {
  if (progress.phase === "preparing") return "正在准备字体和图片";
  if (progress.phase === "rendering") return `正在处理第 ${progress.currentPage}/${progress.totalPages} 页`;
  if (progress.phase === "assembling") return "正在整理并下载 PDF";
  return "PDF 已生成";
}

export function CoursePreviewWorkspace({ initialState }: { initialState: CoursePreviewResponse }) {
  const router = useRouter();
  const [mode, setMode] = useState<"html" | "pdf">("html");
  const [presentation, setPresentation] = useState(initialState.presentation);
  const [savedPresentation, setSavedPresentation] = useState(initialState.presentation);
  const [saveStatus, setSaveStatus] = useState<"saved" | "dirty" | "saving" | "failed">("saved");
  const [selectedPageId, setSelectedPageId] = useState<string>();
  const [pending, setPending] = useState<"publish" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<PdfExportProgress | null>(null);
  const [pdfElapsedSeconds, setPdfElapsedSeconds] = useState(0);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [pdfOutcome, setPdfOutcome] = useState<"success" | "cancelled" | null>(null);
  const [pdfCancelling, setPdfCancelling] = useState(false);
  const [interruptedPdf, setInterruptedPdf] = useState<StoredPdfExport | null>(null);
  const [pdfMode, setPdfMode] = useState<CoursePdfMode>("all");
  const [showPdfModeDialog, setShowPdfModeDialog] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const hasChanges = JSON.stringify(presentation) !== JSON.stringify(savedPresentation);
  const displaySaveStatus = hasChanges && saveStatus === "saved" ? "dirty" : saveStatus;
  const saveSequence = useRef(0);
  const pdfAbortController = useRef<AbortController | null>(null);
  const pdfResultTimer = useRef<number | null>(null);
  const pdfStartedAt = useRef(0);
  const pdfStorageKey = `course-pdf-export:${initialState.course.id}`;
  const selectedPage = useMemo(() => initialState.pages.find((page) => page.id === selectedPageId), [initialState.pages, selectedPageId]);
  const pdfPages = useMemo(() => pdfPagesForMode(initialState.pages, pdfMode), [initialState.pages, pdfMode]);

  const save = useCallback(
    async (value: CoursePreviewResponse["presentation"]) => {
      const sequence = ++saveSequence.current;
      setSaveStatus("saving");
      setError(null);
      try {
        const response = await fetch(`/api/courses/${initialState.course.id}/presentation`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "保存失败");
        if (sequence === saveSequence.current) {
          setSavedPresentation(value);
          setSaveStatus("saved");
        }
        return true;
      } catch (reason) {
        if (sequence === saveSequence.current) {
          setSaveStatus("failed");
          setError(reason instanceof Error ? reason.message : "保存失败");
        }
        return false;
      }
    },
    [initialState.course.id],
  );

  useEffect(() => {
    if (!hasChanges) return;
    const timer = window.setTimeout(() => void save(presentation), 800);
    return () => window.clearTimeout(timer);
  }, [hasChanges, presentation, save]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasChanges || pending === "pdf") event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasChanges, pending]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(pdfStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as StoredPdfExport;
      if (!Number.isFinite(parsed.completedPages) || !Number.isFinite(parsed.totalPages)) return;
      const timer = window.setTimeout(() => setInterruptedPdf(parsed), 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.sessionStorage.removeItem(pdfStorageKey);
    }
  }, [pdfStorageKey]);

  useEffect(() => {
    if (pending !== "pdf") return;
    const updateElapsed = () => setPdfElapsedSeconds(Math.floor((Date.now() - pdfStartedAt.current) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [pending]);

  useEffect(
    () => () => {
      if (pdfResultTimer.current !== null) window.clearTimeout(pdfResultTimer.current);
    },
    [],
  );

  function closePdfResult() {
    if (pdfResultTimer.current !== null) window.clearTimeout(pdfResultTimer.current);
    pdfResultTimer.current = null;
    setPdfNotice(null);
    setPdfOutcome(null);
    setPdfProgress(null);
  }

  function showPdfResult(outcome: "success" | "cancelled", message: string) {
    setPdfOutcome(outcome);
    setPdfNotice(message);
    pdfResultTimer.current = window.setTimeout(closePdfResult, 2_500);
  }

  async function navigate(href: string) {
    if (pending === "pdf") return;
    if (hasChanges && !(await save(presentation))) return;
    router.push(href);
  }

  async function publish() {
    setPending("publish");
    setError(null);
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(presentation),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "发布失败");
      setSavedPresentation(presentation);
      setShowPublishConfirm(false);
      window.open(result.redirectUrl, "_blank");
      router.push("/courses");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setPending(null);
    }
  }

  async function downloadPdf(exportMode: CoursePdfMode) {
    if (pending === "pdf") return;
    const controller = new AbortController();
    if (pdfResultTimer.current !== null) window.clearTimeout(pdfResultTimer.current);
    pdfAbortController.current = controller;
    pdfStartedAt.current = Date.now();
    setPending("pdf");
    setError(null);
    setPdfNotice(null);
    setPdfOutcome(null);
    setPdfCancelling(false);
    setPdfProgress(null);
    setInterruptedPdf(null);
    setPdfElapsedSeconds(0);
    try {
      const suffix = exportMode === "content_and_exercises" ? "-正文与习题" : "";
      const result = await exportSlidesToPDF(".preview-deck-pdf", `${initialState.course.title.replace(/[\\/:*?"<>|]/g, "_")}${suffix}.pdf`, {
        signal: controller.signal,
        onProgress: (progress) => {
          setPdfProgress(progress);
          window.sessionStorage.setItem(
            pdfStorageKey,
            JSON.stringify({
              completedPages: progress.completedPages,
              totalPages: progress.totalPages,
              mode: exportMode,
              startedAt: pdfStartedAt.current,
            } satisfies StoredPdfExport),
          );
        },
      });
      showPdfResult("success", `PDF 已下载，共 ${result.pageCount} 页，用时 ${Math.max(1, Math.ceil((Date.now() - pdfStartedAt.current) / 1000))} 秒。`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") showPdfResult("cancelled", "PDF 导出已取消，未生成下载文件。");
      else {
        setPdfProgress(null);
        setError(reason instanceof Error ? reason.message : "PDF 下载失败");
      }
    } finally {
      window.sessionStorage.removeItem(pdfStorageKey);
      pdfAbortController.current = null;
      setPdfCancelling(false);
      setPending(null);
    }
  }

  async function startPdfExport(exportMode: CoursePdfMode) {
    setPdfMode(exportMode);
    setShowPdfModeDialog(false);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await downloadPdf(exportMode);
  }

  function updateTextBox(field: "fontSize" | "opacity", value: number) {
    if (!selectedPage || !["shot_text", "grammar_practice", "main_idea", "vocabulary_matching"].includes(selectedPage.type)) return;
    setPresentation((current) => ({
      ...current,
      slideOverrides: {
        ...current.slideOverrides,
        [selectedPage.id]: {
          textBox: {
            ...current.slideOverrides[selectedPage.id]?.textBox,
            [field]: value,
          },
        },
      },
    }));
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <CourseCreateSteps courseId={initialState.course.id} currentStep={6} furthestStep={6} onNavigate={(href) => void navigate(href)} />
      <CourseStaleNotice staleFromStage={initialState.course.staleFromStage} stage="preview" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button disabled={pending === "pdf"} onClick={() => void navigate(`/courses/${initialState.course.id}/create/visual-resources`)} size="sm" variant="outline">
              <ArrowLeft />
              返回视觉资源
            </Button>
            <Button disabled={pending === "pdf"} onClick={() => void navigate("/courses")} size="sm" variant="ghost">
              <LayoutList />
              返回课程列表
            </Button>
          </div>
          <h1 className="text-xl font-semibold">课程预览与发布</h1>
          <p className="mt-2 text-sm text-muted-foreground">检查课件页面和练习题型，确认后发布进入授课模式。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className={cn("text-xs font-medium", displaySaveStatus === "failed" ? "text-destructive" : displaySaveStatus === "saving" ? "text-primary" : "text-muted-foreground")}>
            {displaySaveStatus === "dirty" ? "待自动保存" : displaySaveStatus === "saving" ? "正在自动保存…" : displaySaveStatus === "failed" ? "自动保存失败" : "已自动保存"}
          </span>
          <div className="inline-flex overflow-hidden rounded-lg border text-sm">
            <button aria-label="课件预览" className={cn("min-h-11 px-4 py-2 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50", mode === "html" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")} disabled={pending === "pdf"} onClick={() => setMode("html")} type="button">
              课件预览
            </button>
            <button aria-label="打印预览" className={cn("min-h-11 px-4 py-2 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50", mode === "pdf" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")} disabled={pending === "pdf"} onClick={() => setMode("pdf")} type="button">
              打印预览
            </button>
          </div>
          {mode === "pdf" ? (
            <Button disabled={pending === "pdf"} onClick={() => setShowPdfModeDialog(true)} size="sm" variant="outline">
              <Download />
              {pending === "pdf" ? "正在导出" : "下载 PDF"}
            </Button>
          ) : null}
          <Button disabled={pending === "pdf" || (!hasChanges && displaySaveStatus !== "failed")} loading={displaySaveStatus === "saving"} onClick={() => void save(presentation)} size="sm" variant="outline">
            <Save />
            {displaySaveStatus === "failed" ? "重试保存" : "保存草稿"}
          </Button>
          <Button disabled={pending === "pdf" || Boolean(initialState.course.staleFromStage && initialState.course.staleFromStage !== "preview")} onClick={() => setShowPublishConfirm(true)} size="sm">
            <Send />
            发布课程
          </Button>
        </div>
      </div>
      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {interruptedPdf ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-50 px-4 py-3 text-sm">
          <span>
            上次 PDF 导出在第 {interruptedPdf.completedPages}/{interruptedPdf.totalPages} 页后中断，未生成下载文件。
          </span>
          <Button onClick={() => (mode === "pdf" ? void startPdfExport(interruptedPdf.mode ?? "all") : setMode("pdf"))} size="sm" variant="outline">
            {mode === "pdf" ? "重新导出" : "前往打印预览"}
          </Button>
        </div>
      ) : null}
      {mode === "html" ? (
        <div className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm lg:flex-row" data-testid="preview-workbench">
          <section className="min-w-0 flex-1 p-3 sm:p-6" data-testid="preview-slide-region">
            <div className="mx-auto h-[58dvh] min-h-[280px] max-w-4xl sm:h-[calc(100vh-22rem)] sm:min-h-[440px]" data-testid="preview-slide-frame">
              <CourseSlideDeck onSelectPage={setSelectedPageId} pages={initialState.pages} presentation={presentation} selectedPageId={selectedPageId} />
            </div>
          </section>
          <aside className="w-full shrink-0 border-t p-5 lg:w-80 lg:border-l lg:border-t-0" data-testid="preview-style-panel">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">课件样式</h2>
              {hasChanges ? <span aria-label="有未保存更改" className="size-2 rounded-full bg-amber-500" /> : null}
            </div>
            {selectedPage && ["shot_text", "grammar_practice", "main_idea", "vocabulary_matching"].includes(selectedPage.type) ? (
              <div className="space-y-5">
                <span className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">当前文本页</span>
                <label className="block text-sm font-medium">
                  本页字号：
                  {Math.round((presentation.slideOverrides[selectedPage.id]?.textBox?.fontSize ?? (selectedPage.type === "shot_text" ? selectedPage.textBox.fontSize : 1)) * 100)}
                  %
                  <input aria-label="本页字号" className="mt-2 w-full accent-indigo-600" max="1.3" min="0.7" onChange={(event) => updateTextBox("fontSize", Number(event.target.value))} step="0.05" type="range" value={presentation.slideOverrides[selectedPage.id]?.textBox?.fontSize ?? (selectedPage.type === "shot_text" ? selectedPage.textBox.fontSize : 1)} />
                </label>
                {selectedPage.type === "shot_text" ? (
                  <label className="block text-sm font-medium">
                    背景透明度
                    <input className="mt-2 w-full accent-indigo-600" max="1" min="0.5" onChange={(event) => updateTextBox("opacity", Number(event.target.value))} step="0.05" type="range" value={presentation.slideOverrides[selectedPage.id]?.textBox?.opacity ?? selectedPage.textBox.opacity} />
                  </label>
                ) : null}
                <Button
                  className="w-full"
                  onClick={() =>
                    setPresentation((current) => {
                      const slideOverrides = { ...current.slideOverrides };
                      delete slideOverrides[selectedPage.id];
                      return { ...current, slideOverrides };
                    })
                  }
                  variant="outline"
                >
                  重置本页样式
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-muted-foreground">点击正文、习题、课后阅读或词汇页，可单独调整该页字号。</p>
                <section>
                  <h3 className="mb-3 text-sm font-semibold">默认封面样式</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {coverThemes.map((theme) => (
                      <button
                        className={cn("rounded-lg border-2 bg-slate-700 py-4 text-xs text-white", presentation.coverTheme === theme.id && "border-indigo-500 ring-2 ring-indigo-200")}
                        key={theme.id}
                        onClick={() =>
                          setPresentation((current) => ({
                            ...current,
                            coverTheme: theme.id,
                          }))
                        }
                        type="button"
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-4 block text-sm">
                    标题字号
                    <input
                      className="mt-2 w-full accent-indigo-600"
                      max="1.4"
                      min="0.7"
                      onChange={(event) =>
                        setPresentation((current) => ({
                          ...current,
                          coverTitleFontSize: Number(event.target.value),
                        }))
                      }
                      step="0.05"
                      type="range"
                      value={presentation.coverTitleFontSize}
                    />
                  </label>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold">章节配色</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {chapterThemes.map((theme) => (
                      <button
                        className={cn("rounded-lg border-2 py-3 text-xs text-white", `theme-${theme.id}`, presentation.chapterTheme === theme.id && "border-indigo-500 ring-2 ring-indigo-200")}
                        key={theme.id}
                        onClick={() =>
                          setPresentation((current) => ({
                            ...current,
                            chapterTheme: theme.id,
                          }))
                        }
                        type="button"
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">打印内容</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{pdfMode === "all" ? "显示完整课件的全部页面" : "显示正文、章节练习、课后阅读和课后练习"}</p>
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border bg-card text-sm">
                <button aria-label="切换为完整打印预览" aria-pressed={pdfMode === "all"} className={cn("min-h-10 px-3 py-2 transition", pdfMode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} disabled={pending === "pdf"} onClick={() => setPdfMode("all")} type="button">
                  全部页面
                </button>
                <button aria-label="切换为精简打印预览" aria-pressed={pdfMode === "content_and_exercises"} className={cn("min-h-10 px-3 py-2 transition", pdfMode === "content_and_exercises" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} disabled={pending === "pdf"} onClick={() => setPdfMode("content_and_exercises")} type="button">
                  仅正文与习题
                </button>
              </div>
            </div>
            <CourseSlideDeck pdfBackgroundMode={pdfMode === "content_and_exercises" ? "plain" : "image"} pages={pdfPages} presentation={presentation} showAllPages />
          </div>
        </div>
      )}
      <Dialog description="选择适合当前使用场景的页面范围" onClose={() => setShowPdfModeDialog(false)} open={showPdfModeDialog} size="compact" title="下载 PDF">
        <div className="grid gap-3 p-5 sm:p-6">
          <button className="rounded-xl border border-border p-4 text-left transition hover:border-primary/50 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void startPdfExport("all")} type="button">
            <span className="font-semibold text-foreground">全部页面</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">包含封面、章节页、图片、正文和全部练习。</span>
          </button>
          <button className="rounded-xl border border-primary/30 bg-primary-50 p-4 text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void startPdfExport("content_and_exercises")} type="button">
            <span className="flex items-center gap-2 font-semibold text-foreground">
              仅正文与习题
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">适合打印</span>
            </span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">只保留正文、章节练习、课后阅读和课后练习；正文改为白色背景。</span>
          </button>
        </div>
      </Dialog>
      {showPublishConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">确认发布课程？</h2>
            <p className="mt-2 text-sm text-muted-foreground">将保存当前版式并打开授课页。发布失败时课程仍保留当前状态，可直接重试。</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={pending === "publish"} onClick={() => setShowPublishConfirm(false)} variant="outline">
                取消
              </Button>
              <Button loading={pending === "publish"} onClick={publish}>
                确认发布
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {pdfProgress && (pending === "pdf" || pdfOutcome) ? (
        <aside aria-label="PDF 导出进度" aria-live="polite" className={cn("animate-fade-in fixed bottom-5 right-5 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-lg", pdfOutcome === "success" && "border-success/40", pdfOutcome === "cancelled" && "border-border")} role="status">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{pdfOutcome === "success" ? "导出完成" : pdfOutcome === "cancelled" ? "已取消导出" : "正在导出 PDF"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{pdfOutcome ? pdfNotice : pdfCancelling ? "正在取消，完成当前页后停止" : pdfProgressLabel(pdfProgress)}</p>
            </div>
            {pdfOutcome ? (
              <Button aria-label="关闭 PDF 导出结果" className="-mr-2 -mt-2" onClick={closePdfResult} size="sm" variant="ghost">
                关闭
              </Button>
            ) : (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pdfElapsedSeconds} 秒</span>
            )}
          </div>
          <div aria-label="PDF 导出进度" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round((pdfProgress.completedPages / Math.max(1, pdfProgress.totalPages)) * 100)} className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar">
            <div
              className={cn("h-full rounded-full bg-primary", pdfOutcome === "success" && "bg-success")}
              style={{
                width: `${(pdfProgress.completedPages / Math.max(1, pdfProgress.totalPages)) * 100}%`,
              }}
            />
          </div>
          {!pdfOutcome ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">请保持此页面打开；刷新会中断导出。</p>
              {pdfProgress.phase === "preparing" || pdfProgress.phase === "rendering" ? (
                <Button
                  aria-label="取消导出"
                  disabled={pdfCancelling}
                  onClick={() => {
                    setPdfCancelling(true);
                    pdfAbortController.current?.abort();
                  }}
                  size="sm"
                  variant="outline"
                >
                  {pdfCancelling ? "取消中" : "取消"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}
