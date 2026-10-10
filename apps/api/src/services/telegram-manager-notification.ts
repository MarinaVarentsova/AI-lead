import type { ManagerLeadContext } from "./manager-lead-context";
import type { ManagerFormTrace } from "./getcourse-manager-form";

const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const TELEGRAM_SAFE_MESSAGE_LENGTH = 3900;
const TELEGRAM_TIMEOUT_MS = 5000;

interface TelegramEnvironment {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface ManagerLeadContacts { name: string; phone: string; email: string }
export type TelegramNotificationResult =
  | { status: "sent"; messageCount: number }
  | { status: "skipped"; reason: "missing_token" | "missing_chat_id" }
  | { status: "error"; messageCount: number; httpStatus?: number };

const sourceLines = (context: ManagerLeadContext): string[] => [
  context.utmSource && `utm_source: ${context.utmSource}`,
  context.utmMedium && `utm_medium: ${context.utmMedium}`,
  context.utmCampaign && `utm_campaign: ${context.utmCampaign}`,
  context.utmContent && `utm_content: ${context.utmContent}`,
  context.utmTerm && `utm_term: ${context.utmTerm}`,
  context.gclid && `gclid: ${context.gclid}`,
  context.yclid && `yclid: ${context.yclid}`,
].filter((value): value is string => Boolean(value));

const entryLines = (context: ManagerLeadContext): string[] => [
  context.artemEntrySource && `artem_entry_source: ${context.artemEntrySource}`,
  context.artemEntryContent && `artem_entry_content: ${context.artemEntryContent}`,
  context.managerCtaSource && `manager_cta_source: ${context.managerCtaSource}`,
  context.managerCtaContent && `manager_cta_content: ${context.managerCtaContent}`,
].filter((value): value is string => Boolean(value));

function splitLongText(value: string, limit = TELEGRAM_SAFE_MESSAGE_LENGTH): string[] {
  if (value.length <= limit) return [value];
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit);
    const newline = candidate.lastIndexOf("\n");
    const space = candidate.lastIndexOf(" ");
    const boundary = Math.max(newline, space, Math.floor(limit * 0.7));
    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function packSections(sections: string[]): string[] {
  const messages: string[] = [];
  let current = "";
  const append = (section: string) => {
    const combined = current ? `${current}\n\n${section}` : section;
    if (combined.length <= TELEGRAM_SAFE_MESSAGE_LENGTH) { current = combined; return; }
    if (current) messages.push(current);
    const chunks = splitLongText(section);
    messages.push(...chunks.slice(0, -1));
    current = chunks.at(-1) ?? "";
  };
  sections.filter(Boolean).forEach(append);
  if (current) messages.push(current);
  return messages;
}

export function managerLeadContacts(params: URLSearchParams): ManagerLeadContacts {
  return {
    name: params.get("formParams[full_name]")?.trim() ?? "",
    phone: params.get("formParams[phone]")?.trim() ?? "",
    email: params.get("formParams[email]")?.trim() ?? "",
  };
}

export function formatTelegramManagerLead(context: ManagerLeadContext,
  contacts: ManagerLeadContacts): string[] {
  const sources = sourceLines(context);
  const entry = entryLines(context);
  const transcript = context.transcript.length
    ? context.transcript.map(turn => `${turn.role === "user" ? "Пользователь" : "Артём"}: ${turn.text}`).join("\n")
    : "Дополнительных вопросов не было.";
  const identity = [
    "🆕 Новая заявка от Артёма", "",
    `👤 Имя: ${contacts.name}`, `📞 Телефон: ${contacts.phone}`, `✉️ Email: ${contacts.email}`, "",
    "🎓 Рекомендованная программа:", context.recommendedProgram, "",
    "🔗 Session ID:", context.sessionId, "", "📚 KB:", context.knowledgeBaseVersion,
  ].join("\n");
  const details = [
    "💬 Рекомендация Артёма:", context.recommendationText, "", "📋 Диагностика:",
    `Сфера: ${context.diagnostic.currentArea}`, `Роль: ${context.diagnostic.currentRole}`,
    `Образование: ${context.diagnostic.educationStatus}`, `Задача: ${context.diagnostic.targetTasks}`, "",
    "📝 Кратко:", context.dialogSummary,
    ...(sources.length ? ["", "📊 Источник:", ...sources] : []),
    ...(entry.length ? ["", "🔘 Точка входа:", ...entry] : []),
  ].join("\n");
  return packSections([identity, details, `💭 Диалог:\n${transcript}`]);
}

export async function sendTelegramManagerLead(context: ManagerLeadContext, contacts: ManagerLeadContacts,
  env: TelegramEnvironment = process.env, fetcher: typeof fetch = fetch,
  trace: ManagerFormTrace = () => {}): Promise<TelegramNotificationResult> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token) {
    trace("telegram_notification_skipped", { reason: "missing_token", chatId: chatId || null });
    return { status: "skipped", reason: "missing_token" };
  }
  if (!chatId) {
    trace("telegram_notification_skipped", { reason: "missing_chat_id", chatId: null });
    return { status: "skipped", reason: "missing_chat_id" };
  }
  const messages = formatTelegramManagerLead(context, contacts);
  trace("telegram_notification_start", { chatId, messageCount: messages.length,
    messageLengths: messages.map(message => message.length) });
  const endpoint = `${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`;
  let sent = 0;
  try {
    for (const message of messages) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetcher(endpoint, { method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: message }) });
      } finally { clearTimeout(timeout); }
      if (!response.ok) {
        trace("telegram_notification_error", { chatId, messageCount: messages.length, sentCount: sent,
          telegramHttpStatus: response.status, errorClass: "TelegramResponseError" });
        return { status: "error", messageCount: sent, httpStatus: response.status };
      }
      sent++;
    }
    trace("telegram_notification_success", { chatId, messageCount: sent,
      messageLengths: messages.map(message => message.length), telegramHttpStatus: 200 });
    return { status: "sent", messageCount: sent };
  } catch (error) {
    trace("telegram_notification_error", { chatId, messageCount: messages.length, sentCount: sent,
      errorClass: error instanceof Error ? error.name : "UnknownError", telegramHttpStatus: null });
    return { status: "error", messageCount: sent };
  }
}

export async function sendTelegramIntegrationTest(env: TelegramEnvironment = process.env,
  fetcher: typeof fetch = fetch, trace: ManagerFormTrace = () => {}): Promise<TelegramNotificationResult> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token) { trace("telegram_notification_skipped", { reason: "missing_token", chatId: chatId || null });
    return { status: "skipped", reason: "missing_token" }; }
  if (!chatId) { trace("telegram_notification_skipped", { reason: "missing_chat_id", chatId: null });
    return { status: "skipped", reason: "missing_chat_id" }; }
  trace("telegram_notification_start", { chatId, messageCount: 1, messageLengths: [75] });
  const response = await fetcher(`${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId,
      text: "🧪 TEST Artem Telegram integration\n\nsessionId: test\nsource: integration-check" }) });
  if (!response.ok) { trace("telegram_notification_error", { chatId, messageCount: 1, sentCount: 0,
    telegramHttpStatus: response.status, errorClass: "TelegramResponseError" });
    return { status: "error", messageCount: 0, httpStatus: response.status }; }
  trace("telegram_notification_success", { chatId, messageCount: 1, telegramHttpStatus: response.status });
  return { status: "sent", messageCount: 1 };
}
