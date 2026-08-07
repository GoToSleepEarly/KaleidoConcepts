# Step3 Teaching Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build V2 course creation Step 3, the deterministic teaching-plan configuration module.

**Architecture:** Store one `CourseTeachingPlan` per course with JSON chapter/practice configuration and explicit draft/confirmed status. The server owns creation, validation, confirmation, and stage transitions; the client renders a two-column editor and only saves/confirm plans through the API.

**Tech Stack:** Next.js App Router, React 19, Prisma, PostgreSQL, Vitest, Testing Library, Tailwind.

---

### Task 1: Data Contract And Validation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations-v2/20260807010000_add_teaching_plan/migration.sql`
- Modify: `lib/contracts/api.ts`
- Create: `lib/server/validation/teaching-plan.ts`
- Test: `lib/server/validation/teaching-plan.test.ts`

- [ ] Add `CourseTeachingPlan`, `TeachingPlanStatus`, and `EnglishLevel`.
- [ ] Add public contract types for `TeachingPlan`, chapter config, exercise config, and API state.
- [ ] Add zod schemas and validation helpers for ranges, exercise type support, and after-class knowledge-point subset rules.
- [ ] Verify validation tests fail before implementation and pass after implementation.

### Task 2: Repository And API

**Files:**
- Modify: `lib/server/db.ts`
- Create: `lib/server/repositories/teaching-plan.ts`
- Test: `lib/server/repositories/teaching-plan.test.ts`
- Create: `app/api/courses/[id]/teaching-plan/route.ts`
- Create: `app/api/courses/[id]/teaching-plan/confirm/route.ts`

- [ ] Implement draft creation from confirmed story outline.
- [ ] Implement save without stage transition.
- [ ] Implement confirm with full validation and `currentStage = "content"`.
- [ ] Return `400`, `404`, `409`, and `500` per PRD.
- [ ] Keep downstream reset as an explicit `resetDownstream` path; current code has no downstream Step4/5 tables yet, so reset is a transaction boundary placeholder.

### Task 3: Frontend Step3 Page

**Files:**
- Create: `app/courses/[id]/create/teaching-plan/page.tsx`
- Create: `features/courses/components/course-teaching-plan-workspace.tsx`
- Test: `features/courses/components/course-teaching-plan-workspace.test.tsx`
- Modify: `features/courses/components/course-create-steps.tsx`
- Modify: `features/courses/components/course-story-outline-workspace.tsx`
- Modify: `features/courses/components/course-story-outline-workspace.test.tsx`

- [ ] Render two-column teaching-plan editor with English level, chapter list, after-class entry, and current-object preview.
- [ ] Apply difficulty defaults only to untouched fields.
- [ ] Support per-chapter target word count, knowledge points, reading mode, embedded exercises, and chapter practice.
- [ ] Support after-class practice config and subset sync rules.
- [ ] Save draft without advancing; confirm advances to content.
- [ ] Keep Step2 confirmation routing to `/teaching-plan`.

### Task 4: Verification And Docs

**Files:**
- Modify: `docs/frontend-v2/course-create-teaching-plan.md`

- [ ] Run targeted validation/repository/component tests.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm lint`.
- [ ] Check Chinese encoding artifacts with `rg -n "�|涓|绗|鐢|銆"`.
- [ ] Record implementation status and verification commands in the module doc.
