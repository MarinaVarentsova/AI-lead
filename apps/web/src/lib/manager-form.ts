import { apiFetch } from "./api";

export const MANAGER_CONTEXT_ERROR = "Не удалось подготовить данные консультации. Попробуйте ещё раз.";
export const GETCOURSE_WIDGET_ID = "1658046";
export const GETCOURSE_WIDGET_SCRIPT_ID = "48b6fd45e3d55163674d0d2dd2e6cbdca752a53b";
export const GETCOURSE_WIDGET_SCRIPT = `https://inobr.ru.com/pl/lite/widget/script?id=${GETCOURSE_WIDGET_ID}`;
export const GETCOURSE_COMMENT_FIELD_NAME = "formParams[dealCustomFields][22041910]";

interface ManagerContextResponse { sessionId: string; comment: string }
export interface NativeManagerContacts { name: string; phone: string; email: string }
export interface NativeManagerWidgetCallbacks { onReady(): void; onSuccess(): void; onError(): void }
type AjaxResponse = { responseJSON?: { success?: boolean; data?: { formProcessed?: boolean } } };
type AjaxSettings = { url?: string };
type JQueryTarget = {
  on(name: string, callback: (event: unknown, xhr: AjaxResponse, settings: AjaxSettings) => void): void;
  off(name: string): void;
};
type JQueryBridge = (target: Document) => JQueryTarget;
interface IntlTelInputCountry { iso2?: string }
interface IntlTelInputInstance {
  getNumber(): string;
  getSelectedCountryData(): IntlTelInputCountry;
  isValidNumber(): boolean;
  setCountry(country: string): void;
  setNumber(number: string): void;
}
type IntlTelInputGlobals = { getInstance(input: HTMLInputElement): IntlTelInputInstance | undefined };

const trace = (stage: string, details: Record<string, unknown> = {}) =>
  console.info("MANAGER_FORM_TRACE", { stage, ...details });

const managerContext = async (sessionId: string): Promise<ManagerContextResponse> => {
  const response = await apiFetch(`/api/manager-form/context/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error("MANAGER_CONTEXT_FAILED");
  const value = await response.json() as ManagerContextResponse;
  if (value.sessionId !== sessionId || !value.comment?.trim()) throw new Error("MANAGER_CONTEXT_INVALID");
  return value;
};

export async function confirmNativeManagerSuccess(sessionId: string, submissionId: string,
  contacts: NativeManagerContacts): Promise<void> {
  const response = await apiFetch(`/api/manager-form/success/${encodeURIComponent(sessionId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId, contacts }),
  });
  if (!response.ok) throw new Error("MANAGER_SUCCESS_EVENT_FAILED");
}

const formField = <T extends HTMLInputElement | HTMLTextAreaElement>(form: HTMLFormElement, name: string) =>
  form.elements.namedItem(name) as T | null;

const contactsFrom = (form: HTMLFormElement): NativeManagerContacts => ({
  email: formField<HTMLInputElement>(form, "formParams[email]")?.value.trim() ?? "",
  name: formField<HTMLInputElement>(form, "formParams[full_name]")?.value.trim() ?? "",
  phone: formField<HTMLInputElement>(form, "formParams[phone]")?.value.trim() ?? "",
});

export function isManagerPhoneValid(country: string, e164: string, nativeValid: boolean): boolean {
  if (!nativeValid) return false;
  return country.toLowerCase() === "ru" ? /^\+7\d{10}$/.test(e164) : /^\+[1-9]\d{6,14}$/.test(e164);
}

function attachNativePhoneValidation(form: HTMLFormElement): () => void {
  const input = form.querySelector<HTMLInputElement>("input.iti__tel-input");
  if (!input) return () => {};
  let instance: IntlTelInputInstance | undefined;
  let readyTimer: ReturnType<typeof setInterval> | undefined;

  const validate = () => {
    if (!instance) return false;
    const country = instance.getSelectedCountryData().iso2 ?? "";
    const valid = isManagerPhoneValid(country, instance.getNumber(), instance.isValidNumber());
    input.setCustomValidity(valid ? "" : "Введите корректный номер телефона");
    return valid;
  };
  const onInput = () => { input.setCustomValidity(""); };
  const onCountryChange = () => { input.setCustomValidity(""); validate(); };
  const onSubmit = (event: Event) => {
    if (validate()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.reportValidity();
    input.focus();
  };
  const initialize = () => {
    const globals = (window as unknown as { intlTelInputGlobals?: IntlTelInputGlobals }).intlTelInputGlobals;
    instance = globals?.getInstance(input);
    if (!instance) return;
    if (readyTimer) clearInterval(readyTimer);
    instance.setCountry("ru");
    if (!instance.getNumber().replace(/\D/g, "")) instance.setNumber("+7");
    input.addEventListener("input", onInput);
    input.addEventListener("countrychange", onCountryChange);
    form.addEventListener("submit", onSubmit, true);
    validate();
  };
  initialize();
  if (!instance) readyTimer = setInterval(initialize, 100);
  return () => {
    if (readyTimer) clearInterval(readyTimer);
    input.removeEventListener("input", onInput);
    input.removeEventListener("countrychange", onCountryChange);
    form.removeEventListener("submit", onSubmit, true);
  };
}

const validComment = (comment: string, sessionId: string) => [
  "Рекомендованная программа:", "Рекомендация Артёма:", "Диагностика:", "Краткое резюме:",
  "Диалог:", "Версия базы знаний:", sessionId,
].every(marker => comment.includes(marker)) && /(?:Пользователь|Артём):\s*\S/.test(comment);

export async function mountNativeGetCourseWidget(container: HTMLElement, sessionId: string,
  callbacks: NativeManagerWidgetCallbacks): Promise<() => void> {
  const context = await managerContext(sessionId);
  trace("manager_context_loaded", { sessionId, commentLength: context.comment.length,
    containsTranscript: /(?:Пользователь|Артём):\s*\S/.test(context.comment) });
  if (!validComment(context.comment, sessionId)) throw new Error("MANAGER_CONTEXT_INCOMPLETE");

  let disposed = false;
  let form: HTMLFormElement | null = null;
  let submissionId = "";
  let contacts: NativeManagerContacts | null = null;
  let successHandled = false;
  let jquery: JQueryTarget | null = null;
  let jqueryTimer: ReturnType<typeof setInterval> | undefined;
  let detachPhoneValidation = () => {};

  const confirmedSuccess = async () => {
    if (disposed || successHandled || !submissionId || !contacts) return;
    successHandled = true;
    trace("manager_native_submit_success", { sessionId, submissionId });
    try {
      await confirmNativeManagerSuccess(sessionId, submissionId, contacts);
      callbacks.onSuccess();
    } catch {
      successHandled = false;
      trace("manager_native_submit_error", { sessionId, stage: "manager_success_callback" });
      callbacks.onError();
    }
  };

  const injectContext = (candidate: HTMLFormElement) => {
    if (form === candidate) return;
    let target: URL;
    try { target = new URL(candidate.action); } catch { return; }
    if (target.hostname !== "inobr.ru.com" || !target.pathname.includes("/pl/lite/block-public/process")) return;
    const commentField = formField<HTMLInputElement | HTMLTextAreaElement>(candidate, GETCOURSE_COMMENT_FIELD_NAME);
    if (!commentField) return;
    commentField.value = context.comment;
    commentField.dispatchEvent(new Event("input", { bubbles: true }));
    commentField.dispatchEvent(new Event("change", { bubbles: true }));
    form = candidate;
    detachPhoneValidation();
    detachPhoneValidation = attachNativePhoneValidation(candidate);
    candidate.addEventListener("submit", event => {
      const currentComment = formField<HTMLInputElement | HTMLTextAreaElement>(candidate, GETCOURSE_COMMENT_FIELD_NAME);
      if (!currentComment || currentComment.value !== context.comment || !validComment(currentComment.value, sessionId)) {
        event.preventDefault(); event.stopImmediatePropagation(); callbacks.onError(); return;
      }
      contacts = contactsFrom(candidate);
      submissionId ||= crypto.randomUUID();
      trace("manager_native_submit_started", { sessionId, submissionId,
        commentLength: currentComment.value.length, containsTranscript: true,
        consent11904802Present: Boolean(formField(candidate, "formParams[dealCustomFields][11904802]")),
        consent11904803Present: Boolean(formField(candidate, "formParams[dealCustomFields][11904803]")),
        phonePresent: Boolean(formField(candidate, "formParams[phone]")) });
    }, true);
    trace("manager_context_injected", { sessionId, commentLength: context.comment.length,
      containsTranscript: true, field22041910Present: true });
    callbacks.onReady();
  };

  const observer = new MutationObserver(() => {
    const candidate = container.querySelector<HTMLFormElement>('form[action*="/pl/lite/block-public/process"]');
    if (candidate) injectContext(candidate);
    if (form && submissionId && (!form.isConnected || form.hidden || getComputedStyle(form).display === "none") &&
      /Спасибо[^.]{0,80}(?:форма|заявк)[^.]{0,40}(?:отправ|принят)/i.test(container.textContent ?? "")) {
      void confirmedSuccess();
    }
  });
  observer.observe(container, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "style", "hidden"] });

  const bindJQuery = () => {
    const bridge = (window as unknown as { jQuery?: JQueryBridge }).jQuery;
    if (!bridge || jquery) return;
    jquery = bridge(document);
    jquery.on("ajaxSuccess.artemManagerForm", (_event, xhr, settings) => {
      if (settings.url?.includes("/pl/lite/block-public/process") && xhr.responseJSON?.data?.formProcessed === true) {
        void confirmedSuccess();
      }
    });
    jquery.on("ajaxError.artemManagerForm", (_event, _xhr, settings) => {
      if (settings.url?.includes("/pl/lite/block-public/process") && submissionId) {
        trace("manager_native_submit_error", { sessionId, stage: "getcourse_ajax" }); callbacks.onError();
      }
    });
  };
  jqueryTimer = setInterval(bindJQuery, 100);
  bindJQuery();

  container.replaceChildren();
  const script = document.createElement("script");
  script.id = GETCOURSE_WIDGET_SCRIPT_ID;
  script.src = `${GETCOURSE_WIDGET_SCRIPT}&rand=${encodeURIComponent(sessionId)}-${Date.now()}`;
  script.addEventListener("load", () => {
    trace("manager_widget_loaded", { sessionId, widgetId: GETCOURSE_WIDGET_ID });
    const candidate = container.querySelector<HTMLFormElement>('form[action*="/pl/lite/block-public/process"]');
    if (candidate) injectContext(candidate);
  });
  script.addEventListener("error", () => {
    trace("manager_native_submit_error", { sessionId, stage: "widget_load" }); callbacks.onError();
  });
  container.appendChild(script);

  return () => {
    disposed = true; observer.disconnect();
    if (jqueryTimer) clearInterval(jqueryTimer);
    detachPhoneValidation();
    jquery?.off(".artemManagerForm");
    container.replaceChildren();
  };
}
