# AI Квалификатор ИНОБР

Чат-виджет для квалификации потенциальных студентов института ИНОБР по специальности «строительная экспертиза». Пользователь проходит 4 коротких вопроса, ответы сохраняются в базе данных.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind (artifacts/chat-widget)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/diagnostic-sessions.ts`
- API contract: `lib/api-spec/openapi.yaml`
- Backend routes: `artifacts/api-server/src/routes/diagnostic-sessions.ts`
- Frontend widget: `artifacts/chat-widget/src/components/chat-widget.tsx`
- CSS theme: `artifacts/chat-widget/src/index.css`

## Architecture decisions

- Single-page chat widget at `/` — the entire UX lives in one component state machine.
- No auth for MVP — sessions saved anonymously by design (Phase 1 scope).
- Used Replit's built-in PostgreSQL instead of Supabase — same SQL, no OAuth setup required.
- Drizzle ORM for type-safe DB access; schema pushed with `drizzle-kit push` (not migrations).

## Product

- **Launch screen**: heading + "Начать диагностику" button
- **Welcome message**: bot greeting with "Начать" button
- **4 diagnostic questions**: compact chip answers + free-text "Другое" fallback
- **Completion screen**: thank-you message after answers are saved to DB
- **Responsive**: mobile, tablet, desktop

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After adding new tables to `lib/db/src/schema/`, run `pnpm run typecheck:libs` before typechecking artifacts — stale lib declarations cause false TS2305 errors.
- Run `pnpm --filter @workspace/db run push` to sync schema changes to the dev DB.
- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before editing routes or frontend.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
