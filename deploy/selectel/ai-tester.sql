-- Additive only. Run manually before enabling /api/tester. No production data writes.
CREATE TABLE IF NOT EXISTS public.ai_test_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL,
 requested_cases integer NOT NULL CHECK (requested_cases BETWEEN 1 AND 10), completed_cases integer NOT NULL DEFAULT 0,
 knowledge_version text NOT NULL, summary jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_test_runs_one_active ON public.ai_test_runs(status) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS public.ai_test_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.ai_test_runs(id), case_number integer NOT NULL,
 persona jsonb NOT NULL, diagnostic_answers jsonb NOT NULL, diagnostic_result jsonb, transcript jsonb,
 evaluator_result jsonb, score integer, verdict text, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_test_cases_run_number ON public.ai_test_cases(run_id, case_number);
