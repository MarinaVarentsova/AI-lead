import { apiUrl } from "./api";

export const MANAGER_CONTEXT_ERROR = "Не удалось подготовить данные консультации. Попробуйте ещё раз.";

export function managerWidgetUrl(sessionId: string): string {
  const query = new URLSearchParams({ sourceUrl: window.location.href, referrer: document.referrer });
  return `${apiUrl(`/api/manager-form/widget/${encodeURIComponent(sessionId)}`)}?${query}`;
}
