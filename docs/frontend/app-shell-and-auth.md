# App Shell And Auth

## Scope

This module covers the MVP Web login flow and authenticated app shell.

Included:

- `/login`
- auth session storage
- protected route wrapper
- left sidebar navigation
- top header and account menu

Not included:

- registration
- password reset
- mobile app shell
- marketing landing page

## Login

The login page uses a generated local background image:

- `public/mock-assets/login-learning-lab.png`

Visible brand copy is intentionally limited to:

- `Kaleido Concepts`
- `万象为镜，照见奇思`
- `AI 定制互动绘本英语项目`

The login form includes:

- username
- password
- remember me
- show / hide password
- login button
- error message

### Login Visual Refactor

The login page is a product entry point, not a marketing landing page. Its visual hierarchy must remain limited to:

1. Kaleido Concepts brand
2. product proposition
3. login task

The selected background is a bright, soft 3D animated learning scene. It remains a single full-bleed visual beneath both the illustration and authentication regions. The characters and learning objects occupy the center-lower area, while the trailing side is progressively blurred and lightened to support the authentication group.

The main proposition is rendered on one line using the confirmed original punctuation:

```text
万象为镜，照见奇思
```

The supporting line remains:

- `AI 定制互动绘本英语项目`

The proposition remains on one line across supported landscape widths.

### Login Composition

The supported login surface is landscape Web only. It uses one continuous background with a functional content split:

- The leading region contains only the illustration. No brand, proposition, subtitle, form, or overlay copy may cover the children or learning objects.
- The trailing region contains the brand, proposition, subtitle, and form as one vertically centered group. The same background remains visible beneath a progressive blur and light overlay.
- At 960–1199 px, including iPad landscape, the split is 54% illustration / 46% authentication workspace.
- At 1200 px and above, the split is 62% illustration / 38% authentication workspace.
- The authentication workspace has a minimum usable width of 440 px. Its internal content width is 400–420 px and does not grow on ultra-wide displays.

Authentication workspace proportions:

- Brand lockup: horizontally centered and the largest typographic level; 56 px mark; 30–32 px bold wordmark; 14–16 px internal gap.
- Proposition: centered below the brand; exact text `万象为镜，照见奇思`; one line only; 26–30 px bold. It is the second-largest typographic level and must remain smaller than the brand wordmark.
- Supporting line: centered, 17–18 px medium weight, placed 10–12 px below the proposition. It is the third-largest typographic level.
- Brand-to-proposition gap: 22–26 px.
- Supporting-line-to-form gap: 28–32 px.
- Login surface: 400–420 px wide with 28–32 px internal padding. Inputs and submit button preserve their existing 48 px height.
- The complete authentication group is optically centered vertically. On short landscape viewports, reduce vertical gaps and surface padding before reducing type or control size.

Form-field presentation:

- Preserve the visible labels `账号` and `密码`; do not add placeholder or helper copy.
- Add `lucide:user-round` to the username input and `lucide:lock-keyhole` to the password input.
- Use 18 px outline icons in the same muted blue-gray tone. Icons sit inside the leading edge of each input with 14–16 px inset and do not replace labels.
- Input text starts after the icon with consistent optical spacing. The password visibility control remains on the trailing edge.
- Labels use 14 px semibold text and a darker neutral than the current body-gray treatment.

Illustration proportions:

- Fill the entire illustration region with `object-fit: cover` or equivalent background sizing.
- Shift the focal crop toward the source image's left side so the left boy's full face and silhouette remain visible. Use the dog and right-side empty space as the crop budget instead of cutting the left boy.
- At iPad landscape, losing peripheral planets, tools, or empty sky is acceptable; cropping a face, the book, or the dog is not.
- The illustration must remain bright and unmasked. Do not add a global dark overlay merely to support copy, because no copy is placed over it.

Illustration-to-workspace transition:

- The background image spans the full viewport; there is no independent solid-color panel boundary or visible dividing line.
- The workspace transition uses the same 96 px fade width, `#EEF6FB` endpoint, and linear opacity curve as the ultra-wide outer margins. Beginning at 56% of the viewport, the image and blur resolve into the stable workspace surface over exactly one transition band.
- The transition is broad and continuous: the source image remains recognizable beneath the right side while providing a stable, readable field behind the brand and form.
- Keep the children's faces and glowing book sharp on the leading side. The form itself remains an opaque white surface; text is never blurred.

Final focal positions:

- At 960–1199 px, use `cover` sizing with horizontal background position 42% so the leading boy remains fully visible and the principal pair is centered in the clear region.
- At 1200 px and above, cap the background canvas at a 16:9-equivalent width (`177.78dvh`) instead of continually enlarging and cropping it.
- When the viewport exceeds that canvas, center the image and fill both outer sides with a light-blue field that fades into the image over the final 96 px. Authentication content and its grid remain viewport-anchored and do not move.
- Begin the progressive blur no earlier than 56% of the viewport width, after the character group at supported landscape sizes.

The refactor removes:

- duplicated brand and proposition copy in the intermediate layout
- the decorative grid in the login area
- the cyan vertical rule
- the nested outer and inner login cards
- decorative glow used only to compensate for a small brand mark

The form uses one clear surface. Existing fields, labels, remember-me behavior, password visibility control, loading state, error state, and submit behavior remain unchanged.

No new visible explanatory copy may be added to the login page without prior product confirmation. The form relies on its existing labels and primary action instead of adding a redundant form heading or instructional subtitle.

### Login Responsive Behavior

Current scope intentionally excludes portrait composition:

- Supported viewport orientation: landscape only.
- Minimum target viewport: 1024 × 600.
- At 960–1199 px, use the 54/46 split.
- At 1200 px and above, use the 62/38 split.
- On short landscape viewports, reduce group spacing and login-surface padding; the submit button must remain visible without page scrolling.
- Text and controls remain inside safe-area insets.
- No separate mobile or App design is introduced.

Target verification sizes:

- 1024 × 768 (iPad landscape)
- 1024 × 600 (short landscape stress test)
- 1280 × 800
- 1366 × 768
- 1440 × 900
- 1920 × 1080

At every target size:

- the brand, proposition, form, and primary action are visible and correctly prioritized
- the proposition remains one line at every supported landscape size
- the illustration contains no overlaid copy or form elements
- the three children, dog, and glowing book remain legible after cropping
- the left boy's face and silhouette are not clipped while unused space to the dog's right is minimized
- the split edge reads as a soft transition rather than a hard background-color cut
- the brand is the largest type, the one-line proposition is second, and the supporting line is third
- no repeated brand or proposition copy is visible
- the page has no unintended horizontal scroll
- keyboard focus remains visible and the form preserves WCAG 2.1 AA contrast

### Login Data And API Boundary

This refactor is presentation-only. It does not change:

- `POST /api/auth/login`
- request or response contracts
- session persistence
- error recovery behavior
- authenticated redirects

Failed login attempts continue to preserve the entered account, password, and remember-me selection so the user can correct and retry.

### Login Refactor Status

- Selected background: confirmed (`login-learning-lab.png`)
- Landscape split composition specification: confirmed
- Frontend implementation: implemented, including continuous-background crop, progressive blur transition, hierarchy, and field-icon refinement
- Backend changes: not required
- Verification: passed at 1024 × 768, 1024 × 600, 1366 × 768, and 1920 × 1080; brand/proposition/supporting text resolve to 32/28–30/18 px; no page or workspace scrolling; no console errors
- Verification commands: `pnpm test -- app/login/page.test.tsx features/auth/components/login-form.test.tsx`, `pnpm exec eslint app/login/page.tsx app/login/page.test.tsx features/auth/components/login-form.tsx features/auth/components/login-form.test.tsx --max-warnings=0`, `pnpm build`
- Commit: not created

Default account:

- username: `teacher`
- password: `123456`

## Auth Behavior

- `/` redirects to `/login`
- successful login redirects to `/courses`
- protected pages redirect to `/login` when unauthenticated
- session is saved to `sessionStorage` or `localStorage` depending on remember-me
- “记住我”同时控制浏览器本地登录状态和 HTTP-only 身份 Cookie：勾选后两者统一保留 30 天，未勾选时两者都只保留到当前浏览器会话结束
- logout 调用 `POST /api/auth/logout` 清除服务端身份 Cookie，再清除两个浏览器存储并跳转 `/login`

## 客户端异常恢复与诊断

生产环境必须允许无法连接调试设备的用户自行恢复，并让管理员通过错误编号定位原始异常。

### 捕获范围

- 根目录 `instrumentation-client.ts` 在应用交互前注册全局监听，具体逻辑由 `registerClientErrorInstrumentation` 维护。
- 捕获浏览器运行时异常、未处理 Promise 异常，以及 `script` / `link` 等资源加载失败。
- `app/error.tsx` 捕获路由树客户端异常；`app/global-error.tsx` 兜底根布局异常。
- 同一个异常可能同时由浏览器监听器和 React 错误边界记录；保留两条记录，避免过早去重丢失资源或组件上下文。

### 上报契约

客户端调用 `POST /api/client-errors`，请求包含：

- 客户端生成的 `reportId`，格式为 `CE-YYYYMMDDTHHMMSS-xxxxxx`
- 异常类型、消息、堆栈、Next.js digest、当前 pathname
- 加载失败的资源 URL（如有；查询参数在客户端移除）
- User-Agent、视口、联网状态和发生时间
- `isSecureContext`、`crypto.randomUUID` 可用性
- `sessionStorage` / `localStorage` 读写探测结果及异常名称

隐私与失败边界：

- 不采集表单内容、密码、Cookie、Storage 实际值或页面查询参数。
- 服务端最大接受 32 KiB，请求字段有长度与类型校验。
- 客户端优先使用 `sendBeacon`，失败后使用 `keepalive fetch`；上报失败不得覆盖原始异常。
- 服务端以 `[CLIENT_ERROR]` 前缀写入进程标准错误日志，返回 HTTP 202 和原 `reportId`。
- 若网络本身不可用，上报可能失败；错误编号仍显示给用户，但日志中可能不存在该编号。

管理员通过以下命令查看生产日志，并使用错误编号筛选：

```bash
pm2 logs pbl-studio-v2 --lines 300
```

### 用户恢复

错误页只展示可执行信息，不展示内部异常：

1. `重新加载页面`：给当前 URL 添加一次性 `__retry` 参数并重新请求页面。
2. `清除登录状态并重试`：仅删除 `kaleido.mock.session`，然后返回登录页；Storage 本身不可访问时忽略清理异常并继续跳转。
3. `复制错误编号`：优先使用 Clipboard API，在 HTTP 等不可用环境下回退到选择复制。

清除操作不修改课程、人物、图片或数据库业务状态，只会要求用户重新登录。

### 实现状态

- 前端早期捕获、React 错误边界、恢复页和复制错误编号：已实现。
- `POST /api/client-errors` 与 PM2 结构化日志：已实现。
- 2026-08-20：错误编号 `CE-20260820T124656-wk0q31` 已确认 HTTP 下 Safari/微信 WebView 不提供 `crypto.randomUUID()`；浏览器请求 ID 已统一通过 UUID v4 兼容生成器创建，原生 API 不可用时回退到 `crypto.getRandomValues`，Web Crypto 完全不可用时再回退到随机字节。HTTPS 部署不在本次代码范围。兼容修复提交：`55b6739`。
- 2026-08-21：全局自动捕获覆盖运行时错误、未处理 Promise 异常和资源加载失败；同一资源错误 30 秒内去重，不新增用户反馈入口或关键交互自检。
- 验证：`pnpm test`（64 个文件 / 502 项测试）、`pnpm exec tsc --noEmit`、`pnpm lint` 与 `pnpm build` 均通过。
- 错误诊断提交：`7b421f8`。

## App Shell

The authenticated app shell uses a fixed left sidebar and a top header.

Sidebar routes:

- `/courses`
- `/people`
- `/themes`
- `/grammar`

Header:

- left: current page title and short subtitle
- right: single account menu with advanced settings and logout

There is no second account area in the sidebar.

## 账户高级设置

账户菜单提供“高级设置”，统一管理当前账号的 AI 模型、预置提供方和运行偏好，不允许老师输入任意 Base URL 或 API Key。弹窗使用“分类导航 + 单列详情”：桌面与 iPad 显示左侧分类导航，窄屏显示顶部分类选择；当前分类为“文本生成”和“图片生成”。新增分类只增加导航项，分类内新增设置沿纵向增加配置行，不再使用固定两列承载全部设置。

文本模型预置为 `gpt-5.5`、`gpt-5.6-sol` 和 `deepseek-v4-pro`。用户先选模型，再从该模型兼容的提供方中选择：GPT 模型可选择 QuickRouter 主站、QuickRouter 直连、Crazyrouter 或 Easy88AI；DeepSeek V4 Pro 只显示 DeepSeek。DeepSeek 使用 `https://api.deepseek.com`，原生兼容 OpenAI Responses API 并支持服务端执行 `web_search`，因此与 GPT 共用 `/responses` 请求和响应处理，只保留地址、密钥和上游模型名的预置差异，不再保留单独的 Chat Completions Adapter。

图片模型预置为 `gpt-image-2` 与 QuickRouter 专属 `gpt-image-2-c`。用户同样先选模型，再选择兼容提供方：`gpt-image-2` 可选择 QuickRouter 主站、QuickRouter 直连、Crazyrouter 或 Easy88AI；`gpt-image-2-c` 只显示 QuickRouter 主站和 QuickRouter 直连。2026-09-10 使用无效图片、无生成费用的请求验证 Easy88AI `POST /v1/images/edits`：单图 `image`、多图 `image[]`、项目现有的 portrait/landscape 尺寸与 low/medium 质量参数均被端点接收并进入上游图片校验，因此开放 Easy88AI 图片生成与编辑。

UI 中的每个提供方选项对应一条可执行的预置配置；QuickRouter 主站和 QuickRouter 直连作为两个并列选项呈现，不再增加“地址”层级。账户文本配置保存为 `writingProvider`、`aiGateway`、`quickRouterEndpoint`、`textReasoningEffort`、`textStreamingEnabled`、`textStreamFirstEventTimeoutSeconds`、`textStreamIdleTimeoutSeconds`、`textStreamMaxDurationSeconds`、`textNonStreamTimeoutSeconds`，图片配置保存为 `imageModel`、`imageGateway`、`imageQuickRouterEndpoint`、`imageQuality`；不保存 Base URL。服务端能力目录把稳定 ID 映射为白名单地址、密钥、协议 Adapter 和模型能力。环境变量只配置各提供方密钥和图片请求超时；文本模型、提供方、思考强度、流式返回、四个文本超时和图片质量全部由账户设置决定。

每次打开高级设置时，`GET /api/account/ai-gateway` 按 HTTP-only 身份 Cookie 从数据库读取全部账户 AI 设置。文本分类依次设置模型、提供方、思考强度、流式返回和超时保护；流式开启时展示首个响应事件、事件空闲和最长运行三个值，关闭时只展示非流式请求总时限，并提供一次恢复四项默认值的入口。图片分类依次设置模型、提供方和图片质量。模型变化后立即收窄兼容选项。`PATCH` 只接受目录中存在且兼容的组合，保存使用一次原子更新；任一显式字段无效、流式最长运行时间不大于首事件或空闲时间，或数据库写入失败时全部保持原值。加载完成前不得展示组件默认值，加载失败时保留未知状态并提供重新加载入口。

文本超时默认值为：首个有效 SSE 事件 120 秒、连续无有效 SSE 事件 180 秒、流式最长运行 1200 秒（20 分钟）、非流式总时限 600 秒（10 分钟）。可配置范围分别为 10–600 秒、10–600 秒、5–60 分钟和 1–30 分钟。首个事件从请求发出开始计时；收到任一可解析的 SSE 数据事件或显式 SSE 心跳后进入空闲计时，并在每次活动时重置；任意活动都不重置 20 分钟硬上限。只有 `response.completed` 才能成功。上述超时均按 `result_unknown` 保存，不自动重试可能已经计费的请求。

### 高级设置弹窗视觉与布局修复（2026-09-11，已实现，待用户验收）

本轮保留“分类导航 + 单列详情”和全部保存行为，只修复弹窗自身的布局、层级与控件状态。不得修改共享 `Dialog` 的默认尺寸或其他弹窗样式，避免把局部修复扩散到课程流程中的确认弹窗。

- 高级设置使用不超过 720 px、且不超过当前视口可用高度的有界弹窗；标题固定，配置内容在剩余高度内独立纵向滚动，保证字段增加后底部“保存设置”仍可到达。底部操作区紧跟当前分类内容，通过顶部分割线收口。
- 桌面与 iPad 的左侧导航宽度固定为 168 px，导航区与右侧配置区使用一条明确的纵向分割线；右侧按既有间距尺度保留配置标题、说明、字段和底部操作。窄屏继续使用顶部双分类，并改用底部分割线，不引入横向页面滚动。
- 左侧当前分类使用“2 px 主色指示条 + 极浅主色背景 + 主色图标”，未选项保持透明；不再用整块实色或同权重描边表达选中。分类名称使用 14 px semibold，说明使用 12 px regular，右侧配置标题高于字段标签，字段说明低于字段标签。
- 思考强度和图片质量继续使用等宽分段选择。外层使用中性浅底，选中项使用白色表面、轻边框和轻阴影，未选项为中性文字；只有底部“保存设置”保留实色主按钮。
- “取消”保持次级按钮；保存中只禁用控件并在主按钮内显示状态，不用遮罩覆盖整个内容区。

“流式返回”开关使用独立的 44 × 44 px 最小点击区域，视觉轨道固定为 40 × 24 px，圆点固定为 18 px，轨道左右各保留 3 px 内边距：关闭位置 `x=3`，打开位置 `x=19`，两态都不得越出轨道。关闭态为浅灰轨道、白色圆点和轻边框；打开态为极浅紫色轨道、主紫色圆点，不使用整条纯紫轨道。位置变化与颜色变化同时表达状态，并继续由 `aria-checked` 提供语义。

验收至少覆盖文本/图片分类切换、长短内容高度变化、流式开关开关两态、保存中、加载失败，以及 1024 × 768、1280 × 800、1366 × 768 和窄屏布局。切换分类不得造成弹窗宽度变化；开关圆点不得裁切、越界或因缩放产生错位。

实现记录：高级设置采用有界高度和 192 px 分栏，补充分割与选中层级；流式开关按 40 × 24 px 轨道、18 px 圆点及明确的开关位移实现，并新增两态回归测试。共享 `Dialog` 默认样式未修改。2026-09-11 新增超时字段后发现仅设置 `max-height` 无法约束内部 flex 滚动区，现由该弹窗显式使用有界高度，使内容区产生真实滚动并保持保存按钮可达。实现提交：`bb65789`。

### 高级设置信息层级二次优化（2026-09-11，已实现，待用户验收）

本轮只调整高级设置弹窗内部的信息层级和控件表达，不修改 168 px 左栏、弹窗宽度、分类结构、字段顺序、保存行为或共享 `Dialog`。目标阅读顺序为“弹窗标题 → 当前分类标题 → 字段标题 → 当前选项 → 辅助说明”。

- 桌面左侧导航降为辅助层：图标固定 16 px，分类名为 13 px medium，说明为 12 px regular；选中态继续使用浅紫背景和主色图标，但不使用与右侧标题相同的字重。窄屏顶部分类保留 14 px，以保证触控标签可读。
- 右侧分类标题使用 18 px semibold，分类说明使用 13 px；字段标题使用 13 px semibold，选项文字使用 14 px medium，辅助说明使用 12 px regular。字段组间距为 24 px，字段标题到控件为 8 px。
- “思考强度”和“图片质量”的分段容器使用可辨认的浅灰紫背景与轻边框；未选项透明，选中项使用白色表面、浅紫描边和主色文字，不使用实色紫色填充。控件总高度与下拉框保持 44 px。
- “流式返回”保留 `switch` 语义，但改为与其他字段一致的“标题与说明 + 44 px 控制行”。控制行使用轻边框，左侧显式展示“已开启”或“已关闭”，右侧保留 40 × 24 px Switch；两态继续同时使用位置、颜色、文字和 `aria-checked` 表达，不只依赖颜色。
- 不新增独立卡片、不改变业务文案含义，不修改 API、数据库和保存失败恢复策略。

验收覆盖文本与图片分类、思考强度和图片质量各选中态、流式开关两态、保存中禁用，以及桌面分栏和窄屏顶部分类。弹窗打开后，左侧分类不得与右侧分类标题抢层级，分段控件边界必须可辨，流式状态无需仅观察圆点位置即可理解。

实现记录：左侧分类图标和文字已降级，右侧分类标题、字段标题、选项和辅助说明已按五级层次收敛；思考强度与图片质量使用有明确边界的浅灰紫分段容器；流式返回改为标准字段节奏，并增加“已开启 / 已关闭”文字状态。新增文本与图片分类回归断言。验证通过目标测试、全量 92 个测试文件 / 783 项测试、目标 ESLint、`pnpm exec tsc --noEmit`、`pnpm build`、Impeccable 机械扫描、乱码扫描和 `git diff --check`；未进行浏览器验收。实现提交：`bb65789`。

### 高级设置主 Tab 与配置分组修正（2026-09-11，已实现，待用户验收）

上一轮把左侧分类误判为辅助导航，导致左右比重偏向右侧连续字段。本轮修正为“左侧主 Tab 决定配置领域，右侧在当前领域内按配置组阅读”：

- 桌面左栏由 168 px 调整为 192 px，使用统一浅灰紫底色；Tab 最小高度为 56 px，图标为 18 px，分类名为 14 px semibold，说明为 12 px regular。当前 Tab 使用与左栏底色有明确差异的浅色表面、边界和主色图标；左右分割线保留。
- 右侧一级标题继续使用 18 px semibold，一级说明使用 13 px regular。
- 文本生成拆为“模型配置”和“生成偏好”两个二级组；图片生成拆为“模型配置”和“输出质量”两个二级组。二级标题使用 14 px semibold，字段标题使用 13 px medium，选项文字使用 14 px medium，辅助说明使用 12 px regular。
- 二级组之间使用 24 px 间距和细分割线；组内字段间距为 16 px。分组依靠标题、间距和分割线表达，不增加嵌套卡片。
- 下拉框、分段控件和流式控制行继续统一为 44 px 高；“思考强度”和“流式返回”归入同一个“生成偏好”组。
- 窄屏继续使用顶部双 Tab，不强制 192 px 侧栏；DOM 与键盘顺序仍为分类导航在前、当前分类内容在后。

验收阅读顺序为“左侧选择文本或图片 → 右侧确认当前领域 → 通过二级标题定位配置组 → 修改字段”。本轮不修改设置字段、API、数据库、保存逻辑或共享 `Dialog`。

实现记录：桌面左栏已扩展为 192 px 浅灰紫主导航，Tab 使用 56 px 最小高度、18 px 图标、14 px semibold 分类名和明确的当前表面；文本生成已拆为“模型配置 / 生成偏好”，图片生成已拆为“模型配置 / 输出质量”，各组通过二级标题、24 px 节奏和分割线区分。新增左右比例与标题语义回归测试。验证通过目标测试、全量 92 个测试文件 / 783 项测试、目标 ESLint、`pnpm exec tsc --noEmit`、`pnpm build`、Impeccable 机械扫描、乱码扫描和 `git diff --check`；未进行浏览器验收。实现提交：`bb65789`。

对齐修复：桌面左栏不得在 Tab 与右侧分割线之间保留水平内边距。Tab 必须显式占满导航列宽，不能按文字内容收缩；其表面延伸至分割线，右侧圆角和自身右边框取消，由导航容器的分割线作为共同边界。窄屏顶部 Tab 保持原有间距与圆角。

本地启动与生产发布执行的幂等 seed 只负责创建预置账号和同步固定身份信息，不覆盖已有账号 AI 设置。每个新 AI 操作在服务端开始时读取账户配置并形成请求快照；账户选择的低、中、高思考强度覆盖业务步骤原有的固定强度。流式开关只改变应用服务器读取上游 Responses SSE 的方式，浏览器仍在完整校验后接收原有 JSON。修改只影响下一次新请求，运行中任务继续使用启动时配置，已有成果不清空、不改写。

2026-09-11：文本超时改为账户级唯一配置源。删除 `TEXT_GENERATION_TIMEOUT_MS` 与 `COURSE_CONTENT_GENERATION_TIMEOUT_MS` 的读取，Step 2–5 所有文本调用统一使用请求开始时的账户快照。流式响应由固定总时限改为首事件、事件空闲和 20 分钟硬上限三段保护；非流式保留 10 分钟总时限。高级设置按流式开关展示对应字段，并在前后端同时校验范围与跨字段关系。验证通过全量 92 个测试文件 / 788 项测试、ESLint、TypeScript、Prisma 校验、本地 migration deploy、生产构建、乱码扫描和 `git diff --check`。滚动修复后浏览器实测 1280 × 800：内容区可独立滚动，滚到底后保存按钮可见、可用并能正常完成保存；窄屏由同一视口高度约束和结构回归测试覆盖，本轮浏览器复测因本地登录态失效未完成。实现提交：`bb65789`。

所有线路均为显式手动切换，不在网络错误、429 或超时后自动向另一线路或模型重放请求。`gpt-image-2-c` 从 QuickRouter 的 429 隐式兜底改为主动可选模型；选择后生成与编辑固定使用 `high` 质量，并在界面说明其质量与计费特征。上游返回模型不存在或接口不兼容时按配置错误失败，不静默替换模型。

预置目录至少包含：QuickRouter 主站 `https://api.quickrouter.ai`、QuickRouter 直连 `https://api.quickrouter.us`、Crazyrouter `https://api.crazyrouter.com`、Easy88AI `https://api.easy88ai.com` 和 DeepSeek 官方地址。QuickRouter、Crazyrouter 与 Easy88AI 均使用独立的文本和图片密钥；DeepSeek 仅使用文本密钥。密钥只存在服务器环境，不进入 API 响应、数据库或 Git。QuickRouter 主站当前允许保留为可选线路，但外部可用性不作为本轮验收阻断项。

发版前先使用不产生生成费用的模型列表接口核对当前 Key 与模型 ID；不得为了验证而调用付费文本或图片生成。单元测试和 Provider 契约测试必须逐项覆盖模型别名、兼容矩阵、真实请求路径、请求体模型名、图片生成/编辑格式及禁止自动兜底。若外部 Key 或供应商状态导致免费检查失败，必须如实记录，不能宣称真实串联成功。

生产环境统一从项目根目录 `.env` 读取数据库、持久化图片目录和 AI 服务配置。`scripts/deploy-prod.sh` 在构建前加载该文件，并在重启已有 PM2 进程时使用 `--update-env`，确保新 Node 进程不沿用 PM2 保存的旧变量。生产 `.env` 不提交 Git，也不使用 `.env.local` 叠加覆盖。

实现状态：已实现账户菜单设置、登录同步、数据库字段、服务端路由选择和 GPT 文本/研究/图片 provider 分流；生产部署前执行 `pnpm prisma:deploy`。

2026-09-11：高级设置改为可扩展的分类导航与单列配置，iPad 维持主从布局，窄屏改为顶部分类选择。新增账户级文本思考强度、流式返回和图片质量；流式默认开启，默认文本提供方为 Easy88AI，默认图片模型为 `gpt-image-2-c`、图片线路为 QuickRouter。移除四个文本流式环境变量和课程级 `Course.visualQuality`；人物档案与 Step 5 统一读取账户图片质量，2-C 固定极高。已有图片保留实际质量记录，旧账号的标准图片模型初始化为高质量。验证通过全量 92 个测试文件 / 779 项测试、Prisma 校验与本地 migration deploy；浏览器设备验收待本地验收完成后补记。

2026-09-10：移除 QuickRouter、Crazyrouter、Easy88AI 和 DeepSeek 的模型环境变量，消除环境变量与高级设置两个模型来源。文本生成与联网研究现在统一使用账号选择的文本模型，图片生成、编辑和画质规则统一使用账号选择的图片模型；部署只要求各提供方密钥。共享主机与独立主机发布脚本都会在发布前检查所有可选提供方的对应能力密钥。验证通过全量 92 个测试文件 / 774 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、乱码扫描和 `git diff --check`；未调用外部 AI 接口。

2026-09-10：高级设置 UI 按“模型 → 提供方”重构。桌面端并列展示文本与图片，移动端纵向排列；QuickRouter 主站与直连改为两个平级提供方选项，删除第三层地址选择、真实 URL、“中转站”和独立联网文案。选择模型后只展示兼容提供方，`gpt-image-2-c` 仍只能选择 QuickRouter 主站或直连。保留现有数据库字段和服务端路由实现，不新增 migration。验证通过全量 92 个测试文件 / 773 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、桌面浏览器实测、乱码扫描和 `git diff --check`。

2026-09-10：高级设置拆分为当前账号的文本与图片配置；文本支持 `gpt-5.5`、`gpt-5.6-sol`、DeepSeek 官方直连及 QuickRouter/Crazyrouter/Easy88AI 预置线路，图片支持主动选择 `gpt-image-2` 或 QuickRouter 专属 `gpt-image-2-c`，不再在 429 后隐式换模型。Easy88AI 免费 `/v1/models` 检查鉴权成功并确认三个目标模型 ID；后续无效图片探测确认 `/v1/images/edits` 兼容项目所需参数，因此开放 Easy88AI `gpt-image-2` 图片线路。两次检查均未获得可用生成结果，不调用付费文本或图片生成。验证通过全量 92 个测试文件 / 772 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、本地 PostgreSQL `pnpm prisma:deploy`、乱码扫描、敏感信息扫描和 `git diff --check`。首轮实现提交：`feab432`；Easy88AI 图片线路提交：`2935242`。

2026-09-10：重新核对 DeepSeek 当前官方能力，确认 `https://api.deepseek.com/responses` 原生兼容 OpenAI Responses API，并支持服务端 `web_search`。账户选择 DeepSeek 后，文本准备、故事生成和联网研究统一走 DeepSeek 官方路线；界面不再展示不会生效的 GPT 中转站选项。免费 `/models` 实测当前 Key 包含 `deepseek-v4-pro`，无输入的 `/responses` 参数校验也成功到达官方端点；未执行付费生成。产品模型名、默认上游模型和环境变量示例统一改为 `deepseek-v4-pro`，迁移把历史 `deepseek-chat` 快照更新为新名称。验证通过全量 92 个测试文件 / 773 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、本地 PostgreSQL `pnpm prisma:deploy`、乱码扫描和 `git diff --check`。实现提交：`147be91`。

2026-09-10：DeepSeek 官方地址改为代码内预置，不再读取 `DEEPSEEK_BASE_URL`。部署环境只提供 `DEEPSEEK_TEXT_API_KEY`；即使服务器残留旧地址变量，请求也固定发往 `https://api.deepseek.com`。账户高级设置仍是模型与提供方的唯一选择来源。验证通过全量 92 个测试文件 / 774 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build` 和 `git diff --check`。

2026-09-10：所有提供方密钥统一按能力命名。Crazyrouter 与 Easy88AI 分别使用独立的文本、图片密钥，DeepSeek 使用 `DEEPSEEK_TEXT_API_KEY`；运行时和发布脚本均不读取三个旧的通用 Key，也不在文本与图片之间回退。验证通过全量 92 个测试文件 / 774 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build` 和 `git diff --check`；未调用外部 AI 接口。

2026-09-11（历史方案，现已废弃）：曾为四个文本提供方增加独立的服务端流式环境变量。该方案已被上方“账户级流式返回”设置取代，运行时不再读取这些环境变量；服务端仍负责聚合完整 SSE、执行结构校验，缺少完成事件时不保存部分正文且不自动重试可能已经计费的请求。

2026-09-10：重新核对 [DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/) 后修正旧判断。DeepSeek 官方 `/responses` 已兼容 Codex 所用的 OpenAI Responses 结构，并在服务端执行 `web_search`；项目删除单独的 `/chat/completions` 分支，文本生成和联网研究共用现有 Responses 处理。当前 Key 的免费 `/models` 返回并确认 `deepseek-v4-pro` 可用，本地环境也配置为该模型；无输入的 `/responses` 参数校验返回预期 400，没有触发生成或费用。高级设置选择 DeepSeek 后不再展示无效的 GPT 中转站控件，历史 `deepseek-chat` 数据通过 migration 更新为 `deepseek-v4-pro`，联网资料记录保存真实 research provider。实现提交待完成后记录。

2026-09-09：修复本地完整环境每次启动执行 seed 时覆盖已有账号中转站偏好的问题；已有账号 seed 更新不再包含三项可变 AI 设置。高级设置弹窗新增数据库读取 Loading 和可恢复失败态，读取完成前不再展示组件默认选项。验证通过全量 89 个测试文件 / 730 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、乱码扫描和 `git diff --check`。实现提交：`48369d7`。

2026-09-08：身份 Cookie 的 `Secure` 属性增加显式环境开关 `AUTH_COOKIE_SECURE`，登录与退出共用同一判断。未配置时保持原行为（生产启用、开发关闭）；仅在临时 HTTP 公网入口显式设为 `false`，启用 HTTPS 后恢复为 `true`。验证通过全量 88 个文件 / 717 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、乱码扫描和 `git diff --check`。实现提交：`3a66caf`。

2026-08-30：GPT / DeepSeek 写作模型已从课程流程收拢到账户“高级设置”。选择保存到 `User.writingProvider`，仅影响下一次新发起的文本任务；运行中任务继续使用领取时快照，既有课程内容不回写。验证通过账户 API、服务端路由与工作区回归测试、全量 87 个文件 / 689 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate` 和 `pnpm build`；提交号待用户验收后记录。

2026-08-19：账户中转站收敛为 QuickRouter 与 Crazyrouter，移除 HaoAI/Easy88AI 的 UI、API、运行时分支和环境变量；旧浏览器 Cookie/Session 自动回退 QuickRouter，数据库旧账户值迁移到 Crazyrouter，失败图片任务的历史来源标记继续只读保留。Crazyrouter 文本、生图和基于生成结果的编辑已做真实串联验证；实现验证通过全量 58 个文件 / 476 项测试、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm exec prisma validate`、`pnpm build` 与 migration deploy。

2026-08-20：修复账户已切换 Crazyrouter、旧 Cookie 仍令 AI 请求发往 QuickRouter 的问题。AI 路由改为每次按登录用户读取 `User.aiGateway`，配置保存后下一次请求立即生效，无需重新登录；中转站 Cookie 降级为未认证兼容值。验证通过全量 66 个文件 / 510 项测试、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm build`、乱码扫描和 `git diff --check`。

2026-08-21：移除中转站 Cookie 及未认证默认回退，修复浏览器“记住我”仍有效但服务端会话 Cookie 在浏览器重启后消失、导致修改中转站必须重新登录的问题。登录请求同步提交 `remember`，身份 Cookie 与浏览器本地状态统一为会话级或 30 天；退出登录同时清除服务端 Cookie。高级设置每次打开都从数据库加载当前值，所有依赖中转站的 AI 接口在身份失效时统一返回可恢复的 401。旧版本已经丢失身份 Cookie 的浏览器无法在不重新验证密码的情况下安全恢复，升级后首次会要求重新登录一次，此后按统一生命周期保持。验证通过全量 72 个文件 / 547 项测试、定向 ESLint、`pnpm exec tsc --noEmit`、`pnpm build`、乱码扫描和 `git diff --check`。

2026-08-26：QuickRouter 增加主站与直连两个账号级 Base URL 选项；新增 `User.quickRouterEndpoint` 枚举字段与 migration。文本、联网研究、人物形象、课程生图和图片编辑统一使用该设置；不自动重放失败请求。

## Verification

Run:

```bash
pnpm lint
pnpm test
pnpm build
```
