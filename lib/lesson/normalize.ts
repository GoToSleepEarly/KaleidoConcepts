import { createHash } from "node:crypto";

import type { LessonBlock, LessonSection, LessonSegment, NormalizeErrorCode, NormalizeResult } from "./types";

const SECTION_HEADING = /^(?:第[一二三四五1-5]+阶段|Stage\s*[1-5])[:：]\s*(.+)$/i;

export function normalizeLessonText(input: string): NormalizeResult {
  const text = input.replace(/\r\n/g, "\n").trim();
  const answerIndex = findHeadingIndex(text, "Answer Key");
  const homeworkIndex = findHeadingIndex(text, "Homework Reading");

  if (answerIndex === -1) {
    return fail("MISSING_ANSWER_KEY", "Lesson Text must include Answer Key.");
  }

  if (homeworkIndex === -1 || homeworkIndex < answerIndex) {
    return fail("MISSING_HOMEWORK", "Lesson Text must include Homework Reading after Answer Key.");
  }

  const storyPart = text.slice(0, answerIndex).trim();
  const answerPart = text.slice(answerIndex, homeworkIndex).replace(/^Answer Key\s*/i, "").trim();
  const homework = text.slice(homeworkIndex).replace(/^Homework Reading\s*/i, "").trim();
  const storyLines = storyPart.split("\n");
  const firstSectionIndex = storyLines.findIndex((line) => SECTION_HEADING.test(line.trim()));

  if (firstSectionIndex <= 0) {
    return fail("MISSING_INTRODUCTION", "Lesson Text must include Introduction before five stages.");
  }

  const intro = storyLines.slice(0, firstSectionIndex).join("\n").replace(/^Introduction\s*/i, "").trim();
  if (!intro) {
    return fail("MISSING_INTRODUCTION", "Introduction cannot be empty.");
  }

  const sections = parseSections(storyLines.slice(firstSectionIndex).join("\n"));
  if (sections.length !== 5) {
    return fail("SECTION_COUNT_INVALID", "Lesson Text must include exactly five story stages.");
  }

  const answerKey = answerPart
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ id: `answer-${index + 1}`, text: line }));

  let blankCount = 0;
  const normalizedSections = sections.map((section, index) => {
    const blocks = section.body
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph): LessonBlock => {
        const segments: LessonSegment[] = [];
        const parts = paragraph.split("____");

        parts.forEach((part, partIndex) => {
          if (part) segments.push({ type: "text", text: part });
          if (partIndex < parts.length - 1) {
            blankCount += 1;
            segments.push({
              type: "blank",
              id: `blank-${blankCount}`,
              answerKeyId: `answer-${blankCount}`,
            });
          }
        });

        return { type: "paragraph", segments };
      });

    if (blocks.length === 0) {
      return null;
    }

    const sectionNumber = index + 1;

    return {
      id: `section-${sectionNumber}`,
      title: section.title,
      blocks,
      imageSlots: [
        { id: `section-${sectionNumber}-image-1`, slotIndex: 1 },
        { id: `section-${sectionNumber}-image-2`, slotIndex: 2 },
      ],
      sourceHash: hashText(`${section.title}\n${section.body}`),
    };
  });

  if (normalizedSections.some((section) => section === null)) {
    return fail("EMPTY_SECTION", "Every story stage must include body text.");
  }

  const validSections = normalizedSections.filter((section): section is LessonSection => section !== null);

  if (blankCount !== answerKey.length) {
    return fail(
      "BLANK_ANSWER_MISMATCH",
      `Found ${blankCount} blanks but ${answerKey.length} answer key lines.`,
    );
  }

  return {
    ok: true,
    lesson: {
      title: validSections[0]?.title ?? "Untitled Lesson",
      intro,
      sections: validSections,
      answerKey,
      homework,
    },
  };
}

function parseSections(text: string) {
  const lines = text.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(SECTION_HEADING);

    if (heading) {
      if (current) {
        sections.push({ title: current.title, body: current.bodyLines.join("\n").trim() });
      }
      current = { title: heading[1].trim(), bodyLines: [] };
      continue;
    }

    current?.bodyLines.push(rawLine);
  }

  if (current) {
    sections.push({ title: current.title, body: current.bodyLines.join("\n").trim() });
  }

  return sections;
}

function findHeadingIndex(text: string, heading: string) {
  const match = text.match(new RegExp(`(^|\\n)${heading}\\s*(\\n|$)`, "i"));
  return match?.index === undefined ? -1 : match.index + (match[1] ? 1 : 0);
}

function hashText(text: string) {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

function fail(code: NormalizeErrorCode, message: string): NormalizeResult {
  return { ok: false, error: { code, message } };
}
