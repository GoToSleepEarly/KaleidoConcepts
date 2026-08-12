"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Image from "next/image";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CoursePresentationConfig, CoursePreviewKnowledgePoint, CoursePreviewPage, CoursePreviewReadingPart } from "@/lib/contracts/api";
import { vocabularyMatchingMeanings } from "@/lib/domain/course-preview";
import { cn } from "@/lib/utils";

const typeLabels: Record<CoursePreviewPage["type"], string> = {
  cover_pure: "纯封面", cover_title: "标题封面", chapter_divider: "章节标题",
  shot_image: "绘本图片", shot_text: "正文阅读", grammar_practice: "语法练习",
  main_idea: "课后阅读", vocabulary_matching: "词汇配对",
};
const pointColors = [
  { chip: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500", text: "text-violet-700", line: "border-violet-400", soft: "bg-violet-50/70" },
  { chip: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500", text: "text-blue-700", line: "border-blue-400", soft: "bg-blue-50/70" },
  { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", text: "text-emerald-700", line: "border-emerald-400", soft: "bg-emerald-50/70" },
  { chip: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500", text: "text-rose-700", line: "border-rose-400", soft: "bg-rose-50/70" },
  { chip: "border-cyan-200 bg-cyan-50 text-cyan-700", dot: "bg-cyan-500", text: "text-cyan-700", line: "border-cyan-400", soft: "bg-cyan-50/70" },
] as const;
const vocabularyColor = { chip: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500", text: "text-amber-700", line: "border-amber-400", soft: "bg-amber-50/70" };
export type PreviewSlideAnswerMode = "interactive" | "hidden";
export type PreviewSlideBackgroundMode = "image" | "plain";

function bilingualTitle(value: string) {
  const [first, ...rest] = value.split(/\s+\/\s+/);
  const second = rest.join(" / ").trim();
  return { primary: first.trim() || value, secondary: second && second !== first.trim() ? second : "" };
}

function isGenericChapterLabel(value: string, order: number) {
  return new RegExp(`^chapter\\s*0*${order}$`, "i").test(value.trim());
}

function pointColor(points: CoursePreviewKnowledgePoint[], id: string | null) {
  if (!id) return vocabularyColor;
  const index = Math.max(0, points.findIndex((point) => point.id === id));
  return pointColors[index % pointColors.length];
}

function KnowledgeLegend({ points, includeVocabulary = false }: { points: CoursePreviewKnowledgePoint[]; includeVocabulary?: boolean }) {
  if (!points.length && !includeVocabulary) return null;
  return <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-[1.4cqw] rounded-[0.9cqw] bg-slate-50/95 px-[1.4cqw] py-[1cqw]" aria-label="本章考查知识点"><span className="whitespace-nowrap pt-[0.05cqw] text-[1.05cqw] font-semibold text-slate-500">本章考查</span><div className="flex min-w-0 flex-wrap gap-x-[1.5cqw] gap-y-[0.7cqw]">{points.map((point) => { const color = pointColor(points, point.id); return <span className={cn("inline-flex items-center gap-[0.55cqw] text-[1.08cqw] font-semibold", color.text)} key={point.id}><i aria-hidden className={cn("size-[0.55cqw] shrink-0 rounded-full", color.dot)} />{point.label}</span>; })}{includeVocabulary ? <span className={cn("inline-flex items-center gap-[0.55cqw] text-[1.08cqw] font-semibold", vocabularyColor.text)}><i aria-hidden className={cn("size-[0.55cqw] shrink-0 rounded-full", vocabularyColor.dot)} />词汇</span> : null}</div></div>;
}

function ImageLayer({ url, dim = false }: { url: string | null; dim?: boolean }) {
  return url ? <><Image alt="课件插图" className="object-cover" fill sizes="(max-width: 1200px) 80vw, 900px" src={url} unoptimized />{dim ? <span className="absolute inset-0 bg-slate-950/35" /> : null}</> : <div className="absolute inset-0 flex items-center justify-center bg-slate-200 text-sm text-slate-500">图片尚未采用</div>;
}

function AutoFit({ children, className, fontScale = 1, maxScale = 1 }: { children: React.ReactNode; className?: string; fontScale?: number; maxScale?: number }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const fit = () => {
      let scale = maxScale;
      outer.style.setProperty("--auto-fit-scale", String(scale));
      while (scale > 0.58 && (inner.scrollHeight > outer.clientHeight + 1 || inner.scrollWidth > outer.clientWidth + 1)) {
        scale = Math.max(0.58, scale - 0.04);
        outer.style.setProperty("--auto-fit-scale", String(scale));
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [children, fontScale, maxScale]);
  return <div className={cn("min-h-0 overflow-hidden", className)} ref={outerRef} style={{ "--page-scale": fontScale, "--auto-fit-scale": maxScale } as React.CSSProperties}><div ref={innerRef}>{children}</div></div>;
}

function ExerciseToken({ part, points, answerMode, complete, revealed, onToggle }: { part: Extract<CoursePreviewReadingPart, { type: "exercise" }>; points: CoursePreviewKnowledgePoint[]; answerMode: PreviewSlideAnswerMode; complete: boolean; revealed: boolean; onToggle: () => void }) {
  const color = pointColor(points, part.knowledgePointId);
  const hint = part.exerciseType === "wordForm" || part.exerciseType === "vocabulary" ? part.hint : part.options?.join(" / ");
  if (complete) return <>{part.spaceBefore ? " " : null}<span className="inline-flex items-baseline whitespace-nowrap"><span className={cn("rounded px-1.5 py-0.5 font-semibold ring-1 ring-inset", color.chip)}>{part.answer}</span>{part.exerciseType === "vocabulary" && part.hint ? <span className="ml-[0.18em] text-[0.78em] font-medium text-slate-600">（{part.hint}）</span> : null}</span></>;
  return <span className="mx-1 inline-flex items-baseline gap-1 whitespace-nowrap align-baseline">{part.spaceBefore ? " " : ""}<span className={cn("text-[0.72em] font-semibold", color.text)}>({part.number})</span>{answerMode === "interactive" ? <button aria-label={revealed ? `隐藏答案 ${part.number}` : `显示答案 ${part.number}`} className={cn("inline-flex min-w-[4.5em] items-center justify-center border-b-2 px-1 font-semibold transition active:translate-y-px", color.line, revealed && color.soft, color.text)} onClick={(event) => { event.stopPropagation(); onToggle(); }} type="button">{revealed ? part.answer : "\u00A0"}</button> : <span className={cn("inline-flex min-w-[4.5em] items-center justify-center border-b-2 px-1 font-semibold", color.line, color.text)}>&nbsp;</span>}{hint ? <span className={cn("text-[0.76em]", color.text)}>({hint})</span> : null}</span>;
}

function ReadingParts({ page, answerMode }: { page: Extract<CoursePreviewPage, { type: "shot_text" }>; answerMode: PreviewSlideAnswerMode }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const complete = page.readingExerciseMode === "complete";
  return <p>{page.parts.map((part, index) => part.type === "text" ? <span key={index}>{part.text}</span> : <ExerciseToken answerMode={answerMode} complete={complete} key={part.id} onToggle={() => setRevealed((current) => { const next = new Set(current); if (next.has(part.id)) next.delete(part.id); else next.add(part.id); return next; })} part={part} points={page.knowledgePoints} revealed={revealed.has(part.id)} />)}</p>;
}

function PracticePage({ page, answerMode, fontScale }: { page: Extract<CoursePreviewPage, { type: "grammar_practice" }>; answerMode: PreviewSlideAnswerMode; fontScale: number }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const label = page.exerciseType === "optionCloze" ? "选词填空" : "词形变化";
  return <div className="flex h-full w-full flex-col p-[5cqw] text-slate-800" style={{ backgroundColor: "#fffdf8" }}><div className="mb-[2cqw] flex items-end justify-between border-b border-slate-200 pb-[1.5cqw]"><div>{page.scope === "homework" ? <p className="text-[1.25cqw] font-medium uppercase tracking-[0.18em] text-indigo-500">After-class Practice</p> : <><p className="text-[1.35cqw] font-semibold text-indigo-600">{page.chapterTitleZh}</p>{page.chapterTitleEn ? <p className="mt-[0.2cqw] text-[1.05cqw] font-medium tracking-[0.08em] text-slate-500">{page.chapterTitleEn}</p> : null}</>}<h2 className="mt-[0.5cqw] text-[3.4cqw] font-bold">{label}</h2></div><span className="rounded-full bg-indigo-50 px-[1.2cqw] py-[0.5cqw] text-[1.15cqw] font-semibold text-indigo-700">{page.pageNumber}</span></div><KnowledgeLegend points={page.knowledgePoints} /><AutoFit className="mt-[1.8cqw] flex-1" fontScale={fontScale}><ol className="grid gap-[1.35cqw] text-[calc(1.85cqw*var(--page-scale)*var(--auto-fit-scale))] leading-[1.55]">{page.questions.map((question, index) => { const number = page.questionStartNumber + index; const color = pointColor(page.knowledgePoints, question.knowledgePointId); const shown = revealed.has(question.id); const hint = question.type === "wordForm" ? question.baseForm : question.options?.join(" / "); return <li className={cn("flex gap-[1cqw] rounded-[0.7cqw] px-[0.8cqw] py-[0.45cqw]", color.soft)} key={question.id}><span className={cn("font-semibold", color.text)}>{number}.</span><span>{question.before}{answerMode === "interactive" ? <button aria-label={shown ? `隐藏第 ${number} 题答案` : `显示第 ${number} 题答案`} className={cn("mx-1 inline-flex min-w-[7cqw] items-center justify-center border-b-2 px-1 font-semibold transition active:translate-y-px", color.line, color.text)} onClick={(event) => { event.stopPropagation(); setRevealed((current) => { const next = new Set(current); if (next.has(question.id)) next.delete(question.id); else next.add(question.id); return next; }); }} type="button">{shown ? question.answer : "\u00A0"}</button> : <span className={cn("mx-1 inline-flex min-w-[7cqw] items-center justify-center border-b-2 px-1 font-semibold", color.line, color.text)}>&nbsp;</span>}<span className={cn("text-[0.76em]", color.text)}>({hint})</span>{/^\s|^[,.;:!?)]/.test(question.after) ? "" : " "}{question.after}</span></li>; })}</ol></AutoFit></div>;
}

function VocabularyMatchingPage({ page, answerMode, fontScale }: { page: Extract<CoursePreviewPage, { type: "vocabulary_matching" }>; answerMode: PreviewSlideAnswerMode; fontScale: number }) {
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const meanings = vocabularyMatchingMeanings(page.items);
  const connectedMeaningIds = new Set([...connected]);
  const interactive = answerMode === "interactive";
  return <div className="flex h-full w-full flex-col p-[5.5cqw] text-slate-800" style={{ backgroundColor: "#fffdf8" }}><p className="text-[1.35cqw] font-medium uppercase tracking-[0.2em] text-indigo-500">After-class Practice</p><div className="flex items-end justify-between"><h2 className="mt-[0.6cqw] text-[3.7cqw] font-bold">词汇配对</h2><span className="text-[1.05cqw] text-slate-500">{interactive ? "点击英文词汇自动连线" : "连接英文与中文释义"}</span></div><AutoFit className="mt-[2.2cqw] flex-1" fontScale={fontScale}><div className="relative grid min-h-[28cqw] grid-cols-[minmax(0,1fr)_10cqw_minmax(0,1fr)] text-[calc(1.85cqw*var(--page-scale)*var(--auto-fit-scale))]" style={{ gridTemplateRows: `repeat(${Math.max(1, page.items.length)}, minmax(0, 1fr))` }}><svg className="pointer-events-none absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">{interactive ? page.items.map((item, index) => { if (!connected.has(item.id)) return null; const targetIndex = meanings.findIndex((meaning) => meaning.id === item.id); const y1 = ((index + 0.5) / page.items.length) * 100; const y2 = ((targetIndex + 0.5) / page.items.length) * 100; return <g aria-label={`${item.canonicalForm} 已连接到 ${item.meaningZh}`} key={item.id} role="img"><path d={`M 45 ${y1} C 48 ${y1}, 52 ${y2}, 55 ${y2}`} fill="none" opacity="0.78" stroke="#818cf8" strokeLinecap="round" strokeWidth="0.42" vectorEffect="non-scaling-stroke" /><circle cx="45" cy={y1} fill="#6366f1" r="0.55" /><circle cx="55" cy={y2} fill="#6366f1" r="0.55" /></g>; }) : null}</svg>{page.items.map((item, index) => { const active = connected.has(item.id); return interactive ? <button aria-label={active ? `取消 ${item.canonicalForm} 的连线` : `连接 ${item.canonicalForm} 到正确释义`} aria-pressed={active} className={cn("col-start-1 mx-[0.4cqw] my-[0.3cqw] flex min-h-[3.2cqw] items-center rounded-[0.7cqw] px-[1.2cqw] text-left font-semibold outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1", active ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-indigo-50/60 hover:text-indigo-700")} key={item.id} onClick={(event) => { event.stopPropagation(); setConnected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }} style={{ gridRow: index + 1 }} type="button"><span className="mr-[0.8cqw] text-[0.78em] text-slate-400">{index + 1}</span>{item.canonicalForm}</button> : <div className="col-start-1 mx-[0.4cqw] my-[0.3cqw] flex items-center rounded-[0.7cqw] bg-white px-[1.2cqw] font-semibold ring-1 ring-inset ring-slate-200" key={item.id} style={{ gridRow: index + 1 }}>{index + 1}. {item.canonicalForm}</div>; })}{meanings.map((item, index) => <div className={cn("col-start-3 mx-[0.4cqw] my-[0.3cqw] flex min-h-[3.2cqw] items-center rounded-[0.7cqw] px-[1.2cqw] transition duration-150 ring-1 ring-inset", connectedMeaningIds.has(item.id) ? "bg-indigo-50 font-semibold text-indigo-700 ring-indigo-200" : "bg-white ring-slate-200")} key={item.id} style={{ gridRow: index + 1 }}><span className="mr-[0.8cqw] text-[0.78em] text-slate-400">{String.fromCharCode(65 + index)}</span>{item.meaningZh}</div>)}</div></AutoFit></div>;
}

export function PreviewSlide({ page, presentation, mode = "html", answerMode = mode === "pdf" ? "hidden" : "interactive", backgroundMode = "image", selected, onSelect }: { page: CoursePreviewPage; presentation: CoursePresentationConfig; mode?: "html" | "pdf"; answerMode?: PreviewSlideAnswerMode; backgroundMode?: PreviewSlideBackgroundMode; selected?: boolean; onSelect?: () => void }) {
  const override = presentation.slideOverrides[page.id]?.textBox;
  const fontScale = override?.fontSize ?? (page.type === "shot_text" ? page.textBox.fontSize : 1);
  const frame = (children: React.ReactNode) => <div aria-label={typeLabels[page.type]} className={cn("preview-slide", onSelect && "cursor-pointer transition active:scale-[0.999]", selected && "ring-2 ring-inset ring-indigo-500")} onClick={onSelect}>{children}</div>;
  if (page.type === "cover_pure" || page.type === "shot_image") return frame(<ImageLayer url={page.image.publicUrl} />);
  if (page.type === "cover_title") {
    const light = presentation.coverTheme === "light";
    const title = bilingualTitle(page.title);
    return frame(<><ImageLayer dim={!light} url={page.image.publicUrl} /><div className={cn("slide-cover-title-content absolute inset-0 flex flex-col items-center justify-center text-center", light ? "bg-white/45 text-slate-900" : "bg-black/45 text-white")}><h1 className="max-w-[86%] text-[5.5cqw] font-bold leading-tight" style={{ fontSize: `${5.5 * presentation.coverTitleFontSize}cqw` }}>{title.primary}</h1>{title.secondary ? <p className="mt-[1cqw] max-w-[82%] text-[2.35cqw] font-medium tracking-[0.04em] opacity-90">{title.secondary}</p> : null}<div className="slide-cover-title-meta mt-[2cqw] space-y-[0.4cqw]"><p>{page.teacherName}</p><p>{page.studentNames.join(" · ")}</p></div></div></>);
  }
  if (page.type === "chapter_divider") return frame(<div className={cn("flex h-full flex-col items-center justify-center px-[8cqw] text-center text-white", `theme-${presentation.chapterTheme}`)}><span className="text-[1.7cqw] uppercase tracking-[0.28em] opacity-70">Chapter {String(page.chapterOrder).padStart(2, "0")}</span><h2 className="mt-[2cqw] max-w-[88%] text-[5cqw] font-bold leading-tight">{page.chapterTitleZh}</h2>{page.chapterTitleEn && !isGenericChapterLabel(page.chapterTitleEn, page.chapterOrder) ? <p className="mt-[1.2cqw] max-w-[76%] text-[2.25cqw] font-medium tracking-[0.04em] opacity-85">{page.chapterTitleEn}</p> : null}</div>);
  if (page.type === "shot_text") {
    const textBox = { ...page.textBox, ...override };
    return frame(<>{backgroundMode === "image" ? <ImageLayer dim url={page.image.publicUrl} /> : <div className="absolute inset-0 bg-[#fffdf8]" />}<div className="slide-text-box absolute inset-0 flex items-center justify-center"><div className="slide-text-box-inner flex w-[90%] flex-col rounded-[1.5cqw] bg-white p-[2.4cqw] text-slate-800 shadow-xl" style={{ opacity: backgroundMode === "image" ? textBox.opacity : 1 }}><KnowledgeLegend includeVocabulary={page.parts.some((part) => part.type === "exercise" && part.exerciseType === "vocabulary")} points={page.knowledgePoints} /><AutoFit className="slide-text-content mt-[1.5cqw] flex-1" fontScale={fontScale} maxScale={1.55}><ReadingParts answerMode={answerMode} page={page} /></AutoFit></div></div></>);
  }
  if (page.type === "grammar_practice") return frame(<PracticePage answerMode={answerMode} fontScale={fontScale} page={page} />);
  if (page.type === "main_idea") return frame(<div className="flex h-full w-full flex-col p-[7cqw] text-slate-800" style={{ backgroundColor: "#fffdf8" }}><p className="text-[1.35cqw] font-medium uppercase tracking-[0.2em] text-indigo-500">Main Idea Reading Practice</p><h2 className="mt-[0.8cqw] text-[4cqw] font-bold">{page.title}</h2><AutoFit className="mt-[3cqw] flex-1" fontScale={fontScale}><p className="text-[calc(2.05cqw*var(--page-scale)*var(--auto-fit-scale))] leading-[1.7]">{page.text}</p></AutoFit></div>);
  return frame(<VocabularyMatchingPage answerMode={answerMode} fontScale={fontScale} page={page} />);
}

export function CourseSlideDeck({ pages, presentation, showAllPages = false, selectedPageId, onSelectPage }: { pages: CoursePreviewPage[]; presentation: CoursePresentationConfig; showAllPages?: boolean; selectedPageId?: string; onSelectPage?: (id: string) => void }) {
  const [current, setCurrent] = useState(0);
  const goTo = useCallback((index: number) => setCurrent(Math.max(0, Math.min(pages.length - 1, index))), [pages.length]);
  useEffect(() => {
    if (!showAllPages && pages[current]) onSelectPage?.(pages[current].id);
  }, [current, onSelectPage, pages, showAllPages]);
  useEffect(() => {
    if (showAllPages) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, select, textarea, button") || target.isContentEditable)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); setCurrent((value) => Math.max(0, value - 1)); }
      if (event.key === "ArrowRight") { event.preventDefault(); setCurrent((value) => Math.min(pages.length - 1, value + 1)); }
      if (event.key === "Home") { event.preventDefault(); setCurrent(0); }
      if (event.key === "End") { event.preventDefault(); setCurrent(Math.max(0, pages.length - 1)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pages.length, showAllPages]);
  if (showAllPages) return <div className="preview-deck-pdf flex flex-col gap-4">{pages.map((page) => <div className="preview-slide-wrapper aspect-video overflow-hidden rounded-lg shadow" key={page.id}><PreviewSlide mode="pdf" page={page} presentation={presentation} /></div>)}</div>;
  const page = pages[current];
  const controlClass = "flex size-11 items-center justify-center rounded-full transition hover:bg-slate-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30";
  return <div className="relative flex h-full w-full items-center justify-center"><div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl">{page ? <PreviewSlide onSelect={() => onSelectPage?.(page.id)} page={page} presentation={presentation} selected={page.id === selectedPageId} /> : null}</div><div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-white/95 p-1.5 text-sm text-slate-700 shadow-lg backdrop-blur"><button aria-label="回到开头" className={controlClass} disabled={current === 0} onClick={() => goTo(0)} type="button"><RotateCcw className="size-5" /></button><button aria-label="上一页" className={controlClass} disabled={current === 0} onClick={() => goTo(current - 1)} type="button"><ChevronLeft className="size-6" /></button><span className="min-w-20 px-2 text-center font-medium tabular-nums">{current + 1} / {pages.length}</span><button aria-label="下一页" className={controlClass} disabled={current >= pages.length - 1} onClick={() => goTo(current + 1)} type="button"><ChevronRight className="size-6" /></button></div></div>;
}
