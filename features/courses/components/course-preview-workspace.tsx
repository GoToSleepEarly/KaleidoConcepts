"use client";

import { ArrowLeft, Download, LayoutList, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import { CourseSlideDeck } from "@/features/courses/components/course-slide-deck";
import type { CoursePreviewResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";
import { exportSlidesToPDF } from "@/lib/utils/pdf-export";

const coverThemes = [{ id: "dark", label: "深色" }, { id: "warm", label: "暖色" }, { id: "light", label: "浅色" }];
const chapterThemes = [{ id: "blue-purple", label: "蓝紫" }, { id: "green-teal", label: "青竹" }, { id: "orange-red", label: "橙红" }, { id: "purple-pink", label: "紫粉" }, { id: "blue-indigo", label: "蓝靛" }];

export function CoursePreviewWorkspace({ initialState }: { initialState: CoursePreviewResponse }) {
  const router = useRouter();
  const [mode, setMode] = useState<"html" | "pdf">("html");
  const [presentation, setPresentation] = useState(initialState.presentation);
  const [savedPresentation, setSavedPresentation] = useState(initialState.presentation);
  const [saveStatus, setSaveStatus] = useState<"saved" | "dirty" | "saving" | "failed">("saved");
  const [selectedPageId, setSelectedPageId] = useState<string>();
  const [pending, setPending] = useState<"publish" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const hasChanges = JSON.stringify(presentation) !== JSON.stringify(savedPresentation);
  const displaySaveStatus = hasChanges && saveStatus === "saved" ? "dirty" : saveStatus;
  const saveSequence = useRef(0);
  const selectedPage = useMemo(() => initialState.pages.find((page) => page.id === selectedPageId), [initialState.pages, selectedPageId]);

  const save = useCallback(async (value: CoursePreviewResponse["presentation"]) => {
    const sequence = ++saveSequence.current;
    setSaveStatus("saving"); setError(null);
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/presentation`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "保存失败");
      if (sequence === saveSequence.current) { setSavedPresentation(value); setSaveStatus("saved"); }
      return true;
    } catch (reason) { if (sequence === saveSequence.current) { setSaveStatus("failed"); setError(reason instanceof Error ? reason.message : "保存失败"); } return false; }
  }, [initialState.course.id]);

  useEffect(() => {
    if (!hasChanges) return;
    const timer = window.setTimeout(() => void save(presentation), 800);
    return () => window.clearTimeout(timer);
  }, [hasChanges, presentation, save]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasChanges) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasChanges]);

  async function navigate(href: string) {
    if (hasChanges && !(await save(presentation))) return;
    router.push(href);
  }

  async function publish() {
    setPending("publish"); setError(null);
    try {
      const response = await fetch(`/api/courses/${initialState.course.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(presentation) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "发布失败");
      setSavedPresentation(presentation); setShowPublishConfirm(false);
      window.open(result.redirectUrl, "_blank"); router.push("/courses");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发布失败"); } finally { setPending(null); }
  }

  async function downloadPdf() {
    setPending("pdf"); setError(null);
    try { await exportSlidesToPDF(".preview-deck-pdf", `${initialState.course.title.replace(/[\\/:*?"<>|]/g, "_")}.pdf`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "PDF 下载失败"); }
    finally { setPending(null); }
  }

  function updateTextBox(field: "fontSize" | "opacity", value: number) {
    if (!selectedPage || !["shot_text", "grammar_practice", "main_idea", "vocabulary_matching"].includes(selectedPage.type)) return;
    setPresentation((current) => ({ ...current, slideOverrides: { ...current.slideOverrides, [selectedPage.id]: { textBox: { ...current.slideOverrides[selectedPage.id]?.textBox, [field]: value } } } }));
  }

  return <main className="mx-auto max-w-6xl space-y-6">
    <CourseCreateSteps courseId={initialState.course.id} currentStep={6} furthestStep={6} onNavigate={(href) => void navigate(href)} />
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-4 flex flex-wrap gap-2"><Button onClick={() => void navigate(`/courses/${initialState.course.id}/create/visual-resources`)} size="sm" variant="outline"><ArrowLeft />返回视觉资源</Button><Button onClick={() => void navigate("/courses")} size="sm" variant="ghost"><LayoutList />返回课程列表</Button></div><h1 className="text-xl font-semibold">课程预览与发布</h1><p className="mt-2 text-sm text-muted-foreground">检查课件页面和练习题型，确认后发布进入授课模式。</p></div><div className="flex flex-wrap items-center gap-2"><span aria-live="polite" className={cn("text-xs font-medium", displaySaveStatus === "failed" ? "text-destructive" : displaySaveStatus === "saving" ? "text-primary" : "text-muted-foreground")}>{displaySaveStatus === "dirty" ? "待自动保存" : displaySaveStatus === "saving" ? "正在自动保存…" : displaySaveStatus === "failed" ? "自动保存失败" : "已自动保存"}</span><div className="inline-flex overflow-hidden rounded-lg border text-sm"><button aria-label="课件预览" className={cn("min-h-11 px-4 py-2 transition active:scale-[0.98]", mode === "html" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")} onClick={() => setMode("html")} type="button">课件预览</button><button aria-label="打印预览" className={cn("min-h-11 px-4 py-2 transition active:scale-[0.98]", mode === "pdf" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")} onClick={() => setMode("pdf")} type="button">打印预览</button></div>{mode === "pdf" ? <Button loading={pending === "pdf"} onClick={downloadPdf} size="sm" variant="outline"><Download />下载 PDF</Button> : null}<Button disabled={!hasChanges && displaySaveStatus !== "failed"} loading={displaySaveStatus === "saving"} onClick={() => void save(presentation)} size="sm" variant="outline"><Save />{displaySaveStatus === "failed" ? "重试保存" : "保存草稿"}</Button><Button onClick={() => setShowPublishConfirm(true)} size="sm"><Send />发布课程</Button></div></div>
    {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
    {mode === "html" ? <div className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm lg:flex-row" data-testid="preview-workbench"><section className="min-w-0 flex-1 p-3 sm:p-6" data-testid="preview-slide-region"><div className="mx-auto h-[58dvh] min-h-[280px] max-w-4xl sm:h-[calc(100vh-22rem)] sm:min-h-[440px]" data-testid="preview-slide-frame"><CourseSlideDeck onSelectPage={setSelectedPageId} pages={initialState.pages} presentation={presentation} selectedPageId={selectedPageId} /></div></section><aside className="w-full shrink-0 border-t p-5 lg:w-80 lg:border-l lg:border-t-0" data-testid="preview-style-panel"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">课件样式</h2>{hasChanges ? <span aria-label="有未保存更改" className="size-2 rounded-full bg-amber-500" /> : null}</div>{selectedPage && ["shot_text", "grammar_practice", "main_idea", "vocabulary_matching"].includes(selectedPage.type) ? <div className="space-y-5"><span className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">当前文本页</span><label className="block text-sm font-medium">本页字号：{Math.round((presentation.slideOverrides[selectedPage.id]?.textBox?.fontSize ?? (selectedPage.type === "shot_text" ? selectedPage.textBox.fontSize : 1)) * 100)}%<input aria-label="本页字号" className="mt-2 w-full accent-indigo-600" max="1.3" min="0.7" onChange={(event) => updateTextBox("fontSize", Number(event.target.value))} step="0.05" type="range" value={presentation.slideOverrides[selectedPage.id]?.textBox?.fontSize ?? (selectedPage.type === "shot_text" ? selectedPage.textBox.fontSize : 1)} /></label>{selectedPage.type === "shot_text" ? <label className="block text-sm font-medium">背景透明度<input className="mt-2 w-full accent-indigo-600" max="1" min="0.5" onChange={(event) => updateTextBox("opacity", Number(event.target.value))} step="0.05" type="range" value={presentation.slideOverrides[selectedPage.id]?.textBox?.opacity ?? selectedPage.textBox.opacity} /></label> : null}<Button className="w-full" onClick={() => setPresentation((current) => { const slideOverrides = { ...current.slideOverrides }; delete slideOverrides[selectedPage.id]; return { ...current, slideOverrides }; })} variant="outline">重置本页样式</Button></div> : <div className="space-y-6"><p className="text-xs text-muted-foreground">点击正文、习题、课后阅读或词汇页，可单独调整该页字号。</p><section><h3 className="mb-3 text-sm font-semibold">默认封面样式</h3><div className="grid grid-cols-3 gap-2">{coverThemes.map((theme) => <button className={cn("rounded-lg border-2 bg-slate-700 py-4 text-xs text-white", presentation.coverTheme === theme.id && "border-indigo-500 ring-2 ring-indigo-200")} key={theme.id} onClick={() => setPresentation((current) => ({ ...current, coverTheme: theme.id }))} type="button">{theme.label}</button>)}</div><label className="mt-4 block text-sm">标题字号<input className="mt-2 w-full accent-indigo-600" max="1.4" min="0.7" onChange={(event) => setPresentation((current) => ({ ...current, coverTitleFontSize: Number(event.target.value) }))} step="0.05" type="range" value={presentation.coverTitleFontSize} /></label></section><section><h3 className="mb-3 text-sm font-semibold">章节配色</h3><div className="grid grid-cols-3 gap-2">{chapterThemes.map((theme) => <button className={cn("rounded-lg border-2 py-3 text-xs text-white", `theme-${theme.id}`, presentation.chapterTheme === theme.id && "border-indigo-500 ring-2 ring-indigo-200")} key={theme.id} onClick={() => setPresentation((current) => ({ ...current, chapterTheme: theme.id }))} type="button">{theme.label}</button>)}</div></section></div>}</aside></div> : <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6"><div className="mx-auto max-w-4xl"><CourseSlideDeck pages={initialState.pages} presentation={presentation} showAllPages /></div></div>}
    {showPublishConfirm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl"><h2 className="text-lg font-semibold">确认发布课程？</h2><p className="mt-2 text-sm text-muted-foreground">将保存当前版式并打开授课页。发布失败时课程仍保留当前状态，可直接重试。</p><div className="mt-5 flex justify-end gap-2"><Button disabled={pending === "publish"} onClick={() => setShowPublishConfirm(false)} variant="outline">取消</Button><Button loading={pending === "publish"} onClick={publish}>确认发布</Button></div></div></div> : null}
  </main>;
}
