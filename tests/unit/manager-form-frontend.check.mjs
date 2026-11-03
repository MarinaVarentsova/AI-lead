import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const widget = readFileSync(new URL("apps/web/src/components/chat-widget.tsx", root), "utf8").replace(/\s+/g, " ");
const helper = readFileSync(new URL("apps/web/src/lib/manager-form.ts", root), "utf8").replace(/\s+/g, " ");
const route = readFileSync(new URL("apps/api/src/routes/manager-form.ts", root), "utf8").replace(/\s+/g, " ");
const css = readFileSync(new URL("apps/web/src/index.css", root), "utf8");

assert.match(widget, /role="dialog"[\s\S]*aria-modal="true"/);
assert.match(widget, /mountBitrixManagerForm\(\s*managerWidgetRef\.current,\s*conversationId/);
assert.match(widget, /data-testid="bitrix-manager-form"/);
assert.doesNotMatch(widget, /mountNativeGetCourseWidget|native-getcourse-widget/);
assert.doesNotMatch(widget, /await managerClickRecording\.current/);

assert.match(helper, /BITRIX_FORM_ID\s*=\s*199/);
assert.match(helper, /inline\/\$\{BITRIX_FORM_ID\}\/\$\{BITRIX_FORM_CODE\}/);
assert.match(helper, /loader_199\.js/);
assert.match(helper, /b24:form:init/);
assert.match(helper, /Number\(form\.identification\?\.id\)\s*!==\s*BITRIX_FORM_ID/);
assert.match(helper, /setProperty\("artem_consultation_summary",\s*summary\)/);
assert.match(helper, /manager_context_loading[\s\S]*await apiFetch[\s\S]*bitrix_script_loading/);
assert.match(helper, /bitrixSummaryPresent:\s*true[\s\S]*bitrixSummaryLength:\s*summary\.length/);
assert.match(helper, /b24:form:send:success/);
assert.match(helper, /confirmNativeManagerSuccess/);
assert.match(helper, /bitrix_script_error[\s\S]*callbacks\.onError\(\)/);
assert.match(helper, /manager_form_timeout[\s\S]*callbacks\.onError\(\)/);
assert.match(helper, /UTM_SOURCE/); assert.match(helper, /UTM_MEDIUM/); assert.match(helper, /UTM_CAMPAIGN/);
assert.doesNotMatch(helper, /GetCourse|1658046|22041910|widget-submit|intlTelInput/);

assert.match(route, /manager-form\/success\/:sessionId/);
assert.match(route, /recordEventOnce\(sessionId, "manager_form_submit"[\s\S]*sendTelegramManagerLead/);
assert.doesNotMatch(route, /!contacts\.name\s*\|\|\s*!contacts\.phone\s*\|\|\s*!contacts\.email/);
assert.match(widget, /setContactPhase\("submitted"\)/);
assert.match(widget, /setManagerContextError\(false\)/);
assert.match(widget, /managerContextError[\s\S]*Повторить/);
assert.match(css, /\.manager-form-overlay[\s\S]*overflow-y:\s*auto/);

console.log("PASS A-O: context-first Bitrix24 form 199, summary/UTM injection, success-only persistence, Telegram and controlled retry/error wiring.");
