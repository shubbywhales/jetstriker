     1|# Next.js App Router Starter
     2|
     3|A minimal starter for fullstack apps with the Next.js App Router. The default UI is a single centered **Nullshot Beta** line so you can grow the app from a clean slate.
     4|
     5|## Features
     6|
     7|- `src/app/` directory routing
     8|- `layout.tsx`, `loading.tsx`, `not-found.tsx`, and metadata
     9|- Tailwind CSS v4 via `src/app/globals.css`
    10|- Ready for thin route handlers in `src/app/api/**/route.ts`
    11|- Backend layering: `src/services/` for business logic, `src/repositories/` for SQL/data access
    12|- Feature-oriented frontend placeholders: `src/features/`, `src/components/ui/`, `src/components/common/`
    13|- Optional local OpenNext + Wrangler workflow for Cloudflare preview/testing
    14|
    15|## App structure (conventions)
    16|
    17|| Area | Purpose |
    18||------|---------|
    19|| `src/app/**` | Routes, layouts, `loading.tsx` / `not-found.tsx`, and route handlers only. Compose UI from features and shared components; keep files thin. |
    20|| `src/features/<name>/` | Product features: `components/`, `hooks/`, `lib/`, `utils/`, `types.ts`, and a selective `index.ts` barrel. Hooks own data fetching and state; components stay declarative. |
    21|| `src/components/ui/` | Low-level, reusable UI primitives (e.g. shadcn-style building blocks). |
    22|| `src/components/common/` | App-wide reusable components that are not tied to one feature. |
    23|| `src/lib/` | Cross-cutting helpers (e.g. runtime, crypto) — not feature business logic. |
    24|| `src/services/` | Server-side business logic called from route handlers or Server Actions. |
    25|| `src/repositories/` | D1/SQL and data access only. |
    26|
    27|Avoid wildcard barrel exports (`export * from`) to prevent name collisions and bundle bloat. Prefer direct imports for heavy third-party packages where it helps tree-shaking (see Vercel React best practices).
    28|
    29|Cursor rules for agents live in `.cursor/rules/`.
    30|
    31|## Local Development
    32|
    33|1. Install dependencies with `pnpm install`.
    34|2. Copy `.dev.vars.example` to `.dev.vars` and add any secrets/runtime vars you need for local OpenNext/Cloudflare access.
    35|3. Add `.sql` files under `migrations/` when your app uses D1-backed features.
    36|4. Run `pnpm dev` for normal Next.js local development. The template runs `pnpm migrate:local` in `predev` so the default local D1 schema is applied automatically.
    37|5. Run `pnpm preview` to build with OpenNext and preview through Wrangler locally.
    38|6. If your app uses D1 with the default `DB` binding in `wrangler.jsonc`, run `pnpm migrate:local` manually when you want to re-apply local migrations outside `pnpm dev`, and `pnpm migrate:prod` for remote production migrations.
    39|7. Run `pnpm cf-typegen` after changing `wrangler.jsonc` bindings so `worker-configuration.d.ts` stays in sync.
    40|
    41|## Runtime Notes
    42|
    43|Build the app using normal App Router conventions in `src/app/`.
    44|Use `src/app/api/**/route.ts` or Server Actions for server-side behavior.
    45|Keep route handlers thin: request parsing and response shaping belong in the route, while business logic belongs in `src/services/` and SQL/D1 access belongs in `src/repositories/`.
    46|
    47|This template ships optional local OpenNext/Wrangler config so the app can run standalone on your machine.
    48|Playground preview and remote deploy still use the platform's custom Next-compatible runtime instead of relying on `.open-next` output.
    49|
    50|For D1-backed features such as the default auth starter, keep schema files in `migrations/`.
    51|The built-in migration scripts assume the default D1 binding name is `DB`.
    52|
    53|## File Structure
    54|
    55|```txt
    56|src/
    57|  app/
    58|    layout.tsx
    59|    page.tsx
    60|    globals.css
    61|    loading.tsx
    62|    not-found.tsx
    63|  components/
    64|    providers.tsx
    65|    common/
    66|    ui/
    67|  features/
    68|  lib/
    69|  services/
    70|  repositories/
    71|migrations/
    72|  README.md
    73|.cursor/
    74|  rules/
    75|.dev.vars.example
    76|worker-configuration.d.ts
    77|wrangler.jsonc
    78|```
    79|