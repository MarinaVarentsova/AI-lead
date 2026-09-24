import { readFile } from "node:fs/promises";
import path from "node:path";

export const ARTEM_SOURCE = "artem_unified_knowledge_base_v3_9.md";
export async function loadArtemKnowledge(moduleUrl = import.meta.url): Promise<string> {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("apps", "api")) ? path.resolve(cwd, "../..") : cwd;
  for (const candidate of [new URL(`./knowledge/${ARTEM_SOURCE}`, moduleUrl),
    new URL(`../../../../knowledge/inobr/${ARTEM_SOURCE}`, moduleUrl), path.join(root, "knowledge/inobr", ARTEM_SOURCE)]) {
    try {
      const text = await readFile(candidate, "utf8");
      if (!text.includes("Версия 3.9 · 19 сентября 2026 года.")) throw new Error("ARTEM_KNOWLEDGE_VERSION_INVALID");
      return text;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("ARTEM_KNOWLEDGE_MISSING");
}

export function knowledgeSections(markdown: string): Map<number, string> {
  return new Map(markdown.replace(/\r\n/g, "\n").split(/(?=^## \d+\.)/m).flatMap(block => {
    const id = /^## (\d+)\./.exec(block);
    return id ? [[Number(id[1]), block.trim()] as const] : [];
  }));
}
/** The same trusted policy precedes both format adapters, never user-authored text. */
export async function artemSystemPrompt(format: string): Promise<string> {
  return `${await loadArtemKnowledge()}\n\nТехнический формат текущего этапа:\n${format}`;
}
