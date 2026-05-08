     1|# Next.js webapp template structure
     2|
     3|## Where code lives
     4|
     5|- **`src/app/`**** — App Router only: `page.tsx`, `layout.tsx`, `loading.tsx`, `not-found.tsx`, route groups, and `api/**/route.ts`. Compose screens from `src/features` and `src/components`; avoid embedding large feature logic inline in route files.
     6|- **`src/features/<name>/`** — One folder per product feature. Typical layout:
     7|  - `components/` — feature UI (declarative; props in, JSX out)
     8|  - `hooks/` — data fetching, mutations, local state
     9|  - `lib/`, `utils/` — feature-scoped helpers
    10|  - `types.ts` — feature types
    11|  - `index.ts` — **selective** named re-exports only (no `export * from`)
    12|- **`src/components/ui/`** — Low-level primitives (buttons, inputs, dialogs). Prefer one component per file; avoid importing `@radix-ui/`* directly from feature code — wrap primitives here when you add a design system.
    13|- **`src/components/common/`** — Shared app components used by multiple features (shell pieces, empty states, shared cards) that are not global primitives.
    14|- **`src/lib/`** — Cross-cutting utilities (runtime context, crypto, formatting). Not a dumping ground for feature business rules.
    15|- **`src/services/`** — Server-side business logic invoked from route handlers or Server Actions.
    16|- **`src/repositories/`** — D1/SQL and persistence only; no HTTP or UI concerns.
    17|
    18|## Data and performance
    19|
    20|- Keep route handlers and Server Actions thin: parse input, call `src/services`, return JSON or redirect.
    21|- Prefer parallel independent async work (`Promise.all`) and avoid sequential waterfalls across unrelated data (see Vercel React best practices).
    22|- Avoid heavy barrel imports from large libraries; import specific modules or use `next.config` `optimizePackageImports` when applicable.
    23|- Minimize props passed across the server/client boundary to only what the client needs.
    24|- Prefer composition over boolean mode props when component behavior starts to branch. Reach for explicit variants, compound components, or children-based composition before adding more flags.
    25|- Prefer `children` or compound components over custom `renderX` props unless a render prop is clearly the best fit for the API.
    26|
    27|## Auth and global shell
    28|
    29|- Do not make `src/app/layout.tsx` auth-aware or add global nav by default unless the user asks. Integrate auth UI incrementally inside routes or features after backend auth exists (see platform `nullshot-nextjs-auth` skill when using the JWT cookie starter).
    30|
    31|
    32|