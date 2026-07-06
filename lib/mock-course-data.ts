import type { CourseDetail, CourseImage, StoryPlan, StudentProfile } from "@/lib/api-contract";
import type { StructuredLesson } from "@/lib/lesson/types";

export const defaultStudentAvatars = {
  male: "/mock-assets/student-boy.png",
  female: "/mock-assets/student-girl.png",
} as const;

export const defaultTeacherAvatars = {
  male: "/mock-assets/teacher-male-default.png",
  female: "/mock-assets/teacher-default.png",
} as const;

export const mockStudents: StudentProfile[] = [
  {
    id: "summer",
    chineseName: "夏天",
    englishName: "Summer",
    name: "Summer",
    age: 8,
    gender: "female",
    appearance: "黑色长发，喜欢穿浅绿色连衣裙，笑容明亮，常带着画本。",
    interests: ["植物", "冒险", "绘画", "小动物"],
    learningGoal: "希望在故事阅读中练习完整句表达，并愿意主动复述关键情节。",
    notes: "喜欢明亮、温暖、有探索感的故事场景。",
    avatarUrl: defaultStudentAvatars.female,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: "tom",
    chineseName: "汤姆",
    englishName: "Tom",
    name: "Tom",
    age: 8,
    gender: "male",
    appearance: "短发，喜欢穿蓝色外套，表情专注，行动很有活力。",
    interests: ["恐龙", "机器人", "森林"],
    learningGoal: "通过互动绘本增加开口次数，练习描述角色动作。",
    notes: "更容易被任务型挑战吸引。",
    avatarUrl: defaultStudentAvatars.male,
    createdAt: "2026-07-01T09:05:00.000Z",
    updatedAt: "2026-07-01T09:05:00.000Z",
  },
  {
    id: "lucy",
    chineseName: "露西",
    englishName: "Lucy",
    name: "Lucy",
    age: 7,
    gender: "female",
    appearance: "棕色短发，喜欢穿粉色毛衣，表情温柔，常带着小发夹。",
    interests: ["花园", "音乐", "朋友"],
    learningGoal: "积累故事主题词汇，练习用英语表达感受。",
    notes: "偏好柔和、富有想象力的绘本主题。",
    avatarUrl: defaultStudentAvatars.female,
    createdAt: "2026-07-01T09:10:00.000Z",
    updatedAt: "2026-07-01T09:10:00.000Z",
  },
];

export const mockStoryPlans: StoryPlan[] = [
  {
    id: "plant-kingdom",
    title: "迷你 Summer 的植物王国",
    summary: "Summer 变小后进入植物世界，在花朵和小昆虫的帮助下完成一段勇敢冒险。",
    chapters: ["变成迷你人", "植物中的旅行", "朋友们的帮助"],
    imageUrl: "/mock-assets/plant-kingdom.png",
    accent: "green",
  },
  {
    id: "rabbit",
    title: "The Brave Little Rabbit",
    summary: "一只胆小的小兔子学会面对恐惧，帮助朋友解决问题。",
    chapters: ["The Problem", "The Decision", "The Success"],
    imageUrl: "/mock-assets/rabbit-forest.png",
    accent: "blue",
  },
  {
    id: "flower",
    title: "彩虹花园的秘密",
    summary: "在花园和昆虫朋友的帮助下，Summer 发现了隐藏的秘密，并学会保护自然。",
    chapters: ["发现彩虹花园", "神奇的花朵", "守护彩虹花园"],
    imageUrl: "/mock-assets/plant-kingdom.png",
    accent: "violet",
  },
];

export const mockLessonText = `Hello again, class! Welcome back to our English world!

第一阶段：变成迷你人
Yesterday, Summer (1) ______ (water) the plants.

第二阶段：植物中的旅行
Suddenly, she became as small as an ant!

第三阶段：朋友们的帮助
Her friends helped her find the way home.

Homework Reading
Read the story and circle the past tense verbs.

Answer Key
watered
happened`;

export const mockStructuredLesson: StructuredLesson = {
  title: "The Brave Little Rabbit",
  intro: "Once upon a time, in a beautiful forest, there lived a little rabbit named Rosie. Rosie was kind and helpful, but she was also very scared of many things.",
  answerKey: [
    { id: "answer-1", text: "watered" },
    { id: "answer-2", text: "happened" },
  ],
  homework: "Read the story again and retell the ending to your partner.",
  sections: [
    {
      id: "intro",
      title: "Introduction",
      sourceHash: "intro-mock",
      imageSlots: [
        { id: "intro-image-1", slotIndex: 1 },
        { id: "intro-image-2", slotIndex: 2 },
      ],
      blocks: [
        {
          type: "paragraph",
          segments: [
            {
              type: "text",
              text: "Once upon a time, in a beautiful forest, there lived a little rabbit named Rosie. Rosie was kind and helpful, but she was also very scared of many things.",
            },
          ],
        },
      ],
    },
    {
      id: "section-1",
      title: "Section 1: The Problem",
      sourceHash: "section-1-mock",
      imageSlots: [],
      blocks: [
        {
          type: "paragraph",
          segments: [
            {
              type: "text",
              text: "One day, Rosie's friend, a little bird, came to her. “Rosie, my nest is in the big tree, but I can't get there. I'm too scared to fly!” Rosie wanted to help, but she was scared of heights.",
            },
          ],
        },
      ],
    },
  ],
};

export const mockImages: CourseImage[] = [
  { id: "image-1", sectionId: "intro", slotIndex: 1, status: "succeeded", url: "/mock-assets/rabbit-forest.png" },
  { id: "image-2", sectionId: "intro", slotIndex: 2, status: "succeeded", url: "/mock-assets/plant-kingdom.png" },
  { id: "image-3", sectionId: "section-1", slotIndex: 1, status: "generating", url: "/mock-assets/rabbit-forest.png" },
];

export const mockCourse: CourseDetail = {
  id: "123",
  title: "The Brave Little Rabbit",
  students: mockStudents,
  brief: {
    studentIds: mockStudents.map((student) => student.id),
    age: 8,
    englishLevel: "A1",
    grammar: ["Past Simple", "Future Simple"],
    durationMinutes: 45,
    theme: "Plants / Nature",
    storyIdea: "Summer becomes tiny and enters a magical plant kingdom...",
  },
  storyPlans: mockStoryPlans,
  selectedStoryPlanId: "plant-kingdom",
  lessonText: mockLessonText,
  structuredLesson: mockStructuredLesson,
  images: mockImages,
  progress: {
    structureDone: true,
    generatedImages: 6,
    totalImages: 12,
    htmlDone: false,
    pdfDone: false,
  },
};
