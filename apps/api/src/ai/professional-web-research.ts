import type { ProfessionalWebIntent } from "@workspace/domain/consultant";

export interface ProfessionalWebSource { title: string; url: string; snippet: string; domain: string; }
export interface ProfessionalWebResearchResult {
  sources: ProfessionalWebSource[]; latencyMs: number; fallbackReason: string | null;
  provider: "yandex_search_api";
}
export interface ProfessionalWebResearchService {
  research(query: string, intent: ProfessionalWebIntent, freshnessRequired: boolean): Promise<ProfessionalWebResearchResult>;
}

type YandexSearchEnvironment = Partial<Record<
  "YANDEX_SEARCH_API_KEY" | "YANDEX_FOLDER_ID" | "YANDEX_SEARCH_TIMEOUT_MS" |
  "YANDEX_AI_API_KEY" | "YANDEX_AI_MODEL" | "AI_REQUEST_TIMEOUT_MS", string>>;
type YandexSearchResponse = { rawData?: unknown };
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
  const apiKey = env.YANDEX_SEARCH_API_KEY?.trim() || env.YANDEX_AI_API_KEY?.trim();
  const folderId = env.YANDEX_FOLDER_ID?.trim() || /^gpt:\/\/([^/]+)\/.+$/.exec(env.YANDEX_AI_MODEL?.trim() ?? "")?.[1];
  if (!apiKey || !folderId) throw new Error("not_configured");
  const timeoutMs = Math.min(Math.max(Number(env.YANDEX_SEARCH_TIMEOUT_MS ?? env.AI_REQUEST_TIMEOUT_MS ?? "8000"), 1000), 60000);
  return { apiKey, folderId, timeoutMs };
}

export class YandexSearchProvider {
  constructor(private readonly env: YandexSearchEnvironment = process.env) {}
  async search(query: string, freshnessRequired: boolean): Promise<ProfessionalWebSource[]> {
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
      return parseYandexSearchXml(xml);
    } catch (error) { if (controller.signal.aborted) throw new Error("timeout"); throw error; }
    finally { clearTimeout(timer); }
  }
}

export class YandexProfessionalWebResearchService implements ProfessionalWebResearchService {
  constructor(private readonly searchProvider = new YandexSearchProvider()) {}
  async research(query: string, _intent: ProfessionalWebIntent, freshnessRequired: boolean): Promise<ProfessionalWebResearchResult> {
    const started = Date.now();
    try {
      const sources = await this.searchProvider.search(query, freshnessRequired);
      return { sources, latencyMs: Date.now() - started, fallbackReason: sources.length ? null : "no_trusted_sources",
        provider: "yandex_search_api" };
    } catch (error) {
      const reason = error instanceof Error && /^(?:not_configured|timeout|invalid_response|http_\d+)$/.test(error.message)
        ? error.message : "unavailable";
      return { sources: [], latencyMs: Date.now() - started, fallbackReason: reason, provider: "yandex_search_api" };
    }
  }
}

export class DisabledProfessionalWebResearchService implements ProfessionalWebResearchService {
  async research(): Promise<ProfessionalWebResearchResult> {
    return { sources: [], latencyMs: 0, fallbackReason: "not_configured", provider: "yandex_search_api" };
  }
}
