# Consultant chat endpoint — stage 5B

Run `node tests/unit/consultant-chat.check.mjs` with Node 22.15+ and the existing
TypeScript dependency. No external runner is installed. The check loads the real
route, resolver, service and file KB; DB and request/response objects are mocked.
Provider configuration is cleared. Fetch is trapped; a separate payload assertion
uses dummy credentials and an in-memory response, never a real Yandex request.

15 route cases cover four questions (price, economic diploma, judicial expertise,
orders), school_only, four invalid messages, invalid UUID, missing answers,
incomplete diagnosis, simulated AI success, PII filtering and failed user insert.
For successful replies, checks assert both ai_messages rows, user-before-provider
ordering, step=post_diagnostic_chat, response equality and structured log order.
Provider input must contain only question, diagnosticContext, and 2–5 projected
sections. The actual mocked Yandex body excludes extra contact/full-KB fields.
The 25 existing diagnostic-route cases also run to guard the original flow.

No conversation history is loaded. Only four validated diagnostic codes and the
deterministic track are used; raw diagnostic answers and contact/lead rows are not
queried. Recognizable emails, phones, Telegram handles/links and explicit names in
the question are replaced before retrieval and provider dispatch. Free-text name
recognition uses conservative patterns, not a general identity classifier.

400: invalid request or diagnostic codes. 404: no diagnostic answers.
Missing Yandex configuration/provider errors produce a substantive retrieval-based
fallback and 200 after both writes. KB/read/write failures return controlled 500;
underlying errors and message text are not logged. A failure after the user write
leaves that user message persisted; no successful response is returned unless the
assistant write also succeeds. No schema, contact, lead or qualify changes.

Manual/deployment follow-up: live PostgreSQL persistence, actual HTTP transport,
Yandex credentials and model quality are not tested by the local assertions.
