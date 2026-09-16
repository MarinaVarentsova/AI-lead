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
export function diagnosticProgram(facts: DiagnosticFactsPacket): ArtemProgram {
  if (facts.answerCodes.educationStatus === "no_higher_or_secondary_vocational") return "apartment_acceptance";
  if (facts.answerCodes.targetTasks === "apartment_house_acceptance") return "acceptance_choice";
  return "construction_expertise";
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
  const commercial = knowledgeSections(markdown).get(12)!;
  const title = PROGRAM_NAMES[program];
  if (program === "house_unspecified" || program === "acceptance_choice") return "Сначала нужно уточнить, речь о приёмке квартиры или проверке частного дома: это разные программы.";
  const block = commercial.split("### " + title + "\n")[1]?.split("\n### ")[0] ?? "";
  const rows = block.split("\n").filter(line => line.startsWith("|") && /₽/.test(line)).map(line =>
    line.split("|").slice(1, -1).map(cell => cell.trim()));
  let selected = rows;
  const tariff = [...question.matchAll(/премиум\s*\+\s*ижс|премиум|средн[а-я]*|базов[а-я]*|профи|vip/gi)].at(-1)?.[0]?.toLowerCase();
  if (tariff) {
    const match = rows.filter(row => row[0]!.toLowerCase().startsWith(tariff.slice(0, 5)));
    if (match.length) selected = match.slice(0, 1);
  }
  if (/9\s*330/.test(question) && program === "construction_expertise") selected = rows.filter(row => row[0] === "Премиум");
  if (!rows.length) {
    const amounts = block.match(/\d[\d ]* ₽/g) ?? [];
    return `«${title}»: полная стоимость обучения — ${amounts.join(", ")}. Условия рассрочки требуют уточнения.`;
  }
  return `«${title}»: ` + selected.map(row => {
    const payment = row[2]?.includes("×") ? `; оплата — ${row[2]}` : "";
    return `${row[0]} — полная стоимость ${row[1]}${payment}`;
  }).join("; ") + "." +
    (program === "apartment_acceptance" ? " Условия рассрочки нужно уточнить." : "") +
    (/9\s*330/.test(question) ? " 9 330 ₽ — один из шести платежей, а не цена всего курса." : "");
}

export function fallbackReply(markdown: string, program: ArtemProgram, question: string,
  history: ConsultantExchange[], education: string): string {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const name = PROGRAM_NAMES[program];
  const userHistory = history.filter(row => row.role === "user").map(row => row.message).join(" ");
  const tariffContext = userHistory + " " + question;
  const refused = contactRefused(question, history);
  if (/телефон.*не хочу|не хочу.*телефон|не звоните|просто отвечайте/.test(q) && !/цен|стоит|документ/.test(q)) return "Хорошо, продолжим здесь.";
  if (/скидк|акци/.test(q)) return "Размер и наличие скидки нужно подтвердить. Действующие предложения может проверить менеджер.";
  if (/гарант.*(?:работ|доход|заказ|трудоустр)/.test(q) || /заказ|клиент|трудоустр/.test(q)) {
    return "Институт не гарантирует трудоустройство, доход или заказы. Первые обращения можно искать через профессиональные контакты, юристов и экспертные организации. Для старта полезно выбрать ограниченный круг задач и развивать практику на основе заданий и обратной связи.";
  }
  if (/подумаю|не сейчас/.test(q) && !/дорого/.test(q)) {
    if (/дорого|бюджет|цен/.test(userHistory)) return BENEFITS[program] + " " + commercialText(markdown, program, tariffContext);
    if (/заказ|клиент/.test(userHistory)) return "Для первых обращений можно развивать профессиональные контакты и выбрать ограниченный круг задач. Гарантий заказов нет.";
    if (refused || history.some(row => row.role === "assistant" && /Что пока осталось|вопрос сроков/.test(row.message))) return "Хорошо. Можно вернуться к обсуждению, когда вам будет удобно.";
    return /не сейчас/.test(q) ? "Это больше вопрос сроков или пока не определились с самим направлением?" :
      "Что пока осталось неясным — стоимость или как обучение пригодится вам в работе?";
  }
  if (/посоветова/.test(q)) return BENEFITS[program] + " " + commercialText(markdown, program, tariffContext);
  if (/дорого|стоим|стоит|(?:^|[^а-я])цен|рассроч|9\s*330/.test(q)) {
    return (/дорого/.test(q) ? BENEFITS[program] + " " : "") + commercialText(markdown, program, tariffContext);
  }
  if (/образован|поступ|аттестат|диплома.*нет|диплом не|экономическ.*диплом/.test(q)) {
    if (/иностран|зарубеж/.test(q + education)) return "По иностранному диплому нужна индивидуальная проверка. Признание документа заранее обещать нельзя; менеджер организует проверку.";
    if (/учусь|студент|получаю.*образован/.test(q + education)) return "Если вы сейчас учитесь в колледже или вузе, вариант с переподготовкой можно проверить отдельно. Менеджер уточнит порядок зачисления и выдачи диплома.";
    if (/no_higher_or_secondary_vocational|только (?:школ|аттестат)/.test(education + q)) return "Для «Стройэксперта» нужно СПО или высшее образование. Если сейчас у вас только школа, можно рассмотреть «Приёмку квартир» — осмотр и фиксацию дефектов; это не переподготовка строительного эксперта.";
    if (/currently_studying/.test(education) || /диплома.*нет|диплом не/.test(q)) {
      if (!/окончил|получил|есть.*(?:спо|высшее)/.test(q + userHistory)) return "Вы окончили колледж или вуз, просто диплома сейчас нет под рукой, или такого образования нет?";
    }
    if (program === "construction_expertise") return "Для поступления на «Стройэксперт» достаточно СПО или высшего образования любого профиля. Строительный опыт не обязателен. Если образование получено, а документа нет под рукой, порядок подтверждения уточнит менеджер.";
  }
  if (/судеб|суд|заключени/.test(q)) return "«Стройэксперт» включает подготовку к судебным и досудебным экспертным задачам. Диплом подтверждает квалификацию, а назначение экспертом и соответствие конкретной задаче рассматриваются отдельно. Автоматического назначения или принятия заключения судом обучение не гарантирует.";
  if (/260|520/.test(q) && program === "construction_expertise") {
    const commercial = commercialText(markdown, program, tariffContext);
    return "Базовый «Стройэксперт» — 260 академических часов, Средний — 520. Академические часы не равны календарным дням. " + commercial;
  }
  if (/диплом|документ|сертификат|удостоверен|фрдо/.test(q)) return program === "construction_expertise" ?
    "После успешного завершения «Стройэксперта» выдаётся диплом о профессиональной переподготовке; сведения о нём вносятся в ФИС ФРДО. Дополнительные документы зависят от тарифа; они не заменяют диплом и не дают отдельной квалификации." :
    `Точный выдаваемый документ по программе «${name}» нужно уточнить. Документы «Стройэксперта» на неё автоматически не распространяются.`;
  if (/нет опыта|без опыта|нович/.test(q)) return "Строительный опыт для поступления на «Стройэксперт» не обязателен, достаточно СПО или высшего образования. Осваивать новое направление помогают материалы, задания и итоговая работа с проверкой; самостоятельная работа требует практики.";
  if (/ижс/.test(q) && program === "house_unspecified") return "Вам интереснее разовые проверки готовых домов или сопровождение стройки по этапам?";
  if (explicitProgram(question) || isConsultantChoiceQuestion(question) || /выбрать|подойдет|подходит|рекоменд|зачем|польз/.test(q)) return `Можно рассмотреть «${name}». ${BENEFITS[program]}`;
  if (/начал|формат|дистанц|срок|нет времени/.test(q) && program === "construction_expertise") return "«Стройэксперт» проходит дистанционно, в индивидуальном графике. Есть задания, контроль знаний и итоговая работа. Точную продолжительность и нагрузку по тарифу нужно уточнить.";
  return "Этот конкретный параметр требует проверки. Могу объяснить подтверждённые условия выбранной программы; индивидуальные условия уточняет менеджер.";
}
