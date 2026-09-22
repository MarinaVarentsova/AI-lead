import { asc, eq } from "drizzle-orm";
import { aiDialogue, aiSessions, db } from "@workspace/db";
import { DIAGNOSTIC_SCHEMA, DiagnosticKnowledgeResolver, SOURCE_VERSION,
  type DiagnosticAnswers, type DiagnosticField } from "@workspace/domain/diagnostic";
import { diagnosticProgram, PROGRAM_NAMES } from "../ai/artem-policy";
import { YandexAIProvider } from "../ai/yandex-provider";
import { logger } from "../lib/logger";
import type { DialogueRow } from "../persistence/artem-repository";

export const MANAGER_LEAD_SUMMARY_PROMPT = `Сформируй краткое описание диалога для менеджера отдела продаж.

Используй ТОЛЬКО переданные данные диагностики, рекомендацию Артёма и диалог после рекомендации.
Не придумывай намерение купить, бюджет, степень готовности, возражения, свойства программы, скидки, гарантии, документы или условия обучения, которых пользователь не сообщал и которых нет в переданных ответах.
Не делай выводов о мотивации пользователя.

Содержание summary:
1. профессиональный или учебный контекст пользователя;
2. какая программа была рекомендована и почему;
3. что пользователь уточнял после рекомендации;
4. какие важные ответы уже получил;
5. на чём закончился разговор.

Пиши кратко и нейтрально, для менеджера. Максимум 1000 символов.
Верни JSON строго вида {"summary":"обычный текст"}.`;

export class ManagerLeadContextError extends Error {
  constructor(readonly code: "SESSION_NOT_FOUND" | "RECOMMENDATION_NOT_READY") { super(code); }
}

export interface ManagerLeadContext {
  sessionId: string;
  recommendedProgram: string;
  recommendationText: string;
  diagnostic: { currentArea: string; currentRole: string; educationStatus: string; targetTasks: string };
  dialogSummary: string;
  transcript: { role: "user" | "assistant"; text: string }[];
  knowledgeBaseVersion: string;
  createdAt: string;
  summarySource: "ai" | "fallback";
}

interface LeadSession { id: string; createdAt: Date | null }
interface ManagerLeadDependencies {
  load(sessionId: string): Promise<{ session: LeadSession; dialogue: DialogueRow[] } | null>;
  summarize(prompt: string, input: unknown): Promise<unknown>;
  warn(data: Record<string, unknown>, message: string): void;
}

const defaultDependencies: ManagerLeadDependencies = {
  async load(sessionId) {
    const [session] = await db.select({ id: aiSessions.id, createdAt: aiSessions.createdAt }).from(aiSessions)
      .where(eq(aiSessions.id, sessionId)).limit(1);
    if (!session) return null;
    const dialogue = await db.select({ id: aiDialogue.id, sessionId: aiDialogue.sessionId,
      messageOrder: aiDialogue.messageOrder, speaker: aiDialogue.speaker, stage: aiDialogue.stage,
      messageType: aiDialogue.messageType, text: aiDialogue.text, createdAt: aiDialogue.createdAt })
      .from(aiDialogue).where(eq(aiDialogue.sessionId, sessionId)).orderBy(asc(aiDialogue.messageOrder)) as DialogueRow[];
    return { session, dialogue };
  },
  summarize: (prompt, input) => new YandexAIProvider().generateStructured(prompt, input),
  warn: (data, message) => { logger.warn(data, message); },
};

const outputKeys = ["currentArea", "currentRole", "educationStatus", "targetTasks"] as const;
const answerKeys = ["current_area", "current_role", "education_status", "target_tasks"] as const;

function diagnosticData(rows: readonly DialogueRow[], sessionId: string, warn: ManagerLeadDependencies["warn"]) {
  const answers = rows.filter(row => row.stage === "diagnostic" && row.messageType === "diagnostic_answer")
    .sort((left, right) => left.messageOrder - right.messageOrder);
  const labels = {} as ManagerLeadContext["diagnostic"];
  const codes: Partial<DiagnosticAnswers> = {};
  for (const [index, question] of DIAGNOSTIC_SCHEMA.entries()) {
    const raw = answers[index]?.text?.trim() || "Не указано";
    const otherPrefix = "Другая сфера: ";
    if (question.field === "current_area" && raw.startsWith(otherPrefix)) {
      labels.currentArea = raw.slice(otherPrefix.length).trim() || "Другая сфера";
      codes.current_area = "other"; codes.current_area_other_text = labels.currentArea;
      continue;
    }
    const option = question.options.find(item => item.label === raw || item.code === raw);
    labels[outputKeys[index]!] = option?.label ?? raw;
    if (option) (codes as Record<DiagnosticField, string>)[answerKeys[index]!] = option.code;
    else warn({ sessionId, stage: "diagnostic_label", field: question.field, errorCode: "UNKNOWN_DIAGNOSTIC_VALUE" },
      "MANAGER_LEAD_CONTEXT_WARNING");
  }
  return { labels, codes };
}

function recommendedProgram(codes: Partial<DiagnosticAnswers>, recommendationText: string): string {
  try {
    const resolved = DiagnosticKnowledgeResolver.resolve(codes as DiagnosticAnswers);
    return PROGRAM_NAMES[diagnosticProgram(DiagnosticKnowledgeResolver.buildFactsPacket(resolved))];
  } catch {
    return Object.values(PROGRAM_NAMES).find(name => recommendationText.includes(name)) ?? "Не определено";
  }
}

function summaryText(value: unknown): string {
  const summary = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { summary?: unknown }).summary : undefined;
  if (typeof summary !== "string" || !summary.trim() || summary.trim().length > 1000) throw new Error("AI_INVALID_RESULT");
  return summary.trim();
}

export async function buildManagerLeadContext(sessionId: string,
  dependencies: ManagerLeadDependencies = defaultDependencies): Promise<ManagerLeadContext> {
  const loaded = await dependencies.load(sessionId);
  if (!loaded) throw new ManagerLeadContextError("SESSION_NOT_FOUND");
  const rows = [...loaded.dialogue].sort((left, right) => left.messageOrder - right.messageOrder);
  const recommendation = rows.find(row => row.stage === "recommendation" && row.messageType === "recommendation");
  if (!recommendation?.text.trim()) throw new ManagerLeadContextError("RECOMMENDATION_NOT_READY");
  const diagnostic = diagnosticData(rows, sessionId, dependencies.warn);
  const transcript = rows.filter(row => row.stage === "consultation" &&
      (row.messageType === "user_question" || row.messageType === "artem_answer") &&
      (row.speaker === "user" || row.speaker === "artem"))
    .map(row => ({ role: row.speaker === "user" ? "user" as const : "assistant" as const, text: row.text }));
  const program = recommendedProgram(diagnostic.codes, recommendation.text);
  const fallback = `Рекомендована программа: ${program}. Пользователь прошёл диагностику и задал ${transcript.filter(row => row.role === "user").length} дополнительных вопросов после рекомендации. Полный диалог приложен.`;
  let dialogSummary = fallback;
  let summarySource: "ai" | "fallback" = "fallback";
  try {
    dialogSummary = summaryText(await dependencies.summarize(MANAGER_LEAD_SUMMARY_PROMPT, {
      diagnostic: diagnostic.labels, recommendedProgram: program,
      recommendationText: recommendation.text, transcript,
    }));
    summarySource = "ai";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const errorCode = /^[A-Z][A-Z0-9_]+$/.test(message) ? message : "AI_SUMMARY_FAILED";
    dependencies.warn({ sessionId, stage: "summary", errorCode },
      "MANAGER_LEAD_SUMMARY_FALLBACK");
  }
  return { sessionId, recommendedProgram: program, recommendationText: recommendation.text,
    diagnostic: diagnostic.labels, dialogSummary, transcript, knowledgeBaseVersion: SOURCE_VERSION,
    createdAt: (loaded.session.createdAt ?? recommendation.createdAt ?? new Date(0)).toISOString(), summarySource };
}
