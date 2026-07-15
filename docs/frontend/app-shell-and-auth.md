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

- `public/mock-assets/login-academy-portal.png`

Visible brand copy is intentionally limited to:

- `Kaleido Concepts`
- `万象为镜，照见奇思。`
- `AI 定制互动绘本英语项目`

The login form includes:

- username
- password
- remember me
- show / hide password
- login button
- error message

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
- right: single account menu with logout

There is no second account area in the sidebar.

## Verification

Run:

```bash
pnpm lint
pnpm test
pnpm build
```
