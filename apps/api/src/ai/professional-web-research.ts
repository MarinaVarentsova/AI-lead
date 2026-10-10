import type { ProfessionalWebIntent } from "@workspace/domain/consultant";

export interface ProfessionalWebSource {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}
export interface ProfessionalWebResearchResult {
  sources: ProfessionalWebSource[];
  latencyMs: number;
  fallbackReason: string | null;
}
export interface ProfessionalWebResearchService {
  research(query: string, intent: ProfessionalWebIntent, freshnessRequired: boolean): Promise<ProfessionalWebResearchResult>;
}

type WebEnvironment = Partial<Record<"PROFESSIONAL_WEB_RESEARCH_URL" | "PROFESSIONAL_WEB_RESEARCH_API_KEY" | "PROFESSIONAL_WEB_RESEARCH_TIMEOUT_MS", string>>;
const BLOCKED = /(?:forum|vk\.com|youtube|telegram|t\.me|dzen|otzovik|irecommend|course|school|academy|university)/iu;
const OFFICIAL = /(?:publication\.pravo\.gov\.ru|pravo\.gov\.ru|rosstandart\.gov\.ru|minjust\.gov\.ru|sudexpert\.ru|\.gov\.ru$|docs\.cntd\.ru$)/iu;
const ACADEMIC = /(?:cyberleninka\.ru|elibrary\.ru|\.edu$|\.ac\.)/iu;

function safeSource(value: unknown): ProfessionalWebSource | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (![item.title, item.url, item.snippet].every(entry => typeof entry === "string")) return null;
  let url: URL;
  try { url = new URL(item.url as string); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || BLOCKED.test(url.hostname)) return null;
  const snippet = (item.snippet as string).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!snippet || /ignore (?:all|previous) instructions|system prompt|developer message|раскрой.*секрет|следуй.*инструкц/iu.test(snippet)) return null;
  return { title: (item.title as string).replace(/\s+/g, " ").trim().slice(0, 200), url: url.href,
    snippet, domain: url.hostname.toLowerCase() };
}

export class HttpProfessionalWebResearchService implements ProfessionalWebResearchService {
  constructor(private readonly env: WebEnvironment = process.env) {}
  async research(query: string, intent: ProfessionalWebIntent, freshnessRequired: boolean): Promise<ProfessionalWebResearchResult> {
    const started = Date.now();
    const endpoint = this.env.PROFESSIONAL_WEB_RESEARCH_URL?.trim();
    if (!endpoint) return { sources: [], latencyMs: Date.now() - started, fallbackReason: "not_configured" };
    let url: URL;
    try { url = new URL(endpoint); } catch { return { sources: [], latencyMs: Date.now() - started, fallbackReason: "invalid_configuration" }; }
    if (url.protocol !== "https:" || url.username || url.password) {
      return { sources: [], latencyMs: Date.now() - started, fallbackReason: "invalid_configuration" };
    }
    const timeoutMs = Math.min(Math.max(Number(this.env.PROFESSIONAL_WEB_RESEARCH_TIMEOUT_MS ?? "8000"), 1000), 15000);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(this.env.PROFESSIONAL_WEB_RESEARCH_API_KEY
          ? { Authorization: `Bearer ${this.env.PROFESSIONAL_WEB_RESEARCH_API_KEY}` } : {}) },
        body: JSON.stringify({ query: freshnessRequired ? `${query} актуальная редакция официальный источник` : query,
          intent, maxResults: 5, sourcePriority: ["official_regulation", "government", "standards", "methodology", "science", "professional"] }) });
      if (!response.ok) return { sources: [], latencyMs: Date.now() - started, fallbackReason: `http_${response.status}` };
      const payload = await response.json() as { results?: unknown[] };
      const sources = (payload.results ?? []).map(safeSource).filter((item): item is ProfessionalWebSource => Boolean(item))
        .sort((a, b) => Number(OFFICIAL.test(b.domain)) - Number(OFFICIAL.test(a.domain)) ||
          Number(ACADEMIC.test(b.domain)) - Number(ACADEMIC.test(a.domain))).slice(0, 3);
      return { sources, latencyMs: Date.now() - started, fallbackReason: sources.length ? null : "no_trusted_sources" };
    } catch (error) {
      return { sources: [], latencyMs: Date.now() - started, fallbackReason: controller.signal.aborted ? "timeout" : "unavailable" };
    } finally { clearTimeout(timer); }
  }
}

export class DisabledProfessionalWebResearchService implements ProfessionalWebResearchService {
  async research(): Promise<ProfessionalWebResearchResult> {
    return { sources: [], latencyMs: 0, fallbackReason: "not_configured" };
  }
}
