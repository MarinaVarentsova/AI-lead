# Diagnostic frontend — stage 4

No frontend test runner installed. Run helper assertions with:
`node tests/unit/diagnostic-frontend.check.mjs`.
They reuse diagnose-route.fixtures.json, mock fetch, and check that saving finishes
before generation, save failures prevent generation, HTTP/malformed responses
reject, retry succeeds, and both AI/fallback structured data are accepted.

The following are UI verification cases, not automated browser tests:

| Case | Action | Expected |
| --- | --- | --- |
| Four questions | Start card → intro → Q1–Q4 | Existing logo/style and questions; progress 25%, 50%, 75%, 100%; chosen answer appears once as user bubble. |
| Q4 ordering | Select final answer; delay save response | POST /api/diagnostic-answers first; /api/diagnose only after successful save, body contains conversationId only. No /api/qualify. |
| Loading | Delay either request; double-click Q4 | «Формируем результат диагностики...»; chips hidden; synchronous refs prevent duplicate submit. |
| Structured result | Return valid structuredResult | «Диагностика завершена», summary, Опыт, Стаж, Образование, Цель, Рекомендация; no duplicate result string. |
| Important note | Test null and nonempty importantNote | Separate «Важно» block only for non-null note. |
| Fallback | isAI=false, provider=fallback | Same normal result card; no provider/sourceVersion/fallbackReason/technical labels shown. |
| Save error | Reject answer save | Neutral error and «Повторить»; no diagnose call. |
| Diagnose error | Return 500, invalid JSON, missing structuredResult or empty required field | Neutral error and retry, no generic manager promise or blank screen. |
| Retry | Restore responses and click twice | One new save/generate sequence using the original four answers; no repeated answer bubbles or result cards. |
| Ask question | Click «Задать вопрос» | post-diagnostic-ready; input placeholder «Что хотите уточнить?»; local draft only, disabled send, no legacy chat request. |
| Manager | Click «Связаться с менеджером» | Existing channel/details/contact submission flow; existing submitted state preserved. |

Full build and browser/end-to-end verification are not part of these helper checks.
