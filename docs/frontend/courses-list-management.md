# 课程列表管理模块说明

## 模块目标

本模块覆盖 MVP 的课程列表管理首页，入口为 `/courses`。

本期目标是让教师能基于真实后端数据查看已创建课程，并进入编辑或预览。

## 本期范围

包含：
- 课程列表管理页面
- 课程空状态
- 课程状态展示
- 课程基础信息展示
- 课程绑定老师展示
- 课程编辑入口
- 课程预览入口
- `GET /api/courses` 后端接口
- Prisma 数据模型与查询映射
- 开发种子数据

不包含：
- 新建课程 Step 1-5 的开发
- 课程删除
- 课程归档
- 搜索和筛选
- 批量操作
- 服务端 PDF 渲染
- 图片生成流程
- 状态筛选

## 页面结构

AppShell header 显示 `课程列表`，内容区不重复大标题。

内容区顶部：
- 左侧说明：`管理已生成和制作中的课程。`
- 右侧按钮：`新建课程`

课程列表：
- 有数据时使用表格型列表
- 无数据时显示空状态
- 不做搜索和状态筛选

采用表格型列表的原因：
- 课程是管理对象，未来会扩展状态、时间、学生、操作等字段
- 相比卡片更适合扫描和比较

## 课程字段

列表展示：
- 课程标题
- 老师
- 学生
- 英语等级
- 主题
- 课程状态
- 更新时间
- 操作：编辑 / 预览

老师规则：
- 本期按单课程单老师处理
- 后台数据可继续用 `CoursePerson` 存储老师和学生关系
- `GET /api/courses` 对课程关联的 `role=teacher` 人物取第一个作为列表老师

原因：
- 教案和插图生成需要一个明确老师形象
- 多老师会让 prompt、列表展示和课程编辑状态变复杂，不适合本期 MVP

状态：
- `draft`：草稿
- `building_resources`：生成资源中
- `ready`：已完成
- `build_failed`：生成失败

## API 合同

### `GET /api/courses`

响应：

```ts
type CoursesListResponse = {
  courses: CourseListItem[];
};

type CourseListItem = {
  id: string;
  title: string;
  teacherName: string | null;
  studentNames: string[];
  englishLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  theme: string;
  status: "draft" | "building_resources" | "ready" | "build_failed";
  updatedAt: string;
};
```

失败：
- 数据库不可用：`500 { message: "课程列表加载失败" }`

恢复策略：
- 列表查询不修改状态，可直接刷新重试
- 页面保留错误提示和重试按钮

## 数据边界

本期使用 PostgreSQL + Prisma。

开发环境通过 seed 写入真实数据库测试数据，不再从前端 `localStorage` 或组件 mock 生成课程列表。

## 验收标准

- `/courses` 从 `GET /api/courses` 加载数据
- 课程列表不再直接引用 `mockCourse`
- 空数据时显示空状态
- 接口失败时显示错误提示和重试入口
- 列表展示标题、老师、学生、等级、主题、状态、更新时间
- 课程编辑入口当前跳转 `/courses/:id/create/basic`
- 课程预览入口跳转 `/courses/:id`
- 操作区只出现编辑 / 预览
- 本期不出现删除、归档、搜索、筛选、批量操作
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：已按本轮对齐结果更新实现，待用户验收
- 实现提交：待记录
- 验证命令：
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
- 验证结果：
  - test 通过，6 个测试文件 / 13 个测试
  - lint 通过
  - build 通过
  - `/courses` 页面返回 200
- `/api/courses` 返回 `teacherName`

## 后续优化

- 课程编辑入口后续应根据课程当前所属步骤跳转到对应创建流程页面；当前 MVP 先统一进入基础信息页。
