# Будущее размещение в Selectel

Пока это проект deployment, а не готовая конфигурация. Docker и CI/CD не добавлены,
ресурсы Selectel не создавались, приложение не развёртывалось.

## План размещения

1. Собирать версию из проверенного GitHub commit командой `pnpm run build`.
2. Раздавать статические файлы `apps/web/dist/public` через HTTPS.
3. Направлять `/api/*` того же домена в Express backend.
4. Запускать `apps/api/dist/index.mjs` под управлением менеджера процессов.
5. Передавать DATABASE_URL PostgreSQL Selectel и секреты через окружение backend.
6. В следующем этапе подключить Knowledge Resolver и Yandex AI Studio.

До отдельного этапа переноса БД её адрес и данные не изменять. Сначала потребуется
сверка существующей схемы, план миграций и резервного копирования. Не применять
`drizzle-kit push` к production автоматически.

## Текущие требования legacy backend

- Node.js 24; рабочая директория — корень проекта либо `apps/api`.
- Сохранять весь каталог `apps/api/dist`: сборка содержит дополнительные файлы Pino.
- Поставлять `knowledge/inobr/knowledge_base_inobr_ai_consultant_v1.md` вместе с приложением.
- PORT и DATABASE_URL передаются через окружение; LOG_LEVEL опционален.
- KNOWLEDGE_BASE_SOURCE=file; OPENAI_API_KEY пока нужен для существующих AI-маршрутов.
- Переменные Yandex появятся после реализации соответствующего адаптера.
- `/api/healthz` проверяет процесс; `/api/healthz/db` — подключение к БД;
  `/api/knowledge-base/status` — наличие базы знаний.

TLS PostgreSQL, миграции, production-настройки ошибок, лимиты запросов и стратегия
обновления/отката будут настроены отдельно. Текущий структурный перенос не является
подтверждением готовности legacy backend к production.
