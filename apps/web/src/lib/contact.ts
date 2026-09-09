import { apiFetch } from "./api";

export interface ContactPayload {
  conversationId: string;
  contactChannel: string;
  phone?: string;
  telegram?: string;
  email?: string;
}

export const CONTACT_ERROR = "Не удалось отправить заявку. Попробуйте ещё раз.";

/** Confirmation is allowed only after 201 and a valid persisted-contact receipt. */
export async function submitContact(payload: ContactPayload, onAccepted: () => void): Promise<void> {
  const response = await apiFetch("/api/contacts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (response.status !== 201) throw new Error(CONTACT_ERROR);
  const receipt: unknown = await response.json();
  if (!receipt || typeof receipt !== "object" ||
    !("contactId" in receipt) || typeof receipt.contactId !== "string" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt.contactId) ||
    !("conversationId" in receipt) || receipt.conversationId !== payload.conversationId) {
    throw new Error(CONTACT_ERROR);
  }
  onAccepted();
}
