import { apiFetch } from "./api";
export interface DiagnosticSchemaOption { code: string; label: string; allowsFreeText: boolean }
export interface DiagnosticSchemaQuestion { questionNumber: number; field: string; questionText: string; options: DiagnosticSchemaOption[] }
const FIELDS = ["current_area", "current_role", "education_status", "target_tasks"] as const;

export function parseDiagnosticSchema(value: unknown): DiagnosticSchemaQuestion[] {
  if (!Array.isArray(value) || value.length !== FIELDS.length) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
    const row = entry as Record<string, unknown>;
    const field = FIELDS[index]!;
    if (row.questionNumber !== index + 1 || row.field !== field || typeof row.questionText !== "string" ||
      !row.questionText.trim() || !Array.isArray(row.options) || !row.options.length) {
      throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
    }
    const options = row.options.map(option => {
      if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
      const item = option as Record<string, unknown>;
      if (typeof item.code !== "string" || !item.code || typeof item.label !== "string" || !item.label.trim() ||
        typeof item.allowsFreeText !== "boolean") throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
      return { code: item.code, label: item.label, allowsFreeText: item.allowsFreeText };
    });
    const freeTextOptions = options.filter(option => option.allowsFreeText);
    if (field === "current_area") {
      if (freeTextOptions.length !== 1 || freeTextOptions[0]?.code !== "other") throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
    } else if (freeTextOptions.length) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
    return { questionNumber: row.questionNumber, field, questionText: row.questionText, options };
  });
}

export async function getDiagnosticSchema(): Promise<DiagnosticSchemaQuestion[]> {
  const response = await apiFetch("/api/diagnostic/schema");
  if (!response.ok) throw new Error("DIAGNOSTIC_SCHEMA_UNAVAILABLE");
  return parseDiagnosticSchema(await response.json());
}
