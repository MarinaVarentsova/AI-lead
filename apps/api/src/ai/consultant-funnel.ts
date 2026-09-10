/** History stays on the server; no contact data or history is sent to the provider. */
export interface ConsultantExchange { role: string; message: string }
const CTA = /(?:если хотите|можете|предлагаю|нажмите|оставьте|обратитесь|свяжитесь|перейдите|следующий шаг)[^.!?]*(?:менеджер|заявк|контакт|форм)/i;
const REFUSAL = /не (?:хочу|буду|нужно|надо)[^.!?]*(?:менеджер|контакт|заявк|телефон|звон)|без (?:менеджера|звонков)|не звоните/i;

export function applyConsultantFunnel(message: string, question: string, history: ConsultantExchange[],
  qualified: boolean, insufficientKnowledge: boolean): string {
  if (insufficientKnowledge) return message;
  // Model-generated calls to action cannot bypass the conversation cadence.
  const answer = message.split(/(?<=[.!?])\s+/).filter(sentence => !CTA.test(sentence)).join(" ").trim();
  const replies = history.filter(row => row.role === "assistant" &&
    !row.message.includes("В базе знаний недостаточно информации"));
  const refused = REFUSAL.test(question) || history.some(row => row.role === "user" && REFUSAL.test(row.message));
  const alreadyInvited = replies.some(row => CTA.test(row.message));
  if (!qualified || refused || alreadyInvited || replies.length !== 1) return answer || message;
  const purpose = /цен|стоим|стоит|рассроч|тариф/i.test(question)
    ? "обсудить подходящий тариф и условия оплаты"
    : "сопоставить программу с Вашими задачами";
  return `${answer || message} Если хотите, можно ${purpose} с менеджером через форму «Связаться с менеджером».`;
}
