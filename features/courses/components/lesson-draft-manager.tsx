"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ImageIcon, Loader2, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { LessonBlock, LessonDraft, LessonExercise, LessonShot } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

const generationSteps = ["读取故事骨架", "扩写英文正文", "嵌入练习空格", "规划图片分镜"];

export function LessonDraftManager({ courseId }: { courseId: string }) {
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [activeChapterId, setActiveChapterId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeChapter = draft?.chapters.find((chapter) => chapter.id === activeChapterId) ?? draft?.chapters[0] ?? null;
  const activeStep = generationSteps[Math.min(generationSteps.length - 1, Math.floor(progress / 25))];

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

        if (isActive) {
          setDraft(data.draft);
          setActiveChapterId(data.draft?.chapters[0]?.id ?? "");
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
      setProgress(100);
      setDraft(data.draft);
      setActiveChapterId(data.draft.chapters[0]?.id ?? "");
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
      setDraft(data.draft);
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

  function updateBlock(blockId: string, text: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === activeChapter?.id
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

  function updateChapterTitle(title: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) => (chapter.id === activeChapter?.id ? { ...chapter, title } : chapter)),
          }
        : current,
    );
  }

  function updateExercise(exerciseId: string, patch: Partial<LessonExercise>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === activeChapter?.id
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

  function updateShot(shotId: string, patch: Partial<LessonShot>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === activeChapter?.id
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
          <p className="mt-2 text-sm text-slate-500">基于已选择故事方案生成英文绘本正文、练习和图片分镜。</p>
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
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">系统会填充已选择的故事方案，生成英文正文、练习和每章 2 个图片分镜。</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={generateDraft} type="button">
              <Sparkles className="size-4" />
              生成课文草稿
            </Button>
          </section>
        )
      ) : activeChapter ? (
        <div className="space-y-5">
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <TextInput label="绘本标题" value={draft.title} onChange={(value) => updateDraft({ title: value })} />
          </section>

          <div className="grid gap-2 rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-sm lg:grid-cols-3">
            {draft.chapters.map((chapter, index) => (
              <button
                className={cn(
                  "min-h-16 rounded-lg px-4 py-3 text-left transition-colors duration-200",
                  chapter.id === activeChapter.id && "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                  chapter.id !== activeChapter.id && "text-slate-600 hover:bg-slate-50",
                )}
                key={chapter.id}
                onClick={() => setActiveChapterId(chapter.id)}
                type="button"
              >
                <div className="text-xs font-semibold">Chapter {index + 1}</div>
                <div className="mt-1 truncate text-sm font-semibold">{chapter.title}</div>
              </button>
            ))}
          </div>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <div className="space-y-5">
                <TextInput label="章节标题" value={activeChapter.title} onChange={updateChapterTitle} />
                <div>
                  <SectionTitle title="正文 Blocks" />
                  <div className="mt-3 space-y-3">
                    {activeChapter.blocks.map((block) => (
                      <BlockEditor
                        block={block}
                        exercise={block.type === "exercise" ? activeChapter.exercises.find((exercise) => exercise.id === block.exerciseId) : undefined}
                        key={block.id}
                        onTextChange={updateBlock}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <aside className="space-y-5">
                <div>
                  <SectionTitle title="练习答案" />
                  <div className="mt-3 space-y-3">
                    {activeChapter.exercises.map((exercise) => (
                      <ExerciseEditor exercise={exercise} key={exercise.id} onChange={updateExercise} />
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <SectionTitle icon={<ImageIcon className="size-4" />} title="图片分镜" />
            <div className="mt-3 grid gap-4 xl:grid-cols-2">
              {activeChapter.shots.map((shot) => (
                <ShotEditor key={shot.id} shot={shot} onChange={updateShot} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
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

  return `________ (${exercise.pattern}, ${exercise.letterCount} letters)`;
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
        <ProgressBar progress={progress} />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {generationSteps.map((item) => (
            <div className={cn("rounded-lg border px-3 py-2 text-xs font-medium", item === step ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500")} key={item}>
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

function SectionTitle({ title, icon }: { title: string; icon?: React.ReactNode }) {
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

function BlockEditor({
  block,
  exercise,
  onTextChange,
}: {
  block: LessonBlock;
  exercise?: LessonExercise;
  onTextChange: (blockId: string, text: string) => void;
}) {
  if (block.type === "exercise") {
    return (
      <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700">
        {renderExerciseLabel(exercise)}
      </div>
    );
  }

  return <TextareaInput label={`Text block ${block.order}`} minRows="min-h-28" value={block.text} onChange={(value) => onTextChange(block.id, value)} />;
}

function ExerciseEditor({ exercise, onChange }: { exercise: LessonExercise; onChange: (exerciseId: string, patch: Partial<LessonExercise>) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-500">{exercise.type === "verb_blank" ? "Verb blank" : "Vocabulary hint"}</div>
      {exercise.type === "verb_blank" ? (
        <div className="grid gap-2">
          <TextInput label="Base verb" value={exercise.baseVerb} onChange={(value) => onChange(exercise.id, { baseVerb: value })} />
          <TextInput label="Answer" value={exercise.answer} onChange={(value) => onChange(exercise.id, { answer: value })} />
        </div>
      ) : (
        <div className="grid gap-2">
          <TextInput label="Answer" value={exercise.answer} onChange={(value) => onChange(exercise.id, { answer: value })} />
          <TextInput label="Pattern" value={exercise.pattern} onChange={(value) => onChange(exercise.id, { pattern: value })} />
          <TextInput label="Letter count" value={String(exercise.letterCount)} onChange={(value) => onChange(exercise.id, { letterCount: Number(value) || exercise.letterCount })} />
        </div>
      )}
    </div>
  );
}

function ShotEditor({ shot, onChange }: { shot: LessonShot; onChange: (shotId: string, patch: Partial<LessonShot>) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">Shot {shot.order}</div>
      <div className="grid gap-3">
        <TextInput label="Location" value={shot.location} onChange={(value) => onChange(shot.id, { location: value })} />
        <TextInput label="Action" value={shot.action} onChange={(value) => onChange(shot.id, { action: value })} />
        <TextInput label="Mood" value={shot.mood} onChange={(value) => onChange(shot.id, { mood: value })} />
        <TextareaInput label="Scene prompt" value={shot.scenePrompt} onChange={(value) => onChange(shot.id, { scenePrompt: value })} />
        <TextareaInput label="Composition" value={shot.composition} onChange={(value) => onChange(shot.id, { composition: value })} />
        <TextareaInput label="Continuity notes" value={shot.continuityNotes} onChange={(value) => onChange(shot.id, { continuityNotes: value })} />
      </div>
    </div>
  );
}
