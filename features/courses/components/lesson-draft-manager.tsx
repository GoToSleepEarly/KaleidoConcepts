"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  LessonContentChapter,
  LessonDraft,
  LessonDraftGeneration,
  LessonDraftResponse,
  LessonExercise,
  LessonSentence,
  LlmModel,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const closingViewId = "__closing__";

const pollIntervalMs = 5_000;

const llmModelOptions: { value: LlmModel; label: string }[] = [
  { value: "deepseek_chat", label: "DeepSeek" },
  { value: "gpt_5_5", label: "GPT 5.5" },
];

const idleGeneration: LessonDraftGeneration = {
  status: "idle",
  startedAt: null,
  error: null,
};

const estimatedTotalMs = 300_000;
const generationStages = [
  {
    label: "规划英文阅读结构",
    note: "读取故事大纲、人物信息和 CEFR 等级要求。",
    untilMs: 45_000,
  },
  {
    label: "生成故事正文与互动题",
    note: "AI 正在生成完整故事、句子片段和多种练习题。",
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
  const [editDraft, setEditDraft] = useState<LessonDraft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [generation, setGeneration] =
    useState<LessonDraftGeneration>(idleGeneration);
  const [selectedLlmModel, setSelectedLlmModel] = useState<LlmModel>("deepseek_chat");
  const [activeChapterId, setActiveChapterId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const workingDraft = isEditing ? editDraft : draft;
  const activeChapter =
    workingDraft?.chapters.find((chapter) => chapter.id === activeChapterId) ??
    workingDraft?.chapters[0] ??
    null;
  const isClosingActive = activeChapterId === closingViewId;
  const isGenerating = generation.status === "running" && !draft;

  function applyResponse(data: LessonDraftResponse) {
    setGeneration(data.generation);
    setSelectedLlmModel(data.llmModel);
    if (data.draft) {
      setDraft(data.draft);
      setActiveChapterId((current) =>
        current && current !== closingViewId
          ? current
          : (data.draft?.chapters[0]?.id ?? ""),
      );
    }
  }

  function beginEdit() {
    if (!draft) {
      return;
    }
    setEditDraft(structuredClone(draft));
    setIsEditing(true);
    setMessage("");
    setError("");
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditDraft(null);
    setMessage("");
    setError("");
  }

  function mutateEditDraft(mutator: (draft: LessonDraft) => void) {
    setEditDraft((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
  }

  function updateChapterTitle(chapterId: string, title: string) {
    mutateEditDraft((next) => {
      const chapter = next.chapters.find((item) => item.id === chapterId);
      if (chapter) {
        chapter.title = title;
      }
    });
  }

  function updateSegmentText(
    chapterId: string,
    sentenceId: string,
    segmentIndex: number,
    text: string,
  ) {
    mutateEditDraft((next) => {
      const chapter = next.chapters.find((item) => item.id === chapterId);
      const segment = chapter?.paragraphs
        .flatMap((paragraph) => paragraph.sentences)
        .find((sentence) => sentence.id === sentenceId)?.segments[segmentIndex];
      if (segment && segment.type === "text") {
        segment.text = text;
      }
    });
  }

  function updateExerciseAnswer(
    chapterId: string,
    exerciseId: string,
    answer: string,
  ) {
    mutateEditDraft((next) => {
      const exercise = next.chapters
        .find((item) => item.id === chapterId)
        ?.exercises.find((item) => item.id === exerciseId);
      if (exercise) {
        exercise.answer = answer;
      }
    });
  }

  function updateExerciseHint(
    chapterId: string,
    exerciseId: string,
    hint: string,
  ) {
    mutateEditDraft((next) => {
      const exercise = next.chapters
        .find((item) => item.id === chapterId)
        ?.exercises.find((item) => item.id === exerciseId);
      if (
        exercise &&
        (exercise.type === "vocab_hint" || exercise.type === "phrase_hint")
      ) {
        exercise.hint = hint;
      }
    });
  }

  function updateExercisePrompt(
    chapterId: string,
    exerciseId: string,
    prompt: string,
  ) {
    mutateEditDraft((next) => {
      const exercise = next.chapters
        .find((item) => item.id === chapterId)
        ?.exercises.find((item) => item.id === exerciseId);
      if (exercise && exercise.type === "given_word_blank") {
        exercise.prompt = prompt;
      }
    });
  }

  function updateExerciseChoice(
    chapterId: string,
    exerciseId: string,
    choiceIndex: number,
    value: string,
  ) {
    mutateEditDraft((next) => {
      const exercise = next.chapters
        .find((item) => item.id === chapterId)
        ?.exercises.find((item) => item.id === exerciseId);
      if (exercise && exercise.type === "choice_blank") {
        exercise.choices[choiceIndex] = value;
      }
    });
  }

  function updateClosingTitle(title: string) {
    mutateEditDraft((next) => {
      next.closingReading.title = title;
    });
  }

  function updateClosingSentence(index: number, text: string) {
    mutateEditDraft((next) => {
      next.closingReading.sentences[index] = text;
    });
  }

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

        const data = (await response.json()) as LessonDraftResponse;

        if (isActive) {
          applyResponse(data);
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

  // Poll while the server keeps generating so a refresh / reopened tab recovers the "generating" state
  // and lands on the finished draft (or a failure) without re-triggering a paid generation.
  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    let isActive = true;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}/lesson-draft`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as LessonDraftResponse;
        if (isActive) {
          applyResponse(data);
        }
      } catch {
        // Transient poll failure: keep the current state and retry on the next tick.
      }
    }, pollIntervalMs);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [courseId, isGenerating]);

  // Tick a local clock while generating so the progress bar advances smoothly between polls,
  // anchored to the server-provided startedAt so a refresh does not reset progress to zero.
  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const startedAtMs = generation.startedAt
    ? new Date(generation.startedAt).getTime()
    : null;
  const elapsedMs = startedAtMs ? Math.max(0, nowMs - startedAtMs) : 0;

  async function generateDraft() {
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/courses/${courseId}/lesson-draft/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ llmModel: selectedLlmModel }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "阅读草稿生成失败");
      }

      const data = (await response.json()) as LessonDraftResponse;
      applyResponse(data);
      if (data.draft) {
        setMessage("英文互动阅读草稿已生成。");
      }
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "阅读草稿生成失败",
      );
    }
  }

  async function saveDraft() {
    if (!editDraft) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/lesson-draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: editDraft }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "阅读草稿保存失败");
      }

      const data = (await response.json()) as { draft: LessonDraft };
      setDraft(data.draft);
      setEditDraft(null);
      setIsEditing(false);
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
    return <StatusPanel label="正在加载英文阅读草稿..." />;
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
            {isEditing ? (
              <>
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
                  disabled={isSaving}
                  onClick={cancelEdit}
                  type="button"
                  variant="outline"
                >
                  <X className="size-4" />
                  取消编辑
                </Button>
              </>
            ) : (
              <>
                <Button onClick={beginEdit} type="button" variant="outline">
                  <Pencil className="size-4" />
                  编辑草稿
                </Button>
                <Button
                  asChild
                  className="bg-slate-950 text-white hover:bg-slate-800"
                >
                  <Link href={`/courses/${courseId}/create/resources`}>
                    进入资源生成
                  </Link>
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
          编辑模式：可修改章节标题、正文文字、答案与提示。题目数量、题型和结构不可更改；保存时系统会依据答案重算填空提示、字母数与词表。
        </div>
      ) : null}

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
              {generation.status === "failed"
                ? "重新生成英文互动阅读草稿"
                : "生成英文互动阅读草稿"}
            </h3>
            {generation.status === "failed" && generation.error ? (
              <p className="mx-auto mt-2 max-w-xl rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-600">
                上次生成未完成：{generation.error}
              </p>
            ) : null}
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              系统会基于选中的中文故事大纲，生成英文正文、嵌入式练习题和答案。生成期间可以离开或刷新页面，进度会自动恢复。
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <span className="text-sm text-slate-600">AI 模型：</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {llmModelOptions.map((option) => (
                  <button
                    key={option.value}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition",
                      selectedLlmModel === option.value
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                    onClick={() => setSelectedLlmModel(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="mt-5 bg-violet-600 text-white hover:bg-violet-700"
              onClick={generateDraft}
              type="button"
            >
              <Sparkles className="size-4" />
              {generation.status === "failed" ? "重新生成阅读草稿" : "生成阅读草稿"}
            </Button>
          </section>
        )
      ) : workingDraft ? (
        <div className="grid gap-5 xl:grid-cols-[220px_1fr_300px]">
          <ChapterNav
            activeChapterId={activeChapterId}
            draft={workingDraft}
            onSelect={setActiveChapterId}
          />
          <section className="min-h-[560px] rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            {isClosingActive ? (
              <ClosingReadingPanel
                draft={workingDraft}
                isEditing={isEditing}
                onChangeSentence={updateClosingSentence}
                onChangeTitle={updateClosingTitle}
              />
            ) : activeChapter ? (
              <ReadingPanel
                castAliases={workingDraft.castAliases}
                chapter={activeChapter}
                isEditing={isEditing}
                onChangeSegmentText={updateSegmentText}
                onChangeTitle={updateChapterTitle}
              />
            ) : null}
          </section>
          <aside className="space-y-4">
            {isClosingActive ? (
              <NoExercisePanel />
            ) : activeChapter ? (
              <AnswerPanel
                chapter={activeChapter}
                isEditing={isEditing}
                onChangeAnswer={updateExerciseAnswer}
                onChangeChoice={updateExerciseChoice}
                onChangeHint={updateExerciseHint}
                onChangePrompt={updateExercisePrompt}
              />
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
      ) : null}
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
  isEditing,
  onChangeTitle,
  onChangeSegmentText,
}: {
  chapter: LessonContentChapter;
  castAliases: LessonDraft["castAliases"];
  isEditing: boolean;
  onChangeTitle: (chapterId: string, title: string) => void;
  onChangeSegmentText: (
    chapterId: string,
    sentenceId: string,
    segmentIndex: number,
    text: string,
  ) => void;
}) {
  return (
    <article>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <BookOpen className="size-5" />
        </span>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
            Reading Text
          </div>
          {isEditing ? (
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-2xl font-semibold leading-9 text-slate-950 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              onChange={(event) =>
                onChangeTitle(chapter.id, event.target.value)
              }
              value={chapter.title}
            />
          ) : (
            <h3 className="text-2xl font-semibold leading-9 text-slate-950">
              {chapter.title}
            </h3>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="space-y-6">
          {chapter.paragraphs.map((paragraph) => (
            <div className="space-y-3" key={paragraph.id}>
              {paragraph.sentences.map((sentence) => (
                <EditableSentence
                  chapterId={chapter.id}
                  exercises={chapter.exercises}
                  key={sentence.id}
                  onChangeSegmentText={onChangeSegmentText}
                  sentence={sentence}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6 text-[17px] leading-9 text-slate-800">
          {chapter.paragraphs.map((paragraph) => (
            <p key={paragraph.id}>
              {paragraph.sentences.map((sentence) =>
                renderSentence(sentence, chapter.exercises, castAliases),
              )}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}

function EditableSentence({
  sentence,
  exercises,
  chapterId,
  onChangeSegmentText,
}: {
  sentence: LessonSentence;
  exercises: LessonExercise[];
  chapterId: string;
  onChangeSegmentText: (
    chapterId: string,
    sentenceId: string,
    segmentIndex: number,
    text: string,
  ) => void;
}) {
  const exerciseById = new Map(
    exercises.map((exercise) => [exercise.id, exercise]),
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2">
      {sentence.segments.map((segment, index) => {
        if (segment.type === "text") {
          return (
            <input
              className="min-w-[80px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              key={`${sentence.id}-${index}`}
              onChange={(event) =>
                onChangeSegmentText(
                  chapterId,
                  sentence.id,
                  index,
                  event.target.value,
                )
              }
              value={segment.text}
            />
          );
        }
        const exercise = exerciseById.get(segment.exerciseId);
        return (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700"
            key={`${sentence.id}-${index}`}
          >
            填空（{exercise ? `第 ${exercise.order} 题` : "?"}）
          </span>
        );
      })}
    </div>
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

function AnswerPanel({
  chapter,
  isEditing,
  onChangeAnswer,
  onChangeHint,
  onChangePrompt,
  onChangeChoice,
}: {
  chapter: LessonContentChapter;
  isEditing: boolean;
  onChangeAnswer: (chapterId: string, exerciseId: string, answer: string) => void;
  onChangeHint: (chapterId: string, exerciseId: string, hint: string) => void;
  onChangePrompt: (
    chapterId: string,
    exerciseId: string,
    prompt: string,
  ) => void;
  onChangeChoice: (
    chapterId: string,
    exerciseId: string,
    choiceIndex: number,
    value: string,
  ) => void;
}) {
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
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="space-y-1.5">
                  <input
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-950 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    onChange={(event) =>
                      onChangeAnswer(chapter.id, exercise.id, event.target.value)
                    }
                    value={exercise.answer}
                  />
                  {exercise.type === "given_word_blank" ? (
                    <LabeledInput
                      label="提示词"
                      onChange={(value) =>
                        onChangePrompt(chapter.id, exercise.id, value)
                      }
                      value={exercise.prompt}
                    />
                  ) : null}
                  {exercise.type === "choice_blank" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {exercise.choices.map((choice, choiceIndex) => (
                        <input
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                          key={choiceIndex}
                          onChange={(event) =>
                            onChangeChoice(
                              chapter.id,
                              exercise.id,
                              choiceIndex,
                              event.target.value,
                            )
                          }
                          value={choice}
                        />
                      ))}
                    </div>
                  ) : null}
                  {exercise.type === "vocab_hint" ||
                  exercise.type === "phrase_hint" ? (
                    <LabeledInput
                      label="提示"
                      onChange={(value) =>
                        onChangeHint(chapter.id, exercise.id, value)
                      }
                      value={exercise.hint}
                    />
                  ) : null}
                  <div className="text-xs text-slate-400">
                    {exerciseTypeLabel(exercise)}（提示格式与字母数保存时自动重算）
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-semibold text-slate-950">
                    {exercise.answer}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {exerciseTypeLabel(exercise)}
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span className="shrink-0">{label}</span>
      <input
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ClosingReadingPanel({
  draft,
  isEditing,
  onChangeTitle,
  onChangeSentence,
}: {
  draft: LessonDraft;
  isEditing: boolean;
  onChangeTitle: (title: string) => void;
  onChangeSentence: (index: number, text: string) => void;
}) {
  return (
    <article>
      <div className="mb-6 text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">
        Closing Reading
      </div>
      {isEditing ? (
        <div className="space-y-4">
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-2xl font-semibold leading-9 text-slate-950 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            onChange={(event) => onChangeTitle(event.target.value)}
            value={draft.closingReading.title}
          />
          <div className="space-y-2">
            {draft.closingReading.sentences.map((sentence, index) => (
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] leading-7 text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                key={index}
                onChange={(event) => onChangeSentence(index, event.target.value)}
                rows={2}
                value={sentence}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400">
            词表将在保存时依据词汇 / 短语题答案自动重算。
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}
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

function StatusPanel({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-violet-700" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
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
