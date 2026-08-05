import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const people = [
  { role: "teacher" as const, chineseName: "林老师", englishName: "Ms. Lin", age: 32, gender: "female" as const, notes: "语气亲切，擅长故事式教学" },
  { role: "student" as const, chineseName: "夏天", englishName: "Summer", age: 9, gender: "female" as const, notes: "课堂表达积极" },
  { role: "student" as const, chineseName: "子轩", englishName: "ZiXuan", age: 10, gender: "male" as const, notes: "喜欢合作解决问题" },
];

const themePresets = ["魔法世界", "宇宙冒险", "海底世界", "森林探险", "未来城市", "校园生活"];
const grammarPresetGroups = [
  { category: "时态", labels: ["Present Simple", "Present Continuous", "Past Simple", "Future (will / be going to)"] },
  { category: "句型", labels: ["There be", "Wh- Questions", "Yes/No Questions", "Imperatives"] },
  { category: "情态动词", labels: ["Can / Could", "Must / Have to", "Should"] },
];

async function main() {
  await prisma.user.upsert({
    where: { username: "teacher" },
    update: { password: "123456", displayName: "教师账号" },
    create: { username: "teacher", password: "123456", displayName: "教师账号" },
  });

  for (const person of people) {
    const existing = await prisma.person.findFirst({
      where: { role: person.role, chineseName: person.chineseName, englishName: person.englishName },
    });
    if (!existing) await prisma.person.create({ data: person });
  }

  for (const [sortOrder, label] of themePresets.entries()) {
    await prisma.presetOption.upsert({
      where: { kind_label: { kind: "theme", label } },
      update: { sortOrder, archivedAt: null },
      create: { kind: "theme", label, sortOrder },
    });
  }

  let sortOrder = 0;
  for (const group of grammarPresetGroups) {
    for (const label of group.labels) {
      await prisma.presetOption.upsert({
        where: { kind_label: { kind: "grammar", label } },
        update: { category: group.category, sortOrder, archivedAt: null },
        create: { kind: "grammar", label, category: group.category, sortOrder },
      });
      sortOrder += 1;
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
