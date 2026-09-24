import type { ManagerLeadContext } from "./manager-lead-context";

export const GETCOURSE_FORM_ID = "ltForm20566";
export const GETCOURSE_BLOCK_ID = "2252008810";
export const GETCOURSE_COMMENT_FIELD = "11904802";
export const GETCOURSE_ENDPOINT = `https://inobr.ru.com/pl/lite/block-public/process-html?id=${GETCOURSE_BLOCK_ID}`;

export interface GetCourseManagerFormInput {
  email: string;
  fullName: string;
  phone: string;
  sourceUrl: string;
  referrer: string;
}

export function formatGetCourseManagerComment(context: ManagerLeadContext): string {
  const transcript = context.transcript.map(turn =>
    `${turn.role === "user" ? "Пользователь" : "Артём"}: ${turn.text}`).join("\n");
  return [
    "ИНОБР Ассистент — консультация Артёма",
    "",
    "Рекомендованная программа:", context.recommendedProgram,
    "",
    "Рекомендация Артёма:", context.recommendationText,
    "",
    "Диагностика:",
    `Сфера: ${context.diagnostic.currentArea}`,
    `Роль: ${context.diagnostic.currentRole}`,
    `Образование: ${context.diagnostic.educationStatus}`,
    `Задача: ${context.diagnostic.targetTasks}`,
    "",
    "Краткое резюме:", context.dialogSummary,
    "",
    "Диалог:", transcript || "Дополнительных вопросов не было.",
    "",
    "Session ID:", context.sessionId,
    "",
    "Версия базы знаний:", context.knowledgeBaseVersion,
  ].join("\n");
}

function signedFields(html: string): { requestTime: string; requestSimpleSign: string } {
  const requestTime = /window\.requestTime\s*=\s*(\d+)/.exec(html)?.[1];
  const requestSimpleSign = /window\.requestSimpleSign\s*=\s*["']([a-f0-9]+)["']/i.exec(html)?.[1];
  if (!requestTime || !requestSimpleSign) throw new Error("GETCOURSE_SIGNATURE_UNAVAILABLE");
  return { requestTime, requestSimpleSign };
}

export async function submitGetCourseManagerForm(input: GetCourseManagerFormInput, comment: string,
  fetcher: typeof fetch = fetch): Promise<void> {
  const signatureResponse = await fetcher(GETCOURSE_ENDPOINT, { method: "GET", redirect: "follow" });
  if (!signatureResponse.ok) throw new Error("GETCOURSE_SIGNATURE_FAILED");
  const signature = signedFields(await signatureResponse.text());
  const body = new URLSearchParams({
    "formParams[email]": input.email,
    "formParams[full_name]": input.fullName,
    "formParams[phone]": input.phone,
    [`formParams[dealCustomFields][${GETCOURSE_COMMENT_FIELD}]`]: comment,
    "formParams[setted_offer_id]": "",
    "__gc__internal__form__helper": input.sourceUrl,
    "__gc__internal__form__helper_ref": input.referrer,
    requestTime: signature.requestTime,
    requestSimpleSign: signature.requestSimpleSign,
    isHtmlWidget: "1",
  });
  const response = await fetcher(GETCOURSE_ENDPOINT, { method: "POST", redirect: "follow",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body });
  const responseText = await response.text();
  if (!response.ok || /Не заполнено поле|Произошла ошибка|error-summary|has-error/i.test(responseText)) {
    throw new Error("GETCOURSE_SUBMIT_FAILED");
  }
}
