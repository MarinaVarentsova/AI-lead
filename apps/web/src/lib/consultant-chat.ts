import { apiFetch } from "./api";

export const CONSULTANT_ERROR = "Не удалось получить ответ. Попробуйте ещё раз.";

export class ConsultantLimitError extends Error {}
export async function sendConsultantTurn(conversationId: string, message: string, requestId?: string): Promise<{ message: string; limitReached: boolean }> {
  const response = await apiFetch("/api/consultant-chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message: message.trim(), ...(requestId ? { requestId } : {}) }),
  });
  if (response.status === 409) {
    const error = await response.json();
    if (error?.error === "FOLLOW_UP_LIMIT") throw new ConsultantLimitError("FOLLOW_UP_LIMIT");
    throw new Error(CONSULTANT_ERROR);
  }
  if (!response.ok) throw new Error(CONSULTANT_ERROR);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("message" in data) ||
    typeof data.message !== "string" || !data.message.trim()) throw new Error(CONSULTANT_ERROR);
  return { message: data.message, limitReached: "limitReached" in data && data.limitReached === true };
}

export async function sendConsultantMessage(conversationId: string, message: string): Promise<string> {
  return (await sendConsultantTurn(conversationId, message)).message;
}
