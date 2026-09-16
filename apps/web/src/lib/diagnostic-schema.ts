import { apiFetch } from "./api";
export interface DiagnosticSchemaOption { code: string; label: string; allowsFreeText: boolean }
export interface DiagnosticSchemaQuestion { questionNumber: number; field: string; questionText: string; options: DiagnosticSchemaOption[] }
export async function getDiagnosticSchema(): Promise<DiagnosticSchemaQuestion[]> {
  const response = await apiFetch("/api/diagnostic/schema");
  if (!response.ok) throw new Error("DIAGNOSTIC_SCHEMA_UNAVAILABLE");
  const value: unknown = await response.json();
  if (!Array.isArray(value) || value.length !== 4) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
    const row = entry as Record<string, unknown>;
    if (row.questionNumber !== index + 1 || typeof row.field !== "string" || typeof row.questionText !== "string" || !Array.isArray(row.options)) {
      throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
    }
    const options = row.options.map(option => {
      if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
      const item = option as Record<string, unknown>;
      if (typeof item.code !== "string" || typeof item.label !== "string" || typeof item.allowsFreeText !== "boolean") throw new Error("DIAGNOSTIC_SCHEMA_INVALID");
      return { code: item.code, label: item.label, allowsFreeText: item.allowsFreeText };
    });
    return { questionNumber: row.questionNumber, field: row.field, questionText: row.questionText, options };
  });
}
