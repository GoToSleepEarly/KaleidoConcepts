"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  LessonContentChapter,
  LessonDraft,
  LessonExercise,
  LessonSentence,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const closingViewId = "__closing__";

const estimatedTotalMs = 300_000;
const generationStages = [
  {
    label: "规划英文阅读结构",
    note: "读取故事大纲、人物信息和 CEFR 等级要求。",
    untilMs: 45_000,
  },
  {
    label: "生成故事正文与互动题",
    note: "DeepSeek 正在生成完整故事、句子片段和多种练习题。",
    untilMs: 260_000,
  },
  {
    label: "校验课文与题目",
    note: "系统正在校验章节长度、知识点和练习结构。",
    untilMs: 285_000,
  },
  {
    label: "保存阅读草稿",
    note: "写入可预览的英文互动阅读草稿。",
    untilMs: estimatedTotalMs,
  },
] as const;

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`
    : `${seconds} 秒`;
}

export function LessonDraftManager({ courseId }: { courseId: string }) {
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [activeChapterId, setActiveChapterId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeChapter =
    draft?.chapters.find((chapter) => chapter.id === activeChapterId) ??
    draft?.chapters[0] ??
    null;
  const isClosingActive = activeChapterId === closingViewId;

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
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
          const data = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(data?.message ?? "阅读草稿加载失败");
        }

        const data = (await response.json()) as { draft: LessonDraft | null };

        if (isActive) {
          setDraft(data.draft);
          setActiveChapterId(data.draft?.chapters[0]?.id ?? "");
        }
      } catch (loadError) {
        if (isActive) {
          setError(
            loadError instanceof Error ? loadError.message : "阅读草稿加载失败",
          );
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
    setElapsedMs(0);
    setIsGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/courses/${courseId}/lesson-draft/generate`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "阅读草稿生成失败");
      }

      const data = (await response.json()) as { draft: LessonDraft };
      setDraft(data.draft);
      setActiveChapterId(data.draft.chapters[0]?.id ?? "");
      setMessage("英文互动阅读草稿已生成。");
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "阅读草稿生成失败",
      );
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
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "阅读草稿保存失败");
      }

      const data = (await response.json()) as { draft: LessonDraft };
      setDraft(data.draft);
      setMessage("阅读草稿已保存。");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "阅读草稿保存失败",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <StatusPanel label="正在加载英文阅读草稿..." progress={70} />;
  }

  return (
    <div className="space-y-6">
      <CourseCreateSteps courseId={courseId} currentStep={3} />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Button asChild className="mb-4 h-9 px-3 text-sm" variant="outline">
            <Link href={`/courses/${courseId}/create/story-options`}>
              <ArrowLeft className="size-4" />
              返回故事大纲
            </Link>
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            英文互动阅读草稿
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            检查带题阅读文本和答案。图片将在资源生成步骤根据最终正文自动生成。
          </p>
        </div>
        {draft ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={isSaving}
              onClick={saveDraft}
              type="button"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存草稿
            </Button>
            <Button
              asChild
              className="bg-slate-950 text-white hover:bg-slate-800"
            >
              <Link href={`/courses/${courseId}/create/resources`}>
                进入资源生成
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {!draft ? (
        isGenerating ? (
          <GenerationPanel elapsedMs={elapsedMs} />
        ) : (
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">
              生成英文互动阅读草稿
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              系统会基于选中的中文故事大纲，生成英文正文、嵌入式练习题和答案。预计需要约
              5 分钟。
            </p>
            <Button
              className="mt-6 bg-violet-600 text-white hover:bg-violet-700"
              onClick={generateDraft}
              type="button"
            >
              <Sparkles className="size-4" />
              生成阅读草稿
            </Button>
          </section>
        )
      ) : (
        <div className="grid gap-5 xl:grid-cols-[220px_1fr_300px]">
          <ChapterNav
            activeChapterId={activeChapterId}
            draft={draft}
            onSelect={setActiveChapterId}
          />
          <section className="min-h-[560px] rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            {isClosingActive ? (
              <ClosingReadingPanel draft={draft} />
            ) : activeChapter ? (
              <ReadingPanel
                castAliases={draft.castAliases}
                chapter={activeChapter}
              />
            ) : null}
          </section>
          <aside className="space-y-4">
            {isClosingActive ? (
              <NoExercisePanel />
            ) : activeChapter ? (
              <AnswerPanel chapter={activeChapter} />
            ) : null}
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                <CheckCircle2 className="size-4 text-emerald-600" />
                图片生成说明
              </div>
              图片将在下一步根据 clean text
              自动生成。本页不再维护图片提示，避免图片和正文编辑脱节。
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function ChapterNav({
  draft,
  activeChapterId,
  onSelect,
}: {
  draft: LessonDraft;
  activeChapterId: string;
  onSelect: (chapterId: string) => void;
}) {
  return (
    <nav className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
      <div className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        章节
      </div>
      <div className="space-y-2">
        {draft.chapters.map((chapter, index) => (
          <button
            className={cn(
              "w-full rounded-xl px-3 py-3 text-left transition duration-200",
              activeChapterId === chapter.id
                ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200"
                : "text-slate-600 hover:bg-slate-50",
            )}
            key={chapter.id}
            onClick={() => onSelect(chapter.id)}
            type="button"
          >
            <div className="text-xs font-semibold">Chapter {index + 1}</div>
            <div className="mt-1 line-clamp-2 text-sm font-medium">
              {chapter.title}
            </div>
          </button>
        ))}
        <button
          className={cn(
            "w-full rounded-xl px-3 py-3 text-left transition duration-200",
            activeChapterId === closingViewId
              ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200"
              : "text-slate-600 hover:bg-slate-50",
          )}
          onClick={() => onSelect(closingViewId)}
          type="button"
        >
          <div className="text-xs font-semibold">Closing</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium">
            {draft.closingReading.title}
          </div>
        </button>
      </div>
    </nav>
  );
}

function ReadingPanel({
  chapter,
  castAliases,
}: {
  chapter: LessonContentChapter;
  castAliases: LessonDraft["castAliases"];
}) {
  return (
    <article>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <BookOpen className="size-5" />
        </span>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
            Reading Text
          </div>
          <h3 className="text-2xl font-semibold leading-9 text-slate-950">
            {chapter.title}
          </h3>
        </div>
      </div>
      <div className="space-y-6 text-[17px] leading-9 text-slate-800">
        {chapter.paragraphs.map((paragraph) => (
          <p key={paragraph.id}>
            {paragraph.sentences.map((sentence) =>
              renderSentence(sentence, chapter.exercises, castAliases),
            )}
          </p>
        ))}
      </div>
    </article>
  );
}

function renderCastText(
  text: string,
  castAliases: LessonDraft["castAliases"],
  keyPrefix: string,
) {
  if (!castAliases.length) {
    return <span>{text}</span>;
  }

  const aliases = castAliases
    .slice()
    .sort((left, right) => right.alias.length - left.alias.length);
  const pattern = new RegExp(
    `\\b(${aliases.map((item) => item.alias.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")).join("|")})\\b`,
    "g",
  );
  const parts: Array<string | { alias: string; displayName: string }> = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    const alias = match[0];
    parts.push(
      castAliases.find((item) => item.alias === alias) ?? {
        alias,
        displayName: alias,
      },
    );
    cursor = index + alias.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={`${keyPrefix}-${index}`}>{part}</span>
        ) : (
          <strong
            className="font-extrabold text-slate-950"
            key={`${keyPrefix}-${index}`}
          >
            {part.displayName}
          </strong>
        ),
      )}
    </>
  );
}

export function replaceCastAliases(
  text: string,
  castAliases: LessonDraft["castAliases"],
) {
  return castAliases
    .slice()
    .sort((left, right) => right.alias.length - left.alias.length)
    .reduce(
      (result, item) =>
        result.replace(
          new RegExp(item.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          () => item.displayName,
        ),
      text,
    );
}

function renderSentence(
  sentence: LessonSentence,
  exercises: LessonExercise[],
  castAliases: LessonDraft["castAliases"],
) {
  const exerciseById = new Map(
    exercises.map((exercise) => [exercise.id, exercise]),
  );
  const labelOrderById = new Map<string, string>();
  let vocabCount = 0;
  let phraseCount = 0;
  for (const exercise of exercises) {
    if (exercise.type === "vocab_hint") {
      vocabCount += 1;
      labelOrderById.set(exercise.id, `V${vocabCount}`);
    } else if (exercise.type === "phrase_hint") {
      phraseCount += 1;
      labelOrderById.set(exercise.id, `P${phraseCount}`);
    }
  }

  return (
    <span className="mr-1" key={sentence.id}>
      {sentence.segments.map((segment, index) => {
        if (segment.type === "text") {
          return (
            <span key={`${sentence.id}-${index}`}>
              {renderCastText(
                segment.text,
                castAliases,
                `${sentence.id}-${index}`,
              )}
            </span>
          );
        }

        const exercise = exerciseById.get(segment.exerciseId);
        if (!exercise) {
          return null;
        }

        return (
          <InlineExercise
            exercise={exercise}
            key={`${sentence.id}-${index}`}
            label={labelOrderById.get(exercise.id)}
          />
        );
      })}{" "}
    </span>
  );
}

function InlineExercise({
  exercise,
  label,
}: {
  exercise: LessonExercise;
  label?: string;
}) {
  if (exercise.type === "given_word_blank") {
    return (
      <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 align-baseline font-medium text-violet-700 ring-1 ring-violet-100">
        <span>({exercise.order})</span>
        <span>________</span>
        <span className="text-violet-500">({exercise.prompt})</span>
      </span>
    );
  }

  if (exercise.type === "choice_blank") {
    return (
      <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 align-baseline font-medium text-blue-700 ring-1 ring-blue-100">
        <span>({exercise.order})</span>
        <span>________</span>
        <span className="text-blue-500">({exercise.choices.join(" / ")})</span>
      </span>
    );
  }

  return (
    <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 align-baseline font-medium text-amber-700 ring-1 ring-amber-100">
      <span>({exercise.order})</span>
      <span>
        [{label}: {exercise.pattern}
      </span>
      <span>
        提示：{exercise.hint}，{exercise.letterCount}个字母]
      </span>
    </span>
  );
}

function exerciseTypeLabel(exercise: LessonExercise) {
  if (exercise.type === "given_word_blank") {
    return "给词填空";
  }

  if (exercise.type === "choice_blank") {
    return "选词填空";
  }

  if (exercise.type === "vocab_hint") {
    return "词汇提示";
  }

  return "短语提示";
}

function AnswerPanel({ chapter }: { chapter: LessonContentChapter }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
          Answers
        </div>
        <h3 className="mt-1 text-base font-semibold text-slate-950">
          本章答案
        </h3>
      </div>
      <ol className="space-y-2">
        {chapter.exercises.map((exercise) => (
          <li
            className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2"
            key={exercise.id}
          >
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              {exercise.order}
            </span>
            <div>
              <div className="font-semibold text-slate-950">
                {exercise.answer}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {exerciseTypeLabel(exercise)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClosingReadingPanel({ draft }: { draft: LessonDraft }) {
  return (
    <article>
      <div className="mb-6 text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
        Closing Reading
      </div>
      <h3 className="text-2xl font-semibold leading-9 text-slate-950">
        {replaceCastAliases(draft.closingReading.title, draft.castAliases)}
      </h3>
      <p className="mt-5 text-[17px] leading-9 text-slate-800">
        {replaceCastAliases(
          draft.closingReading.sentences.join(" "),
          draft.castAliases,
        )}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {draft.closingReading.vocabularyTerms.map((term) => (
          <span
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600"
            key={term}
          >
            {term}
          </span>
        ))}
      </div>
    </article>
  );
}

function NoExercisePanel() {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm text-slate-500 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
        Answers
      </div>
      <p className="mt-2">Closing reading 不包含练习题。</p>
    </section>
  );
}

function StatusPanel({ label, progress }: { label: string; progress: number }) {
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

function GenerationPanel({ elapsedMs }: { elapsedMs: number }) {
  const activeStage =
    generationStages.find((stage) => elapsedMs <= stage.untilMs) ??
    generationStages[generationStages.length - 1];
  const progress = Math.min(
    96,
    Math.max(6, Math.round((elapsedMs / estimatedTotalMs) * 100)),
  );

  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">
              AI 正在生成，预计约 5 分钟
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">
              {activeStage.label}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {activeStage.note}
            </p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <Sparkles className="size-5" />
          </div>
        </div>
        <ProgressBar className="mt-6" progress={progress} />
        <div className="mt-3 text-xs text-slate-500">
          已等待 {formatElapsed(elapsedMs)}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}
    >
      <div
        className="h-full rounded-full bg-violet-600 transition-all duration-700 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
