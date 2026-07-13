# Step 4 Resource Plan MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old paragraph-to-image Step 4 flow with a resource-plan flow: one text AI call creates the visual settings, cover brief, and chapter shot plan; the confirmed cover gates all chapter image generation.

**Architecture:** Persist one `CourseResourcePlan` per course outside `structured_lesson`. Extend `CourseImage` so `visual_cover` and `lesson_shot` records share the same queue, 16:9 storage, source hashes, and stale detection. Keep MVP UI simple: teachers edit global visual settings, confirm the cover, then generate chapter images.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, DeepSeek JSON text generation, Tencent Hunyuan image generation, local filesystem storage.

---

## File Structure

- Modify `docs/frontend/course-create-resources.md`: record the confirmed MVP scope.
- Modify `prisma/schema.prisma` and add a migration: persist `CourseResourcePlan`, add `visual_cover`, 16:9/source/reference fields.
- Modify `lib/contracts/api.ts`: expose resource plan, visual profile, cover, and shot metadata.
- Create `lib/server/ai/resource-plan-generator.ts`: DeepSeek prompt, parser, validator, and mock mode for resource plans.
- Rewrite `lib/server/repositories/course-images.ts`: resource-plan source hashes, cover gate, image slot derivation, queue advancement.
- Modify Tencent/storage modules for 1280x720 WebP and no-logo/no-revise request parameters.
- Add API routes for plan generation, visual setting update, cover generation, cover confirmation, and existing image generation/retry/keep.
- Update `features/courses/components/course-resources-manager.tsx`: show plan generation, editable global visual settings, cover confirmation, and chapter progress.
- Modify `lib/server/repositories/course-preview.ts` and preview UI if needed so Step 5 uses 16:9 resources and source excerpts.

## Tasks

- [ ] Update Step 4 document to match the confirmed MVP resource-plan flow.
- [ ] Write failing pure-function tests for resource plan validation, cover gate, source hashes, and slot derivation.
- [ ] Implement schema, contracts, and repository pure functions until tests pass.
- [ ] Write failing AI parser tests for the DeepSeek resource plan generator.
- [ ] Implement resource plan generator and mock mode.
- [ ] Write failing repository/API behavior tests where practical, then implement plan generation, visual update, cover generation/confirm, chapter generation, retry/keep.
- [ ] Update Tencent image client to request 1280x720, `logo_add: 0`, and `revise: 0`; update queue dimensions.
- [ ] Update Step 4 UI to the simplified MVP flow.
- [ ] Update Step 5 preview to consume resource plan image source excerpts and keep 16:9 display.
- [ ] Run targeted tests, lint, and build; record commands in the Step 4 doc.
