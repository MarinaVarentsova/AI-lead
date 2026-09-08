# DiagnosticKnowledgeResolver: fixtures для следующего этапа

В проекте нет настроенного test runner. Новый runner и зависимости не добавлены.
`diagnostic-knowledge-resolver.fixtures.json` содержит 20 сценариев, включая все пять
обязательных случаев. Это спецификация проверок, не выполненные автоматические тесты.

Для каждого сценария вызвать `DiagnosticKnowledgeResolver.resolve(input)`.
Для некорректных runtime-входов будущий TypeScript test harness должен явно привести
input к DiagnosticAnswers: публичный тип намеренно требует четыре строковых кода.

- `expected`: проверить версию, ровно четыре ключа rules, число правил, guards и hint.
  Каждое правило должно точно совпадать с записью карты по соответствующему коду.
- `answerRaw`: проверить `resolved.answers[field].raw` без изменения исходного текста.
- `factsPacketRaw`: вызвать `buildFactsPacket(resolved)` и проверить указанные rawAnswers.
- `factsPacketKeys`: проверить точный набор ключей facts packet.
- `forbiddenKeysAtAnyDepth` / `forbiddenValues`: рекурсивно проверить отсутствие
  контактных полей и переданных в них значений в facts packet.
- `expectedError`: проверить класс/имя ошибки, code и полный список issues;
  resolver не должен возвращать результат или подставлять альтернативный код.

Raw диагностических ответов остаётся пользовательским текстом. Контактные поля
не копируются; классификация или редактирование содержимого raw в этот слой не входит.
