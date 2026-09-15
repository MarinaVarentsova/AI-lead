import { contactRefused } from "./artem-policy";
export interface ConsultantExchange { role: string; message: string }
const CTA = /(?:если хотите|можете|предлагаю|нажмите|оставьте|обратитесь|свяжитесь|перейдите|следующий шаг)[^.!?]*(?:менеджер|заявк|контакт|форм)/i;
export function applyConsultantFunnel(message: string, question: string, history: ConsultantExchange[],
  _qualified: boolean, _insufficientKnowledge: boolean): string {
  const refused = contactRefused(question, history);
  const previous = history.filter(row => row.role === "assistant").at(-1)?.message ?? "";
  const alreadyInvited = CTA.test(previous);
  // A model invitation is allowed once, for a concrete purpose; never after refusal.
  let seen = false;
  return message.split(/(?<=[.!?])\s+/).filter(sentence => {
    if (!CTA.test(sentence)) return true;
    if (refused || alreadyInvited || seen) return false;
    seen = true; return true;
  }).join(" ").trim() || "Хорошо, продолжим здесь.";
}
