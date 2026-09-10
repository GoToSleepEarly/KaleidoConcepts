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

账户菜单提供“高级设置”，只负责当前账号的 AI 模型与预置提供方选择，不允许老师输入任意 Base URL 或 API Key。界面按真实故障边界分为“文本”和“图片”两个区块；文本与图片可独立切换，避免一个提供方故障同时阻断全部能力。联网是文本模型的默认能力，不在界面中拆成独立设置；人物形象、课程图片生成和图片编辑跟随图片配置。

文本模型预置为 `gpt-5.5`、`gpt-5.6-sol` 和 `deepseek-v4-pro`。用户先选模型，再从该模型兼容的提供方中选择：GPT 模型可选择 QuickRouter 主站、QuickRouter 直连、Crazyrouter 或 Easy88AI；DeepSeek V4 Pro 只显示 DeepSeek。DeepSeek 使用 `https://api.deepseek.com`，原生兼容 OpenAI Responses API 并支持服务端执行 `web_search`，因此与 GPT 共用 `/responses` 请求和响应处理，只保留地址、密钥和上游模型名的预置差异，不再保留单独的 Chat Completions Adapter。

图片模型预置为 `gpt-image-2` 与 QuickRouter 专属 `gpt-image-2-c`。用户同样先选模型，再选择兼容提供方：`gpt-image-2` 可选择 QuickRouter 主站、QuickRouter 直连、Crazyrouter 或 Easy88AI；`gpt-image-2-c` 只显示 QuickRouter 主站和 QuickRouter 直连。2026-09-10 使用无效图片、无生成费用的请求验证 Easy88AI `POST /v1/images/edits`：单图 `image`、多图 `image[]`、项目现有的 portrait/landscape 尺寸与 low/medium 质量参数均被端点接收并进入上游图片校验，因此开放 Easy88AI 图片生成与编辑。

UI 中的每个提供方选项对应一条可执行的预置配置；QuickRouter 主站和 QuickRouter 直连作为两个并列选项呈现，不再增加“地址”层级。内部继续复用同一 QuickRouter 密钥、模型映射和兼容处理。为兼容现有数据，账户文本配置仍保存为 `writingProvider`、`aiGateway`、`quickRouterEndpoint`，图片配置仍保存为 `imageModel`、`imageGateway`、`imageQuickRouterEndpoint`；不保存 Base URL。服务端预置目录负责把这些稳定 ID 映射为白名单地址、密钥和协议 Adapter，并可为个别提供方配置上游模型别名；未配置别名时直接使用标准模型名。环境变量只配置密钥、DeepSeek 地址和超时，不配置模型；文本生成、联网研究、图片生成和图片编辑都使用高级设置选中的模型。新增模型、提供方或备用地址只修改预置目录和兼容矩阵，不修改课程业务代码。

每次打开高级设置时，`GET /api/account/ai-gateway` 按 HTTP-only 身份 Cookie 从数据库读取上述六项设置，前端展示代码内固定的预置目录。弹窗桌面端并列展示“文本”和“图片”，移动端顺序排列；每个区块严格使用“模型 → 提供方”的线性顺序，模型变化后立即收窄可选提供方。界面不展示“中转站”“联网线路”“Base URL”或真实 URL，不使用多层嵌套卡片。`PATCH` 只接受目录中存在且兼容的组合；为兼容升级期间的旧页面，缺失的新字段沿用数据库原值。保存使用一次原子更新；任一显式字段无效或数据库写入失败时全部保持原值。加载完成前不得展示组件默认值，加载失败时保留未知状态并提供重新加载入口。

本地启动与生产发布执行的幂等 seed 只负责创建预置账号和同步固定身份信息，不覆盖已有账号 AI 设置。每个新 AI 操作在服务端开始时读取账户配置并形成请求快照；修改只影响下一次新请求，运行中任务继续使用启动时配置，已有成果不清空、不改写。

所有线路均为显式手动切换，不在网络错误、429 或超时后自动向另一线路或模型重放请求。`gpt-image-2-c` 从 QuickRouter 的 429 隐式兜底改为主动可选模型；选择后生成与编辑固定使用 `high` 质量，并在界面说明其质量与计费特征。上游返回模型不存在或接口不兼容时按配置错误失败，不静默替换模型。

预置目录至少包含：QuickRouter 主站 `https://api.quickrouter.ai`、QuickRouter 直连 `https://api.quickrouter.us`、Crazyrouter `https://api.crazyrouter.com`、Easy88AI `https://api.easy88ai.com` 和 DeepSeek 官方地址。QuickRouter、Crazyrouter 与 Easy88AI 均使用独立的文本和图片密钥；DeepSeek 仅使用文本密钥。密钥只存在服务器环境，不进入 API 响应、数据库或 Git。QuickRouter 主站当前允许保留为可选线路，但外部可用性不作为本轮验收阻断项。

发版前先使用不产生生成费用的模型列表接口核对当前 Key 与模型 ID；不得为了验证而调用付费文本或图片生成。单元测试和 Provider 契约测试必须逐项覆盖模型别名、兼容矩阵、真实请求路径、请求体模型名、图片生成/编辑格式及禁止自动兜底。若外部 Key 或供应商状态导致免费检查失败，必须如实记录，不能宣称真实串联成功。

生产环境统一从项目根目录 `.env` 读取数据库、持久化图片目录和 AI 服务配置。`scripts/deploy-prod.sh` 在构建前加载该文件，并在重启已有 PM2 进程时使用 `--update-env`，确保新 Node 进程不沿用 PM2 保存的旧变量。生产 `.env` 不提交 Git，也不使用 `.env.local` 叠加覆盖。

实现状态：已实现账户菜单设置、登录同步、数据库字段、服务端路由选择和 GPT 文本/研究/图片 provider 分流；生产部署前执行 `pnpm prisma:deploy`。

2026-09-10：移除 QuickRouter、Crazyrouter、Easy88AI 和 DeepSeek 的模型环境变量，消除环境变量与高级设置两个模型来源。文本生成与联网研究现在统一使用账号选择的文本模型，图片生成、编辑和画质规则统一使用账号选择的图片模型；部署只要求各提供方密钥。共享主机与独立主机发布脚本都会在发布前检查所有可选提供方的对应能力密钥。验证通过全量 92 个测试文件 / 774 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、乱码扫描和 `git diff --check`；未调用外部 AI 接口。

2026-09-10：高级设置 UI 按“模型 → 提供方”重构。桌面端并列展示文本与图片，移动端纵向排列；QuickRouter 主站与直连改为两个平级提供方选项，删除第三层地址选择、真实 URL、“中转站”和独立联网文案。选择模型后只展示兼容提供方，`gpt-image-2-c` 仍只能选择 QuickRouter 主站或直连。保留现有数据库字段和服务端路由实现，不新增 migration。验证通过全量 92 个测试文件 / 773 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、桌面浏览器实测、乱码扫描和 `git diff --check`。

2026-09-10：高级设置拆分为当前账号的文本与图片配置；文本支持 `gpt-5.5`、`gpt-5.6-sol`、DeepSeek 官方直连及 QuickRouter/Crazyrouter/Easy88AI 预置线路，图片支持主动选择 `gpt-image-2` 或 QuickRouter 专属 `gpt-image-2-c`，不再在 429 后隐式换模型。Easy88AI 免费 `/v1/models` 检查鉴权成功并确认三个目标模型 ID；后续无效图片探测确认 `/v1/images/edits` 兼容项目所需参数，因此开放 Easy88AI `gpt-image-2` 图片线路。两次检查均未获得可用生成结果，不调用付费文本或图片生成。验证通过全量 92 个测试文件 / 772 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、本地 PostgreSQL `pnpm prisma:deploy`、乱码扫描、敏感信息扫描和 `git diff --check`。首轮实现提交：`feab432`；Easy88AI 图片线路提交：`2935242`。

2026-09-10：重新核对 DeepSeek 当前官方能力，确认 `https://api.deepseek.com/responses` 原生兼容 OpenAI Responses API，并支持服务端 `web_search`。账户选择 DeepSeek 后，文本准备、故事生成和联网研究统一走 DeepSeek 官方路线；界面不再展示不会生效的 GPT 中转站选项。免费 `/models` 实测当前 Key 包含 `deepseek-v4-pro`，无输入的 `/responses` 参数校验也成功到达官方端点；未执行付费生成。产品模型名、默认上游模型和环境变量示例统一改为 `deepseek-v4-pro`，迁移把历史 `deepseek-chat` 快照更新为新名称。验证通过全量 92 个测试文件 / 773 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build`、本地 PostgreSQL `pnpm prisma:deploy`、乱码扫描和 `git diff --check`。实现提交：`147be91`。

2026-09-10：DeepSeek 官方地址改为代码内预置，不再读取 `DEEPSEEK_BASE_URL`。部署环境只提供 `DEEPSEEK_TEXT_API_KEY`；即使服务器残留旧地址变量，请求也固定发往 `https://api.deepseek.com`。账户高级设置仍是模型与提供方的唯一选择来源。验证通过全量 92 个测试文件 / 774 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build` 和 `git diff --check`。

2026-09-10：所有提供方密钥统一按能力命名。Crazyrouter 与 Easy88AI 分别使用独立的文本、图片密钥，DeepSeek 使用 `DEEPSEEK_TEXT_API_KEY`；运行时和发布脚本均不读取三个旧的通用 Key，也不在文本与图片之间回退。验证通过全量 92 个测试文件 / 774 项测试、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm exec prisma validate`、`pnpm build` 和 `git diff --check`；未调用外部 AI 接口。

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
