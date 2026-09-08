import type { AIProvider } from "./provider";
import type { ConsultantAIProvider, ConsultantProviderInput } from "./consultant-chat.types";
import { CONSULTANT_CHAT_PROMPT, selectConsultantInput } from "./consultant-chat.prompt";
import { DIAGNOSTIC_RESULT_SYSTEM_PROMPT, selectDiagnosticFacts } from "./diagnostic-result.prompt";
import {
  DiagnosticAIError, parseDiagnosticResult,
  type DiagnosticAIResult, type DiagnosticFactsPacket,
} from "./diagnostic-result.types";

type YandexEnvironment = Partial<Record<
  "AI_PROVIDER" | "YANDEX_AI_BASE_URL" | "YANDEX_AI_API_KEY" |
  "YANDEX_AI_MODEL" | "AI_REQUEST_TIMEOUT_MS", string>>;

function readConfiguration(env: YandexEnvironment) {
  const apiKey = env.YANDEX_AI_API_KEY?.trim();
  const model = env.YANDEX_AI_MODEL?.trim();
  const baseUrl = env.YANDEX_AI_BASE_URL?.trim();
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? "15000");
  // The folder/project comes from the complete model URI, never a hardcoded ID.
  const folderId = model ? /^gpt:\/\/([^/]+)\/.+$/.exec(model)?.[1] : undefined;
  if (env.AI_PROVIDER !== "yandex" || !apiKey || !baseUrl || !model || !folderId ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new DiagnosticAIError("AI_CONFIGURATION_ERROR");
  }
  let url: URL;
  try { url = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`); }
  catch { throw new DiagnosticAIError("AI_CONFIGURATION_ERROR"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DiagnosticAIError("AI_CONFIGURATION_ERROR");
  }
  return { apiKey, model, folderId, url, timeoutMs };
}

export class YandexAIProvider implements AIProvider, ConsultantAIProvider {
  constructor(private readonly env: YandexEnvironment = process.env) {}

  async generateConsultantReply(input: ConsultantProviderInput): Promise<string> {
    const config = readConfiguration(this.env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(config.url, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${config.apiKey}`, "OpenAI-Project": config.folderId },
        body: JSON.stringify({ model: config.model, temperature: 0.2, max_tokens: 1200,
          response_format: { type: "json_object" }, messages: [
            { role: "system", content: CONSULTANT_CHAT_PROMPT },
            { role: "user", content: JSON.stringify(selectConsultantInput(input)) },
          ] }),
      });
      if (!response.ok) throw new DiagnosticAIError("AI_REQUEST_FAILED");
      const payload = await response.json() as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] } | null;
      const choice = payload?.choices?.[0];
      if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") throw new DiagnosticAIError("AI_INVALID_RESULT");
      const content = choice.message.content.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
      const result: unknown = JSON.parse(content);
      const message = result && typeof result === "object" ? (result as { message?: unknown }).message : undefined;
      if (typeof message !== "string" || !message.trim() || message.length > 6000) throw new DiagnosticAIError("AI_INVALID_RESULT");
      return message.trim();
    } catch (error) {
      if (controller.signal.aborted) throw new DiagnosticAIError("AI_REQUEST_TIMEOUT");
      if (error instanceof DiagnosticAIError) throw error;
      throw new DiagnosticAIError("AI_REQUEST_FAILED");
    } finally { clearTimeout(timer); }
  }

  async generateDiagnosticResult(input: DiagnosticFactsPacket): Promise<DiagnosticAIResult> {
    // Deferred validation lets the service handle missing configuration via fallback.
    const config = readConfiguration(this.env);
    const facts = selectDiagnosticFacts(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(config.url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${config.apiKey}`,
          "OpenAI-Project": config.folderId,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: DIAGNOSTIC_RESULT_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(facts) },
          ],
          temperature: 0.2,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });
      if (!response.ok) throw new DiagnosticAIError("AI_REQUEST_FAILED");
      const payload: unknown = await response.json();
      const choice = (payload as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] } | null)
        ?.choices?.[0];
      if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") {
        throw new DiagnosticAIError("AI_INVALID_RESULT");
      }
      return parseDiagnosticResult(choice.message.content, facts);
    } catch (error) {
      if (controller.signal.aborted) throw new DiagnosticAIError("AI_REQUEST_TIMEOUT");
      if (error instanceof DiagnosticAIError) throw error;
      throw new DiagnosticAIError("AI_REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }
}
