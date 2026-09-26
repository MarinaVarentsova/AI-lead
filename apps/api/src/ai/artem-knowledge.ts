import { readFile } from "node:fs/promises";
import path from "node:path";

export const ARTEM_SOURCE = "artem_unified_knowledge_base_v4_2.md";
const REQUIRED_V4_2_SECTIONS = [
  "## 15. Правила продолжения консультации, персональных данных и ответов по оплате",
  "## 16. Прямые ответы на follow-up после рекомендации",
  "## 17. Запись на обучение и организационный следующий шаг",
  "## 18. Матрица обычных клиентских вопросов: отвечать самому или переводить к менеджеру",
];
export async function loadArtemKnowledge(moduleUrl = import.meta.url): Promise<string> {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("apps", "api")) ? path.resolve(cwd, "../..") : cwd;
  for (const candidate of [new URL(`./knowledge/${ARTEM_SOURCE}`, moduleUrl),
    new URL(`../../../../knowledge/inobr/${ARTEM_SOURCE}`, moduleUrl), path.join(root, "knowledge/inobr", ARTEM_SOURCE)]) {
    try {
      const text = await readFile(candidate, "utf8");
      if (!text.includes("Версия 4.2 · 19 сентября 2026 года.") ||
        !REQUIRED_V4_2_SECTIONS.every(section => text.includes(section))) throw new Error("ARTEM_KNOWLEDGE_VERSION_INVALID");
      return text;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("ARTEM_KNOWLEDGE_MISSING");
}

export function knowledgeSections(markdown: string): Map<number, string> {
  const sections = new Map<number, string>();
  for (const block of markdown.replace(/\r\n/g, "\n").split(/(?=^## \d+\.)/m)) {
    const id = /^## (\d+)\./.exec(block);
    if (!id) continue;
    const key = Number(id[1]);
    sections.set(key, [sections.get(key), block.trim()].filter(Boolean).join("\n\n"));
  }
  return sections;
}
/** The same trusted policy precedes both format adapters, never user-authored text. */
export async function artemSystemPrompt(format: string): Promise<string> {
  return `${await loadArtemKnowledge()}\n\nТехнический формат текущего этапа:\n${format}`;
}
