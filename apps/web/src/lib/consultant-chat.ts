import { apiFetch } from "./api";

export const CONSULTANT_ERROR = "Не удалось получить ответ. Попробуйте ещё раз.";
export const CONSULTANT_LENGTH_ERROR = "Вопрос получился слишком длинным. Сократите его до 1000 знаков.";

export class ConsultantLimitError extends Error {}

/** getRandomValues is available on HTTP too; randomUUID requires a secure context. */
export function createConsultantRequestId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sendConsultantTurn(conversationId: string, message: string, requestId?: string): Promise<{ message: string; limitReached: boolean }> {
  const normalized = message.trim();
  if (!normalized) throw new Error(CONSULTANT_ERROR);
  if (normalized.length > 1000) throw new Error(CONSULTANT_LENGTH_ERROR);
  const options = {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message: normalized, ...(requestId ? { requestId } : {}) }),
  };
  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await apiFetch("/api/consultant-chat", options);
    } catch {
      if (!requestId || attempt > 0) throw new Error(CONSULTANT_ERROR);
      continue;
    }
    if (!requestId || attempt > 0 || ![502, 503, 504].includes(response.status)) break;
  }
  if (!response) throw new Error(CONSULTANT_ERROR);
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
