# 移动端与 iPad 适配：第一阶段

## 目标

第一阶段覆盖核心课程闭环：

- 登录
- AppShell 全局导航与账号菜单
- 课程列表
- 课程创建六步的公共步骤导航
- Step 1 基础信息
- Step 2 故事大纲
- Step 3 教学规划
- Step 4 文案与练习
- Step 5 视觉资源
- Step 6 预览发布
- 通用 Dialog

本阶段不重做 PC Web 端布局交互。PC 端已有侧栏、顶部栏、桌面步骤条和各工作台主结构保持原规则；如后续发现必须调整 PC 结构，需要先重新确认。

## 设备范围

重点验收：

- 手机竖屏：`375x812`、`390x844`、`430x932`
- 小屏兜底：`360x800`
- iPad 竖屏：`768x1024`、`820x1180`
- iPad 横屏：`1024x768`、`1180x820`
- PC：`1366x768`、`1440x900`、`1920x1080`

手机横屏不做专项体验，只要求页面不崩溃、不产生主流程横向滚动、核心操作可达。

## 硬性规则

- 主流程不得依赖横向拖动屏幕才能完成操作。
- 固定操作区不得遮挡关键输入、错误提示或下一步按钮。
- 所有主要操作在手机、iPad、PC 上都必须可达。
- 触屏主要操作目标不小于 `44x44px`。
- 弹窗在手机端必须落在安全区内，内容可纵向滚动，按钮不越界。
- 文案不得压缩到不可读，不用缩小字号掩盖布局不足。
- PC 已确认交互不随移动适配改变。

## 适配策略

采用断点分层重排：

- PC：保留现有布局和交互。
- iPad 横屏：尽量保留 PC 工作台结构，降低局部密度。
- iPad 竖屏：减少并列面板，主任务优先。
- 手机竖屏：单栏、顶部导航、当前步骤摘要、可展开步骤列表、底部安全操作区。

## 已实现边界

### AppShell

- 手机和 iPad 竖屏使用顶部菜单按钮打开全高侧滑导航。
- 桌面 `lg` 及以上继续使用左侧栏，不改现有 PC 导航。
- 移除了手机底部四 Tab 导航，避免和课程步骤底部操作区争抢空间。
- 手机顶栏标题区允许收缩，副标题在窄屏隐藏；课程步骤入口保留在顶栏第二行，账号菜单 44 px 触控区不会被挤出屏幕。

### 课程步骤导航

- `lg` 以下（手机与 iPad 竖屏）显示“第 n / 6 步 + 当前步骤名称”的摘要按钮。
- 点击摘要后展开纵向步骤列表。
- 已到达步骤可点击，未解锁步骤禁用，当前步骤不可重复点击。
- `lg` 及以上（含 iPad 横屏与 PC）保留原六列步骤条。

### Dialog

- 手机端 modal 改为底部安全区内的 sheet 布局。
- drawer 在手机端使用全屏高度，避免右侧抽屉在窄屏越界。
- 弹窗内容区继续内部滚动，焦点管理、Esc 和遮罩关闭规则不变。

### 登录

- 手机端改为单栏登录任务，不再要求 `440px` 最小工作区宽度。
- 桌面和 iPad 横屏继续保留插画 / 登录区域的原分屏规则。
- 手机端保留背景氛围但弱化插画，不把表单压入不可用宽度。

### Step 2 故事大纲

- 手机和 iPad 竖屏使用“聊天 / 结果”分段切换，`lg` 及以上保留原双栏工作台。
- 小屏结果面板使用独立纵向滚动，长大纲的确认入口不得被固定高度容器裁掉。

### Step 6 预览发布

- 桌面保留画布左侧、样式栏右侧。
- `lg` 以下改为画布在上、样式栏在下，避免右栏压缩 16:9 画布。
- 小屏下画布高度降低到可操作区间，分页和样式控件继续可达。

### Step 4 文案与练习

- 结果生成后，手机和 iPad 竖屏不再强制进入左右双栏；页面使用“对话 / 预览”分段切换，默认先显示预览，减少为了找到输入区或预览页而来回长距离滑动。
- `lg` 及以上继续使用原双栏工作台和两侧独立滚动，避免影响当前 Web 端与 iPad 横屏流程。
- 小屏下创作对话区限制可用高度并保留内部滚动，输入区持续处在同一任务块底部；预览区保持单页画布、分页和修改当前页操作可达。
- 手机端顶部只保留短状态与“重开”入口，较长的重新生成操作保留在 `sm` 及以上，避免顶部动作区挤占预览画布。
- 预览一级 Tab、二级 Tab 和“对话 / 预览”切换均改为横向不换行轨道；章节较多时只在控件内部横向滚动，不把章节 Tab 挤到第二行。
- 底部上一步 / 下一步操作条在 `xl` 以下改为普通文档流位置，不再悬浮覆盖聊天输入框；桌面端继续使用 sticky 底栏。

### Step 5 视觉资源

- 手机和 iPad 竖屏新增“流程 / 角色 / 封面 / 章节图片”阶段切换，避免所有视觉模块在窄屏一次性展开成超长页面。
- 已生成视觉方案但封面未确认时，小屏默认进入“封面”；桌面 `lg` 及以上继续展示完整纵向模块，不改变 Web 端信息总览。
- 章节图片继续保留章节横向 Tab 和跳转章节入口；小屏阶段切换只控制主模块可见性，不改变图片版本、编辑、重试和历史版本的业务操作。
- 顶部桌面操作组在手机端收起为紧凑“高级”入口，底部负责主流程前后跳转，减少首屏操作区高度。
- 阶段 Tab、角色分类 Tab 和章节图片 Tab 统一为横向不换行轨道；长文案如“章节图片”不再换行导致布局增高。
- Step 5 底部操作条在 `xl` 以下改为普通文档流位置，避免遮挡图片生成、上传和弹窗触发区域；桌面端继续 sticky。

### 课程列表

- 手机端搜索框和搜索按钮允许上下排列，避免 360 px 宽度下搜索按钮挤压输入框。
- 手机端课程行操作区改为“编辑 / 预览或授课 / 删除”的固定三列，前两项占满可用宽度，所有操作保持至少 44 px 触控尺寸。
- 分页区允许换行，小屏下总数与翻页控件分行显示，翻页按钮保持 44 px 触控尺寸，避免底部操作挤出屏幕。

## 后续检查重点

后续实现继续按以下顺序补齐页面细节：

1. Step 1 人物选择、知识点选择和底部下一步操作区。
2. Step 2 / Step 4 双栏聊天工作台在手机端的主次切换。Step 4 已处理，待继续复核 Step 2 复杂对话状态。
3. Step 3 章节列表与配置区在 iPad 竖屏和手机端的折叠关系。
4. Step 5 图片版本、角色列表和章节图片导航的触屏可达性。已增加阶段切换，待继续复核图片编辑弹窗和上传场景。
5. 课程列表在 `360px` 宽度下的操作按钮换行和分页区不越界。已处理，待浏览器复核。

## 验证命令

当前第一批公共适配已验证：

```bash
pnpm exec vitest run components/app-shell.test.tsx components/ui/dialog.test.tsx features/courses/components/course-create-steps.test.tsx
pnpm exec vitest run app/login/page.test.tsx features/courses/components/course-preview-workspace.test.tsx
```

实现状态：第一批公共骨架与登录 / Step 6 响应式基础已实现，待浏览器验收。

2026-08-24 继续补齐：

```bash
pnpm exec vitest run features/courses/components/course-content-workspace.test.tsx features/courses/components/courses-manager.test.tsx
```

实现状态：Step 4 小屏和 iPad 竖屏改为顺序任务流，`lg` 以上保留双栏；课程列表手机搜索、行操作和分页已补换行与触控尺寸约束。

2026-08-24 Step 4 / Step 5 继续优化：

```bash
pnpm exec vitest run features/courses/components/course-content-workspace.test.tsx features/courses/components/course-visual-resources-workspace.test.tsx
pnpm exec tsc --noEmit
pnpm lint
```

浏览器验证：课程 `cmsya6viz0003vmm7n1g85vm3` 在 `430x932`、`768x1024`、`1024x768`、`1440x900` 检查 Step 4 与 Step 5，未发现页面横向溢出；底部下一步操作条可见；Step 4 手机 / iPad 默认显示预览，Step 5 手机 / iPad 默认显示封面，桌面端保持完整展开。

2026-08-24 Step 4 / Step 5 顶部、底部与 Tab 换行修复：

```bash
pnpm exec vitest run features/courses/components/course-content-workspace.test.tsx features/courses/components/course-visual-resources-workspace.test.tsx
pnpm exec tsc --noEmit
pnpm lint
```

实现状态：Step 4 小屏顶部动作压缩、底部栏不再覆盖输入框，预览章节 Tab 不换行；Step 5 阶段 Tab、角色分类和章节图片导航统一不换行，底部栏在小屏不再悬浮遮挡操作区。

## 2026-08-24 Code Review

本轮审查补充修复：

- Step 2 小屏结果面板改为独立滚动，长大纲底部的确认入口可达。
- 小屏课程步骤浮层支持 `Escape` 关闭，并限制高度、允许内部滚动。
- 新增的 Step 3 / Step 4 / Step 5 / Step 6 核心移动控件统一为至少 44 px 触控高度。
- AI 偶发返回数组形式的剧情目标时，文本按空格拼接，避免英文或无标点片段黏连。

分支自身验证：

```bash
pnpm test -- --run
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm exec eslint <本分支全部变更的 TS/TSX 文件>
pnpm build
```

结果：68 个测试文件、554 个测试全部通过；TypeScript、目标 ESLint 和生产构建通过。浏览器只读检查覆盖 `390x844`、`768x1024`、`1024x768`、`1440x900`；可加载页面未发现主流程横向溢出，手机与 iPad 竖屏显示折叠步骤导航，iPad 横屏与 PC 保留桌面侧栏和六步导航。

### 与 master 集成结果

已完成与 `origin/master` 的语义合并：鉴权、Step 4 固定槽位生成、图片失败恢复、PDF 导出与故事大纲状态恢复以 master 为准；移动分支保留响应式布局、触控尺寸和小屏导航行为。

合并后验证：

```bash
pnpm prisma:generate
pnpm exec prisma migrate status
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

结果：数据库 schema 已是最新状态；74 个测试文件、593 个测试全部通过；TypeScript、ESLint 与生产构建通过。浏览器回归覆盖课程列表、Step 2、Step 3、Step 5、Step 6，并在 `390x844`、`768x1024`、`1024x768`、`1440x900` 四种视口下验证：没有页面崩溃或主文档横向溢出，桌面端布局保持原有断点行为。

本地开发库曾残留实验分支写入的 `haoai_gpt_image_2` / `easy88ai_gpt_image_2` 图片 provider，正式 schema 不接受这些值，导致 Step 5 服务端读取失败。已在本地库的 `local_recovery.course_image_provider_20260824` 备份 4 条原值，再按当前账号的 `crazyrouter` 网关映射为 `crazyrouter_gpt_image_2`；该修复仅作用于本地数据，不修改正式 schema 或生产迁移。
