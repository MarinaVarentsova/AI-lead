# ИНОБР Ассистент v2

Ветка `inobr-v2`: первый этап — перенос структуры без изменения алгоритма диагностики.

- `apps/web` — React/Vite frontend.
- `apps/api` — Express API и действующие legacy AI-модули.
- `packages/db` — PostgreSQL/Drizzle, текущая UUID-схема.
- `packages/contracts` — OpenAPI/Orval.
- `packages/api-client-react`, `packages/api-zod` — клиент и схемы валидации.
- `packages/domain` — место для будущего выделения бизнес-правил.
- `knowledge/inobr` — единственная рабочая копия базы знаний.
- `tests/{unit,integration,e2e}` — подготовленные каталоги тестов.

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

Архитектура и запуск: [docs/architecture.md](docs/architecture.md).
Будущий deployment: [deploy/selectel/README.md](deploy/selectel/README.md).

Yandex и Selectel пока не подключены. Миграции БД и deployment не выполняются.
