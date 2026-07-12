"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Pencil, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { StoryOption, StoryOptionVariant } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type LoadResponse = {
  options: StoryOption[];
  selectedOptionId: string | null;
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
  const [editingOptionId, setEditingOptionId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectingId, setSelectingId] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isLocked = Boolean(selectedOptionId);
  const activeOption = options.find((option) => option.id === activeOptionId) ?? options[0] ?? null;
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

  async function saveOptions() {
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案保存失败");
      }

      const data = (await response.json()) as LoadResponse;
      setOptions(data.options);
      setSelectedOptionId(data.selectedOptionId);
      setActiveOptionId((current) => data.options.find((option) => option.id === current)?.id ?? data.selectedOptionId ?? data.options[0]?.id ?? "");
      setEditingOptionId("");
      setMessage("故事方案已保存。");
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

  if (isLoading) {
    return <LoadingPanel label="正在加载故事方案..." progress={72} />;
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
        {options.length > 0 && !isLocked ? (
          <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} onClick={saveOptions} type="button">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存修改
          </Button>
        ) : null}
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
                isLocked={isLocked}
                isSelected={selectedOptionId === option.id}
                key={option.id}
                option={option}
                selectingId={selectingId}
                onActivate={() => setActiveOptionId(option.id)}
                onEdit={() => {
                  setActiveOptionId(option.id);
                  setEditingOptionId((current) => (current === option.id ? "" : option.id));
                }}
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

          {activeOption && editingOptionId === activeOption.id ? (
            <EditPanel
              disabled={isLocked}
              option={activeOption}
              onChapterChange={(chapterIndex, patch) => updateChapter(activeOption.id, chapterIndex, patch)}
              onOptionChange={(patch) => updateOption(activeOption.id, patch)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function StoryOptionCard({
  option,
  isActive,
  isEditing,
  isLocked,
  isSelected,
  selectingId,
  onActivate,
  onEdit,
  onSelect,
}: {
  option: StoryOption;
  isActive: boolean;
  isEditing: boolean;
  isLocked: boolean;
  isSelected: boolean;
  selectingId: string;
  onActivate: () => void;
  onEdit: () => void;
  onSelect: () => void;
}) {
  const meta = variantMeta[option.variant];

  return (
    <section
      className={cn(
        "flex min-h-[460px] flex-col rounded-2xl border bg-white p-5 shadow-sm transition duration-200",
        isActive ? "border-violet-300 ring-2 ring-violet-100" : "border-[#E5E7EB] hover:border-violet-200 hover:shadow-md",
        isSelected && "border-violet-500 ring-2 ring-violet-100",
      )}
      onClick={onActivate}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", meta.tone)}>{meta.label}</span>
        {isSelected ? <Check className="size-5 text-violet-700" /> : null}
      </div>

      <div className="mt-4">
        <h3 className="text-xl font-semibold leading-8 text-slate-950">{option.title || "未命名故事"}</h3>
        <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">故事主线</div>
        <p className="mt-2 text-sm leading-6 text-slate-800">{option.storyline}</p>
      </div>

      <div className="mt-5 flex-1">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">章节线</div>
        <ol className="mt-3 space-y-3">
          {option.chapters.map((chapter, index) => (
            <li className="grid grid-cols-[28px_1fr] gap-3" key={`${option.id}-${index}`}>
              <span className="flex size-7 items-center justify-center rounded-full bg-violet-50 text-xs font-semibold text-violet-700">{index + 1}</span>
              <div>
                <div className="text-sm font-semibold text-slate-900">{chapter.title}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{chapter.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5 grid gap-2">
        <Button className="w-full bg-violet-600 text-white hover:bg-violet-700" disabled={(isLocked && !isSelected) || selectingId === option.id} onClick={onSelect} type="button">
          {selectingId === option.id ? <Loader2 className="size-4 animate-spin" /> : isSelected ? <Check className="size-4" /> : null}
          {isSelected ? "已选择，继续" : "选择这个故事"}
        </Button>
        {!isLocked ? (
          <Button className="w-full" onClick={onEdit} type="button" variant="outline">
            <Pencil className="size-4" />
            {isEditing ? "收起编辑" : "轻微编辑"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function EditPanel({
  option,
  disabled,
  onOptionChange,
  onChapterChange,
}: {
  option: StoryOption;
  disabled: boolean;
  onOptionChange: (patch: Partial<StoryOption>) => void;
  onChapterChange: (chapterIndex: number, patch: Partial<StoryOption["chapters"][number]>) => void;
}) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-950">编辑当前故事大纲</h3>
        <p className="mt-1 text-sm text-slate-500">建议只做轻微修改；英文正文、知识点和题目会在下一步生成。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <TextInput disabled={disabled} label="故事标题" value={option.title} onChange={(value) => onOptionChange({ title: value })} />
        <TextareaInput disabled={disabled} label="故事主线" minRows="min-h-20" value={option.storyline} onChange={(value) => onOptionChange({ storyline: value })} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {option.chapters.map((chapter, index) => (
          <div className="rounded-xl border border-violet-100 bg-white p-4" key={`${option.id}-edit-${index}`}>
            <div className="mb-3 text-sm font-semibold text-violet-700">章节 {index + 1}</div>
            <TextInput disabled={disabled} label="章节标题" value={chapter.title} onChange={(value) => onChapterChange(index, { title: value })} />
            <div className="mt-3">
              <TextareaInput disabled={disabled} label="章节大纲" minRows="min-h-20" value={chapter.summary} onChange={(value) => onChapterChange(index, { summary: value })} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingPanel({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-violet-700" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <ProgressBar className="mt-4" progress={progress} />
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

function TextInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function TextareaInput({
  label,
  value,
  onChange,
  disabled,
  minRows = "min-h-24",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  minRows?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className={cn(
          "w-full resize-none rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-500",
          minRows,
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
