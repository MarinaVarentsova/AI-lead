import { apiFetch } from "./api";

async function persistDiagnosticTurn(payload: Record<string, unknown>): Promise<void> {
  const response = await apiFetch("/api/diagnostic/turns", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("DIAGNOSTIC_TURN_SAVE_FAILED");
}

export const recordDiagnosticQuestion = (conversationId: string, questionNumber: number) =>
  persistDiagnosticTurn({ conversationId, questionNumber, kind: "question" });

export const recordDiagnosticAnswer = (conversationId: string, questionNumber: number, answerCode: string,
  otherText?: string) => persistDiagnosticTurn({ conversationId, questionNumber, kind: "answer", answerCode,
  ...(otherText ? { otherText } : {}) });
