# AI Квалификатор ИНОБР

Чат-виджет для квалификации потенциальных студентов института ИНОБР по специальности «строительная экспертиза». Пользователь проходит 4 коротких вопроса, ответы сохраняются в базе данных.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from $PORT)
- `pnpm --filter @workspace/chat-widget run dev` — run the frontend (port from $PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:dictionaries` — seed all dictionary tables

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind (artifacts/chat-widget)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM (connects via DATABASE_URL)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Supabase JS client: installed on both frontend and backend (prepared for Phase 2)

## Where things live

- DB schema: `lib/db/src/schema/`
  - `dictionaries.ts` — all 11 reference tables (ai_dict_*)
  - `ai-sessions.ts` — main operational tables (ai_sessions, ai_conversations, ai_messages, ai_diagnostic_answers, ai_leads, ai_events, ai_knowledge, ai_bitrix_logs, ai_contacts, ai_users)
- API contract: `lib/api-spec/openapi.yaml`
- Backend routes: `artifacts/api-server/src/routes/`
- Backend services: `artifacts/api-server/src/services/KnowledgeBaseService.ts`
- Backend Supabase client (admin): `artifacts/api-server/src/lib/supabase.ts`
- Frontend widget: `artifacts/chat-widget/src/components/chat-widget.tsx`
- Frontend Supabase client (browser): `artifacts/chat-widget/src/lib/supabase.ts`
- Knowledge base file: `artifacts/api-server/knowledge/knowledge_base_inobr_ai_consultant_v1.md`
- CSS theme: `artifacts/chat-widget/src/index.css`

## Environment Variables

See `.env.example` for the full list. Required variables:

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | Backend | PostgreSQL connection (Supabase or built-in) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend ONLY | Supabase admin access (bypasses RLS) |
| `VITE_SUPABASE_URL` | Frontend + Backend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend ONLY | Supabase public anon key |
| `SESSION_SECRET` | Backend | Session signing |
| `PORT` | Backend + Frontend | Server port (injected by Replit/Vercel) |
| `KNOWLEDGE_BASE_SOURCE` | Backend | `file` or `database` (default: `file`) |

**Security rules:**
- `SUPABASE_SERVICE_ROLE_KEY` → backend only, never in frontend code
- `VITE_SUPABASE_ANON_KEY` → safe for browser (Row Level Security applies)
- No keys are hardcoded anywhere in the codebase

## Architecture decisions

- Single-page chat widget at `/` — the entire UX lives in one component state machine.
- No auth for MVP — sessions saved anonymously by design (Phase 1 scope).
- PostgreSQL via Drizzle ORM; schema pushed with `drizzle-kit push` (not migrations).
- All dictionary values loaded from DB — no hardcoded answer options in frontend.
- KnowledgeBaseService supports `file` and `database` sources, switchable via env var.
- Supabase admin client uses lazy initialization — won't crash server if unused.

## Product

- **Launch screen**: heading + subheading + "Начать диагностику" button
- **Welcome message**: bot greeting with "Начать" button
- **4 diagnostic questions**: compact chip answers (loaded from DB) + free-text "Другое" fallback
- **Completion screen**: thank-you message after answers are saved to DB
- **Responsive**: mobile, tablet, desktop

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After adding new tables to `lib/db/src/schema/`, run `pnpm run typecheck:libs` before typechecking artifacts — stale lib declarations cause false TS2305 errors.
- Run `pnpm --filter @workspace/db run push` to sync schema changes to the dev DB.
- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before editing routes or frontend.
- The backend Supabase client (`src/lib/supabase.ts`) uses lazy init — imported but only instantiated on first call.
- VITE_SUPABASE_URL is accessible on the backend via `process.env` (not just Vite) — this is intentional.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
