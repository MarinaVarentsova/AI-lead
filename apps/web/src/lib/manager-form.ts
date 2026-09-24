import { apiFetch } from "./api";

export const MANAGER_CONTEXT_ERROR = "Не удалось подготовить данные консультации. Попробуйте ещё раз.";
export const MANAGER_SUBMIT_ERROR = "Не удалось отправить заявку. Попробуйте ещё раз.";

export async function loadManagerFormContext(sessionId: string): Promise<string> {
  const response = await apiFetch(`/api/manager-form/context/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error(MANAGER_CONTEXT_ERROR);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("sessionId" in data) || data.sessionId !== sessionId ||
    !("comment" in data) || typeof data.comment !== "string" || !data.comment.trim()) throw new Error(MANAGER_CONTEXT_ERROR);
  return data.comment;
}

export async function submitManagerForm(input: { sessionId: string; email: string; fullName: string; phone: string;
  personalDataConsent: boolean; marketingConsent: boolean }): Promise<void> {
  const response = await apiFetch("/api/manager-form/submit", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, sourceUrl: window.location.href, referrer: document.referrer }) });
  if (response.status !== 201) throw new Error(MANAGER_SUBMIT_ERROR);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("submitted" in data) || data.submitted !== true ||
    !("sessionId" in data) || data.sessionId !== input.sessionId) throw new Error(MANAGER_SUBMIT_ERROR);
}
