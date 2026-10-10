import type { AIProvider } from "./provider";
import { artemSystemPrompt } from "./artem-knowledge";
import type { ConsultantAIProvider, ConsultantProviderInput } from "./consultant-chat.types";
import { CONSULTANT_CHAT_PROMPT, selectConsultantInput } from "./consultant-chat.prompt";
import { DIAGNOSTIC_RESULT_SYSTEM_PROMPT, selectDiagnosticFacts } from "./diagnostic-result.prompt";
import {
  DiagnosticAIError, parseDiagnosticResult,
  type DiagnosticAIResult, type DiagnosticFactsPacket,
} from "./diagnostic-result.types";

type YandexEnvironment = Partial<Record<
  "AI_PROVIDER" | "YANDEX_AI_API_KEY" |
  "YANDEX_AI_MODEL" | "AI_REQUEST_TIMEOUT_MS", string>>;

const YANDEX_COMPLETION_URL = new URL("https://llm.api.cloud.yandex.net/foundationModels/v1/completion");

function readConfiguration(env: YandexEnvironment) {
  const apiKey = env.YANDEX_AI_API_KEY?.trim();
  const model = env.YANDEX_AI_MODEL?.trim();
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? "15000");
  // The folder/project comes from the complete model URI, never a hardcoded ID.
  const folderId = model ? /^gpt:\/\/([^/]+)\/.+$/.exec(model)?.[1] : undefined;
  if (env.AI_PROVIDER !== "yandex" || !apiKey || !model || !folderId ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new DiagnosticAIError("AI_CONFIGURATION_ERROR");
  }
  return { apiKey, model, url: YANDEX_COMPLETION_URL, timeoutMs };
}

function completionText(payload: unknown): string | undefined {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const result = root.result && typeof root.result === "object" ? root.result as Record<string, unknown> : root;
  const alternative = Array.isArray(result.alternatives) ? result.alternatives[0] as Record<string, unknown> | undefined : undefined;
  const message = alternative?.message && typeof alternative.message === "object" ? alternative.message as Record<string, unknown> : undefined;
  return alternative?.status === "ALTERNATIVE_STATUS_FINAL" && typeof message?.text === "string" ? message.text : undefined;
}

export class YandexAIProvider implements AIProvider, ConsultantAIProvider {
  constructor(private readonly env: YandexEnvironment = process.env) {}

  /** Independent evaluator call; never shares conversational state with Artem. */
  async generateStructured(system: string, input: unknown): Promise<unknown> {
    const config = readConfiguration(this.env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 60000));
    try {
      const response = await fetch(config.url, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${config.apiKey}` },
        body: JSON.stringify({ modelUri: config.model,
          completionOptions: { stream: false, temperature: 0.1, maxTokens: "3000" }, jsonObject: true,
          messages: [{ role: "system", text: system }, { role: "user", text: JSON.stringify(input) }] }),
      });
      if (!response.ok) throw new DiagnosticAIError("AI_REQUEST_FAILED");
      const content = completionText(await response.json());
      if (!content) throw new DiagnosticAIError("AI_INVALID_RESULT");
      return JSON.parse(content.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1"));
    } catch (error) {
      if (controller.signal.aborted) throw new DiagnosticAIError("AI_REQUEST_TIMEOUT");
      if (error instanceof DiagnosticAIError) throw error;
      throw new DiagnosticAIError("AI_INVALID_RESULT");
    } finally { clearTimeout(timer); }
  }

  async generateConsultantReply(input: ConsultantProviderInput): Promise<string> {
    const config = readConfiguration(this.env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 60000));
    try {
      const response = await fetch(config.url, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${config.apiKey}` },
        body: JSON.stringify({ modelUri: config.model,
          completionOptions: { stream: false, temperature: 0.2, maxTokens: "1200" }, jsonObject: true, messages: [
            { role: "system", text: await artemSystemPrompt(CONSULTANT_CHAT_PROMPT) },
            { role: "user", text: JSON.stringify(selectConsultantInput(input)) },
          ] }),
      });
      if (!response.ok) throw new DiagnosticAIError("AI_REQUEST_FAILED");
      const generated = completionText(await response.json());
      if (!generated) throw new DiagnosticAIError("AI_INVALID_RESULT");
      const content = generated.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
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
    const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 60000));
    try {
      const response = await fetch(config.url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${config.apiKey}`,
        },
        body: JSON.stringify({
          modelUri: config.model,
          completionOptions: { stream: false, temperature: 0.2, maxTokens: "2000" },
          jsonObject: true,
          messages: [
            { role: "system", text: await artemSystemPrompt(DIAGNOSTIC_RESULT_SYSTEM_PROMPT) },
            { role: "user", text: JSON.stringify(facts) },
          ],
        }),
      });
      if (!response.ok) throw new DiagnosticAIError("AI_REQUEST_FAILED");
      const content = completionText(await response.json());
      if (!content) throw new DiagnosticAIError("AI_INVALID_RESULT");
      return parseDiagnosticResult(content, facts);
    } catch (error) {
      if (controller.signal.aborted) throw new DiagnosticAIError("AI_REQUEST_TIMEOUT");
      if (error instanceof DiagnosticAIError) throw error;
      throw new DiagnosticAIError("AI_REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }
}
