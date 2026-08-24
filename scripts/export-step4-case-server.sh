#!/usr/bin/env bash
set -euo pipefail

COURSE_ID="${1:-}"
if [[ -z "$COURSE_ID" ]]; then
  echo "Usage: $0 <course-id> [output-file]" >&2
  exit 1
fi
OUTPUT_FILE="${2:-/tmp/pbl-step4-case-${COURSE_ID}.json}"

if [[ ! "$COURSE_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Invalid course ID." >&2
  exit 1
fi

sudo -u pblv2 /bin/bash --noprofile --norc -s -- "$COURSE_ID" "$OUTPUT_FILE" <<'INNER_BASH'
set -euo pipefail

course_id="$1"
output_file="$2"

set -a
. /etc/pbl-studio-v2.env
set +a

if [[ -z "${DATABASE_URL_FOR_PG_DUMP:-}" ]]; then
  echo "DATABASE_URL_FOR_PG_DUMP is not configured." >&2
  exit 1
fi

umask 077
psql "$DATABASE_URL_FOR_PG_DUMP" \
  -X \
  -v ON_ERROR_STOP=1 \
  -v course_id="$course_id" \
  -Atq > "$output_file" <<'SQL'
SELECT jsonb_pretty(
  jsonb_build_object(
    'format', 'pbl-step4-failure-case',
    'formatVersion', 1,
    'exportedAt', CURRENT_TIMESTAMP,
    'privacyNotice', 'Contains course text and participant name snapshots. Does not contain passwords, cookies, API keys, provider credentials, image URLs, or database connection strings.',
    'course',
      (to_jsonb(c) - 'idempotencyKey') || jsonb_build_object(
        'people', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'role', cp."role",
              'chineseNameSnapshot', cp."chineseNameSnapshot",
              'englishNameSnapshot', cp."englishNameSnapshot",
              'ageSnapshot', cp."ageSnapshot",
              'genderSnapshot', cp."genderSnapshot"
            ) ORDER BY cp."createdAt"
          )
          FROM "CoursePerson" cp
          WHERE cp."courseId" = c."id"
        ), '[]'::jsonb),
        'characters', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', cc."id",
              'displayName', cc."displayName",
              'englishName', cc."englishName",
              'sourceType', cc."sourceType",
              'roleInStory', cc."roleInStory",
              'shortDescription', cc."shortDescription"
            ) ORDER BY cc."createdAt"
          )
          FROM "CourseCharacter" cc
          WHERE cc."courseId" = c."id"
        ), '[]'::jsonb)
      ),
    'storyOutline', CASE WHEN outline."id" IS NULL THEN NULL ELSE
      to_jsonb(outline) || jsonb_build_object(
        'chapters', COALESCE((
          SELECT jsonb_agg(to_jsonb(chapter) ORDER BY chapter."order")
          FROM "CourseStoryOutlineChapter" chapter
          WHERE chapter."outlineId" = outline."id"
        ), '[]'::jsonb)
      )
    END,
    'teachingPlan', to_jsonb(plan),
    'lessonContent', to_jsonb(content),
    'contentGenerations', COALESCE((
      SELECT jsonb_agg((to_jsonb(generation) - 'idempotencyKey') ORDER BY generation."createdAt")
      FROM "CourseContentGeneration" generation
      WHERE generation."courseId" = c."id"
    ), '[]'::jsonb),
    'contentMessages', COALESCE((
      SELECT jsonb_agg(to_jsonb(message) ORDER BY message."createdAt")
      FROM "CourseContentChatMessage" message
      WHERE message."courseId" = c."id"
    ), '[]'::jsonb),
    'knowledgePoints', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', preset."id",
          'label', preset."label",
          'labelZh', preset."labelZh",
          'category', preset."category",
          'sortOrder', preset."sortOrder"
        ) ORDER BY preset."category", preset."sortOrder", preset."label"
      )
      FROM "PresetOption" preset
      WHERE preset."kind" = 'grammar' AND preset."archivedAt" IS NULL
    ), '[]'::jsonb)
  )
)
FROM "Course" c
LEFT JOIN "CourseStoryOutline" outline ON outline."courseId" = c."id"
LEFT JOIN "CourseTeachingPlan" plan ON plan."courseId" = c."id"
LEFT JOIN "CourseLessonContent" content ON content."courseId" = c."id"
WHERE c."id" = :'course_id';
SQL

if [[ ! -s "$output_file" ]]; then
  echo "Course not found or export is empty: $course_id" >&2
  rm -f -- "$output_file"
  exit 1
fi

echo "Export completed: $output_file"
sha256sum "$output_file"
ls -lh "$output_file"
INNER_BASH
