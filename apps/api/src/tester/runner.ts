import { DiagnosticKnowledgeResolver } from "@workspace/domain/diagnostic";
import type { ArtemRuntime } from "../ai/artem-runtime";
import type { ConsultantExchange } from "../ai/consultant-funnel";
import { formatDiagnosticResult } from "../ai/format-diagnostic";
import { DiagnosticAIError } from "../ai/diagnostic-result.types";
import { generatePersonas, validateRunCount, type Persona } from "./personas";
import { CRITERIA, EVALUATOR_PROMPT, validateEvaluation, type Evaluation } from "./evaluator";
import { buildDeterministicRunAssessment, RUN_ASSESSMENT_PROMPT, validateRunAssessment, type RunAssessment } from "./run-assessment";
export interface CaseResult {
  caseNumber: number; persona: Persona; diagnosticAnswers: Persona["answers"]; diagnosticResult: unknown;
  transcript: ConsultantExchange[]; evaluatorResult: Evaluation | null; score: number | null;
  verdict: "PASS" | "REVIEW" | "FAIL" | "TECH_ERROR"; errorMessage: string | null;
}
export interface TestStore { saveCase(result: CaseResult): Promise<void>; progress(count: number): Promise<void>; finish(summary: unknown): Promise<void> }
export function normalizeStoredCase<T extends { evaluatorResult: unknown; errorMessage: string | null; verdict: string | null; score: number | null }>(row: T) {
  let evaluatorResult: Evaluation | null = null;
  try { if (!row.errorMessage && row.verdict !== "TECH_ERROR") evaluatorResult = validateEvaluation(row.evaluatorResult); } catch { /* legacy invalid evaluator output */ }
  return { ...row, evaluatorResult, score: evaluatorResult?.score ?? null,
    verdict: evaluatorResult?.verdict ?? "TECH_ERROR" as const,
    errorMessage: evaluatorResult ? null : row.errorMessage ?? "CASE_EXECUTION_OR_EVALUATION_FAILED" };
}
export function aggregate(results: Pick<CaseResult, "verdict" | "errorMessage" | "evaluatorResult">[]) {
  const quality = results.filter(r => r.verdict !== "TECH_ERROR" && !r.errorMessage && r.evaluatorResult);
  const evaluated = quality.map(r => r.evaluatorResult!);
  const avg = (get: (v: Evaluation) => number) => evaluated.length ? Math.round(evaluated.reduce((n,v) => n + get(v),0) / evaluated.length) : null;
  const criterionScores = Object.fromEntries(CRITERIA.map(key => [key, avg(v => v.criteria[key])])) as
    Record<typeof CRITERIA[number], number | null>;
  return { totalCases: results.length, PASS: quality.filter(r => r.verdict === "PASS").length,
    REVIEW: quality.filter(r => r.verdict === "REVIEW").length, FAIL: quality.filter(r => r.verdict === "FAIL").length,
    TECH_ERROR: results.length - evaluated.length,
    evaluatedCases: evaluated.length, errorCases: results.length - evaluated.length,
    averageScore: avg(v => v.score), averageQualificationScore: criterionScores.qualification,
    averageGroundingScore: criterionScores.grounding,
    averageSalesFunnelScore: avg(v => (v.criteria.sales + v.criteria.cta + v.criteria.conversion) / 3),
    criterionScores };
}
export async function evaluateWithRetry<T>(evaluate: () => Promise<T>): Promise<T> {
  try { return await evaluate(); } catch { return evaluate(); }
}
export async function runTester(count: number, runtime: ArtemRuntime, store: TestStore, personas = generatePersonas(count)) {
  validateRunCount(count);
  if (personas.length !== count || personas.some(p => p.questions.length < 1 || p.questions.length > 3)) throw new Error("INVALID_PERSONAS");
  const results: CaseResult[] = [];
  const behaviourRules = runtime.markdown.split(/(?=^# \d+\.)/m).filter(section => /^# (?:2|30|49|50|51|52|54|59)\./.test(section)).join("\n");
  for (const [index, persona] of personas.entries()) {
    const result: CaseResult = { caseNumber: index + 1, persona, diagnosticAnswers: persona.answers,
      diagnosticResult: null, transcript: [], evaluatorResult: null, score: null, verdict: "TECH_ERROR", errorMessage: null };
    try {
      const resolved = DiagnosticKnowledgeResolver.resolve(persona.answers);
      const diagnostic = await runtime.diagnostic.generate(DiagnosticKnowledgeResolver.buildFactsPacket(resolved));
      result.diagnosticResult = diagnostic;
      result.transcript.push({ role: "assistant", message: formatDiagnosticResult(diagnostic.result) });
      const history: ConsultantExchange[] = [];
      const relevant = new Map<string, { id: string; title: string; content: string }>();
      const turnMetadata: Awaited<ReturnType<ArtemRuntime["reply"]>>[] = [];
      for (const question of persona.questions) {
        const facts = runtime.prepare(persona.answers, question);
        facts.matchedSections.forEach(section => relevant.set(section.id, section));
        const response = await runtime.reply(facts, history);
        const turn = [{ role: "user", message: question }, { role: "assistant", message: response.message }];
        history.push(...turn); result.transcript.push(...turn);
        turnMetadata.push(response);
      }

      result.evaluatorResult = await evaluateWithRetry(async () => validateEvaluation(await runtime.provider.generateStructured(EVALUATOR_PROMPT, {
        persona, diagnosticAnswers: persona.answers, diagnosticResult: diagnostic,
        transcript: result.transcript, turnMetadata,
        expectedRules: { diagnostic: DiagnosticKnowledgeResolver.buildFactsPacket(resolved), behaviourRules,
          relevantSections: [...relevant.values()], maxAdditionalQuestions: 3 },
      })));
      result.score = result.evaluatorResult.score; result.verdict = result.evaluatorResult.verdict;
    } catch (error) {
      result.errorMessage = error instanceof DiagnosticAIError ? error.code : "CASE_EXECUTION_OR_EVALUATION_FAILED";
    }
    results.push(result);
    await store.saveCase(result);
    await store.progress(index + 1);
  }
  let runEvaluation: RunAssessment | null = null;
  let summarySource: "ai" | "deterministic" = "deterministic";
  let summaryError: string | null = null;
  const metrics = aggregate(results);
  const assessed = results.filter(r => r.evaluatorResult && r.verdict !== "TECH_ERROR" && !r.errorMessage);
  if (assessed.length) {
    const scores = { overallScore: metrics.averageScore, qualificationScore: metrics.averageQualificationScore,
      knowledgeGroundingScore: metrics.averageGroundingScore, salesFunnelScore: metrics.averageSalesFunnelScore,
      criterionScores: metrics.criterionScores };
    try {
      runEvaluation = await evaluateWithRetry(async () => validateRunAssessment(
        await runtime.provider.generateStructured(RUN_ASSESSMENT_PROMPT, {
          cases: assessed, metrics: scores, confirmedKnowledge: runtime.markdown,
          knowledgeSectionTitles: runtime.markdown.match(/^# .+$/gm) ?? [],
        }), assessed.map(r => r.caseNumber), runtime.markdown, scores));
      summarySource = "ai";
    } catch {
      summaryError = "AI_SUMMARY_UNAVAILABLE";
      runEvaluation = buildDeterministicRunAssessment(assessed, scores);
    }
  } else {
    summaryError = "NO_EVALUATED_CASES";
    const scores = { overallScore: metrics.averageScore, qualificationScore: metrics.averageQualificationScore,
      knowledgeGroundingScore: metrics.averageGroundingScore, salesFunnelScore: metrics.averageSalesFunnelScore,
      criterionScores: metrics.criterionScores };
    runEvaluation = buildDeterministicRunAssessment([], scores);
  }
  const summary = { ...metrics, runEvaluation, codexTask: runEvaluation.codexTask, summaryError, summarySource };
  await store.finish(summary);
  return summary;
}
