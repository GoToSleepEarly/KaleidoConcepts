# 默认头像升级说明（生成式头像）

## 模块目标

去掉当前按性别塞入的默认 PNG 头像，改为社媒风格的生成式头像：**随机纯色背景 + 名称首字 + 性别小角标**。人物一多时默认 PNG 难以区分，生成式头像稳定、可区分、零素材维护成本。

## 现状

- 创建人物时，`lib/server/repositories/people.ts` 在 `avatarUrl` 为空时按性别塞 `/mock-assets/*.png`（`defaultStudentAvatars` / `defaultTeacherAvatars`）。
- 渲染点仅两处：
  - `features/people/components/people-manager.tsx`（列表卡片）
  - `features/courses/components/course-basic-form.tsx`（选人卡片）
- seed 里给默认人物写死了 PNG 路径。

## 设计决策（用户确认）

- 名称关键字：**统一取中文名首字**
  - 学生：`chineseName` 首字
  - 教师：`name` 首字（教师无独立 chineseName，`name` 即显示名，可能是中文如“林老师”或英文如“Ms. Lin”，取第一个字符）
- 性别标识：**右下角小角标图标**（♂ / ♀），无性别时不显示角标
- 背景：由人物 `id` 稳定哈希映射到一个纯色调色板，同一人物永远同色；纯色不随性别变化（性别只体现在角标）

## 实现方式

不再往 DB 写默认 PNG。`avatarUrl` 字段保留，语义收敛为“真实上传的头像 URL”，本期恒为空（无上传入口）。头像在前端**按需渲染**，不落库。

新增共享组件 `components/person-avatar.tsx`：

```tsx
type PersonAvatarProps = {
  name: string;        // 已在外部按 role 取好显示名
  gender?: "male" | "female";
  seed: string;        // 用 person.id 做稳定哈希
  avatarUrl?: string;  // 有真实头像则优先展示
  size?: number;       // 默认 56
  className?: string;
};
```

逻辑：
1. `avatarUrl` 存在 → 直接渲染 `<Image>`（保留未来上传能力）
2. 否则渲染纯色圆 + 首字 + 角标：
   - 背景色：`palette[hash(seed) % palette.length]`，调色板取 8–10 个饱和度适中的纯色（避开与紫色主色冲突过近的色）
   - 首字：`Array.from(name.trim())[0]`，白色、居中、字号随 size 缩放
   - 角标：右下角小圆，`male` 用蓝底 ♂、`female` 用粉底 ♀，用 lucide 或 unicode 符号；`gender` 为空则不渲染

调色板与哈希放在组件内或 `lib/avatar.ts`，保证 SSR / CSR 一致（纯函数，无随机数）。

## 改造点

- `components/person-avatar.tsx`：新增组件
- `features/people/components/people-manager.tsx`：`PersonCard` 头像替换为 `<PersonAvatar>`，删除 `UserRound` 兜底
- `features/courses/components/course-basic-form.tsx`：`PersonChoiceCard` 头像替换为 `<PersonAvatar>`，删除灰圆兜底
- `lib/server/repositories/people.ts`：`toPersonData` 不再塞默认 PNG，`avatarUrl` 为空即存 null
- `lib/mock/assets.ts`：删除 `defaultStudentAvatars` / `defaultTeacherAvatars`（确认无其他引用后）
- `prisma/seed.ts`：移除写死的 `avatarUrl` PNG（默认人物走生成式头像）
- 可选清理：`public/mock-assets/*.png` 默认头像文件

契约不变（`avatarUrl?` 保留）。历史数据处理（用户确认）：seed 里加一次 `updateMany`，把历史默认 PNG 路径（`/mock-assets/*.png` 那几个）清成 null，让全部人物统一走生成式头像。真实上传的头像 URL 不受影响。

## 验收标准

- 新建教师 / 学生后，头像为纯色背景 + 中文名首字 + 性别角标
- 同一人物头像颜色稳定不变
- 无性别的教师不显示角标
- 人物档案页与新建课程选人卡片头像一致
- DB 中新建人物 `avatarUrl` 为 null，不再写入 PNG
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：方案待用户确认
- 实现提交：待记录
