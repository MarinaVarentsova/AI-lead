import { DiagnosticKnowledgeResolver } from "@workspace/domain/diagnostic";
import type { ArtemRuntime } from "../ai/artem-runtime";
import type { ConsultantExchange } from "../ai/consultant-funnel";
import { formatDiagnosticResult } from "../ai/format-diagnostic";
import { DiagnosticAIError } from "../ai/diagnostic-result.types";
import { generatePersonas, validateRunCount, type Persona } from "./personas";
import { EVALUATOR_PROMPT, SUMMARY_PROMPT, validateEvaluation, validateSummary, type Evaluation } from "./evaluator";
export interface CaseResult {
  caseNumber: number; persona: Persona; diagnosticAnswers: Persona["answers"]; diagnosticResult: unknown;
  transcript: ConsultantExchange[]; evaluatorResult: Evaluation | null; score: number | null;
  verdict: "PASS" | "REVIEW" | "FAIL"; errorMessage: string | null;
}
export interface TestStore { saveCase(result: CaseResult): Promise<void>; progress(count: number): Promise<void>; finish(summary: unknown): Promise<void> }
export function aggregate(results: CaseResult[]) {
  const evaluated = results.flatMap(r => r.evaluatorResult ? [r.evaluatorResult] : []);
  const avg = (get: (v: Evaluation) => number) => evaluated.length ? Math.round(evaluated.reduce((n,v) => n + get(v),0) / evaluated.length) : null;
  return { totalCases: results.length, PASS: results.filter(r => r.verdict === "PASS").length,
    REVIEW: results.filter(r => r.verdict === "REVIEW").length, FAIL: results.filter(r => r.verdict === "FAIL").length,
    evaluatedCases: evaluated.length, errorCases: results.filter(r => r.errorMessage).length,
    averageScore: avg(v => v.score), averageQualificationScore: avg(v => v.criteria.qualification),
    averageGroundingScore: avg(v => v.criteria.grounding), averageSalesFunnelScore: avg(v => (v.criteria.sales + v.criteria.cta + v.criteria.conversion) / 3) };
}
export async function runTester(count: number, runtime: ArtemRuntime, store: TestStore, personas = generatePersonas(count)) {
  validateRunCount(count);
  if (personas.length !== count || personas.some(p => p.questions.length < 1 || p.questions.length > 3)) throw new Error("INVALID_PERSONAS");
  const results: CaseResult[] = [];
  const behaviourRules = runtime.markdown.split(/(?=^# \d+\.)/m).filter(section => /^# (?:2|30|49|50|51|52|54|59)\./.test(section)).join("\n");
  for (const [index, persona] of personas.entries()) {
    const result: CaseResult = { caseNumber: index + 1, persona, diagnosticAnswers: persona.answers,
      diagnosticResult: null, transcript: [], evaluatorResult: null, score: null, verdict: "FAIL", errorMessage: null };
    try {
      const resolved = DiagnosticKnowledgeResolver.resolve(persona.answers);
      const diagnostic = await runtime.diagnostic.generate(DiagnosticKnowledgeResolver.buildFactsPacket(resolved));
      result.diagnosticResult = diagnostic;
      result.transcript.push({ role: "assistant", message: formatDiagnosticResult(diagnostic.result) });
      const history: ConsultantExchange[] = [];
      const relevant = new Map<string, { id: string; title: string; content: string }>();
      const turnMetadata = [];
      for (const question of persona.questions) {
        const facts = runtime.prepare(persona.answers, question);
        facts.matchedSections.forEach(section => relevant.set(section.id, section));
        const response = await runtime.reply(facts, history);
        const turn = [{ role: "user", message: question }, { role: "assistant", message: response.message }];
        history.push(...turn); result.transcript.push(...turn);
        turnMetadata.push(response);
      }

      result.evaluatorResult = validateEvaluation(await runtime.provider.generateStructured(EVALUATOR_PROMPT, {
        persona, diagnosticAnswers: persona.answers, diagnosticResult: diagnostic,
        transcript: result.transcript, turnMetadata,
        expectedRules: { diagnostic: DiagnosticKnowledgeResolver.buildFactsPacket(resolved), behaviourRules,
          relevantSections: [...relevant.values()], maxAdditionalQuestions: 3 },
      }));
      result.score = result.evaluatorResult.score; result.verdict = result.evaluatorResult.verdict;
    } catch (error) {
      result.errorMessage = error instanceof DiagnosticAIError ? error.code : "CASE_EXECUTION_OR_EVALUATION_FAILED";
    }
    results.push(result);
    await store.saveCase(result);
    await store.progress(index + 1);
  }
  let aiSummary: ReturnType<typeof validateSummary> | null = null;
  let summaryError: string | null = null;
  try {
    aiSummary = validateSummary(await runtime.provider.generateStructured(SUMMARY_PROMPT,
      results.map(({ caseNumber, evaluatorResult, errorMessage }) => ({ caseNumber, evaluatorResult, errorMessage }))));
  } catch { summaryError = "AI_SUMMARY_UNAVAILABLE"; }
  const summary = { ...aggregate(results), aiSummary, summaryError };
  await store.finish(summary);
  return summary;
}
