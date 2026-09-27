import { apiFetch } from "./api";

const FIRST_TOUCH_STORAGE_KEY = "artem:first-touch-attribution-url";
const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "yclid",
] as const;

type SessionStorage = Pick<Storage, "getItem" | "setItem">;

export function firstTouchAttributionUrl(currentUrl: string, storage: SessionStorage): string {
  const saved = storage.getItem(FIRST_TOUCH_STORAGE_KEY);
  if (saved) return saved;
  let url: URL;
  try { url = new URL(currentUrl); }
  catch { return currentUrl; }
  if (ATTRIBUTION_KEYS.some(key => Boolean(url.searchParams.get(key)?.trim()))) {
    storage.setItem(FIRST_TOUCH_STORAGE_KEY, url.toString());
  }
  return url.toString();
}

export interface ArtemSessionResult { sessionId: string; sessionKey: string }

export async function createAttributedSession(): Promise<ArtemSessionResult> {
  const firstPageUrl = firstTouchAttributionUrl(window.location.href, window.sessionStorage);
  const response = await apiFetch("/api/sessions", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstPageUrl }) });
  if (!response.ok) throw new Error("SESSION_CREATE_FAILED");
  return response.json() as Promise<ArtemSessionResult>;
}
