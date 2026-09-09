// Node 22.15+; uses existing TypeScript for in-memory loading, no new test runner.
// Run: node tests/unit/diagnose-route.check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks, createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const fixture = JSON.parse(readFileSync(new URL("diagnose-route.fixtures.json", import.meta.url), "utf8"));
const apiRequire = createRequire(new URL("apps/api/package.json", root));
// Deliberately resolve through the API workspace link: do not hide broken wiring.
assert.ok(apiRequire.resolve("@workspace/domain/diagnostic").endsWith("index.ts"));

let state;
let schema;
let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Network disabled for diagnostic checks"); };
const envNames = ["AI_PROVIDER", "YANDEX_AI_BASE_URL", "YANDEX_AI_API_KEY", "YANDEX_AI_MODEL"];
const savedEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
process.env.AI_PROVIDER = "yandex";
process.env.YANDEX_AI_BASE_URL = "https://ai.api.cloud.yandex.net/v1";
delete process.env.YANDEX_AI_API_KEY;
delete process.env.YANDEX_AI_MODEL;

const db = {
  insert(table) {
    assert.equal(table, schema.aiContacts);
    return { values(value) {
      state.writes.push(value);
      return { async returning() {
        if (state.error) throw state.error;
        return state.empty ? [] : [{ contactId: "22222222-2222-4222-8222-222222222222", conversationId: value.conversationId }];
      } };
    } };
  },
};
globalThis.__diagnoseCheckDB = db;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@workspace/db") return { url: "diagnose-check:db", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        const candidate = new URL(url.href + suffix);
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "diagnose-check:db") {
      return { format: "module", shortCircuit: true, source:
        `export const db = globalThis.__diagnoseCheckDB;
         export { aiContacts } from ${JSON.stringify(new URL("packages/db/src/schema/ai-sessions.ts", root).href)};` };
    }
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      return { format: "module", shortCircuit: true, source: ts.transpileModule(
        readFileSync(new URL(url), "utf8"), {
          fileName: fileURLToPath(url),
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        },
      ).outputText };
    }
    return nextLoad(url, context);
  },
});


try {
  schema = await import(new URL("packages/db/src/schema/ai-sessions.ts", root));
  const { default: router } = await import(new URL("apps/api/src/routes/contacts.ts", root));
  const handler = router.stack.find(layer => layer.route?.path === "/contacts").route.stack[0].handle;
  const receipt = { contactId: "22222222-2222-4222-8222-222222222222", conversationId: fixture.conversationId };
  const payload = { conversationId: fixture.conversationId, contactChannel: "telegram", telegram: "@local_test" };
  async function run(body, status, error, empty = false) {
    state = { writes: [], error, empty };
    const logs = [];
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ body, log: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) } }, res);
    assert.equal(res.statusCode, status);
    assert.ok(!JSON.stringify(logs).includes("@local_test"));
    assert.ok(!JSON.stringify(logs).includes("PRIVATE_SQL"));
    if (status === 201) assert.deepEqual(res.body, receipt);
    return res;
  }
  await run(payload, 201);
  assert.equal(state.writes[0].telegram, payload.telegram);
  assert.equal(state.writes[0].contactChannel, "telegram");
  assert.equal(state.writes[0].phone, null);
  for (const [contactChannel, field, value] of [["email", "email", "local@example.test"], ["call", "phone", "+79999999999"]]) {
    await run({ conversationId: fixture.conversationId, contactChannel, [field]: value }, 201);
    assert.equal(state.writes[0][field], value);
    assert.equal(state.writes[0].contactChannel, contactChannel);
  }
  await run(payload, 404, { cause: { code: "23503", message: "PRIVATE_SQL" } });
  await run(payload, 500, { message: "PRIVATE_SQL", cause: { code: "42703" } });
  await run(payload, 500, undefined, true);
  for (const body of [null, {}, { ...payload, conversationId: "bad" }, { ...payload, telegram: " " }, { ...payload, contactChannel: "unknown" }]) {
    await run(body, 400); assert.deepEqual(state.writes, []);
  }
  // Load the actual frontend contact helper with only Vite env substituted.
  const toModule = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString("base64");
  const api = toModule(readFileSync(new URL("apps/web/src/lib/api.ts", root), "utf8").replace("import.meta.env.VITE_API_BASE_URL", '""'));
  const { submitContact } = await import(toModule(readFileSync(new URL("apps/web/src/lib/contact.ts", root), "utf8").replace('"./api"', JSON.stringify(api))));
  let phase = "details";
  const accepted = () => { phase = "submitted"; };
  for (const makeResponse of [
    () => new Response("", { status: 500 }),
    () => Response.json(receipt, { status: 200 }),
    () => Response.json({}, { status: 201 }),
    () => { throw new TypeError("Failed to fetch"); },
  ]) {
    globalThis.fetch = async () => makeResponse();
    await assert.rejects(submitContact(payload, accepted));
    assert.equal(phase, "details");
    assert.equal(payload.telegram, "@local_test");
  }
  globalThis.fetch = async (url) => { assert.equal(url, "/api/contacts"); return Response.json(receipt, { status: 201 }); };
  await submitContact(payload, accepted);
  assert.equal(phase, "submitted");
  console.log("PASS: 11 backend contact cases and 5 frontend acknowledgement/retry cases; no real DB or network calls.");
} finally {
  hooks.deregister(); globalThis.fetch = originalFetch; delete globalThis.__diagnoseCheckDB;
  for (const key of envNames) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
}
