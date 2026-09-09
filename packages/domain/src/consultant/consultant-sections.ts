import type { ConsultantSection } from "./consultant-types";

export const UNKNOWN_KNOWLEDGE = "В базе знаний недостаточно информации для точного ответа. Этот вопрос лучше уточнить у менеджера.";

/** Only the final local document is accepted; behaviour/CRM instructions are not retrieved. */
export function createConsultantSections(markdown: string): readonly ConsultantSection[] {
  if (!markdown.includes("# ЕДИНАЯ ИНСТРУКЦИЯ АРТЁМА ЭКСПЕРТОВИЧА")) throw new Error("Final consultant knowledge source required");
  const blocks = new Map<string, string>();
  let current = "";
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^# (\d+)\. /.exec(line);
    if (heading) { current = heading[1]!; blocks.set(current, ""); }
    else if (current && line !== "---") blocks.set(current, blocks.get(current)! + line + "\n");
  }
  const read = (...ids: string[]) => ids.map(id => {
    const text = blocks.get(id)?.trim();
    if (!text) throw new Error(`Missing final knowledge section ${id}`);
    return text;
  }).join("\n\n");
  const part = (id: string, heading: string) => {
    const text = read(id).split(`## ${heading}\n`)[1]?.split(/\n## /)[0]?.trim();
    if (!text) throw new Error(`Missing final knowledge subsection ${id}/${heading}`);
    return text;
  };
  const section = (id: string, title: string, keywords: string[], sources: string[], content = read(...sources)): ConsultantSection =>
    Object.freeze({ id, title, keywords: Object.freeze(keywords), sources: Object.freeze(sources), content });
  return Object.freeze([
    section("stroyexpert", "Стройэксперт", ["стройэксперт", "сстэ"], ["2"], part("2", "Что это") + "\n\n" + part("2", "Кто может учиться")),
    section("admission", "Требования к поступлению", ["поступ", "образован", "спо", "высш", "аттестат"], ["2"], part("2", "Кто может учиться")),
    section("non_profile", "Непрофильное образование", ["непрофиль", "экономическ", "экономист", "педагог", "гуманитар", "медицин"], ["2"], part("2", "Кто может учиться")),
    section("experience", "Опыт и отсутствие опыта", ["опыт", "стаж", "нович", "с нуля"], ["3", "2"], part("2", "Кто может учиться") + "\n\n" + read("3")),
    section("construction_expertise", "Строительная экспертиза", ["строительн экспертиз", "эксперт", "дефект"], ["4"]),
    section("judicial", "Судебная экспертиза", ["судебн", "суд", "заключен"], ["6"], part("6", "Можно ли работать с судебными экспертизами")),
    section("legal_limits", "Правовые ограничения", ["юридическ", "право", "сро", "нострой", "ноприз", "нок", "минстрой"], ["6", "7", "8"], part("6", "Суд обязан принять диплом?") + "\n\n" + read("7", "8")),
    section("school_restriction", "Без СПО/ВО: ограничение поступления", ["аттестат", "только школ", "без спо"], ["2"], part("2", "Если нет СПО или ВО")),
    section("apartment_acceptance", "Приёмка квартир", ["квартир", "застройщик"], ["17"]),
    section("house_acceptance", "Приёмка ИЖС", ["приемк ижс", "проверять частн дом", "дом перед покупк", "готовые дом", "разов проверк"], ["19"]),
    section("house_control", "Строительный контроль ИЖС", ["строительн контрол ижс", "стройконтрол", "вести стройк", "по этап", "сопровожден строительств", "надзор"], ["20"]),
    section("prices", "Стоимость Стройэксперта и рассрочка", ["цен", "сколько стоит", "стоимост", "тариф", "рассроч", "оплат"], ["16"]),
    section("documents", "Документы Стройэксперта", ["диплом", "документ", "сертификат", "удостоверен", "фрдо"], ["15"]),
    section("employment", "Трудоустройство", ["трудоустр", "работа", "найти работ"], ["11", "9"]),
    section("income", "Доход и ограничения гарантий", ["доход", "заработ", "окуп"], ["10", "59"], "Нельзя обещать заработок, трудоустройство или заказы.\n\n" + part("10", "«А если я начинаю совсем с нуля?»")),
    section("orders", "Заказы и поиск клиентов", ["заказ", "клиент", "на себя"], ["10"]),
    section("guarantees", "Ограничения гарантий", ["гарант", "заказ", "клиент"], ["10", "11"], part("10", "«А если я начинаю совсем с нуля?»") + "\n\n" + read("11")),
    section("start", "Старт и формат обучения", ["старт", "начать", "срок", "групп", "дистанц", "учиться"], ["12", "13", "14"]),
    section("objections", "Цена и возражения", ["дорого", "скидк", "акци", "сомнева"], ["38", "45"]),
    section("manager", "Индивидуальное уточнение", [], ["26"], UNKNOWN_KNOWLEDGE),
    section("comparison", "Сравнение направлений", ["чем отлич", "сравн", "разниц"], ["18", "22", "23", "24"]),
    section("faq", "Недостаточно информации", [], ["26"], UNKNOWN_KNOWLEDGE),
  ]);
}
