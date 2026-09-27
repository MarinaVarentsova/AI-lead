import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const apiModule = "data:text/javascript;base64," + Buffer.from(`
  export async function apiFetch(path, init) { return globalThis.__utmFetch(path, init); }
`).toString("base64");
const source = readFileSync(new URL("apps/web/src/lib/session-attribution.ts", root), "utf8")
  .replace('"./api"', JSON.stringify(apiModule));
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { firstTouchAttributionUrl, createAttributedSession } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const initial = "https://artem.inobr-expert.ru/?utm_source=yandex&utm_medium=cpc&utm_campaign=stroiexpert&utm_content=hero&utm_term=expert&gclid=g-first&yclid=y-first";
assert.equal(firstTouchAttributionUrl(initial, storage), initial);
assert.equal(firstTouchAttributionUrl("https://artem.inobr-expert.ru/", storage), initial);
assert.equal(firstTouchAttributionUrl("https://artem.inobr-expert.ru/?utm_source=other", storage), initial);

const directStorage = { getItem: () => null, setItem: () => assert.fail("direct visit must not create attribution") };
assert.equal(firstTouchAttributionUrl("https://artem.inobr-expert.ru/", directStorage), "https://artem.inobr-expert.ru/");

globalThis.window = { location: { href: "https://artem.inobr-expert.ru/" }, sessionStorage: storage };
let payload;
globalThis.__utmFetch = async (path, init) => {
  assert.equal(path, "/api/sessions"); payload = JSON.parse(init.body);
  return Response.json({ sessionId: "11111111-1111-4111-8111-111111111111", sessionKey: "server-key" }, { status: 201 });
};
const created = await createAttributedSession();
assert.equal(created.sessionId, "11111111-1111-4111-8111-111111111111");
assert.equal(payload.firstPageUrl, initial);
delete globalThis.window; delete globalThis.__utmFetch;

console.log("PASS A-H: first-touch UTM/gclid/yclid capture, refresh retention, direct entry and attributed session payload.");
