import { randomUUID } from "node:crypto";
import { asc, eq, max } from "drizzle-orm";
import { db, aiDialogue, aiEvents, aiSessions } from "@workspace/db";
import { DIAGNOSTIC_SCHEMA, DiagnosticKnowledgeResolver, diagnosticOptionLabel,
  type DiagnosticAnswers } from "@workspace/domain/diagnostic";
import { logger } from "../lib/logger";

export type DialogueSpeaker = "user" | "artem";
export type DialogueStage = "diagnostic" | "recommendation" | "consultation";
export type DialogueMessageType = "diagnostic_question" | "diagnostic_answer" | "recommendation" | "user_question" | "artem_answer";
export type DialogueRow = { id: string; sessionId: string; messageOrder: number; speaker: string;
  stage: string; messageType: string; text: string; createdAt?: Date | null };
export type NewDialogueMessage = { id?: string; speaker: DialogueSpeaker; stage: DialogueStage;
  messageType: DialogueMessageType; text: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const dbErrorCode = (error: unknown): string => {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) return value.code;
    current = value.cause;
  }
  return "UNKNOWN";
};

export async function getOrCreateSession(sessionKey: string = randomUUID()) {
  try {
    const [created] = await db.insert(aiSessions).values({ sessionKey }).onConflictDoNothing({ target: aiSessions.sessionKey })
      .returning({ id: aiSessions.id, sessionKey: aiSessions.sessionKey });
    if (created) return { session: created, created: true };
    const [existing] = await db.select({ id: aiSessions.id, sessionKey: aiSessions.sessionKey }).from(aiSessions)
      .where(eq(aiSessions.sessionKey, sessionKey)).limit(1);
    if (!existing) throw new Error("SESSION_LOOKUP_FAILED");
    return { session: existing, created: false };
  } catch (error) {
    logger.error({ stage: "session", errorCode: dbErrorCode(error) }, "SESSION_PERSISTENCE_FAILED");
    throw error;
  }
}

export async function findSession(sessionId: string) {
  const [session] = await db.select({ id: aiSessions.id, sessionKey: aiSessions.sessionKey }).from(aiSessions)
    .where(eq(aiSessions.id, sessionId)).limit(1);
  return session ?? null;
}

export async function withDialogueLock<T>(sessionId: string, action: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    const [session] = await tx.select({ id: aiSessions.id }).from(aiSessions)
      .where(eq(aiSessions.id, sessionId)).for("update");
    if (!session) throw new Error("SESSION_NOT_FOUND");
    return action(tx);
  });
}

export async function readDialogue(executor: Pick<typeof db, "select">, sessionId: string): Promise<DialogueRow[]> {
  return executor.select({ id: aiDialogue.id, sessionId: aiDialogue.sessionId, messageOrder: aiDialogue.messageOrder,
    speaker: aiDialogue.speaker, stage: aiDialogue.stage, messageType: aiDialogue.messageType,
    text: aiDialogue.text, createdAt: aiDialogue.createdAt }).from(aiDialogue)
    .where(eq(aiDialogue.sessionId, sessionId)).orderBy(asc(aiDialogue.messageOrder)) as Promise<DialogueRow[]>;
}

export async function appendDialogueLocked(tx: Transaction, sessionId: string, messages: readonly NewDialogueMessage[]) {
  if (!messages.length) return [];
  const [position] = await tx.select({ value: max(aiDialogue.messageOrder) }).from(aiDialogue)
    .where(eq(aiDialogue.sessionId, sessionId));
  const start = (position?.value ?? 0) + 1;
  try {
    return await tx.insert(aiDialogue).values(messages.map((message, index) => ({
      ...(message.id ? { id: message.id } : {}), sessionId, messageOrder: start + index,
      speaker: message.speaker, stage: message.stage, messageType: message.messageType, text: message.text.trim(),
    }))).returning();
  } catch (error) {
    logger.error({ sessionId, stage: "dialogue_insert", errorCode: dbErrorCode(error) }, "DIALOGUE_INSERT_FAILED");
    throw error;
  }
}

function diagnosticMessages(answers: DiagnosticAnswers): NewDialogueMessage[] {
  const resolved = DiagnosticKnowledgeResolver.resolve(answers);
  const codes = [resolved.answers.currentArea.code, resolved.answers.currentRole.code,
    resolved.answers.educationStatus.code, resolved.answers.targetTasks.code];
  return DIAGNOSTIC_SCHEMA.flatMap((question, index) => {
    const code = codes[index]!;
    const answer = question.field === "current_area" && code === "other"
      ? `Другая сфера: ${resolved.answers.currentArea.otherText}`
      : diagnosticOptionLabel(question.field, code)!;
    return [
      { speaker: "artem", stage: "diagnostic", messageType: "diagnostic_question", text: question.questionText },
      { speaker: "user", stage: "diagnostic", messageType: "diagnostic_answer", text: answer },
    ] satisfies NewDialogueMessage[];
  });
}

const sameDialogueMessage = (row: DialogueRow, message: NewDialogueMessage) =>
  row.speaker === message.speaker && row.stage === message.stage &&
  row.messageType === message.messageType && row.text === message.text;

export async function saveDiagnosticTurn(sessionId: string, questionNumber: number,
  answer?: { code: string; otherText?: string }) {
  const question = DIAGNOSTIC_SCHEMA[questionNumber - 1];
  if (!question) throw new Error("DIAGNOSTIC_TURN_INVALID");
  const questionMessage: NewDialogueMessage = { speaker: "artem", stage: "diagnostic",
    messageType: "diagnostic_question", text: question.questionText };
  let message = questionMessage;
  let index = (questionNumber - 1) * 2;
  if (answer) {
    const option = question.options.find(item => item.code === answer.code);
    if (!option) throw new Error("DIAGNOSTIC_TURN_INVALID");
    const otherText = answer.otherText?.trim();
    if (option.allowsFreeText && (!otherText || otherText.length > 200)) throw new Error("DIAGNOSTIC_TURN_INVALID");
    if (!option.allowsFreeText && otherText) throw new Error("DIAGNOSTIC_TURN_INVALID");
    message = { speaker: "user", stage: "diagnostic", messageType: "diagnostic_answer",
      text: option.allowsFreeText ? `Другая сфера: ${otherText}` : option.label };
    index++;
  }
  return withDialogueLock(sessionId, async tx => {
    const existing = (await readDialogue(tx, sessionId)).filter(row => row.stage === "diagnostic");
    if (answer && (!existing[index - 1] || !sameDialogueMessage(existing[index - 1], questionMessage))) {
      throw new Error("DIAGNOSTIC_DIALOGUE_CONFLICT");
    }
    if (existing[index]) {
      if (!sameDialogueMessage(existing[index], message)) throw new Error("DIAGNOSTIC_DIALOGUE_CONFLICT");
      return { row: existing[index], created: false };
    }
    if (existing.length !== index) throw new Error("DIAGNOSTIC_DIALOGUE_CONFLICT");
    const [row] = await appendDialogueLocked(tx, sessionId, [message]);
    if (!row) throw new Error("DIALOGUE_INSERT_FAILED");
    return { row, created: true };
  });
}

export async function saveDiagnosticDialogue(sessionId: string, answers: DiagnosticAnswers) {
  const expected = diagnosticMessages(answers);
  return withDialogueLock(sessionId, async tx => {
    const existing = (await readDialogue(tx, sessionId)).filter(row => row.stage === "diagnostic");
    const matches = existing.length <= expected.length && existing.every((row, index) =>
      sameDialogueMessage(row, expected[index]!));
    if (!matches) throw new Error("DIAGNOSTIC_DIALOGUE_CONFLICT");
    if (existing.length === expected.length) return existing;
    return [...existing, ...await appendDialogueLocked(tx, sessionId, expected.slice(existing.length))];
  });
}

export function diagnosticAnswersFromDialogue(rows: readonly DialogueRow[]): DiagnosticAnswers {
  const answers = rows.filter(row => row.stage === "diagnostic" && row.messageType === "diagnostic_answer")
    .sort((left, right) => left.messageOrder - right.messageOrder);
  if (answers.length !== 4) throw new Error("DIAGNOSTIC_ANSWERS_NOT_FOUND");
  const codeFor = (question: typeof DIAGNOSTIC_SCHEMA[number], text: string): string => {
    const option = question.options.find(item => item.label === text);
    if (!option) throw new Error("DIAGNOSTIC_ANSWER_INVALID");
    return option.code;
  };
  const firstText = answers[0]!.text;
  const otherPrefix = "Другая сфера: ";
  const currentArea = firstText.startsWith(otherPrefix) ? "other" : codeFor(DIAGNOSTIC_SCHEMA[0], firstText);
  return {
    current_area: currentArea,
    ...(currentArea === "other" ? { current_area_other_text: firstText.slice(otherPrefix.length).trim() } : {}),
    current_role: codeFor(DIAGNOSTIC_SCHEMA[1], answers[1]!.text),
    education_status: codeFor(DIAGNOSTIC_SCHEMA[2], answers[2]!.text),
    target_tasks: codeFor(DIAGNOSTIC_SCHEMA[3], answers[3]!.text),
  };
}

export async function recordEvent(sessionId: string, eventType: string, eventData?: unknown) {
  try {
    const [event] = await db.insert(aiEvents).values({ sessionId, eventType, eventData: eventData ?? null })
      .returning({ id: aiEvents.id, sessionId: aiEvents.sessionId });
    if (!event) throw new Error("EVENT_INSERT_EMPTY");
    return event;
  } catch (error) {
    logger.error({ sessionId, stage: "event_insert", eventType, errorCode: dbErrorCode(error) }, "EVENT_INSERT_FAILED");
    throw error;
  }
}

export const consultationRows = (rows: readonly DialogueRow[]) => rows.filter(row => row.stage === "consultation");
