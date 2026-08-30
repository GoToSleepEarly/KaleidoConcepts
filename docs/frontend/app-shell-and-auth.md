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

账户菜单提供“高级设置”，统一配置文本生成模型与国外 GPT 系列调用使用的中转站。文本生成模型提供稳定产品名 `GPT` 与 `DeepSeek`，不向老师展示底层版本、provider 或能力后缀。该选择统一作用于故事大纲和文案与练习，不在课程流程中重复提供模型选择。默认使用 GPT；DeepSeek 作为低成本选项。

GPT 中转站提供 `QuickRouter` 或 `Crazyrouter`。选择 QuickRouter 时可进一步选择固定 Base URL：主站 `https://api.quickrouter.ai` 或直连 `https://api.quickrouter.us`。中转站选择同时作用于 GPT 文本生成、联网研究、人物形象、课程图片生成和图片编辑；DeepSeek 继续使用原有 `DEEPSEEK_BASE_URL` 官方直连路径，不经过任何中转站，也不受该设置影响。

设置保存在 `User.writingProvider`、`User.aiGateway` 与 `User.quickRouterEndpoint`，是文本模型与 AI 路由的唯一账户级真实来源。Base URL 不允许自由输入，数据库只保存 `main / direct` 枚举，服务端集中映射到白名单 URL，避免错误地址和 SSRF 风险。每次打开高级设置时，`GET /api/account/ai-gateway` 都按 HTTP-only 身份 Cookie 读取三项设置；`PATCH` 接收 `{ writingProvider, aiGateway, quickRouterEndpoint }`。为兼容缓存中的旧前端，缺少任一新增可选字段时保留数据库原值。

故事大纲和文案与练习的每个新 AI 操作在服务端开始时读取账户文本模型。修改设置只影响下一次新请求：已经运行的任务继续使用启动时的模型，不自动重放；已有成果不清空、不改写，也不标记为旧版本。课程设置和生成记录继续保存实际使用的模型快照，用于幂等、失败恢复和审计，但不再作为老师可编辑的模型偏好。高级设置保存三项配置时使用一次原子更新；任一字段校验或数据库写入失败时全部保持原值。

主站与直连是显式手动切换，不在网络错误后自动向另一个地址重放生成请求。原因是上游可能已经接收第一次请求，自动重放会带来重复生成和重复费用。Crazyrouter 被选中时 QuickRouter Base URL 选项隐藏但保留，切回 QuickRouter 后恢复上次选择。

QuickRouter 图片继续支持其专属 `gpt-image-2-c` 备用模型。Crazyrouter 使用 `https://api.crazyrouter.com/v1/responses`、`/v1/images/generations` 和 `/v1/images/edits`，文本、联网研究与图片共用 `CRAZYROUTER_API_KEY`；默认模型为 `gpt-5.6-sol` 和 `gpt-image-2`，图片使用标准 `output_format` 参数，不继承 QuickRouter 的 `-c` 回退。修改中转站只影响后续新请求，不重写已生成成果。

数据库中旧中转站产生的失败图片任务只保留历史来源标记，不再提供对应账户选项、环境变量或调用分支；新任务只会记录 QuickRouter 或 Crazyrouter。

生产环境统一从项目根目录 `.env` 读取数据库、持久化图片目录和 AI 服务配置。`scripts/deploy-prod.sh` 在构建前加载该文件，并在重启已有 PM2 进程时使用 `--update-env`，确保新 Node 进程不沿用 PM2 保存的旧变量。生产 `.env` 不提交 Git，也不使用 `.env.local` 叠加覆盖。

实现状态：已实现账户菜单设置、登录同步、数据库字段、服务端路由选择和 GPT 文本/研究/图片 provider 分流；生产部署前执行 `pnpm prisma:deploy`。

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
