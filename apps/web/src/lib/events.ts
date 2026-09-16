import { apiFetch } from "./api";

const EVENT_TIMEOUT_MS = 1500;

export async function recordManagerContactClick(sessionId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EVENT_TIMEOUT_MS);
  try {
    const response = await apiFetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, eventType: "manager_contact_click" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("MANAGER_CONTACT_EVENT_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
