import { explicitProgram, type ArtemProgram, type DiagnosticFactsPacket } from "@workspace/domain/diagnostic";
import type { ConsultantExchange } from "./consultant-funnel";
import { knowledgeSections } from "./artem-knowledge";
import { isConsultantChoiceQuestion } from "@workspace/domain/consultant";

export const PROGRAM_NAMES: Record<ArtemProgram, string> = {
  construction_expertise: "Стройэксперт", apartment_acceptance: "Приёмка квартир",
  house_acceptance: "Приёмка ИЖС", house_control: "Строительный контроль ИЖС", house_unspecified: "ИЖС",
  acceptance_choice: "Приёмка квартир и Приёмка ИЖС",
};
export const BENEFITS: Record<ArtemProgram, string> = {
  construction_expertise: "На программе можно учиться исследовать дефекты, работать с технической документацией и готовить экспертное заключение.",
  apartment_acceptance: "Обучение посвящено осмотру квартиры, выявлению и фиксации дефектов и оформлению результатов проверки.",
  house_acceptance: "Обучение посвящено разовым проверкам готового дома, оценке качества работ и фиксации недостатков.",
  house_control: "Можно осваивать сопровождение стройки по этапам, контроль подрядчиков, фиксацию дефектов и ведение документации.",
  house_unspecified: "Разовые проверки готовых домов и сопровождение стройки по этапам — разные задачи и программы.",
  acceptance_choice: "«Приёмка квартир» — более простой первый этап, а «Приёмка ИЖС» посвящена более сложной проверке частного дома.",
};
const MANAGER_CTA = "Для более подробной информации лучше обратиться к менеджеру. Я могу помочь с этим — воспользуйтесь кнопкой «Связаться с менеджером».";

/** Turns confirmed diagnostic facts into role-specific value without inferring unconfirmed skills. */
export function personalizedBenefit(facts: DiagnosticFactsPacket, program: ArtemProgram): string {
  const { currentArea, currentRole } = facts.answerCodes;
  if (program === "construction_expertise" &&
    (currentArea === "design_estimates" || currentRole === "engineer_designer_estimator")) {
    return "С учётом опыта в проектировании программа особенно полезна для работы с проектной и технической документацией, исследования дефектов и подготовки экспертных заключений.";
  }
  if (program === "construction_expertise" && currentArea === "construction_control") {
    return "Для задач строительного контроля программа помогает перейти от фиксации качества к исследованию причин дефектов и подготовке экспертных выводов и заключений.";
  }
  return BENEFITS[program];
}

function professionalBenefit(program: ArtemProgram, context: string): string | null {
  if (program !== "construction_expertise") return null;
  if (/currentArea=design_estimates|currentRole=engineer_designer_estimator/.test(context)) {
    return "Для проектировщика программа расширяет работу с проектной и технической документацией: помогает исследовать дефекты и готовить экспертные заключения.";
  }
  if (/currentArea=construction_control/.test(context)) {
    return "Для специалиста строительного контроля программа расширяет задачи от фиксации качества до исследования причин дефектов и подготовки экспертных выводов и заключений.";
  }
  if (/currentRole=manager_owner/.test(context)) {
    return "Для руководителя программа помогает разбирать причины дефектов и использовать экспертные выводы при контроле качества работ, не предполагая наличие у компании неподтверждённой клиентской базы.";
  }
  if (/currentRole=valuer_lawyer_expert/.test(context)) {
    return "Для оценщика или эксперта программа помогает связать исследование дефектов и технической документации с подготовкой экспертных заключений.";
  }
  if (/currentRole=foreman_master_site_specialist/.test(context)) {
    return "Для прораба или специалиста на объекте программа помогает перейти от фиксации дефектов к исследованию их причин и подготовке экспертных выводов.";
  }
  return null;
}
export function diagnosticProgram(facts: DiagnosticFactsPacket): ArtemProgram {
  if (facts.recommendedTrackHint === "construction_expertise") return "construction_expertise";
  if (facts.recommendedTrackHint === "apartment_acceptance") return "apartment_acceptance";
  return "acceptance_choice";
}
export function currentProgram(initial: ArtemProgram, question: string, history: ConsultantExchange[]): ArtemProgram {
  let selected = initial;
  for (const turn of [...history.filter(row => row.role === "user"), { message: question }]) {
    selected = explicitProgram(turn.message) ?? selected;
  }
  return selected;
}
export function contactRefused(question: string, history: ConsultantExchange[]): boolean {
  let refused = false;
  for (const row of [...history.filter(row => row.role === "user"), { message: question }]) {
    if (/не (?:хочу|буду|нужно|надо)[^.!?]*(?:контакт|телефон|звон|менеджер)|без звон|не звоните|сам напишу|закончим/i.test(row.message)) refused = true;
    else if (/хочу записаться|готов.*оставить|свяжите.*менеджер|как связаться/i.test(row.message)) refused = false;
  }
  return refused;
}

/** Prices and tariff composition are extracted only from the approved commercial tables. */
export function commercialText(markdown: string, program: ArtemProgram, question = ""): string {
  const commercial = knowledgeSections(markdown).get(12) ?? "";
  const title = PROGRAM_NAMES[program] ?? PROGRAM_NAMES.construction_expertise;
  if (program === "house_unspecified" || program === "acceptance_choice") return "Сначала нужно уточнить, речь о приёмке квартиры или проверке частного дома: это разные программы.";
  const block = commercial.split("### " + title + "\n")[1]?.split("\n### ")[0] ?? "";
  const rows = block.split("\n").filter(line => line.startsWith("|") && /₽/.test(line)).map(line =>
    line.split("|").slice(1, -1).map(cell => cell.trim())).filter(row => Boolean(row[0] && row[1]));
  let selected = rows;
  const tariff = [...question.matchAll(/премиум\s*\+\s*ижс|премиум|средн[а-я]*|базов[а-я]*|профи|vip/gi)].at(-1)?.[0]?.toLowerCase();
  if (tariff) {
    const match = rows.filter(row => row[0]!.toLowerCase().startsWith(tariff.slice(0, 5)));
    if (match.length) selected = match.slice(0, 1);
  }
  if (/9\s*330/.test(question) && program === "construction_expertise") selected = rows.filter(row => row[0] === "Премиум");
  if (!rows.length) {
    const amounts = block.match(/\d[\d ]* ₽/g) ?? [];
    return `Стоимость программы «${title}» — ${amounts.join(", ")}.`;
  }
  return `Стоимость программы «${title}»: ` + selected.map(row => `${row[0]} — ${row[1]}`).join("; ") + ".";
}

export function fallbackReply(markdown: string, program: ArtemProgram, question: string,
  history: ConsultantExchange[], diagnosticContext: string): string {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const name = PROGRAM_NAMES[program];
  const userHistory = history.filter(row => row.role === "user").map(row => row.message).join(" ");
  const tariffContext = userHistory + " " + question;
  const refused = contactRefused(question, history);
  const paymentIntent = /рассроч|оплат(?:а|ить|ить частями|ы|е|ой|у)?|частями|график.*плат|платить.*месяц|ежемесяч|перв.*взнос|разбить.*плат|беспроцент|банковск.*услов/.test(q);
  const priceIntent = /сколько стоит|стоимость|какая цена|какие цены|цен[аыуеой]|тариф/.test(q);
  const enrollmentIntent = /как (?:записаться|поступить|попасть|начать|оформить)|куда записываться|что делать дальше/.test(q) &&
    /обуч|курс|программ|запис|поступ|оформ/.test(q);
  if (priceIntent && enrollmentIntent) return commercialText(markdown, program, tariffContext) +
    " Для записи и оформления обучения лучше обратиться к менеджеру. Я могу помочь с этим — воспользуйтесь кнопкой «Связаться с менеджером».";
  if (enrollmentIntent) return "Для записи и оформления обучения лучше обратиться к менеджеру. Я могу помочь с этим — воспользуйтесь кнопкой «Связаться с менеджером».";
  if (/документ/.test(q) && /когда.*(?:можно )?начать|точн.*старт/.test(q)) return "После успешного завершения «Стройэксперта» выдаётся диплом о профессиональной переподготовке; сведения о нём вносятся в ФИС ФРДО. " + MANAGER_CTA;
  if (paymentIntent) {
    const price = priceIntent ? commercialText(markdown, program, tariffContext) + " " : "";
    return price + "Условия оплаты и рассрочки лучше уточнить у менеджера. Я могу помочь с этим — воспользуйтесь кнопкой «Связаться с менеджером».";
  }
  if (/как со мной свяж|как связаться.*менеджер|свяжется менеджер/.test(q)) return "Для обращения используйте кнопку «Связаться с менеджером» в интерфейсе.";
  if (/телефон.*не хочу|не хочу.*телефон|не звоните|просто отвечайте/.test(q) && !/цен|стоит|документ/.test(q)) return "Хорошо, продолжим здесь.";
  if (/индивидуальн.*цен|специальн.*цен|конкурент.*дешев/.test(q)) return "Индивидуальная цена в моей базе не подтверждена. " +
    commercialText(markdown, program, tariffContext) + " " + MANAGER_CTA;
  if (/скидк|промокод|акци|бесплатн.*(?:программ|курс)|втор[ауя].*программ.*бесплат/.test(q)) return "В моей базе нет подтверждённой информации об актуальных акциях, скидках или промокодах. " + MANAGER_CTA;
  if (/возврат|верн.*(?:сумм|деньг)|передумаю|услови.*договор/.test(q)) return "Условия возврата и договора в базе не описаны, поэтому полный возврат подтвердить не могу. " + MANAGER_CTA;
  if (/срок.*доступ|доступ.*материал|навсегда|бессроч/.test(q)) return "Срок доступа к материалам в базе не зафиксирован, поэтому бессрочный доступ подтвердить не могу. " + MANAGER_CTA;
  if (/можно.*начать.*(?:сегодня|завтра|сейчас)|начать.*обуч.*сейчас/.test(q)) {
    const studentCondition = /currently_studying/.test(diagnosticContext)
      ? " Выпускные документы по профессиональной переподготовке выдаются после предъявления оконченного диплома СПО или высшего образования."
      : "";
    return "Начать обучение можно: оно проходит дистанционно, без ожидания общего набора группы, в индивидуальном графике." + studentCondition;
  }
  if (/ближайш.*(?:старт|поток)|точн.*дат.*старт|расписан|дедлайн/.test(q)) return "Точная дата ближайшего старта в базе не зафиксирована. " + MANAGER_CTA;
  if (/(?:^|\s)сро(?:\s|[?.!,]|$)|нострой|ноприз|специальн.*допуск/.test(q)) return MANAGER_CTA;
  if (/(?:гарант|обещ).*?(?:работ|доход|заказ|трудоустр)|гаранти[юя] работ/.test(q) || /заказ|клиент|трудоустр/.test(q)) {
    const managerCondition = /currentRole=manager_owner/.test(diagnosticContext)
      ? " Если у компании уже есть заказчики, подрядчики или партнёры, можно начать с предложения им ограниченного круга экспертных задач."
      : "";
    return "Институт не гарантирует трудоустройство, доход или заказы. Первые обращения можно искать через профессиональные контакты, юристов и экспертные организации. Для старта полезно выбрать ограниченный круг задач и развивать практику на основе заданий и обратной связи." + managerCondition;
  }
  if (/подумаю|не сейчас|пока не готов|вернусь позже/.test(q) && !/дорого/.test(q)) {
    if (/дорого|бюджет|цен/.test(userHistory)) return BENEFITS[program] + " " + commercialText(markdown, program, tariffContext);
    if (/заказ|клиент/.test(userHistory)) return "Для первых обращений можно развивать профессиональные контакты и выбрать ограниченный круг задач. Гарантий заказов нет.";
    if (refused) return "Хорошо. Можно вернуться к обсуждению, когда вам будет удобно.";
    return "Конечно. Если появятся вопросы по программе, стоимости или документам — помогу разобраться.";
  }
  if (/посоветова/.test(q)) return BENEFITS[program] + " " + commercialText(markdown, program, tariffContext);
  if (/дорого|стоим|стоит|(?:^|[^а-я])цен|тариф|деньг|9\s*330/.test(q)) {
    const commercial = commercialText(markdown, program, tariffContext);
    return /дорого|конск|деньг|охренел/.test(q) ? commercial + " " + BENEFITS[program] : commercial;
  }
  if (/образован|поступ|аттестат|диплома.*нет|диплом не|экономическ.*диплом/.test(q)) {
    if (/иностран|зарубеж/.test(q + diagnosticContext)) return "По иностранному диплому нужна индивидуальная проверка. Признание документа заранее обещать нельзя; менеджер организует проверку.";
    if (/учусь|студент|получаю.*образован/.test(q + diagnosticContext)) return "Если вы сейчас учитесь в колледже или вузе, обучение можно начать; выпускные документы выдаются после предъявления оконченного диплома СПО или высшего образования.";
    if (/no_higher_or_secondary_vocational|только (?:школ|аттестат)/.test(diagnosticContext + q)) return "Для «Стройэксперта» нужно СПО или высшее образование. Если сейчас у вас только школа, можно рассмотреть «Приёмку квартир» — осмотр и фиксацию дефектов; это не переподготовка строительного эксперта.";
    if (/currently_studying/.test(diagnosticContext) || /диплома.*нет|диплом не/.test(q)) {
      if (!/окончил|получил|есть.*(?:спо|высшее)/.test(q + userHistory)) return "Вы окончили колледж или вуз, просто диплома сейчас нет под рукой, или такого образования нет?";
    }
    if (program === "construction_expertise") return "Для поступления на «Стройэксперт» достаточно СПО или высшего образования любого профиля. Строительный опыт не обязателен. Если образование получено, а документа нет под рукой, порядок подтверждения уточнит менеджер.";
  }
  if (/судеб|суд|заключени/.test(q) && /no_higher_or_secondary_vocational/.test(diagnosticContext)) return "Без оконченного СПО или высшего образования «Стройэксперт» недоступен. Прикладным стартом может быть «Приёмка квартир» — осмотр и фиксация дефектов; она не даёт квалификацию судебного эксперта. После получения СПО или высшего образования можно отдельно рассмотреть «Стройэксперт».";
  if (/конкретн.*суд|требован.*суд|примет.*суд/.test(q)) return MANAGER_CTA;
  if (/судеб|суд|заключени/.test(q)) return "«Стройэксперт» включает подготовку к судебным и досудебным экспертным задачам. Диплом подтверждает квалификацию, а назначение экспертом и соответствие конкретной задаче рассматриваются отдельно. Автоматического назначения или принятия заключения судом обучение не гарантирует.";
  if (/260|520|сколько.*час|сколько.*длит|объем.*программ|длительност/.test(q) && program === "construction_expertise") return "Для «Стройэксперта» подтверждены варианты 260 и 520 академических часов. Ориентир по продолжительности — несколько месяцев; точный календарный срок зависит от программы и тарифа.";
  if (/диплом|документ|сертификат|удостоверен|фрдо/.test(q)) return program === "construction_expertise" ?
    "После успешного завершения «Стройэксперта» выдаётся диплом о профессиональной переподготовке; сведения о нём вносятся в ФИС ФРДО. Сертификаты и удостоверения зависят от тарифа; они не заменяют диплом и не дают самостоятельной новой квалификации." :
    `Точный выдаваемый документ по программе «${name}» нужно уточнить. Документы «Стройэксперта» на неё автоматически не распространяются.`;
  if (/нет опыта|без опыта|нович/.test(q)) return "Строительный опыт для поступления на «Стройэксперт» не обязателен, достаточно СПО или высшего образования. Осваивать новое направление помогают материалы, задания и итоговая работа с проверкой; самостоятельная работа требует практики.";
  if (/что входит|содержан|чему учат|есть (?:ли )?практика|практическ.*(?:задани|работ)|что (?:я )?получу после обуч/.test(q)) {
    if (program === "apartment_acceptance") return "«Приёмка квартир» — прикладное обучение осмотру квартир, выявлению и фиксации строительных недостатков и оформлению результатов проверки. СПО или высшее образование для входа не обязательны.";
    if (program === "house_acceptance") return "«Приёмка ИЖС» — обучение разовым проверкам частных домов: перед покупкой, при приёмке готового дома, для оценки качества строительства и фиксации недостатков.";
    if (program === "house_control") return "«Строительный контроль ИЖС» — обучение сопровождению строительства частного дома по этапам: контролю подрядчиков, проверке работ, выявлению и фиксации дефектов, ведению документации, составлению актов и рекомендаций.";
    if (program === "construction_expertise") return "В программу входят материалы, практические задания, контроль знаний и итоговая работа с проверкой преподавателем. Она охватывает исследование дефектов, работу с технической документацией и подготовку экспертного заключения.";
    return BENEFITS[program];
  }
  const roleBenefit = professionalBenefit(program, diagnosticContext);
  if (roleBenefit && /что даст|что (?:я )?(?:получу|смогу)|как (?:расширить|применить)|польз|зачем|развод|вода|маркетинг|для (?:проектиров|руководител|оценщик|прораб|строительн.*контрол)/.test(q)) return roleBenefit;
  if (/что такое.*строительн.*контрол.*ижс/.test(q)) return "«Строительный контроль ИЖС» — обучение сопровождению строительства частного дома по этапам: контролю подрядчиков, проверке работ, выявлению и фиксации дефектов, ведению документации, составлению актов и рекомендаций.";
  if (/что такое.*приемк.*ижс/.test(q)) return "«Приёмка ИЖС» — обучение разовым проверкам частных домов: перед покупкой, при приёмке готового дома, для оценки качества строительства и фиксации недостатков.";
  if (/что такое.*приемк.*квартир/.test(q)) return "«Приёмка квартир» — прикладное обучение осмотру квартир, выявлению и фиксации строительных недостатков и оформлению результатов проверки. СПО или высшее образование для входа не обязательны.";
  if ((/стройэксперт.*приемк.*квартир|приемк.*квартир.*стройэксперт/.test(q)) && /выбрать|сравн|разниц/.test(q)) return "Для осмотра квартир и фиксации недостатков подходит «Приёмка квартир»; для более широких исследований причин дефектов, стоимости и экспертных заключений — «Стройэксперт».";
  if ((/приемк.*квартир.*приемк.*ижс|приемк.*ижс.*приемк.*квартир/.test(q)) && /выбрать|сравн|разниц/.test(q)) return "«Приёмка квартир» сфокусирована на осмотре квартиры и фиксации недостатков, а «Приёмка ИЖС» — на более сложной разовой проверке частного дома. Если объект ещё не выбран, допустимо рассматривать оба направления.";
  if (/ижс/.test(q) && program === "house_unspecified") return "Вам интереснее разовые проверки готовых домов или сопровождение стройки по этапам?";
  if (isConsultantChoiceQuestion(question)) {
    if (program === "acceptance_choice") return "Оба направления остаются допустимыми: «Приёмка квартир» посвящена осмотру квартиры и фиксации дефектов, а «Приёмка ИЖС» — более сложной проверке частного дома. Чтобы выбрать одно, уточните, с каким объектом хотите работать в первую очередь — квартирой или частным домом?";
    const benefit = professionalBenefit(program, diagnosticContext) ?? BENEFITS[program];
    return `Лучше выбрать «${name}». ${benefit}`;
  }
  if (explicitProgram(question) || /выбрать|подойдет|подходит|рекоменд|зачем|польз/.test(q)) return `Можно рассмотреть «${name}». ${BENEFITS[program]}`;
  if (/формат|дистанц|очн|приезжать|нет времени/.test(q) && program === "construction_expertise") return "«Стройэксперт» проходит дистанционно на образовательной платформе, без обязательного очного посещения и ожидания общего набора. Можно заниматься в индивидуальном графике.";
  return `По выбранной программе могу подтвердить следующее: ${BENEFITS[program]} Уточните, какой именно аспект обучения хотите разобрать.`;
}
