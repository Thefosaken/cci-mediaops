# CCI MediaOps — Agent Guide

## Build / Lint / Test Commands

```bash
npm run dev        # Next.js 16 dev server (Turbopack)
npm run build      # Production build (compiles + typechecks)
npm run start      # Start production server
npm run lint       # ESLint (Next.js core-web-vitals + typescript configs)
npm run typecheck  # tsc --noEmit (strict mode)
```

There are no tests in this repository yet. If you need to verify a change, run `npm run build`.

## Project Architecture

```
src/
  app/              # Next.js App Router pages
    (auth)/         # Login, sign-up (unauthenticated layout)
    (dashboard)/    # All authenticated pages (shared Shell layout)
  components/
    layout/         # Shell, Sidebar, Navbar
    ui/             # Button, Card, Input, Label, Badge, Modal, Select, Toast, etc.
  lib/
    auth/           # getCurrentUser, requireAuth, getCurrentUserWithRole
    hooks/          # Custom React hooks (use-sidebar-collapsed)
    permissions/    # Role-based access control helpers
    supabase/       # server.ts (cookies), client.ts (browser), middleware.ts (refresh)
    theme/          # ThemeProvider + useTheme (light/dark/system toggle)
    toast/          # Toast context/reducer for notifications
    utils/          # cn() utility (clsx + tailwind-merge)
    validators/     # Zod schemas (signUp, login, event, request, etc.)
  server/
    actions/        # Server actions, organized by domain (events/, requests/, etc.)
    queries/        # Server-side data fetching functions
  types/            # All TypeScript interfaces and type aliases
  constants/        # NAV_ITEMS, DEFAULT_SUB_TEAMS, dropdown options
```

## Code Style Guidelines

### Imports
- Use `@/` path alias for all local imports (e.g. `@/components/ui/button`, `@/types`, `@/server/queries`)
- Relative imports only for files in the same directory (`./sidebar`)
- Group imports by kind, separated by blank lines: framework → library → local
- Named exports for all components and utilities (no default exports except pages)
- Import types explicitly when only using types: `import type { User } from "@/types"`

### Formatting & Conventions
- Semicolons: **none** (no semicolons at end of statements)
- String quotes: **double quotes** consistently
- Trailing commas: **none** (no trailing commas in objects/arrays)
- JSX: double quotes for attributes, self-closing when no children
- No `import React` needed (React 19 automatic JSX runtime)

### Naming
- **Files**: kebab-case (e.g. `login-form.tsx`, `auth-helpers.ts`, `theme-context.tsx`)
- **Components**: PascalCase (e.g. `LoginForm`, `ThemeProvider`, `Sidebar`)
- **Functions/variables**: camelCase (e.g. `handleSignIn`, `getCurrentUser`, `sidebarOpen`)
- **Types/interfaces**: PascalCase (e.g. `User`, `Event`, `ScheduleSlot`)
- **Type aliases**: PascalCase, exported (e.g. `export type UserRole = "admin" | "member"`)
- **CSS variables**: kebab-case (e.g. `--brand-red`, `--surface-subtle`, `--shadow-elevation-sm`)
- **Directories**: kebab-case (e.g. `sub-teams/`, `run-sheets/`, `auth-helpers/`)
- **Constants**: UPPER_SNAKE_CASE for exported constant objects, camelCase for individual values
- **Database columns**: snake_case (e.g. `auth_user_id`, `full_name`, `start_time`)
- **Zod schema fields**: camelCase (e.g. `fullName`, `startTime` — mapped to snake_case in queries)

### TypeScript
- `strict: true` in tsconfig — never use `any`, prefer `unknown`
- Use `satisfies` operator over type assertions where possible
- Prefer `interface` for public API shapes, `type` for unions/utility types
- Use `const` assertions for literal arrays: `as const`
- Export types from a central `@/types` barrel file

### React & Next.js Patterns
- **Pages**: server components by default, use `"use client"` only when needed
- **Client components**: put interactivity in `-client.tsx` files, import into page
- **Forms**: `react-hook-form` with Zod resolver (`@hookform/resolvers/zod`)
- **Server actions**: in `src/server/actions/{domain}/index.ts`, use `"use server"`
- **Data fetching**: in `src/server/queries/index.ts`, use Supabase SSR client
- **Auth helpers**: `requireAuth()` redirects unauthenticated users; `getCurrentUser()` returns null
- **Components**: use `React.forwardRef` for form elements, `displayName` for debugging
- **Icons**: lucide-react, imported individually (not barrel)

### CSS & Theming
- Tailwind CSS v4 with `@theme inline` for design tokens
- CSS custom properties in `globals.css` for light/dark mode via `[data-theme="dark"]`
- `cn()` utility for conditional class merging (import from `@/lib/utils/cn`)
- Design tokens: `--color-primary` (#D32126), `--color-surface`, `--color-muted`, etc.
- Use semantic color tokens, not raw hex values, in components

### Error Handling
- Server actions: try/catch, return `{ success, error }` objects
- Auth: `requireAuth()` redirects to `/login` on failure
- Supabase queries: destructure `{ data, error }`, handle null with `?? []`
- Form validation: Zod schemas, error messages surfaced via `react-hook-form`
- Client-side: toast notifications for success/error feedback

### State Management
- No global state library — React context for theme and toast
- `useState` / `useReducer` for local state
- URL search params for persisted UI state (filters, active tabs)
- Server state fetched directly (no React Query / SWR — simple Supabase queries)

### File Organization
- One component per file
- Co-locate test fixtures and story files with components (when tests exist)
- Server actions co-located by domain under `src/server/actions/{domain}/`
- Shared UI primitives in `src/components/ui/`

### Performance
- `next/font` for font loading (Geist Sans currently)
- `next/image` for images with explicit width/height
- `dynamic = "force-dynamic"` on pages that fetch fresh data
- Animations only on `transform` and `opacity` for GPU compositing
- Respect `prefers-reduced-motion` via CSS media query

### Accessibility
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<aside>`, `<button>`, `<label>`
- ARIA labels on icon-only buttons (`aria-label`)
- Focus-visible rings on interactive elements (custom `:focus-visible` in globals.css)
- Labels associated with inputs via `htmlFor`
- Touch targets minimum 44x44px
