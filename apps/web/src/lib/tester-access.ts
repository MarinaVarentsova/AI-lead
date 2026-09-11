import { apiFetch } from "./api";
const STORAGE_KEY = "inobr.internalTesterToken";
export const TESTER_UNAUTHORIZED_EVENT = "inobr:tester-unauthorized";
export const getTesterToken = () => sessionStorage.getItem(STORAGE_KEY);
export const saveTesterToken = (token: string) => sessionStorage.setItem(STORAGE_KEY, token);
export const clearTesterToken = () => sessionStorage.removeItem(STORAGE_KEY);
export class TesterUnauthorizedError extends Error {
  constructor() { super("Ключ доступа отсутствует или неверен."); }
}
export async function testerRequest<T>(url: `/api/tester/${string}`, options?: RequestInit): Promise<T> {
  // Never attach the secret to another API, URL, query string, or redirect target.
  if (!url.startsWith("/api/tester/") || url.includes("?") || url.includes("#")) throw new Error("Invalid tester path");
  const token = getTesterToken();
  if (!token) throw new TesterUnauthorizedError();
  const headers = new Headers(options?.headers);
  headers.set("X-Internal-Tester-Token", token);
  const response = await apiFetch(url, { ...options, headers, redirect: "error" });
  if (response.status === 401) {
    if (getTesterToken() === token) {
      clearTesterToken();
      window.dispatchEvent(new Event(TESTER_UNAUTHORIZED_EVENT));
    }
    throw new TesterUnauthorizedError();
  }
  if (!response.ok) throw new Error(response.status === 404 ? "Внутренний тестировщик недоступен." : `Ошибка тестировщика (HTTP ${response.status}).`);
  return response.json();
}
