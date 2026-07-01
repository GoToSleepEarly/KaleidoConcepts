"use client";

import { useState } from "react";

import type { StructuredLesson } from "@/lib/lesson/types";

type CourseImageView = {
  id: string;
  sectionId: string;
  slotIndex: number;
  status: string;
  url: string | null;
};

export function CourseContent({
  lesson,
  images,
  showAnswers,
}: {
  lesson: StructuredLesson;
  images: CourseImageView[];
  showAnswers: boolean;
}) {
  const [visibleAnswers, setVisibleAnswers] = useState<Record<string, boolean>>({});
  const answers = new Map(lesson.answerKey.map((answer) => [answer.id, answer.text]));

  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 shadow-sm print:shadow-none">
      <header className="border-b pb-6">
        <h1 className="text-3xl font-semibold leading-tight">{lesson.title}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{lesson.intro}</p>
      </header>
      <div className="mt-8 space-y-10">
        {lesson.sections.map((section) => (
          <section className="space-y-5" key={section.id}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {images
                .filter((image) => image.sectionId === section.id)
                .sort((a, b) => a.slotIndex - b.slotIndex)
                .map((image) => (
                  <div className="aspect-[4/3] overflow-hidden rounded-md border bg-muted" key={image.id}>
                    {image.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={`${section.title} illustration ${image.slotIndex}`} className="h-full w-full object-cover" src={image.url} />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                        Image {image.slotIndex}: {image.status}
                      </div>
                    )}
                  </div>
                ))}
            </div>
            <div className="space-y-4 text-lg leading-9">
              {section.blocks.map((block, blockIndex) => (
                <p key={`${section.id}-${blockIndex}`}>
                  {block.segments.map((segment, segmentIndex) => {
                    if (segment.type === "text") {
                      return <span key={segmentIndex}>{segment.text}</span>;
                    }

                    const isVisible = Boolean(visibleAnswers[segment.id]);
                    const answer = answers.get(segment.answerKeyId) ?? "";

                    if (!showAnswers) {
                      return <span className="mx-1 inline-block min-w-20 border-b border-foreground" key={segment.id}>&nbsp;</span>;
                    }

                    return (
                      <button
                        className="mx-1 inline-flex min-w-20 justify-center border-b border-primary px-1 text-primary"
                        key={segment.id}
                        onClick={() =>
                          setVisibleAnswers((current) => ({
                            ...current,
                            [segment.id]: !current[segment.id],
                          }))
                        }
                        type="button"
                      >
                        {isVisible ? answer : "\u00a0"}
                      </button>
                    );
                  })}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      {showAnswers ? (
        <section className="print-hidden mt-10 rounded-md bg-muted p-5">
          <h2 className="font-semibold">Answer Key</h2>
          <ol className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {lesson.answerKey.map((answer, index) => (
              <li key={answer.id}>
                {index + 1}. {answer.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section className="mt-10 border-t pt-6">
        <h2 className="text-lg font-semibold">Homework Reading</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{lesson.homework}</p>
      </section>
    </article>
  );
}
