# 应用框架与登录模块前端实现说明

## 模块范围

本模块只覆盖 MVP 的 Web 端应用框架与登录流程。

包含：
- 登录页
- 登录状态 mock 管理
- 受保护路由规则
- Web 端 AppShell
- 左侧导航
- 顶部 header
- 用户菜单与退出登录

不包含：
- 移动端 / App 端适配
- 真实后端认证
- 未实现页面占位
- 课程创建、学生列表、课程列表的业务细节

## 产品与品牌

- 产品名称：`Kaleido Concepts`
- 登录页主标题：`Kaleido Concepts 万象之境`
- 登录页副标题：`AI 定制互动绘本英语项目`
- 登录页中文诗句：`万象为镜，照见奇思。`
- 登录页英文诗句：`Where wonders take shape.`

## 登录页

### 页面结构

登录页独立展示，不进入 AppShell。

采用左右分栏布局：
- 左侧：品牌文案与视觉图
- 右侧：登录表单

### 登录视觉图规范

登录页左侧使用本地生成图片。

图片方向：
- 7-10 岁中性学生
- 学生作为主角
- 从现实学习空间进入打开的绘本故事世界
- 高级绘本插画风格
- 温暖、有探索感
- 可有克制紫色点缀
- 不出现文字、logo、UI 面板、机器人、老师

### 表单字段

登录表单包含：
- 账号输入框
- 密码输入框
- 记住我 checkbox
- 密码显示 / 隐藏按钮
- 登录按钮
- 错误提示

不包含：
- 忘记密码
- 注册账号

### Mock 登录账号

- 账号：`teacher`
- 密码：`123456`
- 登录后用户显示名：`教师账号`

### 错误提示

账号或密码错误时，提示文案：

`账号或密码错误`

## 登录状态

本期使用 mock session，不接真实认证。

登录流程：
- 前端调用 mock `/api/auth/login`
- mock 接口校验固定账号密码
- 登录成功后保存 mock session

存储规则：
- 未勾选“记住我”：session 存入 `sessionStorage`
- 勾选“记住我”：session 存入 `localStorage`
- 访问受保护页面时，先检查 `sessionStorage`，再检查 `localStorage`
- 退出登录时，两者都清除

后续真实后端接入时，迁移方向：
- 未勾选：session cookie
- 勾选：更长有效期的 HttpOnly cookie

## 路由规则

### 默认路由

- 访问 `/`
  - 未登录：跳转 `/login`
  - 已登录：跳转 `/courses`

### 登录页

- 访问 `/login`
  - 未登录：显示登录页
  - 已登录：跳转 `/courses`

### 受保护页面

受保护页面包括：
- `/students`
- `/courses`
- `/courses/new`
- `/courses/[id]`
- `/courses/[id]/pdf`

未登录访问任意受保护页面：
- 跳转 `/login`

登录成功后：
- 统一进入 `/courses`
- 不返回原目标路径

### 退出登录

退出登录后：
- 清除 `sessionStorage`
- 清除 `localStorage`
- 跳转 `/login`

## AppShell

### 端适配范围

MVP 只考虑 Web 端。

不做：
- 移动端底部 Tab
- 移动端专项布局
- App 端专项适配

### 布局

采用 Web 后台型布局：
- 左侧固定 sidebar
- 右侧主内容区
- 主内容顶部 header

尺寸：
- sidebar 宽度：`240px`
- top header 高度：`72px`
- 内容区不设置统一最大宽度
- 页面基础边距：`24px / 32px`，具体页面可按业务调整

内容宽度策略：
- AppShell 不设置统一 max-width
- 学生列表、课程列表默认全宽
- 表单页、编辑器页、预览页由页面自行控制宽度和布局

### Sidebar

sidebar 顶部显示：

`Kaleido Concepts`

导航项仅保留：
- 学生列表
- 课程列表

不保留：
- 资源库
- 我的收藏
- 回收站
- 其他未实现入口

当前导航高亮：
- 浅紫背景
- 左侧 `3px` 紫色指示条
- hover / active 动效 150-200ms

### Header

主内容顶部 header：
- 左侧显示当前页面标题
- 右侧显示用户菜单

顶部标题规则：
- `/students`：学生列表
- `/courses`：课程列表
- `/courses/new`：新建课程
- `/courses/[id]`：课程预览
- `/courses/[id]/pdf`：PDF 预览

不做面包屑。

原因：
- 当前层级浅
- header 标题已能表达当前位置
- 面包屑会增加视觉噪音

### 导航高亮规则

- `/students`：高亮学生列表
- `/courses`：高亮课程列表
- `/courses/new`：高亮课程列表
- `/courses/[id]`：高亮课程列表
- `/courses/[id]/pdf`：高亮课程列表

### 用户菜单

右上角显示：
- 头像圆点
- `教师账号`

点击后展开下拉菜单。

菜单项仅包含：
- 退出登录

不把“退出登录”作为常驻按钮。

原因：
- 顶部区域更干净
- 退出登录是低频操作
- 后续可扩展账号设置等内容

## 基础视觉规范

- 页面背景：`#F7F8FB`
- 主内容卡片：白色
- 边框：浅灰 `#E5E7EB`
- 主色：克制紫色系
- 字体：系统字体，不额外引入字体包
- 圆角：以 `8px` 为主
- 阴影：轻阴影，仅用于浮层、菜单、关键卡片
- 主按钮：紫色实心
- 次按钮：白底灰边框
- 退出 / 危险操作：红色文字或 hover 状态
- hover / active 动效：150-200ms

## 设计原则

本模块参考 `$gpt-taste` 的适用原则：
- 视觉高级、克制
- 字体层级清晰
- 间距有呼吸感
- 按钮和导航对比明确
- 避免横向滚动
- 避免廉价装饰标签

不采用其营销页式规则：
- 不做 Landing Hero
- 不做 AIDA 结构
- 不做重 GSAP 动效
- 不做大面积滚动 pinning
- 不做过度 bento

原因：
- 当前是后台型 Web App，不是营销官网
- 工具型产品优先保证效率、稳定和可维护性

## 验收标准

实现完成后，需要满足：

- 未登录访问 `/` 跳转 `/login`
- 未登录访问受保护页面跳转 `/login`
- 已登录访问 `/login` 跳转 `/courses`
- 输入 `teacher / 123456` 可以登录
- 错误账号密码显示 `账号或密码错误`
- 未勾选“记住我”时使用 `sessionStorage`
- 勾选“记住我”时使用 `localStorage`
- 刷新后登录状态按存储规则保持
- 退出登录后清除两类存储并回到 `/login`
- 登录后默认进入 `/courses`
- sidebar 只显示学生列表、课程列表
- `/courses/new`、`/courses/[id]`、`/courses/[id]/pdf` 均高亮课程列表
- header 标题随路由正确变化
- 页面不出现未实现入口
- Web 端布局不出现横向滚动
- 登录页不出现忘记密码、注册账号
- 登录页左侧图片符合学生进入绘本世界的视觉方向

## 实现记录

- 实现提交：`6a6340b Implement app shell and mock authentication`
- 登录页：已实现
- Mock 登录 API：已实现 `/api/auth/login`
- 受保护路由：已实现
- Web AppShell：已实现
- 学生列表入口：已提供最小 mock 列表，具体业务细节待学生列表模块讨论
- 课程列表入口：已提供最小 mock 列表，具体业务细节待课程列表模块讨论

验证命令：

- `pnpm lint`
- `pnpm test`
- `pnpm build`

验证结果：

- lint 通过
- test 通过
- build 通过
- `/login`、`/courses`、`/students`、`/courses/new`、`/api/auth/login` HTTP 检查通过
- 登录页 Edge headless 截图检查通过
