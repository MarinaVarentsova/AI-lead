import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
let widget = readFileSync(
  new URL("apps/web/src/components/chat-widget.tsx", root),
  "utf8",
);
let helper = readFileSync(
  new URL("apps/web/src/lib/manager-form.ts", root),
  "utf8",
);
let css = readFileSync(new URL("apps/web/src/index.css", root), "utf8");
let route = readFileSync(
  new URL("apps/api/src/routes/manager-form.ts", root),
  "utf8",
);
let service = readFileSync(
  new URL("apps/api/src/services/getcourse-manager-form.ts", root),
  "utf8",
);
const normalized = (value) => value.replace(/\s+/g, " ");
widget = normalized(widget); helper = normalized(helper); route = normalized(route);
service = normalized(service); css = normalized(css);

assert.match(widget, /role="dialog"[\s\S]*aria-modal="true"/);
assert.match(
  widget,
  /mountNativeGetCourseWidget\(\s*managerWidgetRef\.current,\s*conversationId/,
);
assert.match(widget, /data-testid="native-getcourse-widget"/);
assert.match(helper, /pl\/lite\/widget\/script\?id=\$\{GETCOURSE_WIDGET_ID\}/);
assert.match(helper, /GETCOURSE_WIDGET_ID = "1658046"/);
assert.match(
  helper,
  /GETCOURSE_WIDGET_SCRIPT_ID\s*=\s*"48b6fd45e3d55163674d0d2dd2e6cbdca752a53b"/,
);
assert.match(
  helper,
  /MANAGER_FORM_ALLOWED_ORIGINS[\s\S]*https:\/\/artem\.inobr-expert\.ru[\s\S]*https:\/\/inobr-assistant\.161\.104\.50\.164\.sslip\.io/,
);
assert.match(
  helper,
  /window\.location\.origin === MANAGER_FORM_ALLOWED_ORIGINS\[1\][\s\S]*mountProxiedGetCourseWidget/,
);
assert.match(
  helper,
  /event\.origin !== expectedMessageOrigin \|\| event\.source !== iframe\.contentWindow/,
);
assert.match(helper, /MANAGER_WIDGET_READY_TIMEOUT_MS = 4_000/);
assert.match(helper, /manager_form_timeout[\s\S]*callbacks\.onError\(\)/);
for (const stage of [
  "manager_context_request_start",
  "manager_context_request_success",
  "manager_context_request_error",
  "getcourse_widget_load_start",
  "getcourse_widget_script_loaded",
  "getcourse_widget_script_error",
  "getcourse_iframe_created",
  "getcourse_iframe_load",
  "getcourse_ready_received",
  "manager_form_timeout",
]) {
  assert.match(helper, new RegExp(stage));
}
assert.match(widget, /manager_modal_open/);
assert.match(widget, /manager_form_ready/);
assert.doesNotMatch(widget, /await managerClickRecording\.current/);
assert.match(helper, /manager-form\/widget\//);
assert.match(helper, /formParams\[dealCustomFields\]\[22041910\]/);
assert.match(helper, /formParams\[dealCustomFields\]\[11904802\]/);
assert.match(helper, /formParams\[dealCustomFields\]\[11904803\]/);
assert.doesNotMatch(helper, /1190480[23][\s\S]{0,80}checked\s*=/);
assert.match(helper, /formParams\[phone\]/);
assert.match(helper, /xhr\.responseJSON\?\.data\?\.formProcessed === true/);
assert.match(helper, /manager-form\/success/);
assert.match(helper, /manager_context_injected/);
assert.match(helper, /manager_native_submit_started/);
assert.match(helper, /manager_native_submit_success/);
assert.match(helper, /manager_native_submit_error/);
assert.doesNotMatch(
  widget,
  /contactEmail|contactPhone|personalDataConsent|marketingConsent/,
);
assert.match(
  widget,
  /setContactPhase\(null\)[\s\S]*window\.location\.href\s*=\s*"https:\/\/inobr-expert\.ru\/\?utm_source=artem&utm_medium=assistant&utm_campaign=return_to_site&utm_content=manager_modal_close"/,
);
assert.match(widget, /event\.key === "Escape"[\s\S]*closeManagerForm/);
assert.match(
  widget,
  /event\.target === event\.currentTarget[\s\S]*closeManagerForm/,
);
assert.doesNotMatch(widget, /CONTACT_CHANNELS|submitContact/);
assert.match(widget, /setContactPhase\("submitted"\)/);
assert.match(route, /manager-form\/success\/:sessionId/);
assert.match(
  service,
  /MANAGER_FORM_ALLOWED_ORIGINS[\s\S]*artem\.inobr-expert\.ru[\s\S]*inobr-assistant\.161\.104\.50\.164\.sslip\.io/,
);
assert.match(route, /if \(!parentOrigin\) \{ res\.status\(403\)/);
assert.match(
  route,
  /recordEventOnce\(sessionId, "manager_form_submit"[\s\S]*if \(recorded\.created\) await sendTelegramManagerLead/,
);
assert.match(route, /manager_success_event_received/);
assert.match(route, /manager_form_submit_written/);
assert.match(css, /\.manager-form-overlay[\s\S]*overflow-y:\s*auto/);
assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.manager-form-modal/);
console.log(
  "PASS G-L: modal fields/context, X/Escape/backdrop exit redirect, error retention, success-only event and responsive layout wiring.",
);
