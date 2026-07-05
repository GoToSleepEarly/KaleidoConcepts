# 登录与学生真实后端模块说明

> 该文档为历史模块记录。`2026-07-04` 起，学生列表已升级为 `人物档案` 模块，当前实现以 `docs/frontend/people-profiles.md` 为准。

## 模块目标

将登录和学生列表从前端 mock / localStorage 测试数据推进到真实后端数据。

## 本期范围

登录包含：
- 教师账号从数据库读取
- `/api/auth/login` 校验数据库用户
- 登录响应保持前端现有 session 结构

学生包含：
- 学生列表从数据库读取
- 新增学生写入数据库
- 编辑学生更新数据库
- 前端移除 `localStorage` 测试持久化

不包含：
- 注册
- 忘记密码
- 多角色权限
- HttpOnly cookie session
- 学生删除 / 归档
- 头像上传

## 关键决策

### 登录仍保留浏览器 session 存储

原因：
- 本期目标是把账号校验变成真实后端数据
- 完整认证体系涉及 cookie、过期、刷新、CSRF 和服务端鉴权，不是本模块最小闭环
- 当前受保护页面仍按既有前端 session 规则验收

后续真实认证接入时：
- 未勾选记住我：session cookie
- 勾选记住我：长有效期 HttpOnly cookie

### 学生数据以数据库为准

移除前端 `localStorage` 测试持久化。

原因：
- 学生是课程创建的上游实体
- 前端本地数据会造成课程创建和后端数据不一致
- 失败后无法恢复真实状态

## API 合同

### `POST /api/auth/login`

请求：

```ts
{
  username: string;
  password: string;
}
```

响应：

```ts
{
  user: {
    displayName: string;
  };
  createdAt: string;
}
```

失败：
- 账号或密码错误：`401 { message: "账号或密码错误" }`

恢复策略：
- 登录失败不写 session
- 用户可修改账号密码后重试

### `GET /api/students`

响应：

```ts
{
  students: StudentProfile[];
}
```

失败：
- 数据库不可用：`500 { message: "学生列表加载失败" }`

恢复策略：
- 查询不修改数据，可刷新或点击重试

### `POST /api/students`

请求：

```ts
{
  chineseName: string;
  englishName: string;
  age: number;
  gender: "male" | "female";
  interests: string[];
  learningGoal?: string;
  notes?: string;
}
```

响应：`201 { student: StudentProfile }`

失败：
- 字段不完整：`400 { message: "学生信息不完整" }`
- 数据库写入失败：`500 { message: "学生保存失败" }`

恢复策略：
- 写入失败不关闭抽屉
- 用户可修改后重试

### `PUT /api/students/:id`

请求同新增。

响应：`{ student: StudentProfile }`

失败：
- 字段不完整：`400 { message: "学生信息不完整" }`
- 学生不存在：`404 { message: "学生不存在" }`
- 数据库写入失败：`500 { message: "学生保存失败" }`

恢复策略：
- 写入失败不关闭抽屉
- 原列表数据不做乐观覆盖

## 验收标准

- 登录接口从数据库用户校验
- `teacher / 123456` 可登录
- 错误账号密码返回 `账号或密码错误`
- 学生列表从 `GET /api/students` 加载
- 新增学生调用 `POST /api/students`，成功后使用后端返回数据更新列表
- 编辑学生调用 `PUT /api/students/:id`，成功后使用后端返回数据更新列表
- 前端不再使用 `kaleido.mock.students`
- API 共享同一数据源，不再出现路由级内存数组分裂
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：已实现登录 / 学生 API 的服务端仓库与路由接入；Prisma npm 依赖安装因 registry 请求失败暂未完成
- 实现提交：待记录
- 验证命令：
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
- 验证结果：
  - test 通过，5 个测试文件 / 9 个测试
  - lint 通过
  - build 通过
  - 学生前端已移除 `localStorage` 测试持久化
  - 登录后端已移除固定 `mockAuth` 常量
  - runtime 连接真实数据库前仍需安装 Prisma 依赖并执行迁移 / seed
