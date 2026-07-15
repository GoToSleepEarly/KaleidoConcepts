"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Pencil, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { StoryOption, StoryOptionVariant } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type LoadResponse = {
  options: StoryOption[];
  selectedOptionId: string | null;
  lessonDraftExists: boolean;
};

const generationSteps = ["理解故事种子", "生成三种方向", "压缩故事大纲", "整理方案 JSON"];

const variantMeta: Record<StoryOptionVariant, { label: string; tone: string; description: string }> = {
  faithful: {
    label: "贴近原意",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
    description: "尽量保留老师输入，只补足故事推进。",
  },
  enhanced: {
    label: "推荐 · 结构增强",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
    description: "结构最完整，适合课堂默认选择。",
  },
  creative: {
    label: "创意拓展",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    description: "保留核心设定，加入更有想象力的走向。",
  },
};

export function StoryOptionsManager({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<StoryOption[]>([]);
  const [activeOptionId, setActiveOptionId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [lessonDraftExists, setLessonDraftExists] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState("");
  const [editingOriginal, setEditingOriginal] = useState<StoryOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectingId, setSelectingId] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeOption = options.find((option) => option.id === activeOptionId) ?? options[0] ?? null;
  const isSelectionLocked = Boolean(selectedOptionId);
  const activeGenerationStep = generationSteps[Math.min(generationSteps.length - 1, Math.floor(progress / 25))];

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }

        return Math.min(92, current + (current < 55 ? 9 : 4));
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    let isActive = true;

    async function loadOptions() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/courses/${courseId}/story-options`);

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? "故事方案加载失败");
        }

        const data = (await response.json()) as LoadResponse;

        if (isActive) {
          setOptions(data.options);
          setSelectedOptionId(data.selectedOptionId);
          setLessonDraftExists(data.lessonDraftExists);
          setActiveOptionId(data.selectedOptionId ?? data.options.find((option) => option.variant === "enhanced")?.id ?? data.options[0]?.id ?? "");
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "故事方案加载失败");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, [courseId]);

  async function generateOptions() {
    setProgress(8);
    setIsGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案生成失败");
      }

      const data = (await response.json()) as { options: StoryOption[] };
      setProgress(100);
      setOptions(data.options);
      setActiveOptionId(data.options.find((option) => option.variant === "enhanced")?.id ?? data.options[0]?.id ?? "");
      setEditingOptionId("");
      setMessage("已生成 3 个故事大纲。");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "故事方案生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  function requestSave() {
    setError("");
    setMessage("");

    if (lessonDraftExists) {
      setConfirmSaveOpen(true);
      return;
    }

    void saveOptions(false);
  }

  async function saveOptions(clearLessonDraft: boolean) {
    setConfirmSaveOpen(false);
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options, clearLessonDraft }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案保存失败");
      }

      const data = (await response.json()) as LoadResponse;
      setOptions(data.options);
      setSelectedOptionId(data.selectedOptionId);
      setLessonDraftExists(data.lessonDraftExists);
      setActiveOptionId((current) => data.options.find((option) => option.id === current)?.id ?? data.selectedOptionId ?? data.options[0]?.id ?? "");
      setEditingOptionId("");
      setEditingOriginal(null);
      setMessage(clearLessonDraft ? "故事方案已保存，下游内容已清空，可重新生成课文。" : "故事方案已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "故事方案保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function selectOption(optionId: string) {
    setSelectingId(optionId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options/${optionId}/select`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案选择失败");
      }

      const data = (await response.json()) as { selectedOptionId: string };
      setSelectedOptionId(data.selectedOptionId);
      router.push(`/courses/${courseId}/create/lesson-draft`);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "故事方案选择失败");
    } finally {
      setSelectingId("");
    }
  }

  function updateOption(optionId: string, patch: Partial<StoryOption>) {
    setOptions((current) => current.map((option) => (option.id === optionId ? { ...option, ...patch } : option)));
  }

  function updateChapter(optionId: string, chapterIndex: number, patch: Partial<StoryOption["chapters"][number]>) {
    setOptions((current) =>
      current.map((option) =>
        option.id === optionId
          ? {
              ...option,
              chapters: option.chapters.map((chapter, index) => (index === chapterIndex ? { ...chapter, ...patch } : chapter)),
            }
          : option,
      ),
    );
  }

  function beginEdit(optionId: string) {
    const option = options.find((item) => item.id === optionId);
    if (!option) return;
    setActiveOptionId(optionId);
    setEditingOriginal(JSON.parse(JSON.stringify(option)) as StoryOption);
    setEditingOptionId(optionId);
  }

  function cancelEdit() {
    if (editingOriginal) {
      setOptions((current) => current.map((option) => (option.id === editingOriginal.id ? editingOriginal : option)));
    }
    setEditingOptionId("");
    setEditingOriginal(null);
  }

  if (isLoading) {
    return <LoadingPanel label="正在加载故事方案..." />;
  }

  return (
    <div className="space-y-6">
      <CourseCreateSteps courseId={courseId} currentStep={2} />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Button asChild className="mb-4 h-9 px-3 text-sm" variant="outline">
            <Link href={`/courses/${courseId}/create/basic`}>
              <ArrowLeft className="size-4" />
              返回基础信息
            </Link>
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">选择中文故事大纲</h2>
          <p className="mt-2 text-sm text-slate-500">先比较 3 个故事方向。知识点、英文正文和题目会在下一步统一设计。</p>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
      {message ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      {options.length === 0 ? (
        isGenerating ? (
          <GenerationPanel progress={progress} step={activeGenerationStep} />
        ) : (
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">生成故事大纲</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">系统会生成“贴近原意 / 推荐结构增强 / 创意拓展”三个中文故事方向。</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={generateOptions} type="button">
              <Sparkles className="size-4" />
              生成故事大纲
            </Button>
          </section>
        )
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-3">
            {options.map((option) => (
              <StoryOptionCard
                isActive={option.id === activeOption?.id}
                isEditing={editingOptionId === option.id}
                isSaving={isSaving}
                isSelectionLocked={isSelectionLocked}
                isSelected={selectedOptionId === option.id}
                key={option.id}
                option={option}
                selectingId={selectingId}
                onActivate={() => setActiveOptionId(option.id)}
                onCancel={cancelEdit}
                onChapterChange={(chapterIndex, patch) => updateChapter(option.id, chapterIndex, patch)}
                onEdit={() => beginEdit(option.id)}
                onOptionChange={(patch) => updateOption(option.id, patch)}
                onSave={requestSave}
                onSelect={() => {
                  if (selectedOptionId === option.id) {
                    router.push(`/courses/${courseId}/create/lesson-draft`);
                    return;
                  }
                  void selectOption(option.id);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {confirmSaveOpen ? (
        <ConfirmSaveDialog
          isSaving={isSaving}
          onCancel={() => setConfirmSaveOpen(false)}
          onKeepDraft={() => void saveOptions(false)}
          onClearDraft={() => void saveOptions(true)}
        />
      ) : null}
    </div>
  );
}

function StoryOptionCard({
  option,
  isActive,
  isEditing,
  isSaving,
  isSelectionLocked,
  isSelected,
  selectingId,
  onActivate,
  onCancel,
  onChapterChange,
  onEdit,
  onOptionChange,
  onSave,
  onSelect,
}: {
  option: StoryOption;
  isActive: boolean;
  isEditing: boolean;
  isSaving: boolean;
  isSelectionLocked: boolean;
  isSelected: boolean;
  selectingId: string;
  onActivate: () => void;
  onCancel: () => void;
  onChapterChange: (chapterIndex: number, patch: Partial<StoryOption["chapters"][number]>) => void;
  onEdit: () => void;
  onOptionChange: (patch: Partial<StoryOption>) => void;
  onSave: () => void;
  onSelect: () => void;
}) {
  const meta = variantMeta[option.variant];

  return (
    <section
      className={cn(
        "flex min-h-[460px] flex-col rounded-2xl border bg-white p-5 shadow-sm transition duration-200",
        isActive ? "border-violet-300 ring-2 ring-violet-100" : "border-[#E5E7EB] hover:border-violet-200 hover:shadow-md",
        isSelected && "border-violet-500 ring-2 ring-violet-100",
        isEditing && "border-violet-400 ring-2 ring-violet-100",
      )}
      onClick={onActivate}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", meta.tone)}>{meta.label}</span>
        {isSelected ? <Check className="size-5 text-violet-700" /> : null}
      </div>

      <div className="mt-4">
        {isEditing ? (
          <input
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xl font-semibold leading-8 text-slate-950 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            onChange={(event) => onOptionChange({ title: event.target.value })}
            onClick={(event) => event.stopPropagation()}
            value={option.title}
          />
        ) : (
          <h3 className="text-xl font-semibold leading-8 text-slate-950">{option.title || "未命名故事"}</h3>
        )}
        <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
      </div>

      <div className={cn("mt-5 rounded-xl p-4", isEditing ? "bg-white border border-violet-100" : "bg-slate-50")}>
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">故事主线</div>
        {isEditing ? (
          <textarea
            className="mt-2 w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            onChange={(event) => onOptionChange({ storyline: event.target.value })}
            onClick={(event) => event.stopPropagation()}
            rows={3}
            value={option.storyline}
          />
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-800">{option.storyline}</p>
        )}
      </div>

      <div className="mt-5 flex-1">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">章节线</div>
        <ol className="mt-3 space-y-3">
          {option.chapters.map((chapter, index) => (
            <li className="grid grid-cols-[28px_1fr] gap-3" key={`${option.id}-${index}`}>
              <span className="flex size-7 items-center justify-center rounded-full bg-violet-50 text-xs font-semibold text-violet-700">{index + 1}</span>
              <div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      className="w-full rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      onChange={(event) => onChapterChange(index, { title: event.target.value })}
                      onClick={(event) => event.stopPropagation()}
                      value={chapter.title}
                    />
                    <textarea
                      className="w-full resize-none rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-sm leading-6 text-slate-600 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      onChange={(event) => onChapterChange(index, { summary: event.target.value })}
                      onClick={(event) => event.stopPropagation()}
                      rows={2}
                      value={chapter.summary}
                    />
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-slate-900">{chapter.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{chapter.summary}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5 grid gap-2">
        {isEditing ? (
          <>
            <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={isSaving} onClick={(event) => { event.stopPropagation(); onSave(); }} type="button">
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              保存修改
            </Button>
            <Button className="w-full" disabled={isSaving} onClick={(event) => { event.stopPropagation(); onCancel(); }} type="button" variant="outline">
              取消
            </Button>
          </>
        ) : (
          <>
            <Button className="w-full bg-violet-600 text-white hover:bg-violet-700" disabled={(isSelectionLocked && !isSelected) || selectingId === option.id} onClick={onSelect} type="button">
              {selectingId === option.id ? <Loader2 className="size-4 animate-spin" /> : isSelected ? <Check className="size-4" /> : null}
              {isSelected ? "已选择，继续" : "选择这个故事"}
            </Button>
            <Button className="w-full" onClick={(event) => { event.stopPropagation(); onEdit(); }} type="button" variant="outline">
              <Pencil className="size-4" />
              轻微编辑
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-violet-700" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
    </div>
  );
}

function GenerationPanel({ progress, step }: { progress: number; step: string }) {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">AI 正在生成</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{step}</h3>
          </div>
          <div className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <Sparkles className="size-5" />
          </div>
        </div>
        <ProgressBar className="mt-6" progress={progress} />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {generationSteps.map((item) => {
            const isActive = item === step;
            const isDone = generationSteps.indexOf(item) < generationSteps.indexOf(step);

            return (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium",
                  isActive && "border-violet-200 bg-violet-50 text-violet-700",
                  isDone && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  !isActive && !isDone && "border-slate-200 bg-slate-50 text-slate-500",
                )}
                key={item}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-violet-600 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
    </div>
  );
}

function ConfirmSaveDialog({
  isSaving,
  onCancel,
  onKeepDraft,
  onClearDraft,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onKeepDraft: () => void;
  onClearDraft: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-950">已有 Step 3 课文草稿</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          这门课已经生成过英文阅读草稿。修改故事后，请选择如何处理已有课文、资源方案和图片。
        </p>
        <div className="mt-5 grid gap-3">
          <button
            className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-left transition hover:border-violet-300 disabled:opacity-60"
            disabled={isSaving}
            onClick={onClearDraft}
            type="button"
          >
            <div className="text-sm font-semibold text-violet-700">保存并清空重做（推荐）</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">更新故事，并清空 Step 3 课文、Step 4 资源方案与已生成图片，回到干净状态重新生成。</p>
          </button>
          <button
            className="rounded-xl border border-[#E5E7EB] p-4 text-left transition hover:border-slate-300 disabled:opacity-60"
            disabled={isSaving}
            onClick={onKeepDraft}
            type="button"
          >
            <div className="text-sm font-semibold text-slate-900">仅保存故事</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">只更新故事方案，保留已有课文与图片。注意正文可能与新大纲不一致。</p>
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <Button disabled={isSaving} onClick={onCancel} type="button" variant="outline">
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
