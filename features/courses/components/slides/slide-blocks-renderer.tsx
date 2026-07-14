"use client";

import { useState } from "react";
import type {
  CoursePreviewExerciseInline,
  CoursePreviewParagraph,
} from "@/lib/contracts/api";

type BlankProps = {
  exercise: CoursePreviewExerciseInline;
  mode: "html" | "pdf";
  revealed: boolean;
  onClick: () => void;
};

const COLOR_MAP = {
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-100",
    hint: "text-violet-500",
    border: "border-violet-400",
  },
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-100",
    hint: "text-blue-500",
    border: "border-blue-400",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-100",
    hint: "text-amber-500",
    border: "border-amber-400",
  },
} as const;

function ExerciseBlank({ exercise, mode, revealed, onClick }: BlankProps) {
  const color = COLOR_MAP[exercise.colorClass];

  if (mode === "pdf") {
    let hintContent: React.ReactNode;
    if (exercise.type === "given_word_blank") {
      hintContent = <span className={color.hint}>({exercise.prompt})</span>;
    } else if (exercise.type === "choice_blank") {
      hintContent = <span className={color.hint}>({(exercise.choices ?? []).join(" / ")})</span>;
    } else {
      hintContent = (
        <span className={color.hint}>
          [{exercise.pattern}: {exercise.hint}，{exercise.letterCount}个字母]
        </span>
      );
    }

    return (
      <span
        className={`mx-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 align-baseline font-medium ring-1 ${color.ring} ${color.text}`}
      >
        <span>({exercise.order})</span>
        <span className="inline-block border-b-2 border-current pb-0.5" style={{ minWidth: "4em" }}>
          {"\u00A0"}
        </span>
        {hintContent}
      </span>
    );
  }

  if (revealed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`mx-1 inline-flex items-center gap-1 rounded-md ${color.bg} px-2 py-0.5 align-baseline font-medium ring-1 ${color.ring} ${color.text} transition hover:opacity-80 cursor-pointer`}
      >
        <span>({exercise.order})</span>
        <span>{exercise.answer}</span>
      </button>
    );
  }

  let hintContent: React.ReactNode;
  if (exercise.type === "given_word_blank") {
    hintContent = <span className={color.hint}>({exercise.prompt})</span>;
  } else if (exercise.type === "choice_blank") {
    hintContent = <span className={color.hint}>({(exercise.choices ?? []).join(" / ")})</span>;
  } else {
    hintContent = (
      <span className={color.hint}>
        [{exercise.pattern}: {exercise.hint}，{exercise.letterCount}个字母]
      </span>
    );
  }

  return (
    <span
      className={`mx-1 inline-flex items-center gap-1 rounded-md ${color.bg} px-2 py-0.5 align-baseline font-medium ring-1 ${color.ring} ${color.text}`}
    >
      <span>({exercise.order})</span>
      <button
        type="button"
        onClick={onClick}
        className={`inline-block border-b-2 ${color.border} align-baseline transition hover:border-slate-700 cursor-pointer bg-transparent p-0`}
        style={{ minWidth: "4em", height: "1.2em" }}
        aria-label="点击显示答案"
      />
      {hintContent}
    </span>
  );
}

type Props = {
  paragraphs: CoursePreviewParagraph[];
  mode: "html" | "pdf";
  className?: string;
  title?: string;
};

export function SlideBlocksRenderer({ paragraphs, mode, className, title }: Props) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`slide-text-content ${className ?? ""}`}>
      {title && (
        <h3 className="text-lg font-bold text-slate-900 mb-3">{title}</h3>
      )}
      {paragraphs.map((paragraph) => (
        <p key={paragraph.id} className="mb-4 leading-[1.7] text-slate-800 whitespace-normal break-words">
          {paragraph.sentences.map((sentence) => (
            <span key={sentence.id} className="mr-1">
              {sentence.segments.map((seg, idx) => {
                if (seg.type === "text") {
                  return <span key={`${sentence.id}-${idx}`}>{seg.text}</span>;
                }
                return (
                  <ExerciseBlank
                    key={`${sentence.id}-${idx}`}
                    exercise={seg.exercise}
                    mode={mode}
                    revealed={revealed.has(seg.exercise.id)}
                    onClick={() => toggle(seg.exercise.id)}
                  />
                );
              })}
              {" "}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
