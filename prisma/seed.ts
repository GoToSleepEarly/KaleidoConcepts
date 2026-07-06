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
