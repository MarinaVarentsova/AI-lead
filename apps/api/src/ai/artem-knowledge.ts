import { readFile } from "node:fs/promises";
import path from "node:path";

export const ARTEM_SOURCE = "artem_unified_knowledge_base_v4_5.md";
export const ARTEM_FAQ_SOURCE = "artem_client_questions_1200.csv";
const REQUIRED_V4_5_SECTIONS = [
  "## 15. Правила продолжения консультации, персональных данных и ответов по оплате",
  "## 16. Прямые ответы на follow-up после рекомендации",
  "## 17. Запись на обучение и организационный следующий шаг",
  "## 18. Матрица обычных клиентских вопросов: отвечать самому или переводить к менеджеру",
  "## 19. Явные intent-карты: тарифы, способы оплаты и формат обучения",
  "## 20. Никогда не ссылаться пользователю на внутреннюю базу знаний",
];
export async function loadArtemKnowledge(moduleUrl = import.meta.url): Promise<string> {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("apps", "api")) ? path.resolve(cwd, "../..") : cwd;
  for (const candidate of [new URL(`./knowledge/${ARTEM_SOURCE}`, moduleUrl),
    new URL(`../../../../knowledge/inobr/${ARTEM_SOURCE}`, moduleUrl), path.join(root, "knowledge/inobr", ARTEM_SOURCE)]) {
    try {
      const text = await readFile(candidate, "utf8");
      if (!text.includes("Версия 4.5 · 19 сентября 2026 года.") ||
        !REQUIRED_V4_5_SECTIONS.every(section => text.includes(section))) throw new Error("ARTEM_KNOWLEDGE_VERSION_INVALID");
      return text;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("ARTEM_KNOWLEDGE_MISSING");
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const [rawHeader = [], ...data] = rows; const header = rawHeader.map(key => key.replace(/^\uFEFF/, ""));
  return data.filter(values => values.some(Boolean)).map(values =>
    Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

export async function loadArtemFaq(moduleUrl = import.meta.url) {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("apps", "api")) ? path.resolve(cwd, "../..") : cwd;
  for (const candidate of [new URL(`./knowledge/${ARTEM_FAQ_SOURCE}`, moduleUrl),
    new URL(`../../../../knowledge/inobr/${ARTEM_FAQ_SOURCE}`, moduleUrl), path.join(root, "knowledge/inobr", ARTEM_FAQ_SOURCE)]) {
    try {
      const rows = parseCsv(await readFile(candidate, "utf8"));
      if (rows.length !== 1200) throw new Error("ARTEM_FAQ_VERSION_INVALID");
      return rows.map(row => ({ id: row.id!, category: row.category!, intent: row.intent!, policy: row.policy!,
        question: row.question!, answer: row.answer!, kbReference: row.kb_reference! }));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  throw new Error("ARTEM_FAQ_MISSING");
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
