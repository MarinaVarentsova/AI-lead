/**
 * KnowledgeBaseService
 *
 * Provides access to the ИНОБР knowledge base content.
 * Supports two interchangeable sources:
 *   - "file"     → reads from a Markdown file on disk
 *   - "database" → reads from the ai_knowledge table (Phase 2)
 *
 * Switch source via KNOWLEDGE_BASE_SOURCE env var (default: "file").
 * No code changes required to switch sources.
 *
 * Phase 2 extension points:
 *   - Plug in OpenAI embeddings for semantic search
 *   - Add vector similarity search against ai_knowledge entries
 *   - Cache loaded content with TTL
 */
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type KnowledgeSource = "file" | "database";

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

const KNOWLEDGE_BASE_SOURCE =
  (process.env.KNOWLEDGE_BASE_SOURCE as KnowledgeSource | undefined) ?? "file";

const KNOWLEDGE_FILE_NAME = "knowledge_base_inobr_ai_consultant_v1.md";

/**
 * Resolve the knowledge base file path relative to the workspace root,
 * stable in both development (run from artifacts/api-server) and production
 * (run from workspace root via esbuild bundle).
 */
function resolveKnowledgeFilePath(): string {
  const workspaceRoot = process.cwd().endsWith(
    path.join("artifacts", "api-server")
  )
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();

  return path.resolve(workspaceRoot, "artifacts", "api-server", "knowledge", KNOWLEDGE_FILE_NAME);
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
    if (this.source === "file") {
      return this.checkFileStatus();
    }
    return this.checkDatabaseStatus();
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

    if (this.source === "file") {
      this.cache = await this.loadFromFile();
    } else {
      this.cache = await this.loadFromDatabase();
    }

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

  private checkFileStatus(): KnowledgeBaseStatus {
    const filePath = resolveKnowledgeFilePath();
    const available = fs.existsSync(filePath);
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

    if (!fs.existsSync(filePath)) {
      logger.warn({ filePath }, "Knowledge base file not found — returning empty");
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    logger.info({ filePath, bytes: content.length }, "Knowledge base file loaded");

    return [
      {
        id: "kb-file-v1",
        title: "ИНОБР Knowledge Base",
        content,
        category: "general",
        source: "file",
      },
    ];
  }

  // ─── Database source ─────────────────────────────────────────────────────────

  private async checkDatabaseStatus(): Promise<KnowledgeBaseStatus> {
    // Phase 2: implement DB query to count ai_knowledge rows
    return {
      source: "database",
      available: false,
      entryCount: 0,
      error: "Database source not yet implemented — coming in Phase 2",
    };
  }

  private async loadFromDatabase(): Promise<KnowledgeEntry[]> {
    // Phase 2: query ai_knowledge table via Drizzle ORM
    // import { db, aiKnowledge } from "@workspace/db";
    // const rows = await db.select().from(aiKnowledge).where(eq(aiKnowledge.isActive, true));
    // return rows.map(r => ({ id: String(r.id), title: r.title, content: r.content, ... }));
    logger.warn("Database knowledge source not yet implemented");
    return [];
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const knowledgeBaseService = new KnowledgeBaseService();
