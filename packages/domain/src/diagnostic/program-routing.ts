export type ArtemProgram = "construction_expertise" | "apartment_acceptance" | "house_acceptance" | "house_control" | "house_unspecified" | "acceptance_choice";

/** Explicit user goals override the entry product; seniority never selects a product. */
export function explicitProgram(value: string): ArtemProgram | undefined {
  const text = value.toLowerCase().replace(/ё/g, "е");
  const house = /ижс|дом[а-я]*|стройк/.test(text);
  const control = /сопровожд|по этап|контрол.*подряд|вести стройк|строительн[а-я]* контрол|технадзор/.test(text);
  const noControl = /(?:не хочу|не нужно|а не|без)\s*(?:длительно\s*)?(?:сопровожд|вести|стройк|контрол)/.test(text) || /стройку вести не хочу/.test(text);
  if (house && control && !noControl) return "house_control";
  if (house && /разов|готов[а-я]* дом|перед покупк|приемк|провер[а-я]* дом/.test(text)) return "house_acceptance";
  if (/квартир/.test(text) && !/чем отлич|сравн/.test(text)) return "apartment_acceptance";
  if (/стройэксперт|эксперт|заключен|строительн[а-я]* спор|судебн/.test(text)) return "construction_expertise";
  if (/ижс/.test(text)) return "house_unspecified";
  return undefined;
}
