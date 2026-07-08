"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, ImageIcon, Loader2, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { LessonBlock, LessonDraft, LessonExercise, LessonShot } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

const closingViewId = "__closing__";
const generationSteps = ["读取故事骨架", "AI 生成正文和分镜", "装配练习结构", "校验并保存草稿"];
const generationStepNotes: Record<string, string> = {
  读取故事骨架: "读取课程基础信息、人物画像和已选故事方案。",
  "AI 生成正文和分镜": "AI 负责每章两段故事、内联习题标记和绘本分镜语义。",
  装配练习结构: "系统生成 block、exercise、shot 引用，避免结构错位。",
  校验并保存草稿: "检查词数、练习数量、分镜覆盖和人物引用，通过后写入数据库。",
};

type ActiveSelection =
  | { type: "shot"; shotId: string }
  | { type: "text"; blockId: string }
  | { type: "exercise"; exerciseId: string }
  | { type: "closing" };

type PreviewItem =
  | { kind: "text"; key: string; blockId: string; text: string }
  | { kind: "exercise"; key: string; block: Extract<LessonBlock, { type: "exercise" }> };

export function LessonDraftManager({ courseId }: { courseId: string }) {
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [activeChapterId, setActiveChapterId] = useState("");
  const [activeShotId, setActiveShotId] = useState("");
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>({ type: "closing" });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeChapter = draft?.chapters.find((chapter) => chapter.id === activeChapterId) ?? draft?.chapters[0] ?? null;
  const activeShot = activeChapter?.shots.find((shot) => shot.id === activeShotId) ?? activeChapter?.shots[0] ?? null;
  const isClosingActive = activeChapterId === closingViewId;
  const activeStep = generationSteps[Math.min(generationSteps.length - 1, Math.floor(progress / 25))];

  const shotBlocks = useMemo(() => {
    if (!activeChapter || !activeShot) {
      return [];
    }

    const covered = new Set(activeShot.coveredBlockIds);
    return activeChapter.blocks.filter((block) => covered.has(block.id)).sort((a, b) => a.order - b.order);
  }, [activeChapter, activeShot]);

  const shotExercises = useMemo(() => {
    if (!activeChapter) {
      return [];
    }

    const exerciseIds = new Set(shotBlocks.filter((block): block is Extract<LessonBlock, { type: "exercise" }> => block.type === "exercise").map((block) => block.exerciseId));
    return activeChapter.exercises.filter((exercise) => exerciseIds.has(exercise.id));
  }, [activeChapter, shotBlocks]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(92, current + (current < 55 ? 8 : 3)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    let isActive = true;

    async function loadDraft() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/courses/${courseId}/lesson-draft`);

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? "课文草稿加载失败");
        }

        const data = (await response.json()) as { draft: LessonDraft | null };
        const normalizedDraft = data.draft ? normalizeDraftForUi(data.draft) : null;

        if (isActive) {
          setDraft(normalizedDraft);
          activateFirstShot(normalizedDraft);
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "课文草稿加载失败");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadDraft();

    return () => {
      isActive = false;
    };
  }, [courseId]);

  function activateFirstShot(nextDraft: LessonDraft | null) {
    const firstChapter = nextDraft?.chapters[0];
    const firstShot = firstChapter?.shots[0];
    setActiveChapterId(firstChapter?.id ?? "");
    setActiveShotId(firstShot?.id ?? "");
    setActiveSelection(firstShot ? { type: "shot", shotId: firstShot.id } : { type: "closing" });
  }

  function activateChapter(chapterId: string) {
    if (!draft) {
      return;
    }

    if (chapterId === closingViewId) {
      setActiveChapterId(closingViewId);
      setActiveShotId("");
      setActiveSelection({ type: "closing" });
      return;
    }

    const chapter = draft.chapters.find((item) => item.id === chapterId);
    const firstShot = chapter?.shots[0];
    setActiveChapterId(chapterId);
    setActiveShotId(firstShot?.id ?? "");
    setActiveSelection(firstShot ? { type: "shot", shotId: firstShot.id } : { type: "closing" });
  }

  function activateShot(shotId: string) {
    setActiveShotId(shotId);
    setActiveSelection({ type: "shot", shotId });
  }

  async function generateDraft() {
    setProgress(8);
    setIsGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/lesson-draft/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "课文草稿生成失败");
      }

      const data = (await response.json()) as { draft: LessonDraft };
      const normalizedDraft = normalizeDraftForUi(data.draft);
      setProgress(100);
      setDraft(normalizedDraft);
      activateFirstShot(normalizedDraft);
      setMessage("课文草稿已生成。");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "课文草稿生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/lesson-draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "课文草稿保存失败");
      }

      const data = (await response.json()) as { draft: LessonDraft };
      setDraft(normalizeDraftForUi(data.draft));
      setMessage("课文草稿已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "课文草稿保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function updateDraft(patch: Partial<LessonDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateClosingReading(patch: Partial<LessonDraft["closingReading"]>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            closingReading: {
              ...current.closingReading,
              ...patch,
            },
          }
        : current,
    );
  }

  function updateBlock(chapterId: string, blockId: string, text: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === chapterId
                ? {
                    ...chapter,
                    blocks: chapter.blocks.map((block) => (block.id === blockId && block.type === "text" ? { ...block, text } : block)),
                  }
                : chapter,
            ),
          }
        : current,
    );
  }

  function updateChapterTitle(chapterId: string, title: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, title } : chapter)),
          }
        : current,
    );
  }

  function updateExercise(chapterId: string, exerciseId: string, patch: Partial<LessonExercise>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === chapterId
                ? {
                    ...chapter,
                    exercises: chapter.exercises.map((exercise) => (exercise.id === exerciseId ? ({ ...exercise, ...patch } as LessonExercise) : exercise)),
                    blocks: chapter.blocks.map((block) =>
                      block.type === "exercise" && block.exerciseId === exerciseId ? syncExerciseDisplay(block, patch) : block,
                    ),
                  }
                : chapter,
            ),
          }
        : current,
    );
  }

  function updateShot(chapterId: string, shotId: string, patch: Partial<LessonShot>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === chapterId
                ? {
                    ...chapter,
                    shots: chapter.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
                  }
                : chapter,
            ),
          }
        : current,
    );
  }

  if (isLoading) {
    return <StatusPanel label="正在加载课文草稿..." progress={70} />;
  }

  return (
    <div className="space-y-6">
      <CourseCreateSteps courseId={courseId} currentStep={3} />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Button asChild className="mb-4 h-9 px-3 text-sm" variant="outline">
            <Link href={`/courses/${courseId}/create/story-options`}>
              <ArrowLeft className="size-4" />
              返回故事方案
            </Link>
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">绘本内容草稿</h2>
          <p className="mt-2 text-sm text-slate-500">按章节和分镜检查最终展示文案，右侧编辑答案、正文和图片提示。</p>
        </div>
        {draft ? (
          <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} onClick={saveDraft} type="button">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存草稿
          </Button>
        ) : null}
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
      {message ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      {!draft ? (
        isGenerating ? (
          <GenerationPanel progress={progress} step={activeStep} />
        ) : (
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">生成绘本内容草稿</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">系统会填充已选择的故事方案，生成英文正文、练习、每章 2 个图片分镜和结尾阅读。</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={generateDraft} type="button">
              <Sparkles className="size-4" />
              生成课文草稿
            </Button>
          </section>
        )
      ) : (
        <div className="space-y-5">
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <TextInput label="绘本标题" value={draft.title} onChange={(value) => updateDraft({ title: value })} />
          </section>

          <div className="grid gap-2 rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-sm lg:grid-cols-4">
            {draft.chapters.map((chapter, index) => (
              <button
                className={cn(
                  "min-h-16 rounded-lg px-4 py-3 text-left transition-colors duration-200",
                  chapter.id === activeChapterId && "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                  chapter.id !== activeChapterId && "text-slate-600 hover:bg-slate-50",
                )}
                key={chapter.id}
                onClick={() => activateChapter(chapter.id)}
                type="button"
              >
                <div className="text-xs font-semibold">Chapter {index + 1}</div>
                <div className="mt-1 truncate text-sm font-semibold">{chapter.title}</div>
              </button>
            ))}
            <button
              className={cn(
                "min-h-16 rounded-lg px-4 py-3 text-left transition-colors duration-200",
                isClosingActive && "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                !isClosingActive && "text-slate-600 hover:bg-slate-50",
              )}
              onClick={() => activateChapter(closingViewId)}
              type="button"
            >
              <div className="text-xs font-semibold">Closing</div>
              <div className="mt-1 truncate text-sm font-semibold">{draft.closingReading.title}</div>
            </button>
          </div>

          {isClosingActive ? (
            <ClosingReadingPanel draft={draft} onChange={updateClosingReading} />
          ) : activeChapter && activeShot ? (
            <section className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
              <div className="border-b border-[#E5E7EB] p-5">
                <TextInput label="章节标题" value={activeChapter.title} onChange={(value) => updateChapterTitle(activeChapter.id, value)} />
                <div className="mt-4 flex gap-2">
                  {activeChapter.shots.map((shot) => (
                    <button
                      className={cn(
                        "h-9 rounded-lg border px-4 text-sm font-medium transition-colors",
                        shot.id === activeShot.id && "border-violet-200 bg-violet-50 text-violet-700",
                        shot.id !== activeShot.id && "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                      key={shot.id}
                      onClick={() => activateShot(shot.id)}
                      type="button"
                    >
                      Shot {shot.order}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[1fr_380px]">
                <div className="min-h-[520px] border-b border-[#E5E7EB] bg-slate-50/60 p-5 xl:border-b-0 xl:border-r">
                  <ShotPreview
                    blocks={shotBlocks}
                    chapter={activeChapter}
                    selection={activeSelection}
                    onSelectExercise={(exerciseId) => setActiveSelection({ type: "exercise", exerciseId })}
                    onSelectText={(blockId) => setActiveSelection({ type: "text", blockId })}
                  />
                </div>

                <aside className="space-y-5 p-5">
                  <EditorPanel
                    chapter={activeChapter}
                    selection={activeSelection}
                    shot={activeShot}
                    shotExercises={shotExercises}
                    onSelectShot={() => setActiveSelection({ type: "shot", shotId: activeShot.id })}
                    onTextChange={(blockId, value) => updateBlock(activeChapter.id, blockId, value)}
                    onExerciseChange={(exerciseId, patch) => updateExercise(activeChapter.id, exerciseId, patch)}
                    onShotChange={(shotId, patch) => updateShot(activeChapter.id, shotId, patch)}
                  />
                </aside>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function normalizeDraftForUi(draft: LessonDraft): LessonDraft {
  return {
    ...draft,
    closingReading: {
      title: draft.closingReading?.title ?? "After the Adventure",
      text:
        draft.closingReading?.text ??
        "After the adventure, the teacher and students remembered how they worked together. They followed clues, made choices, and used English to describe what happened. Each chapter helped them practice the target grammar inside the story, so the language felt useful and clear. The students became more confident because they listened, shared ideas, and solved problems step by step. When the journey ended, they could retell the important moments and explain how their decisions changed the story.",
      vocabularyTerms: draft.closingReading?.vocabularyTerms?.length ? draft.closingReading.vocabularyTerms : collectVocabularyTerms(draft),
    },
  };
}

function collectVocabularyTerms(draft: LessonDraft) {
  return Array.from(
    new Set(
      draft.chapters
        .flatMap((chapter) => chapter.exercises)
        .filter((exercise) => exercise.type === "vocabulary_hint")
        .map((exercise) => exercise.answer.trim())
        .filter(Boolean),
    ),
  );
}

function syncExerciseDisplay(block: Extract<LessonBlock, { type: "exercise" }>, patch: Partial<LessonExercise>): LessonBlock {
  if (block.display.kind === "verb_blank" && "baseVerb" in patch && typeof patch.baseVerb === "string") {
    return { ...block, display: { ...block.display, prompt: patch.baseVerb } };
  }

  if (block.display.kind === "vocabulary_hint") {
    return {
      ...block,
      display: {
        ...block.display,
        pattern: "pattern" in patch && typeof patch.pattern === "string" ? patch.pattern : block.display.pattern,
        letterCount: "letterCount" in patch && typeof patch.letterCount === "number" ? patch.letterCount : block.display.letterCount,
      },
    };
  }

  return block;
}

function renderExerciseLabel(exercise?: LessonExercise) {
  if (!exercise) {
    return "________";
  }

  if (exercise.type === "verb_blank") {
    return `________ (${exercise.baseVerb})`;
  }

  return `________ (${exercise.pattern})`;
}

function splitTextForExercises(text: string, exerciseCount: number) {
  const targetParts = exerciseCount + 1;
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [];

  if (sentences.length >= targetParts) {
    const parts = Array.from({ length: targetParts }, () => "");
    sentences.forEach((sentence, index) => {
      const partIndex = Math.min(targetParts - 1, Math.floor((index / sentences.length) * targetParts));
      parts[partIndex] = `${parts[partIndex]} ${sentence}`.trim();
    });
    return parts;
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunkSize = Math.max(1, Math.ceil(words.length / targetParts));
  return Array.from({ length: targetParts }, (_, index) => words.slice(index * chunkSize, (index + 1) * chunkSize).join(" ")).map((part) => part.trim());
}

function buildPreviewItems(chapter: LessonDraft["chapters"][number], visibleBlocks: LessonBlock[]): PreviewItem[] {
  const visibleBlockIds = new Set(visibleBlocks.map((block) => block.id));
  const textBlocks = chapter.blocks.filter((block): block is Extract<LessonBlock, { type: "text" }> => block.type === "text");
  const exerciseBlocks = chapter.blocks.filter((block): block is Extract<LessonBlock, { type: "exercise" }> => block.type === "exercise");
  const hasLegacyTrailingExercises =
    textBlocks.length === 1 &&
    exerciseBlocks.length > 0 &&
    exerciseBlocks.every((block) => block.order > textBlocks[0].order) &&
    visibleBlocks.some((block) => block.type === "exercise");

  if (!hasLegacyTrailingExercises) {
    return visibleBlocks.map((block) =>
      block.type === "text"
        ? { kind: "text", key: block.id, blockId: block.id, text: block.text }
        : { kind: "exercise", key: block.id, block },
    );
  }

  const textParts = splitTextForExercises(textBlocks[0].text, exerciseBlocks.length);
  const items: PreviewItem[] = [];

  textParts.forEach((text, index) => {
    const previousExercise = exerciseBlocks[index - 1];
    const nextExercise = exerciseBlocks[index];
    const shouldShowText = Boolean(
      text &&
        ((previousExercise && visibleBlockIds.has(previousExercise.id)) ||
          (nextExercise && visibleBlockIds.has(nextExercise.id))),
    );

    if (shouldShowText) {
      items.push({ kind: "text", key: `${textBlocks[0].id}-part-${index}`, blockId: textBlocks[0].id, text });
    }

    if (nextExercise && visibleBlockIds.has(nextExercise.id)) {
      items.push({ kind: "exercise", key: nextExercise.id, block: nextExercise });
    }
  });

  return items;
}

function StatusPanel({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-violet-700" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <ProgressBar progress={progress} />
    </div>
  );
}

function GenerationPanel({ progress, step }: { progress: number; step: string }) {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium text-violet-700">AI 正在生成</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{step}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{generationStepNotes[step]}</p>
        <ProgressBar progress={progress} />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {generationSteps.map((item) => (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium",
                item === step ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500",
              )}
              key={item}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-violet-600 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
    </div>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
      {icon ? <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span> : null}
      {title}
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function TextareaInput({ label, value, onChange, minRows = "min-h-24" }: { label: string; value: string; onChange: (value: string) => void; minRows?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className={cn(
          "w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100",
          minRows,
        )}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ShotPreview({
  blocks,
  chapter,
  selection,
  onSelectText,
  onSelectExercise,
}: {
  blocks: LessonBlock[];
  chapter: LessonDraft["chapters"][number];
  selection: ActiveSelection;
  onSelectText: (blockId: string) => void;
  onSelectExercise: (exerciseId: string) => void;
}) {
  const previewItems = buildPreviewItems(chapter, blocks);

  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle icon={<BookOpen className="size-4" />} title="Final student text" />
      <div className="mt-5 text-[15px] leading-9 text-slate-800">
        {previewItems.map((item) => {
          if (item.kind === "text") {
            return (
              <button
                className={cn(
                  "inline rounded-lg px-1.5 py-1 text-left leading-9 transition-colors hover:bg-violet-50",
                  selection.type === "text" && selection.blockId === item.blockId && "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
                )}
                key={item.key}
                onClick={() => onSelectText(item.blockId)}
                type="button"
              >
                {item.text}
              </button>
            );
          }

          const exercise = chapter.exercises.find((exerciseItem) => exerciseItem.id === item.block.exerciseId);
          return (
            <button
              className={cn(
                "mx-1 inline-flex min-h-8 items-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100",
                selection.type === "exercise" && selection.exerciseId === item.block.exerciseId && "ring-2 ring-violet-300",
              )}
              key={item.key}
              onClick={() => onSelectExercise(item.block.exerciseId)}
              type="button"
            >
              {renderExerciseLabel(exercise)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditorPanel({
  chapter,
  selection,
  shot,
  shotExercises,
  onSelectShot,
  onTextChange,
  onExerciseChange,
  onShotChange,
}: {
  chapter: LessonDraft["chapters"][number];
  selection: ActiveSelection;
  shot: LessonShot;
  shotExercises: LessonExercise[];
  onSelectShot: () => void;
  onTextChange: (blockId: string, value: string) => void;
  onExerciseChange: (exerciseId: string, patch: Partial<LessonExercise>) => void;
  onShotChange: (shotId: string, patch: Partial<LessonShot>) => void;
}) {
  const selectedTextBlock = selection.type === "text" ? chapter.blocks.find((block) => block.id === selection.blockId && block.type === "text") : null;
  const selectedExercise = selection.type === "exercise" ? chapter.exercises.find((exercise) => exercise.id === selection.exerciseId) : null;

  return (
    <>
      {selection.type === "text" && selectedTextBlock?.type === "text" ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <SectionTitle title="Edit story text" />
          <TextareaInput label="Student text" minRows="min-h-56" value={selectedTextBlock.text} onChange={(value) => onTextChange(selectedTextBlock.id, value)} />
        </div>
      ) : selection.type === "exercise" && selectedExercise ? (
        <ExerciseEditor exercise={selectedExercise} onChange={onExerciseChange} />
      ) : (
        <ShotEditor shot={shot} onChange={onShotChange} onFocus={onSelectShot} />
      )}

      <AnswersPanel exercises={shotExercises} />
    </>
  );
}

function ExerciseEditor({ exercise, onChange }: { exercise: LessonExercise; onChange: (exerciseId: string, patch: Partial<LessonExercise>) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <SectionTitle title={exercise.type === "verb_blank" ? "Edit verb blank" : "Edit vocabulary hint"} />
      <div className="mt-3 grid gap-3">
        {exercise.type === "verb_blank" ? (
          <>
            <TextInput label="Base verb" value={exercise.baseVerb} onChange={(value) => onChange(exercise.id, { baseVerb: value })} />
            <TextInput label="Answer" value={exercise.answer} onChange={(value) => onChange(exercise.id, { answer: value })} />
          </>
        ) : (
          <>
            <TextInput label="Answer" value={exercise.answer} onChange={(value) => onChange(exercise.id, { answer: value })} />
            <TextInput label="Pattern" value={exercise.pattern} onChange={(value) => onChange(exercise.id, { pattern: value })} />
            <TextInput label="Letter count" value={String(exercise.letterCount)} onChange={(value) => onChange(exercise.id, { letterCount: Number(value) || exercise.letterCount })} />
          </>
        )}
      </div>
    </div>
  );
}

function ShotEditor({ shot, onChange, onFocus }: { shot: LessonShot; onChange: (shotId: string, patch: Partial<LessonShot>) => void; onFocus: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4" onFocus={onFocus}>
      <SectionTitle icon={<ImageIcon className="size-4" />} title={`Shot ${shot.order} image prompt`} />
      <div className="mt-3 grid gap-3">
        <TextInput label="Location" value={shot.location} onChange={(value) => onChange(shot.id, { location: value })} />
        <TextInput label="Action" value={shot.action} onChange={(value) => onChange(shot.id, { action: value })} />
        <TextInput label="Mood" value={shot.mood} onChange={(value) => onChange(shot.id, { mood: value })} />
        <TextareaInput label="Scene prompt" minRows="min-h-24" value={shot.scenePrompt} onChange={(value) => onChange(shot.id, { scenePrompt: value })} />
        <TextareaInput label="Composition" minRows="min-h-20" value={shot.composition} onChange={(value) => onChange(shot.id, { composition: value })} />
        <TextareaInput label="Continuity notes" minRows="min-h-20" value={shot.continuityNotes} onChange={(value) => onChange(shot.id, { continuityNotes: value })} />
      </div>
    </div>
  );
}

function AnswersPanel({ exercises }: { exercises: LessonExercise[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <SectionTitle title="Answers in this shot" />
      <div className="mt-3 space-y-2">
        {exercises.map((exercise) => (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm" key={exercise.id}>
            <span className="text-slate-500">{exercise.type === "verb_blank" ? exercise.baseVerb : exercise.pattern}</span>
            <span className="font-semibold text-slate-900">{exercise.answer}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClosingReadingPanel({ draft, onChange }: { draft: LessonDraft; onChange: (patch: Partial<LessonDraft["closingReading"]>) => void }) {
  const vocabularyTerms = draft.closingReading.vocabularyTerms?.length ? draft.closingReading.vocabularyTerms : collectVocabularyTerms(draft);

  return (
    <section className="grid gap-0 rounded-lg border border-[#E5E7EB] bg-white shadow-sm xl:grid-cols-[1fr_380px]">
      <div className="border-b border-[#E5E7EB] bg-slate-50/60 p-5 xl:border-b-0 xl:border-r">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle icon={<BookOpen className="size-4" />} title="Closing reading" />
          <h3 className="mt-5 text-lg font-semibold text-slate-950">{draft.closingReading.title}</h3>
          <p className="mt-4 text-[15px] leading-8 text-slate-800">{draft.closingReading.text}</p>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="text-sm font-semibold text-slate-900">Words and phrases</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {vocabularyTerms.map((term) => (
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700" key={term}>
                  {term}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <aside className="space-y-4 p-5">
        <div className="rounded-lg border border-slate-200 p-4">
          <SectionTitle title="Edit closing reading" />
          <div className="mt-3 grid gap-3">
            <TextInput label="Title" value={draft.closingReading.title} onChange={(value) => onChange({ title: value })} />
            <TextareaInput label="Text" minRows="min-h-72" value={draft.closingReading.text} onChange={(value) => onChange({ text: value })} />
            <TextareaInput
              label="Words and phrases"
              minRows="min-h-28"
              value={vocabularyTerms.join("\n")}
              onChange={(value) => onChange({ vocabularyTerms: value.split(/\r?\n|,/).map((term) => term.trim()).filter(Boolean) })}
            />
          </div>
        </div>
      </aside>
    </section>
  );
}
