# Frontend Module Index

This directory keeps only current module context. Historical plans, old PRD drafts, and superseded module notes have been removed for the release branch.

## Current Entry Points

- Login: `/login`
- After login: `/courses`
- Default account: `teacher`
- Default password: `123456`

## Current Modules

| Module | Document | Status |
| --- | --- | --- |
| App shell and auth | `docs/frontend/app-shell-and-auth.md` | Implemented |
| People profiles | `docs/frontend/people-profiles.md` | Implemented |
| Course list | `docs/frontend/courses-list-management.md` | Implemented |
| Course create Step 1 | `docs/frontend/course-create-basic.md` | Implemented |
| Story options Step 2 | `docs/frontend/course-create-story-options.md` | Implemented |
| Lesson draft Step 3 | `docs/frontend/course-create-lesson-draft.md` | Implemented |
| Resources Step 4 | `docs/frontend/course-create-resources.md` | Implemented |
| Preview and PDF Step 5 | `docs/frontend/course-preview-and-pdf.md` | Implemented |
| Preset library | `docs/frontend/preset-library.md` | Implemented |

## Release Notes

- Production schema changes must use Prisma migrations.
- Production deploy should run `pnpm prisma:deploy`, not `prisma migrate dev`.
- Production data and generated images must live outside the deployment code directory.
- Back up the database and image directory before destructive production migrations.
- Course images are managed through `course_images`; `structured_lesson` must not store image URLs, prompts, or image state.
- Production one-click deploy command: `pnpm deploy:prod`.
