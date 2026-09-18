import { DiagnosticKnowledgeResolver } from "@workspace/domain/diagnostic";
import type { ArtemRuntime } from "../ai/artem-runtime";
import type { ConsultantExchange } from "../ai/consultant-funnel";
import { formatDiagnosticResult } from "../ai/format-diagnostic";
import { DiagnosticAIError } from "../ai/diagnostic-result.types";
import { generatePersonas, validateRunCount, type Persona } from "./personas";
import { CRITERIA, evaluatorPromptForMode, validateEvaluation, type Evaluation } from "./evaluator";
import { TESTER_MODE_DESCRIPTIONS, type TesterMode } from "./stress-modes";
import { buildDeterministicRunAssessment, RUN_ASSESSMENT_PROMPT, validateRunAssessment, type RunAssessment } from "./run-assessment";
export interface CaseResult {
  caseNumber: number; persona: Persona; diagnosticAnswers: Persona["answers"]; diagnosticResult: unknown;
  transcript: ConsultantExchange[]; evaluatorResult: Evaluation | null; score: number | null;
  verdict: "PASS" | "REVIEW" | "FAIL" | "TECH_ERROR"; errorMessage: string | null;
  stage: TesterStage | null; errorCode: string | null; errorDetail: string | null; attempts: number | null;
}
export interface TestStore { saveCase(result: CaseResult): Promise<void>; progress(count: number): Promise<void>; finish(summary: unknown): Promise<void> }
export type TesterStage = "diagnostic_generation" | "consultant_generation" | "evaluator" | "run_summary";
export const TESTER_AI_TIMEOUT_MS = 45_000;
export const TESTER_CASE_DELAY_MS = 1_000;
export const TESTER_RETRY_DELAYS_MS = [1_000, 2_000] as const;
interface TesterExecutionOptions {
  sleep(ms: number): Promise<void>;
  caseDelayMs: number;
  retryDelaysMs: readonly number[];
}
const defaultOptions: TesterExecutionOptions = {
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  caseDelayMs: TESTER_CASE_DELAY_MS,
  retryDelaysMs: TESTER_RETRY_DELAYS_MS,
};
class TesterStageError extends Error {
  constructor(readonly stage: TesterStage, readonly errorCode: string, readonly attempts: number, readonly detail: string) {
    super(errorCode);
  }
}
function safeErrorDetail(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.replace(/(?:https?:\/\/)?[^\s:@]+:[^\s@]+@/g, "[credentials]@")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]").slice(0, 300);
}
function technicalErrorCode(error: unknown): string | null {
  if (error instanceof DiagnosticAIError && ["AI_REQUEST_TIMEOUT", "AI_REQUEST_FAILED", "AI_INVALID_RESULT"].includes(error.code)) return error.code;
  if (error instanceof TypeError || (error instanceof Error && /timeout|network|transport|fetch|ECONN|INVALID_(?:EVALUATION|RUN_ASSESSMENT)/i.test(error.message))) {
    return error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "AI_REQUEST_FAILED";
  }
  return null;
}
async function executeAI<T>(stage: TesterStage, operation: () => Promise<T>, options: TesterExecutionOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const errorCode = technicalErrorCode(error) ??
        (stage === "evaluator" || stage === "run_summary" ? "AI_REQUEST_FAILED" : null);
      const delay = options.retryDelaysMs[attempt - 1];
      if (!errorCode || delay === undefined) {
        throw new TesterStageError(stage, errorCode ?? (error instanceof Error ? error.message : "CASE_EXECUTION_OR_EVALUATION_FAILED"), attempt, safeErrorDetail(error));
      }
      await options.sleep(delay);
    }
  }
}
function storedTechnicalError(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "") as { stage?: unknown; errorCode?: unknown; errorDetail?: unknown; attempts?: unknown };
    if (typeof parsed.stage === "string" && typeof parsed.errorCode === "string" && typeof parsed.attempts === "number") return {
      ...parsed, errorDetail: typeof parsed.errorDetail === "string" ? parsed.errorDetail : null,
    };
  } catch { /* legacy plain errorMessage */ }
  return { stage: null, errorCode: value, errorDetail: null, attempts: value ? 1 : null };
}
export function normalizeStoredCase<T extends { evaluatorResult: unknown; errorMessage: string | null; verdict: string | null; score: number | null }>(row: T) {
  let evaluatorResult: Evaluation | null = null;
  try { if (!row.errorMessage && row.verdict !== "TECH_ERROR") evaluatorResult = validateEvaluation(row.evaluatorResult); } catch { /* legacy invalid evaluator output */ }
  const technical = storedTechnicalError(row.errorMessage);
  return { ...row, evaluatorResult, score: evaluatorResult?.score ?? null,
    verdict: evaluatorResult?.verdict ?? "TECH_ERROR" as const,
    errorMessage: evaluatorResult ? null : technical.errorCode ?? "CASE_EXECUTION_OR_EVALUATION_FAILED",
    stage: evaluatorResult ? null : technical.stage, errorCode: evaluatorResult ? null : technical.errorCode,
    errorDetail: evaluatorResult ? null : technical.errorDetail, attempts: evaluatorResult ? null : technical.attempts };
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
export async function evaluateWithRetry<T>(evaluate: () => Promise<T>, options: Partial<TesterExecutionOptions> = {}): Promise<T> {
  return executeAI("evaluator", evaluate, { ...defaultOptions, ...options });
}
export async function runTester(count: number, runtime: ArtemRuntime, store: TestStore, personas = generatePersonas(count),
  executionOptions: Partial<TesterExecutionOptions> = {}, requestedMode: TesterMode = personas[0]?.mode ?? "Адекват") {
  validateRunCount(count);
  if (personas.length !== count || personas.some(p => p.questions.length < 1 || p.questions.length > 3)) throw new Error("INVALID_PERSONAS");
  const options = { ...defaultOptions, ...executionOptions };
  const results: CaseResult[] = [];
  const behaviourRules = runtime.markdown;
  for (const [index, persona] of personas.entries()) {
    const result: CaseResult = { caseNumber: index + 1, persona, diagnosticAnswers: persona.answers,
      diagnosticResult: null, transcript: [], evaluatorResult: null, score: null, verdict: "TECH_ERROR", errorMessage: null,
      stage: null, errorCode: null, errorDetail: null, attempts: null };
    let currentStage: TesterStage = "diagnostic_generation";
    try {
      const resolved = DiagnosticKnowledgeResolver.resolve(persona.answers);
      const diagnostic = await executeAI("diagnostic_generation", async () => {
        const outcome = await runtime.diagnostic.generate(DiagnosticKnowledgeResolver.buildFactsPacket(resolved));
        // The production runtime has already validated this fallback against the
        // same v3 result contract. Do not turn a valid production result back
        // into a tester-only schema failure.
        if (outcome.source === "fallback" && outcome.failureReason !== "AI_CONFIGURATION_ERROR" &&
          outcome.failureReason !== "AI_INVALID_RESULT") {
          throw new DiagnosticAIError(outcome.failureReason ?? "AI_REQUEST_FAILED");
        }
        return outcome;
      }, options);
      result.diagnosticResult = diagnostic;
      result.transcript.push({ role: "assistant", message: formatDiagnosticResult(diagnostic.result) });
      const history: ConsultantExchange[] = [];
      const relevant = new Map<string, { id: string; title: string; content: string }>();
      const turnMetadata: Awaited<ReturnType<ArtemRuntime["reply"]>>[] = [];
      for (const question of persona.questions) {
        currentStage = "consultant_generation";
        const facts = runtime.prepare(persona.answers, question, history);
        facts.matchedSections.forEach(section => relevant.set(section.id, section));
        const response = await executeAI("consultant_generation", async () => {
          const reply = await runtime.reply(facts, history);
          if (reply.fallbackReason && ["AI_REQUEST_TIMEOUT", "AI_REQUEST_FAILED", "AI_INVALID_RESULT"].includes(reply.fallbackReason)) {
            throw new DiagnosticAIError(reply.fallbackReason as "AI_REQUEST_TIMEOUT" | "AI_REQUEST_FAILED" | "AI_INVALID_RESULT");
          }
          return reply;
        }, options);
        const turn = [{ role: "user", message: question }, { role: "assistant", message: response.message }];
        history.push(...turn); result.transcript.push(...turn);
        turnMetadata.push(response);
      }

      currentStage = "evaluator";
      const activeMode = persona.mode ?? requestedMode;
      result.evaluatorResult = await executeAI("evaluator", async () => validateEvaluation(await runtime.provider.generateStructured(evaluatorPromptForMode(activeMode), {
        activeMode,
        persona, diagnosticAnswers: persona.answers, diagnosticResult: diagnostic,
        transcript: result.transcript, turnMetadata,
        expectedRules: { diagnostic: DiagnosticKnowledgeResolver.buildFactsPacket(resolved), behaviourRules,
          relevantSections: [...relevant.values()], maxAdditionalQuestions: 3 },
      })), options);
      result.score = result.evaluatorResult.score; result.verdict = result.evaluatorResult.verdict;
    } catch (error) {
      const failure = error instanceof TesterStageError ? error : new TesterStageError(currentStage,
        technicalErrorCode(error) ?? "CASE_EXECUTION_OR_EVALUATION_FAILED", 1, safeErrorDetail(error));
      result.errorMessage = failure.errorCode; result.stage = failure.stage; result.errorCode = failure.errorCode;
      result.errorDetail = failure.detail; result.attempts = failure.attempts;
    }
    results.push(result);
    await store.saveCase(result);
    await store.progress(index + 1);
    if (index + 1 < personas.length) await options.sleep(options.caseDelayMs);
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
      runEvaluation = await executeAI("run_summary", async () => validateRunAssessment(
        await runtime.provider.generateStructured(RUN_ASSESSMENT_PROMPT, {
          cases: assessed, metrics: scores, confirmedKnowledge: runtime.markdown,
          knowledgeSectionTitles: runtime.markdown.match(/^#{1,3} .+$/gm) ?? [],
        }), assessed.map(r => r.caseNumber), runtime.markdown, scores), options);
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
  const summary = { ...metrics, mode: requestedMode, modeDescription: TESTER_MODE_DESCRIPTIONS[requestedMode],
    modeSpecificSummary: `${requestedMode}: оценено ${metrics.evaluatedCases} из ${metrics.totalCases}; технических ошибок ${metrics.TECH_ERROR}.`,
    runEvaluation, codexTask: runEvaluation.codexTask, summaryError, summarySource };
  await store.finish(summary);
  return summary;
}
