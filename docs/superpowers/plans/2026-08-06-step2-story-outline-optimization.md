# Step2 Story Outline Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Step 2 story outline creation so fixed UI flows stay deterministic, free teacher input is routed by AI decision, reference material can be teacher-supplied or searched, generated stories are age-appropriate and better structured, and the right panel renders usable modules.

**Architecture:** Keep the current Next.js monolith and synchronous request model. Extend the existing story-outline contracts, repository, validation, AI deps, routes, and workspace component instead of introducing workers or a new state machine. Add a reset endpoint and make each fixed action explicit while free-text messages call an AI decision step before search or outline generation.

**Tech Stack:** Next.js App Router, React client components, TypeScript contracts, Zod validation, Prisma repository delegates, QuickRouter Responses, Vitest, Testing Library.

---

## File Structure

- Modify `lib/contracts/api.ts`: add new story outline actions and structured fields for decision/output rendering.
- Modify `lib/server/validation/story-outline.ts`: accept the new actions and new reference status rules.
- Modify `lib/server/ai/story-outline-deps.ts`: add `decideFreeInput`, pass writing provider, course people, current outline, and stricter prompt rules.
- Modify `lib/server/repositories/story-outline.ts`: implement fixed action branches, AI decision branch, teacher-supplied references, choose direction, reset helpers, reference save flow, and people snapshots in state.
- Modify `app/api/courses/[id]/story-outline/message/route.ts`: keep parsing and error boundary compatible with the new contract.
- Create `app/api/courses/[id]/story-outline/reset/route.ts`: reset Step 2 state.
- Modify `features/courses/components/course-story-outline-workspace.tsx`: add loading state labels, restart button, generated-message actions, continue-modify prefill/focus, direction selection, reference save, and modular right panel.
- Modify `features/courses/components/course-story-outline-workspace.test.tsx`: cover the new front-end behavior.
- Modify `lib/server/repositories/story-outline.test.ts`: cover fixed routes and AI-decision routes.
- Modify `lib/server/ai/story-outline-provider.test.ts` or add `lib/server/ai/story-outline-deps.test.ts`: cover provider selection and prompt payload behavior.
- Modify `docs/frontend/course-create-lesson-chat.md`: update implementation status, validation commands, and final commit after implementation.

## Task 1: Contract and Validation Updates

**Files:**
- Modify: `lib/contracts/api.ts`
- Modify: `lib/server/validation/story-outline.ts`

- [ ] **Step 1: Add contract fields**

In `lib/contracts/api.ts`, update `CourseStoryChatAction["action"]` to include:

```ts
    | "supply_reference_material"
    | "choose_reference_search"
```

Keep existing action values during migration:

```ts
    | "choose_direction"
    | "confirm_reference_object"
    | "request_reference_search"
    | "generate_from_reference"
    | "regenerate_outline"
```

Add optional structured fields to `CourseStoryOutline` without requiring a database migration:

```ts
  narrativeType?: string;
  storyHook?: string;
```

Add optional bilingual display fields to `CourseStoryOutlineChapter`:

```ts
  titleZh?: string;
  titleEn?: string;
```

Add `coursePeople` to `CourseStoryOutlineState`:

```ts
  coursePeople: CourseAudiencePerson[];
```

- [ ] **Step 2: Update validation schema**

In `lib/server/validation/story-outline.ts`, extend `storyOutlineMessageSchema.action`:

```ts
      z.literal("supply_reference_material"),
      z.literal("choose_reference_search"),
```

Keep `request_reference_search` accepted for compatibility, but implementation should treat it as the searched-material path.

Change `sourceReferenceSchema.sourceStatus` to keep the existing enum values only:

```ts
  sourceStatus: z.union([
    z.literal("confirmed"),
    z.literal("insufficient"),
    z.literal("teacher_supplied"),
  ]),
```

Do not add `"searched"` because Prisma currently only supports the existing enum and the MVP should avoid a migration for display naming.

- [ ] **Step 3: Run type-adjacent tests**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: current failures are acceptable only where tests still expect old actions or old state shape; no TypeScript syntax errors from the contract/schema edits.

## Task 2: AI Decision and Prompt Improvements

**Files:**
- Modify: `lib/server/ai/story-outline-deps.ts`
- Test: `lib/server/ai/story-outline-provider.test.ts`
- Test: `lib/server/repositories/story-outline.test.ts`

- [ ] **Step 1: Add free-input decision type**

In `lib/server/ai/story-outline-deps.ts`, define:

```ts
type FreeInputDecision = {
  decision: "ask_clarification" | "request_reference_material" | "generate_outline";
  assistantMessage: string;
  referenceName?: string;
  referenceType?: "real_person" | "historical_person" | "public_figure" | "ip" | "game_character" | "fictional_character" | "other";
  teacherReference?: {
    name: string;
    type: "real_person" | "historical_person" | "public_figure" | "ip" | "game_character" | "fictional_character" | "other";
    summary: string;
    usableFacts: string[];
    avoidTopics: string[];
    adaptationBoundary: string;
  };
};
```

- [ ] **Step 2: Add `decideFreeInput` to generation deps**

Extend `createStoryOutlineGenerationDeps()` with:

```ts
decideFreeInput: async (input: {
  course: { title: string; durationMinutes: number };
  coursePeople: Array<{ role: string; chineseName: string; englishName: string; age: number; gender: string }>;
  message: string;
  references: unknown[];
  outline: unknown;
}) => {
  const { text } = await client().generateOutline({
    writingProvider: "quickrouter_gpt",
    prompt: [
      "你是 Step2 故事大纲流程判断助手。",
      "只返回 JSON 对象，字段：decision, assistantMessage, referenceName, referenceType, teacherReference。",
      "decision 只能是 ask_clarification, request_reference_material, generate_outline。",
      "只有老师自由输入需要判断；固定按钮流程不经过你。",
      "如果信息足够生成或修改大纲，返回 generate_outline。",
      "如果对象不明确或资料不足，返回 ask_clarification 或 request_reference_material。",
      "如果老师以“我补充资料：”开头且资料足够，返回 generate_outline，并在 teacherReference 中整理老师补充资料。",
      "不要决定联网搜索，只说明是否需要参考资料。",
      `课程：${input.course.title}，时长：${input.course.durationMinutes} 分钟。`,
      `授课人物：${JSON.stringify(input.coursePeople)}`,
      `老师输入：${input.message}`,
      `已保存参考资料：${JSON.stringify(input.references)}`,
      `当前大纲：${JSON.stringify(input.outline)}`,
    ].join("\n"),
  });
  return parseJson<FreeInputDecision>(text, "故事需求判断失败，请重试");
}
```

- [ ] **Step 3: Use writing provider in `generateOutline`**

Change `generateOutline` input to accept:

```ts
writingProvider: StoryWritingProvider;
coursePeople: Array<{ role: string; chineseName: string; englishName: string; age: number; gender: string }>;
currentOutline?: unknown;
```

Then pass it to provider:

```ts
const { text } = await client().generateOutline({
  writingProvider: input.writingProvider,
  prompt: [
    "你是英语 PBL 绘本课程故事大纲助手。",
    "请只返回 JSON 对象，字段：title, summary, narrativeType, storyHook, characters, chapters。",
    "title 和 summary 必须中英双语，例如 {\"zh\":\"中文\",\"en\":\"English\"}。",
    "chapters 每项字段：order, title, storyGoal, keyEvents, characterIds, setting, endingHook。",
    "chapter.title 必须中英双语，例如 {\"zh\":\"中文章节名\",\"en\":\"English Chapter Title\"}。",
    "本阶段只生成故事大纲，不生成语法指导、知识点、题型、练习、答案或图片 prompt。",
    "先根据授课人物年龄、老师要求和引用对象判断叙事类型，再决定主角来源。",
    "学生不一定是主角；人物传记可让被讲述对象成为主角。",
    "如果学生进入故事，必须有自然身份和剧情功能。",
    "每个角色必须服务核心冲突；不要为热闹添加无关角色。",
    "新增原创角色默认 1-2 个，除非老师明确要求群像故事。",
    "每份大纲必须有谜题、任务、误会、倒计时、丢失物、选择困境或调查线索等清晰钩子。",
    "每章必须推进具体事件，章节之间要有因果关系。",
    `课程：${input.course.title}，时长：${input.course.durationMinutes} 分钟。`,
    `授课人物：${JSON.stringify(input.coursePeople)}`,
    `指定章节数：${input.chapterCount}`,
    `老师要求：${input.message || "基于当前已确认资料生成"}`,
    `已确认参考资料：${JSON.stringify(input.references)}`,
    `当前大纲：${JSON.stringify(input.currentOutline ?? null)}`,
  ].join("\n"),
});
```

- [ ] **Step 4: Parse bilingual chapter titles**

In `story-outline-deps.ts`, update parsed chapter title type:

```ts
title: string | { zh: string; en: string };
```

Return:

```ts
chapters: parsed.chapters.map((chapter) => ({
  ...chapter,
  title: bilingualText(chapter.title),
})),
narrativeType: parsed.narrativeType,
storyHook: parsed.storyHook,
```

- [ ] **Step 5: Update repository test deps**

In `lib/server/repositories/story-outline.test.ts`, extend the local `deps` object with `decideFreeInput` and update `generateOutline` mock expectations to include `writingProvider` and `coursePeople`.

- [ ] **Step 6: Verify provider tests**

Run:

```bash
pnpm test -- lib/server/ai/story-outline-provider.test.ts
```

Expected: PASS. This confirms model selection still works after the deps-level changes.

## Task 3: Repository Fixed Flows, AI Decision Flow, and Reset

**Files:**
- Modify: `lib/server/repositories/story-outline.ts`
- Modify: `lib/server/repositories/story-outline.test.ts`
- Create: `app/api/courses/[id]/story-outline/reset/route.ts`
- Modify: `app/api/courses/[id]/story-outline/message/route.ts`

- [ ] **Step 1: Extend repository DB types for course people**

In `lib/server/repositories/story-outline.ts`, add:

```ts
type DbCoursePerson = {
  personId: string;
  role: "teacher" | "student";
  chineseNameSnapshot: string;
  englishNameSnapshot: string;
  ageSnapshot: number;
  genderSnapshot: "male" | "female";
  visualAssetIdSnapshot?: string | null;
};
```

Change `DbCourse`:

```ts
people?: DbCoursePerson[];
```

Change `getCourse` to include people:

```ts
const course = await db.course.findUnique({ where: { id: courseId }, include: { people: true } });
```

Update test DB `course.findUnique` to ignore the include and return `people`.

- [ ] **Step 2: Map course people into state**

Add helper:

```ts
function toCoursePeople(course: DbCourse) {
  return (course.people ?? []).map((person) => ({
    personId: person.personId,
    role: person.role,
    chineseName: person.chineseNameSnapshot,
    englishName: person.englishNameSnapshot,
    age: person.ageSnapshot,
    gender: person.genderSnapshot,
    visualAssetId: person.visualAssetIdSnapshot ?? null,
    visualUrl: null,
    profileChanged: false,
  }));
}
```

Add `coursePeople: toCoursePeople(course)` in `stateFromCourse`.

- [ ] **Step 3: Pass richer generation context**

In `generateAndSaveOutline`, load references, current outline state, and course people:

```ts
const references = (await db.courseSourceReference.findMany({ where: { courseId: course.id } })).map(toReference);
const characters = (await db.courseCharacter.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } })).map(toCharacter);
const existingOutline = await db.courseStoryOutline.findUnique({ where: { courseId: course.id }, include: { chapters: true } });
const currentOutline = toOutline(existingOutline, references, characters);
const outline = await deps.generateOutline({
  course,
  message,
  references,
  chapterCount: resolved.chapterCount,
  writingProvider: resolved.writingProvider,
  coursePeople: toCoursePeople(course),
  currentOutline,
});
```

- [ ] **Step 4: Add generated message actions**

When outline generation succeeds, change:

```ts
await addMessage(db, course.id, "assistant", "故事大纲已生成。");
```

to:

```ts
await addMessage(db, course.id, "assistant", "故事大纲已生成。", [
  { id: "regenerate-outline", label: "重新生成", action: "regenerate_outline" },
  { id: "continue-modify", label: "继续修改", action: "confirm_reference_object" },
]);
```

Use `confirm_reference_object` only as a compatibility placeholder if the contract is not expanded with a local-only action. The frontend should treat label `"继续修改"` as local-only and not call the API.

- [ ] **Step 5: Implement `choose_direction`**

Before random mode handling, add:

```ts
if (input.action === "choose_direction") {
  const direction = (await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }))
    .map(toDirection)
    .find((item) => item.id === input.targetId);
  if (!direction) throw new CourseStoryOutlineValidationError("请选择一个故事方向");
  await db.courseStoryDirection.update({ where: { id: direction.id }, data: { selectedAt: new Date() } });
  await generateAndSaveOutline(db, course, direction.seedPrompt || `${direction.title}\n${direction.hook}`, deps, setting);
  return getStoryOutlineState(db, courseId);
}
```

- [ ] **Step 6: Implement reference material action split**

Replace `request_reference_search` branch with support for both action names:

```ts
if (input.action === "request_reference_search" || input.action === "choose_reference_search") {
  await addMessage(db, courseId, "assistant", "正在联网整理参考资料...");
  const reference = await deps.searchReference({ course, objectName: input.targetId || input.message });
  await db.courseSourceReference.create({
    data: {
      courseId,
      ...reference,
      usableFacts: reference.usableFacts,
      avoidTopics: reference.avoidTopics,
      researchProvider: "quickrouter_gpt",
      confirmedAt: new Date(),
    },
  });
  await addMessage(db, courseId, "assistant", "资料已整理。你可以在右侧调整，确认后我再生成大纲。", [
    { id: "generate-from-reference", label: "用这些资料生成大纲", action: "generate_from_reference" },
  ]);
  return getStoryOutlineState(db, courseId);
}
```

- [ ] **Step 7: Replace hard-coded reference detection with AI decision**

Remove the import and use of `detectReferenceNeed`. After random and fixed actions, add:

```ts
const references = (await db.courseSourceReference.findMany({ where: { courseId } })).map(toReference);
const existingOutline = await db.courseStoryOutline.findUnique({ where: { courseId }, include: { chapters: true } });
const characters = (await db.courseCharacter.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } })).map(toCharacter);
const decision = await deps.decideFreeInput({
  course,
  coursePeople: toCoursePeople(course),
  message: input.message,
  references,
  outline: toOutline(existingOutline, references, characters),
});

if (decision.decision === "ask_clarification") {
  await addMessage(db, courseId, "assistant", decision.assistantMessage || "请补充一下具体要求。");
  return getStoryOutlineState(db, courseId);
}

if (decision.decision === "request_reference_material") {
  await addMessage(db, courseId, "assistant", decision.assistantMessage || "这个想法需要更多参考资料。", [
    { id: "supply-reference-material", label: "我来补充资料", action: "supply_reference_material", targetId: decision.referenceName },
    { id: "choose-reference-search", label: "联网整理资料", action: "choose_reference_search", targetId: decision.referenceName },
  ]);
  return getStoryOutlineState(db, courseId);
}

if (decision.teacherReference) {
  await db.courseSourceReference.create({
    data: {
      courseId,
      ...decision.teacherReference,
      sourceStatus: "teacher_supplied",
      usableFacts: decision.teacherReference.usableFacts,
      avoidTopics: decision.teacherReference.avoidTopics,
      researchProvider: "none",
      confirmedAt: new Date(),
    },
  });
}

await generateAndSaveOutline(db, course, input.message, deps, setting);
return getStoryOutlineState(db, courseId);
```

- [ ] **Step 8: Implement reset helper**

Add to `StoryOutlineDb` delegate requirements:

```ts
courseStoryChatMessage: Required<Pick<Delegate<DbMessage>, "findMany" | "create" | "deleteMany">>;
courseStoryOutline: Required<Pick<Delegate<DbOutline>, "findUnique" | "upsert" | "deleteMany">>;
courseStorySetting: Required<Pick<Delegate<DbSetting>, "findUnique" | "upsert" | "deleteMany">>;
```

Add:

```ts
export async function resetStoryOutline(db: StoryOutlineDb, courseId: string) {
  await getCourse(db, courseId);
  const reset = async (tx: StoryOutlineDb) => {
    await tx.courseStoryChatMessage.deleteMany({ where: { courseId } });
    await tx.courseStoryDirection.deleteMany({ where: { courseId } });
    await tx.courseSourceReference.deleteMany({ where: { courseId } });
    await tx.courseCharacter.deleteMany({ where: { courseId } });
    await tx.courseStoryOutline.deleteMany({ where: { courseId } });
    await tx.courseStorySetting.deleteMany({ where: { courseId } });
    return getStoryOutlineState(tx, courseId);
  };
  return db.$transaction ? db.$transaction(reset) : reset(db);
}
```

- [ ] **Step 9: Add reset route**

Create `app/api/courses/[id]/story-outline/reset/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  resetStoryOutline,
} from "@/lib/server/repositories/story-outline";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await resetStoryOutline(getDb(), id));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "故事大纲重置失败" }, { status: 500 });
  }
}
```

- [ ] **Step 10: Add repository tests**

In `lib/server/repositories/story-outline.test.ts`, add tests:

```ts
test("asks AI to decide free input instead of local keyword detection", async () => {
  const db = createDb();
  const decideFreeInput = vi.fn(async () => ({
    decision: "request_reference_material" as const,
    assistantMessage: "这个对象需要更多资料。",
    referenceName: "Jett",
  }));

  const state = await handleStoryOutlineMessage(db, "course-1", {
    message: "参考 Jett 做一个故事",
    mode: "idea",
  }, { ...deps, decideFreeInput });

  expect(decideFreeInput).toHaveBeenCalled();
  expect(state.outline).toBeNull();
  expect(state.chatMessages.at(-1)?.actions.map((action) => action.action)).toEqual([
    "supply_reference_material",
    "choose_reference_search",
  ]);
});
```

```ts
test("saves teacher supplied reference and directly generates outline when AI says it is enough", async () => {
  const db = createDb();
  const decideFreeInput = vi.fn(async () => ({
    decision: "generate_outline" as const,
    assistantMessage: "资料足够，可以生成。",
    teacherReference: {
      name: "马斯克",
      type: "public_figure" as const,
      summary: "老师补充的人物资料。",
      usableFacts: ["创业经历"],
      avoidTopics: ["现实争议"],
      adaptationBoundary: "只做课堂化改编。",
    },
  }));

  const state = await handleStoryOutlineMessage(db, "course-1", {
    message: "我补充资料：马斯克做过很多工程项目",
    mode: "idea",
  }, { ...deps, decideFreeInput });

  expect(state.referenceMaterials[0]).toMatchObject({ name: "马斯克", sourceStatus: "teacher_supplied", researchProvider: "none" });
  expect(state.outline).not.toBeNull();
});
```

```ts
test("chooses a random direction and generates outline from its seed prompt", async () => {
  const db = createDb();
  await handleStoryOutlineMessage(db, "course-1", { message: "主题：海底", mode: "random" }, deps);
  const directionId = String(db.state.directions[0]?.id);
  const generateOutline = vi.fn(deps.generateOutline);

  await handleStoryOutlineMessage(db, "course-1", {
    message: "",
    mode: "idea",
    action: "choose_direction",
    targetId: directionId,
  }, { ...deps, generateOutline });

  expect(generateOutline).toHaveBeenCalledWith(expect.objectContaining({ message: "ocean" }));
});
```

```ts
test("resets story outline state without changing course audience", async () => {
  const db = createDb();
  await handleStoryOutlineMessage(db, "course-1", { message: "学生们进入海底图书馆", mode: "idea" }, deps);

  const state = await resetStoryOutline(db, "course-1");

  expect(state.chatMessages).toEqual([]);
  expect(state.directions).toEqual([]);
  expect(state.referenceMaterials).toEqual([]);
  expect(state.outline).toBeNull();
  expect(state.coursePeople.length).toBeGreaterThan(0);
});
```

- [ ] **Step 11: Run repository tests**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts
```

Expected: PASS.

## Task 4: Frontend Interaction and Right Panel

**Files:**
- Modify: `features/courses/components/course-story-outline-workspace.tsx`
- Modify: `features/courses/components/course-story-outline-workspace.test.tsx`

- [ ] **Step 1: Add input ref and pending label**

In `CourseStoryOutlineWorkspace`, import `useRef` and create:

```ts
const inputRef = useRef<HTMLTextAreaElement | null>(null);
const [pendingLabel, setPendingLabel] = useState("");
```

Update `postMessage` signature:

```ts
async function postMessage(input: CourseStoryMessageInput, label = "正在处理...") {
  setPending(true);
  setPendingLabel(label);
  ...
  finally {
    setPending(false);
    setPendingLabel("");
  }
}
```

Pass labels:

- submit idea: `"正在分析故事要求..."`
- random: `"正在生成故事方向..."`
- choose direction: `"正在生成故事大纲..."`
- search: `"正在整理参考资料..."`
- generate from reference: `"正在生成故事大纲..."`
- regenerate: `"正在重新生成故事大纲..."`

- [ ] **Step 2: Add local action handling**

Create:

```ts
function continueModify(prefix: "帮我修改：" | "我补充资料：") {
  setMessage(prefix);
  requestAnimationFrame(() => inputRef.current?.focus());
}

async function handleAction(action: CourseStoryChatAction) {
  if (action.label === "继续修改" || action.action === "confirm_reference_object") {
    continueModify("帮我修改：");
    return;
  }
  if (action.action === "supply_reference_material") {
    continueModify("我补充资料：");
    return;
  }
  const label = action.action === "choose_reference_search" || action.action === "request_reference_search"
    ? "正在整理参考资料..."
    : "正在生成故事大纲...";
  await postMessage({ message: message.trim(), mode: "idea", action: action.action, targetId: action.targetId }, label);
}
```

Use `handleAction(action)` for chat action buttons.

- [ ] **Step 3: Add restart button**

Create:

```ts
async function resetStep() {
  if (!window.confirm("重新开始会清空 Step 2 当前聊天历史、参考资料和故事大纲，是否继续？")) return;
  setPending(true);
  setPendingLabel("正在重新开始...");
  setError("");
  try {
    const response = await fetch(`/api/courses/${state.course.id}/story-outline/reset`, { method: "POST" });
    const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
    if (!response.ok) throw new Error(data.message || "故事大纲重置失败");
    setState(data);
    setMessage("");
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "故事大纲重置失败");
  } finally {
    setPending(false);
    setPendingLabel("");
  }
}
```

Render page-level secondary button:

```tsx
<Button disabled={pending} onClick={resetStep} type="button" variant="outline">重新开始</Button>
```

- [ ] **Step 4: Add visible loading surfaces**

In chat list, after messages:

```tsx
{pending && pendingLabel ? (
  <article className="mr-10 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
    <p className="flex items-center gap-2 leading-6">
      <Loader2 className="size-4 animate-spin" />
      {pendingLabel}
    </p>
  </article>
) : null}
```

Pass `pendingLabel` into `ResultPanel` and show an overlay or empty-state loading when no result exists:

```tsx
<ResultPanel outline={state.outline} references={state.referenceMaterials} state={state} pendingLabel={pendingLabel} onChooseDirection={...} onSaveReference={...} />
```

- [ ] **Step 5: Make direction cards selectable**

Add prop:

```ts
onChooseDirection: (directionId: string) => void;
```

In direction card:

```tsx
<Button onClick={() => onChooseDirection(direction.id)} type="button" size="sm">选择这个方向</Button>
```

Call:

```ts
onChooseDirection={(directionId) => postMessage({ message: "", mode: "idea", action: "choose_direction", targetId: directionId }, "正在生成故事大纲...")}
```

- [ ] **Step 6: Add reference save**

Inside workspace, add:

```ts
async function saveReference(referenceId: string, payload: Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">) {
  setPending(true);
  setPendingLabel("正在保存参考资料...");
  setError("");
  try {
    const response = await fetch(`/api/courses/${state.course.id}/story-outline/reference-materials/${referenceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as CourseStoryOutlineState & { message?: string };
    if (!response.ok) throw new Error(data.message || "参考资料保存失败");
    setState(data);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "参考资料保存失败");
  } finally {
    setPending(false);
    setPendingLabel("");
  }
}
```

Implement a small `ReferenceEditor` component with local state for name, summary, adaptation boundary, usable facts textarea, avoid topics textarea, and save button. Split facts by non-empty lines.

- [ ] **Step 7: Modularize right panel**

Replace current outline render with:

```tsx
<section className="space-y-4 rounded-lg bg-card p-5 shadow-sm">
  <OverviewSection outline={outline} />
  {outline.sourceReferences.length ? <ReferencesSection references={outline.sourceReferences} /> : null}
  <CharactersSection characters={outline.characters} />
  <ChaptersSection chapters={outline.chapters} characters={outline.characters} />
</section>
```

Use `splitBilingual` for title, summary, and chapter titles. Render chapter fields in Chinese-first order and show English title as secondary line only.

- [ ] **Step 8: Add frontend tests**

In `features/courses/components/course-story-outline-workspace.test.tsx`, add:

```ts
test("continue modify prefills the input without calling the API", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<CourseStoryOutlineWorkspace initialState={{
    ...outlineState,
    chatMessages: [
      ...outlineState.chatMessages,
      {
        id: "m-generated",
        courseId: "course-1",
        role: "assistant",
        content: "故事大纲已生成。",
        actions: [{ id: "continue", label: "继续修改", action: "confirm_reference_object" }],
        createdAt: "2026-08-06T08:00:00.000Z",
      },
    ],
  }} />);

  fireEvent.click(screen.getByRole("button", { name: "继续修改" }));

  expect(screen.getByRole("textbox", { name: "故事想法" })).toHaveValue("帮我修改：");
  expect(fetchMock).not.toHaveBeenCalled();
});
```

```ts
test("selects a random direction from the right panel", async () => {
  const fetchMock = vi.fn(async () => Response.json(outlineState));
  vi.stubGlobal("fetch", fetchMock);
  render(<CourseStoryOutlineWorkspace initialState={{
    ...emptyState,
    directions: [{
      id: "direction-1",
      courseId: "course-1",
      title: "海底谜题",
      hook: "一本发光海图出现。",
      whyFits: "适合合作。",
      mainCharacters: ["夏天"],
      classroomValue: "观察表达",
      seedPrompt: "ocean clue",
      selectedAt: null,
      createdAt: "2026-08-06T08:00:00.000Z",
    }],
  }} />);

  fireEvent.click(screen.getByRole("button", { name: "选择这个方向" }));

  await waitFor(() => {
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ action: "choose_direction", targetId: "direction-1" });
  });
});
```

```ts
test("shows loading message while a request is pending", async () => {
  let resolveResponse!: (value: Response) => void;
  const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
  vi.stubGlobal("fetch", vi.fn(() => responsePromise));
  render(<CourseStoryOutlineWorkspace initialState={emptyState} />);

  fireEvent.change(screen.getByRole("textbox", { name: "故事想法" }), { target: { value: "学生们进入海底图书馆" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));

  expect(await screen.findByText("正在分析故事要求...")).toBeInTheDocument();
  resolveResponse(Response.json(emptyState));
});
```

- [ ] **Step 9: Run frontend tests**

Run:

```bash
pnpm test -- features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: PASS.

## Task 5: Full Verification, Docs, and Commit

**Files:**
- Modify: `docs/frontend/course-create-lesson-chat.md`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm test -- lib/server/repositories/story-outline.test.ts lib/server/ai/story-outline-provider.test.ts features/courses/components/course-story-outline-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Validate Prisma**

Run:

```bash
pnpm exec prisma validate
```

Expected: schema validates. No migration should be required by this implementation plan.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS or only pre-existing unrelated failures. If there are failures in touched files, fix them before proceeding.

- [ ] **Step 4: Update module doc implementation status**

In `docs/frontend/course-create-lesson-chat.md`, replace:

```md
- 状态：待实现。
- 本轮确认时间：2026-08-06。
- 验证命令：待实现后记录。
- 提交号：待实现后记录。
```

with:

```md
- 状态：已实现，待用户验收。
- 本轮确认时间：2026-08-06。
- 验证命令：`pnpm test -- lib/server/repositories/story-outline.test.ts lib/server/ai/story-outline-provider.test.ts features/courses/components/course-story-outline-workspace.test.tsx`、`pnpm exec prisma validate`、`pnpm lint`。
- 提交号：待提交后记录。
```

- [ ] **Step 5: Check Chinese encoding**

Run:

```bash
rg -n "�|涓|绗|鐢|銆" docs/frontend/course-create-lesson-chat.md features/courses/components/course-story-outline-workspace.tsx lib/server/ai/story-outline-deps.ts lib/server/repositories/story-outline.ts
```

Expected: no matches.

- [ ] **Step 6: Commit implementation**

Stage only touched implementation files:

```bash
git add lib/contracts/api.ts lib/server/validation/story-outline.ts lib/server/ai/story-outline-deps.ts lib/server/repositories/story-outline.ts app/api/courses/[id]/story-outline/message/route.ts app/api/courses/[id]/story-outline/reset/route.ts features/courses/components/course-story-outline-workspace.tsx features/courses/components/course-story-outline-workspace.test.tsx lib/server/repositories/story-outline.test.ts lib/server/ai/story-outline-provider.test.ts docs/frontend/course-create-lesson-chat.md
git commit -m "fix: optimize step2 story outline flow"
```

Expected: commit succeeds.

- [ ] **Step 7: Record final commit in module doc**

If Step 6 commit hash is `abc1234`, update `docs/frontend/course-create-lesson-chat.md`:

```md
- 提交号：abc1234。
```

Then amend:

```bash
git add docs/frontend/course-create-lesson-chat.md
git commit --amend --no-edit
```

Expected: final commit includes the implementation status and commit hash.

