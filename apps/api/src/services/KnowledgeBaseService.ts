/** Canonical v3.1 source for legacy API readers as well as the shared Artem runtime. */
import { loadArtemKnowledge } from "../ai/artem-knowledge";
import path from "path";
import { logger } from "../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type KnowledgeSource = "file";

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category?: string;
  source: KnowledgeSource;
}

export interface KnowledgeBaseStatus {
  source: KnowledgeSource;
  available: boolean;
  entryCount: number;
  filePath?: string;
  error?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const KNOWLEDGE_BASE_SOURCE: KnowledgeSource = "file";

const KNOWLEDGE_FILE_NAME = "artem_unified_knowledge_base_v3_1.md";

/**
 * Resolve the knowledge base file path relative to the workspace root,
 * stable in both development (run from apps/api) and production
 * (run from workspace root via esbuild bundle).
 */
function resolveKnowledgeFilePath(): string {
  const workspaceRoot = process.cwd().endsWith(
    path.join("apps", "api")
  )
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();

  return path.resolve(workspaceRoot, "knowledge", "inobr", KNOWLEDGE_FILE_NAME);
}

// ─── Service ─────────────────────────────────────────────────────────────────

class KnowledgeBaseService {
  private readonly source: KnowledgeSource;
  private cache: KnowledgeEntry[] | null = null;

  constructor(source: KnowledgeSource = KNOWLEDGE_BASE_SOURCE) {
    this.source = source;
    logger.info({ source }, "KnowledgeBaseService initialized");
  }

  /**
   * Returns the configured knowledge source.
   */
  getSource(): KnowledgeSource {
    return this.source;
  }

  /**
   * Checks whether the knowledge base is accessible.
   * Does not throw — returns status object for diagnostic use.
   */
  async checkStatus(): Promise<KnowledgeBaseStatus> {
    return this.checkFileStatus();
  }

  /**
   * Loads all knowledge entries from the configured source.
   * Results are cached in memory for the lifetime of the process.
   *
   * Phase 2: Add TTL-based invalidation and vector indexing here.
   */
  async loadAll(): Promise<KnowledgeEntry[]> {
    if (this.cache !== null) {
      return this.cache;
    }

    this.cache = await this.loadFromFile();

    logger.info(
      { source: this.source, count: this.cache.length },
      "Knowledge base loaded"
    );
    return this.cache;
  }

  /**
   * Clears the in-memory cache — useful for hot-reload in development
   * or after updating the knowledge base content.
   */
  clearCache(): void {
    this.cache = null;
    logger.debug("Knowledge base cache cleared");
  }

  // ─── File source ────────────────────────────────────────────────────────────

  private async checkFileStatus(): Promise<KnowledgeBaseStatus> {
    const filePath = resolveKnowledgeFilePath();
    const available = await loadArtemKnowledge().then(() => true, () => false);
    return {
      source: "file",
      available,
      entryCount: available ? 1 : 0, // File = one document entry
      filePath,
      ...(!available && {
        error: `Knowledge base file not found: ${filePath}`,
      }),
    };
  }

  private async loadFromFile(): Promise<KnowledgeEntry[]> {
    const filePath = resolveKnowledgeFilePath();

    const content = await loadArtemKnowledge();
    logger.info({ filePath, bytes: content.length }, "Knowledge base file loaded");

    return [
      {
        id: "artem-v3.1",
        title: "ИНОБР Knowledge Base",
        content,
        category: "general",
        source: "file",
      },
    ];
  }

}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const knowledgeBaseService = new KnowledgeBaseService();
