# POST /api/diagnose — stage 3B cases

No external test runner is configured or installed. Stage 3C adds a standalone
Node assertion script using the existing TypeScript dependency for in-memory
module loading. Run with Node 22.15+:

```sh
node tests/unit/diagnose-route.check.mjs
# Or from apps/api using its check:diagnose package script.
```

The script invokes the actual Express route handler with substituted DB reads,
inserts and request/response objects. It runs the real resolver, result service,
formatter and missing-configuration path of YandexAIProvider. A global fetch trap
asserts zero network calls. The AI success/guard cases use a stub provider result.
It does not verify a live HTTP server or PostgreSQL deployment.

Stage 3C verification: both domain and API typechecks pass. 25 route cases plus
fenced-JSON/invalid-JSON parser assertions pass. Route cases cover the scenarios
below, persistence before HTTP success, log ordering and private-data exclusion.

Workspace wiring: apps/api already declares @workspace/domain as workspace:*,
the domain export is ./diagnostic, and pnpm-workspace.yaml includes packages/*.
The missing local apps/api/node_modules/@workspace/domain junction was restored
to packages/domain. No dependency or lockfile changes were needed. The assertion
script resolves the domain from apps/api and fails if this local link is missing;
it does not substitute an alias to conceal a wiring failure.

Use conversationId `11111111-1111-4111-8111-111111111111` and the corresponding
fixture row in `diagnose-route.fixtures.json`. Drizzle properties are camelCase;
the existing SQL columns remain snake_case.

| Case | Setup | Expected |
| --- | --- | --- |
| Valid answers → resolver → result | Complete row, provider returns validResult | 200; structuredResult matches provider; isAI=true; provider=yandex; sourceVersion=inobr-diagnostic-rules-v2; fallbackReason=null. Provider receives exactly the eight factsPacket keys and four rawAnswers keys, no conversationId/contact/lead. |
| No diagnostic answers | DB returns [] | 404; no provider call or insert. |
| Incomplete answers | Set each of the four code fields to null or empty string in turn | 400; error=DIAGNOSTIC_VALIDATION_ERROR; issues identifies required field; no provider call or insert. |
| Unknown code | Set educationType to unknown_code | 400 with unknown_code issue; no provider call or insert. |
| Invalid request | Missing body, null body, missing conversationId, numeric ID or invalid UUID | 400; no DB query, provider call or insert. |
| Missing Yandex config | Complete row; new YandexAIProvider({}) | 200; isAI=false; provider=fallback; fallbackReason=AI_CONFIGURATION_ERROR; no fetch; result includes four resolved rules and a substantive recommendation; recommendedTrack=construction_expertise. |
| School education guard | Set educationType=school_only; provider returns validResult with construction_expertise | Provider output rejected; 200 deterministic fallback, AI_INVALID_RESULT; recommendedTrack=not_defined; importantNote explains required professional/higher education. No positive recommendation of Стройэксперт. |
| Apartment fallback | Set goal=apartment_acceptance; missing provider config | 200 fallback; recommendedTrack=apartment_acceptance. |
| Unconfirmed education | Set educationType=diploma_not_available or need_clarification; missing config | 200 fallback; recommendedTrack=not_defined. |
| Provider failure | Provider throws AI_REQUEST_FAILED or AI_REQUEST_TIMEOUT | 200 fallback; fallbackReason is the corresponding safe error code. |
| Result saved | Run both valid AI and missing-config cases; insert returns an ID | Exactly one insert into ai_messages: same conversationId, role=assistant, step=diagnostic_result, message exactly equals response.result; insert completes before HTTP success. |
| Save fails | Insert throws or returning yields [] | 500; no success payload and no DIAGNOSTIC_RESULT_SAVED event. No raw database error in logs or response. |
| Load fails | Select throws | 500; no provider call or insert; finish logged. |

For both successful AI and fallback responses, verify all eight structured fields
exist, six required text fields are nonempty and importantNote is null or nonempty.
The readable result uses Russian labels and contains no technical JSON keys.

Expected AI success log sequence:
DIAGNOSTIC_RESULT_START → DIAGNOSTIC_ANSWERS_LOADED →
DIAGNOSTIC_KNOWLEDGE_RESOLVED → DIAGNOSTIC_AI_CALL_START →
DIAGNOSTIC_AI_CALL_SUCCESS → DIAGNOSTIC_RESULT_SAVED → DIAGNOSTIC_RESULT_FINISH.

Fallback replaces AI_CALL_SUCCESS with DIAGNOSTIC_AI_CALL_FAILED followed by
DIAGNOSTIC_FALLBACK_USED. Every early exit logs DIAGNOSTIC_RESULT_FINISH.
Logs must not contain request bodies, raw answers, generated text, secrets or
underlying provider/database exception messages. No OpenAIService, knowledge-base
Markdown loading, contacts/leads access or qualify invocation occurs.
