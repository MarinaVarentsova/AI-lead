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
  let stage = "request";
  let httpStatus: number | null = null;
  let errorCode = "CONTACT_TRANSPORT_FAILED";
  // Never log the payload, URL, raw exception or response body (may contain PII).
  console.info("CONTACT_CLIENT_STAGE", { stage, errorCode: null, httpStatus });
  try {
    const response = await apiFetch("/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    stage = "response";
    httpStatus = response.status;
    errorCode = "CONTACT_HTTP_ERROR";
    if (response.status !== 201) throw new Error(CONTACT_ERROR);
    errorCode = "CONTACT_RECEIPT_INVALID";
    const receipt: unknown = await response.json();
    if (!receipt || typeof receipt !== "object" ||
      !("contactId" in receipt) || typeof receipt.contactId !== "string" ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt.contactId) ||
      !("conversationId" in receipt) || receipt.conversationId !== payload.conversationId) {
      throw new Error(CONTACT_ERROR);
    }
    console.info("CONTACT_CLIENT_STAGE", { stage, errorCode: null, httpStatus });
  } catch {
    console.error("CONTACT_CLIENT_FAILED", { stage, errorCode, httpStatus });
    throw new Error(CONTACT_ERROR);
  }
  onAccepted();
}
