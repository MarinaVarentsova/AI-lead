import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const apiModule = "data:text/javascript;base64," + Buffer.from(`
  export async function apiFetch() { throw new Error("not used"); }
`).toString("base64");
const source = readFileSync(new URL("apps/web/src/lib/manager-form.ts", root), "utf8")
  .replace('"./api"', JSON.stringify(apiModule));
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { isManagerPhoneValid } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

// A-B: the runtime initializes the official intlTelInput instance with RU and does not build its own mask.
assert.match(source, /intlTelInputGlobals/);
assert.match(source, /instance\.setCountry\("ru"\)/);
assert.match(source, /instance\.setNumber\("\+7"\)/);
assert.doesNotMatch(source, /replace[^\n]+value|input\.value\s*=/);

// C-E: RU accepts exactly ten national digits after the fixed +7 prefix.
assert.equal(isManagerPhoneValid("ru", "+79807317327", true), true);
assert.equal(isManagerPhoneValid("ru", "+7980731732", true), false);
assert.equal(isManagerPhoneValid("ru", "+798073173277", true), false);
assert.equal(isManagerPhoneValid("ru", "+79807317327", false), false);

// F: another selected country delegates validity to intlTelInput and uses that country's E.164 number.
assert.equal(isManagerPhoneValid("by", "+375291234567", true), true);
assert.equal(isManagerPhoneValid("kz", "+77011234567", true), true);
assert.equal(isManagerPhoneValid("by", "+375291234567", false), false);
assert.match(source, /getSelectedCountryData\(\)\.iso2/);
assert.match(source, /addEventListener\("countrychange"/);

// G-H: invalid submit is stopped; a valid native result leaves submission untouched.
assert.match(source, /if \(validate\(\)\) return;[\s\S]*event\.preventDefault\(\)/);
assert.match(source, /setCustomValidity\(valid \? "" : "Введите корректный номер телефона"\)/);
assert.match(source, /instance\.isValidNumber\(\)/);

console.log("PASS A-H: RU +7 default, exact 10-digit validation, country-aware intlTelInput and submit blocking.");
