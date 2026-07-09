import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoursePreviewResponse } from "@/lib/contracts/api";
import { CourseCreatePreviewEmbed, CourseHtmlPreview, CoursePdfPreview, CoursePreviewDocument } from "./course-preview";

const preview: CoursePreviewResponse = {
  course: {
    id: "course-1",
    title: "The Moon Gate Course",
    teacherName: "Ms. Lin",
    studentNames: ["Summer"],
    englishLevel: "A1",
    durationMinutes: 45,
    theme: "Nature",
    grammar: ["Past Simple"],
  },
  resourceProgress: {
    total: 2,
    succeeded: 1,
    generating: 0,
    failed: 0,
    missing: 1,
    stale: 0,
  },
  pages: [
    { id: "cover", type: "cover", title: "The Moon Gate" },
    {
      id: "chapter-1-shot-1",
      type: "lesson_shot",
      chapterId: "chapter-1",
      chapterTitle: "The First Gate",
      chapterIndex: 1,
      shotId: "shot-1",
      shotOrder: 1,
      title: "The First Gate · Page 1",
      image: {
        status: "missing",
        publicUrl: null,
        stale: false,
        failureReason: null,
      },
      blocks: [
        { id: "block-1", order: 1, type: "text", text: "Summer opens the gate." },
        {
          id: "block-2",
          order: 2,
          type: "exercise",
          exerciseId: "exercise-1",
          display: { kind: "verb_blank", placeholder: "________", prompt: "open" },
        },
      ],
      exercises: [{ id: "exercise-1", type: "verb_blank", answer: "opens", baseVerb: "open" }],
    },
    {
      id: "closing-reading",
      type: "closing_reading",
      title: "After the Gate",
      text: "Summer remembers the gate.",
      vocabularyTerms: ["gate"],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CoursePreviewDocument", () => {
  it("renders blanks but not answers in student/pdf mode", () => {
    render(<CoursePreviewDocument data={preview} mode="pdf" audience="student" />);

    expect(screen.getAllByRole("group", { name: /slide/i })).toHaveLength(5);
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("________")).toBeInTheDocument();
    expect(screen.queryByText("opens")).not.toBeInTheDocument();
    expect(screen.getByText("图片未生成")).toBeInTheDocument();
  });

  it("renders course cover, image slides, exercise slides, and closing reading", () => {
    render(<CoursePreviewDocument data={preview} mode="html" audience="teacher" />);

    expect(screen.getByText("The Moon Gate")).toBeInTheDocument();
    expect(screen.getByText("The Moon Gate Course")).toBeInTheDocument();
    expect(screen.getByText("Story Scene")).toBeInTheDocument();
    expect(screen.getByText("Practice Mission")).toBeInTheDocument();
    expect(screen.getByText("After the Gate")).toBeInTheDocument();
    expect(screen.getByText("gate")).toBeInTheDocument();
  });

  it("reveals answers when a teacher clicks a blank", () => {
    render(<CoursePreviewDocument data={preview} mode="html" audience="teacher" />);

    expect(screen.queryByText("opens")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /blank.*open/i }));
    expect(screen.getByText("opens")).toBeInTheDocument();
  });

  it("keeps practice text and blanks in one wrapping text block", () => {
    render(<CoursePreviewDocument data={preview} mode="pdf" audience="student" />);

    const copy = screen.getByTestId("practice-copy-chapter-1-shot-1");
    expect(copy).toHaveTextContent("Summer opens the gate. ________");
    expect(copy).not.toHaveTextContent("verb: open");
    expect(copy).toHaveClass("whitespace-normal");
    expect(copy).toHaveClass("break-words");
  });
});

describe("CourseHtmlPreview", () => {
  it("shows one active slide in a full-screen deck and advances through chapter, image, and practice slides", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => preview,
    } as Response);

    render(<CourseHtmlPreview courseId="course-1" />);

    await waitFor(() => expect(screen.getByLabelText("Next slide")).toBeInTheDocument());
    expect(screen.getByLabelText("Previous slide")).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /slide/i })).toHaveLength(1);
    expect(screen.queryByText("老师工具")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.getByText("Story Scene")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.getByText("Practice Mission")).toBeInTheDocument();
  });
});

describe("CoursePdfPreview", () => {
  it("hides answers and action areas in PDF preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => preview,
    } as Response);

    render(<CoursePdfPreview courseId="course-1" />);

    await waitFor(() => expect(screen.getByText("打印 / 保存 PDF")).toBeInTheDocument());
    expect(screen.getAllByRole("group", { name: /slide/i })).toHaveLength(5);
    expect(screen.queryByText("老师工具")).not.toBeInTheDocument();
    expect(screen.queryByText("opens")).not.toBeInTheDocument();
    expect(screen.queryByText("返回资源生成")).not.toBeInTheDocument();
  });
});

describe("CourseCreatePreviewEmbed", () => {
  it("renders the HTML preview inside Step 5 without a second protected iframe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => preview,
    } as Response);

    render(<CourseCreatePreviewEmbed courseId="course-1" />);

    expect(screen.queryByTitle("课程 HTML 预览")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "课程创建步骤" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Next slide")).toBeInTheDocument());
  });
});
