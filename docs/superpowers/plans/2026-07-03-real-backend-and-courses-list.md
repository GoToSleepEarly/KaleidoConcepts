# Real Backend And Courses List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move auth, students, and course list management from component mock data to a real Prisma-backed backend while keeping the Next.js monolith small.

**Architecture:** Keep `app/` as the routing layer. Move business UI into `features/*`, shared contracts into `lib/contracts`, server-only data access into `lib/server`, and seed/demo data into `prisma/seed.ts`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Vitest, TailwindCSS.

---

### Task 1: Backend Contracts And Tests

**Files:**
- Create: `lib/contracts/api.ts`
- Create: `lib/server/repositories/students.test.ts`
- Create: `lib/server/repositories/auth.test.ts`
- Create: `lib/server/repositories/courses.test.ts`
- Modify: `lib/api-contract.ts`

- [x] Write failing tests for auth credential validation, student create/update/list, and course list mapping.
- [x] Run `pnpm test lib/server/repositories` and confirm failures are caused by missing repositories.

### Task 2: Prisma Data Layer

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `lib/server/db.ts`
- Create: `lib/server/repositories/auth.ts`
- Create: `lib/server/repositories/students.ts`
- Create: `lib/server/repositories/courses.ts`
- Modify: `package.json`

- [ ] Add Prisma dependencies and scripts. Blocked by registry request failures for `@prisma/client` and `prisma`.
- [x] Implement lazy Prisma client creation.
- [x] Implement repositories behind narrow interfaces.
- [x] Run repository tests until they pass.

### Task 3: API Routes

**Files:**
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/students/route.ts`
- Modify: `app/api/students/[id]/route.ts`
- Modify: `app/api/courses/route.ts`
- Modify: `app/api/courses/[id]/route.ts`

- [x] Replace route-local mutable arrays and `mockAuth`.
- [x] Return explicit 400/401/404/500 messages.
- [x] Keep route handlers thin.

### Task 4: Frontend Feature Structure

**Files:**
- Move: `components/login-form.tsx` to `features/auth/components/login-form.tsx`
- Move: `components/students-manager.tsx` to `features/students/components/students-manager.tsx`
- Create: `features/courses/components/courses-manager.tsx`
- Modify: app route imports.

- [x] Remove student localStorage test persistence.
- [x] Use backend responses as source of truth.
- [x] Add loading, empty, and error states.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/frontend/README.md`
- Modify: `docs/frontend/app-shell-and-auth.md`
- Modify: `docs/frontend/students-list.md`
- Modify: `docs/frontend/courses-list-management.md`
- Modify: `docs/frontend/real-backend-auth-and-students.md`

- [x] Update implementation status and verification commands.
- [x] Run `pnpm lint`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build`.
