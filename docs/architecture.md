# ИНОБР Ассистент v2

## Целевая архитектура

Frontend → Backend API → PostgreSQL Selectel → Knowledge Resolver → Yandex AI Studio.

Это последовательность обработки запроса: браузер отправляет запрос backend, backend
получает сохранённый профиль из PostgreSQL, Knowledge Resolver подбирает контекст,
после чего backend вызывает Yandex AI Studio и сохраняет результат в PostgreSQL.
База данных сама не вызывает Knowledge Resolver или AI. Ответ возвращается через API.

- Frontend: React + Vite + TypeScript, `apps/web`.
- Backend: Node.js + TypeScript + Express, `apps/api`.
- Данные: PostgreSQL в Selectel; пакет Drizzle — `packages/db`.
- Контракт API: OpenAPI в `packages/contracts`; генерация Orval сохранена.
- Клиент и проверка данных: `packages/api-client-react`, `packages/api-zod`.
- Бизнес-правила: будущий модуль `packages/domain`.
- База знаний: `knowledge/inobr` под контролем версий GitHub.
- Тесты: `tests/unit`, `tests/integration`, `tests/e2e` (пока только структура).
- Развёртывание: `deploy/selectel` (пока только описание).
- GitHub — источник истины для кода, контрактов и базы знаний. Секреты хранятся вне Git.

## Что сделано на первом этапе

Приложения и общие пакеты перенесены без изменения бизнес-логики. Внутренние имена
`@workspace/*` сохранены, чтобы не менять API и импорты прикладных модулей.
UI ИНОБР, CSS, ProgressBar, ResultCard, четыре вопроса и контактный сценарий сохранены.
Логотип пока остаётся в `attached_assets/image_1782127452755.png`; alias обновления не требует.
Удалены клиентские DebugRow/DiagDebugPanel, Supabase SDK clients и Replit/Vercel runtime.

UUID-модели и справочники code/name сохранены. Удалено только описание неиспользуемой
старой таблицы `diagnostic_sessions`. Никакие команды изменения БД не выполнялись.
Старый `supabase-schema.sql` не используется и удалён.

## AI runtime

Диагностика, консультация и evaluator используют Yandex AI Studio. Профессиональный
web fallback обращается к Yandex Search API, нормализует ограниченный набор результатов
и передаёт фактические фрагменты в существующую Yandex LLM для синтеза ответа.
Product/commercial intents остаются в контуре FAQ1200 и canonical KB.

## Локальные проверки

Требуются Node.js 24 и версия pnpm из корневого packageManager.

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

Сборка не требует подключения к БД или AI. Для запуска API требуются DATABASE_URL и PORT;
для AI-запросов — Yandex AI credentials, а для professional web fallback — доступ к Yandex Search API.
KNOWLEDGE_BASE_SOURCE=file остаётся рабочим режимом.
Пример окружения — `.env.example`; переменные необходимо передать процессу запуска.

```sh
pnpm --filter @workspace/api-server run start
pnpm --filter @workspace/chat-widget run dev
```

Задайте отдельные PORT для web и API. В dev web проксирует `/api` на API_TARGET
(по умолчанию http://localhost:8080). В production маршрутизацию `/api` должен выполнять
reverse proxy; Vite preview не заменяет production proxy.

В этой задаче не вводились миграции, Docker, CI/CD или PR в main.
