# Grammar in Use 语法知识库

## 文档状态

- 状态：已实现，待用户验收。
- 本文档是语法知识点来源、合并规则、只读知识库、课程选择器和下游语法上下文的唯一契约。
- `docs/frontend/preset-library.md` 只负责主题灵感、故事类型和故事氛围，不再定义语法库。

## 模块目标

系统使用 Cambridge Grammar in Use 三册的官方目录作为语法知识点规范，让老师按熟悉的书、Section 和 Unit 快速选择，同时让课程全流程只依赖一个稳定知识点 ID。

本期不复制教材正文、讲解、例句或练习。知识库只保存和展示书目及目录层面的来源信息；正式商用导入完整目录前仍需完成版权与授权审查。

## 权威来源与书籍定位

系统分别收录三册，不跨册去重：

| 系统书籍 | 版本 | 官方定位 | 课程难度默认落点 |
| --- | --- | --- | --- |
| Essential Grammar in Use | Fourth Edition | A1–B1 | Starter / A1 / A2 |
| English Grammar in Use | Fifth Edition | B1–B2 | B1 / B2 |
| Advanced Grammar in Use | Fourth Edition | C1–C2 | C1 / C2 |

规则：

- 官方书名、版本、等级、Section、Unit 编号和 Unit 英文标题只来自可核验的 Cambridge 官方资料，不由 AI 生成或翻译。
- Starter 是本产品对零基础课程的兼容等级，其默认落到 Essential Grammar in Use 是产品规则，不宣称为 Cambridge 官方等级。
- B1 默认进入 English Grammar in Use；老师可手动切换到 Essential Grammar in Use。
- 难度只决定选择器首次打开的默认书籍，不锁定书籍，也不与书籍建立需要协同修改的强绑定。
- 一门新课程只能选择一本书中的知识点，不允许跨册混选。

官方核验入口：

- [Essential Grammar in Use, Fourth Edition](https://shop.cambridge.org/english/product/2700140115)
- [English Grammar in Use, Fifth Edition](https://shop.cambridge.org/english/product/2700199289)
- [Advanced Grammar in Use, Fourth Edition](https://shop.cambridge.org/english/product/2700216595)
- [English Grammar in Use, Fifth Edition contents](https://assets.cambridge.org/97811084/57651/toc/9781108457651_toc.pdf)
- [Cambridge copyright](https://www.cambridge.org/legal/copyright)
- [Cambridge rights and permissions](https://www.cambridge.org/gb/rights-and-permissions)

## 知识点定义与 Unit 合并

老师选择的是“系统知识点”，不是底层单个 Unit。每个系统知识点拥有一个稳定 `KnowledgePoint.id`，并保留一个或多个准确来源 Unit。

导入时只合并同一书籍版本、同一 Section 内连续出现，且官方标题仅在末尾以 `1 / 2 / 3 ...` 区分的 Unit。合并只去掉末尾序号，不改写其余英文文本。其他相似、重复或跨册标题不得自动合并。

示例：

```text
系统知识点：Present perfect and past
展示范围：Units 13–14
来源：
- Unit 13 · Present perfect and past 1
- Unit 14 · Present perfect and past 2
```

独立 Unit 也生成一个系统知识点，并只关联一个来源 Unit。

合并后的行为：

- 课程、故事推荐、教学规划、正文和练习都只保存系统知识点 ID。
- 覆盖校验以系统知识点为单位，不要求逐个覆盖其来源 Unit。
- 搜索同时匹配系统标题、Unit 编号和每个来源 Unit 的完整官方标题。
- 老师工作区可展开查看来源 Unit；学生内容不展示来源 Unit。
- 新版书籍作为新的 `GrammarBookEdition` 导入并创建新的知识点 ID，不原地改写旧版记录。

## 展示信息边界

知识库的持久化目录数据只包含权威英文信息，不保存：

- 人工校对或 AI 生成的中文名称。
- AI 生成的学习目标、交际功能、定义、例句、常见错误或教学建议。
- Cambridge 教材正文、讲解和练习。

教师工作区展示书名、版本、官方等级、Section 官方英文标题、系统知识点英文标题、Unit 范围，以及展开后的准确来源 Unit。

学生预览、授课页和 PDF 只展示系统知识点英文标题，不展示书名、版本、官方等级、Section 或 Unit 编号。

## `/grammar` 只读知识库

### 页面结构

- 页面展示三本书的入口，包含书名、版本和官方等级。
- AppShell 只显示“语法库”，不再重复解释系统内置、只读或点击展开等可由界面直接表达的信息。
- 所有书名使用《》包裹。书籍主 Tab、Section 子导航、Section 标题与知识点内容使用不同的背景、字号和字重层级。
- 书籍 Tab、Section 导航、搜索框、数量徽标和知识点选择态直接复用人物库 / 主题库现行视觉标准：`#5365EC` 品牌紫选中态、`#E9EEFF` 浅蓝导航底、`#CCD8F8` 结构边界和白色内容区；不能退化为灰色中性 Tab。
- 首次默认打开 English Grammar in Use；同一浏览器会话内返回页面时恢复最近查看的书。
- 当前书按官方 Section 浏览；列表使用紧凑行，不使用卡片墙。
- 每行展示 Unit 或 Unit 范围及系统知识点英文标题；可选择状态显示复选框，来源展开使用带“来源”文字的箭头按钮，不能只依赖颜色或 hover 表达操作能力。
- 不提供新增、编辑、删除、归档、排序或导入入口。
- 当前书完整加载，不分页。Section 用于缩小浏览范围，不把同一 Section 拆页。

### 搜索

- 搜索范围仅为当前书。
- 匹配系统知识点标题、单个 Unit 编号、Unit 范围和来源 Unit 官方标题。
- 搜索结果按官方 Section 分组，并保留展开来源的能力。
- 切换书籍时清空搜索词，避免把“无结果”误解为目录缺失。

### 响应式布局

- 桌面：左侧 Section 导航，右侧知识点列表。
- Pad 横屏：保持两栏；空间不足时缩窄 Section 导航。
- Pad 竖屏：Section 改为顶部选择控件，正文单栏。
- 手机：全屏单栏，书籍与 Section 使用顶部选择控件，来源 Unit 原位展开。
- 所有触控操作至少 44px；不依赖 hover；处理安全区、软键盘和横屏。

## 课程知识点选择器

### 入口与默认书籍

- Step 1 先读取课程难度并落到默认书籍；老师可以切换到其他书籍。
- 书籍切换只是本次课程选择，不反向修改课程难度。
- 已选择知识点后切换书籍，必须使用项目内确认弹窗说明将清空已选知识点；确认后同时切换书籍并清空，取消则保持原状态。
- 基础信息页回显已选书名、版本和紧凑知识点摘要。
- 基础信息页只说明书籍由难度自动推荐，不重复解释可切换、同册约束和筛选方式；这些规则由选择器状态和必要确认反馈表达。

### 桌面

使用大弹窗和三栏结构：

1. 官方 Section 导航。
2. 紧凑知识点列表，行内包含复选框、Unit 或 Unit 范围、英文标题。
3. 固定的已选区，展示全部跨 Section 选择，并提供移除与“仅看已选”。

不分页；搜索当前书并按 Section 分组。切换 Section 或搜索不会丢失选择。

### Pad 与手机

- Pad 横屏使用 Section + 列表两栏，已选内容放到右侧抽屉。
- Pad 竖屏把 Section 改为顶部控件，已选内容仍用抽屉。
- 手机使用全屏选择器，单栏列表，并提供“浏览 / 已选”两个视图。
- 手机底部固定“已选 N 项 / 确认”；考虑安全区和软键盘，不遮挡最后一项。
- 必测 iPhone Safari / 微信、iPad Safari / 微信横竖屏、Android Chrome、320px、768–1024px 和桌面宽度。

## 课程与下游语义

- Step 1 的 `knowledgePointIds` 表示老师希望本课程尽可能覆盖的范围，不承诺每项一定进入故事或练习。
- 不再区分核心知识点和拓展知识点，所有选择属于同一集合。
- Step 2 只能在 Step 1 选集内推荐；未推荐项由系统汇总并提示，不阻断大纲确认。
- Step 2 的推荐是初始分配建议，不是最终执行配置。
- Step 3 只能在 Step 1 选集内调整章节知识点；单章允许 0 个知识点，同一知识点允许分配到多章。
- Step 3 确认时，全课至少有 1 个知识点被实际分配到章节。未分配项允许保留，不阻断确认。
- 只有 Step 3 实际分配的知识点进入正文语法题、章节语法练习、课后语法练习和覆盖校验。
- 0 知识点章节只生成阅读与词汇内容，不生成语法题或章节语法练习。
- 正文可以自然出现未选择的其他语法结构；它们不作为本课程被考查知识点，也不参与覆盖校验。

## 数据结构

采用统一知识点主表，确保新旧课程和所有下游只处理一种 ID：

```ts
type KnowledgePoint = {
  id: string;
  source: "legacy" | "grammar_in_use";
  bookEditionId: string | null;
  sectionId: string | null;
  title: string;
  sortOrder: number;
};

type GrammarBookEdition = {
  id: string;
  title: string;
  edition: string;
  officialLevel: string;
  sortOrder: number;
};

type GrammarSection = {
  id: string;
  bookEditionId: string;
  officialTitle: string;
  sortOrder: number;
};

type GrammarKnowledgePointUnit = {
  knowledgePointId: string;
  unitNumber: number;
  officialTitle: string;
};
```

`Course` 增加：

```ts
type CourseGrammarSelection = {
  grammarBookEditionId: string | null;
  knowledgePointIds: string[];
};
```

数据库约束与服务端校验：

- `grammar_in_use` 知识点必须关联书籍版本和 Section，且至少关联一个来源 Unit。
- 同一书籍版本内 Unit 编号唯一；同一知识点的来源 Unit 必须属于同一书籍版本和 Section。
- 新课程必须提供有效 `grammarBookEditionId` 和至少一个知识点。
- 新课程的全部知识点必须为 `grammar_in_use`，且属于所选同一本书。
- 老课程允许 `grammarBookEditionId = null`，并只解析原有 `legacy` 知识点。基础信息接口按原 ID 回查包括已归档项在内的旧 `PresetOption` 名称和分类供只读展示，不自动映射、改名或写入 Grammar in Use 数据。
- 生产字段变更必须通过 Prisma migration；目录导入使用受控、可重复执行的内置数据脚本。

## API 合同

### `GET /api/grammar/catalog`

只读返回全部三册目录，不分页：

```ts
type GrammarCatalogResponse = {
  books: Array<{
    id: string;
    title: string;
    edition: string;
    officialLevel: string;
    sections: Array<{
      id: string;
      officialTitle: string;
      points: Array<{
        id: string;
        title: string;
        unitStart: number;
        unitEnd: number;
        units: Array<{
          unitNumber: number;
          officialTitle: string;
        }>;
      }>;
    }>;
  }>;
};
```

排序由服务端按书籍、Section、知识点和 Unit 的 `sortOrder / unitNumber` 固定返回。无 `POST / PUT / DELETE` 语法目录接口。

课程创建和基础信息更新接口增加 `grammarBookEditionId`，并继续接收 `knowledgePointIds`。服务端必须原子校验同册关系；失败时不写入部分选择。

## AI 上下文

后端通过统一的 `resolveGrammarContext` 为 Step 2、Step 4 及其修改、修复和重试构建上下文。每个被传入的知识点包含：

```ts
type ResolvedGrammarPoint = {
  key: string;
  knowledgePointId: string;
  title: string;
  bookTitle: string;
  edition: string;
  officialBookLevel: string;
  sourceUnits: Array<{
    unitNumber: number;
    officialTitle: string;
  }>;
};
```

同时传递 `courseEnglishLevel`。新增来源信息只增强已有 Prompt，不得覆盖或删减现有的故事自然度、英语正确性、叙事时间线、clean text、固定槽位、题量、覆盖、答案重建、校验、最小修复和重试规则。

AI 仍只返回 Prompt 内短键；服务端确定性映射为统一 `KnowledgePoint.id`。来源 Unit 是理解上下文，不是额外覆盖目标。

Step 4 为降低重复输入，同一任务只传一次书名、版本和官方难度；各章节或练习目标只重复其实际使用的知识点标题、Unit 范围和来源 Unit。目录信息用于唤起模型已有语法知识，不扩展为系统维护的知识点定义、例句、反例或教材讲解。

## 旧课程兼容

- 原 57 个语法点迁移为 `KnowledgePoint(source = "legacy")`，保留原 ID，确保旧正文、练习、预览和发布继续解析。
- 旧课程保证不再修改；不提供旧知识点到 Grammar in Use 的自动映射、升级入口或混合选择。
- 旧知识点不出现在 `/grammar`、新课程选择器或新教学规划选择器中。
- 旧课程保持只读查看、预览和发布能力；不得因目录替换而重写其内容或知识点 ID。

## 失败恢复

- 目录初始化失败时整次事务回滚，不留下半本书、孤立 Section 或无来源 Unit 的知识点。
- 内置目录缺失、版本不匹配或校验失败时，知识库和新课程选择器显示明确不可用状态；不得回退到旧 57 项供新课程使用。
- 切书确认前不改变选择；确认后书籍和清空选择一次完成。
- 基础信息保存遇到越界、跨册或不存在的知识点时返回 `400`，保留前端选择并定位问题。
- 旧课程解析必须走 legacy 路径；新目录不可用不得影响旧课程预览和发布。

## 验收标准

- `/grammar` 只展示三册官方英文目录数据，没有任何写操作或中文知识点名称。
- 每个系统知识点可追溯到准确 Unit；符合规则的连续 `1 / 2 / 3` Unit 只产生一个可选 ID。
- 难度只决定默认落点，老师可以切书；一门课程不能跨册混选。
- 桌面、Pad 和手机均能按书、Section、搜索和已选视图快速定位大量 Unit。
- Step 2 只推荐课程选集，允许未推荐；Step 3 只调整课程选集，允许空章节，但全课至少实际分配一个知识点。
- Step 4 只对实际分配的知识点生成和校验语法题；0 知识点章节仍能生成阅读和词汇内容。
- 教师工作区展示来源，学生预览、授课页和 PDF 只展示系统知识点英文标题。
- 旧课程无需映射即可继续查看、预览和发布；新课程看不到旧 57 项。

## 实现记录

- 实现状态：已完成代码、内置目录、数据库 migration、只读目录 API 与页面、课程选择器、Step 2–4 来源上下文、空章节规则、预览兼容和旧课程只读边界；待用户验收。
- 2026-08-26 界面优化：强化书籍主 Tab、Section 子导航、Section 标题和知识点列表的视觉层级；书名统一使用《》；选择行使用复选框，来源使用文字加箭头；精简知识库和 Step 1 说明；通用弹窗提升到 `z-modal`，不再被 AppShell 导航遮挡。
- 2026-08-26 颜色对齐：语法库与课程知识点选择器按人物库 / 主题库的实际组件标准统一为浅蓝结构区、品牌紫选中态和白色内容区，并同步其 Tab 圆角、间距和焦点反馈。
- 内置数据：三册共 365 个 Unit、52 个 Section，按已确认规则编译为 346 个系统知识点；导入时校验册内 Unit 数量和连续编号。
- 数据迁移：`prisma/migrations/20260826195000_add_grammar_in_use_catalog/migration.sql`；旧 57 项保留原 ID 并迁入 `KnowledgePoint(source = legacy)`。
- 验证命令：`pnpm test`（82 个测试文件、628 项通过）、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm build`、`pnpm prisma validate`；目录 migration 已通过生成器幂等性校验。
- 实现提交：`435d89a` (`feat: align grammar knowledge with Grammar in Use`)。
- 商用前置项：目录仅包含书目与目录级信息，仍须由业务方完成 Cambridge 版权与授权审查。
