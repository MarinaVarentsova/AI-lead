# Проверка вопросов и контакта после redeploy

Ветка: `inobr-v2`. Пересобрать **inobr-web и inobr-api**.

## Что доказано локально

- Старый `handleConsultantSubmit` при отсутствии `crypto.randomUUID` ловит
  TypeError до fetch. UUID v4 теперь создаётся через `crypto.getRandomValues`,
  доступный на HTTP. Существующий ref сохраняет ID до успешного ответа; retry
  использует тот же ID. Backend idempotency и лимит не менялись.
- `handleSubmitContact` не использует crypto. Его guards (busy, отсутствующий
  conversationId/channel, пустой ввод) возвращаются без установки ошибки.
  При заполненной форме тест исполняет настоящий обработчик, `submitContact`,
  `apiFetch`, HTTP Express route и SQL INSERT/SELECT.
- Payload `conversationId/contactChannel/email/telegram/phone` соответствует
  `aiConversations.id` и колонкам `ai_contacts`:
  `conversation_id/contact_channel/email/telegram/phone` в
  `packages/db/src/schema/ai-sessions.ts`. Отдельной SQL-миграции ai_contacts
  в репозитории нет. Это **не доказывает** несовпадение production-схемы.
- Backend возвращает 201 и `{contactId, conversationId}` только после завершения
  INSERT RETURNING. Frontend проверяет статус, UUID contactId и совпадение
  conversationId до перехода в submitted. Ошибки validation/lookup/INSERT
  и невалидная квитанция не подтверждают отправку.
- `node tests/integration/post-diagnostic-http.check.mjs`: реальный loopback HTTP
  и PostgreSQL WASM (PGlite), схема из Drizzle, реальные виджеты/обработчики,
  crypto без randomUUID в VM. Это не Chrome E2E и не production-проверка.
  Внешний AI заменён детерминированным ответом только внутри теста.
  Проверяются потеря двух подтверждений, retry, 3 вопроса и 409, email/Telegram/
  phone, SQL SELECT сохранённых строк и реальная ошибка отсутствующей колонки.

## Как получить недостающий production-факт

После redeploy открыть frontend по HTTP, выполнить диагностику, открыть DevTools
Network (All или Fetch/XHR, без фильтра, Preserve log) и Console (Info включён).

1. Задать вопрос: «Сколько стоит обучение?». Ожидается
   `POST /api/consultant-chat`, 200 и непустой `message`.
2. Выбрать «Связаться с менеджером» → E-mail → тестовый адрес
   `codex-regression@example.invalid` → «Отправить» один раз.
   Запрос: `POST /api/contacts` на настроенный backend с JSON:
   `{ "conversationId": "<ID текущей диагностики>", "contactChannel": "email",
   "email": "codex-regression@example.invalid" }`.
3. Если запроса нет: искать в Console `CONTACT_CLIENT_STAGE` со stage `request`
   и `CONTACT_CLIENT_FAILED` с `CONTACT_TRANSPORT_FAILED`. Это сбой до получения
   HTTP-ответа, а не доказательство ошибки БД. Если нет даже stage `request`,
   проверить загруженную frontend-сборку и достижение click handler/guards.
4. Если запрос есть: записать только HTTP-статус и безопасный code/requestId
   из ответа об ошибке. В Coolify **inobr-api** искать `CONTACT_STAGE`
   (`validation`, `conversation_lookup`, `insert`, `response`) и
   **`CONTACT_REQUEST_FAILED`** с тем же `requestId`.
   `errorCode=42703` означает отсутствующую колонку,
   `42P01` — таблицу, `23503` — FK; `constraint` указывает имя ограничения.
   Это диагностические варианты, не установленные причины production-сбоя.
   Успешное завершение: `stage=response`, `httpStatus=201`.
5. `CONTACT_CLIENT_FAILED` с `CONTACT_HTTP_ERROR` означает не-201;
   `CONTACT_RECEIPT_INVALID` — 201 с неверным JSON/контрактом.

Backend логи содержат только requestId, stage, errorCode, httpStatus и при наличии
имя constraint. Frontend логи содержат только stage/errorCode/httpStatus.
Не присылать контакты, payload, SQL с параметрами, токены или DATABASE_URL.
До получения этих фактов причина сбоя контакта в production **не установлена**.
Миграции production и redeploy этим изменением не выполняются.
