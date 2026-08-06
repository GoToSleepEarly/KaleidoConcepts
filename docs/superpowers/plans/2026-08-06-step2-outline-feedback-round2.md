# Step2 Outline Feedback Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine Step 2 so broad teacher ideas generate selectable directions first, loading communicates progress, the right panel separates outline/roles/references, classroom roles reuse Step 1 snapshots, and the editable outline focuses only on story development.

**Architecture:** Keep the existing Step2 monolith APIs and Prisma tables. Add optional contract fields stored in existing text/json columns where possible, avoiding a schema migration. Extend AI decision to include `generate_directions`, reshape prompts toward concise story-flow fields, and update the client workspace to use tabs, edit/save controls, and timer-based loading.

**Tech Stack:** Next.js App Router, React client components, TypeScript contracts, Zod validation, Prisma repositories, QuickRouter Responses, Vitest, Testing Library.

---

## File Structure

- Modify `lib/contracts/api.ts`: add `generate_directions`, reference source label helpers, and concise chapter fields.
- Modify `lib/server/validation/story-outline.ts`: accept `generate_directions` and concise outline save fields.
- Modify `lib/server/ai/story-outline-deps.ts`: update decision and outline prompts; remove default investigation/line-clue bias.
- Modify `lib/server/repositories/story-outline.ts`: handle `generate_directions`, map classroom people separately from AI characters, preserve concise chapter fields through existing columns, and support outline/character edits through existing save endpoint.
- Modify `features/courses/components/course-story-outline-workspace.tsx`: add loading timer, right-panel tabs, editable outline, classroom/reference/original role separation, and visible reference source.
- Modify `features/courses/components/course-story-outline-workspace.test.tsx`: cover loading timer, tabs, classroom role display, direction generation for broad input, and edit/save.
- Modify `lib/server/repositories/story-outline.test.ts`: cover `generate_directions`, teacher reference source labels, classroom roles, and concise outline save.
- Modify `docs/frontend/course-create-lesson-chat.md`: update implementation status after completion.

## Task 1: Contracts and Validation

**Files:**
- Modify: `lib/contracts/api.ts`
- Modify: `lib/server/validation/story-outline.ts`
- Test: `lib/server/repositories/story-outline.test.ts`
- Test: `features/courses/components/course-story-outline-workspace.test.tsx`

- [ ] **Step 1: Extend chat action and decision contract**

In `lib/contracts/api.ts`, add a fixed action used when AI asks the system to produce directions:

```ts
    | "generate_directions"
```

The full `CourseStoryChatAction["action"]` union should contain:

```ts
  action:
    | "choose_direction"
    | "confirm_reference_object"
    | "request_reference_search"
    | "supply_reference_material"
    | "choose_reference_search"
    | "generate_directions"
    | "generate_from_reference"
    | "regenerate_outline";
```

- [ ] **Step 2: Add concise chapter aliases**

In `lib/contracts/api.ts`, extend `CourseStoryOutlineChapter`:

```ts
  whatHappens?: string;
  characterActions?: string;
  mainlineProgress?: string;
```

These are optional display aliases. For this iteration they are persisted through existing columns:

- `storyGoal` stores `whatHappens`.
- `keyEvents` stores `[characterActions, mainlineProgress]` when concise fields are present.
- `setting` and `endingHook` remain in the DB for compatibility but are hidden from the right-panel outline.

- [ ] **Step 3: Update message validation**

In `lib/server/validation/story-outline.ts`, extend `storyOutlineMessageSchema.action`:

```ts
      z.literal("generate_directions"),
```

- [ ] **Step 4: Update chapter save schema**

In `lib/server/validation/story-outline.ts`, extend `chapterSchema`:

```ts
  whatHappens: z.string().optional(),
  characterActions: z.string().optional(),
  mainlineProgress: z.string().optional(),
```

- [ ] **Step 5: Write failing repository test for decision-generated directions**

In `lib/server/repositories/story-outline.test.ts`, add:

```ts
test("generates direction cards when AI decides free input is broad", async () => {
  const db = createDb();
  const decideFreeInput = vi.fn(async () => ({
    decision: "generate_directions" as const,
    assistantMessage: "这个想法方向明确，但主线还可以先选一个方向。",
  }));
  const generateDirections = vi.fn(deps.generateDirections);

  const state = await handleStoryOutlineMessage(db, "course-1", {
    message: "写一个冒险故事",
    mode: "idea",
  }, { ...deps, decideFreeInput, generateDirections });

  expect(generateDirections).toHaveBeenCalledWith(expect.objectContaining({
    message: "写一个冒险故事",
  }));
  expect(state.outline).toBeNull();
  expect(state.directions.length).toBeGreaterThan(0);
  expect(state.chatMessages.at(-1)?.content).toBe("我生成了 3 个故事方向，你可以选一个继续。");
});
```

- [ ] **Step 6: Run repository test and verify red**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts
```

Expected: FAIL because `generate_directions` is not in the decision type or repository branch yet.

## Task 2: AI Decision and Story Prompt

**Files:**
- Modify: `lib/server/ai/story-outline-deps.ts`
- Modify: `lib/server/repositories/story-outline.ts`
- Modify: `lib/server/repositories/story-outline.test.ts`

- [ ] **Step 1: Extend decision type**

In `lib/server/ai/story-outline-deps.ts`, change `FreeInputDecision["decision"]`:

```ts
decision: "ask_clarification" | "request_reference_material" | "generate_directions" | "generate_outline";
```

In `lib/server/repositories/story-outline.ts`, update `StoryOutlineGenerationDeps.decideFreeInput` with the same union.

- [ ] **Step 2: Update decision prompt**

In `decideFreeInput`, replace the decision instruction lines with:

```ts
"decision 只能是 ask_clarification, request_reference_material, generate_directions, generate_outline。",
"如果老师输入方向明确但主线不具体，例如只有故事类型、对象、主题或氛围，返回 generate_directions。",
"如果老师明确写了故事类型，后续方向必须保持这个类型。",
"如果老师写“冒险”，不要默认转成调查、推理或解谜。",
"如果信息已经足够生成章节主线，返回 generate_outline。",
```

- [ ] **Step 3: Update direction prompt**

In `generateDirections`, replace the prompt body with:

```ts
[
  "你是英语 PBL 绘本课程故事方向策划助手。",
  "请只返回 JSON 数组，包含 3 个故事方向。",
  "每项字段：title, hook, whyFits, mainCharacters, classroomValue, seedPrompt。",
  "方向卡只用于选择故事走向，不是完整大纲。",
  "如果老师明确指定故事类型，3 个方向都必须保持该类型。",
  "如果老师写冒险，方向必须是任务、旅程、挑战、选择和行动，不要默认写成调查、推理或解谜。",
  "3 个方向要有明显差异：任务目标、冲突来源、主角视角或冒险路径至少一项不同。",
  `课程：${input.course.title}，时长：${input.course.durationMinutes} 分钟。`,
  `老师偏好：${input.message || "无"}`,
].join("\n")
```

- [ ] **Step 4: Update outline prompt to concise mainline fields**

In `generateOutline`, change the JSON instruction to:

```ts
"请只返回 JSON 对象，字段：title, summary, narrativeType, characters, chapters。",
"chapters 每项字段：order, title, whatHappens, characterActions, mainlineProgress, characterIds。",
"不要返回 setting、endingHook、图片提示、练习设计、语法点或复杂结构字段。",
"每章只写老师快速判断故事发展所需的信息：本章发生什么、主要人物做了什么、如何推动主线。",
"老师明确指定故事类型时必须保持该类型；冒险故事默认写任务、旅程、挑战、选择和行动。",
"只有老师明确要求解谜、侦探、调查、线索、推理时，才把主线写成调查或解谜。",
"课堂角色来自授课人物，不要为课堂角色编写外貌、性格或背景描述。",
"引用角色和原创角色才需要故事功能、简短描述和改编边界。",
```

- [ ] **Step 5: Parse concise fields into compatible chapter shape**

In `story-outline-deps.ts`, update parsed chapter type:

```ts
chapters: Array<{
  order: number;
  title: string | { zh: string; en: string };
  whatHappens?: string;
  characterActions?: string;
  mainlineProgress?: string;
  storyGoal?: string;
  keyEvents?: string[];
  characterIds: string[];
  setting?: string;
  endingHook?: string;
}>;
```

Map chapters:

```ts
chapters: parsed.chapters.map((chapter) => ({
  ...chapter,
  title: bilingualText(chapter.title),
  storyGoal: chapter.whatHappens || chapter.storyGoal || "",
  keyEvents: [
    chapter.characterActions,
    chapter.mainlineProgress,
    ...(chapter.keyEvents ?? []),
  ].filter((item): item is string => Boolean(item)),
  setting: chapter.setting || "",
  endingHook: chapter.endingHook || "",
  whatHappens: chapter.whatHappens || chapter.storyGoal || "",
  characterActions: chapter.characterActions || "",
  mainlineProgress: chapter.mainlineProgress || "",
})),
```

- [ ] **Step 6: Implement repository `generate_directions` branch**

In `handleStoryOutlineMessage`, after fixed actions and before final outline generation, add:

```ts
if (decision.decision === "generate_directions") {
  const directions = await deps.generateDirections({ course, message: input.message });
  await db.courseStoryDirection.deleteMany({ where: { courseId } });
  await db.courseStoryDirection.createMany({ data: directions.map((direction) => ({ courseId, ...direction })) });
  await addMessage(db, courseId, decision.assistantMessage || "我生成了 3 个故事方向，你可以选一个继续。");
  return getStoryOutlineState(db, courseId);
}
```

- [ ] **Step 7: Run repository test and verify green**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts
```

Expected: PASS.

## Task 3: Loading Timer and Source Visibility

**Files:**
- Modify: `features/courses/components/course-story-outline-workspace.tsx`
- Modify: `features/courses/components/course-story-outline-workspace.test.tsx`

- [ ] **Step 1: Write failing loading timer test**

In `features/courses/components/course-story-outline-workspace.test.tsx`, import fake timer helpers:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
```

Add:

```ts
beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
```

Add test:

```ts
test("shows elapsed seconds and long-wait hint while generating", async () => {
  vi.useFakeTimers();
  let resolveResponse!: (value: Response) => void;
  const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
  vi.stubGlobal("fetch", vi.fn(() => responsePromise));
  render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

  fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), {
    target: { value: "写一个冒险故事" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));

  await act(async () => {
    vi.advanceTimersByTime(16_000);
  });

  expect(screen.getAllByText(/16s/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/仍在生成/).length).toBeGreaterThan(0);

  await act(async () => {
    resolveResponse(Response.json(emptyState));
    await responsePromise;
  });
});
```

- [ ] **Step 2: Add timer state**

In `CourseStoryOutlineWorkspace`, import `useEffect`:

```ts
import React, { FormEvent, useEffect, useRef, useState } from "react";
```

Add state:

```ts
const [pendingSeconds, setPendingSeconds] = useState(0);
```

Add effect:

```ts
useEffect(() => {
  if (!pending) {
    setPendingSeconds(0);
    return;
  }
  const started = Date.now();
  const timer = window.setInterval(() => {
    setPendingSeconds(Math.floor((Date.now() - started) / 1000));
  }, 1000);
  return () => window.clearInterval(timer);
}, [pending]);
```

- [ ] **Step 3: Create loading label helper**

Add:

```ts
function loadingText(label: string, seconds: number) {
  if (!label) return "";
  const suffix = seconds > 0 ? ` · ${seconds}s` : "";
  const hint = seconds >= 15 ? "，仍在生成，请不要关闭页面" : "";
  return `${label}${suffix}${hint}`;
}
```

Render `loadingText(pendingLabel, pendingSeconds)` in chat and right panel.

- [ ] **Step 4: Write failing reference source test**

Add:

```ts
test("shows whether reference material came from search or teacher input", () => {
  render(<CourseStoryOutlineWorkspace initialState={{
    ...emptyState,
    referenceMaterials: [
      {
        id: "ref-1",
        courseId: "course-1",
        name: "马斯克",
        type: "public_figure",
        sourceStatus: "teacher_supplied",
        summary: "老师补充资料。",
        usableFacts: ["工程项目"],
        avoidTopics: ["争议"],
        adaptationBoundary: "课堂化改编。",
        researchProvider: "none",
        confirmedAt: "2026-08-06T08:00:00.000Z",
        createdAt: "2026-08-06T08:00:00.000Z",
        updatedAt: "2026-08-06T08:00:00.000Z",
      },
    ],
  }} />);

  expect(screen.getByText("资料来源：老师补充")).toBeInTheDocument();
});
```

- [ ] **Step 5: Add reference source display**

In `ReferenceEditor`, render after title:

```tsx
<p className="text-xs text-muted-foreground">资料来源：{referenceSourceLabel(reference)}</p>
```

Add:

```ts
function referenceSourceLabel(reference: CourseSourceReference) {
  if (reference.sourceStatus === "teacher_supplied" || reference.researchProvider === "none") return "老师补充";
  if (reference.researchProvider === "quickrouter_gpt") return "联网整理";
  return "信息不足";
}
```

- [ ] **Step 6: Run frontend tests**

Run:

```bash
pnpm test -- features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: PASS.

## Task 4: Right Panel Tabs and Role Separation

**Files:**
- Modify: `features/courses/components/course-story-outline-workspace.tsx`
- Modify: `features/courses/components/course-story-outline-workspace.test.tsx`

- [ ] **Step 1: Write failing tabs test**

Add:

```ts
test("separates outline, roles, and references into tabs", () => {
  render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

  expect(screen.getByRole("button", { name: "故事大纲" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "角色" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "参考资料" })).toBeInTheDocument();
  expect(screen.getByText("本章发生了什么")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "角色" }));
  expect(screen.getByText("课堂角色")).toBeInTheDocument();
  expect(screen.queryByText("本章发生了什么")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add active right tab state**

In `CourseStoryOutlineWorkspace`, add:

```ts
const [resultTab, setResultTab] = useState<"outline" | "characters" | "references">("outline");
```

Pass `resultTab`, `setResultTab`, and `state.coursePeople` to `ResultPanel`.

- [ ] **Step 3: Render tabs when outline exists**

In `ResultPanel`, if `outline`, render:

```tsx
<div className="flex gap-2 border-b border-border pb-3">
  <button className={tabClass(activeTab === "outline")} onClick={() => setActiveTab("outline")} type="button">故事大纲</button>
  <button className={tabClass(activeTab === "characters")} onClick={() => setActiveTab("characters")} type="button">角色</button>
  <button className={tabClass(activeTab === "references")} onClick={() => setActiveTab("references")} type="button">参考资料</button>
</div>
```

Then conditionally render:

- `OutlineEditor` for outline.
- `CharactersSection` for roles.
- `ReferenceEditor` list for references.

- [ ] **Step 4: Write failing classroom role test**

Add:

```ts
test("classroom roles use course people snapshots without AI descriptions", () => {
  render(<CourseStoryOutlineWorkspace initialState={{
    ...outlineState,
    coursePeople: [
      {
        personId: "student-1",
        role: "student",
        chineseName: "夏天",
        englishName: "Summer",
        age: 10,
        gender: "female",
        visualAssetId: null,
        visualUrl: null,
        profileChanged: false,
      },
    ],
  }} />);

  fireEvent.click(screen.getByRole("button", { name: "角色" }));

  expect(screen.getByText("夏天 · Summer")).toBeInTheDocument();
  expect(screen.getByText("10 岁 · 学生")).toBeInTheDocument();
  expect(screen.queryByText("喜欢观察线索。")).not.toBeInTheDocument();
});
```

- [ ] **Step 5: Split character rendering**

In `CharactersSection`, accept:

```ts
function CharactersSection({ outline, coursePeople }: { outline: CourseStoryOutline; coursePeople: CourseAudiencePerson[] })
```

Render classroom people first:

```tsx
<CardGroup title="课堂角色">
  {coursePeople.map((person) => (
    <article className="rounded-lg border border-border p-3" key={person.personId}>
      <h5>{person.chineseName} · {person.englishName}</h5>
      <p>{person.age} 岁 · {person.role === "teacher" ? "老师" : "学生"}</p>
    </article>
  ))}
</CardGroup>
```

Render referenced/original characters separately:

```ts
const referenced = outline.characters.filter((character) => character.sourceType === "referenced");
const original = outline.characters.filter((character) => character.sourceType === "original");
```

Do not render `sourceType === "person"` AI descriptions.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
pnpm test -- features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: PASS.

## Task 5: Editable Concise Outline

**Files:**
- Modify: `features/courses/components/course-story-outline-workspace.tsx`
- Modify: `features/courses/components/course-story-outline-workspace.test.tsx`
- Modify: `lib/server/validation/story-outline.ts`
- Modify: `lib/server/repositories/story-outline.ts`
- Modify: `lib/server/repositories/story-outline.test.ts`

- [ ] **Step 1: Write failing save-outline frontend test**

Add:

```ts
test("edits and saves concise outline fields", async () => {
  const fetchMock = vi.fn(async () => Response.json(outlineState));
  vi.stubGlobal("fetch", fetchMock);
  render(<CourseStoryOutlineWorkspace initialState={outlineState} />);

  fireEvent.change(screen.getByLabelText("中文主线概括"), {
    target: { value: "更新后的主线。" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存故事大纲" }));

  await waitFor(() => {
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/courses/course-1/story-outline");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.outline.summary).toContain("更新后的主线。");
  });
});
```

- [ ] **Step 2: Add `saveOutline` client function**

In `CourseStoryOutlineWorkspace`, add:

```ts
async function saveOutline(outline: CourseStoryOutline) {
  setPending(true);
  setPendingLabel("正在保存故事大纲...");
  setError("");
  try {
    const response = await fetch(`/api/courses/${state.course.id}/story-outline`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline }),
    });
    const data = (await response.json()) as CourseStoryOutlineState & { message?: string; requiresReset?: boolean };
    if (!response.ok) throw new Error(data.message || "故事大纲保存失败");
    setState(data);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "故事大纲保存失败");
  } finally {
    setPending(false);
    setPendingLabel("");
  }
}
```

- [ ] **Step 3: Add `OutlineEditor`**

Create component in the same file. Use the existing input, textarea, and button styling already used by `ReferenceEditor`; the required behavior is:

```tsx
function OutlineEditor({ outline, onSave }: { outline: CourseStoryOutline; onSave: (outline: CourseStoryOutline) => void }) {
  const title = splitBilingual(outline.title);
  const summary = splitBilingual(outline.summary);
  const [titleZh, setTitleZh] = useState(title.zh);
  const [titleEn, setTitleEn] = useState(title.en);
  const [summaryZh, setSummaryZh] = useState(summary.zh);
  const [summaryEn, setSummaryEn] = useState(summary.en);
  const [chapters, setChapters] = useState(outline.chapters.map((chapter) => ({
    ...chapter,
    whatHappens: chapter.whatHappens || chapter.storyGoal,
    characterActions: chapter.characterActions || chapter.keyEvents[0] || "",
    mainlineProgress: chapter.mainlineProgress || chapter.keyEvents[1] || "",
  })));
  const updateChapter = (id: string, patch: Partial<CourseStoryOutlineChapter>) => {
    setChapters((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">中文标题</span>
        <input aria-label="中文标题" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={titleZh} onChange={(event) => setTitleZh(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">英文标题</span>
        <input aria-label="英文标题" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">中文主线概括</span>
        <textarea aria-label="中文主线概括" className="min-h-24 w-full rounded-lg border border-border px-3 py-2 text-sm" value={summaryZh} onChange={(event) => setSummaryZh(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">英文主线概括</span>
        <textarea aria-label="英文主线概括" className="min-h-24 w-full rounded-lg border border-border px-3 py-2 text-sm" value={summaryEn} onChange={(event) => setSummaryEn(event.target.value)} />
      </label>
      {chapters.map((chapter) => (
        <article className="space-y-3 rounded-lg border border-border p-4" key={chapter.id}>
          <h4 className="text-sm font-semibold">{splitBilingual(chapter.title).zh}</h4>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">本章发生了什么</span>
            <textarea aria-label={`第 ${chapter.order} 章发生了什么`} className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm" value={chapter.whatHappens || ""} onChange={(event) => updateChapter(chapter.id, { whatHappens: event.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">主要人物做了什么</span>
            <textarea aria-label={`第 ${chapter.order} 章人物行动`} className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm" value={chapter.characterActions || ""} onChange={(event) => updateChapter(chapter.id, { characterActions: event.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">如何推动主线</span>
            <textarea aria-label={`第 ${chapter.order} 章推动主线`} className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm" value={chapter.mainlineProgress || ""} onChange={(event) => updateChapter(chapter.id, { mainlineProgress: event.target.value })} />
          </label>
        </article>
      ))}
      <Button onClick={() => onSave({
        ...outline,
        title: joinBilingual(titleZh, titleEn),
        summary: joinBilingual(summaryZh, summaryEn),
        chapters: chapters.map((chapter) => ({
          ...chapter,
          storyGoal: chapter.whatHappens || "",
          keyEvents: [chapter.characterActions || "", chapter.mainlineProgress || ""].filter(Boolean),
          setting: "",
          endingHook: "",
        })),
      })} type="button">保存故事大纲</Button>
    </div>
  );
}
```

Use existing styling conventions from `ReferenceEditor`.

- [ ] **Step 4: Add helper `joinBilingual`**

Add:

```ts
function joinBilingual(zh: string, en: string) {
  return [zh.trim(), en.trim()].filter(Boolean).join(" / ");
}
```

- [ ] **Step 5: Write repository test for concise save**

In `lib/server/repositories/story-outline.test.ts`, add:

```ts
test("saves concise chapter fields through existing chapter columns", async () => {
  const db = createDb();
  await handleStoryOutlineMessage(db, "course-1", { message: "学生们进入海底图书馆", mode: "idea" }, deps);
  const state = await getStoryOutlineState(db, "course-1");
  const outline = state.outline!;

  await saveStoryOutline(db, "course-1", {
    ...outline,
    chapters: outline.chapters.map((chapter) => ({
      ...chapter,
      whatHappens: "学生收到冒险任务。",
      characterActions: "夏天决定带队出发。",
      mainlineProgress: "队伍离开教室进入第一段旅程。",
    })),
  }, false);

  expect(db.state.chapters[0]).toMatchObject({
    storyGoal: "学生收到冒险任务。",
    keyEvents: ["夏天决定带队出发。", "队伍离开教室进入第一段旅程。"],
    setting: "",
    endingHook: "",
  });
});
```

- [ ] **Step 6: Update `saveStoryOutline` chapter mapping**

In `saveStoryOutline`, change chapter mapping:

```ts
chapters: outline.chapters.map((chapter) => ({
  order: chapter.order,
  title: chapter.title,
  storyGoal: chapter.whatHappens || chapter.storyGoal,
  keyEvents: [
    chapter.characterActions,
    chapter.mainlineProgress,
    ...(chapter.keyEvents ?? []),
  ].filter((item): item is string => Boolean(item)),
  characterIds: chapter.characterIds,
  setting: chapter.setting || "",
  endingHook: chapter.endingHook || "",
})),
```

- [ ] **Step 7: Run frontend and repository tests**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: PASS.

## Task 6: Documentation and Verification

**Files:**
- Modify: `docs/frontend/course-create-lesson-chat.md`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts lib/server/ai/story-outline-provider.test.ts features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run Prisma validate**

Run:

```bash
pnpm exec prisma validate
```

Expected: PASS. This round should not require a migration.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Run Chinese encoding scan**

Run:

```bash
rg -n "�|涓|绗|鐢|銆" docs/frontend/course-create-lesson-chat.md features/courses/components/course-story-outline-workspace.tsx lib/server/ai/story-outline-deps.ts lib/server/repositories/story-outline.ts
```

Expected: no matches.

- [ ] **Step 6: Update module doc status**

In `docs/frontend/course-create-lesson-chat.md`, replace:

```md
- 状态：第一轮优化已实现；第二轮反馈已确认，待实现。
```

with:

```md
- 状态：第二轮优化已实现，待用户验收。
```

Replace:

```md
- 提交号：第一轮实现 `6a3e2c7`；第二轮待实现。
```

with:

```md
- 提交号：第一轮实现 `6a3e2c7`；第二轮实现同本提交。
```

- [ ] **Step 7: Commit implementation**

Stage only touched second-round files:

```bash
git add lib/contracts/api.ts lib/server/validation/story-outline.ts lib/server/ai/story-outline-deps.ts lib/server/repositories/story-outline.ts lib/server/repositories/story-outline.test.ts features/courses/components/course-story-outline-workspace.tsx features/courses/components/course-story-outline-workspace.test.tsx docs/frontend/course-create-lesson-chat.md docs/superpowers/plans/2026-08-06-step2-outline-feedback-round2.md
git commit -m "fix: refine step2 outline review flow"
```

Expected: commit succeeds.
