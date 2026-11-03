import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const source = readFileSync(new URL("apps/web/src/lib/manager-form.ts", root), "utf8");

assert.match(source, /BITRIX_FORM_ID\s*=\s*199/);
assert.match(source, /loader_199\.js/);
assert.doesNotMatch(source, /intlTelInput|setCountry\("ru"\)|setNumber\("\+7"\)|formParams\[phone\]/);
assert.doesNotMatch(source, /11904802|11904803|22041910/);
console.log("PASS: manager phone and consent behavior is delegated to native Bitrix24 form 199 runtime.");
