export type ProfessionalWebIntent =
  | "professional_defects"
  | "professional_structures"
  | "professional_inspection"
  | "professional_expertise"
  | "professional_judicial_expertise"
  | "professional_cost_estimation"
  | "professional_regulations"
  | "professional_methodology"
  | "professional_terminology";

export const PROFESSIONAL_WEB_POLICY_VERSION = "yandexweb1" as const;

export interface ProfessionalIntentResult {
  intent: ProfessionalWebIntent | null;
  professionalWebEligible: boolean;
  webForbidden: boolean;
  mixedProductAndProfessional: boolean;
  freshnessRequired: boolean;
}

const PRODUCT = /(?:курс|программ|обучен|инобр|стройэксперт|тариф|цен|стоим|скидк|промокод|акци|рассроч|кредит|отсроч|возврат|диплом|удостоверен|сертификат|час(?:ов|а)?|поступ|запис|старт|расписан|доступ к материал|договор|getcourse|премиум|средний|базовый)/iu;
const STRICT_COMMERCIAL = /(?:тариф|цен|стоим|скидк|промокод|акци|рассроч|кредит|отсроч|возврат|запис|старт|расписан|доступ к материал|договор|getcourse|диплом|удостоверен|сертификат|что входит в (?:курс|программ)|час(?:ов|а)? обучения)/iu;
const CASE_SPECIFIC = /(?:в мо[её]м|на мо[её]м|конкретн(?:ое|ом|ого))\s+(?:дел|объект|дом|квартир|заключен)|кто виноват|точн(?:ая|ую) причин|составь заключен|дай окончательн.*вывод/iu;

const INTENTS: readonly [ProfessionalWebIntent, RegExp][] = [
  ["professional_regulations", /(?:гост|(?:^|\s)сп(?:\s|\d|[?.!,])|фз|закон|норматив|актуальн.*редакц|регулиру|действует.*документ)/iu],
  ["professional_cost_estimation", /(?:восстановительн.*стоим|стоимост.*устранен|сметн.*расч[её]т|оценк.*ущерб|рассчит.*ущерб)/iu],
  ["professional_judicial_expertise", /(?:судебн.*экспертиз|эксперт.*(?:суд|дел)|материал.*дел|назначен.*эксперт)/iu],
  ["professional_inspection", /(?:обследован|осмотр|прочност.*бетон|метод.*измерен|неразрушающ.*контрол|инструментальн.*контрол)/iu],
  ["professional_defects", /(?:трещин|дефект|поврежден|разрушен|деформац|залив|протеч|качест.*работ)/iu],
  ["professional_structures", /(?:конструкц|кирпичн.*стен|бетон|фундамент|перекрыт|несущ)/iu],
  ["professional_expertise", /(?:строительно.?техническ.*экспертиз|досудебн.*экспертиз|экспертн.*исследован)/iu],
  ["professional_methodology", /(?:причинно.?следствен|как устанавлива|как определя|методик|алгоритм.*исследован|этап.*экспертиз)/iu],
  ["professional_terminology", /(?:что означает|чем отличается|определение|термин|понятие).*(?:дефект|поврежден|разрушен|экспертиз|обследован)/iu],
];

export function classifyProfessionalIntent(question: string): ProfessionalIntentResult {
  const normalized = question.trim().toLowerCase().replace(/ё/g, "е");
  const intent = INTENTS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
  const product = PRODUCT.test(normalized);
  const professional = intent !== null;
  const mixedProductAndProfessional = product && professional && /(?:и вообще|а почему|почему|как именно|при этом)/iu.test(normalized);
  const webForbidden = intent !== "professional_cost_estimation" && STRICT_COMMERCIAL.test(normalized) && !mixedProductAndProfessional;
  return {
    intent,
    professionalWebEligible: professional && !CASE_SPECIFIC.test(normalized) && (!webForbidden || mixedProductAndProfessional),
    webForbidden,
    mixedProductAndProfessional,
    freshnessRequired: intent === "professional_regulations",
  };
}
