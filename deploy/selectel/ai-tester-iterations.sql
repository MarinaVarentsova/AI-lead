-- Additive migration; apply manually after ai-tester.sql. No production tables touched.
BEGIN;
ALTER TABLE public.ai_test_runs ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.ai_test_runs(id);
ALTER TABLE public.ai_test_runs ADD COLUMN IF NOT EXISTS iteration_number integer NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_test_runs_iteration_range' AND conrelid = 'public.ai_test_runs'::regclass) THEN
    ALTER TABLE public.ai_test_runs ADD CONSTRAINT ai_test_runs_iteration_range CHECK (iteration_number BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_test_runs_iteration_parent' AND conrelid = 'public.ai_test_runs'::regclass) THEN
    ALTER TABLE public.ai_test_runs ADD CONSTRAINT ai_test_runs_iteration_parent CHECK
      ((parent_run_id IS NULL AND iteration_number = 1) OR
       (parent_run_id IS NOT NULL AND parent_run_id <> id AND iteration_number > 1));
  END IF;
END $$;
COMMIT;
