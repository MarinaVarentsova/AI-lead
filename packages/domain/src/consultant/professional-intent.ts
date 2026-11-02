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

export const PROFESSIONAL_WEB_POLICY_VERSION = "yandexweb2" as const;

export interface ProfessionalIntentResult {
  intent: ProfessionalWebIntent | null;
  professionalWebEligible: boolean;
  webForbidden: boolean;
  mixedProductAndProfessional: boolean;
  freshnessRequired: boolean;
  professionalQuery: string | null;
}

const PRODUCT = /(?:курс|программ|обучен|инобр|стройэксперт|тариф|цен|стоим|скидк|промокод|акци|рассроч|кредит|отсроч|возврат|диплом|удостоверен|сертификат|(?:^|\s)час(?:ов|а)?(?:\s|[?.!,]|$)|поступ|запис|старт|расписан|доступ к материал|договор|getcourse|премиум|средний|базовый)/iu;
const STRICT_COMMERCIAL = /(?:тариф|цен|стоим|скидк|промокод|акци|рассроч|кредит|отсроч|возврат|запис|старт|расписан|доступ к материал|договор|getcourse|диплом|удостоверен|сертификат|что входит в (?:курс|программ)|(?:^|\s)час(?:ов|а)? обучения)/iu;
const PRODUCT_CLAUSE = /курс|программ|обучен|инобр|стройэксперт|тариф|цен|стоим|скидк|промокод|акци|рассроч|кредит|оплат|возврат|расписан|дата старт|документ после|диплом|удостоверен|сертификат/iu;
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

function detectedIntent(value: string): ProfessionalWebIntent | null {
  return INTENTS.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

/** Server-side separation: only a standalone professional clause may reach external search. */
export function professionalWebQuery(question: string): string | null {
  const clauses = question.trim().split(/(?:[;!?]\s*|,\s+(?=(?:и|а|но)\s)|\s+(?:и|а)\s+(?=(?:вообще\s+)?(?:как|почему|какими|какой|какая|какие|что|чем)))/iu)
    .map(part => part.replace(/^(?:и|а|но|вообще)\s+/iu, "").trim()).filter(Boolean);
  const professional = clauses.filter(clause => detectedIntent(clause.toLowerCase().replace(/ё/g, "е")) && !PRODUCT_CLAUSE.test(clause));
  return professional.length ? professional.join("; ").slice(0, 400) : null;
}

export function classifyProfessionalIntent(question: string): ProfessionalIntentResult {
  const normalized = question.trim().toLowerCase().replace(/ё/g, "е");
  const intent = detectedIntent(normalized);
  const product = PRODUCT.test(normalized);
  const professional = intent !== null;
  const separatedProfessionalQuery = professionalWebQuery(question);
  const mixedProductAndProfessional = Boolean(product && professional && separatedProfessionalQuery &&
    separatedProfessionalQuery.toLowerCase().replace(/ё/g, "е") !== normalized);
  const webForbidden = intent !== "professional_cost_estimation" && STRICT_COMMERCIAL.test(normalized) && !mixedProductAndProfessional;
  return {
    intent,
    professionalWebEligible: professional && !CASE_SPECIFIC.test(normalized) && (!webForbidden || mixedProductAndProfessional),
    webForbidden,
    mixedProductAndProfessional,
    freshnessRequired: intent === "professional_regulations",
    professionalQuery: mixedProductAndProfessional ? separatedProfessionalQuery : professional && !webForbidden ? question.trim() : null,
  };
}
