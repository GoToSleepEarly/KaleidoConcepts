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

const themePresetGroups = [
  { category: "校园与成长", labels: ["新环境", "同伴关系", "校园活动", "兴趣探索", "规则与选择"] },
  { category: "家庭与日常", labels: ["家庭分工", "代际交流", "节日庆祝", "生活变化", "共同回忆"] },
  { category: "自然与生态", labels: ["动物世界", "植物生长", "海洋生态", "天气与气候", "环境保护"] },
  { category: "科学与未来", labels: ["太空探索", "机器人", "发明创造", "科学实验", "未来城市"] },
  { category: "奇幻与想象", labels: ["魔法世界", "神秘生物", "隐藏世界", "时间旅行", "神话传说"] },
  { category: "历史与文化", labels: ["古代文明", "博物馆与文物", "节日与习俗", "传统技艺", "世界旅行"] },
  { category: "社区与社会", labels: ["职业体验", "社区服务", "公共交通", "志愿行动", "城市问题"] },
  { category: "运动与挑战", labels: ["团队运动", "个人突破", "公平竞争", "户外挑战", "健康生活"] },
];
const storyTypePresets = ["冒险", "侦探推理", "奇幻", "科幻", "校园生活", "人物成长", "历史穿越", "寓言", "喜剧", "任务闯关"];
const storyTonePresets = ["轻松幽默", "温暖治愈", "紧张刺激", "神秘悬疑", "奇妙梦幻", "热血振奋", "安静诗意"];
const grammarPresetGroups = [
  { category: "时态", labels: [
    ["Present Simple", "一般现在时"], ["Present Continuous", "现在进行时"], ["Past Simple", "一般过去时"],
    ["Past Continuous", "过去进行时"], ["Future with Will", "will 表将来"], ["Future with Be Going To", "be going to 表将来"],
    ["Present Perfect", "现在完成时"], ["Past Perfect", "过去完成时"], ["Present Perfect Continuous", "现在完成进行时"],
    ["Future Continuous", "将来进行时"], ["Future Perfect", "将来完成时"],
  ] },
  { category: "基本句型与疑问句", labels: [
    ["There be", "There be 句型"], ["Imperatives", "祈使句"], ["Yes/No Questions", "一般疑问句"],
    ["Wh- Questions", "特殊疑问句"], ["Indirect Questions", "间接疑问句"], ["Question Tags", "反意疑问句"],
  ] },
  { category: "名词、限定词与代词", labels: [
    ["Singular and Plural Nouns", "名词单复数"], ["Noun Countability", "名词的可数性"], ["Articles", "冠词"],
    ["Personal Pronouns", "人称代词"], ["Possessives", "物主形式"], ["Reflexive Pronouns", "反身代词"],
    ["Quantifiers", "数量限定词"], ["Subject–Verb Agreement", "主谓一致"],
  ] },
  { category: "形容词、副词与比较", labels: [
    ["Adjective Order", "形容词顺序"], ["Adverbs of Frequency", "频率副词"], ["Adverbs of Manner", "方式副词"],
    ["Comparative Adjectives", "形容词比较级"], ["Superlative Adjectives", "形容词最高级"], ["Too", "too 的用法"], ["Enough", "enough 的用法"],
  ] },
  { category: "情态动词", labels: [
    ["Can", "can 的用法"], ["Could", "could 的用法"], ["May", "may 的用法"], ["Might", "might 的用法"],
    ["Must", "must 的用法"], ["Have To", "have to 的用法"], ["Should", "should 的用法"],
  ] },
  { category: "从句与复合句", labels: [
    ["Coordinate Clauses", "并列句"], ["Reason Clauses", "原因状语从句"], ["Time Clauses", "时间状语从句"],
    ["Purpose Clauses", "目的状语从句"], ["Concession Clauses", "让步状语从句"], ["First Conditional", "第一条件句"],
    ["Second Conditional", "第二条件句"], ["Third Conditional", "第三条件句"], ["Defining Relative Clauses", "限定性定语从句"],
    ["Non-defining Relative Clauses", "非限定性定语从句"], ["Noun Clauses", "名词性从句"],
  ] },
  { category: "语态、非谓语与特殊结构", labels: [
    ["Passive Voice", "被动语态"], ["Infinitives", "动词不定式"], ["Gerunds", "动名词"], ["Reported Speech", "间接引语"],
    ["Used To", "used to 表示过去习惯"], ["Wish", "wish 表达愿望"], ["Participle Clauses", "分词从句"],
  ] },
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

  let themeSortOrder = 0;
  for (const group of themePresetGroups) {
    for (const label of group.labels) {
      await prisma.presetOption.upsert({
        where: { kind_label: { kind: "theme", label } },
        update: { category: group.category, sortOrder: themeSortOrder, archivedAt: null },
        create: { kind: "theme", label, category: group.category, sortOrder: themeSortOrder },
      });
      themeSortOrder += 1;
    }
  }

  for (const [sortOrder, label] of storyTypePresets.entries()) {
    await prisma.presetOption.upsert({
      where: { kind_label: { kind: "story_type", label } },
      update: { category: "故事类型", sortOrder, archivedAt: null },
      create: { kind: "story_type", label, category: "故事类型", sortOrder },
    });
  }

  for (const [sortOrder, label] of storyTonePresets.entries()) {
    await prisma.presetOption.upsert({
      where: { kind_label: { kind: "story_tone", label } },
      update: { category: "故事氛围", sortOrder, archivedAt: null },
      create: { kind: "story_tone", label, category: "故事氛围", sortOrder },
    });
  }

  let sortOrder = 0;
  for (const group of grammarPresetGroups) {
    for (const [label, labelZh] of group.labels) {
      await prisma.presetOption.upsert({
        where: { kind_label: { kind: "grammar", label } },
        update: { labelZh, category: group.category, sortOrder, archivedAt: null },
        create: { kind: "grammar", label, labelZh, category: group.category, sortOrder },
      });
      sortOrder += 1;
    }
  }

  await prisma.presetOption.updateMany({
    where: {
      kind: "grammar",
      label: { in: ["Future (will / be going to)", "Can / Could", "Must / Have to", "There Be"] },
    },
    data: { archivedAt: new Date() },
  });
  await prisma.presetOption.updateMany({
    where: {
      kind: "theme",
      label: { in: ["宇宙冒险", "海底世界", "森林探险", "校园生活"] },
    },
    data: { archivedAt: new Date() },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
