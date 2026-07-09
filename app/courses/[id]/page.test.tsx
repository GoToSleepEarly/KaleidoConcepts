import { describe, expect, it, vi } from "vitest";

import CoursePage from "./page";

vi.mock("@/components/protected-layout", () => ({
  ProtectedLayout: vi.fn(({ children }) => children),
}));

vi.mock("@/features/courses/components/course-preview", () => ({
  CourseHtmlPreview: vi.fn(() => null),
}));

describe("CoursePage", () => {
  it("renders the standalone preview without the app shell", async () => {
    const page = await CoursePage({ params: Promise.resolve({ id: "course-1" }) });

    expect(page.props.chromeless).toBe(true);
  });
});
