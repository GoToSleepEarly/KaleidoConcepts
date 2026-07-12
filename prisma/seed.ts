import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

type PrismaClientLike = {
  user: {
    upsert: (query: unknown) => Promise<{ username: string }>;
  };
  person: {
    upsert: (query: unknown) => Promise<{ id: string }>;
    updateMany: (query: unknown) => Promise<unknown>;
  };
  course: {
    upsert: (query: unknown) => Promise<unknown>;
  };
  courseLessonDraft: {
    upsert: (query: unknown) => Promise<unknown>;
  };
  coursePerson: {
    upsert: (query: unknown) => Promise<unknown>;
  };
  $disconnect: () => Promise<void>;
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
}) as PrismaClientLike;

const lessonDraftContent = {
  schemaVersion: "lesson_draft_v1",
  sourceStoryOptionId: "seed-story-option",
  generationMode: "ai",
  title: "The Brave Little Rabbit",
  language: "en",
  visualStyle: {
    artStyle: "bright picture-book watercolor",
    colorPalette: "leaf green, sky blue, warm sunlight",
    aspectRatio: "4:3",
    consistencyPrompt: "Keep the same gentle classroom picture-book style.",
  },
  characters: [],
  chapters: [
    {
      id: "chapter-1",
      sourceOutlineChapterIndex: 1,
      title: "The Tiny Garden",
      blocks: [
        { id: "block-1", order: 1, type: "text", text: "Summer walked into the garden and saw a tiny rabbit beside a blue flower." },
        { id: "block-2", order: 2, type: "exercise", exerciseId: "exercise-1", display: { kind: "verb_blank", placeholder: "________", prompt: "walk" } },
        { id: "block-3", order: 3, type: "text", text: "The rabbit waved and pointed to a shining leaf path under the warm sun." },
        { id: "block-4", order: 4, type: "exercise", exerciseId: "exercise-2", display: { kind: "vocabulary_hint", placeholder: "________", pattern: "l__f", letterCount: 4 } },
      ],
      exercises: [
        { id: "exercise-1", type: "verb_blank", answer: "walked", baseVerb: "walk" },
        { id: "exercise-2", type: "vocabulary_hint", answer: "leaf", hint: "A green part of a plant." },
      ],
      shots: [
        {
          id: "shot-1",
          order: 1,
          imageSlotId: "slot-1",
          coveredBlockIds: ["block-1", "block-2"],
          characterIds: [],
          location: "a sunny garden",
          action: "Summer finds a tiny rabbit beside a blue flower.",
          mood: "curious and bright",
          scenePrompt: "Summer in a sunny garden with a tiny rabbit and blue flower.",
          composition: "Wide 4:3 picture-book page.",
          continuityNotes: "Keep Summer and the rabbit consistent.",
        },
        {
          id: "shot-2",
          order: 2,
          imageSlotId: "slot-2",
          coveredBlockIds: ["block-3", "block-4"],
          characterIds: [],
          location: "a leaf path",
          action: "The rabbit points to a shining leaf path.",
          mood: "adventurous",
          scenePrompt: "A tiny rabbit points to a shining leaf path in warm sunlight.",
          composition: "Wide 4:3 picture-book page.",
          continuityNotes: "Keep the same garden palette.",
        },
      ],
    },
  ],
  closingReading: {
    title: "The Leaf Path",
    text: "Summer followed the rabbit and read the signs on the leaf path. She remembered the blue flower, the warm sun, and the brave little rabbit.",
    vocabularyTerms: ["rabbit", "flower", "leaf"],
  },
};

async function main() {
  const teacher = await prisma.user.upsert({
    where: { username: "teacher" },
    update: { password: "123456", displayName: "教师账号" },
    create: { username: "teacher", password: "123456", displayName: "教师账号" },
  });

  const teacherProfile = await prisma.person.upsert({
    where: { id: "person-teacher-lin" },
    update: {
      name: "Ms. Lin",
      gender: "female",
      appearance: "黑色长发，圆框眼镜，穿浅色针织衫，亲切自然。",
      interests: [],
      notes: "默认教师形象，用于教案和插图生成。",
      avatarUrl: "/mock-assets/teacher-default.png",
    },
    create: {
      id: "person-teacher-lin",
      role: "teacher",
      name: "Ms. Lin",
      gender: "female",
      appearance: "黑色长发，圆框眼镜，穿浅色针织衫，亲切自然。",
      interests: [],
      notes: "默认教师形象，用于教案和插图生成。",
      avatarUrl: "/mock-assets/teacher-default.png",
    },
  });

  await prisma.person.updateMany({
    where: {
      role: "teacher",
      gender: "male",
      OR: [{ avatarUrl: null }, { avatarUrl: "/mock-assets/teacher-default.png" }],
    },
    data: { avatarUrl: "/mock-assets/teacher-male-default.png" },
  });

  await prisma.person.updateMany({
    where: { role: "teacher", avatarUrl: null },
    data: { avatarUrl: "/mock-assets/teacher-default.png" },
  });

  const summer = await prisma.person.upsert({
    where: { id: "student-summer" },
    update: {
      appearance: "黑色长发，喜欢穿浅绿色连衣裙，笑容明亮，常带着画本。",
    },
    create: {
      id: "student-summer",
      role: "student",
      name: "Summer",
      chineseName: "夏天",
      englishName: "Summer",
      age: 8,
      gender: "female",
      appearance: "黑色长发，喜欢穿浅绿色连衣裙，笑容明亮，常带着画本。",
      interests: ["植物", "冒险", "绘画", "小动物"],
      learningGoal: "希望在故事阅读中练习完整句表达，并愿意主动复述关键情节。",
      notes: "喜欢明亮、温暖、有探索感的故事场景。",
      avatarUrl: "/mock-assets/student-girl.png",
    },
  });

  const tom = await prisma.person.upsert({
    where: { id: "student-tom" },
    update: {
      appearance: "短发，喜欢穿蓝色外套，表情专注，行动很有活力。",
    },
    create: {
      id: "student-tom",
      role: "student",
      name: "Tom",
      chineseName: "汤姆",
      englishName: "Tom",
      age: 8,
      gender: "male",
      appearance: "短发，喜欢穿蓝色外套，表情专注，行动很有活力。",
      interests: ["恐龙", "机器人", "森林"],
      learningGoal: "通过互动绘本增加开口次数，练习描述角色动作。",
      notes: "更容易被任务型挑战吸引。",
      avatarUrl: "/mock-assets/student-boy.png",
    },
  });

  const courseId = "course-rabbit";

  await prisma.person.updateMany({
    where: { role: "student", appearance: null },
    data: { appearance: "待补充外貌描述。" },
  });

  await prisma.course.upsert({
    where: { id: "course-rabbit" },
    update: {
      englishLevel: "A1",
      durationMinutes: 45,
      theme: "Plants / Nature",
      grammar: ["Past Simple", "Future Simple"],
      storyIdeaMode: "manual",
      storyIdea: "Summer becomes tiny and enters a magical plant kingdom.",
      status: "ready",
    },
    create: {
      id: courseId,
      title: "The Brave Little Rabbit",
      englishLevel: "A1",
      durationMinutes: 45,
      theme: "Plants / Nature",
      grammar: ["Past Simple", "Future Simple"],
      storyIdeaMode: "manual",
      storyIdea: "Summer becomes tiny and enters a magical plant kingdom.",
      status: "ready",
    },
  });

  for (const personId of [teacherProfile.id, summer.id, tom.id]) {
    await prisma.coursePerson.upsert({
      where: {
        courseId_personId: {
          courseId,
          personId,
        },
      },
      update: {},
      create: {
        courseId,
        personId,
      },
    });
  }

  await prisma.courseLessonDraft.upsert({
    where: { courseId },
    update: {
      sourceStoryOptionId: "seed-story-option",
      content: lessonDraftContent,
    },
    create: {
      courseId,
      sourceStoryOptionId: "seed-story-option",
      content: lessonDraftContent,
    },
  });

  console.log(`Seeded ${teacher.username}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
