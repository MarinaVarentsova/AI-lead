import type { ProfessionalWebIntent } from "@workspace/domain/consultant";
import { logger } from "../lib/logger";

export interface ProfessionalWebSource { title: string; url: string; snippet: string; domain: string; }
export type WebResearchFallbackReason =
  | "not_configured" | "kb_sufficient" | "search_timeout" | "search_401" | "search_403"
  | "search_429" | "search_5xx" | "network_error" | "empty_results" | "source_filter_rejected"
  | "provider_unavailable" | "other";
export interface ProfessionalWebResearchResult {
  sources: ProfessionalWebSource[]; latencyMs: number; fallbackReason: WebResearchFallbackReason | null;
  provider: "yandex_search_api"; configured: boolean; attempted: boolean; httpStatus: number | null;
  timeout: boolean; authError: boolean; quotaError: boolean; networkError: boolean;
}
export interface ProfessionalWebResearchService {
  research(query: string, intent: ProfessionalWebIntent, freshnessRequired: boolean): Promise<ProfessionalWebResearchResult>;
}

type YandexSearchEnvironment = Partial<Record<
  "YANDEX_SEARCH_API_KEY" | "YANDEX_FOLDER_ID" | "YANDEX_SEARCH_TIMEOUT_MS" | "AI_REQUEST_TIMEOUT_MS", string>>;
type YandexSearchResponse = { rawData?: unknown };
type YandexSearchAttempt = { sources: ProfessionalWebSource[]; httpStatus: number; rawResultCount: number };
const YANDEX_SEARCH_URL = "https://searchapi.api.cloud.yandex.net/v2/web/search";
const BLOCKED = /(?:forum|vk\.com|youtube|telegram|t\.me|dzen|otzovik|irecommend|pikabu|zen\.yandex|course|school|academy|university)/iu;
const OFFICIAL = /(?:publication\.pravo\.gov\.ru|pravo\.gov\.ru|rosstandart\.gov\.ru|minjust\.gov\.ru|sudexpert\.ru|\.gov\.ru$|docs\.cntd\.ru$)/iu;
const ACADEMIC = /(?:cyberleninka\.ru|elibrary\.ru|\.edu$|\.ac\.)/iu;
const INJECTION = /ignore (?:all|previous) instructions|system prompt|developer message|раскрой.*секрет|следуй.*инструкц/iu;

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function element(xml: string, name: string): string {
  return new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "iu").exec(xml)?.[1] ?? "";
}
function safeUrl(value: string): URL | null {
  try { const url = new URL(decodeXml(value)); return url.protocol === "https:" && !url.username && !url.password && !BLOCKED.test(url.hostname) ? url : null; }
  catch { return null; }
}
export function parseYandexSearchXml(xml: string): ProfessionalWebSource[] {
  const sources: ProfessionalWebSource[] = [];
  for (const match of xml.matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/giu)) {
    const doc = match[1] ?? ""; const url = safeUrl(element(doc, "url")); if (!url) continue;
    const title = decodeXml(element(doc, "title")).slice(0, 200) || url.hostname;
    const passageBlock = element(doc, "passages");
    const snippets = [...passageBlock.matchAll(/<passage(?:\s[^>]*)?>([\s\S]*?)<\/passage>/giu)]
      .map(item => decodeXml(item[1] ?? "")).filter(Boolean);
    const snippet = (snippets.join(" ") || decodeXml(element(doc, "headline"))).slice(0, 1200);
    if (!snippet || INJECTION.test(snippet)) continue;
    sources.push({ title, url: url.href, snippet, domain: url.hostname.toLowerCase() });
  }
  return sources.sort((a, b) => Number(OFFICIAL.test(b.domain)) - Number(OFFICIAL.test(a.domain)) ||
    Number(ACADEMIC.test(b.domain)) - Number(ACADEMIC.test(a.domain))).slice(0, 3);
}

function configuration(env: YandexSearchEnvironment) {
  const apiKey = env.YANDEX_SEARCH_API_KEY?.trim(); const folderId = env.YANDEX_FOLDER_ID?.trim();
  if (!apiKey || !folderId) throw new Error("not_configured");
  const timeoutMs = Math.min(Math.max(Number(env.YANDEX_SEARCH_TIMEOUT_MS ?? env.AI_REQUEST_TIMEOUT_MS ?? "8000"), 1000), 60000);
  return { apiKey, folderId, timeoutMs };
}

export class YandexSearchProvider {
  constructor(private readonly env: YandexSearchEnvironment = process.env) {}
  isConfigured(): boolean { try { configuration(this.env); return true; } catch { return false; } }
  async search(query: string, freshnessRequired: boolean): Promise<YandexSearchAttempt> {
    const config = configuration(this.env); const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const queryText = `${query}${freshnessRequired ? " актуальная редакция официальный источник" : ""}`.slice(0, 400);
      const response = await fetch(YANDEX_SEARCH_URL, { method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Api-Key ${config.apiKey}` },
        body: JSON.stringify({ query: { searchType: "SEARCH_TYPE_RU", queryText, familyMode: "FAMILY_MODE_MODERATE",
          fixTypoMode: "FIX_TYPO_MODE_ON" }, sortSpec: { sortMode: "SORT_MODE_BY_RELEVANCE", sortOrder: "SORT_ORDER_DESC" },
        groupSpec: { groupMode: "GROUP_MODE_DEEP", groupsOnPage: "10", docsInGroup: "1" }, maxPassages: "3",
        l10n: "LOCALIZATION_RU", folderId: config.folderId, responseFormat: "FORMAT_XML" }) });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const payload = await response.json() as YandexSearchResponse;
      if (typeof payload.rawData !== "string" || !payload.rawData) throw new Error("invalid_response");
      const xml = payload.rawData.trimStart().startsWith("<") ? payload.rawData : Buffer.from(payload.rawData, "base64").toString("utf8");
      return { sources: parseYandexSearchXml(xml), httpStatus: response.status,
        rawResultCount: [...xml.matchAll(/<doc(?:\s[^>]*)?>/giu)].length };
    } catch (error) { if (controller.signal.aborted) throw new Error("timeout"); throw error; }
    finally { clearTimeout(timer); }
  }
}

function failure(reason: WebResearchFallbackReason, latencyMs: number, configured: boolean, attempted: boolean,
  httpStatus: number | null = null): ProfessionalWebResearchResult {
  return { sources: [], latencyMs, fallbackReason: reason, provider: "yandex_search_api", configured, attempted,
    httpStatus, timeout: reason === "search_timeout", authError: reason === "search_401" || reason === "search_403",
    quotaError: reason === "search_429", networkError: reason === "network_error" };
}
function errorReason(error: unknown): { reason: WebResearchFallbackReason; status: number | null } {
  const message = error instanceof Error ? error.message : "";
  if (message === "not_configured") return { reason: "not_configured", status: null };
  if (message === "timeout") return { reason: "search_timeout", status: null };
  const status = /^http_(\d+)$/.exec(message)?.[1];
  if (status === "401") return { reason: "search_401", status: 401 };
  if (status === "403") return { reason: "search_403", status: 403 };
  if (status === "429") return { reason: "search_429", status: 429 };
  if (status && Number(status) >= 500) return { reason: "search_5xx", status: Number(status) };
  if (error instanceof TypeError) return { reason: "network_error", status: null };
  if (message === "invalid_response") return { reason: "provider_unavailable", status: 200 };
  return { reason: "other", status: status ? Number(status) : null };
}

export class YandexProfessionalWebResearchService implements ProfessionalWebResearchService {
  constructor(private readonly searchProvider = new YandexSearchProvider()) {}
  async research(query: string, intent: ProfessionalWebIntent, freshnessRequired: boolean): Promise<ProfessionalWebResearchResult> {
    const started = Date.now(); const configured = this.searchProvider.isConfigured();
    const base = { webResearchProvider: "yandex_search_api", queryIntent: intent,
      yandexAiConfigured: Boolean(process.env.YANDEX_AI_API_KEY?.trim()), yandexSearchConfigured: configured };
    if (!configured) {
      const result = failure("not_configured", 0, false, false);
      logger.warn({ stage: "yandex_search_error", ...base, ...result }, "YANDEX_SEARCH_ERROR"); return result;
    }
    logger.info({ stage: "yandex_search_start", ...base }, "YANDEX_SEARCH_START");
    try {
      const attempt = await this.searchProvider.search(query, freshnessRequired); const latencyMs = Date.now() - started;
      const fallbackReason = attempt.sources.length ? null : attempt.rawResultCount ? "source_filter_rejected" : "empty_results";
      const result: ProfessionalWebResearchResult = { sources: attempt.sources, latencyMs, fallbackReason,
        provider: "yandex_search_api", configured: true, attempted: true, httpStatus: attempt.httpStatus,
        timeout: false, authError: false, quotaError: false, networkError: false };
      logger.info({ stage: "yandex_search_response", ...base, httpStatus: result.httpStatus, latencyMs,
        sourceCount: result.sources.length, domains: [...new Set(result.sources.map(source => source.domain))],
        timeout: false, authError: false, quotaError: false, networkError: false,
        webResearchFallbackReason: fallbackReason }, "YANDEX_SEARCH_RESPONSE");
      return result;
    } catch (error) {
      const latencyMs = Date.now() - started; const mapped = errorReason(error);
      const result = failure(mapped.reason, latencyMs, true, true, mapped.status);
      logger.warn({ stage: "yandex_search_error", ...base, httpStatus: result.httpStatus, latencyMs,
        sourceCount: 0, domains: [], timeout: result.timeout, authError: result.authError,
        quotaError: result.quotaError, networkError: result.networkError,
        webResearchFallbackReason: result.fallbackReason }, "YANDEX_SEARCH_ERROR");
      return result;
    }
  }
}

export class DisabledProfessionalWebResearchService implements ProfessionalWebResearchService {
  async research(): Promise<ProfessionalWebResearchResult> { return failure("not_configured", 0, false, false); }
}
