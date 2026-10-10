import { apiFetch } from "./api";

const EVENT_TIMEOUT_MS = 1500;

export interface ManagerCtaAttribution {
  referrer: string;
  artemEntrySource: "artem_web";
  artemEntryContent: "diagnostic_question_01";
  managerCtaSource: "recommendation" | "post_diagnostic_consultation" | "artem_chat";
  managerCtaContent: "manager_contact_button";
}

export async function recordManagerContactClick(sessionId: string, attribution: ManagerCtaAttribution): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EVENT_TIMEOUT_MS);
  try {
    const response = await apiFetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, eventType: "manager_contact_click", attribution }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("MANAGER_CONTACT_EVENT_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
