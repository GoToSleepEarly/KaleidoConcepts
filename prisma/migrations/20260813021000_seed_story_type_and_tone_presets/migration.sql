INSERT INTO "PresetOption" ("id", "kind", "label", "category", "sortOrder", "createdAt", "updatedAt") VALUES
  ('preset_story_type_adventure', 'story_type', '冒险', '故事类型', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_detective', 'story_type', '侦探推理', '故事类型', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_fantasy', 'story_type', '奇幻', '故事类型', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_scifi', 'story_type', '科幻', '故事类型', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_school', 'story_type', '校园生活', '故事类型', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_growth', 'story_type', '人物成长', '故事类型', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_history', 'story_type', '历史穿越', '故事类型', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_fable', 'story_type', '寓言', '故事类型', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_comedy', 'story_type', '喜剧', '故事类型', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_type_quest', 'story_type', '任务闯关', '故事类型', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_light', 'story_tone', '轻松幽默', '故事氛围', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_warm', 'story_tone', '温暖治愈', '故事氛围', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_tense', 'story_tone', '紧张刺激', '故事氛围', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_mystery', 'story_tone', '神秘悬疑', '故事氛围', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_dreamy', 'story_tone', '奇妙梦幻', '故事氛围', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_rousing', 'story_tone', '热血振奋', '故事氛围', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('preset_story_tone_quiet', 'story_tone', '安静诗意', '故事氛围', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "label") DO UPDATE SET
  "category" = EXCLUDED."category",
  "sortOrder" = EXCLUDED."sortOrder",
  "archivedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;
