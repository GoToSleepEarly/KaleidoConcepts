import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

type PrismaClientLike = {
  user: {
    upsert: (query: unknown) => Promise<{ username: string }>;
  };
  person: {
    deleteMany: (query: unknown) => Promise<unknown>;
  };
  course: {
    deleteMany: (query: unknown) => Promise<unknown>;
  };
  presetOption: {
    upsert: (query: unknown) => Promise<unknown>;
  };
  $disconnect: () => Promise<void>;
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
}) as unknown as PrismaClientLike;

const demoCourseIds = ["course-rabbit"];
const demoPersonIds = ["person-teacher-lin", "student-summer", "student-tom"];

const themePresets = [
  "魔法世界",
  "宇宙冒险",
  "海底世界",
  "恐龙时代",
  "森林探险",
  "未来城市",
  "童话王国",
  "西游记",
  "三国演义",
  "校园生活",
  "动物乐园",
  "美食之旅",
  "运动比赛",
  "博物馆奇妙夜",
  "环游世界",
  "神秘岛屿",
  "机器人世界",
  "农场生活",
  "冰雪王国",
  "超级英雄",
];

const grammarPresetGroups = [
  {
    category: "时态",
    labels: ["Present Simple", "Present Continuous", "Past Simple", "Past Continuous", "Future (will / be going to)", "Present Perfect"],
  },
  {
    category: "词类",
    labels: [
      "Singular / Plural Nouns",
      "Countable / Uncountable",
      "Subject Pronouns",
      "Possessive",
      "Object Pronouns",
      "Articles (a / an / the)",
      "Comparatives",
      "Superlatives",
      "Adverbs of Frequency",
      "Prepositions of Place",
      "Prepositions of Time",
    ],
  },
  {
    category: "句型",
    labels: ["There be", "Have got", "Wh- Questions", "Yes/No Questions", "Imperatives"],
  },
  {
    category: "情态动词",
    labels: ["Can / Could", "Must / Have to", "Should"],
  },
  {
    category: "限定词与量词",
    labels: ["Some / Any", "Much / Many / A lot of", "This / That / These / Those"],
  },
];

async function main() {
  const teacher = await prisma.user.upsert({
    where: { username: "teacher" },
    update: { password: "123456", displayName: "教师账号" },
    create: { username: "teacher", password: "123456", displayName: "教师账号" },
  });

  await prisma.course.deleteMany({
    where: { id: { in: demoCourseIds } },
  });

  await prisma.person.deleteMany({
    where: { id: { in: demoPersonIds } },
  });

  for (const [index, label] of themePresets.entries()) {
    await prisma.presetOption.upsert({
      where: { kind_label: { kind: "theme", label } },
      update: { sortOrder: index },
      create: { kind: "theme", label, sortOrder: index },
    });
  }

  let grammarSortOrder = 0;
  for (const group of grammarPresetGroups) {
    for (const label of group.labels) {
      await prisma.presetOption.upsert({
        where: { kind_label: { kind: "grammar", label } },
        update: { category: group.category, sortOrder: grammarSortOrder },
        create: { kind: "grammar", label, category: group.category, sortOrder: grammarSortOrder },
      });
      grammarSortOrder += 1;
    }
  }

  console.log(`Seeded ${teacher.username} and preset library`);
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
