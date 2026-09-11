# Тестировщик Артёма — внутренний MVP

`/tester` не добавлен в навигацию. API `/api/tester/*` выключен по умолчанию.
Для включения нужны backend runtime env `INTERNAL_TESTER_ENABLED=true` и непустой
`INTERNAL_TESTER_TOKEN`. Все `/api/tester/*` проверяют `X-Internal-Tester-Token`
через SHA-256 + timingSafeEqual. Disabled → 404, отсутствующий/неверный ключ или
не настроенный секрет → 401. Проверка не применяется к обычным API.
На `/tester` ключ вводится в password-поле и хранится только в sessionStorage.
401 очищает ключ и возвращает экран доступа. Ключ не передаётся через URL,
не встраивается в Vite bundle; заголовок скрывается логгером. Используйте HTTPS.
Это общий внутренний ключ без пользователей/ролей. Для отзыва замените runtime
секрет backend; сохранённый старый ключ перестанет работать.

Перед включением вручную применить `deploy/selectel/ai-tester.sql`.
Скрипт только создаёт две таблицы/индексы, не меняет production-таблицы.
Никакие SQL/migrations из этой задачи автоматически не запускались.
Yandex env остаются прежними. Все AI-вызовы ограничены таймаутом не более 60 секунд.
Отдельный запрос того же AI-провайдера выполняет роль независимого оценщика;
это отдельная роль/контекст, а не отдельная модель или новый ключ.

API: POST `/api/tester/runs` {count:1..10}; GET `/api/tester/runs` (последние 10);
GET `/api/tester/runs/:id` (run + cases). POST возвращает 202, UI опрашивает прогресс.
Один активный run на backend обеспечен partial unique index, в том числе между
процессами. Без очереди задач: после остановки процесса run не возобновляется;
при следующем запуске просроченный более 90 минут run помечается failed.
Ошибки отдельного AI-case сохраняются как FAIL с null score, цикл продолжается.
Ошибка хранилища останавливает run: продолжать без сохранения результатов нельзя.

Общие runtime/services: DiagnosticKnowledgeResolver → DiagnosticResultService;
ConsultantKnowledgeResolver → ConsultantChatService → applyConsultantFunnel → лимит.
Production `/consultant-chat` и tester вызывают один `artem-runtime.ts`.
Tester не импортирует production repositories: runner хранит только локальный
transcript, adapter пишет исключительно ai_test_runs/ai_test_cases.
В evaluator передаются persona, полный синтетический transcript, diagnostic facts,
выбранные секции и sales-правила финальной KB. Без PII/web search.
Personas перемешиваются без повторов семейств; ИЖС задаётся вопросом, поскольку
отдельного diagnostic goal code для ИЖС нет. Диагностические коды не расширяются.

Рубрика: 12 оценок 0–100. Среднее → score; PASS >=85, REVIEW >=70, иначе FAIL.
Критическая ошибка (<50 по квалификации, маршруту, галлюцинациям или лимиту)
ограничивает общий score 69. API-ошибки не изображаются как AI-оценки.
Summary использует только успешно валидированные оценки, число ошибок показано отдельно.

Production: максимум 3 user-записи post_diagnostic_chat на conversationId.
Транзакционная advisory-блокировка сериализует запросы, user+assistant коммитятся вместе.
Frontend сохраняет requestId при retry, backend использует его как UUID user message;
повтор возвращает сохранённый ответ. Ошибка/rollback не расходует вопрос.
Третий ответ завершается CTA; response содержит questionsUsed/questionsRemaining/limitReached.
Четвёртый запрос → 409 FOLLOW_UP_LIMIT. UI скрывает input и показывает менеджер CTA.
Старые orphan user-записи, созданные прежней версией, не удаляются автоматически.
