import { apiFetch } from "./api";

export const MANAGER_CONTEXT_ERROR = "Не удалось загрузить форму. Попробуйте еще раз.";
export const BITRIX_FORM_ID = 199;
export const BITRIX_FORM_CODE = "9ejcd2";
export const BITRIX_FORM_LOADER = "https://cdn-ru.bitrix24.ru/b6693601/crm/form/loader_199.js";
export const BITRIX_FORM_TELEMETRY_SIGN =
  "v1:199:site.1b7e33de2798ab8d6079d8f04866e6127f5fd0859da02db50f0a0f5aadf0adf9";
export const BITRIX_FORM_READY_TIMEOUT_MS = 8_000;
export const BITRIX_CONSULTATION_DATA_FIELD = "UF_CRM_1793693484";
export const MANAGER_RETURN_URL =
  "https://inobr-expert.ru/?utm_source=artem&utm_medium=assistant&utm_campaign=return_to_site&utm_content=manager_form_submitted";
export const MANAGER_SUCCESS_REDIRECT_DELAY_MS = 2_000;
const MANAGER_SUBMITTED_PREFIX = "artem.managerFormSubmitted.";

export const managerSubmissionKey = (sessionId: string) => `${MANAGER_SUBMITTED_PREFIX}${sessionId}`;
export const managerSubmissionRecorded = (sessionId: string) => {
  try { return window.localStorage.getItem(managerSubmissionKey(sessionId)) === "1"; } catch { return false; }
};
export const markManagerSubmitted = (sessionId: string) => {
  try { window.localStorage.setItem(managerSubmissionKey(sessionId), "1"); } catch { /* redirect still protects history */ }
};
export const leaveArtemAfterManagerSubmit = () => window.location.replace(MANAGER_RETURN_URL);
export const scheduleLeaveAfterManagerSubmit = () =>
  window.setTimeout(leaveArtemAfterManagerSubmit, MANAGER_SUCCESS_REDIRECT_DELAY_MS);

interface ManagerContextResponse {
  sessionId: string;
  comment: string;
  consultationDataTransferEnabled: boolean;
}
export interface NativeManagerContacts { fullName: string; phone: string; email: string }
export interface NativeManagerWidgetCallbacks { onReady(): void; onSuccess(): void; onError(): void }
interface BitrixForm {
  identification?: { id?: number | string };
  fields?: { values?: unknown };
  getValues?(): unknown;
  setProperty(name: string, value: string): void;
  setValues(values: Record<string, string>): void;
}
interface BitrixFormEventDetail { object?: BitrixForm; data?: unknown }

const trace = (stage: string, details: Record<string, unknown> = {}) =>
  console.info("MANAGER_FORM_TRACE", { stage, ...details });

const managerContext = async (sessionId: string): Promise<ManagerContextResponse> => {
  const startedAt = performance.now();
  trace("manager_context_loading", { sessionId, timestamp: new Date().toISOString() });
  const response = await apiFetch(`/api/manager-form/context/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    trace("manager_context_error", { sessionId, httpStatus: response.status,
      durationMs: Math.round(performance.now() - startedAt) });
    throw new Error("MANAGER_CONTEXT_FAILED");
  }
  const value = await response.json() as ManagerContextResponse;
  if (value.sessionId !== sessionId || !value.comment?.trim()) throw new Error("MANAGER_CONTEXT_INVALID");
  trace("manager_context_success", { sessionId, durationMs: Math.round(performance.now() - startedAt),
    bitrixSummaryPresent: true, bitrixSummaryLength: value.comment.length });
  return value;
};

export async function confirmNativeManagerSuccess(sessionId: string, submissionId: string,
  contact: NativeManagerContacts): Promise<void> {
  const response = await apiFetch(`/api/manager-form/success/${encodeURIComponent(sessionId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId, contact }),
  });
  if (!response.ok) throw new Error("MANAGER_SUCCESS_EVENT_FAILED");
}

const utmProperties = (comment: string): Array<[string, string]> => {
  const names = new Map([["UTM source", "UTM_SOURCE"], ["UTM medium", "UTM_MEDIUM"],
    ["UTM campaign", "UTM_CAMPAIGN"], ["UTM content", "UTM_CONTENT"], ["UTM term", "UTM_TERM"]]);
  const result: Array<[string, string]> = [];
  for (const line of comment.split("\n")) {
    const match = /^(UTM source|UTM medium|UTM campaign|UTM content|UTM term):\s*(.+)$/.exec(line.trim());
    if (match) result.push([names.get(match[1])!, match[2]]);
  }
  return result;
};

const contactFromBitrix = (form: BitrixForm | undefined, data: unknown): NativeManagerContacts => {
  const textValue = (input: unknown): string => {
    if (typeof input === "string" || typeof input === "number") return String(input).trim();
    if (Array.isArray(input)) {
      for (const item of input) { const found = textValue(item); if (found) return found; }
      return "";
    }
    if (input && typeof input === "object") {
      const item = input as Record<string, unknown>;
      for (const key of ["value", "VALUE", "values", "VALUES", "items", "ITEMS"]) {
        const found = textValue(item[key]); if (found) return found;
      }
    }
    return "";
  };
  const records = [(() => { try { return form?.getValues?.(); } catch { return undefined; } })(),
    form?.fields?.values, data && typeof data === "object" ? (data as Record<string, unknown>).fields : undefined,
    data].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map(item => item.values && typeof item.values === "object" ? item.values as Record<string, unknown> : item);
  const value = (...names: string[]) => {
    for (const fields of records) for (const name of names) {
      const found = textValue(fields[name]); if (found) return found;
    }
    return "";
  };
  return { fullName: value("name", "fullName", "full_name", "NAME", "FULL_NAME", "CONTACT_NAME", "LEAD_NAME"),
    phone: value("phone", "PHONE", "LEAD_PHONE"), email: value("email", "EMAIL", "LEAD_EMAIL") };
};

export async function mountBitrixManagerForm(container: HTMLElement, sessionId: string,
  callbacks: NativeManagerWidgetCallbacks): Promise<() => void> {
  const context = await managerContext(sessionId);
  const summary = context.comment.trim();
  if (!summary) throw new Error("MANAGER_CONTEXT_INVALID");

  let disposed = false; let ready = false; let successHandled = false; let bitrixForm: BitrixForm | undefined;
  const startedAt = performance.now();
  trace("bitrix_script_loading", { sessionId, formId: BITRIX_FORM_ID,
    bitrixSummaryPresent: true, bitrixSummaryLength: summary.length });

  const finishSuccess = async (detail: BitrixFormEventDetail) => {
    if (disposed || successHandled) return;
    successHandled = true;
    container.style.display = "none";
    try {
      const contact = contactFromBitrix(bitrixForm ?? detail.object, detail.data);
      trace("bitrix_contact_capture", { sessionId, fullNamePresent: Boolean(contact.fullName),
        phonePresent: Boolean(contact.phone), emailPresent: Boolean(contact.email) });
      await confirmNativeManagerSuccess(sessionId, crypto.randomUUID(), contact);
      callbacks.onSuccess();
    } catch {
      successHandled = false;
      container.style.removeProperty("display");
      callbacks.onError();
    }
  };
  const onInit = (event: Event) => {
    const detail = (event as CustomEvent<BitrixFormEventDetail>).detail;
    const form = detail?.object;
    if (!form || Number(form.identification?.id) !== BITRIX_FORM_ID) return;
    bitrixForm = form;
    form.setValues({ phone: "+7" });
    if (context.consultationDataTransferEnabled) {
      form.setProperty(BITRIX_CONSULTATION_DATA_FIELD, summary);
    }
    for (const [name, value] of utmProperties(summary)) form.setProperty(name, value);
    ready = true; clearTimeout(timeout);
    trace("bitrix_form_ready", { sessionId, formId: BITRIX_FORM_ID,
      durationMs: Math.round(performance.now() - startedAt), bitrixSummaryPresent: true,
      bitrixSummaryLength: summary.length,
      consultationDataTransferEnabled: context.consultationDataTransferEnabled,
      consultationDataField: BITRIX_CONSULTATION_DATA_FIELD });
    callbacks.onReady();
  };
  const onSuccess = (event: Event) => {
    const detail = (event as CustomEvent<BitrixFormEventDetail>).detail;
    if (Number(detail?.object?.identification?.id) === BITRIX_FORM_ID) void finishSuccess(detail);
  };
  window.addEventListener("b24:form:init", onInit);
  window.addEventListener("b24:form:send:success", onSuccess);
  const timeout = setTimeout(() => {
    if (!disposed && !ready) {
      trace("manager_form_timeout", { sessionId, provider: "bitrix24", durationMs: BITRIX_FORM_READY_TIMEOUT_MS });
      callbacks.onError();
    }
  }, BITRIX_FORM_READY_TIMEOUT_MS);

  container.replaceChildren();
  const script = document.createElement("script");
  script.async = true;
  script.dataset.b24Form = `inline/${BITRIX_FORM_ID}/${BITRIX_FORM_CODE}`;
  script.dataset.b24FormTelemetrySign = BITRIX_FORM_TELEMETRY_SIGN;
  script.dataset.skipMoving = "true";
  script.src = `${BITRIX_FORM_LOADER}?${Math.floor(Date.now() / 180000)}`;
  script.addEventListener("load", () => trace("bitrix_script_loaded", { sessionId,
    durationMs: Math.round(performance.now() - startedAt) }));
  script.addEventListener("error", () => {
    clearTimeout(timeout);
    trace("bitrix_script_error", { sessionId, durationMs: Math.round(performance.now() - startedAt) });
    callbacks.onError();
  });
  container.appendChild(script);

  return () => {
    disposed = true; clearTimeout(timeout);
    window.removeEventListener("b24:form:init", onInit);
    window.removeEventListener("b24:form:send:success", onSuccess);
    container.style.removeProperty("display");
    container.replaceChildren();
  };
}
