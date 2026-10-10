import type { ArtemProgram } from "../diagnostic/program-routing";

export type FaqPolicy = "KB" | "MANAGER" | "MIXED";
export interface FaqEntry { id: string; category: string; intent: string; policy: string; question: string; answer: string; kbReference: string }
export interface FaqMatch extends FaqEntry { similarity: number; normalizedPolicy: FaqPolicy }

const STOP = new Set(["а", "и", "в", "во", "на", "по", "ли", "это", "что", "как", "мне", "вы", "я", "же", "у", "за", "для", "или", "можно", "подскажите", "пожалуйста", "хочу", "нужно"]);
export const normalizeFaqText = (value: string) => value.toLowerCase().replace(/ё/g, "е")
  .replace(/[^а-яa-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const stems = (value: string) => [...new Set(normalizeFaqText(value).split(" ").filter(word => word.length > 2 && !STOP.has(word))
  .map(word => word.length > 5 ? word.slice(0, 5) : word))];

const INTENT_HINTS: Record<string, RegExp> = {
  price: /цен|стоим|сколько.*стоит|обойд|сколько.*денег/, tariff_comparison: /тариф|пакет|доплат|разниц|отлича|сравн/,
  financing: /кредит|рассроч|отсроч|частями|платеж|перенест.*оплат|оплат.*потом/, format_online_offline: /очно|онлайн|офлайн|из дома|дистанц|приезж|посещать.*институт|лично/,
  format: /формат|как проходит|учиться/, documents: /диплом|документ|сертификат|фрдо|бумаг|квалификац/,
  enrollment: /запис|оформ|поступ|подать.*заявк|зачисл/, promo: /скид|акци|промокод|льгот|специальн.*цен/, practice: /практик|задани|кейс|провер.*итогов.*работ|обратн.*связ/,
  judicial: /суд|судебн/, compare: /сравн|отлич|что выбрать|какая программ/,
  schedule_access: /расписан|доступ|начать|старт/, refund_contract: /возврат|договор/,
  career: /работ|рабоч.*мест|заказ|клиент|доход|трудоустр|гарант/, construction_control: /контрол|технадзор|подрядчик|этап/,
  content: /чему|содержан|изуч|навык|дефект/, duration: /срок обуч|сколько.*час|длится|длитель|врем.*обуч|объем.*курс|объём.*курс|долго.*учиться/,
  education: /образован|спо|высш|аттестат/, payment: /оплат|платить/, mixed: /(?:цен|стоит).*(?:запис|оформ)|(?:диплом|документ).*(?:запис|оформ)/,
};

export const normalizeFaqPolicy = (policy: string): FaqPolicy => {
  const value = policy.toUpperCase();
  if (value.includes("MIXED") || (value.includes("KB") && value.includes("MANAGER"))) return "MIXED";
  return value.includes("MANAGER") ? "MANAGER" : "KB";
};

function programAffinity(entry: FaqEntry, program?: ArtemProgram): number {
  if (!program) return 0;
  const value = normalizeFaqText(`${entry.question} ${entry.answer}`);
  const expected = program === "construction_expertise" ? /стройэксперт/ :
    program === "apartment_acceptance" ? /приемк квартир/ :
      program === "house_acceptance" ? /приемк ижс|частн.*дом/ :
        program === "house_control" ? /строительн контрол ижс|сопровожден.*строительств/ : null;
  if (!expected) return 0;
  if (expected.test(value)) return 0.08;
  if (/стройэксперт|приемк квартир|приемк ижс|строительн контрол ижс/.test(value)) return -0.12;
  return 0;
}

export class FaqRetriever {
  private readonly indexed: { entry: FaqEntry; normalized: string; tokens: string[] }[];
  constructor(readonly entries: readonly FaqEntry[], readonly threshold = 0.46) {
    this.indexed = entries.map(entry => ({ entry, normalized: normalizeFaqText(entry.question), tokens: stems(entry.question) }));
  }
  search(question: string, program?: ArtemProgram, limit = 3): FaqMatch[] {
    const normalized = normalizeFaqText(question); const tokens = stems(question); const query = new Set(tokens);
    const detectedIntents = new Set(Object.entries(INTENT_HINTS).filter(([, pattern]) => pattern.test(normalized)).map(([intent]) => intent));
    if (detectedIntents.has("financing")) detectedIntents.delete("payment");
    if (detectedIntents.has("promo")) detectedIntents.delete("price");
    if (detectedIntents.has("practice")) detectedIntents.delete("career");
    if (detectedIntents.has("format_online_offline")) detectedIntents.delete("format");
    if (detectedIntents.has("duration")) detectedIntents.delete("format");
    if (detectedIntents.has("mixed")) { detectedIntents.delete("price"); detectedIntents.delete("enrollment"); }
    return this.indexed.map(({ entry, normalized: candidate, tokens: candidateTokens }) => {
      const other = new Set(candidateTokens); const overlap = [...query].filter(token => other.has(token)).length;
      const union = new Set([...query, ...other]).size || 1;
      const jaccard = overlap / union;
      const containment = overlap / Math.max(1, Math.min(query.size, other.size));
      const intentHint = detectedIntents.has(entry.intent) ? 0.48 : 0;
      const exact = normalized === candidate ? 1 : 0;
      const similarity = exact ? 1 : Math.min(0.999, jaccard * 0.55 + containment * 0.25 + intentHint + programAffinity(entry, program));
      return { ...entry, normalizedPolicy: normalizeFaqPolicy(entry.policy), similarity };
    }).filter(match => match.similarity >= this.threshold)
      .sort((left, right) => right.similarity - left.similarity || Number(left.id) - Number(right.id)).slice(0, limit);
  }
}
