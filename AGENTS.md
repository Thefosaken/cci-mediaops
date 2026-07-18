# CCI MediaOps — Agent Guide

## Build / Lint / Test Commands

```bash
npm run dev         # Next.js 16 dev server (Turbopack)
npm run build       # Production build (compiles + typechecks)
npm run start       # Start production server
npm run lint        # ESLint (Next.js core-web-vitals + typescript configs)
npm run typecheck   # tsc --noEmit (strict mode)
```

There are no tests in this repository (no Jest, Vitest, Playwright, or testing-library). If you need to verify a change, run `npm run build` which catches type errors and compilation issues.

To apply Supabase migrations:
```bash
npx supabase login --token YOUR_TOKEN     # One-time: https://supabase.com/dashboard/account/tokens
npx supabase link --project-ref YOUR_REF  # One-time per project
npx supabase db push                      # Apply pending migrations
```

## Project Architecture

```
src/
  app/              # Next.js App Router pages
    (auth)/         # Login, sign-up, password reset (unauthenticated layout)
    (dashboard)/    # All authenticated pages (shared Shell layout)
  components/
    layout/         # Shell, Sidebar, Navbar, CommandPalette
    ui/             # Button, Card, Input, Modal, Select, Toast, Badge, etc.
  lib/
    auth/           # getCurrentUser, requireAuth, getCurrentUserWithRole
    hooks/          # Custom React hooks (use-sidebar-collapsed)
    permissions/    # Role-based access control matrix (7 roles, 10 resources)
    supabase/       # server.ts, client.ts, admin.ts, middleware.ts
    theme/          # ThemeProvider + useTheme (light/dark/system toggle)
    toast/          # Toast context/reducer for notifications
    utils/          # cn() utility (clsx + tailwind-merge)
    validators/     # Zod schemas (signUp, login, event, request, runSheet, etc.)
  server/
    actions/        # "use server" actions, one domain per folder (events/, requests/, etc.)
    queries/        # Server-side data fetching functions (getUpcomingEvents, etc.)
  types/            # All TypeScript interfaces and type aliases (barrel export)
  constants/        # NAV_ITEMS, EVENT_TYPES, REQUEST_STATUSES, ROLE_LABELS, etc.
supabase/
  migrations/       # SQL migrations (00001_initial_schema.sql, 00010_run_sheets_rls_policies.sql)
  config.toml       # Supabase local dev config
```

## Code Style Guidelines

### Imports
- Use `@/` path alias for all local imports (e.g. `@/components/ui/button`, `@/types`, `@/server/queries`)
- Relative imports only for files in the same directory (`./sidebar`)
- **Group** imports by kind, separated by blank lines: Node/framework → third-party library → local
- Named exports for all components and utilities (no default exports except pages)
- Import types explicitly: `import type { User } from "@/types"`
- Import icons individually from `lucide-react` (no barrel imports)

### Formatting & Conventions
- Semicolons: **none** at end of statements
- String quotes: **double quotes** consistently
- Trailing commas: **none** in objects/arrays
- JSX: double quotes for attributes, self-closing when no children
- No `import React` needed (React 19 automatic JSX runtime)
- ESLint config at `eslint.config.mjs` with two relaxed rules:
  - `react-hooks/set-state-in-effect` → `"warn"` (legitimate sync patterns)
  - `react-hooks/purity` → `"warn"` (Date.now() in server async functions)

### Naming
- **Files**: kebab-case (e.g. `login-form.tsx`, `auth-helpers.ts`)
- **Components**: PascalCase (e.g. `LoginForm`, `ThemeProvider`, `IconButton`)
- **Functions/variables**: camelCase (e.g. `handleSignIn`, `getCurrentUser`)
- **Types/interfaces**: PascalCase, exported (e.g. `User`, `Event`, `ScheduleSlot`)
- **Type aliases**: PascalCase (e.g. `export type UserRole = "admin" | "member"`)
- **Constants**: UPPER_SNAKE_CASE for exported constant objects; camelCase for individual values
- **Database columns**: snake_case (e.g. `auth_user_id`, `full_name`, `start_time`)
- **Zod schema fields**: camelCase (e.g. `fullName`, `startTime` — mapped to snake_case in queries)
- **CSS variables**: kebab-case (e.g. `--brand-red`, `--surface-subtle`)
- **Directories**: kebab-case (e.g. `sub-teams/`, `run-sheets/`, `auth-helpers/`)

### TypeScript
- `strict: true` in tsconfig — never use `any`, prefer `unknown`
- Use `satisfies` operator over type assertions where possible
- Prefer `interface` for public API shapes (extends-friendly), `type` for unions and utility types
- Use `const` assertions for literal arrays: `as const`
- Export types from `@/types` barrel file (single `index.ts` re-exporting everything)
- Never use `require()` — ESM imports only

### React & Next.js Patterns
- **Pages**: server components by default; use `"use client"` only when interactivity is needed
- **Client components**: put interactivity in `*-client.tsx` files imported by the server page
- **Forms**: `react-hook-form` with Zod resolver (`@hookform/resolvers/zod`)
- **Server actions**: in `src/server/actions/{domain}/index.ts`, use `"use server"` directive. Pattern:
  ```ts
  "use server"
  import { createClient } from "@/lib/supabase/server"
  import { revalidatePath } from "next/cache"
  import { schema } from "@/lib/validators"
  export async function createSomething(input: Input) {
    const parsed = schema.safeParse(input)
    if (!parsed.success) return { error: "Invalid input" }
    const supabase = await createClient()
    const { error } = await supabase.from("table").insert(parsed.data)
    if (error) return { error: error.message }
    revalidatePath("/path")
    return { success: true }
  }
  ```
- **Data fetching**: use Supabase SSR client (`@/lib/supabase/server`) in server components or `src/server/queries/`
- **Auth**: `requireAuth()` redirects unauthenticated users to `/login`; `getCurrentUser()` returns null
- **Components**: use `React.forwardRef` for form elements, set `displayName` for debugging
- **Client components**: always put `"use client"` as the very first line of the file
- **Modal dropdowns**: Select and DropdownMenu render via `createPortal` to `document.body` with `zIndex: 100` to avoid clipping by modal stacking contexts
- **Dynamic pages**: set `export const dynamic = "force-dynamic"` on every dashboard page
- **Middleware**: at `src/lib/supabase/middleware.ts`, imported by `src/middleware.ts` — protects all routes except `/login`, `/sign-up`, `/auth`

### Supabase & Database
- **Three client modes**:
  - `@/lib/supabase/client` — browser client (respects RLS, uses anon key)
  - `@/lib/supabase/server` — server client (respects RLS, uses cookies for auth)
  - `@/lib/supabase/admin` — service-role client (bypasses RLS, for admin operations only; NEVER expose to browser)
- **Migrations**: numbered sequentially (`NNNNN_description.sql`), applied via `npx supabase db push`
- **RLS**: enabled on all tables — each table needs explicit SELECT/INSERT/UPDATE policies for authenticated users
- **Queries**: always destructure `{ data, error }`, handle null with `?? []` or `?? null`
- **camelCase → snake_case**: Zod schemas use camelCase (`startTime`, `eventType`); map to snake_case in DB queries (`start_time`, `event_type`)

### CSS & Theming
- Tailwind CSS v4 with `@theme inline` for design tokens in `globals.css`
- `cn()` utility (`@/lib/utils/cn`) for conditional class merging (clsx + tailwind-merge)
- Semantic color tokens: `--color-primary` (#D32126), `--color-surface`, `--color-muted`, etc.
- Dark mode via `[data-theme="dark"]` selector on `<html>`
- Use semantic tokens (e.g. `bg-primary`, `text-muted`), not raw hex values
- Animations on `transform` and `opacity` only (GPU-composited); respect `prefers-reduced-motion`

### Error Handling
- Server actions: no try/catch needed for Supabase — check `error` return, return `{ success, error }` objects
- Auth: `requireAuth()` redirects to `/login` or `/pending` on failure
- Supabase queries: check `if (error) return { error: error.message }` pattern
- Form validation: Zod schemas with `react-hook-form` for error surfacing
- Client-side: `const { success, error, warning } = useToast()` from `@/lib/toast/toast-context`; call after server actions: `success("Message")` or `toastError(err)`

### State Management
- No global state library — React context for theme and toast only
- `useState` / `useReducer` for local component state
- URL search params for persisted UI state (filters, active tabs, modals)
- Server state fetched directly (no React Query / SWR)

### File Organization
- One component per file
- Client variants co-located with pages: `page.tsx` + `page-client.tsx`
- Server actions co-located by domain under `src/server/actions/{domain}/index.ts`
- Shared UI primitives in `src/components/ui/`
- Queries in `src/server/queries/index.ts`

### Performance & Accessibility
- `next/font` for font loading (Geist Sans currently)
- `next/image` for images with explicit width/height
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<aside>`, `<button>`, `<label>`
- ARIA labels on icon-only buttons via `aria-label`
- Focus-visible rings on interactive elements (`:focus-visible` in globals.css)
- Touch targets minimum 44x44px
- Labels associated with inputs via `htmlFor`

### Security
- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only — never in client code
- Admin client uses `import "server-only"` to prevent accidental client imports
- RLS policies required on all tables; idempotent policy creation in migrations
- Auth middleware protects all dashboard routes
