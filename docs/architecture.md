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

## Legacy-модули: следующий этап

Следующие модули остаются активными на прежних относительных путях внутри `apps/api/src`:

- `routes/diagnose.ts`;
- `routes/qualify.ts`;
- `services/OpenAIService.ts`;
- `services/KnowledgeBaseService.ts`.

Их размещение и контракты сохранены для минимального изменения существующего поведения.
В KnowledgeBaseService изменён только путь загрузки Markdown: `knowledge/inobr`.
Содержание Markdown не изменялось; имя v1 сохранено, хотя внутренняя версия — 2.0.

Yandex AI Studio, Knowledge Resolver и PostgreSQL Selectel пока не подключены.
Текущий AI-провайдер — OpenAI; текущее подключение БД по-прежнему определяется DATABASE_URL.
Существующие fallback, квалификация, scoring, сохранение контактов и их известные
ограничения намеренно не исправлялись в рамках переноса структуры.
Backend продолжает возвращать legacy debug-поля; frontend их больше не отображает.

## Локальные проверки

Требуются Node.js 24 и версия pnpm из корневого packageManager.

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

Сборка не требует подключения к БД или AI. Для запуска API требуются DATABASE_URL и PORT;
для legacy AI-запросов — OPENAI_API_KEY. KNOWLEDGE_BASE_SOURCE=file остаётся рабочим режимом.
Пример окружения — `.env.example`; переменные необходимо передать процессу запуска.

```sh
pnpm --filter @workspace/api-server run start
pnpm --filter @workspace/chat-widget run dev
```

Задайте отдельные PORT для web и API. В dev web проксирует `/api` на API_TARGET
(по умолчанию http://localhost:8080). В production маршрутизацию `/api` должен выполнять
reverse proxy; Vite preview не заменяет production proxy.

В этой задаче не вводились миграции, Docker, CI/CD или PR в main.
