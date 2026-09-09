import { apiFetch } from "./api";

export const CONSULTANT_ERROR = "Не удалось получить ответ. Попробуйте ещё раз.";

export async function sendConsultantMessage(conversationId: string, message: string): Promise<string> {
  const response = await apiFetch("/api/consultant-chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message: message.trim() }),
  });
  if (!response.ok) throw new Error(CONSULTANT_ERROR);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("message" in data) ||
    typeof data.message !== "string" || !data.message.trim()) throw new Error(CONSULTANT_ERROR);
  return data.message;
}
