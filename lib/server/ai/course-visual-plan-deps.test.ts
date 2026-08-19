import { describe, expect, test } from "vitest";

import { buildCourseVisualPlanPrompt, compileCourseImagePrompt, CourseVisualPlanResponseError, mergeOriginalizedVisualPlan, parseCourseVisualPlan, parseCourseVisualPlanResponse, type CourseVisualPlan, type CourseVisualPlanPromptInput } from "./course-visual-plan-deps";

const input: CourseVisualPlanPromptInput = {
  mode: "faithful" as const,
  storyTitle: "Valorant Classroom Mission",
  characters: [
    { id: "teacher", displayName: "林老师", englishName: "Ms. Lin", sourceType: "person", reference: null, roleInStory: "teacher guide" },
    { id: "jett", displayName: "捷特", englishName: "Jett", sourceType: "referenced", reference: { name: "Jett and Sage", type: "game_character", summary: "Two agents from VALORANT." }, roleInStory: "agile hero" },
    { id: "sage", displayName: "贤者", englishName: "Sage", sourceType: "referenced", reference: { name: "Jett and Sage", type: "game_character", summary: "Two agents from VALORANT." }, roleInStory: "protector" },
    { id: "sprite", displayName: "风精灵", englishName: "Wind Sprite", sourceType: "original", reference: null, roleInStory: "helper" },
  ],
  chapters: [{
    id: "chapter-1",
    order: 1,
    title: "The Wind Path",
    paragraphs: [{ id: "paragraph-1", cleanReading: "Jett opens a wind path while Sage protects Ms Lin." }],
  }],
};

const rawPlan = {
  visualStyle: "Bright cinematic children's 3D illustration with clean shapes.",
  storyWorld: "A safe futuristic training garden.",
  characterDesigns: [
    { characterId: "teacher", visualAnchor: { mode: "reference", label: "Ms. Lin", context: null }, appearanceDescription: null, courseAppearance: "深蓝色户外夹克、舒适长裤和防滑鞋。" },
    { characterId: "jett", visualAnchor: { mode: "semantic", label: "Jett", context: "VALORANT game character" }, appearanceDescription: "白色短发高高束起，身形轻盈敏捷。", courseAppearance: "保留蓝灰色标志性战斗服。" },
    { characterId: "sage", visualAnchor: { mode: "semantic", label: "Sage", context: "VALORANT game character" }, appearanceDescription: "黑色长发扎成马尾，面容沉静。", courseAppearance: "保留白色与青绿色长袍式战斗服。" },
    { characterId: "sprite", visualAnchor: { mode: "description", label: "Wind Sprite", context: null }, appearanceDescription: "薄荷绿色的小风精灵，长着叶片形耳朵。", courseAppearance: "佩戴银色指南针挂饰。" },
  ],
  cover: { focus: "The team enters the garden.", characterIds: ["teacher", "jett", "sage"], sceneDescription: "A wide group scene at the garden gate." },
  shots: [{ paragraphId: "paragraph-1", focus: "Opening the wind path.", characterIds: ["teacher", "jett", "sage"], sceneDescription: "Jett opens a wind path while Sage protects the teacher." }],
} satisfies CourseVisualPlan;

const aiResponse = {
  visualStyle: rawPlan.visualStyle,
  storyWorld: rawPlan.storyWorld,
  characterDesigns: [
    { characterKey: "C01", visualLabel: null, characterAppearance: null, courseAppearance: "深蓝色户外夹克、舒适长裤和防滑鞋。" },
    { characterKey: "C02", visualLabel: null, characterAppearance: "白色短发高高束起，身形轻盈敏捷。", courseAppearance: "保留蓝灰色标志性战斗服。" },
    { characterKey: "C03", visualLabel: null, characterAppearance: "黑色长发扎成马尾，面容沉静。", courseAppearance: "保留白色与青绿色长袍式战斗服。" },
    { characterKey: "C04", visualLabel: null, characterAppearance: "薄荷绿色的小风精灵，长着叶片形耳朵。", courseAppearance: "佩戴银色指南针挂饰。" },
  ],
  cover: { focus: "The team enters the garden.", characterKeys: ["C01", "C02", "C03"], sceneDescription: "A wide group scene at the garden gate." },
  shots: [{ paragraphKey: "P01", focus: "Opening the wind path.", characterKeys: ["C01", "C02", "C03"], sceneDescription: "Jett opens a wind path while Sage protects the teacher." }],
};

describe("Step 5 视觉资源方案", () => {
  test("Prompt 只暴露短 key，不要求 AI 抄写数据库角色和段落 ID", () => {
    const prompt = buildCourseVisualPlanPrompt(input);
    expect(prompt).toContain('"characterKey":"C01"');
    expect(prompt).toContain('"paragraphKey":"P01"');
    expect(prompt).toContain("game_character");
    expect(prompt).toContain("Valorant Classroom Mission");
    expect(prompt).toContain("Jett");
    expect(prompt).toContain("cleanReading");
    expect(prompt).not.toContain('"id":"teacher"');
    expect(prompt).not.toContain('"id":"paragraph-1"');
    expect(prompt).not.toContain("englishLevel");
    expect(prompt).not.toContain("shortDescription");
  });

  test("服务端用短 key 组装真实 ID 和身份锚点，AI 只提供创意字段", () => {
    const plan = parseCourseVisualPlanResponse(JSON.stringify(aiResponse), input);

    expect(plan.characterDesigns.map((item) => item.characterId)).toEqual(["teacher", "jett", "sage", "sprite"]);
    expect(plan.characterDesigns[0]?.visualAnchor).toEqual({ mode: "reference", label: "Ms. Lin", context: null });
    expect(plan.characterDesigns[1]?.visualAnchor).toEqual(expect.objectContaining({ mode: "semantic", label: "Jett" }));
    expect(plan.characterDesigns[1]?.appearanceDescription).toContain("白色短发");
    expect(plan.characterDesigns[0]?.courseAppearance).toContain("深蓝色户外夹克");
    expect(plan.characterDesigns[3]?.visualAnchor).toEqual({ mode: "description", label: "Wind Sprite", context: null });
    expect(plan.cover.characterIds).toEqual(["teacher", "jett", "sage"]);
    expect(plan.shots[0]).toEqual(expect.objectContaining({ paragraphId: "paragraph-1", characterIds: ["teacher", "jett", "sage"] }));
  });

  test("忠实模式的引用角色缺少资料关联时明确失败，不降级成 description", () => {
    const brokenInput: CourseVisualPlanPromptInput = {
      ...input,
      characters: input.characters.map((character) => character.id === "jett" ? { ...character, reference: null } : character),
    };

    expect(() => parseCourseVisualPlanResponse(JSON.stringify(aiResponse), brokenInput)).toThrow("AI 返回的视觉方案内容不完整，请重试");
    try {
      parseCourseVisualPlanResponse(JSON.stringify(aiResponse), brokenInput);
    } catch (error) {
      expect(error).toBeInstanceOf(CourseVisualPlanResponseError);
      expect((error as CourseVisualPlanResponseError).diagnostics.issues?.[0]?.message).toContain("引用角色，但缺少有效参考资料关联");
    }
  });

  test("解析时要求每个角色只有一份课程级视觉设定并逐段覆盖正文", () => {
    const plan = parseCourseVisualPlan(rawPlan, input);
    expect(plan.characterDesigns).toHaveLength(4);
    expect(plan.shots).toHaveLength(1);
    expect(plan.characterDesigns.find((item) => item.characterId === "jett")?.visualAnchor).toEqual({ mode: "semantic", label: "Jett", context: "VALORANT game character" });
  });

  test("确定性清理 AI 的无害额外字段和过长描述后再校验", () => {
    const plan = parseCourseVisualPlan({
      ...rawPlan,
      explanation: "unused",
      visualStyle: `Bright style ${"detail ".repeat(100)}`,
      characterDesigns: rawPlan.characterDesigns.map((design) => ({ ...design, unused: true, visualAnchor: { ...design.visualAnchor, unused: true } })),
      cover: { ...rawPlan.cover, unused: true },
      shots: rawPlan.shots.map((shot) => ({ ...shot, unused: true })),
    }, input);

    expect(plan.visualStyle.length).toBeLessThanOrEqual(500);
    expect(Reflect.has(plan, "explanation")).toBe(false);
    expect(Reflect.has(plan.characterDesigns[0], "unused")).toBe(false);
  });

  test("知名角色只注入名称与作品，参考人物只注入图片身份规则", () => {
    const plan = parseCourseVisualPlan(rawPlan, input);
    const prompt = compileCourseImagePrompt(plan, plan.cover, "cover", [
      { characterId: "teacher", characterKey: "C01", chineseName: "林老师", englishName: "Ms. Lin", referenceIndex: 1 },
      { characterId: "jett", characterKey: "C02", chineseName: "捷特", englishName: "Jett" },
      { characterId: "sage", characterKey: "C03", chineseName: "贤者", englishName: "Sage" },
    ]);

    expect(prompt).toContain("C01 — 林老师 / Ms. Lin");
    expect(prompt).toContain("use reference image 1 for identity only");
    expect(prompt).toContain("body build, face shape, facial features, hairstyle, hair color, glasses");
    expect(prompt).toContain("C02 — 捷特 / Jett");
    expect(prompt).toContain("C03 — 贤者 / Sage");
    expect(prompt).toContain("角色形象：白色短发");
    expect(prompt).not.toContain("invent a long physical description");
  });

  test("视觉方案刚返回且人物参考尚未加载时也能先保存场景 Prompt", () => {
    const plan = parseCourseVisualPlan(rawPlan, input);

    const prompt = compileCourseImagePrompt(plan, plan.cover, "cover", [
      { characterId: "teacher", characterKey: "C01", chineseName: "林老师", englishName: "Ms. Lin" },
      { characterId: "jett", characterKey: "C02", chineseName: "捷特", englishName: "Jett" },
      { characterId: "sage", characterKey: "C03", chineseName: "贤者", englishName: "Sage" },
    ]);

    expect(prompt).toContain("C01 — 林老师 / Ms. Lin");
    expect(prompt).toContain("requires the identity reference image selected for this character");
  });

  test("真实人物使用语义锚点时不再伪造作品名，年龄变化留给逐段场景", () => {
    const beethovenInput: CourseVisualPlanPromptInput = {
      ...input,
      storyTitle: "Beethoven's Life",
      characters: [{ id: "beethoven", displayName: "贝多芬", englishName: "Ludwig van Beethoven", sourceType: "referenced", reference: { name: "贝多芬生平", type: "historical_person", summary: "讲述贝多芬从青年到晚年的经历。" }, roleInStory: "historical subject" }],
      chapters: [{ id: "chapter-1", order: 1, title: "Young Beethoven", paragraphs: [{ id: "paragraph-1", cleanReading: "As a young man, Beethoven practices at the piano." }] }],
    };
    const plan = parseCourseVisualPlan({
      visualStyle: rawPlan.visualStyle,
      storyWorld: "Historically grounded Europe.",
      characterDesigns: [{ characterId: "beethoven", visualAnchor: { mode: "semantic", label: "Ludwig van Beethoven", context: "historical composer" }, appearanceDescription: "深色卷发，面部轮廓鲜明。", courseAppearance: "符合场景时代的欧洲服装。" }],
      cover: { focus: "Beethoven's musical life.", characterIds: ["beethoven"], sceneDescription: "Young Beethoven sits at a piano." },
      shots: [{ paragraphId: "paragraph-1", focus: "Practice.", characterIds: ["beethoven"], sceneDescription: "A young Beethoven practices at the piano in period clothing." }],
    }, beethovenInput);
    const prompt = compileCourseImagePrompt(plan, plan.shots[0], "illustration", [{ characterId: "beethoven", characterKey: "C01", chineseName: "贝多芬", englishName: "Ludwig van Beethoven" }]);
    expect(prompt).toContain("Ludwig van Beethoven (historical composer)");
    expect(prompt).toContain("A young Beethoven practices");
    expect(prompt).not.toContain("from historical composer");
    expect(prompt).not.toContain("canonical character design");
  });

  test("原创化尽量保留视觉语言，同时描述性转换引用身份和专有世界元素", () => {
    const prompt = buildCourseVisualPlanPrompt({ ...input, mode: "originalized", baselinePlan: rawPlan });
    expect(prompt).toContain("visualLabel is required only for sourceType=referenced characters");
    expect(prompt).toContain("Preserve the baseline visual language, composition, atmosphere, color direction, materials, character relationships, and scene actions as closely as possible");
    expect(prompt).toContain("Translate reference-dependent identities, named world elements, and signature visual combinations into self-contained descriptive designs");
    expect(prompt).toContain("Broad archetypal resemblance and a similar emotional impression are acceptable");
    expect(prompt).toContain("sourceType=person or sourceType=original");
    expect(prompt).toContain('"baselineVisualPlan"');
    expect(prompt).toContain("Use the new visual labels consistently");
  });

  test("服务端合并原创化结果，采用描述性画风和世界，同时保留非引用角色和出场关系", () => {
    const generated = parseCourseVisualPlan({
      visualStyle: "The same bright cinematic picture-book language with clean shapes and soft winter light.",
      storyWorld: "An unnamed northern mountain kingdom with an enchanted snow bridge and a distant warning tower.",
      characterDesigns: [
        { ...rawPlan.characterDesigns[0], courseAppearance: "被误改的人物造型。" },
        { characterId: "jett", visualAnchor: { mode: "description", label: "Sky Runner", context: null }, appearanceDescription: "银白短发，青色护目镜。", courseAppearance: "青色夹克、深灰长裤和白色短靴。" },
        { characterId: "sage", visualAnchor: { mode: "description", label: "Jade Warden", context: null }, appearanceDescription: "墨绿长发，佩戴圆形玉饰。", courseAppearance: "米白长袍、墨绿腰带和灰色短靴。" },
        { ...rawPlan.characterDesigns[3], courseAppearance: "被误改的原创角色造型。" },
      ],
      cover: { focus: "The new heroes enter the garden.", characterIds: ["jett"], sceneDescription: "Sky Runner and Jade Warden enter the garden." },
      shots: [{ paragraphId: "paragraph-1", focus: "Opening the path.", characterIds: ["jett"], sceneDescription: "Sky Runner opens an air path while Jade Warden protects the teacher." }],
    }, input);

    const merged = mergeOriginalizedVisualPlan(rawPlan, generated, input.characters);

    expect(merged.visualStyle).toBe(generated.visualStyle);
    expect(merged.storyWorld).toBe(generated.storyWorld);
    expect(merged.characterDesigns[0]).toEqual(rawPlan.characterDesigns[0]);
    expect(merged.characterDesigns[1]?.visualAnchor.label).toBe("Sky Runner");
    expect(merged.characterDesigns[3]).toEqual(rawPlan.characterDesigns[3]);
    expect(merged.cover.characterIds).toEqual(rawPlan.cover.characterIds);
    expect(merged.shots[0]?.characterIds).toEqual(rawPlan.shots[0]?.characterIds);
    expect(merged.shots[0]?.sceneDescription).toContain("Sky Runner");
  });

  test("原创化角色的图片 Prompt 只使用新视觉名称，不泄露原作名称", () => {
    const plan = parseCourseVisualPlan({
      ...rawPlan,
      characterDesigns: rawPlan.characterDesigns.map((design) => design.characterId === "jett" ? {
        characterId: "jett",
        visualAnchor: { mode: "description" as const, label: "Sky Runner", context: null },
        appearanceDescription: "银白短发，青色护目镜。",
        courseAppearance: "青色夹克、深灰长裤和白色短靴。",
      } : design),
      shots: [{ ...rawPlan.shots[0], sceneDescription: "Sky Runner opens an air path." }],
    }, input);
    const prompt = compileCourseImagePrompt(plan, plan.shots[0], "illustration", [{
      characterId: "jett",
      characterKey: "C02",
      chineseName: "捷特",
      englishName: "Jett",
      useVisualLabel: true,
    }]);

    expect(prompt).toContain("C02 — Sky Runner");
    expect(prompt).not.toContain("Jett");
    expect(prompt).not.toContain("捷特");
  });

  test("服装字段明确排除身份、动作、姿势、表情和能力", () => {
    const prompt = buildCourseVisualPlanPrompt(input);
    expect(prompt).toContain("courseAppearance is required for every character and must be concise Simplified Chinese");
    expect(prompt).toContain("one fixed head-to-toe course-wide continuity specification");
    expect(prompt).toContain("upper garment, lower garment, footwear, and any outer layer");
    expect(prompt).toContain("exact main and secondary colors");
    expect(prompt).toContain("material or pattern");
    expect(prompt).toContain("Do not use vague placeholders such as 'classic outfit'");
    expect(prompt).toContain("restate every visible clothing component and its exact color palette");
    expect(prompt).toContain("characterAppearance is required for every non-person character");
    expect(prompt).toContain("It must be concise Simplified Chinese");
    expect(prompt).not.toContain("courseClothingAndProps");
    expect(prompt).not.toContain("stableAppearance");
    expect(prompt).toContain("Never put identity, age, face, body, personality, expression, action, pose, gaze, ability, environment");
  });

  test("老师学生本课造型必须根据故事世界设计，不默认现代教师装或运动装", () => {
    const prompt = buildCourseVisualPlanPrompt(input);
    expect(prompt).toContain("For sourceType=person, derive course clothing and props from the supplied story title and cleanReading together with the storyWorld you create");
    expect(prompt).toContain("Do not default teachers to modern teacher clothing or students to generic sportswear");
    expect(prompt).toContain("adapt their clothing to that world while preserving identity from the reference image");
  });

  test("视觉方案要求简短字段，避免大模型返回无意义的超长 JSON", () => {
    const prompt = buildCourseVisualPlanPrompt(input);
    expect(prompt).toContain("visualStyle <= 80 words");
    expect(prompt).toContain("each courseAppearance <= 90 Chinese characters");
    expect(prompt).toContain("each sceneDescription <= 90 words");
  });

  test("最终图片 Prompt 将本课造型作为跨封面和章节的固定连续性规格", () => {
    const plan = parseCourseVisualPlan(rawPlan, input);
    const prompt = compileCourseImagePrompt(plan, plan.shots[0], "illustration", [
      { characterId: "teacher", characterKey: "C01", chineseName: "林老师", englishName: "Ms. Lin" },
    ]);

    expect(prompt).toContain("Character continuity lock");
    expect(prompt).toContain("Keep garment types, exact colors, materials, patterns, footwear, and portable props identical across the cover and every lesson illustration");
    expect(prompt).toContain("本课造型：深蓝色户外夹克、舒适长裤和防滑鞋。");
    expect(prompt).toContain("Scene text must not override this specification unless it explicitly describes a costume change");
  });

  test("AI 返回截断或缺字段时转换为可安全重试的业务错误", () => {
    let failure: unknown;
    try { parseCourseVisualPlanResponse('{"visualStyle":"storybook"', input); }
    catch (error) { failure = error; }

    expect(failure).toBeInstanceOf(CourseVisualPlanResponseError);
    expect(failure).toMatchObject({
      message: "AI 返回的视觉方案内容不完整，请重试",
      diagnostics: { kind: "invalid_json", responseCharacters: 26, responseEndsWithClosingBrace: false },
    });
  });

  test("结构校验失败会记录具体字段路径，排查不依赖完整 AI 原文", () => {
    let failure: unknown;
    try { parseCourseVisualPlanResponse('{"visualStyle":"storybook"}', input); }
    catch (error) { failure = error; }

    expect(failure).toMatchObject({
      diagnostics: {
        kind: "invalid_structure",
        issues: expect.arrayContaining([expect.objectContaining({ path: "storyWorld" })]),
      },
    });
  });

  test("未知短 key 严格失败并记录具体分镜位置，不静默过滤或补齐", () => {
    let failure: unknown;
    try {
      parseCourseVisualPlanResponse(JSON.stringify({
        ...aiResponse,
        shots: [{ ...aiResponse.shots[0], characterKeys: ["C01", "C99"] }],
      }), input);
    } catch (error) { failure = error; }

    expect(failure).toMatchObject({
      diagnostics: {
        kind: "invalid_semantics",
        issues: [expect.objectContaining({ path: "semantic_validation", message: expect.stringContaining("shots[P01].characterKeys[1] = C99") })],
      },
    });
  });

  test("AI 遗漏角色设定或段落分镜时严格失败，不生成默认兜底", () => {
    const diagnosticMessage = (response: unknown) => {
      try { parseCourseVisualPlanResponse(JSON.stringify(response), input); }
      catch (error) { return error instanceof CourseVisualPlanResponseError ? error.diagnostics.issues?.[0]?.message : null; }
      return null;
    };
    expect(diagnosticMessage({ ...aiResponse, characterDesigns: aiResponse.characterDesigns.slice(0, 3) })).toContain("角色设定未完整覆盖允许 key");
    expect(diagnosticMessage({ ...aiResponse, shots: [] })).toContain("分镜未完整覆盖允许 paragraphKey");
  });

  test("AI 缺少老师本课形象或课程角色中文外貌时严格失败", () => {
    const diagnosticKind = (response: unknown) => {
      try { parseCourseVisualPlanResponse(JSON.stringify(response), input); }
      catch (error) { return error instanceof CourseVisualPlanResponseError ? error.diagnostics.kind : null; }
      return null;
    };
    expect(diagnosticKind({
      ...aiResponse,
      characterDesigns: aiResponse.characterDesigns.map((design) => design.characterKey === "C01" ? { ...design, courseAppearance: undefined } : design),
    })).toBe("invalid_structure");
    expect(diagnosticKind({
      ...aiResponse,
      characterDesigns: aiResponse.characterDesigns.map((design) => design.characterKey === "C02" ? { ...design, characterAppearance: null } : design),
    })).toBe("invalid_semantics");
  });

  test("AI 重复角色或段落短 key 时严格失败", () => {
    const diagnosticMessage = (response: unknown) => {
      try { parseCourseVisualPlanResponse(JSON.stringify(response), input); }
      catch (error) { return error instanceof CourseVisualPlanResponseError ? error.diagnostics.issues?.[0]?.message : null; }
      return null;
    };
    expect(diagnosticMessage({
      ...aiResponse,
      characterDesigns: [...aiResponse.characterDesigns.slice(0, 3), { ...aiResponse.characterDesigns[2], characterKey: "C03" }],
    })).toContain("characterDesigns.characterKey[3] = C03 重复出现");
    expect(diagnosticMessage({
      ...aiResponse,
      shots: [aiResponse.shots[0], { ...aiResponse.shots[0] }],
    })).toContain("shots.paragraphKey[1] = P01 重复出现");
  });

  test("封面和插图使用不同模板，角色定义含键和中英文名而 Scene 保持自然文本", () => {
    const plan = parseCourseVisualPlan(rawPlan, input);
    const prompt = compileCourseImagePrompt(plan, plan.shots[0], "illustration", [
      { characterId: "teacher", characterKey: "C01", chineseName: "林老师", englishName: "Ms. Lin", referenceIndex: 1 },
      { characterId: "jett", characterKey: "C02", chineseName: "捷特", englishName: "Jett" },
      { characterId: "sage", characterKey: "C03", chineseName: "贤者", englishName: "Sage" },
    ]);

    expect(prompt).toContain("Narrative illustration for one lesson paragraph");
    expect(prompt).toContain("C01 — 林老师 / Ms. Lin");
    expect(prompt).toContain("Scene: Jett opens a wind path while Sage protects the teacher.");
    expect(prompt).not.toContain("Scene: C01");
    expect(prompt).toContain("Keep every named character fully inside the canvas");
    expect(prompt).not.toContain("ensemble long shot");
    expect(prompt).not.toContain("GPT Image 2 prompt");
    expect(prompt).not.toContain("COURSE VISUAL STYLE LOCK");
  });

  test("五名及以上角色自动使用远景群像构图", () => {
    const plan = parseCourseVisualPlan(rawPlan, input);
    const characters = Array.from({ length: 5 }, (_, index) => ({
      characterId: input.characters[index % input.characters.length]!.id,
      characterKey: `C0${index + 1}`,
      chineseName: `角色${index + 1}`,
      englishName: `Character ${index + 1}`,
    }));
    const prompt = compileCourseImagePrompt(plan, { ...plan.cover, characterIds: characters.map((item) => item.characterId) }, "cover", characters);
    expect(prompt).toContain("ensemble long shot");
    expect(prompt).toContain("all 5 visible characters");
  });

  test("拒绝遗漏正文、遗漏角色设定或使用未知角色", () => {
    expect(() => parseCourseVisualPlan({
      ...rawPlan,
      characterDesigns: rawPlan.characterDesigns.slice(0, 1),
      cover: { ...rawPlan.cover, characterIds: ["unknown"] },
      shots: [],
    }, input)).toThrow();
  });
});
