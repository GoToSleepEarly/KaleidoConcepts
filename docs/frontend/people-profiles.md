# 人物档案模块说明

## 模块目标

将原学生列表升级为人物档案，用于维护教案生成和图片生成会引用的人物基础信息。

本期支持两类人物：
- 教师
- 学生

## 命名决策

模块名使用 `人物档案`。

原因：
- 当前需求本质不是组织人员管理，而是 AI 生成内容中的人物素材库。
- 教师和学生都可能出现在教案、绘本和插图里。
- 后续如增加助教、家长或故事角色，可以继续扩展 role。

## 页面入口

- 路由：`/people`
- AppShell 导航：`人物档案`
- AppShell header 标题：`人物档案`

本期不保留 `/students` 旧路由。

原因：
- 当前产品未上线，不需要兼容旧入口。
- 保留旧路由会让模块命名继续混乱。

## 本期范围

包含：
- 人物档案列表
- 教师 / 学生 role 过滤
- 顶部 Tab 仅保留学生和老师
- 新增人物
- 编辑人物
- 右侧抽屉表单
- 空状态
- 数据库持久化
- `GET /api/people`
- `POST /api/people`
- `PUT /api/people/:id`

不包含：
- 删除
- 归档
- 头像上传
- 教师登录账号绑定
- 多教师权限
- 课程创建流程改造
- 教师人物在 prompt 中的实际使用

## 数据模型

使用统一 `Person` 表，而不是 `TeacherProfile` + `Student` 两张表。

原因：
- 本期教师和学生都是 AI 生成内容中的人物档案。
- 课程生成后续需要统一读取 teacher + students。
- 页面也是一个统一的资料库，只按 role 过滤。

```ts
type PersonRole = "teacher" | "student";

type PersonProfile = {
  id: string;
  role: PersonRole;
  name: string;
  chineseName?: string;
  englishName?: string;
  age?: number;
  gender?: "male" | "female";
  appearance?: string;
  interests: string[];
  learningGoal?: string;
  notes?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};
```

## 字段规则

### 教师

必填：
- 名称

非必填：
- 性别
- 外貌描述
- 备注

### 学生

必填：
- 中文名
- 英文名
- 年龄
- 性别
- 外貌描述

非必填：
- 兴趣爱好
- 学习目标
- 备注

## 页面结构

顶部：
- 左侧说明：`维护教案和插图生成会引用的人物资料。`
- 右侧按钮：`新增人物`

过滤：
- `学生`
- `老师`

列表：
- 使用卡片网格
- 教师卡片展示名称、性别、外貌描述、备注
- 学生卡片展示中英文名、年龄、性别、外貌描述、兴趣、学习目标、备注

## 新增 / 编辑抽屉

抽屉标题：
- 新增人物
- 编辑人物

新增时可以选择类型：
- 教师
- 学生

编辑时类型不可修改。

原因：
- role 变更会影响字段语义。
- 如果把学生改成教师，课程历史引用会变得难解释。

## API 合同

### `GET /api/people`

可选 query：

```text
role=teacher | student
```

响应：

```ts
{
  people: PersonProfile[];
}
```

失败：
- `500 { message: "人物档案加载失败" }`

### `POST /api/people`

请求：

```ts
PersonInput
```

响应：

```ts
201 { person: PersonProfile }
```

失败：
- `400 { message: "人物信息不完整" }`
- `500 { message: "人物保存失败" }`

### `PUT /api/people/:id`

请求：

```ts
PersonInput
```

响应：

```ts
{ person: PersonProfile }
```

失败：
- `400 { message: "人物信息不完整" }`
- `404 { message: "人物不存在" }`
- `500 { message: "人物保存失败" }`

## 验收标准

- `/people` 显示人物档案页面
- AppShell 导航显示 `人物档案`
- 本期不保留 `/students`
- 页面顶部 Tab 仅显示学生 / 老师，默认进入学生
- 可新增教师，字段包含名称、性别、外貌描述、备注
- 教师未上传头像时按性别使用默认教师头像，男老师使用男老师默认头像
- 可新增学生，字段包含中文名、英文名、年龄、性别、外貌描述、兴趣、学习目标、备注
- 可编辑教师和学生
- 编辑时不能修改人物类型
- 数据写入真实数据库
- 学生旧数据迁移到 `Person(role=student)`
- seed 中包含至少 1 个教师和 2 个学生
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：已实现，待用户验收
- 实现提交：待记录
- 实现内容：
  - `/people` 人物档案页面
  - `GET /api/people`
  - `POST /api/people`
  - `PUT /api/people/:id`
  - Prisma `Person` / `CoursePerson` migration
  - seed 默认教师档案和按性别区分的默认教师头像
- 验证命令：
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
- 验证结果：
  - test 通过，5 个测试文件 / 10 个测试
  - lint 通过
  - build 通过
  - 本地数据库已迁移，旧 Student 数据已迁移为 `Person(role=student)`
