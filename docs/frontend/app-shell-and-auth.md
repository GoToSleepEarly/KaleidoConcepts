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
- logout clears both stores and redirects to `/login`

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

账户菜单提供“高级设置”，当前只配置国外 GPT 系列调用使用的中转站：`QuickRouter` 或 `Crazyrouter`。选择同时作用于 GPT 文本生成、联网研究、人物形象、课程图片生成和图片编辑；DeepSeek 继续使用原有 `DEEPSEEK_BASE_URL` 官方直连路径，不经过任何中转站，也不受该设置影响。

设置保存在 `User.aiGateway`，登录时同步到 HTTP-only Cookie；所有 AI 写请求从 Cookie 读取当前账户选择。`GET /api/account/ai-gateway` 返回当前设置，`PATCH /api/account/ai-gateway` 接收 `{ aiGateway: "quickrouter" | "crazyrouter" }` 并同时更新数据库和 Cookie。密钥只从服务端环境变量读取，浏览器、接口响应和数据库都不保存 API Key。

QuickRouter 图片继续支持其专属 `gpt-image-2-c` 备用模型。Crazyrouter 使用 `https://api.crazyrouter.com/v1/responses`、`/v1/images/generations` 和 `/v1/images/edits`，文本、联网研究与图片共用 `CRAZYROUTER_API_KEY`；默认模型为 `gpt-5.6-sol` 和 `gpt-image-2`，图片使用标准 `output_format` 参数，不继承 QuickRouter 的 `-c` 回退。修改中转站只影响后续新请求，不重写已生成成果。

数据库中旧中转站产生的失败图片任务只保留历史来源标记，不再提供对应账户选项、环境变量或调用分支；新任务只会记录 QuickRouter 或 Crazyrouter。

生产环境统一从项目根目录 `.env` 读取数据库、持久化图片目录和 AI 服务配置。`scripts/deploy-prod.sh` 在构建前加载该文件，并在重启已有 PM2 进程时使用 `--update-env`，确保新 Node 进程不沿用 PM2 保存的旧变量。生产 `.env` 不提交 Git，也不使用 `.env.local` 叠加覆盖。

实现状态：已实现账户菜单设置、登录同步、数据库字段、服务端路由选择和 GPT 文本/研究/图片 provider 分流；生产部署前执行 `pnpm prisma:deploy`。

2026-08-19：账户中转站收敛为 QuickRouter 与 Crazyrouter，移除 HaoAI/Easy88AI 的 UI、API、运行时分支和环境变量；旧浏览器 Cookie/Session 自动回退 QuickRouter，数据库旧账户值迁移到 Crazyrouter，失败图片任务的历史来源标记继续只读保留。Crazyrouter 文本、生图和基于生成结果的编辑已做真实串联验证；实现验证通过全量 58 个文件 / 476 项测试、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm exec prisma validate`、`pnpm build` 与 migration deploy。

## Verification

Run:

```bash
pnpm lint
pnpm test
pnpm build
```
