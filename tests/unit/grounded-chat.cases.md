# Grounded post-diagnostic chat

Source: knowledge/inobr/artem-expertovich-final.md, copied unchanged from the
user's final instruction. Consultant retrieval no longer reads the legacy KB.
Only selected knowledge sections are indexed; the document's sales/Bitrix and
first-question instructions do not override the existing diagnostic/contact UI.

Local checks (existing Node and TypeScript, no added runner):

- consultant-retrieval.check.mjs: 16 questions, final source, section bounds and context.
- consultant-chat.check.mjs: missing config, AI success, multiple persisted exchanges,
  error responses, PII/passport filtering and provider payload projection.
- consultant-frontend.check.mjs: three sequential requests, HTTP/JSON/network errors
  and retry through the configured API origin.

An unrecognized topic returns FAQ/manager sections. The service then returns the
insufficient-knowledge text without invoking the provider. Weather is explicitly
excluded even when the diagnostic profile points to Стройэксперт. No web search,
tools or external sources are configured in the Yandex request. Other answers are
constrained by the system prompt and selected source; this is not a general proof
of factual correctness for every possible model output.

History is persisted but not forwarded. Known diagnostic codes are forwarded;
raw answers and contacts are not. Recognizable names/contact details and passport
numbers are redacted; arbitrary free-text PII recognition remains pattern-based.

UI cases to verify in a browser (not claimed as automated browser coverage):
1. Complete diagnosis; ask two questions: result and earlier exchanges stay visible.
2. Double-click Send while pending: only one request; input disabled, loader visible.
3. Fail a request: draft retained, neutral error; Retry does not duplicate the user bubble.
4. Retry successfully: append assistant answer, clear draft, accept the next question.
5. Enter sends, Shift+Enter inserts a line; composition input does not submit.
6. Manager/contact form and four diagnostic questions remain unchanged.
