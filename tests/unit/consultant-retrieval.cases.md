# Consultant retrieval, stage 5A

Run `node tests/unit/consultant-retrieval.check.mjs` with Node 22.15+ and the
existing TypeScript dependency. No runner, model, embeddings or vector DB added.

The future backend loads knowledge/inobr/knowledge_base_inobr_ai_consultant_v1.md
once and constructs `new ConsultantKnowledgeResolver(markdown)`. Each subsequent
`resolve({ question, diagnosticContext })` returns only 2–5 sections, reasons,
a whitelisted context summary and a version including the source fingerprint.
No endpoint is connected here. Raw questions and arbitrary context properties
are intentionally absent from the provider-ready packet, avoiding echoed PII.

The catalog has 22 thematic groups with original numbered source references.
It uses the full existing document as input, but excludes diagnostic prompts,
CRM/scoring/PII templates and legacy integration instructions from consultation
retrieval. Unknown topics return FAQ/manager guidance without invented facts.

Business precedence: user-approved stage 5A requirements supersede the old
non-profile wording in 6.3, 8.2 and 16.5. These sections are not indexed.
ADMISSION_RULE and PRIORITY_RULE explicitly encode any СПО/ВО, no mandatory
construction experience, school restriction and Стройэксперт priority.
They are marked stage5a in catalog provenance; the original Markdown is unchanged.

The existing source has no separate program specification for «Строительный
контроль ИЖС», nor a detailed client-acquisition methodology. Matching groups
provide existing relevant facts and explicitly mark these gaps. No standalone
prices, legal rights or guaranteed clients are inferred from adjacent programs.

The eight requested questions are in consultant-retrieval.fixtures.json.
Additional assertions cover deterministic ordering, bounds, source coverage,
absence of stale education excerpts, professional education without experience,
school guards under multi-topic questions, privacy, invalid input and unknown
topics. Context codes are retained so already answered questions are not asked
again; they are not inferred from arbitrary free text. Explicit «у меня только
аттестат/школа» conservatively activates the school restriction.
